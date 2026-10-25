import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { StockDatasetSchema, StockParametersSchema } from "@pocketforge/contracts";
import { compileCandidate } from "@pocketforge/compiler";
import { SkillMemoryService } from "@pocketforge/memory";
import { executeSkill, SkillExecutionError } from "@pocketforge/runtime";
import { candidateDirectory, readCandidate, readDevelopmentCases, SkillIdSchema } from "./compilation.js";

export async function registerLibraryRoutes(app: FastifyInstance, projectRoot: string): Promise<void> {
  const memory = new SkillMemoryService({ projectRoot, storageDir: path.join(projectRoot, "artifacts", "library") });
  const runsRoot = path.join(projectRoot, "artifacts", "library-executions");
  await mkdir(runsRoot, { recursive: true });
  app.get("/api/library", async () => memory.list());
  app.get("/api/library/example", async () => {
    const example = JSON.parse(await readFile(path.join(projectRoot, "fixtures", "dev", "stock-reconciliation.json"), "utf8")) as { parameters: unknown; dataset: unknown };
    return { parameters: example.parameters, dataset: example.dataset };
  });
  app.post("/api/library/register", async (request, reply) => {
    const input = z.object({ skillId: SkillIdSchema }).strict().safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: "CANDIDATE_REFERENCE_INVALID", message: "Choose a local candidate." });
    let directory: string;
    try { directory = await candidateDirectory(projectRoot, input.data.skillId); }
    catch { return reply.code(404).send({ error: "SKILL_NOT_FOUND", message: "The selected candidate is unavailable." }); }
    const candidate = await readCandidate(projectRoot, input.data.skillId);
    const fresh = compileCandidate(candidate.skill, candidate.contract, await readDevelopmentCases(projectRoot, directory));
    if (!fresh.exportable || fresh.verification.candidateHash !== candidate.verification.candidateHash || candidate.verification.status !== "validated") {
      return reply.code(409).send({ error: "VERIFICATION_NOT_CURRENT", message: "The current candidate must pass its independent development suite before registration." });
    }
    fresh.verification.candidateOrigin = candidate.verification.candidateOrigin;
    try {
      const entry = memory.registerValidatedSkill({ skill: candidate.skill, contract: candidate.contract, verification: fresh.verification, artifactPaths: {
        skillPath: path.relative(projectRoot, path.join(directory, "skill.json")), contractPath: path.relative(projectRoot, path.join(directory, "contract.json"))
      } });
      return reply.code(201).send(entry);
    } catch (error) {
      return reply.code(409).send({ error: "LIBRARY_REGISTRATION_CONFLICT", message: error instanceof Error ? error.message : "Candidate registration failed." });
    }
  });
  app.post("/api/library/execute", async (request, reply) => {
    const input = z.object({ query: z.string().trim().min(3).max(500), parameters: StockParametersSchema, dataset: StockDatasetSchema }).strict().safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: "INPUT_CONTRACT_INVALID", message: "Supply valid stock parameters and a dataset matching the input schema." });
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const selection = memory.retrieveApplicable(input.data);
    const retrievalDurationMs = performance.now() - started;
    let evidence: Record<string, unknown> = {
      schemaVersion: "pocketforge.library-execution/1", runId, startedAt,
      sourceMode: input.data.dataset.sourceMode, sourceVersions: input.data.dataset.sourceVersions,
      retrieval: selection.retrieval, rejections: selection.rejections,
      status: "requires_reasoning", modelCallCount: 0, retrievalDurationMs,
      reason: selection.rejections[0]?.reason ?? "NO_VERIFIED_APPLICABLE_SKILL",
      limitation: "Local H-MEM retrieval and bounded execution. No automatic model fallback or live source query occurs. Finite verification is not a general correctness proof."
    };
    if (selection.selected) {
      const { skill, contract, memoryId, evidenceIds } = selection.selected;
      try {
        const execution = executeSkill(skill, contract, input.data.parameters, input.data.dataset);
        evidence = { ...evidence, reason: null, status: "succeeded", candidate: { skillId: skill.id, skillVersion: skill.version, memoryId, evidenceIds }, result: execution.records, metrics: execution.metrics };
      } catch (error) {
        const reason = error instanceof SkillExecutionError ? error.code : "EXECUTION_FAILED";
        memory.recordExecutionFailure({ skillId: skill.id, skillVersion: skill.version, runId, reason, sourceVersions: input.data.dataset.sourceVersions });
        evidence = { ...evidence, reason, candidate: { skillId: skill.id, skillVersion: skill.version, memoryId, evidenceIds } };
      }
    }
    evidence.durationMs = performance.now() - started;
    evidence.completedAt = new Date().toISOString();
    evidence.artifact = "artifacts/library-executions/" + runId + ".json";
    await writeFile(path.join(runsRoot, runId + ".json"), JSON.stringify(evidence, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    return reply.code(201).send(evidence);
  });
}
