import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { compileCandidate } from "@pocketforge/compiler";
import { canonicalHash, type TraceLineage } from "@pocketforge/compiler/trace-compiler";
import { buildProtocolSplit, assertSplitSeparation, type ProtocolSplit } from "@pocketforge/evaluator/protocol";
import { reconcileStock } from "@pocketforge/evaluator";
import { StockDatasetSchema, StockParametersSchema } from "@pocketforge/contracts";
import { executeSkill } from "@pocketforge/runtime";
import { candidateDirectory, readCandidate, SkillIdSchema } from "./compilation.js";

export async function registerEvaluationRoutes(app: FastifyInstance, projectRoot: string): Promise<void> {
  const inProgress = new Set<string>();
  const root = path.join(projectRoot, "artifacts", "frozen-evaluations");
  await mkdir(root, { recursive: true });
  app.get("/api/skills/:skillId/frozen-evaluation", async (request, reply) => {
    const id = SkillIdSchema.safeParse((request.params as { skillId: string }).skillId);
    if (!id.success) return reply.code(400).send({ error: "CANDIDATE_REFERENCE_INVALID" });
    const candidate = await readCandidate(projectRoot, id.data);
    const hash = canonicalHash({ skill: candidate.skill, contract: candidate.contract });
    try { return JSON.parse(await readFile(path.join(root, hash, "report.json"), "utf8")); }
    catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      return { status: "not_run", candidateHash: hash };
    }
  });
  app.post("/api/skills/:skillId/frozen-evaluation", async (request, reply) => {
    const id = SkillIdSchema.safeParse((request.params as { skillId: string }).skillId);
    if (!id.success) return reply.code(400).send({ error: "CANDIDATE_REFERENCE_INVALID" });
    const candidate = await readCandidate(projectRoot, id.data);
    const candidateHash = canonicalHash({ skill: candidate.skill, contract: candidate.contract });
    if (inProgress.has(candidateHash)) return reply.code(409).send({ error: "EVALUATION_BUSY", message: "This candidate already has an evaluation in progress." });
    inProgress.add(candidateHash);
    try {
      const store = path.join(root, candidateHash);
      try { return JSON.parse(await readFile(path.join(store, "report.json"), "utf8")); }
      catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error; }
      const directory = await candidateDirectory(projectRoot, id.data);
      let development: ProtocolSplit;
      try { development = JSON.parse(await readFile(path.join(directory, "development-split.json"), "utf8")) as ProtocolSplit; }
      catch { return reply.code(409).send({ error: "DEVELOPMENT_SPLIT_REQUIRED", message: "Compile a new candidate with the independent development protocol before freezing evaluation." }); }
      if (development.partition !== "development" || candidate.verification.status !== "validated" || candidate.verification.candidateHash !== candidateHash) return reply.code(409).send({ error: "DEVELOPMENT_VERIFICATION_REQUIRED", message: "A current passing development report is required." });
      assertSplitSeparation([development]);
      const fresh = compileCandidate(candidate.skill, candidate.contract, development.cases);
      if (!fresh.exportable) return reply.code(409).send({ error: "DEVELOPMENT_VERIFICATION_FAILED", message: "The candidate no longer passes development verification." });
      await mkdir(store, { recursive: true });
      let frozen: ProtocolSplit;
      const splitPath = path.join(store, "frozen-split.json");
      try { frozen = JSON.parse(await readFile(splitPath, "utf8")) as ProtocolSplit; }
      catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
        frozen = buildProtocolSplit("frozen", randomUUID());
        // Freeze before execution. Process restarts reuse this exact split, including after failure.
        await writeFile(splitPath, JSON.stringify(frozen, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
      }
      if (frozen.partition !== "frozen") throw new Error("Invalid frozen partition.");
      assertSplitSeparation([development, frozen]);
      const lineage: TraceLineage | undefined = candidate.lineage;
      if (lineage?.traces.some((trace) => frozen.inputHashes.includes(trace.inputHash) || development.inputHashes.includes(trace.inputHash))) throw new Error("Compilation/evaluation input overlap.");
      const started = performance.now();
      const evaluation = compileCandidate(candidate.skill, candidate.contract, frozen.cases);
      const timingCases = frozen.cases.filter((item) => item.expectedOutcome === "supported" && evaluation.verification.cases.some((result) => result.caseId === item.caseId && result.passed)).slice(0, 5);
      const timings: Array<{ caseId: string; repeat: number; referenceMs: number; compiledMs: number }> = [];
      for (const testCase of timingCases) for (let repeat = 1; repeat <= 3; repeat++) {
        const referenceStart = performance.now();
        reconcileStock(StockParametersSchema.parse(testCase.parameters), StockDatasetSchema.parse(testCase.dataset));
        const referenceMs = performance.now() - referenceStart;
        const compiledStart = performance.now();
        executeSkill(candidate.skill, candidate.contract, testCase.parameters, testCase.dataset);
        timings.push({ caseId: testCase.caseId, repeat, referenceMs, compiledMs: performance.now() - compiledStart });
      }
      const current = await readCandidate(projectRoot, id.data);
      if (canonicalHash({ skill: current.skill, contract: current.contract }) !== candidateHash) throw new Error("Candidate changed during evaluation.");
      const report = {
        schemaVersion: "pocketforge.frozen-evaluation/2", scope: "finite-synthetic-frozen-variants",
        status: evaluation.exportable ? "passed" : "failed", candidateHash, skillId: id.data,
        frozenAt: (await stat(splitPath)).mtime.toISOString(),
        completedAt: new Date().toISOString(), developmentSplitHash: development.splitHash, frozenSplitHash: frozen.splitHash,
        supportedCorrect: evaluation.verification.correctSupportedCount, supportedTotal: evaluation.verification.supportedCaseCount,
        rejectedUnsupported: evaluation.verification.rejectedUnsupportedCount, unsupportedTotal: evaluation.verification.unsupportedCaseCount,
        falseAcceptances: evaluation.verification.falseAcceptanceCount, needlessFallbacks: evaluation.verification.needlessFallbackCount,
        cases: evaluation.verification.cases, modelCalls: 0, timings,
        evaluationAndTimingDurationMs: performance.now() - started,
        compilationOverheadMs: null, baselineStatus: { freshAgent: "unmeasured: live inference unavailable under $0 budget", instructionOnlySkill: "unmeasured", exactAnswerCache: "unmeasured", parameterizedReplay: candidate.verification.candidateOrigin === "deterministic_trace_assembly" ? "this candidate" : "unmeasured", reference: "independent domain oracle; local timings only" },
        limitations: ["Frozen synthetic variants share a domain generator with development. They are not representative real-world data or proof of algorithm learning.", "The frozen split is generated after development and not supplied to synthesis or repairs. Failure is retained; this candidate hash cannot request a fresh split.", timingCases.length + " passing supported timing cases have three repetitions each. Small local timings include parsing/runtime checks and are noisy; no p95, provider savings or break-even claim is made.", "Compilation, export, orchestration and provider baselines are not inferred from standalone runtime timings."]
      };
      await writeFile(path.join(store, "report.json"), JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
      return reply.code(201).send(report);
    } finally { inProgress.delete(candidateHash); }
  });
}
