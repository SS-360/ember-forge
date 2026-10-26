import { z } from "zod";
import { formatVersionSchema } from "./format.js";
export { formatVersionSchema, type FormatVersion } from "./format.js";

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

const IsoDateSchema = z.string().refine(isRealIsoDate, "Expected a real ISO calendar date");

export const SourceModeSchema = z.enum(["fixture", "snapshot", "live"]);
export type SourceMode = z.infer<typeof SourceModeSchema>;

export const StockParametersSchema = z.object({
  warehouseId: z.string().trim().min(1),
  fromDate: IsoDateSchema,
  throughDate: IsoDateSchema,
  policyVersion: z.string().trim().min(1)
}).strict().refine((value) => value.fromDate <= value.throughDate, {
  message: "fromDate must be on or before throughDate"
});
export type StockParameters = z.infer<typeof StockParametersSchema>;

export const OrderRecordSchema = z.object({
  orderId: z.string().trim().min(1),
  warehouseId: z.string().trim().min(1),
  orderDate: IsoDateSchema,
  sku: z.string().trim().min(1),
  quantity: z.number().int().nonnegative().refine(Number.isSafeInteger, "Expected a safe integer"),
  unit: z.string().trim().min(1),
  status: z.enum(["open", "cancelled"])
}).strict();
export type OrderRecord = z.infer<typeof OrderRecordSchema>;

export const InventoryRecordSchema = z.object({
  warehouseId: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  snapshotDate: IsoDateSchema,
  onHandEach: z.number().int().nonnegative().refine(Number.isSafeInteger, "Expected a safe integer")
}).strict();
export type InventoryRecord = z.infer<typeof InventoryRecordSchema>;

export const ProductRulesSchema = z.object({
  version: z.string().trim().min(1),
  aliases: z.array(z.object({
    alias: z.string().trim().min(1),
    canonicalSku: z.string().trim().min(1)
  }).strict()),
  unitConversions: z.array(z.object({
    unit: z.string().trim().min(1),
    eachPerUnit: z.number().int().positive().refine(Number.isSafeInteger, "Expected a safe integer")
  }).strict())
}).strict();
export type ProductRules = z.infer<typeof ProductRulesSchema>;

export const StockDatasetSchema = z.object({
  sourceMode: SourceModeSchema,
  sourceVersions: z.object({
    orders: z.string().min(1),
    inventory: z.string().min(1),
    productRules: z.string().min(1)
  }).strict(),
  sourceSchemaVersions: z.object({
    orders: z.string().min(1),
    inventory: z.string().min(1),
    productRules: z.string().min(1)
  }).strict(),
  orders: z.array(OrderRecordSchema),
  inventory: z.array(InventoryRecordSchema),
  productRules: ProductRulesSchema
}).strict();
export type StockDataset = z.infer<typeof StockDatasetSchema>;

export const TaskRunRequestSchema = z.object({
  taskFamily: z.literal("stock-reconciliation"),
  parameters: StockParametersSchema,
  sourceMode: SourceModeSchema
}).strict();
export type TaskRunRequest = z.infer<typeof TaskRunRequestSchema>;

export const StockLineSchema = z.object({
  sku: z.string().min(1),
  demandEach: z.number().int().nonnegative().refine(Number.isSafeInteger, "Expected a safe integer"),
  onHandEach: z.number().int().nonnegative().refine(Number.isSafeInteger, "Expected a safe integer"),
  shortageEach: z.number().int().nonnegative().refine(Number.isSafeInteger, "Expected a safe integer")
}).strict();
export type StockLine = z.infer<typeof StockLineSchema>;

export const StockResultSchema = z.object({
  taskFamily: z.literal("stock-reconciliation"),
  parameters: StockParametersSchema,
  policyVersion: z.string().min(1),
  lines: z.array(StockLineSchema)
}).strict();
export type StockResult = z.infer<typeof StockResultSchema>;

export const TraceStepSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["source_read", "normalize", "join", "aggregate", "validate", "emit"]),
  source: z.string().optional(),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  outputHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationMs: z.number().nonnegative(),
  outcome: z.enum(["succeeded", "failed"]),
  errorCode: z.string().optional()
}).strict();
export type TraceStep = z.infer<typeof TraceStepSchema>;

export const TaskTraceSchema = z.object({
  runId: z.string().uuid(),
  taskFamily: z.literal("stock-reconciliation"),
  sourceMode: SourceModeSchema,
  executor: z.enum(["fixture_reference", "nemotron_agent", "compiled_skill"]),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  modelCallCount: z.number().int().nonnegative(),
  steps: z.array(TraceStepSchema),
  outcome: z.enum(["succeeded", "unsupported", "failed"]),
  resultHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  unsupportedReason: z.string().optional()
}).strict();
export type TaskTrace = z.infer<typeof TaskTraceSchema>;

const FieldNameSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/);
const OperationIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const PrimitiveValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const OperandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: PrimitiveValueSchema }).strict(),
  z.object({ kind: z.literal("parameter"), name: FieldNameSchema }).strict()
]);

const SourceReadOperationSchema = z.object({
  id: OperationIdSchema,
  kind: z.literal("source_read"),
  source: z.enum(["orders", "inventory", "aliases", "unitConversions"])
}).strict();

const FilterOperationSchema = z.object({
  id: OperationIdSchema,
  kind: z.literal("filter"),
  input: OperationIdSchema,
  predicates: z.array(z.object({
    field: FieldNameSchema,
    operator: z.enum(["eq", "ne", "lt", "lte", "gt", "gte"]),
    value: OperandSchema
  }).strict()).min(1).max(16)
}).strict();

const LookupOperationSchema = z.object({
  id: OperationIdSchema,
  kind: z.literal("lookup"),
  input: OperationIdSchema,
  table: OperationIdSchema,
  keyField: FieldNameSchema,
  tableKeyField: FieldNameSchema,
  valueField: FieldNameSchema,
  outputField: FieldNameSchema,
  missingCode: z.enum(["UNKNOWN_SKU_ALIAS", "UNKNOWN_UNIT"])
}).strict();

const UnitConvertOperationSchema = z.object({
  id: OperationIdSchema,
  kind: z.literal("unit_convert"),
  input: OperationIdSchema,
  quantityField: FieldNameSchema,
  factorField: FieldNameSchema,
  outputField: FieldNameSchema
}).strict();

const AggregateOperationSchema = z.object({
  id: OperationIdSchema,
  kind: z.literal("aggregate"),
  input: OperationIdSchema,
  groupBy: z.array(FieldNameSchema).min(1).max(8),
  sumField: FieldNameSchema,
  outputField: FieldNameSchema
}).strict();

const ProjectOperationSchema = z.object({
  id: OperationIdSchema,
  kind: z.literal("project"),
  input: OperationIdSchema,
  fields: z.array(z.object({
    from: FieldNameSchema,
    to: FieldNameSchema
  }).strict()).min(1).max(32)
}).strict();

const JoinOperationSchema = z.object({
  id: OperationIdSchema,
  kind: z.literal("join"),
  left: OperationIdSchema,
  right: OperationIdSchema,
  on: z.array(z.object({
    leftField: FieldNameSchema,
    rightField: FieldNameSchema
  }).strict()).min(1).max(8),
  how: z.literal("required"),
  cardinality: z.enum(["one_to_one", "many_to_one"]),
  missingCode: z.literal("INVENTORY_NOT_FOUND"),
  rightFields: z.array(FieldNameSchema).min(1).max(16)
}).strict();

const ComputeOperationSchema = z.object({
  id: OperationIdSchema,
  kind: z.literal("compute"),
  input: OperationIdSchema,
  formula: z.literal("subtract_floor_zero"),
  leftField: FieldNameSchema,
  rightField: FieldNameSchema,
  outputField: FieldNameSchema
}).strict();

const ValidateOperationSchema = z.object({
  id: OperationIdSchema,
  kind: z.literal("validate"),
  input: OperationIdSchema,
  assertions: z.array(z.discriminatedUnion("check", [
    z.object({ check: z.literal("required_field"), field: FieldNameSchema }).strict(),
    z.object({ check: z.literal("nonnegative"), field: FieldNameSchema }).strict(),
    z.object({ check: z.literal("unique_by"), fields: z.array(FieldNameSchema).min(1).max(8) }).strict()
  ])).min(1).max(32)
}).strict();

const EmitOperationSchema = z.object({
  id: OperationIdSchema,
  kind: z.literal("emit"),
  input: OperationIdSchema
}).strict();

export const SkillOperationSchema = z.discriminatedUnion("kind", [
  SourceReadOperationSchema,
  FilterOperationSchema,
  LookupOperationSchema,
  UnitConvertOperationSchema,
  AggregateOperationSchema,
  ProjectOperationSchema,
  JoinOperationSchema,
  ComputeOperationSchema,
  ValidateOperationSchema,
  EmitOperationSchema
]);
export type SkillOperation = z.infer<typeof SkillOperationSchema>;

export const SkillIRSchema = z.object({
  schemaVersion: formatVersionSchema("ir/1"),
  operations: z.array(SkillOperationSchema).min(1).max(64),
  outputStep: OperationIdSchema,
  runtimeLimits: z.object({
    maxRows: z.number().int().positive().max(50000),
    maxRuntimeMs: z.number().int().positive().max(30000)
  }).strict()
}).strict();
export type SkillIR = z.infer<typeof SkillIRSchema>;

export const SkillDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  taskFamily: z.literal("stock-reconciliation"),
  ir: SkillIRSchema
}).strict();
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

export const SkillContractSchema = z.object({
  skillId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  skillVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  contractVersion: formatVersionSchema("contract/1"),
  taskFamily: z.literal("stock-reconciliation"),
  policyVersion: z.string().min(1),
  sourceSchemaVersions: z.object({
    orders: z.string().min(1),
    inventory: z.string().min(1),
    productRules: z.string().min(1)
  }).strict(),
  supportedSourceModes: z.array(SourceModeSchema).min(1),
  maxRows: z.number().int().positive().max(50000),
  maxRuntimeMs: z.number().int().positive().max(30000),
  postconditions: z.array(z.enum([
    "nonnegative-stock-fields",
    "shortage-equals-demand-gap",
    "unique-sku-output"
  ])).min(1),
  assumptions: z.array(z.string().min(1)).min(1)
}).strict();
export type SkillContract = z.infer<typeof SkillContractSchema>;

