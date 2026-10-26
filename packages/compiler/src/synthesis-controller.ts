import { randomUUID } from "node:crypto";
import { setTimeout as waitForRetry } from "node:timers/promises";
import { SkillContractSchema, SkillDefinitionSchema, type SkillContract, type SkillDefinition, type SkillOperation } from "@emberforge/contracts";
import { SanitizedTraceSchema, type SanitizedTrace } from "@emberforge/contracts/traces";
import { validateSkillIR } from "@emberforge/runtime";
import { compileCandidate, type CompileCandidateResult, type VerificationCase } from "./index.js";
import { canonicalHash, TraceCompilationError, type TraceLineage } from "./trace-compiler.js";
import { ProviderAuthorizationSchema, assertAuthorizationCurrent, providerScopeKey, type ActiveProviderAuthorization } from "@emberforge/contracts/provider-authorization";

export interface SynthesisFeedback {
  stage: "static_validation" | "development_verification";
  issues: Array<{ caseId?: string; code: string; message: string }>;
}
export interface SynthesisContext {
  skillId: string;
  version: string;
  taskFamily: "stock-reconciliation";
  traces: readonly SanitizedTrace[];
  limits: { maxRows: number; maxRuntimeMs: number };
  revision: number;
  previousCandidate?: { skill: SkillDefinition; contract: SkillContract };
  feedback?: SynthesisFeedback;
}
export interface SynthesisUsage { inputTokens: number; outputTokens: number }
export interface SynthesisResponse {
  draft: unknown;
  usage: SynthesisUsage;
  requestId?: string;
}
export interface SynthesisAdapter {
  readonly id: string;
  readonly mode: "nemotron" | "test_only";
  readonly providerScope?: ActiveProviderAuthorization["scope"];
  readonly promptHash?: string;
  readonly configHash?: string;
  /** Must bound the complete serialized provider request, including tools/system text. */
  inputTokenUpperBound(context: SynthesisContext): number;
  generate(context: SynthesisContext, options: { signal: AbortSignal; maxOutputTokens: number }): Promise<SynthesisResponse>;
}
export class SynthesisProviderError extends Error {
  constructor(readonly code: string, message: string, readonly retryable: boolean, readonly usage?: SynthesisUsage, readonly requestId?: string) { super(message); this.name = "SynthesisProviderError"; }
}
export interface SynthesisPolicy {
  authorization?: ActiveProviderAuthorization;
  maxRevisions: number;
  maxProviderCalls: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxTotalTokens: number;
  timeoutMs: number;
  perCallTimeoutMs: number;
  maxCompilationCostUsd: number;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}
export interface CostReservation { id: string; reservedUsd: number }
/** A caller can supply a persistent session ledger. Reservations remain charged until atomically settled. A failed settlement must not partially mutate the ledger. */
export interface SynthesisCostLedger {
  readonly persistent?: true;
  reserve(usd: number, quota?: { tokens: number; runId?: string; call?: number }): CostReservation;
  settle(reservation: CostReservation, actualUsd: number, usage?: { tokens: number }): void;
  suspend?(reason: string): void;
}
export class InMemoryCostLedger implements SynthesisCostLedger {
  private charged = 0;
  private pending = new Map<string, number>();
  constructor(readonly approvedCeilingUsd: number) {}
  reserve(usd: number): CostReservation {
    if (!Number.isFinite(usd) || usd < 0 || this.charged + usd > this.approvedCeilingUsd + 1e-10) throw new TraceCompilationError("SESSION_BUDGET_EXHAUSTED", "The approved session budget cannot cover this request reservation.");
    const reservation = { id: randomUUID(), reservedUsd: usd };
    this.pending.set(reservation.id, usd); this.charged += usd;
    return reservation;
  }
  settle(reservation: CostReservation, actualUsd: number): void {
    const reserved = this.pending.get(reservation.id);
    if (reserved === undefined || !Number.isFinite(actualUsd) || actualUsd < 0) throw new Error("Invalid cost reservation settlement.");
    this.charged += actualUsd - reserved; this.pending.delete(reservation.id);
  }
  snapshot() { return { chargedUsd: this.charged, pendingReservationCount: this.pending.size }; }
}
export interface SynthesisAttempt {
  call: number;
  revision: number;
  contextHash: string;
  outcome: "response" | "provider_error";
  requestId?: string;
  code?: string;
  usage?: SynthesisUsage;
  reservedUsd: number;
  accountedUsd: number;
  usageUncertain: boolean;
}
export interface SynthesisRevision {
  revision: number;
  status: "validated" | "rejected" | "static_invalid";
  candidateHash?: string;
  feedback?: SynthesisFeedback;
  candidate?: CompileCandidateResult;
}
export interface SynthesisResult {
  runId: string;
  state: "validated" | "rejected" | "failed" | "cancelled" | "budget_exhausted";
  candidate?: CompileCandidateResult;
  revisions: SynthesisRevision[];
  attempts: SynthesisAttempt[];
  lineage: TraceLineage;
  usage: SynthesisUsage & { providerCalls: number; accountedUsd: number; uncertainUsageCalls: number; basis: "provider_response" | "test_fixture" };
  durationMs: number;
  failure?: { code: string; message: string };
}
export interface SynthesisProgressEvent {
  stage: string; revision?: number; call?: number;
  checkpoint: Pick<SynthesisResult, "attempts" | "revisions" | "usage">;
}

export function validatePolicy(policy: SynthesisPolicy, adapter: Pick<SynthesisAdapter, "mode" | "providerScope">): void {
  const bounded = (value: number, minimum: number, maximum: number) => Number.isInteger(value) && value >= minimum && value <= maximum;
  if (!bounded(policy.maxRevisions, 1, 3) || !bounded(policy.maxProviderCalls, 1, 12) ||
    !bounded(policy.maxInputTokens, 1, 256000) || !bounded(policy.maxOutputTokens, 1, 16384) ||
    !bounded(policy.maxTotalTokens, 1, 1000000) || !bounded(policy.timeoutMs, 1, 300000) || !bounded(policy.perCallTimeoutMs, 1, 90000) ||
    ![policy.maxCompilationCostUsd, policy.inputUsdPerMillionTokens, policy.outputUsdPerMillionTokens].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new TraceCompilationError("SYNTHESIS_POLICY_INVALID", "Configure bounded revisions, calls, tokens, deadlines, token rates and an approved cost ceiling.");
  }
  if (adapter.mode === "nemotron") {
    const authorization = ProviderAuthorizationSchema.parse(policy.authorization);
    if (authorization.mode === "disabled" || !adapter.providerScope || providerScopeKey(authorization.scope) !== providerScopeKey(adapter.providerScope)) throw new TraceCompilationError("PROVIDER_AUTHORIZATION_REQUIRED", "The server needs current authorization for this exact endpoint, account and model.");
    assertAuthorizationCurrent(authorization);
    if (policy.maxCompilationCostUsd > authorization.maxSessionCostUsd || policy.inputUsdPerMillionTokens !== authorization.inputUsdPerMillionTokens || policy.outputUsdPerMillionTokens !== authorization.outputUsdPerMillionTokens || policy.maxProviderCalls > authorization.allowance.maxRequests || policy.maxTotalTokens > authorization.allowance.maxTokens) throw new TraceCompilationError("PROVIDER_ALLOWANCE_EXCEEDED", "Compilation limits and prices must fit the server-owned authorization.");
  }
}
function usageCost(usage: SynthesisUsage, policy: SynthesisPolicy): number {
  return (usage.inputTokens * policy.inputUsdPerMillionTokens + usage.outputTokens * policy.outputUsdPerMillionTokens) / 1000000;
}
function validUsage(usage: SynthesisUsage): boolean {
  return Number.isSafeInteger(usage.inputTokens) && usage.inputTokens >= 0 && Number.isSafeInteger(usage.outputTokens) && usage.outputTokens >= 0;
}
function assertInventoryIsScopedBeforeJoin(skill: SkillDefinition): void {
  const operations = new Map(skill.ir.operations.map((operation) => [operation.id, operation]));
  const dependencies = (operation: SkillOperation): string[] => {
    if (operation.kind === "source_read") return [];
    if (operation.kind === "join") return [operation.left, operation.right];
    if (operation.kind === "lookup") return [operation.input, operation.table];
    return [operation.input];
  };
  const inventoryPaths = (id: string, alreadyScoped: boolean, visited = new Set<string>()): { hasInventory: boolean; allScoped: boolean } => {
    if (visited.has(id)) return { hasInventory: false, allScoped: true };
    const operation = operations.get(id);
    if (!operation) return { hasInventory: false, allScoped: true };
    if (operation.kind === "source_read") return { hasInventory: operation.source === "inventory", allScoped: operation.source !== "inventory" || alreadyScoped };
    const scoped = alreadyScoped || (operation.kind === "filter" && operation.predicates.some((predicate) =>
      predicate.field === "warehouseId" && predicate.operator === "eq" && predicate.value.kind === "parameter" && predicate.value.name === "warehouseId"));
    const nextVisited = new Set(visited).add(id);
    const branches = dependencies(operation).map((dependency) => inventoryPaths(dependency, scoped, nextVisited));
    const inventoryBranches = branches.filter((branch) => branch.hasInventory);
    return { hasInventory: inventoryBranches.length > 0, allScoped: inventoryBranches.every((branch) => branch.allScoped) };
  };
  for (const operation of skill.ir.operations) if (operation.kind === "join") {
    for (const branch of [operation.left, operation.right]) {
      const result = inventoryPaths(branch, false);
      if (result.hasInventory && !result.allScoped) {
        throw new Error("Filter inventory by the caller's warehouseId parameter before the inventory join; SKU keys repeat across warehouses.");
      }
    }
  }
}
async function cancellable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener("abort", onAbort, { once: true }); });
  try { return await Promise.race([task, aborted]); }
  finally { if (onAbort) signal.removeEventListener("abort", onAbort); }
}
function validateDraft(draft: unknown, context: SynthesisContext): { skill: SkillDefinition; contract: SkillContract } {
  if (!draft || typeof draft !== "object" || !Object.hasOwn(draft, "skill") || !Object.hasOwn(draft, "contract") || Object.keys(draft).some((key) => !["skill", "contract"].includes(key)) || JSON.stringify(draft).length > 150000) throw new Error("Return only one bounded skill and contract object.");
  const skill = SkillDefinitionSchema.parse((draft as { skill: unknown }).skill);
  const contract = SkillContractSchema.parse((draft as { contract: unknown }).contract);
  const reference = context.traces.find((trace) => trace.label.outcome === "succeeded")!;
  if (skill.id !== context.skillId || skill.version !== context.version || contract.skillId !== skill.id || contract.skillVersion !== skill.version) throw new Error("Candidate identity must match the requested skill and version.");
  if (contract.policyVersion !== reference.policyVersion || canonicalHash(contract.sourceSchemaVersions) !== canonicalHash(reference.sourceSchemaVersions) || contract.supportedSourceModes.length !== 1 || contract.supportedSourceModes[0] !== reference.sourceMode) throw new Error("The candidate cannot broaden the observed source/schema/policy boundary.");
  if (contract.maxRows > context.limits.maxRows || contract.maxRuntimeMs > context.limits.maxRuntimeMs || skill.ir.runtimeLimits.maxRows > contract.maxRows || skill.ir.runtimeLimits.maxRuntimeMs > contract.maxRuntimeMs) throw new Error("The candidate exceeds the declared trusted runtime limits.");
  for (const required of ["nonnegative-stock-fields", "shortage-equals-demand-gap", "unique-sku-output"] as const) if (!contract.postconditions.includes(required)) throw new Error("Keep all required stock result postconditions.");
  for (const operation of skill.ir.operations) if (operation.kind === "filter") {
    for (const predicate of operation.predicates) if (predicate.value.kind === "literal" && !(predicate.field === "status" && ["open", "cancelled"].includes(String(predicate.value.value)))) throw new Error("Input-specific filter values must be caller parameters; only task status literals are permitted.");
  }
  assertInventoryIsScopedBeforeJoin(skill);
  validateSkillIR(skill.ir);
  return { skill, contract };
}

export async function synthesizeCandidate(input: {
  skillId: string; version?: string; runId?: string; traces: readonly unknown[];
  developmentCases: readonly VerificationCase[];
  adapter: SynthesisAdapter; policy: SynthesisPolicy; signal?: AbortSignal;
  ledger?: SynthesisCostLedger;
  onEvent?: (event: SynthesisProgressEvent) => void;
}): Promise<SynthesisResult> {
  validatePolicy(input.policy, input.adapter);
  if (input.adapter.mode === "nemotron" && input.ledger?.persistent !== true) throw new TraceCompilationError("PERSISTENT_LEDGER_REQUIRED", "Provider execution requires a persistent session ledger.");
  const traces = input.traces.map((trace) => SanitizedTraceSchema.parse(trace));
  const successful = traces.filter((trace) => trace.label.outcome === "succeeded");
  if (traces.length > 32 || new Set(traces.map((trace) => trace.traceId)).size !== traces.length || successful.length < 2 || successful.length === traces.length || new Set(successful.map((trace) => trace.inputHash)).size < 2) throw new TraceCompilationError("INSUFFICIENT_EVIDENCE", "Use distinct labeled trajectories with two successful inputs and a counterexample.");
  const reference = successful[0]!;
  if (traces.some((trace) => trace.sourceMode !== reference.sourceMode || trace.policyVersion !== reference.policyVersion || canonicalHash(trace.sourceSchemaVersions) !== canonicalHash(reference.sourceSchemaVersions))) throw new TraceCompilationError("TRACE_CONTRACT_DIFFERS", "Keep one source/schema/policy boundary per compilation.");
  if (!["fixture", "snapshot"].includes(reference.sourceMode)) throw new TraceCompilationError("SOURCE_MODE_UNVERIFIED", "Generate a procedure for fixtures or captured source snapshots; direct live-source execution is not enabled.");
  const compilationInputHashes = new Set(traces.map((trace) => trace.inputHash));
  if (input.developmentCases.some((testCase) => compilationInputHashes.has(canonicalHash({ parameters: testCase.parameters, dataset: testCase.dataset })))) throw new TraceCompilationError("EVALUATION_INPUT_OVERLAP", "Compilation traces and independent development inputs must have different hashes.");
  const started = performance.now();
  const deadline = started + input.policy.timeoutMs;
  const overall = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(input.policy.timeoutMs)]) : AbortSignal.timeout(input.policy.timeoutMs);
  const origin = input.adapter.mode === "nemotron" ? "nemotron_synthesis" : "test_synthesis";
  const base: SynthesisContext = { skillId: input.skillId, version: input.version ?? "0.1.0", taskFamily: "stock-reconciliation", traces, limits: { maxRows: 5000, maxRuntimeMs: 5000 }, revision: 1 };
  const result: SynthesisResult = {
    runId: input.runId ?? randomUUID(), state: "rejected", revisions: [], attempts: [],
    lineage: {
      schemaVersion: "emberforge.lineage/1", method: origin, adapterId: input.adapter.id, generatedAt: new Date().toISOString(), compilerContextHash: canonicalHash(base),
      traces: traces.map((trace) => ({ traceId: trace.traceId, hash: canonicalHash(trace), outcome: trace.label.outcome, evidenceClass: trace.evidenceClass, inputHash: trace.inputHash })), operations: [],
      limitations: [input.adapter.mode === "test_only" ? "Test-only transport evidence: no model-generated learning or provider access is established." : "Provider-generated candidate checked on independent development cases; held-out evaluation is a separate gate.", "Compiler context excludes evaluator code, development inputs/answers and held-out data. Repair feedback contains development verdicts only.", "Configured token prices are cost accounting assumptions, not a measured provider invoice. Unknown usage keeps its full request reservation charged."]
    },
    usage: { inputTokens: 0, outputTokens: 0, providerCalls: 0, accountedUsd: 0, uncertainUsageCalls: 0, basis: input.adapter.mode === "nemotron" ? "provider_response" : "test_fixture" }, durationMs: 0
  };
  if (input.adapter.promptHash) result.lineage.limitations.push("Synthesis system prompt SHA-256: " + input.adapter.promptHash);
  if (input.adapter.configHash) result.lineage.limitations.push("Synthesis model/tool/configuration SHA-256: " + input.adapter.configHash);
  const ledger: SynthesisCostLedger = input.ledger ?? new InMemoryCostLedger(input.policy.maxCompilationCostUsd);
  const publish = (event: { stage: string; revision?: number; call?: number }) => input.onEvent?.({ ...event, checkpoint: structuredClone({ attempts: result.attempts, revisions: result.revisions, usage: result.usage }) });
  const fail = (state: SynthesisResult["state"], code: string, message: string) => { result.state = state; result.failure = { code, message }; };
  let context = base;
  try {
    for (let revision = 1; revision <= input.policy.maxRevisions; revision++) {
      overall.throwIfAborted(); context = { ...context, revision };
      let response: SynthesisResponse | undefined;
      while (!response && result.usage.providerCalls < input.policy.maxProviderCalls) {
        overall.throwIfAborted();
        const inputBound = input.adapter.inputTokenUpperBound(context);
        if (!Number.isSafeInteger(inputBound) || inputBound <= 0 || inputBound > input.policy.maxInputTokens) { fail("failed", "CONTEXT_TOKEN_LIMIT", "The complete provider request exceeds the approved input token bound."); return result; }
        const reservationUsage = { inputTokens: inputBound, outputTokens: input.policy.maxOutputTokens };
        if (result.usage.inputTokens + result.usage.outputTokens + inputBound + input.policy.maxOutputTokens > input.policy.maxTotalTokens) { fail("budget_exhausted", "TOKEN_BUDGET_EXHAUSTED", "The next request cannot fit within the total token budget."); return result; }
        const reservedUsd = usageCost(reservationUsage, input.policy);
        if (result.usage.accountedUsd + reservedUsd > input.policy.maxCompilationCostUsd + 1e-10) { fail("budget_exhausted", "COMPILATION_BUDGET_EXHAUSTED", "The next request cannot fit within the approved compilation cost ceiling."); return result; }
        let reservation: CostReservation;
        try {
          if (input.policy.authorization) assertAuthorizationCurrent(input.policy.authorization);
          reservation = ledger.reserve(reservedUsd, { tokens: inputBound + input.policy.maxOutputTokens, runId: result.runId, call: result.usage.providerCalls + 1 });
        }
        catch (error) {
          const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : error instanceof Error && error.message === "PROVIDER_AUTHORIZATION_EXPIRED" ? error.message : "COST_LEDGER_FAILED";
          const exhausted = ["SESSION_BUDGET_EXHAUSTED", "PROVIDER_REQUEST_ALLOWANCE_EXHAUSTED", "PROVIDER_TOKEN_ALLOWANCE_EXHAUSTED"].includes(code);
          fail(exhausted ? "budget_exhausted" : "failed", exhausted || ["PROVIDER_ALLOWANCE_SUSPENDED", "PROVIDER_AUTHORIZATION_EXPIRED"].includes(code) ? code : "COST_LEDGER_FAILED", "The server-owned request, token, time or spending allowance cannot authorize another request.");
          return result;
        }
        const call = ++result.usage.providerCalls;
        const signal = AbortSignal.any([overall, AbortSignal.timeout(input.policy.perCallTimeoutMs)]);
        publish({ stage: "provider_request", revision, call });
        let usageAccounted = false;
        try {
          const received = await cancellable<SynthesisResponse>(Promise.resolve().then(() => input.adapter.generate(structuredClone(context), { signal, maxOutputTokens: input.policy.maxOutputTokens })), signal);
          if (!received.usage || !validUsage(received.usage)) throw new SynthesisProviderError("USAGE_MISSING", "The provider response did not include valid token usage.", false);
          if (received.usage.inputTokens > inputBound || received.usage.outputTokens > input.policy.maxOutputTokens) ledger.suspend?.("PROVIDER_USAGE_EXCEEDED_RESERVATION");
          let accountedUsd = usageCost(received.usage, input.policy);
          let settlementFailed = false;
          try { ledger.settle(reservation, accountedUsd, { tokens: received.usage.inputTokens + received.usage.outputTokens }); }
          catch {
            settlementFailed = true; accountedUsd = Math.max(reservedUsd, accountedUsd);
            try { ledger.suspend?.("ACCOUNTING_SETTLEMENT_FAILED"); } catch { /* No further transport is allowed in this compilation. */ }
          }
          result.usage.inputTokens += received.usage.inputTokens; result.usage.outputTokens += received.usage.outputTokens; result.usage.accountedUsd += accountedUsd;
          result.attempts.push({ call, revision, contextHash: canonicalHash(context), outcome: "response", ...(received.requestId ? { requestId: received.requestId } : {}), usage: received.usage, reservedUsd, accountedUsd, usageUncertain: false });
          usageAccounted = true;
          publish({ stage: "provider_response", revision, call });
          if (settlementFailed) { fail("failed", "COST_LEDGER_FAILED", "Usage was received but its session reservation could not be settled. Further generation is stopped."); return result; }
          if (received.usage.inputTokens > inputBound || received.usage.outputTokens > input.policy.maxOutputTokens || result.usage.accountedUsd > input.policy.maxCompilationCostUsd + 1e-10) { fail("failed", "PROVIDER_USAGE_EXCEEDED_LIMIT", "Reported usage exceeded the request reservation; further generation is stopped."); return result; }
          response = received;
          if (performance.now() > deadline) { fail("cancelled", "COMPILATION_DEADLINE", "Generation exceeded its overall wall-clock deadline."); return result; }
        } catch (error) {
          if (usageAccounted) throw error; // A checkpoint failure cannot charge an already accounted response again.
          const usage = error instanceof SynthesisProviderError && error.usage && validUsage(error.usage) ? error.usage : undefined;
          let accountedUsd = usage ? usageCost(usage, input.policy) : reservedUsd;
          let settlementFailed = false;
          if (usage) {
            try { ledger.settle(reservation, accountedUsd, { tokens: usage.inputTokens + usage.outputTokens }); }
            catch {
              settlementFailed = true; accountedUsd = Math.max(reservedUsd, accountedUsd);
              try { ledger.suspend?.("ACCOUNTING_SETTLEMENT_FAILED"); } catch { /* No further transport is allowed in this compilation. */ }
            }
          }
          result.usage.inputTokens += usage?.inputTokens ?? inputBound; result.usage.outputTokens += usage?.outputTokens ?? input.policy.maxOutputTokens; result.usage.accountedUsd += accountedUsd;
          if (!usage) result.usage.uncertainUsageCalls++;
          const code = error instanceof SynthesisProviderError ? error.code : input.signal?.aborted ? "PROVIDER_CANCELLED" : overall.aborted ? "COMPILATION_DEADLINE" : signal.aborted ? "PROVIDER_CALL_TIMEOUT" : "PROVIDER_TRANSPORT_FAILED";
          result.attempts.push({ call, revision, contextHash: canonicalHash(context), outcome: "provider_error", code, ...(error instanceof SynthesisProviderError && error.requestId ? { requestId: error.requestId } : {}), ...(usage ? { usage } : {}), reservedUsd, accountedUsd, usageUncertain: !usage });
          publish({ stage: "provider_error", revision, call });
          response = undefined;
          if (settlementFailed) { fail("failed", "COST_LEDGER_FAILED", "The failed request's cost reservation could not be settled. Further generation is stopped."); return result; }
          if (overall.aborted) { fail("cancelled", "COMPILATION_CANCELLED", "Generation was cancelled or reached its overall deadline."); return result; }
          if (!(error instanceof SynthesisProviderError) || !error.retryable || call >= input.policy.maxProviderCalls) { fail("failed", code, "The generation provider could not complete a bounded request. Review the recorded attempt and provider configuration."); return result; }
          if (input.adapter.mode === "nemotron") await waitForRetry(Math.min(250 * 2 ** (call - 1), 2000), undefined, { signal: overall });
        }
      }
      if (!response) { fail("failed", "PROVIDER_CALL_LIMIT", "The bounded provider-call limit was reached."); return result; }
      let candidate: CompileCandidateResult;
      try {
        const draft = validateDraft(response.draft, context);
        publish({ stage: "development_verification", revision });
        candidate = compileCandidate(draft.skill, draft.contract, input.developmentCases);
        overall.throwIfAborted();
        candidate.verification.candidateOrigin = origin;
        if (performance.now() > deadline) { fail("cancelled", "COMPILATION_DEADLINE", "Development verification exceeded the compilation deadline."); return result; }
        if (candidate.verification.cases.some((item) => item.actualOutcome === "reference_mismatch")) { fail("failed", "EVALUATOR_LABEL_MISMATCH", "A development label disagrees with the independent reference; repair the evaluation data before generation."); return result; }
      } catch (error) {
        const feedback: SynthesisFeedback = { stage: "static_validation", issues: [{ code: "INVALID_CANDIDATE", message: error instanceof Error ? error.message.slice(0, 1500) : "Candidate failed static validation." }] };
        if (overall.aborted) throw error;
        result.revisions.push({ revision, status: "static_invalid", feedback }); context = { ...context, feedback };
        publish({ stage: "revision_invalid", revision }); continue;
      }
      result.candidate = candidate;
      if (candidate.exportable) {
        result.state = "validated"; result.revisions.push({ revision, status: "validated", candidateHash: candidate.verification.candidateHash, candidate });
        result.lineage.operations = candidate.skill.ir.operations.map((operation) => ({ operationId: operation.id, traceIds: successful.filter((trace) => trace.calls.some((call) => canonicalHash(call.operation) === canonicalHash(operation))).map((trace) => trace.traceId) }));
        publish({ stage: "validated", revision }); return result;
      }
      const feedback: SynthesisFeedback = { stage: "development_verification", issues: candidate.verification.cases.filter((item) => !item.passed).map((item) => ({ caseId: item.caseId, code: item.actualReason ?? "OUTPUT_MISMATCH", message: "The candidate did not satisfy this independent development check." })) };
      result.revisions.push({ revision, status: "rejected", candidateHash: candidate.verification.candidateHash, feedback, candidate });
      context = { ...context, previousCandidate: { skill: candidate.skill, contract: candidate.contract }, feedback };
      publish({ stage: "revision_rejected", revision });
    }
    fail("rejected", "REVISION_LIMIT", "No candidate passed within the bounded revision limit."); return result;
  } catch (error) {
    if (overall.aborted) fail("cancelled", "COMPILATION_CANCELLED", "Generation was cancelled or reached its overall deadline.");
    else fail("failed", error instanceof TraceCompilationError ? error.code : "SYNTHESIS_FAILED", "The bounded generation controller could not complete this compilation.");
    return result;
  } finally { result.durationMs = performance.now() - started; }
}
