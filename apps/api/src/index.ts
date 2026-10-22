import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { z } from "zod";
import { StockParametersSchema } from "@pocketforge/contracts";
import { compileCandidate } from "@pocketforge/compiler";
import { buildDevelopmentSuite } from "@pocketforge/compiler/development-suite";
import { reconcileStock, UnsupportedInputError } from "@pocketforge/evaluator";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const artifactsRoot = path.join(projectRoot, "artifacts");
const runsRoot = path.join(artifactsRoot, "runs");
const skillsRoot = path.join(projectRoot, "skills", "stock-reconciliation");
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
      const parameters = artifact.parameters as { warehouseId?: string; fromDate?: string; throughDate?: string } | undefined;
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
      steps: [{ id: "reconcile_fixture", kind: "aggregate", inputHash, ...(result ? { outputHash: createHash("sha256").update(JSON.stringify(result)).digest("hex") } : {}), outcome: traceOutcome, ...(reason ? { errorCode: reason } : {}) }],
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

app.get("/api/skills/stock-reconciliation", async (_request, reply) => {
  const [skill, contract, verification] = await Promise.all([
    readFile(path.join(skillsRoot, "skill.json"), "utf8"),
    readFile(path.join(skillsRoot, "contract.json"), "utf8"),
    readFile(path.join(skillsRoot, "verification.json"), "utf8")
  ]);
  return reply.send({ skill: JSON.parse(skill), contract: JSON.parse(contract), verification: JSON.parse(verification) });
});

app.post("/api/skills/stock-reconciliation/verify", async (_request, reply) => {
  const [fixtureText, skillText, contractText] = await Promise.all([
    readFile(fixturePath, "utf8"),
    readFile(path.join(skillsRoot, "skill.json"), "utf8"),
    readFile(path.join(skillsRoot, "contract.json"), "utf8")
  ]);
  const fixture = JSON.parse(fixtureText);
  const result = compileCandidate(JSON.parse(skillText), JSON.parse(contractText), buildDevelopmentSuite(fixture));
  await writeFile(path.join(skillsRoot, "verification.json"), JSON.stringify(result.verification, null, 2) + "\n", "utf8");
  const testManifest = {
    suite: "stock-reconciliation development verification",
    scope: "finite development fixtures; not held-out evaluation",
    cases: result.verification.cases.map((testCase) => ({
      caseId: testCase.caseId,
      expectedOutcome: testCase.expectedOutcome,
      ...(testCase.expectedReason ? { expectedReason: testCase.expectedReason } : {})
    }))
  };
  await writeFile(path.join(skillsRoot, "tests", "cases.json"), JSON.stringify(testManifest, null, 2) + "\n", "utf8");
  return reply.send(result.verification);
});

app.get("/api/skills/stock-reconciliation/export", async (_request, reply) => {
  const exportRoot = path.join(artifactsRoot, "exports", "stock-reconciliation", "0.1.0");
  let directories: Array<{ name: string; modified: number }> = [];
  try {
    directories = await Promise.all((await readdir(exportRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => ({ name: entry.name, modified: (await stat(path.join(exportRoot, entry.name))).mtimeMs })));
  } catch {
    return reply.code(409).send({ error: "EXPORT_NOT_READY", message: "Run pnpm eval:export to build and verify a fresh standalone package." });
  }
  const newest = directories.sort((left, right) => right.modified - left.modified)[0];
  if (!newest) return reply.code(409).send({ error: "EXPORT_NOT_READY", message: "Run pnpm eval:export to build and verify a fresh standalone package." });
  const directory = path.join(exportRoot, newest.name);
  const files = await collectFiles(directory);
  const tar = createTar(files);
  const archive = gzipSync(tar, { level: 9 });
  reply.header("Content-Type", "application/gzip");
  reply.header("Content-Disposition", 'attachment; filename="stock-reconciliation-0.1.0.tar.gz"');
  reply.header("Cache-Control", "no-store");
  return reply.send(archive);
});

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
