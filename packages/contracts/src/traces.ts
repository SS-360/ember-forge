import { z } from "zod";
import { formatVersionSchema } from "./format.js";
import { SkillOperationSchema, SourceModeSchema, StockDatasetSchema, StockParametersSchema } from "./index.js";

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const SourceSnapshotSchema = z.object({
  schemaVersion: formatVersionSchema("source-snapshot/1"), inputHash: HashSchema,
  parameters: StockParametersSchema, dataset: StockDatasetSchema
}).strict();
const VersionTagSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/);
const ReasonSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/);
const SourceVersionsSchema = z.object({
  orders: VersionTagSchema,
  inventory: VersionTagSchema,
  productRules: VersionTagSchema
}).strict();

/** Normalized tool arguments only. Raw rows, prompts, credentials and provider logs are excluded. */
export const SanitizedTraceSchema = z.object({
  schemaVersion: formatVersionSchema("trace/1"),
  traceId: z.string().uuid(),
  taskFamily: z.literal("stock-reconciliation"),
  evidenceClass: z.enum(["synthetic_fixture", "user_sanitized"]),
  recordingMethod: z.enum(["compiled_runtime_replay", "normalized_agent_tools"]),
  sourceCandidateHash: HashSchema.optional(),
  recordedAt: z.string().datetime(),
  sourceMode: SourceModeSchema,
  policyVersion: VersionTagSchema,
  sourceVersions: SourceVersionsSchema,
  sourceSchemaVersions: SourceVersionsSchema,
  inputHash: HashSchema,
  parameterNames: z.array(z.enum(["warehouseId", "fromDate", "throughDate", "policyVersion"])).min(1).max(4),
  calls: z.array(z.object({
    operation: SkillOperationSchema,
    inputHash: HashSchema,
    outputHash: HashSchema.optional(),
    outcome: z.enum(["succeeded", "failed"]),
    errorCode: ReasonSchema.optional()
  }).strict()).max(64),
  failureStage: z.literal("applicability").optional(),
  outputArtifactHash: HashSchema.optional(),
  label: z.object({
    authority: z.literal("independent_evaluator"),
    evaluatorVersion: VersionTagSchema,
    outcome: z.enum(["succeeded", "unsupported", "failed"]),
    reason: ReasonSchema.optional()
  }).strict(),
  redaction: z.object({
    profile: formatVersionSchema("redaction/1"),
    rawLogsIncluded: z.literal(false),
    rawInputValuesIncluded: z.literal(false),
    removedFieldCount: z.number().int().nonnegative()
  }).strict()
}).strict().superRefine((trace, context) => {
  if (trace.recordingMethod === "compiled_runtime_replay" && !trace.sourceCandidateHash) {
    context.addIssue({ code: "custom", path: ["sourceCandidateHash"], message: "Runtime replay must identify its source candidate." });
  }
  const ids = trace.calls.map((call) => call.operation.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["calls"], message: "Tool operation IDs must be unique." });
  }
  if (new Set(trace.parameterNames).size !== trace.parameterNames.length) {
    context.addIssue({ code: "custom", path: ["parameterNames"], message: "Parameter names must be unique." });
  }
  for (const [index, call] of trace.calls.entries()) {
    if (call.outcome === "failed" && (!call.errorCode || index !== trace.calls.length - 1)) {
      context.addIssue({ code: "custom", path: ["calls", index], message: "A failed call must be the final call and include an error code." });
    }
    if (call.outcome === "succeeded" && (!call.outputHash || call.errorCode)) {
      context.addIssue({ code: "custom", path: ["calls", index], message: "A successful call requires an output hash and cannot include an error code." });
    }
    // Task literals are deliberately narrow. Input-specific values must be parameter references.
    if (call.operation.kind === "filter") {
      for (const predicate of call.operation.predicates) {
        if (predicate.value.kind === "literal" &&
          !(predicate.field === "status" && ["open", "cancelled"].includes(String(predicate.value.value)))) {
          context.addIssue({ code: "custom", path: ["calls", index, "operation"], message: "Only open/cancelled status literals are allowed in sanitized traces; parameterize input values." });
        }
      }
    }
  }
  const finalCall = trace.calls.at(-1);
  if (!finalCall) {
    const applicabilityReasons = ["UNSUPPORTED_SOURCE_MODE", "POLICY_VERSION_MISMATCH", "SCHEMA_VERSION_MISMATCH", "ROW_LIMIT_EXCEEDED", "INVENTORY_SNAPSHOT_AFTER_RANGE", "DUPLICATE_SKU_ALIAS", "DUPLICATE_UNIT_RULE", "DUPLICATE_ORDER_ID", "DUPLICATE_INVENTORY_KEY"];
    if (trace.failureStage !== "applicability" || trace.label.outcome === "succeeded" || !trace.label.reason || !applicabilityReasons.includes(trace.label.reason) || trace.outputArtifactHash) context.addIssue({ code: "custom", path: ["calls"], message: "An empty recording requires an explicit applicability failure, a recognized rejection reason, and no output." });
    return;
  }
  if (trace.failureStage) context.addIssue({ code: "custom", path: ["failureStage"], message: "An applicability rejection cannot also claim executed tool calls." });
  if (trace.label.outcome === "succeeded") {
    if (!trace.outputArtifactHash || trace.outputArtifactHash !== finalCall.outputHash || trace.label.reason || trace.calls.some((call) => call.outcome !== "succeeded") || finalCall.operation.kind !== "emit") {
      context.addIssue({ code: "custom", path: ["label"], message: "A successful trace needs an emitted output hash and only successful calls." });
    }
  } else if (!trace.label.reason || finalCall.outcome !== "failed" || finalCall.errorCode !== trace.label.reason || trace.outputArtifactHash) {
    context.addIssue({ code: "custom", path: ["label"], message: "A counterexample must end in the independently labeled failure and cannot claim a successful output." });
  }
});
export type SanitizedTrace = z.infer<typeof SanitizedTraceSchema>;

export const TraceSetSchema = z.object({
  schemaVersion: formatVersionSchema("trace-set/1"),
  traces: z.array(SanitizedTraceSchema).min(1).max(32)
}).strict().superRefine((set, context) => {
  if (new Set(set.traces.map((trace) => trace.traceId)).size !== set.traces.length) {
    context.addIssue({ code: "custom", path: ["traces"], message: "Trace IDs must be unique within an import." });
  }
});
export type TraceSet = z.infer<typeof TraceSetSchema>;
