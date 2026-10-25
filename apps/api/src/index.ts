import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { z } from "zod";
import { SkillContractSchema, SkillDefinitionSchema, StockDatasetSchema, StockParametersSchema } from "@pocketforge/contracts";
import { compileCandidate } from "@pocketforge/compiler";
import { buildDevelopmentSuite } from "@pocketforge/compiler/development-suite";
import { reconcileStock, UnsupportedInputError } from "@pocketforge/evaluator";
import { candidateDirectory as resolveCandidateDirectory, readCandidate, readDevelopmentCases, registerCompilationRoutes, writeVerificationFiles } from "./compilation.js";
import { exportVerifiedCandidate } from "../../../scripts/export-skill.js";
import { exportFilesMatchManifest } from "./export-integrity.js";
import { registerLibraryRoutes } from "./library.js";
import { registerEvaluationRoutes } from "./evaluation.js";
import { composeSynthesisProvider } from "./provider-composition.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const artifactsRoot = path.join(projectRoot, "artifacts");
const runsRoot = path.join(artifactsRoot, "runs");
const fixturePath = path.join(projectRoot, "fixtures", "dev", "stock-reconciliation.json");
try { process.loadEnvFile(path.join(projectRoot, ".env")); } catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
}

await mkdir(artifactsRoot, { recursive: true });
await mkdir(runsRoot, { recursive: true });
const database = new DatabaseSync(path.join(artifactsRoot, "pocketforge.sqlite"));
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    task_name TEXT NOT NULL,
    status TEXT NOT NULL,
    source_mode TEXT NOT NULL,
    executor TEXT NOT NULL,
    input_summary TEXT NOT NULL,
    outcome_summary TEXT NOT NULL,
    reason TEXT,
    model_call_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    result_json TEXT,
    detail_json TEXT NOT NULL
  );
`);

interface RunRecord {
  id: string;
  taskName: string;
  taskFamily: string;
  status: "succeeded" | "unsupported" | "failed";
  sourceMode: string;
  executor: string;
  inputSummary: string;
  outcomeSummary: string;
  reason?: string;
  modelCallCount: number;
  createdAt: string;
  result?: unknown;
  parameters?: { warehouseId: string; fromDate: string; throughDate: string; policyVersion: string };
  trace?: {
    outcome: "succeeded" | "unsupported" | "failed";
    steps: Array<{ id: string; kind: string; source?: string; outcome: "succeeded" | "failed"; durationMs?: number; errorCode?: string }>;
  };
  artifactPath?: string;
  limitation: string;
  origin?: "imported_artifact" | "local_api";
}

function resultSummary(result: unknown): string {
  if (!result || typeof result !== "object" || !Array.isArray((result as { lines?: unknown }).lines)) return "No result emitted";
  const lines = (result as { lines: Array<{ sku: string; demandEach: number; onHandEach: number; shortageEach: number }> }).lines;
  return lines.map((line) => `${line.sku} · ${line.demandEach} demand · ${line.onHandEach} on hand · ${line.shortageEach} shortage`).join(" | ");
}

function storeRun(record: RunRecord): void {
  database.prepare(`
    INSERT OR REPLACE INTO runs
      (run_id, task_name, status, source_mode, executor, input_summary, outcome_summary, reason, model_call_count, created_at, result_json, detail_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.taskName,
    record.status,
    record.sourceMode,
    record.executor,
    record.inputSummary,
    record.outcomeSummary,
    record.reason ?? null,
    record.modelCallCount,
    record.createdAt,
    record.result === undefined ? null : JSON.stringify(record.result),
    JSON.stringify(record)
  );
}

async function seedRecordedRuns(): Promise<void> {
  const files = (await readdir(runsRoot)).filter((name) => name.endsWith(".json")).sort();
  for (const file of files) {
    try {
      const artifact = JSON.parse(await readFile(path.join(runsRoot, file), "utf8")) as Record<string, any>;
      if (typeof artifact.runId !== "string" || artifact.sourceMode !== "fixture") continue;
      const succeeded = artifact.trace?.outcome === "succeeded";
      const result = artifact.result;
      const reason = typeof artifact.trace?.unsupportedReason === "string"
        ? artifact.trace.unsupportedReason
        : typeof artifact.trace?.errorCode === "string" ? artifact.trace.errorCode
          : typeof artifact.unsupportedReason === "string" ? artifact.unsupportedReason : undefined;
      const isLocalApiRun = typeof artifact.taskDescription === "string";
      const parameterResult = StockParametersSchema.safeParse(artifact.parameters ?? (
        result && typeof result === "object" ? (result as Record<string, unknown>).parameters : undefined
      ));
      const parameters = parameterResult.success ? parameterResult.data : undefined;
      const record: RunRecord = {
        id: artifact.runId,
        taskName: isLocalApiRun && typeof artifact.taskName === "string"
          ? artifact.taskName
          : succeeded ? "Supported stock baseline" : "Unknown unit counterexample",
        taskFamily: "stock-reconciliation",
        status: succeeded ? "succeeded" : "unsupported",
        sourceMode: "fixture",
        executor: typeof artifact.executor === "string" ? artifact.executor : "fixture_reference",
        inputSummary: typeof artifact.inputSummary === "string"
          ? artifact.inputSummary
            : parameters
            ? `6 synthetic order rows · ${parameters.warehouseId} · ${parameters.fromDate} to ${parameters.throughDate}`
            : `${artifact.trace?.steps?.some((step: any) => step.source === "fixture.orders") ? 6 : "Synthetic"} order rows · WH-01 · 20–23 Oct 2026`,
        outcomeSummary: succeeded ? `${result?.lines?.length ?? 0} SKU results · artifact ${artifact.runId.slice(0, 8)}` : `${reason ?? "Unsupported input"} · artifact ${artifact.runId.slice(0, 8)}`,
        ...(reason ? { reason } : {}),
        modelCallCount: 0,
        createdAt: artifact.trace?.startedAt ?? new Date(0).toISOString(),
        ...(result ? { result } : {}),
        ...(parameters ? { parameters } : {}),
        ...(artifact.trace && Array.isArray(artifact.trace.steps) ? { trace: {
          outcome: artifact.trace.outcome,
          steps: artifact.trace.steps.map((step: Record<string, unknown>) => ({
            id: String(step.id ?? "unknown_step"),
            kind: String(step.kind ?? "unknown"),
            ...(typeof step.source === "string" ? { source: step.source } : {}),
            outcome: step.outcome === "succeeded" ? "succeeded" : "failed",
            ...(typeof step.durationMs === "number" ? { durationMs: step.durationMs } : {}),
            ...(typeof step.errorCode === "string" ? { errorCode: step.errorCode } : {})
          }))
        } } : {}),
        artifactPath: path.join("artifacts", "runs", file),
        limitation: typeof artifact.limitation === "string" ? artifact.limitation : "Synthetic fixture evidence only.",
        origin: isLocalApiRun ? "local_api" : "imported_artifact"
      };
      storeRun(record);
    } catch (error) {
      console.warn(`Skipped malformed run artifact ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

await seedRecordedRuns();

const app = Fastify({ logger: true, bodyLimit: 1_000_000 });
// The human's current authorization is $0; configuration cannot raise that ceiling.
const synthesisProvider = await composeSynthesisProvider(projectRoot, { approvedSpendingLimitUsd: 0 });
await registerCompilationRoutes(app, projectRoot, { synthesis: synthesisProvider.dependencies });
await registerLibraryRoutes(app, projectRoot);
await registerEvaluationRoutes(app, projectRoot);
const TaskRunRequestSchema = z.object({
  taskName: z.string().trim().min(1).max(120),
  taskDescription: z.string().trim().min(1).max(2000),
  warehouseId: z.string().trim().min(1).max(64),
  fromDate: z.string(),
  throughDate: z.string()
});

app.get("/api/health", async () => ({
  status: "ready",
  mode: "fixture",
  database: "sqlite",
  nvidiaConfigured: Boolean(process.env.NVIDIA_API_KEY && process.env.NVIDIA_MODEL && process.env.NVIDIA_BASE_URL && process.env.NVIDIA_SESSION_BUDGET_USD),
  zetarisConfigured: Boolean(process.env.ZETARIS_BASE_URL && process.env.ZETARIS_API_KEY),
  liveNemotronExecution: false,
  liveZetarisQueries: false
}));

app.get("/api/runs", async () => {
  const rows = database.prepare("SELECT detail_json FROM runs ORDER BY created_at DESC, rowid DESC").all() as Array<{ detail_json: string }>;
  const records = rows.map((row) => JSON.parse(row.detail_json) as RunRecord);
  const shownFixtureExamples = new Set<string>();
  return records.filter((record) => {
    if (record.origin !== "imported_artifact") return true;
    const signature = record.status;
    if (shownFixtureExamples.has(signature)) return false;
    shownFixtureExamples.add(signature);
    return true;
  });
});

app.get("/api/runs/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const row = database.prepare("SELECT detail_json FROM runs WHERE run_id = ?").get(id) as { detail_json: string } | undefined;
  if (!row) return reply.code(404).send({ error: "RUN_NOT_FOUND", message: "No recorded run has this ID." });
  return JSON.parse(row.detail_json) as RunRecord;
});

app.post("/api/tasks/run", async (request, reply) => {
  const parsedRequest = TaskRunRequestSchema.safeParse(request.body);
  if (!parsedRequest.success) return reply.code(400).send({ error: "INVALID_TASK_REQUEST", message: parsedRequest.error.issues[0]?.message ?? "Invalid task form." });
  const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as { dataset: unknown };
  const parameterResult = StockParametersSchema.safeParse({
    warehouseId: parsedRequest.data.warehouseId,
    fromDate: parsedRequest.data.fromDate,
    throughDate: parsedRequest.data.throughDate,
    policyVersion: "stock-v1"
  });
  if (!parameterResult.success) return reply.code(400).send({ error: "INVALID_TASK_PARAMETERS", message: parameterResult.error.issues[0]?.message ?? "Invalid task parameters." });

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const inputHash = createHash("sha256").update(JSON.stringify({ parameters: parameterResult.data, dataset: fixture.dataset })).digest("hex");
  const inputSummary = `6 synthetic order rows · ${parameterResult.data.warehouseId} · ${parameterResult.data.fromDate} to ${parameterResult.data.throughDate}`;
  let record: RunRecord;
  let traceOutcome: "succeeded" | "unsupported";
  let result: unknown;
  let reason: string | undefined;
  try {
    result = reconcileStock(parameterResult.data, fixture.dataset as never);
    traceOutcome = "succeeded";
    record = {
      id,
      taskName: parsedRequest.data.taskName,
      taskFamily: "stock-reconciliation",
      status: "succeeded",
      sourceMode: "fixture",
      executor: "fixture_reference",
      inputSummary,
      outcomeSummary: `${(result as { lines: unknown[] }).lines.length} SKU results · artifact ${id.slice(0, 8)}`,
      modelCallCount: 0,
      createdAt,
      result,
      artifactPath: path.join("artifacts", "runs", `${id}.json`),
      limitation: "Synthetic fixture reference run. This is not a Nemotron run or live Zetaris query.",
      origin: "local_api"
    };
  } catch (error) {
    if (!(error instanceof UnsupportedInputError)) throw error;
    reason = error.code;
    traceOutcome = "unsupported";
    record = {
      id,
      taskName: parsedRequest.data.taskName,
      taskFamily: "stock-reconciliation",
      status: "unsupported",
      sourceMode: "fixture",
      executor: "fixture_reference",
      inputSummary,
      outcomeSummary: `${error.code} · artifact ${id.slice(0, 8)}`,
      reason: error.code,
      modelCallCount: 0,
      createdAt,
      artifactPath: path.join("artifacts", "runs", `${id}.json`),
      limitation: "Synthetic unsupported fixture. No model fallback is configured in this build.",
      origin: "local_api"
    };
  }

  const trace: NonNullable<RunRecord["trace"]> = {
    outcome: traceOutcome,
    steps: [{
      id: "reconcile_fixture",
      kind: "aggregate",
      outcome: traceOutcome === "succeeded" ? "succeeded" : "failed",
      ...(reason ? { errorCode: reason } : {})
    }]
  };
  record.parameters = parameterResult.data;
  record.trace = trace;

  const artifact = {
    evidenceLabel: traceOutcome === "succeeded" ? "SYNTHETIC DEVELOPMENT DATA — NOT LIVE SPONSOR EVIDENCE" : "SYNTHETIC UNSUPPORTED FIXTURE",
    runId: id,
    taskName: parsedRequest.data.taskName,
    taskDescription: parsedRequest.data.taskDescription,
    taskFamily: "stock-reconciliation",
    inputSummary,
    sourceMode: "fixture",
    executor: "fixture_reference",
    modelCallCount: 0,
    inputHash,
    trace: {
      runId: id,
      taskFamily: "stock-reconciliation",
      sourceMode: "fixture",
      executor: "fixture_reference",
      startedAt: createdAt,
      endedAt: new Date().toISOString(),
      modelCallCount: 0,
      steps: [{ id: "reconcile_fixture", kind: "aggregate", inputHash, ...(result ? { outputHash: createHash("sha256").update(JSON.stringify(result)).digest("hex") } : {}), outcome: traceOutcome === "succeeded" ? "succeeded" : "failed", ...(reason ? { errorCode: reason } : {}) }],
      outcome: traceOutcome,
      ...(reason ? { unsupportedReason: reason } : {})
    },
    parameters: parameterResult.data,
    ...(result ? { result } : {}),
    ...(reason ? { unsupportedReason: reason } : {}),
    limitation: record.limitation
  };
  await writeFile(path.join(runsRoot, `${id}.json`), JSON.stringify(artifact, null, 2) + "\n", "utf8");
  storeRun(record);
  return reply.code(201).send(record);
});

app.get("/api/skills/:skillId", async (request, reply) => {
  const { skillId } = request.params as { skillId: string };
  try { return reply.send(await readCandidate(projectRoot, skillId)); }
  catch { return reply.code(404).send({ error: "SKILL_NOT_FOUND", message: "No local skill exists with this ID." }); }
});

app.get("/api/skills/:skillId/verification-cases", async (request, reply) => {
  const { skillId } = request.params as { skillId: string };
  let directory: string;
  try { directory = await resolveCandidateDirectory(projectRoot, skillId); }
  catch { return reply.code(404).send({ error: "SKILL_NOT_FOUND", message: "No local skill exists with this ID." }); }
  return (await readDevelopmentCases(projectRoot, directory)).map((testCase) => {
    // Invalid input cases are intentional evaluator evidence, not a broken response.
    const parameters = testCase.parameters as { warehouseId?: unknown; fromDate?: unknown; throughDate?: unknown; policyVersion?: unknown };
    const datasetResult = StockDatasetSchema.safeParse(testCase.dataset);
    const dataset = datasetResult.success ? datasetResult.data : undefined;
    const inputExcerpt: Record<string, unknown> = {
      warehouseId: parameters.warehouseId,
      fromDate: parameters.fromDate,
      throughDate: parameters.throughDate,
      policyVersion: parameters.policyVersion,
      sourceSchemaVersions: dataset?.sourceSchemaVersions,
      ...(dataset ? {} : { inputSchemaValid: false })
    };
    if (dataset && testCase.caseId.includes("unknown-unit")) {
      const order = dataset.orders.find((candidate) => !dataset.productRules.unitConversions.some((rule) => rule.unit === candidate.unit));
      if (order) inputExcerpt.order = { orderId: order.orderId, sku: order.sku, unit: order.unit, quantity: order.quantity };
    }
    if (dataset && testCase.caseId.includes("missing-inventory")) {
      const demandedSkus = new Set(dataset.orders.map((order) =>
        dataset.productRules.aliases.find((alias) => alias.alias === order.sku)?.canonicalSku ?? order.sku
      ));
      const missingSkus = [...demandedSkus].filter((sku) => !dataset.inventory.some((row) => row.sku === sku));
      inputExcerpt.inventoryRowCount = dataset.inventory.length;
      inputExcerpt.missingCanonicalSkus = missingSkus;
    }
    return {
      caseId: testCase.caseId,
      expectedOutcome: testCase.expectedOutcome,
      ...(testCase.expectedOutcome === "unsupported" ? { expectedReason: testCase.expectedReason } : {}),
      parameters,
      inputExcerpt,
      runLinkage: null
    };
  });
});

app.post("/api/skills/:skillId/verify", async (request, reply) => {
  const { skillId } = request.params as { skillId: string };
  let directory: string;
  try { directory = await resolveCandidateDirectory(projectRoot, skillId); }
  catch { return reply.code(404).send({ error: "SKILL_NOT_FOUND", message: "No local skill exists with this ID." }); }
  const [cases, candidate] = await Promise.all([readDevelopmentCases(projectRoot, directory), readCandidate(projectRoot, skillId)]);
  const result = compileCandidate(candidate.skill, candidate.contract, cases);
  if (candidate.lineage) result.verification.candidateOrigin = candidate.lineage.method;
  await writeVerificationFiles(directory, result.verification);
  if (result.exportable) await exportVerifiedCandidate({ candidateDirectory: directory });
  return reply.send(result.verification);
});

app.get("/api/skills/:skillId/export", async (request, reply) => {
  const { skillId } = request.params as { skillId: string };
  const query = z.object({ candidateHash: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(request.query);
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(skillId) || !query.success) {
    return reply.code(400).send({ error: "EXPORT_REFERENCE_INVALID", message: "A valid skill ID and candidate hash are required." });
  }
  let candidateDirectory: string;
  try { candidateDirectory = await resolveCandidateDirectory(projectRoot, skillId); }
  catch { return reply.code(404).send({ error: "SKILL_NOT_FOUND", message: "No local skill exists with this ID." }); }
  let skill: unknown;
  let contract: unknown;
  let verification: unknown;
  try {
    [skill, contract, verification] = await Promise.all([
      readFile(path.join(candidateDirectory, "skill.json"), "utf8").then((value) => JSON.parse(value) as unknown),
      readFile(path.join(candidateDirectory, "contract.json"), "utf8").then((value) => JSON.parse(value) as unknown),
      readFile(path.join(candidateDirectory, "verification.json"), "utf8").then((value) => JSON.parse(value) as unknown)
    ]);
  } catch {
    return reply.code(404).send({ error: "SKILL_NOT_FOUND", message: "No local skill exists with this ID." });
  }
  const skillResult = SkillDefinitionSchema.safeParse(skill);
  const contractResult = SkillContractSchema.safeParse(contract);
  const verificationResult = z.object({
    status: z.literal("validated"),
    candidateHash: z.string().regex(/^[a-f0-9]{64}$/),
    skillId: z.string(),
    skillVersion: z.string()
  }).passthrough().safeParse(verification);
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) :
    value !== null && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize((value as Record<string, unknown>)[key])])) : value;
  const currentHash = skillResult.success && contractResult.success
    ? createHash("sha256").update(JSON.stringify(normalize({ skill: skillResult.data, contract: contractResult.data }))).digest("hex")
    : "";
  if (!skillResult.success || !contractResult.success || skillResult.data.id !== skillId ||
    contractResult.data.skillId !== skillId || contractResult.data.skillVersion !== skillResult.data.version ||
    !verificationResult.success || verificationResult.data.skillId !== skillId ||
    verificationResult.data.skillVersion !== skillResult.data.version || verificationResult.data.candidateHash !== currentHash ||
    query.data.candidateHash !== currentHash) {
    return reply.code(409).send({ error: "VERIFICATION_STALE", message: "The requested verification no longer matches this skill. Verify the current candidate and export it again." });
  }

  const reportHash = createHash("sha256").update(await readFile(path.join(candidateDirectory, "verification.json"))).digest("hex");
  const directory = await findExportDirectory(skillId, skillResult.data.version, currentHash, reportHash);
  if (!directory) return reply.code(409).send({ error: "EXPORT_NOT_READY", message: "Verify this candidate to prepare its current package." });
  const files = await collectFiles(directory, skillId);
  const tar = createTar(files);
  const archive = gzipSync(tar, { level: 9 });
  reply.header("Content-Type", "application/gzip");
  reply.header("Content-Disposition", `attachment; filename="${skillId}-${skillResult.data.version}-agent-skill.tar.gz"`);
  reply.header("Cache-Control", "no-store");
  return reply.send(archive);
});

app.get("/api/skills/:skillId/preview", async (request, reply) => {
  const { skillId } = request.params as { skillId: string };
  const query = z.object({ candidateHash: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(request.query);
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(skillId) || !query.success) {
    return reply.code(400).send({ error: "PREVIEW_REFERENCE_INVALID", message: "A valid skill ID and candidate hash are required." });
  }
  let candidateDirectory: string;
  try { candidateDirectory = await resolveCandidateDirectory(projectRoot, skillId); }
  catch { return reply.code(404).send({ error: "SKILL_NOT_FOUND", message: "No local skill exists with this ID." }); }
  let skill: unknown;
  let contract: unknown;
  let verification: unknown;
  try {
    [skill, contract, verification] = await Promise.all([
      readFile(path.join(candidateDirectory, "skill.json"), "utf8").then(JSON.parse),
      readFile(path.join(candidateDirectory, "contract.json"), "utf8").then(JSON.parse),
      readFile(path.join(candidateDirectory, "verification.json"), "utf8").then(JSON.parse)
    ]);
  } catch {
    return reply.code(404).send({ error: "SKILL_NOT_FOUND", message: "No local skill exists with this ID." });
  }
  const skillResult = SkillDefinitionSchema.safeParse(skill);
  const contractResult = SkillContractSchema.safeParse(contract);
  const verificationResult = z.object({
    status: z.literal("validated"), candidateHash: z.string().regex(/^[a-f0-9]{64}$/), skillId: z.string(), skillVersion: z.string()
  }).passthrough().safeParse(verification);
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) :
    value !== null && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize((value as Record<string, unknown>)[key])])) : value;
  const currentHash = skillResult.success && contractResult.success
    ? createHash("sha256").update(JSON.stringify(normalize({ skill: skillResult.data, contract: contractResult.data }))).digest("hex") : "";
  if (!skillResult.success || !contractResult.success || skillResult.data.id !== skillId ||
    contractResult.data.skillId !== skillId || contractResult.data.skillVersion !== skillResult.data.version ||
    !verificationResult.success || verificationResult.data.skillId !== skillId ||
    verificationResult.data.skillVersion !== skillResult.data.version || verificationResult.data.candidateHash !== currentHash ||
    query.data.candidateHash !== currentHash) {
    return reply.code(409).send({ error: "VERIFICATION_STALE", message: "The requested verification no longer matches this skill." });
  }

  const reportHash = createHash("sha256").update(await readFile(path.join(candidateDirectory, "verification.json"))).digest("hex");
  const directory = await findExportDirectory(skillId, skillResult.data.version, currentHash, reportHash);
  if (!directory) return reply.code(409).send({ error: "EXPORT_NOT_READY", message: "The current verified package is not ready for preview." });
  const files = (await collectFiles(directory)).map((file) => file.name).sort();
  const skillDocument = await readFile(path.join(directory, "SKILL.md"), "utf8");
  return reply.send({ skillId, skillVersion: skillResult.data.version, candidateHash: currentHash, files, skillDocument });
});

async function findExportDirectory(skillId: string, skillVersion: string, candidateHash: string, reportHash: string): Promise<string | undefined> {
  const exportRoot = path.join(artifactsRoot, "exports", skillId, skillVersion);
  let directories: string[];
  try {
    directories = (await readdir(exportRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return undefined;
  }
  for (const name of directories) {
    const candidate = path.join(exportRoot, name);
    try {
      const provenance = JSON.parse(await readFile(path.join(candidate, "provenance.json"), "utf8")) as { skillId?: string; skillVersion?: string; candidateHash?: string; files?: Record<string, string>; packageCheck?: { status?: string; candidateHash?: string; verificationHash?: string } };
      if (provenance.skillId === skillId && provenance.skillVersion === skillVersion && provenance.candidateHash === candidateHash && provenance.files?.["verification.json"] === reportHash && provenance.packageCheck?.status === "passed" && provenance.packageCheck.candidateHash === candidateHash && provenance.packageCheck.verificationHash === reportHash && await exportFilesMatchManifest(candidate, provenance.files)) return candidate;
    } catch { /* Ignore incomplete export directories. */ }
  }
  return undefined;
}

interface ArchiveFile { name: string; data: Buffer }
async function collectFiles(directory: string, prefix = ""): Promise<ArchiveFile[]> {
  const result: ArchiveFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await collectFiles(absolute, relative));
    else if (entry.isFile()) result.push({ name: relative.replaceAll(path.sep, "/"), data: await readFile(absolute) });
  }
  return result;
}

function createTar(files: ArchiveFile[]): Buffer {
  const blocks: Buffer[] = [];
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    if (name.length > 100) throw new Error("Export path exceeds the supported tar header name length");
    const header = Buffer.alloc(512);
    name.copy(header, 0);
    header.write("0000644\0", 100, 8, "ascii");
    header.write("0000000\0", 108, 8, "ascii");
    header.write("0000000\0", 116, 8, "ascii");
    header.write(file.data.length.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
    header.write("00000000000\0", 136, 12, "ascii");
    header.fill(0x20, 148, 156);
    header[156] = 0x30;
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
    blocks.push(header, file.data);
    const remainder = file.data.length % 512;
    if (remainder > 0) blocks.push(Buffer.alloc(512 - remainder));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

app.setErrorHandler((error, _request, reply) => {
  const statusCode = error !== null && typeof error === "object" && "statusCode" in error ? error.statusCode : undefined;
  if (statusCode === 400 || statusCode === 413) {
    return reply.code(statusCode).send({ error: statusCode === 413 ? "REQUEST_TOO_LARGE" : "REQUEST_INVALID", message: statusCode === 413 ? "The JSON payload exceeds the local 1 MB request limit." : "Send a valid JSON request." });
  }
  app.log.error(error);
  return reply.code(500).send({ error: "INTERNAL_ERROR", message: "The local operation failed. Review the API log for details." });
});

const port = Number(process.env.POCKETFORGE_API_PORT ?? "3001");
await app.listen({ host: "127.0.0.1", port });
app.log.info({ port, mode: "fixture", database: path.relative(projectRoot, path.join(artifactsRoot, "pocketforge.sqlite")) }, "Pocket Forge API ready");

async function shutdown(): Promise<void> {
  await app.close();
  database.close();
}
process.once("SIGINT", () => { void shutdown().finally(() => process.exit(0)); });
process.once("SIGTERM", () => { void shutdown().finally(() => process.exit(0)); });
