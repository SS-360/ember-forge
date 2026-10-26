import { mkdir, readFile, readdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SkillContractSchema, SkillDefinitionSchema } from "@emberforge/contracts";
import { SanitizedTraceSchema, TraceSetSchema, type SanitizedTrace } from "@emberforge/contracts/traces";
import { buildDevelopmentSuite } from "@emberforge/compiler/development-suite";
import { captureReplayCases } from "@emberforge/compiler/trace-fixtures";
import { buildProtocolSplit, assertSplitSeparation, type ProtocolSplit } from "@emberforge/evaluator/protocol";
import { canonicalHash, compileFromTraces, TraceCompilationError, type TraceLineage } from "@emberforge/compiler/trace-compiler";
import type { VerificationReport } from "@emberforge/compiler";
import { exportVerifiedCandidate } from "../../../scripts/export-skill.js";
import { registerSynthesisRoutes, type SynthesisDependencies } from "./synthesis.js";
import { replayTraceSnapshot, SourceSnapshotSchema } from "@emberforge/compiler/trace-replay";

export const SkillIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/).refine(
  (value) => !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value), "Use a portable skill name."
);

export async function candidateDirectory(projectRoot: string, skillId: string): Promise<string> {
  SkillIdSchema.parse(skillId);
  for (const directory of [path.join(projectRoot, "artifacts", "candidates", skillId), path.join(projectRoot, "skills", skillId)]) {
    try { await access(path.join(directory, "skill.json")); return directory; }
    catch { /* Try the next local candidate store. */ }
  }
  throw new TraceCompilationError("SKILL_NOT_FOUND", "No local candidate exists with this ID.");
}

export async function readCandidate(projectRoot: string, skillId: string) {
  const directory = await candidateDirectory(projectRoot, skillId);
  const [skillInput, contractInput, verification, lineage] = await Promise.all([
    readFile(path.join(directory, "skill.json"), "utf8").then(JSON.parse),
    readFile(path.join(directory, "contract.json"), "utf8").then(JSON.parse),
    readFile(path.join(directory, "verification.json"), "utf8").then((text) => JSON.parse(text) as VerificationReport),
    readFile(path.join(directory, "lineage.json"), "utf8").then((text) => JSON.parse(text) as TraceLineage).catch(() => undefined)
  ]);
  const harnessChecks: Array<{ harness: "codex"; discovery: "verified"; invocation: "unverified"; execution: "unverified"; candidateHash: string }> = [];
  if (/^[a-f0-9]{64}$/.test(verification.candidateHash)) {
    try {
      const check = z.object({ harness: z.literal("codex"), discovery: z.literal("verified"), invocation: z.literal("unverified"), execution: z.literal("unverified"), candidateHash: z.string() }).parse(
        JSON.parse(await readFile(path.join(projectRoot, "artifacts", "compatibility", verification.candidateHash, "codex.json"), "utf8"))
      );
      if (check.candidateHash === verification.candidateHash) harnessChecks.push(check);
    } catch { /* Unrecorded or malformed host checks remain unverified. */ }
  }
  return { skill: SkillDefinitionSchema.parse(skillInput), contract: SkillContractSchema.parse(contractInput), verification, harnessChecks, ...(lineage ? { lineage } : {}) };
}

export async function writeVerificationFiles(directory: string, verification: VerificationReport): Promise<void> {
  await mkdir(path.join(directory, "tests"), { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, "verification.json"), JSON.stringify(verification, null, 2) + "\n", "utf8"),
    writeFile(path.join(directory, "tests", "cases.json"), JSON.stringify({
      suite: "stock-reconciliation development verification", scope: "finite synthetic development fixtures; not held-out evaluation",
      cases: verification.cases.map((item) => ({ caseId: item.caseId, expectedOutcome: item.expectedOutcome, ...(item.expectedReason ? { expectedReason: item.expectedReason } : {}) }))
    }, null, 2) + "\n", "utf8")
  ]);
}

export async function readDevelopmentCases(projectRoot: string, directory: string) {
  try {
    const split = JSON.parse(await readFile(path.join(directory, "development-split.json"), "utf8")) as ProtocolSplit;
    if (split.partition !== "development") throw new Error("Invalid development partition.");
    assertSplitSeparation([split]);
    return split.cases;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    return buildDevelopmentSuite(JSON.parse(await readFile(path.join(projectRoot, "fixtures", "dev", "stock-reconciliation.json"), "utf8")));
  }
}

export async function saveDevelopmentSplit(directory: string, split: ProtocolSplit): Promise<void> {
  const supported = split.cases.find((item) => item.expectedOutcome === "supported");
  if (!supported) throw new Error("A supported example is required.");
  await Promise.all([
    writeFile(path.join(directory, "development-split.json"), JSON.stringify(split, null, 2) + "\n", "utf8"),
    writeFile(path.join(directory, "verification-input.json"), JSON.stringify({ parameters: supported.parameters, dataset: supported.dataset }, null, 2) + "\n", "utf8")
  ]);
}

export function traceSummary(trace: SanitizedTrace) {
  return {
    traceId: trace.traceId, taskFamily: trace.taskFamily, sourceMode: trace.sourceMode,
    evidenceClass: trace.evidenceClass, recordingMethod: trace.recordingMethod,
    recordedAt: trace.recordedAt, outcome: trace.label.outcome, reason: trace.label.reason,
    operationCount: trace.calls.length, hash: canonicalHash(trace), inputHash: trace.inputHash,
    ...(trace.sourceCandidateHash ? { sourceCandidateHash: trace.sourceCandidateHash } : {})
  };
}

export async function registerCompilationRoutes(app: FastifyInstance, projectRoot: string, dependencies: {
  exportCandidate?: (directory: string, options?: { signal?: AbortSignal }) => Promise<unknown>;
  synthesis?: SynthesisDependencies;
} = {}): Promise<void> {
  const traceRoot = path.join(projectRoot, "artifacts", "traces");
  const candidatesRoot = path.join(projectRoot, "artifacts", "candidates");
  const activePath = path.join(projectRoot, "artifacts", "active-candidate.json");
  const snapshotRoot = path.join(projectRoot, "artifacts", "source-snapshots");
  const replayRoot = path.join(projectRoot, "artifacts", "trace-replays");
  const exportCandidate = dependencies.exportCandidate ?? ((directory: string, options?: { signal?: AbortSignal }) => exportVerifiedCandidate({ candidateDirectory: directory, ...(options?.signal ? { signal: options.signal } : {}) }));
  await Promise.all([mkdir(traceRoot, { recursive: true }), mkdir(candidatesRoot, { recursive: true }), mkdir(snapshotRoot, { recursive: true }), mkdir(replayRoot, { recursive: true })]);
  let compiling = false;
  let importing = false;
  const readTrace = async (id: string) => SanitizedTraceSchema.parse(JSON.parse(await readFile(path.join(traceRoot, id + ".json"), "utf8")));
  await registerSynthesisRoutes(app, projectRoot, { readTrace, exportCandidate, ...dependencies.synthesis });

  const saveReplay = async (trace: SanitizedTrace, snapshotInput: unknown) => {
    const seed = await readCandidate(projectRoot, "stock-reconciliation");
    const snapshot = SourceSnapshotSchema.parse(snapshotInput);
    const evidence = replayTraceSnapshot(trace, snapshot, seed.contract);
    const snapshotPath = path.join(snapshotRoot, snapshot.inputHash + ".json");
    try { await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n", { encoding: "utf8", flag: "wx" }); }
    catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
      const stored = SourceSnapshotSchema.parse(JSON.parse(await readFile(snapshotPath, "utf8")));
      if (canonicalHash(stored) !== canonicalHash(snapshot)) throw new TraceCompilationError("SNAPSHOT_CONTENT_CHANGED", "The saved snapshot no longer matches its immutable input record.");
    }
    await writeFile(path.join(replayRoot, evidence.traceHash + ".json"), JSON.stringify(evidence, null, 2) + "\n", "utf8");
    return evidence;
  };
  app.post("/api/traces/:traceId/replay", async (request, reply) => {
    const id = z.string().uuid().safeParse((request.params as { traceId: string }).traceId);
    if (!id.success) return reply.code(400).send({ error: "TRACE_REFERENCE_INVALID", message: "Choose a recorded trace." });
    let trace: SanitizedTrace;
    try { trace = await readTrace(id.data); }
    catch { return reply.code(404).send({ error: "TRACE_NOT_FOUND", message: "Import the sanitized trace before attaching its local snapshot." }); }
    try { return reply.code(201).send(await saveReplay(trace, request.body)); }
    catch (error) {
      if (error instanceof TraceCompilationError) return reply.code(400).send({ error: error.code, message: error.message });
      if (error instanceof z.ZodError) return reply.code(400).send({ error: "SNAPSHOT_INVALID", message: "Supply a strict, hash-matching local source snapshot." });
      throw error;
    }
  });

  app.get("/api/workspace", async () => {
    let skillId = "stock-reconciliation";
    try {
      const active = JSON.parse(await readFile(activePath, "utf8")) as { skillId: unknown };
      skillId = SkillIdSchema.parse(active.skillId);
    } catch { /* Start with the seed when no active generated candidate exists. */ }
    try { return await readCandidate(projectRoot, skillId); }
    catch { return readCandidate(projectRoot, "stock-reconciliation"); }
  });

  app.get("/api/candidates", async () => {
    const names = new Set<string>();
    for (const store of [path.join(projectRoot, "skills"), candidatesRoot]) {
      for (const entry of await readdir(store, { withFileTypes: true })) {
        if (entry.isDirectory() && SkillIdSchema.safeParse(entry.name).success) names.add(entry.name);
      }
    }
    const candidates = await Promise.all([...names].sort().map(async (id) => {
      try {
        const candidate = await readCandidate(projectRoot, id);
        return { id: candidate.skill.id, version: candidate.skill.version, status: candidate.verification.status, origin: candidate.verification.candidateOrigin };
      } catch { return undefined; }
    }));
    return candidates.filter((candidate) => candidate !== undefined);
  });

  app.post("/api/workspace/candidate", async (request, reply) => {
    const parsed = z.object({ skillId: SkillIdSchema }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "CANDIDATE_REFERENCE_INVALID", message: "Choose a valid local candidate." });
    let candidate;
    try { candidate = await readCandidate(projectRoot, parsed.data.skillId); }
    catch { return reply.code(404).send({ error: "SKILL_NOT_FOUND", message: "The selected candidate is unavailable." }); }
    await writeFile(activePath, JSON.stringify({ skillId: parsed.data.skillId }, null, 2) + "\n", "utf8");
    return candidate;
  });

  app.get("/api/traces", async () => {
    const files = (await readdir(traceRoot)).filter((name) => /^[a-f0-9-]{36}\.json$/.test(name));
    const loaded = await Promise.allSettled(files.map((name) => readTrace(name.slice(0, -5))));
    const traces = loaded.flatMap((result, index) => {
      if (result.status === "fulfilled") return [result.value];
      app.log.warn({ file: files[index] }, "An invalid trace artifact was excluded from the evidence list");
      return [];
    });
    return Promise.all(traces.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)).map(async (trace) => {
      let replayVerified = false;
      try {
        const proof = JSON.parse(await readFile(path.join(replayRoot, canonicalHash(trace) + ".json"), "utf8")) as { traceHash?: string; inputHash?: string; status?: string };
        replayVerified = proof.status === "verified" && proof.traceHash === canonicalHash(trace) && proof.inputHash === trace.inputHash;
      } catch { /* An imported label without replay evidence remains an assertion. */ }
      return { ...traceSummary(trace), replayVerified };
    }));
  });

  app.get("/api/traces/replay-examples", async () => {
    const cache = path.join(projectRoot, "artifacts", "replay-trace-examples-v2.json");
    let examples: ReturnType<typeof captureReplayCases> | undefined;
    try { examples = TraceSetSchema.parse(JSON.parse(await readFile(cache, "utf8"))); }
    catch { /* Capture the current seed once, preserving real execution hashes. */ }
    const seed = await readCandidate(projectRoot, "stock-reconciliation");
    const compilationSplit = buildProtocolSplit("compilation", "emberforge-compilation-v2");
    if (!examples) {
      examples = captureReplayCases(seed.skill, seed.contract, compilationSplit.cases);
      await writeFile(cache, JSON.stringify(examples, null, 2) + "\n", "utf8");
    }
    for (const trace of examples.traces) {
      const source = compilationSplit.cases.find((testCase) => canonicalHash({ parameters: testCase.parameters, dataset: testCase.dataset }) === trace.inputHash);
      if (!source) throw new Error("Cached replay examples do not match the compilation split.");
      await saveReplay(trace, { schemaVersion: "emberforge.source-snapshot/1", inputHash: trace.inputHash, parameters: source.parameters, dataset: source.dataset });
    }
    return examples;
  });

  app.post("/api/traces/import", async (request, reply) => {
    const parsed = TraceSetSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "TRACE_IMPORT_INVALID", message: parsed.error.issues[0]?.message ?? "Invalid sanitized trace set." });
    if (importing) return reply.code(409).send({ error: "TRACE_IMPORT_BUSY", message: "Another trace import is being saved. Retry shortly." });
    importing = true;
    try {
      const newTraces: SanitizedTrace[] = [];
      for (const trace of parsed.data.traces) {
        let existing: SanitizedTrace | undefined;
        try { existing = await readTrace(trace.traceId); }
        catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error; }
        if (existing && canonicalHash(existing) !== canonicalHash(trace)) {
          return reply.code(409).send({ error: "TRACE_ID_CONFLICT", message: "An imported trace ID already has different evidence. Use a new ID for a revised recording." });
        }
        if (!existing) newTraces.push(trace);
      }
      for (const trace of newTraces) await writeFile(path.join(traceRoot, trace.traceId + ".json"), JSON.stringify(trace, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
      return reply.code(201).send({ imported: newTraces.length, existing: parsed.data.traces.length - newTraces.length, traces: parsed.data.traces.map(traceSummary) });
    } finally { importing = false; }
  });

  app.post("/api/skills/compile", async (request, reply) => {
    const parsed = z.object({ skillId: SkillIdSchema, traceIds: z.array(z.string().uuid()).min(3).max(32) }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "COMPILE_REQUEST_INVALID", message: parsed.error.issues[0]?.message ?? "Select a name and at least three traces." });
    if (compiling) return reply.code(409).send({ error: "COMPILER_BUSY", message: "One local compilation is already running." });
    compiling = true;
    const controller = new AbortController();
    const abortOnDisconnect = () => { if (!reply.raw.writableEnded) controller.abort(new Error("Compilation cancelled by client disconnect.")); };
    reply.raw.once("close", abortOnDisconnect);
    try {
      const directory = path.join(candidatesRoot, parsed.data.skillId);
      for (const existing of [directory, path.join(projectRoot, "skills", parsed.data.skillId)]) {
        try { await access(existing); return reply.code(409).send({ error: "CANDIDATE_EXISTS", message: "A candidate already uses this name. Choose a new name to preserve its evidence." }); }
        catch { /* A new candidate may be created here. */ }
      }
      const traces: SanitizedTrace[] = [];
      for (const id of parsed.data.traceIds) {
        try { traces.push(await readTrace(id)); }
        catch { return reply.code(404).send({ error: "TRACE_NOT_FOUND", message: "A selected trace is no longer available. Refresh the evidence list." }); }
      }
      const developmentSplit = buildProtocolSplit("development", "emberforge-development-v2");
      const hashes = new Set(traces.map((trace) => trace.inputHash));
      if (developmentSplit.inputHashes.some((hash) => hashes.has(hash))) throw new TraceCompilationError("EVALUATION_INPUT_OVERLAP", "Compilation and development inputs must have different hashes.");
      const result = await compileFromTraces({ traces, skillId: parsed.data.skillId, developmentCases: developmentSplit.cases, signal: controller.signal });
      controller.signal.throwIfAborted();
      await mkdir(directory);
      await Promise.all([
        writeFile(path.join(directory, "skill.json"), JSON.stringify(result.skill, null, 2) + "\n", "utf8"),
        writeFile(path.join(directory, "contract.json"), JSON.stringify(result.contract, null, 2) + "\n", "utf8"),
        writeFile(path.join(directory, "lineage.json"), JSON.stringify(result.lineage, null, 2) + "\n", "utf8"),
        writeVerificationFiles(directory, result.verification),
        saveDevelopmentSplit(directory, developmentSplit)
      ]);
      await writeFile(activePath, JSON.stringify({ skillId: result.skill.id }, null, 2) + "\n", "utf8");
      let packageError: string | undefined;
      if (result.exportable) {
        try { await exportCandidate(directory); }
        catch (error) { app.log.error(error, "Generated candidate package checks failed"); packageError = "The candidate was saved, but package checks failed. Its export is unavailable."; }
      }
      return reply.code(201).send({ ...result, ...(packageError ? { packageError } : {}) });
    } catch (error) {
      if (error instanceof TraceCompilationError) return reply.code(400).send({ error: error.code, message: error.message });
      if (error instanceof z.ZodError) return reply.code(400).send({ error: "CANDIDATE_INVALID", message: error.issues[0]?.message ?? "The trace graph produced an invalid candidate." });
      if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) return reply.code(408).send({ error: "COMPILATION_CANCELLED", message: "Compilation was cancelled or reached its time limit." });
      throw error;
    } finally { compiling = false; reply.raw.removeListener("close", abortOnDisconnect); }
  });
}
