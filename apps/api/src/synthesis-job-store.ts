import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { SkillDefinitionSchema, SkillContractSchema, formatVersionSchema } from "@emberforge/contracts";
import type { SynthesisResult } from "@emberforge/compiler/synthesis-controller";

export interface SynthesisJob {
  jobId: string; skillId: string; createdAt: string; updatedAt: string;
  state: "running" | "interrupted" | SynthesisResult["state"];
  stage: string; revision?: number | undefined; call?: number | undefined; result?: SynthesisResult | undefined;
  checkpoint?: { attempts: SynthesisResult["attempts"]; revisions: SynthesisResult["revisions"]; usage: SynthesisResult["usage"] } | undefined;
  error?: string | undefined; packageError?: string | undefined; cancellationRequested?: boolean | undefined;
  timings?: { stagesMs: Record<string, number>; totalMs: number } | undefined;
}
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Count = z.number().int().nonnegative();
const Dollars = z.number().nonnegative();
const UsageSchema = z.object({ inputTokens: Count, outputTokens: Count }).strict();
const CompleteUsageSchema = UsageSchema.extend({ providerCalls: Count.max(12), accountedUsd: Dollars, uncertainUsageCalls: Count.max(12), basis: z.enum(["provider_response", "test_fixture"]) }).strict();
const FeedbackSchema = z.object({ stage: z.enum(["static_validation", "development_verification"]), issues: z.array(z.object({ caseId: z.string().max(200).optional(), code: z.string().max(100), message: z.string().max(2000) }).strict()).max(500) }).strict();
const CandidateSchema = z.object({
  skill: SkillDefinitionSchema, contract: SkillContractSchema, exportable: z.boolean(),
  verification: z.object({
    schemaVersion: formatVersionSchema("verification/1"), scope: z.literal("finite-development-suite"),
    candidateOrigin: z.enum(["provided_candidate_draft", "deterministic_trace_assembly", "test_synthesis", "nemotron_synthesis"]),
    skillId: z.string().max(64), skillVersion: z.string().max(80), candidateHash: Hash, status: z.enum(["validated", "rejected"]),
    supportedCaseCount: Count, correctSupportedCount: Count, unsupportedCaseCount: Count, rejectedUnsupportedCount: Count,
    falseAcceptanceCount: Count, needlessFallbackCount: Count, coverage: z.number().min(0).max(1),
    cases: z.array(z.object({ caseId: z.string().max(200), expectedOutcome: z.enum(["supported", "unsupported"]), actualOutcome: z.enum(["correct", "incorrect", "reference_mismatch"]), passed: z.boolean(), expectedReason: z.string().max(100).optional(), actualReason: z.string().max(100).optional(), expectedResultHash: Hash.optional(), actualResultHash: Hash.optional(), durationMs: z.number().nonnegative() }).strict()).max(500),
    startedAt: z.iso.datetime(), endedAt: z.iso.datetime(), durationMs: z.number().nonnegative()
  }).strict()
}).strict();
const AttemptsSchema = z.array(z.object({ call: Count.min(1).max(12), revision: Count.min(1).max(3), contextHash: Hash, outcome: z.enum(["response", "provider_error"]), requestId: z.string().max(200).optional(), code: z.string().max(100).optional(), usage: UsageSchema.optional(), reservedUsd: Dollars, accountedUsd: Dollars, usageUncertain: z.boolean() }).strict()).max(12);
const RevisionsSchema = z.array(z.object({ revision: Count.min(1).max(3), status: z.enum(["validated", "rejected", "static_invalid"]), candidateHash: Hash.optional(), feedback: FeedbackSchema.optional(), candidate: CandidateSchema.optional() }).strict()).max(3);
const CheckpointSchema = z.object({ attempts: AttemptsSchema, revisions: RevisionsSchema, usage: CompleteUsageSchema }).strict();
const ResultSchema = z.object({
  runId: z.uuid(), state: z.enum(["validated", "rejected", "failed", "cancelled", "budget_exhausted"]), candidate: CandidateSchema.optional(),
  revisions: RevisionsSchema, attempts: AttemptsSchema, usage: CompleteUsageSchema, durationMs: z.number().nonnegative(),
  failure: z.object({ code: z.string().max(100), message: z.string().max(2000) }).strict().optional(),
  lineage: z.object({
    schemaVersion: formatVersionSchema("lineage/1"), method: z.enum(["deterministic_trace_assembly", "test_synthesis", "nemotron_synthesis"]), adapterId: z.string().max(200), generatedAt: z.iso.datetime(), compilerContextHash: Hash,
    traces: z.array(z.object({ traceId: z.uuid(), hash: Hash, outcome: z.string().max(40), evidenceClass: z.string().max(40), inputHash: Hash }).strict()).max(32),
    operations: z.array(z.object({ operationId: z.string().max(100), traceIds: z.array(z.uuid()).max(32) }).strict()).max(64), limitations: z.array(z.string().max(2000)).max(20)
  }).strict()
}).strict().transform((value) => value as SynthesisResult);
const JobSchema = z.object({
  jobId: z.uuid(), skillId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  state: z.enum(["running", "interrupted", "validated", "rejected", "failed", "cancelled", "budget_exhausted"]),
  stage: z.string().min(1).max(100), revision: z.number().int().min(1).max(3).optional(), call: z.number().int().min(1).max(12).optional(),
  result: ResultSchema.optional(), checkpoint: CheckpointSchema.transform((value) => value as NonNullable<SynthesisJob["checkpoint"]>).optional(),
  error: z.string().max(200).optional(), packageError: z.string().max(500).optional(), cancellationRequested: z.boolean().optional(),
  timings: z.object({ stagesMs: z.record(z.string().regex(/^[a-z_]{1,100}$/), z.number().nonnegative()), totalMs: z.number().nonnegative() }).strict().optional()
}).strict();
interface Stored { record_json: string; owner_id: string; owner_pid: number; cancel_requested: number }
function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return !(error instanceof Error && "code" in error && error.code === "ESRCH"); }
}

/** One running job per workspace, even if another API process opens the same store. */
export class SynthesisJobStore {
  readonly ownerId = randomUUID();
  private readonly database: DatabaseSync;
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true });
    this.database = new DatabaseSync(path.join(directory, "jobs.sqlite"));
    this.database.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS synthesis_jobs (
        job_id TEXT PRIMARY KEY, state TEXT NOT NULL, owner_id TEXT NOT NULL, owner_pid INTEGER NOT NULL,
        cancel_requested INTEGER NOT NULL DEFAULT 0, sequence INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL, record_json TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_running_synthesis ON synthesis_jobs(state) WHERE state='running';
      CREATE TABLE IF NOT EXISTS synthesis_job_imports (file_name TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS synthesis_job_checkpoints (
        job_id TEXT NOT NULL, sequence INTEGER NOT NULL, recorded_at TEXT NOT NULL, record_json TEXT NOT NULL,
        PRIMARY KEY(job_id,sequence)
      );
      CREATE TABLE IF NOT EXISTS synthesis_job_corrupt_records (
        job_id TEXT NOT NULL, preserved_at TEXT NOT NULL, raw_record TEXT NOT NULL
      );
    `);
    this.recoverDeadOwner();
    this.importLegacyJobs();
  }
  private transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try { const result = operation(); this.database.exec("COMMIT"); return result; }
    catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
  private decode(row: Stored): SynthesisJob {
    const job = JobSchema.parse(JSON.parse(row.record_json));
    return { ...job, ...(row.cancel_requested ? { cancellationRequested: true } : {}) };
  }
  private recoverDeadOwner(): void {
    this.transaction(() => {
      const rows = this.database.prepare("SELECT * FROM synthesis_jobs WHERE state='running'").all() as unknown as Array<Stored & { job_id: string }>;
      for (const row of rows) {
        if (processAlive(row.owner_pid)) continue; // Never steal another live process's job.
        let record: SynthesisJob;
        try { record = this.decode(row); }
        catch {
          this.database.prepare("INSERT INTO synthesis_job_corrupt_records(job_id,preserved_at,raw_record) VALUES(?,?,?)").run(row.job_id, new Date().toISOString(), row.record_json);
          record = { jobId: row.job_id, skillId: "unavailable-candidate", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), state: "interrupted", stage: "malformed_saved_job", error: "SAVED_JOB_INVALID" };
        }
        record.state = "interrupted"; record.stage = record.error ? "malformed_saved_job" : "process_restart"; record.updatedAt = new Date().toISOString();
        this.database.prepare("UPDATE synthesis_jobs SET state='interrupted',record_json=?,updated_at=? WHERE job_id=?").run(JSON.stringify(record), record.updatedAt, row.job_id);
      }
    });
  }
  private importLegacyJobs(): void {
    for (const file of readdirSync(this.directory).filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))) {
      const target = path.join(this.directory, file);
      const fingerprint = statSync(target).size > 4000000 ? "oversized" : createHash("sha256").update(readFileSync(target)).digest("hex");
      const previous = this.database.prepare("SELECT fingerprint FROM synthesis_job_imports WHERE file_name=?").get(file) as { fingerprint: string } | undefined;
      if (previous?.fingerprint === fingerprint) continue;
      let status = "malformed_preserved";
      try {
        if (fingerprint === "oversized") throw new Error("SAVED_JOB_TOO_LARGE");
        const job = JobSchema.parse(JSON.parse(readFileSync(target, "utf8")));
        if (job.jobId + ".json" !== file) throw new Error("SAVED_JOB_ID_MISMATCH");
        if (job.state === "running") { job.state = "interrupted"; job.stage = "legacy_process_restart"; }
        this.database.prepare("INSERT OR IGNORE INTO synthesis_jobs(job_id,state,owner_id,owner_pid,updated_at,record_json) VALUES(?,?,?,0,?,?)").run(job.jobId, job.state, "legacy", job.updatedAt, JSON.stringify(job));
        status = "imported";
      } catch { /* Preserve the original file; malformed evidence cannot stop server startup. */ }
      this.database.prepare("INSERT OR REPLACE INTO synthesis_job_imports(file_name,fingerprint,status) VALUES(?,?,?)").run(file, fingerprint, status);
    }
  }
  create(jobInput: SynthesisJob): boolean {
    this.recoverDeadOwner();
    const job = JobSchema.parse(jobInput);
    return this.transaction(() => {
      if (this.database.prepare("SELECT 1 FROM synthesis_jobs WHERE state='running'").get()) return false;
      this.database.prepare("INSERT INTO synthesis_jobs(job_id,state,owner_id,owner_pid,updated_at,record_json) VALUES(?,'running',?,?,?,?)").run(job.jobId, this.ownerId, process.pid, job.updatedAt, JSON.stringify(job));
      this.database.prepare("INSERT INTO synthesis_job_checkpoints(job_id,sequence,recorded_at,record_json) VALUES(?,0,?,?)").run(job.jobId, job.updatedAt, JSON.stringify(job));
      return true;
    });
  }
  save(jobInput: SynthesisJob): void {
    const job = JobSchema.parse(jobInput);
    this.transaction(() => {
      const row = this.database.prepare("SELECT owner_id,cancel_requested,sequence FROM synthesis_jobs WHERE job_id=?").get(job.jobId) as { owner_id: string; cancel_requested: number; sequence: number } | undefined;
      if (!row || row.owner_id !== this.ownerId) throw new Error("SYNTHESIS_JOB_OWNER_CHANGED");
      job.updatedAt = new Date().toISOString();
      if (row.cancel_requested) job.cancellationRequested = true;
      const record = JSON.stringify(job);
      this.database.prepare("UPDATE synthesis_jobs SET state=?,updated_at=?,sequence=?,record_json=? WHERE job_id=?").run(job.state, job.updatedAt, row.sequence + 1, record, job.jobId);
      this.database.prepare("INSERT INTO synthesis_job_checkpoints(job_id,sequence,recorded_at,record_json) VALUES(?,?,?,?)").run(job.jobId, row.sequence + 1, job.updatedAt, record);
    });
  }
  read(jobId: string): SynthesisJob | undefined {
    const row = this.database.prepare("SELECT * FROM synthesis_jobs WHERE job_id=?").get(jobId) as Stored | undefined;
    if (!row) return undefined;
    try { return this.decode(row); }
    catch { throw new Error("SAVED_JOB_INVALID"); }
  }
  requestCancellation(jobId: string): boolean {
    return this.database.prepare("UPDATE synthesis_jobs SET cancel_requested=1 WHERE job_id=? AND state='running'").run(jobId).changes > 0;
  }
  cancellationRequested(jobId: string): boolean {
    const row = this.database.prepare("SELECT cancel_requested FROM synthesis_jobs WHERE job_id=?").get(jobId) as { cancel_requested: number } | undefined;
    return row?.cancel_requested === 1;
  }
  checkpointCount(jobId: string): number { return (this.database.prepare("SELECT COUNT(*) AS count FROM synthesis_job_checkpoints WHERE job_id=?").get(jobId) as { count: number }).count; }
  close(): void { this.database.close(); }
}
