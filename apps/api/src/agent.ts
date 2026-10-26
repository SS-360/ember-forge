import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { importWorkSample } from "../../../packages/compiler/src/sample-import.js";
import { runOriginalAgent, type AgentRun } from "@emberforge/compiler/agent-loop";
import { validatePolicy } from "@emberforge/compiler/synthesis-controller";
import type { SynthesisDependencies } from "./synthesis.js";
import type { SanitizedTrace } from "@emberforge/contracts/traces";
import { canonicalHash } from "@emberforge/compiler/trace-compiler";
import { writeImmutableArtifact } from "../../../scripts/atomic-artifact.js";
import { assertZetarisSnapshotSample } from "./zetaris-snapshots.js";

async function readAgentJobState(directory: string) {
  const checkpoints = (await readdir(directory)).filter((name) => /^checkpoint-\d{8}-[a-f0-9-]{36}\.json$/.test(name)).sort();
  return JSON.parse(await readFile(path.join(directory, checkpoints.at(-1) ?? "state.json"), "utf8"));
}

/** Imported provenance fields alone never establish a genuine provider-origin trace. */
export async function assertOriginalAgentEvidence(projectRoot: string, traces: SanitizedTrace[]) {
  for (const trace of traces) {
    if (trace.agentOrigin?.mode !== "nemotron" || trace.recordingMethod !== "normalized_agent_tools") throw new Error("ORIGINAL_AGENT_TRACES_REQUIRED");
    const receipt = z.object({ jobId: z.string().uuid(), traceHash: z.string() }).parse(JSON.parse(await readFile(path.join(projectRoot, "artifacts", "traces", trace.traceId + ".origin.json"), "utf8")));
    const stored = await readAgentJobState(path.join(projectRoot, "artifacts", "agent-runs", receipt.jobId)) as { run?: AgentRun; sampleId?: string };
    if (trace.sourceMode === "snapshot") {
      const sampleId = z.string().uuid().parse(stored.sampleId);
      const sample = JSON.parse(await readFile(path.join(projectRoot, "artifacts", "work-samples", sampleId + ".json"), "utf8"));
      await assertZetarisSnapshotSample(projectRoot, sample);
      if (sample.inputHash !== trace.inputHash) throw new Error("SNAPSHOT_ORIGIN_MISMATCH");
    }
    const run = stored.run;
    if (receipt.traceHash !== canonicalHash(trace) || !run || run.mode !== "nemotron" || run.runId !== trace.agentOrigin.runId || !run.calls.length || run.calls.some((call) => call.usageUncertain) || !run.traces.some((item) => canonicalHash(item) === receipt.traceHash)) throw new Error("ORIGINAL_AGENT_PROVENANCE_MISMATCH");
  }
}

export async function registerAgentRoutes(app: FastifyInstance, projectRoot: string, dependencies: SynthesisDependencies) {
  const sampleRoot = path.join(projectRoot, "artifacts", "work-samples"), runRoot = path.join(projectRoot, "artifacts", "agent-runs"), traceRoot = path.join(projectRoot, "artifacts", "traces"), snapshotRoot = path.join(projectRoot, "artifacts", "source-snapshots");
  await Promise.all([sampleRoot, runRoot, traceRoot, snapshotRoot].map((directory) => mkdir(directory, { recursive: true })));
  const active = new Map<string, { controller: AbortController; done: Promise<void> }>();
  function available() {
    if (!dependencies.agentAdapter || !dependencies.policy) return false;
    try { validatePolicy(dependencies.policy, dependencies.agentAdapter); return dependencies.agentAdapter.mode === "test_only" || dependencies.ledger?.persistent === true; } catch { return false; }
  }
  app.get("/api/agent/readiness", async () => ({ available: available(), mode: dependencies.agentAdapter?.mode ?? "disabled", message: dependencies.readinessReason ?? "Original agent calls are disabled. Local sample import is available; execution needs separate verification and provider authorization.", sourceAccess: "Local JSON/CSV tables only", reserveEach: 0, eligibleStatus: "open" }));
  app.post("/api/work-samples", async (request, reply) => {
    try {
      const sample = { ...importWorkSample(request.body), sampleId: randomUUID(), importedAt: new Date().toISOString() };
      await writeFile(path.join(sampleRoot, sample.sampleId + ".json"), JSON.stringify(sample, null, 2) + "\n", { flag: "wx" });
      return reply.code(201).send({ sampleId: sample.sampleId, inputHash: sample.inputHash, provenance: sample.provenance, boundary: sample.boundary });
    } catch { return reply.code(400).send({ error: "SAMPLE_INVALID", message: "Supply sanitized local JSON or CSV using the documented strict schemas, at most 5000 rows, and confirm its provenance. No sample was executed." }); }
  });
  app.get("/api/work-samples", async () => {
    const samples = [];
    for (const name of await readdir(sampleRoot)) {
      if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
      try { const sample = JSON.parse(await readFile(path.join(sampleRoot, name), "utf8")); samples.push({ sampleId: sample.sampleId, inputHash: sample.inputHash, provenance: sample.provenance, importedAt: sample.importedAt }); } catch { /* Preserve malformed files without offering them as runnable. */ }
    }
    return samples;
  });
  app.get("/api/agent/runs", async () => {
    const runs = [];
    for (const jobId of await readdir(runRoot)) {
      if (!z.string().uuid().safeParse(jobId).success) continue;
      try {
        const stored = await readAgentJobState(path.join(runRoot, jobId));
        let complete = false, failed = false;
        try { await readFile(path.join(runRoot, jobId, "completion.json")); complete = true; } catch { /* Preserve partial evidence. */ }
        try { await readFile(path.join(runRoot, jobId, "error.json")); failed = true; } catch { /* No error receipt. */ }
        runs.push({ jobId, sampleId: stored.sampleId, state: active.has(jobId) ? "running" : failed ? "failed" : !complete ? "interrupted" : stored.state, startedAt: stored.run?.startedAt ?? null, modelCalls: stored.run?.calls.length ?? 0 });
      } catch { /* Preserve malformed directories without claiming a verified result. */ }
    }
    return runs.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  });
  app.post("/api/agent/runs", async (request, reply) => {
    const parsed = z.object({ sampleId: z.string().uuid() }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "SAMPLE_REFERENCE_INVALID" });
    if (!available()) return reply.code(503).send({ error: "AGENT_DISABLED", message: "Original-agent execution is disabled. A configured key is not authorization to run evaluations or make provider calls." });
    if (active.size) return reply.code(409).send({ error: "AGENT_BUSY" });
    let sample;
    try { const stored = JSON.parse(await readFile(path.join(sampleRoot, parsed.data.sampleId + ".json"), "utf8")); sample = stored.dataset?.sourceMode === "snapshot" ? await assertZetarisSnapshotSample(projectRoot, stored) : importWorkSample({ format: "json", provenance: stored.provenance, parameters: stored.parameters, dataset: stored.dataset }); }
    catch { return reply.code(404).send({ error: "SAMPLE_NOT_FOUND" }); }
    if (active.size) return reply.code(409).send({ error: "AGENT_BUSY" });
    const jobId = randomUUID(), controller = new AbortController();
    const directory = path.join(runRoot, jobId); await mkdir(directory);
    const slot = { controller, done: Promise.resolve() }; active.set(jobId, slot);
    await writeFile(path.join(directory, "state.json"), JSON.stringify({ jobId, state: "running", stage: "observing", sampleId: parsed.data.sampleId }) + "\n");
    slot.done = (async () => {
      let checkpointSequence = 0;
      try {
        const result = await runOriginalAgent({ parameters: sample.parameters, dataset: sample.dataset, evidenceClass: sample.provenance.evidenceClass, adapter: dependencies.agentAdapter!, policy: dependencies.policy!, ...(dependencies.ledger ? { ledger: dependencies.ledger } : {}), signal: controller.signal,
          async checkpoint(run) {
            await writeImmutableArtifact(directory, "checkpoint-" + String(++checkpointSequence).padStart(8, "0") + "-" + randomUUID() + ".json", { jobId, state: run.status, stage: run.events.at(-1)?.state ?? "observing", sampleId: parsed.data.sampleId, run });
          }
        });
        const snapshot = { schemaVersion: "emberforge.source-snapshot/1", inputHash: sample.inputHash, parameters: sample.parameters, dataset: sample.dataset };
        try { await writeFile(path.join(snapshotRoot, sample.inputHash + ".json"), JSON.stringify(snapshot, null, 2) + "\n", { flag: "wx" }); }
        catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error; }
        for (const trace of result.traces) {
          await writeFile(path.join(traceRoot, trace.traceId + ".json"), JSON.stringify(trace, null, 2) + "\n", { flag: "wx" });
          await writeFile(path.join(traceRoot, trace.traceId + ".origin.json"), JSON.stringify({ jobId, traceHash: canonicalHash(trace) }) + "\n", { flag: "wx" });
        }
        if (result.result) await writeFile(path.join(directory, "shortage-report.json"), JSON.stringify({ inputHash: sample.inputHash, provenance: sample.provenance, lines: result.result }, null, 2) + "\n", { flag: "wx" });
        await writeFile(path.join(directory, "completion.json"), JSON.stringify({ traceIds: result.traces.map((trace) => trace.traceId), result: result.status, inputHash: sample.inputHash }) + "\n", { flag: "wx" });
      } catch {
        await writeFile(path.join(directory, "error.json"), JSON.stringify({ error: "AGENT_PERSISTENCE_OR_EXECUTION_FAILED", furtherCallsStarted: false }) + "\n");
      } finally { active.delete(jobId); }
    })();
    return reply.code(202).send({ jobId, state: "running" });
  });
  app.get("/api/agent/runs/:jobId", async (request, reply) => {
    const id = z.string().uuid().safeParse((request.params as { jobId: string }).jobId);
    if (!id.success) return reply.code(400).send({ error: "JOB_REFERENCE_INVALID" });
    try {
      try { await readFile(path.join(runRoot, id.data, "error.json")); return { state: "failed", stage: "refused", message: "Execution or evidence persistence failed; no completed result is claimed." }; } catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error; }
      const state = await readAgentJobState(path.join(runRoot, id.data)) as { state: string; stage: string; run?: AgentRun };
      if (active.has(id.data)) return { ...state, state: "running" };
      try { await readFile(path.join(runRoot, id.data, "completion.json")); }
      catch { return { ...state, state: "interrupted", stage: "refused", message: "The run has no completion receipt. Partial evidence is retained and not resumed." }; }
      if (state.state === "running" && !active.has(id.data)) return { ...state, state: "interrupted", stage: "refused", message: "The owner is no longer active. No request is resumed automatically." };
      return state;
    } catch { return reply.code(404).send({ error: "AGENT_JOB_NOT_FOUND" }); }
  });
  app.post("/api/agent/runs/:jobId/cancel", async (request, reply) => {
    const id = z.string().uuid().safeParse((request.params as { jobId: string }).jobId);
    const slot = id.success ? active.get(id.data) : undefined;
    if (!slot) return reply.code(409).send({ error: "JOB_NOT_RUNNING" });
    slot.controller.abort(); return reply.code(202).send({ cancellationRequested: true });
  });
  app.addHook("onClose", async () => { for (const slot of active.values()) slot.controller.abort(); await Promise.all([...active.values()].map((slot) => slot.done)); });
}
