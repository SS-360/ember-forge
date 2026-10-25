import { randomUUID } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SanitizedTrace } from "@pocketforge/contracts/traces";
import { buildProtocolSplit } from "@pocketforge/evaluator/protocol";
import { synthesizeCandidate, type SynthesisAdapter, type SynthesisCostLedger, type SynthesisPolicy, type SynthesisResult } from "@pocketforge/compiler/synthesis-controller";
import { SkillIdSchema, saveDevelopmentSplit, writeVerificationFiles } from "./compilation.js";
import { ProviderAuthorizationSchema, assertAuthorizationCurrent, providerScopeKey, type ProviderAuthorization } from "@pocketforge/contracts/provider-authorization";
import { SynthesisJobStore, type SynthesisJob } from "./synthesis-job-store.js";
import { canonicalHash } from "@pocketforge/compiler/trace-compiler";

export interface SynthesisDependencies {
  /** Server composition only. No browser request can configure a provider, price or spending permission. */
  adapter?: SynthesisAdapter;
  policy?: SynthesisPolicy;
  ledger?: SynthesisCostLedger;
  authorization?: ProviderAuthorization;
  readinessReason?: string;
  dispose?: () => void;
}
const JobIdSchema = z.string().uuid();

export async function registerSynthesisRoutes(app: FastifyInstance, projectRoot: string, dependencies: SynthesisDependencies & {
  readTrace: (id: string) => Promise<SanitizedTrace>;
  exportCandidate: (directory: string, options?: { signal?: AbortSignal }) => Promise<unknown>;
}): Promise<void> {
  const root = path.join(projectRoot, "artifacts", "synthesis-jobs");
  let store: SynthesisJobStore;
  try { store = new SynthesisJobStore(root); }
  catch {
    app.log.error({ component: "synthesis-job-store" }, "Synthesis persistence is unavailable; existing evidence is preserved.");
    const failure = { error: "SYNTHESIS_STORE_UNAVAILABLE", message: "Job persistence is unavailable. No provider request can start; existing evidence is preserved." };
    app.get("/api/compiler/readiness", async () => ({ assembly: { available: true, method: "deterministic_trace_assembly" }, synthesis: { available: false, mode: "disabled", budgetUsd: 0, message: failure.message } }));
    app.post("/api/compiler/jobs", async (_request, reply) => reply.code(503).send(failure));
    app.get("/api/compiler/jobs/:jobId", async (_request, reply) => reply.code(503).send(failure));
    app.post("/api/compiler/jobs/:jobId/cancel", async (_request, reply) => reply.code(503).send(failure));
    app.addHook("onClose", async () => { dependencies.dispose?.(); });
    return;
  }
  let active: { job: SynthesisJob; controller: AbortController; done: Promise<void> } | undefined;
  const available = () => {
    if (!dependencies.adapter || !dependencies.policy || dependencies.authorization?.mode === "disabled") return false;
    if (dependencies.adapter.mode === "test_only" && !dependencies.authorization) return true; // Explicit offline test composition only.
    try {
      const authorization = ProviderAuthorizationSchema.parse(dependencies.authorization);
      if (authorization.mode === "disabled" || dependencies.ledger?.persistent !== true || !dependencies.adapter.providerScope) return false;
      assertAuthorizationCurrent(authorization);
      return providerScopeKey(authorization.scope) === providerScopeKey(dependencies.adapter.providerScope) &&
        dependencies.policy.authorization !== undefined && canonicalHash(dependencies.policy.authorization) === canonicalHash(authorization) &&
        dependencies.policy.maxCompilationCostUsd <= authorization.maxSessionCostUsd &&
        dependencies.policy.inputUsdPerMillionTokens === authorization.inputUsdPerMillionTokens &&
        dependencies.policy.outputUsdPerMillionTokens === authorization.outputUsdPerMillionTokens;
    } catch { return false; }
  };
  app.get("/api/compiler/readiness", async () => ({
    assembly: { available: true, method: "deterministic_trace_assembly" },
    synthesis: {
      available: available(),
      mode: dependencies.adapter?.mode ?? "disabled",
      authorizationMode: dependencies.authorization?.mode ?? "disabled",
      budgetUsd: dependencies.policy?.maxCompilationCostUsd ?? 0,
      message: dependencies.readinessReason ?? (available() ? (dependencies.adapter?.mode === "test_only" ? "Test-only transport. No live model evidence." : "Server-authorized bounded provider transport.") : "Session budget is $0. Free provider access has not been confirmed; live synthesis is disabled.")
    }
  }));
  app.post("/api/compiler/jobs", async (request, reply) => {
    const parsed = z.object({ skillId: SkillIdSchema, traceIds: z.array(z.string().uuid()).min(3).max(32) }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "COMPILE_REQUEST_INVALID", message: "Choose a new candidate name and at least three labeled traces." });
    if (!available()) return reply.code(503).send({ error: "FREE_ACCESS_UNCONFIRMED", message: "Live synthesis is disabled under the $0 session budget. Deterministic assembly remains available." });
    if (active) return reply.code(409).send({ error: "COMPILER_BUSY", message: "A synthesis job is already running." });
    for (const store of ["skills", path.join("artifacts", "candidates")]) {
      try { await access(path.join(projectRoot, store, parsed.data.skillId)); return reply.code(409).send({ error: "CANDIDATE_EXISTS", message: "Choose a new candidate name to preserve existing evidence." }); }
      catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error; }
    }
    let traces: SanitizedTrace[];
    try { traces = await Promise.all(parsed.data.traceIds.map(dependencies.readTrace)); }
    catch { return reply.code(404).send({ error: "TRACE_NOT_FOUND", message: "A selected trace is unavailable." }); }
    // Recheck after asynchronous IO to serialize job creation.
    if (active) return reply.code(409).send({ error: "COMPILER_BUSY", message: "A synthesis job is already running." });
    const now = new Date().toISOString();
    const job: SynthesisJob = { jobId: randomUUID(), skillId: parsed.data.skillId, createdAt: now, updatedAt: now, state: "running", stage: "queued" };
    if (!store.create(job)) return reply.code(409).send({ error: "COMPILER_BUSY", message: "A synthesis job is already owned by another local API process." });
    const controller = new AbortController();
    const slot = { job, controller, done: Promise.resolve() };
    active = slot;
    slot.done = (async () => {
      const started = performance.now();
      let stageStarted = started;
      let previousStage = "queued";
      job.timings = { stagesMs: {}, totalMs: 0 };
      const recordTiming = (stage: string) => {
        const now = performance.now();
        job.timings!.stagesMs[previousStage] = (job.timings!.stagesMs[previousStage] ?? 0) + Math.max(0, now - stageStarted);
        job.timings!.totalMs = now - started;
        stageStarted = now; previousStage = stage;
      };
      const checkpoint = (stage: string) => {
        recordTiming(stage);
        job.stage = stage;
        if (store.cancellationRequested(job.jobId)) controller.abort(new DOMException("Cancelled by the user.", "AbortError"));
        store.save(job);
        controller.signal.throwIfAborted();
      };
      const cancellationPoll = setInterval(() => {
        try { if (store.cancellationRequested(job.jobId)) controller.abort(new DOMException("Cancelled by the user.", "AbortError")); }
        catch { controller.abort(new DOMException("Job persistence unavailable.", "AbortError")); }
      }, 200);
      cancellationPoll.unref();
      try {
        checkpoint("preparing_development");
        const development = buildProtocolSplit("development", "pocketforge-development-v2");
        const result = await synthesizeCandidate({
          skillId: job.skillId, runId: job.jobId, traces, developmentCases: development.cases,
          adapter: dependencies.adapter!, policy: dependencies.policy!,
          ...(dependencies.ledger ? { ledger: dependencies.ledger } : {}), signal: controller.signal,
          onEvent(event) { Object.assign(job, event); checkpoint(event.stage); }
        });
        job.result = result; job.state = result.state; job.stage = "complete";
        controller.signal.throwIfAborted();
        if (result.candidate && result.state !== "cancelled" && result.state !== "failed" && result.state !== "budget_exhausted") {
          job.state = "running"; checkpoint("saving_candidate");
          const directory = path.join(projectRoot, "artifacts", "candidates", job.skillId);
          await mkdir(directory); // Immutable candidate ID. Never overwrite an existing candidate.
          await Promise.all([
            writeFile(path.join(directory, "skill.json"), JSON.stringify(result.candidate.skill, null, 2) + "\n", "utf8"),
            writeFile(path.join(directory, "contract.json"), JSON.stringify(result.candidate.contract, null, 2) + "\n", "utf8"),
            writeFile(path.join(directory, "lineage.json"), JSON.stringify(result.lineage, null, 2) + "\n", "utf8"),
            writeFile(path.join(directory, "synthesis.json"), JSON.stringify(result, null, 2) + "\n", "utf8"),
            writeVerificationFiles(directory, result.candidate.verification), saveDevelopmentSplit(directory, development)
          ]);
          controller.signal.throwIfAborted();
          if (result.candidate.exportable && result.state === "validated") {
            checkpoint("exporting_package");
            try { await dependencies.exportCandidate(directory, { signal: controller.signal }); }
            catch { job.packageError = "Candidate saved; package checks failed and download remains unavailable."; }
          }
          controller.signal.throwIfAborted();
          await writeFile(path.join(projectRoot, "artifacts", "active-candidate.json"), JSON.stringify({ skillId: job.skillId }) + "\n", "utf8");
          job.state = result.state;
        }
        job.stage = "complete";
      } catch (error) {
        job.state = controller.signal.aborted ? "cancelled" : "failed";
        job.stage = "complete";
        // Provider internals and raw bodies never enter public job evidence.
        job.error = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "SYNTHESIS_FAILED";
      } finally {
        clearInterval(cancellationPoll);
        recordTiming("complete");
        try { store.save(job); } catch (error) { app.log.error(error, "Unable to persist synthesis evidence"); }
        if (active === slot) active = undefined;
      }
    })();
    return reply.code(202).send({ jobId: job.jobId, state: "running" });
  });
  app.get("/api/compiler/jobs/:jobId", async (request, reply) => {
    const parsed = JobIdSchema.safeParse((request.params as { jobId: string }).jobId);
    if (!parsed.success) return reply.code(400).send({ error: "JOB_REFERENCE_INVALID" });
    try {
      const job = store.read(parsed.data);
      if (!job) return reply.code(404).send({ error: "JOB_NOT_FOUND" });
      return { ...job, checkpointCount: store.checkpointCount(parsed.data) };
    } catch { return reply.code(409).send({ error: "SAVED_JOB_INVALID", message: "The saved job is malformed; its evidence was preserved and cannot be resumed." }); }
  });
  app.post("/api/compiler/jobs/:jobId/cancel", async (request, reply) => {
    const parsed = JobIdSchema.safeParse((request.params as { jobId: string }).jobId);
    if (!parsed.success) return reply.code(400).send({ error: "JOB_REFERENCE_INVALID" });
    if (!store.requestCancellation(parsed.data)) return reply.code(409).send({ error: "JOB_NOT_RUNNING", message: "This job is no longer running." });
    if (active?.job.jobId === parsed.data) active.controller.abort(new DOMException("Cancelled by the user.", "AbortError"));
    return reply.code(202).send({ jobId: parsed.data, cancellationRequested: true });
  });
  app.addHook("onClose", async () => {
    const slot = active;
    if (slot) { slot.controller.abort(); await slot.done; }
    store.close(); dependencies.dispose?.();
  });
}
