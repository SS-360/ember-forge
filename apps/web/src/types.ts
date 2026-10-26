import type { SkillContract, SkillDefinition, SkillOperation as ContractOperation } from "../../../packages/contracts/src/index.js";

export type RunStatus = "succeeded" | "unsupported" | "failed";

export interface ResultLine {
  sku: string;
  demandEach: number;
  onHandEach: number;
  shortageEach: number;
}

export interface TraceStep {
  id: string;
  kind: string;
  source?: string;
  outcome: "succeeded" | "failed";
  durationMs?: number;
  errorCode?: string;
}

export interface RunRecord {
  id: string;
  taskName: string;
  taskFamily: string;
  status: RunStatus;
  sourceMode: string;
  executor: string;
  inputSummary: string;
  outcomeSummary: string;
  reason?: string;
  modelCallCount: number;
  createdAt: string;
  result?: { lines?: ResultLine[]; parameters?: StockParameters };
  parameters?: StockParameters;
  trace?: { outcome: RunStatus; steps: TraceStep[] };
  artifactPath?: string;
  limitation: string;
}

export interface StockParameters {
  warehouseId: string;
  fromDate: string;
  throughDate: string;
  policyVersion: string;
}

export interface VerificationCase {
  caseId: string;
  expectedOutcome: "supported" | "unsupported";
  actualOutcome: string;
  passed: boolean;
  expectedReason?: string;
  actualReason?: string;
}

export interface VerificationReport {
  candidateOrigin: "provided_candidate_draft" | "deterministic_trace_assembly" | "test_synthesis" | "nemotron_synthesis";
  status: "validated" | "rejected";
  candidateHash: string;
  supportedCaseCount: number;
  correctSupportedCount: number;
  unsupportedCaseCount: number;
  rejectedUnsupportedCount: number;
  falseAcceptanceCount: number;
  needlessFallbackCount: number;
  coverage: number;
  scope: string;
  cases: VerificationCase[];
}

export interface VerificationCaseDetail {
  caseId: string;
  expectedOutcome: "supported" | "unsupported";
  expectedReason?: string;
  parameters: StockParameters;
  inputExcerpt: Record<string, unknown>;
  runLinkage: string | null;
}

export type SkillOperation = ContractOperation;

export interface SkillPayload {
  skill: SkillDefinition;
  contract: SkillContract;
  verification: VerificationReport;
  harnessChecks?: Array<{ harness: "codex" | "claude"; candidateHash: string; discovery: "verified"; invocation: "verified" | "unverified"; execution: "verified" | "unverified"; providerLabel?: string }>;
  lineage?: {
    method: "deterministic_trace_assembly" | "test_synthesis" | "nemotron_synthesis";
    adapterId: string;
    compilerContextHash: string;
    traces: Array<{ traceId: string; hash: string; outcome: string; evidenceClass: string; inputHash: string }>;
    operations: Array<{ operationId: string; traceIds: string[] }>;
    limitations: string[];
  };
}

export interface TraceRecord {
  traceId: string;
  taskFamily: string;
  sourceMode: string;
  evidenceClass: "synthetic_fixture" | "user_sanitized";
  recordingMethod: "compiled_runtime_replay" | "normalized_agent_tools";
  recordedAt: string;
  outcome: "succeeded" | "unsupported" | "failed";
  reason?: string;
  operationCount: number;
  hash: string;
  inputHash: string;
  sourceCandidateHash?: string;
  replayVerified?: boolean;
    originalAgentVerified?: boolean;
}

export interface CandidateSummary {
  id: string;
  version: string;
  status: "validated" | "rejected";
  origin: string;
}

export interface HealthPayload {
  status: string;
  mode: string;
  database: string;
  nvidiaConfigured: boolean;
  zetarisConfigured: boolean;
  liveNemotronExecution: boolean;
  liveZetarisQueries: boolean;
}

export interface PackagePreview {
  skillId: string;
  skillVersion: string;
  candidateHash: string;
  files: string[];
  skillDocument: string;
}

export interface CompilerReadiness {
  synthesis: { available: boolean; mode: "disabled" | "nemotron" | "test_only"; budgetUsd: number; message: string };
}
