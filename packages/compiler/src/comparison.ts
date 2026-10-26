import { z } from "zod";
import { reconcileStock, UnsupportedInputError } from "@emberforge/evaluator";
import { canonicalHash } from "./trace-compiler.js";
import { StockDatasetSchema, StockParametersSchema } from "@emberforge/contracts";

export const ComparisonCaseSchema = z.object({ caseId: z.string().regex(/^[a-z0-9-]{2,80}$/), provenance: z.enum(["synthetic_fixture", "user_sanitized"]), category: z.enum(["new_supported", "schema_drift", "stale_policy", "unknown_unit", "ambiguous_alias", "malformed_quantity", "duplicate_identity"]), parameters: z.unknown(), dataset: z.unknown() }).strict();
export const ComparisonInputsSchema = z.object({ policyVersion: z.string().min(1).default("stock-v1"), cases: z.array(ComparisonCaseSchema).min(7).max(200), compilationInputHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1), developmentInputHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1) }).strict();
export type Arm = "original_agent" | "instruction_skill" | "executable_skill" | "handwritten_script";
export interface ArmResult {
  outcome: "supported" | "unsupported" | "failed";
  records?: unknown;
  reason?: string;
  inputTokens: number | null;
  outputTokens: number | null;
  modelCalls: number | null;
  accountedCostUsd: number | null;
  hostInvocationMs: number | null;
  evidenceHash?: string;
}
export type ArmRunner = (input: { parameters: unknown; dataset: unknown }, signal: AbortSignal) => Promise<ArmResult>;
export function freezeComparison(input: unknown) {
  const parsed = ComparisonInputsSchema.parse(input);
  const categories = new Set(parsed.cases.map((item) => item.category));
  for (const category of ComparisonCaseSchema.shape.category.options) if (!categories.has(category)) throw new Error("MISSING_COMPARISON_CATEGORY:" + category);
  if (new Set(parsed.cases.map((item) => item.caseId)).size !== parsed.cases.length) throw new Error("DUPLICATE_CASE_ID");
  const blocked = new Set([...parsed.compilationInputHashes, ...parsed.developmentInputHashes]);
  const hashes = parsed.cases.map((item) => canonicalHash({ parameters: item.parameters, dataset: item.dataset }));
  if (new Set(hashes).size !== hashes.length || hashes.some((hash) => blocked.has(hash))) throw new Error("EVALUATION_INPUT_OVERLAP");
  const cases = parsed.cases.map((item, index) => {
    let expected: { outcome: "supported"; outputHash: string } | { outcome: "unsupported"; reason: string };
    try {
      if (!StockParametersSchema.safeParse(item.parameters).success) expected = { outcome: "unsupported", reason: "INPUT_PARAMETERS_INVALID" };
      else if (!StockDatasetSchema.safeParse(item.dataset).success) expected = { outcome: "unsupported", reason: "INPUT_DATASET_INVALID" };
      else if (StockParametersSchema.parse(item.parameters).policyVersion !== parsed.policyVersion) expected = { outcome: "unsupported", reason: "POLICY_VERSION_MISMATCH" };
      else expected = { outcome: "supported", outputHash: canonicalHash(reconcileStock(item.parameters as never, item.dataset as never).lines) };
    }
    catch (error) { expected = { outcome: "unsupported", reason: error instanceof UnsupportedInputError ? error.code : error instanceof z.ZodError ? "INPUT_CONTRACT_INVALID" : "REFERENCE_FAILED" }; if (expected.reason === "REFERENCE_FAILED") throw error; }
    return { ...item, inputHash: hashes[index]!, expected };
  });
  const payload = { schemaVersion: "emberforge.paired-protocol/1" as const, frozenAt: new Date().toISOString(), evaluator: "stock-reference/2", policyVersion: parsed.policyVersion, order: ["original_agent", "instruction_skill", "executable_skill", "handwritten_script"] as Arm[], repetitions: 3, timeoutMs: 120000, compilationInputHashes: parsed.compilationInputHashes, developmentInputHashes: parsed.developmentInputHashes, cases };
  return { ...payload, protocolHash: canonicalHash(payload) };
}
export type FrozenComparison = ReturnType<typeof freezeComparison>;
export function assertFrozenComparison(protocol: FrozenComparison) {
  const { protocolHash, ...payload } = protocol;
  if (canonicalHash(payload) !== protocolHash || payload.schemaVersion !== "emberforge.paired-protocol/1" || payload.repetitions !== 3 || payload.timeoutMs !== 120000 || canonicalHash(payload.order) !== canonicalHash(["original_agent", "instruction_skill", "executable_skill", "handwritten_script"])) throw new Error("PROTOCOL_CHANGED");
  const checked = freezeComparison({ policyVersion: payload.policyVersion, cases: payload.cases.map(({ expected: _, inputHash: _hash, ...item }) => item), compilationInputHashes: payload.compilationInputHashes, developmentInputHashes: payload.developmentInputHashes });
  if (canonicalHash(checked.cases) !== canonicalHash(payload.cases)) throw new Error("FROZEN_REFERENCE_CHANGED");
}
/** Labels stay in the controller; each runner receives only the identical input pair. No runner is invoked during preparation. */
export async function measurePairedComparison(protocol: FrozenComparison, runners: Record<Arm, ArmRunner>, options: {
  candidateHash: string; packageHash: string; candidateCreatedAt: string;
  originalConfigHash: string; instructionConfigHash: string; sameModelAndToolsHash: string;
  build: { elapsedMs: number; accountedCostUsd: number | null; inputTokens: number | null; outputTokens: number | null };
  signal?: AbortSignal;
  record: (measurement: unknown) => Promise<void>;
}) {
  assertFrozenComparison(protocol);
  if (!(Date.parse(protocol.frozenAt) < Date.parse(options.candidateCreatedAt))) throw new Error("PROTOCOL_NOT_FROZEN_BEFORE_CANDIDATE");
  const measurements = [];
  for (const [caseIndex, testCase] of protocol.cases.entries()) for (let repetition = 0; repetition < protocol.repetitions; repetition++) {
    // Rotate arm order deterministically to reduce systematic cache/order bias.
    const shift = (caseIndex + repetition) % protocol.order.length;
    const order = [...protocol.order.slice(shift), ...protocol.order.slice(0, shift)];
    for (const arm of order) {
      options.signal?.throwIfAborted();
      const started = performance.now();
      const timeout = AbortSignal.timeout(protocol.timeoutMs), signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      let result: ArmResult;
      let listener: (() => void) | undefined;
      try {
        const aborted = new Promise<never>((_, reject) => { listener = () => reject(signal.reason); signal.addEventListener("abort", listener, { once: true }); if (signal.aborted) listener(); });
        result = await Promise.race([runners[arm]({ parameters: structuredClone(testCase.parameters), dataset: structuredClone(testCase.dataset) }, signal), aborted]);
      } catch { result = { outcome: "failed", reason: signal.aborted ? "TIMEOUT_OR_CANCELLED" : "RUNNER_FAILED", inputTokens: null, outputTokens: null, modelCalls: null, accountedCostUsd: null, hostInvocationMs: null }; }
      finally { if (listener) signal.removeEventListener("abort", listener); }
      const expected = testCase.expected;
      const correct = expected.outcome === "supported" ? result.outcome === "supported" && canonicalHash(result.records ?? null) === expected.outputHash : result.outcome === "unsupported" && result.reason === expected.reason;
      const measurement = { protocolHash: protocol.protocolHash, candidateHash: options.candidateHash, packageHash: options.packageHash, caseId: testCase.caseId, inputHash: testCase.inputHash, category: testCase.category, provenance: testCase.provenance, arm, repetition: repetition + 1, latencyMs: performance.now() - started, result, correct, falseAcceptance: expected.outcome === "unsupported" && result.outcome === "supported", appropriateRefusal: expected.outcome === "unsupported" && correct };
      // Persist every outcome before starting another request. Reruns use a different output directory.
      await options.record(measurement); measurements.push(measurement);
      if (signal.aborted) throw new Error("COMPARISON_STOPPED_AFTER_TIMEOUT_OR_CANCEL");
    }
  }
  return { schemaVersion: "emberforge.paired-results/1", protocolHash: protocol.protocolHash, options: { ...options, signal: undefined, record: undefined }, measurements, limitation: "Accounted cost uses approved token rates; it is not an invoice. Host selection/transport overhead is separate and unknown unless recorded. A handwritten deterministic script is a capability/speed reference; no superiority over equivalent code is claimed. No break-even or savings claim is produced automatically." };
}
