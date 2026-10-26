import { createHash } from "node:crypto";
import {
  SkillContractSchema, SkillDefinitionSchema,
  type SkillContract, type SkillDefinition, type SkillOperation, type FormatVersion
} from "@emberforge/contracts";
import { SanitizedTraceSchema, type SanitizedTrace } from "@emberforge/contracts/traces";
import { validateSkillIR } from "@emberforge/runtime";
import { compileCandidate, type CompileCandidateResult, type VerificationCase } from "./index.js";

export function canonicalHash(value: unknown): string {
  const normalize = (item: unknown): unknown => Array.isArray(item) ? item.map(normalize) :
    item !== null && typeof item === "object"
      ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize((item as Record<string, unknown>)[key])]))
      : item;
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

export class TraceCompilationError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "TraceCompilationError"; }
}

export interface GenerationContext {
  skillId: string;
  version: string;
  traces: readonly SanitizedTrace[];
  limits: { maxRows: number; maxRuntimeMs: number };
}

/** Adapters receive development trajectories only. Evaluator cases and holdouts are never passed here. */
export interface CandidateGenerationAdapter {
  readonly id: string;
  generate(context: GenerationContext, signal: AbortSignal): Promise<{ skill: unknown; contract: unknown }>;
}

export interface TraceLineage {
  schemaVersion: FormatVersion<"lineage/1">;
  method: "deterministic_trace_assembly" | "nemotron_synthesis" | "test_synthesis";
  adapterId: string;
  generatedAt: string;
  traces: Array<{ traceId: string; hash: string; outcome: string; evidenceClass: string; inputHash: string }>;
  operations: Array<{ operationId: string; traceIds: string[] }>;
  compilerContextHash: string;
  limitations: string[];
}

export interface TraceCompilationResult extends CompileCandidateResult {
  lineage: TraceLineage;
  revisions: Array<{ revision: number; status: "validated" | "rejected"; candidateHash: string }>;
}

function deriveAssumptions(operations: SkillOperation[]): string[] {
  const assumptions = [
    "Inputs use the declared stock-reconciliation schemas and whole-number safe-integer quantities.",
    "Inventory snapshots must not be later than the requested end date.",
    "This procedure is assembled from agreeing normalized operation traces; it is not evidence of Nemotron learning."
  ];
  for (const operation of operations) {
    if (operation.kind === "filter") {
      for (const predicate of operation.predicates) {
        const operand = predicate.value.kind === "parameter" ? "$" + predicate.value.name : JSON.stringify(predicate.value.value);
        assumptions.push(`Filter ${operation.id}: ${predicate.field} ${predicate.operator} ${operand}.`);
      }
    } else if (operation.kind === "lookup") {
      assumptions.push(`Lookup ${operation.id} requires a unique ${operation.tableKeyField} match; missing values reject with ${operation.missingCode}.`);
    } else if (operation.kind === "join") {
      assumptions.push(`Join ${operation.id} requires ${operation.cardinality} matches; missing inventory rejects with ${operation.missingCode}.`);
    } else if (operation.kind === "compute") {
      assumptions.push(`${operation.outputField} is max(${operation.leftField} minus ${operation.rightField}, zero).`);
    }
  }
  return assumptions;
}

export const deterministicTraceAdapter: CandidateGenerationAdapter = {
  id: "emberforge.deterministic-trace-assembly/1",
  async generate(context, signal) {
    signal.throwIfAborted();
    const successful = context.traces.filter((trace) => trace.label.outcome === "succeeded");
    const operations = successful[0]!.calls.map((call) => structuredClone(call.operation));
    const signature = canonicalHash(operations);
    if (successful.some((trace) => canonicalHash(trace.calls.map((call) => call.operation)) !== signature)) {
      throw new TraceCompilationError("TRACE_STRUCTURE_DIFFERS", "Successful traces do not agree on one operation graph. A reasoning adapter is required to reconcile these trajectories.");
    }
    const output = operations.at(-1)!;
    if (output.kind !== "emit") throw new TraceCompilationError("TRACE_OUTPUT_MISSING", "The successful operation graph must end with emit.");
    const reference = successful[0]!;
    const skill: SkillDefinition = {
      id: context.skillId, version: context.version, taskFamily: reference.taskFamily,
      ir: { schemaVersion: "emberforge.ir/1", operations, outputStep: output.id, runtimeLimits: context.limits }
    };
    const contract: SkillContract = {
      skillId: skill.id, skillVersion: skill.version, taskFamily: skill.taskFamily,
      contractVersion: "emberforge.contract/1", policyVersion: reference.policyVersion,
      sourceSchemaVersions: reference.sourceSchemaVersions,
      supportedSourceModes: [reference.sourceMode], ...context.limits,
      postconditions: ["nonnegative-stock-fields", "shortage-equals-demand-gap", "unique-sku-output"],
      assumptions: deriveAssumptions(operations)
    };
    signal.throwIfAborted();
    return { skill, contract };
  }
};

export async function compileFromTraces(input: {
  traces: readonly unknown[];
  skillId: string;
  version?: string;
  developmentCases: readonly VerificationCase[];
  adapter?: CandidateGenerationAdapter;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<TraceCompilationResult> {
  const traces = input.traces.map((trace) => SanitizedTraceSchema.parse(trace));
  if (traces.length > 32 || new Set(traces.map((trace) => trace.traceId)).size !== traces.length) {
    throw new TraceCompilationError("TRACE_SET_INVALID", "Select at most 32 distinct traces.");
  }
  const successful = traces.filter((trace) => trace.label.outcome === "succeeded");
  const counterexamples = traces.filter((trace) => trace.label.outcome !== "succeeded");
  if (successful.length < 2 || counterexamples.length < 1) {
    throw new TraceCompilationError("INSUFFICIENT_EVIDENCE", "Select at least two successful traces and one independently labeled counterexample.");
  }
  if (new Set(successful.map((trace) => trace.inputHash)).size < 2) {
    throw new TraceCompilationError("DUPLICATE_INPUT_EVIDENCE", "The successful traces must represent at least two different inputs.");
  }
  const reference = successful[0]!;
  const fingerprint = (trace: SanitizedTrace) => canonicalHash({ policyVersion: trace.policyVersion, schemas: trace.sourceSchemaVersions, sourceMode: trace.sourceMode });
  if (traces.some((trace) => fingerprint(trace) !== fingerprint(reference))) {
    throw new TraceCompilationError("TRACE_CONTRACT_DIFFERS", "Selected traces must share a source mode, policy version, and source schemas.");
  }
  if (reference.sourceMode !== "fixture") {
    throw new TraceCompilationError("SOURCE_MODE_UNVERIFIED", "The current development evaluator supports synthetic fixture traces only.");
  }
  for (const trace of successful) {
    for (const parameter of ["warehouseId", "fromDate", "throughDate", "policyVersion"] as const) {
      if (!trace.parameterNames.includes(parameter)) throw new TraceCompilationError("PARAMETER_EVIDENCE_MISSING", "Successful traces must declare every stock-reconciliation parameter.");
    }
    validateSkillIR({ schemaVersion: "emberforge.ir/1", operations: trace.calls.map((call) => call.operation), outputStep: trace.calls.at(-1)!.operation.id, runtimeLimits: { maxRows: 5000, maxRuntimeMs: 5000 } });
  }
  for (const trace of counterexamples) {
    if (trace.calls.some((call, index) => !reference.calls[index] || canonicalHash(call.operation) !== canonicalHash(reference.calls[index]!.operation))) {
      throw new TraceCompilationError("COUNTEREXAMPLE_STRUCTURE_DIFFERS", "A counterexample must follow a prefix of the same normalized operation graph.");
    }
  }
  const timeoutMs = input.timeoutMs ?? 10000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TraceCompilationError("COMPILER_LIMIT_INVALID", "Compilation timeout must be between 1 and 30000 ms.");
  const adapter = input.adapter ?? deterministicTraceAdapter;
  // A live adapter requires separate budget/usage handling and cannot claim this method's provenance.
  if (adapter.id !== deterministicTraceAdapter.id) throw new TraceCompilationError("ADAPTER_UNVERIFIED", "Only the deterministic development adapter is currently enabled.");
  const context: GenerationContext = {
    skillId: input.skillId, version: input.version ?? "0.1.0", traces,
    limits: { maxRows: 5000, maxRuntimeMs: 5000 }
  };
  const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  signal.throwIfAborted();
  let rejectOnAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = () => reject(signal.reason);
    signal.addEventListener("abort", rejectOnAbort, { once: true });
  });
  let draft: { skill: unknown; contract: unknown };
  try { draft = await Promise.race([adapter.generate(context, signal), abortPromise]); }
  finally { if (rejectOnAbort) signal.removeEventListener("abort", rejectOnAbort); }
  signal.throwIfAborted();
  const skill = SkillDefinitionSchema.parse(draft.skill);
  const contract = SkillContractSchema.parse(draft.contract);
  if (skill.id !== input.skillId || skill.version !== context.version) throw new TraceCompilationError("CANDIDATE_IDENTITY_CHANGED", "The adapter changed the requested candidate identity.");
  const compiled = compileCandidate(skill, contract, input.developmentCases);
  signal.throwIfAborted();
  compiled.verification.candidateOrigin = "deterministic_trace_assembly";
  const lineage: TraceLineage = {
    schemaVersion: "emberforge.lineage/1", method: "deterministic_trace_assembly", adapterId: adapter.id,
    generatedAt: new Date().toISOString(), compilerContextHash: canonicalHash(context),
    traces: traces.map((trace) => ({ traceId: trace.traceId, hash: canonicalHash(trace), outcome: trace.label.outcome, evidenceClass: trace.evidenceClass, inputHash: trace.inputHash })),
    operations: skill.ir.operations.map((operation) => ({ operationId: operation.id, traceIds: successful.map((trace) => trace.traceId) })),
    limitations: [
      "Assembly requires exact agreement between normalized successful operation graphs; it does not infer new algorithms or branches.",
      "Trace labels are supplied provenance assertions. Candidate correctness is checked separately on the finite independent development suite.",
      "Counterexamples are retained as lineage and are not promoted to successful examples. Hash-only imports require the original source snapshots for full replay.",
      "No Nemotron calls, token usage, live source reads, held-out results, or general workflow learning are claimed."
    ]
  };
  return { ...compiled, lineage, revisions: [{ revision: 1, status: compiled.verification.status, candidateHash: compiled.verification.candidateHash }] };
}
