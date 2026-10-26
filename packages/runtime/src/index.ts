import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import {
  SkillContractSchema,
  SkillDefinitionSchema,
  SkillIRSchema,
  SkillOperationSchema,
  StockDatasetSchema,
  StockParametersSchema,
  type SkillContract,
  type SkillDefinition,
  type SkillIR,
  type SkillOperation,
  type StockDataset,
  type StockParameters
} from "@emberforge/contracts";

type Row = Record<string, unknown>;
type SourceName = "orders" | "inventory" | "aliases" | "unitConversions";

export class SkillExecutionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SkillExecutionError";
    this.code = code;
  }
}

export interface SkillExecutionResult {
  records: Row[];
  metrics: {
    operationsExecuted: number;
    rowsByOperation: Record<string, number>;
    durationMs: number;
  };
}

export interface OperationObservation {
  operation: SkillOperation;
  inputHash: string;
  outputHash?: string;
  outcome: "succeeded" | "failed";
  errorCode?: string;
}

function observationHash(value: unknown): string {
  const normalize = (item: unknown): unknown => Array.isArray(item) ? item.map(normalize) :
    item !== null && typeof item === "object"
      ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize((item as Row)[key])]))
      : item;
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

export type ApplicabilityVerdict =
  | { supported: true }
  | { supported: false; reason: string };

function fail(code: string, message: string): never {
  throw new SkillExecutionError(code, message);
}

function asRow(value: unknown, context: string): Row {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("INVALID_ROW", context + " must be a record");
  }
  return value as Row;
}

function readField(row: Row, field: string, context: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(row, field)) {
    return fail("MISSING_FIELD", context + " has no field " + field);
  }
  return row[field];
}

function asRows(value: unknown, context: string): Row[] {
  if (!Array.isArray(value)) return fail("INVALID_ROWS", context + " must be an array");
  return value.map((row, index) => asRow(row, context + "[" + index + "]"));
}

function resolveOperand(
  operand: { kind: "literal"; value: string | number | boolean | null } | { kind: "parameter"; name: string },
  parameters: StockParameters
): unknown {
  if (operand.kind === "literal") return operand.value;
  if (!Object.prototype.hasOwnProperty.call(parameters, operand.name)) {
    return fail("UNKNOWN_PARAMETER", "No parameter named " + operand.name);
  }
  return parameters[operand.name as keyof StockParameters];
}

function compare(left: unknown, right: unknown, operator: string): boolean {
  if (operator === "eq") return Object.is(left, right);
  if (operator === "ne") return !Object.is(left, right);
  if (typeof left === "number" && typeof right === "number") {
    if (operator === "lt") return left < right;
    if (operator === "lte") return left <= right;
    if (operator === "gt") return left > right;
    if (operator === "gte") return left >= right;
  }
  if (typeof left === "string" && typeof right === "string") {
    if (operator === "lt") return left < right;
    if (operator === "lte") return left <= right;
    if (operator === "gt") return left > right;
    if (operator === "gte") return left >= right;
  }
  if (operator === "lt" || operator === "lte" || operator === "gt" || operator === "gte") {
    return fail("TYPE_MISMATCH", "Ordered comparison requires matching string or number values");
  }
  return fail("INVALID_OPERATOR", "Unsupported comparison operator " + operator);
}

function joinKey(values: unknown[], context: string): string {
  for (const value of values) {
    if (value === undefined || (typeof value === "object" && value !== null)) {
      return fail("INVALID_JOIN_KEY", context + " must contain only scalar values");
    }
  }
  return JSON.stringify(values);
}

function operationInputs(operation: SkillOperation): string[] {
  switch (operation.kind) {
    case "source_read":
      return [];
    case "join":
      return [operation.left, operation.right];
    case "lookup":
      return [operation.input, operation.table];
    case "filter":
    case "unit_convert":
    case "aggregate":
    case "project":
    case "compute":
    case "validate":
    case "emit":
      return [operation.input];
  }
}

export function validateSkillIR(irInput: unknown): SkillIR {
  const ir = SkillIRSchema.parse(irInput);
  const defined = new Set<string>();
  let emitCount = 0;

  for (let index = 0; index < ir.operations.length; index += 1) {
    const operation = ir.operations[index]!;
    if (defined.has(operation.id)) {
      fail("DUPLICATE_OPERATION_ID", "Duplicate operation id " + operation.id);
    }
    for (const input of operationInputs(operation)) {
      if (!defined.has(input)) {
        fail("INVALID_OPERATION_GRAPH", "Operation " + operation.id + " refers to unavailable step " + input);
      }
    }
    if (operation.kind === "filter") {
      for (const predicate of operation.predicates) {
        if (predicate.value.kind === "parameter" &&
          !["warehouseId", "fromDate", "throughDate", "policyVersion"].includes(predicate.value.name)) {
          fail("UNKNOWN_PARAMETER", "Filter refers to undeclared parameter " + predicate.value.name);
        }
      }
    }
    if (operation.kind === "lookup") {
      const tableStep = ir.operations.find((candidate) => candidate.id === operation.table);
      if (!tableStep || tableStep.kind !== "source_read") {
        fail("INVALID_LOOKUP_TABLE", "Lookup table must be a declared source-read step");
      }
      const expectedCode = tableStep.source === "aliases" ? "UNKNOWN_SKU_ALIAS" :
        tableStep.source === "unitConversions" ? "UNKNOWN_UNIT" : undefined;
      if (!expectedCode || operation.missingCode !== expectedCode) {
        fail("INVALID_LOOKUP_TABLE", "Lookup source and unsupported reason do not match");
      }
    }
    if (operation.kind === "emit") {
      emitCount += 1;
      if (index !== ir.operations.length - 1 || operation.id !== ir.outputStep) {
        fail("INVALID_OUTPUT_STEP", "The final operation must emit the declared output step");
      }
    }
    defined.add(operation.id);
  }

  if (emitCount !== 1 || !defined.has(ir.outputStep)) {
    fail("INVALID_OUTPUT_STEP", "IR must declare one final emit operation");
  }
  return ir;
}

function assertApplicable(
  contract: SkillContract,
  parameters: StockParameters,
  dataset: StockDataset
): void {
  if (!contract.supportedSourceModes.includes(dataset.sourceMode)) {
    fail("UNSUPPORTED_SOURCE_MODE", "This skill does not support source mode " + dataset.sourceMode);
  }
  if (parameters.policyVersion !== contract.policyVersion || dataset.productRules.version !== contract.policyVersion) {
    fail("POLICY_VERSION_MISMATCH", "The skill policy version does not match the requested data");
  }
  for (const source of ["orders", "inventory", "productRules"] as const) {
    if (dataset.sourceSchemaVersions[source] !== contract.sourceSchemaVersions[source]) {
      fail("SCHEMA_VERSION_MISMATCH", "Source schema changed for " + source);
    }
  }
  const rowCount = dataset.orders.length + dataset.inventory.length +
    dataset.productRules.aliases.length + dataset.productRules.unitConversions.length;
  if (rowCount > contract.maxRows) {
    fail("ROW_LIMIT_EXCEEDED", "Input exceeds the skill contract row limit");
  }
  const requireUnique = <T>(rows: T[], identity: (row: T) => string, code: string) => {
    const seen = new Set<string>();
    for (const row of rows) { const id = identity(row); if (seen.has(id)) fail(code, "Source identities must be unique."); seen.add(id); }
  };
  if (dataset.inventory.some((record) => record.snapshotDate > parameters.throughDate)) {
    fail("INVENTORY_SNAPSHOT_AFTER_RANGE", "Inventory snapshot is later than the requested end date");
  }
  requireUnique(dataset.productRules.aliases, (row) => row.alias, "DUPLICATE_SKU_ALIAS");
  requireUnique(dataset.productRules.unitConversions, (row) => row.unit, "DUPLICATE_UNIT_RULE");
  requireUnique(dataset.orders, (row) => row.orderId, "DUPLICATE_ORDER_ID");
  requireUnique(dataset.inventory, (row) => JSON.stringify([row.warehouseId, row.sku]), "DUPLICATE_INVENTORY_KEY");
}

export function assessApplicability(
  contractInput: unknown,
  parametersInput: unknown,
  datasetInput: unknown
): ApplicabilityVerdict {
  try {
    const contract = SkillContractSchema.parse(contractInput);
    const parameters = StockParametersSchema.parse(parametersInput);
    const dataset = StockDatasetSchema.parse(datasetInput);
    assertApplicable(contract, parameters, dataset);
    return { supported: true };
  } catch (error) {
    if (error instanceof SkillExecutionError) {
      return { supported: false, reason: error.code };
    }
    return { supported: false, reason: "INPUT_CONTRACT_INVALID" };
  }
}

function validateContractPostconditions(records: Row[], contract: SkillContract): void {
  for (const postcondition of contract.postconditions) {
    if (postcondition === "nonnegative-stock-fields") {
      for (const [index, row] of records.entries()) {
        for (const field of ["demandEach", "onHandEach", "shortageEach"]) {
          const value = readField(row, field, "emitted result row " + index);
          if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
            fail("POSTCONDITION_FAILED", field + " must be a nonnegative safe integer");
          }
        }
      }
    } else if (postcondition === "shortage-equals-demand-gap") {
      for (const [index, row] of records.entries()) {
        const demand = readField(row, "demandEach", "emitted result row " + index);
        const onHand = readField(row, "onHandEach", "emitted result row " + index);
        const shortage = readField(row, "shortageEach", "emitted result row " + index);
        if (typeof demand !== "number" || typeof onHand !== "number" ||
          typeof shortage !== "number" || shortage !== Math.max(demand - onHand, 0)) {
          fail("POSTCONDITION_FAILED", "shortageEach does not equal the demand gap");
        }
      }
    } else if (postcondition === "unique-sku-output") {
      const seen = new Set<string>();
      for (const [index, row] of records.entries()) {
        const sku = readField(row, "sku", "emitted result row " + index);
        if (typeof sku !== "string" || seen.has(sku)) {
          fail("POSTCONDITION_FAILED", "Output must contain one row per SKU");
        }
        seen.add(sku);
      }
    }
  }
}

function getSourceTables(dataset: StockDataset): Record<SourceName, Row[]> {
  return {
    orders: dataset.orders as unknown as Row[],
    inventory: dataset.inventory as unknown as Row[],
    aliases: dataset.productRules.aliases as unknown as Row[],
    unitConversions: dataset.productRules.unitConversions as unknown as Row[]
  };
}

function executeOperation(
  operation: SkillOperation,
  values: Map<string, Row[]>,
  sources: Record<SourceName, Row[]>,
  parameters: StockParameters,
  checkDeadline: () => void
): Row[] {
  if (operation.kind === "source_read") {
    return asRows(sources[operation.source], "source " + operation.source);
  }

  if (operation.kind === "filter") {
    const input = values.get(operation.input)!;
    return input.filter((row, index) => {
      if ((index & 127) === 0) checkDeadline();
      return operation.predicates.every((predicate) => compare(
        readField(row, predicate.field, operation.input),
        resolveOperand(predicate.value, parameters),
        predicate.operator
      ));
    });
  }

  if (operation.kind === "lookup") {
    const input = values.get(operation.input)!;
    const table = values.get(operation.table)!;
    const index = new Map<unknown, unknown>();
    for (const row of table) {
      checkDeadline();
      const keyValue = readField(row, operation.tableKeyField, operation.table);
      if (index.has(keyValue)) {
        return fail("DUPLICATE_LOOKUP_KEY", "Lookup table has duplicate key " + String(keyValue));
      }
      index.set(keyValue, readField(row, operation.valueField, operation.table));
    }
    return input.map((row, rowIndex) => {
      if ((rowIndex & 127) === 0) checkDeadline();
      const keyValue = readField(row, operation.keyField, operation.input);
      if (!index.has(keyValue)) {
        return fail(operation.missingCode, "Lookup has no match for " + String(keyValue));
      }
      return { ...row, [operation.outputField]: index.get(keyValue) };
    });
  }

  if (operation.kind === "unit_convert") {
    return values.get(operation.input)!.map((row, index) => {
      if ((index & 127) === 0) checkDeadline();
      const quantity = readField(row, operation.quantityField, operation.input);
      const factor = readField(row, operation.factorField, operation.input);
      if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) ||
        typeof factor !== "number" || !Number.isSafeInteger(factor) || factor <= 0) {
        return fail("INVALID_CONVERSION", "Quantity and unit factor must be positive safe integers");
      }
      const converted = quantity * factor;
      if (!Number.isSafeInteger(converted)) {
        return fail("QUANTITY_OVERFLOW", "Converted quantity exceeds safe integer range");
      }
      return { ...row, [operation.outputField]: converted };
    });
  }

  if (operation.kind === "aggregate") {
    const groups = new Map<string, { fields: unknown[]; sum: number }>();
    for (const [index, row] of values.get(operation.input)!.entries()) {
      if ((index & 127) === 0) checkDeadline();
      const fields = operation.groupBy.map((field) => readField(row, field, operation.input));
      const group = joinKey(fields, "aggregate group");
      const sum = readField(row, operation.sumField, operation.input);
      if (typeof sum !== "number" || !Number.isSafeInteger(sum) || sum < 0) {
        return fail("INVALID_AGGREGATE_VALUE", "Aggregate input must be a nonnegative safe integer");
      }
      const existing = groups.get(group);
      const nextSum = (existing?.sum ?? 0) + sum;
      if (!Number.isSafeInteger(nextSum)) {
        return fail("QUANTITY_OVERFLOW", "Aggregate exceeds safe integer range");
      }
      groups.set(group, { fields, sum: nextSum });
    }
    return [...groups.values()]
      .sort((left, right) => JSON.stringify(left.fields).localeCompare(JSON.stringify(right.fields)))
      .map((group) => {
        const row: Row = {};
        operation.groupBy.forEach((field, index) => { row[field] = group.fields[index]; });
        row[operation.outputField] = group.sum;
        return row;
      });
  }

  if (operation.kind === "project") {
    return values.get(operation.input)!.map((row, index) => {
      if ((index & 127) === 0) checkDeadline();
      const projected: Row = {};
      for (const field of operation.fields) {
        if (Object.prototype.hasOwnProperty.call(projected, field.to)) {
          return fail("DUPLICATE_PROJECT_FIELD", "Projection writes " + field.to + " more than once");
        }
        projected[field.to] = readField(row, field.from, operation.input);
      }
      return projected;
    });
  }

  if (operation.kind === "join") {
    const left = values.get(operation.left)!;
    const right = values.get(operation.right)!;
    const rightIndex = new Map<string, Row>();
    for (const [index, row] of right.entries()) {
      if ((index & 127) === 0) checkDeadline();
      const key = joinKey(operation.on.map((pair) => readField(row, pair.rightField, operation.right)), operation.right);
      if (rightIndex.has(key)) {
        return fail("DUPLICATE_JOIN_KEY", "Right side is not unique for " + operation.cardinality);
      }
      rightIndex.set(key, row);
    }
    const leftKeys = new Set<string>();
    return left.map((leftRow, index) => {
      if ((index & 127) === 0) checkDeadline();
      const key = joinKey(operation.on.map((pair) => readField(leftRow, pair.leftField, operation.left)), operation.left);
      if (operation.cardinality === "one_to_one" && leftKeys.has(key)) {
        return fail("DUPLICATE_JOIN_KEY", "Left side is not unique for one_to_one join");
      }
      leftKeys.add(key);
      const matched = rightIndex.get(key);
      if (!matched) {
        return fail(operation.missingCode, "Required join match is missing");
      }
      const joined = { ...leftRow };
      for (const field of operation.rightFields) {
        if (Object.prototype.hasOwnProperty.call(joined, field)) {
          return fail("JOIN_FIELD_COLLISION", "Joined field collides with left field " + field);
        }
        joined[field] = readField(matched, field, operation.right);
      }
      return joined;
    });
  }

  if (operation.kind === "compute") {
    return values.get(operation.input)!.map((row, index) => {
      if ((index & 127) === 0) checkDeadline();
      const left = readField(row, operation.leftField, operation.input);
      const right = readField(row, operation.rightField, operation.input);
      if (typeof left !== "number" || !Number.isSafeInteger(left) ||
        typeof right !== "number" || !Number.isSafeInteger(right)) {
        return fail("INVALID_COMPUTE_VALUE", "Subtraction inputs must be safe integers");
      }
      return { ...row, [operation.outputField]: Math.max(left - right, 0) };
    });
  }

  if (operation.kind === "validate") {
    const rows = values.get(operation.input)!;
    const seenByAssertion = new Map<string, Set<string>>();
    for (const assertion of operation.assertions) {
      if (assertion.check === "unique_by") seenByAssertion.set(assertion.fields.join("\u0000"), new Set());
    }
    for (const [index, row] of rows.entries()) {
      if ((index & 127) === 0) checkDeadline();
      for (const assertion of operation.assertions) {
        if (assertion.check === "required_field") {
          readField(row, assertion.field, operation.input);
        } else if (assertion.check === "nonnegative") {
          const value = readField(row, assertion.field, operation.input);
          if (typeof value !== "number" || value < 0) {
            return fail("POSTCONDITION_FAILED", assertion.field + " must be nonnegative");
          }
        } else {
          const identity = joinKey(assertion.fields.map((field) => readField(row, field, operation.input)), operation.input);
          const seen = seenByAssertion.get(assertion.fields.join("\u0000"))!;
          if (seen.has(identity)) {
            return fail("POSTCONDITION_FAILED", "Duplicate output identity");
          }
          seen.add(identity);
        }
      }
    }
    return rows;
  }

  if (operation.kind === "emit") return values.get(operation.input)!;
  return fail("UNSUPPORTED_OPERATION", "The trusted interpreter does not support this instruction");
}

/** Incremental trusted tool execution. No candidate/seed program is loaded here. */
export function createOperationSession(contractInput: unknown, parametersInput: unknown, datasetInput: unknown) {
  const contract = SkillContractSchema.parse(contractInput);
  const parameters = StockParametersSchema.parse(parametersInput);
  const dataset = StockDatasetSchema.parse(datasetInput);
  assertApplicable(contract, parameters, dataset);
  const sources = getSourceTables(dataset);
  const values = new Map<string, Row[]>();
  const operations: SkillOperation[] = [];
  const observations: OperationObservation[] = [];
  let closed = false;
  return {
    inspect(source: SourceName) {
      const rows = sources[source];
      return { source, rowCount: rows.length, fields: Object.keys(rows[0] ?? {}), schemaVersions: dataset.sourceSchemaVersions };
    },
    read(source: SourceName, offset: number, limit: number) {
      return { ...this.inspect(source), offset, rows: structuredClone(sources[source].slice(offset, offset + limit)) };
    },
    execute(operationInput: unknown) {
      if (closed) fail("SESSION_CLOSED", "Start a new attempt after emission or failure.");
      const operation = SkillOperationSchema.parse(operationInput);
      if (operations.length >= 63) fail("OPERATION_LIMIT", "The bounded session permits at most 63 operations.");
      if (operation.kind === "filter" && operation.predicates.some((p) => p.value.kind === "literal" && !(p.field === "status" && ["open", "cancelled"].includes(String(p.value.value))))) fail("UNPARAMETERIZED_FILTER", "Use caller parameters and declared status literals.");
      let placeholderId = "session_output";
      while ([...operations, operation].some((item) => item.id === placeholderId)) placeholderId += "_";
      validateSkillIR({ schemaVersion: "emberforge.ir/1", operations: [...operations, operation, ...(operation.kind === "emit" ? [] : [{ id: placeholderId, kind: "emit", input: operation.id }])], outputStep: operation.kind === "emit" ? operation.id : placeholderId, runtimeLimits: { maxRows: contract.maxRows, maxRuntimeMs: contract.maxRuntimeMs } });
      const dependencies = operation.kind === "source_read" ? sources[operation.source] : operation.kind === "join" ? [values.get(operation.left), values.get(operation.right)] : operation.kind === "lookup" ? [values.get(operation.input), values.get(operation.table)] : values.get(operation.input);
      const inputHash = observationHash({ operation, parameters, dependencies });
      const deadline = performance.now() + contract.maxRuntimeMs;
      const check = () => { if (performance.now() > deadline) fail("TIME_LIMIT_EXCEEDED", "Tool deadline exceeded."); };
      try {
        const rows = executeOperation(operation, values, sources, parameters, check);
        if (rows.length > contract.maxRows) fail("ROW_LIMIT_EXCEEDED", "Tool row limit exceeded.");
        if (operation.kind === "emit") { validateContractPostconditions(rows, contract); closed = true; }
        check();
        operations.push(operation); values.set(operation.id, rows);
        const event: OperationObservation = { operation, inputHash, outputHash: observationHash(rows), outcome: "succeeded" };
        observations.push(event);
        return { observation: structuredClone(event), rowCount: rows.length, preview: structuredClone(rows.slice(0, 20)), truncated: rows.length > 20 };
      } catch (error) {
        closed = true;
        observations.push({ operation, inputHash, outcome: "failed", errorCode: error instanceof SkillExecutionError ? error.code : "EXECUTION_ERROR" });
        throw error;
      }
    },
    observations: () => structuredClone(observations),
    result: () => closed && operations.at(-1)?.kind === "emit" ? structuredClone(values.get(operations.at(-1)!.id)) : undefined
  };
}

export function executeSkill(
  skillInput: unknown,
  contractInput: unknown,
  parametersInput: unknown,
  datasetInput: unknown,
  observe?: (event: OperationObservation) => void
): SkillExecutionResult {
  const skill: SkillDefinition = SkillDefinitionSchema.parse(skillInput);
  const contract = SkillContractSchema.parse(contractInput);
  const parameters = StockParametersSchema.parse(parametersInput);
  const dataset = StockDatasetSchema.parse(datasetInput);
  if (skill.id !== contract.skillId || skill.version !== contract.skillVersion ||
    skill.taskFamily !== contract.taskFamily) {
    return fail("SKILL_CONTRACT_MISMATCH", "Skill definition and input contract do not match");
  }
  const ir = validateSkillIR(skill.ir);
  if (ir.runtimeLimits.maxRows > contract.maxRows || ir.runtimeLimits.maxRuntimeMs > contract.maxRuntimeMs) {
    return fail("LIMIT_MISMATCH", "Skill IR requests limits above the contract");
  }
  assertApplicable(contract, parameters, dataset);

  const start = performance.now();
  const deadline = start + Math.min(ir.runtimeLimits.maxRuntimeMs, contract.maxRuntimeMs);
  const checkDeadline = () => {
    if (performance.now() > deadline) fail("TIME_LIMIT_EXCEEDED", "Skill execution exceeded its time budget");
  };
  const sourceTables = getSourceTables(dataset);
  const values = new Map<string, Row[]>();
  const rowsByOperation: Record<string, number> = {};

  for (const operation of ir.operations) {
    checkDeadline();
    const dependencies = operation.kind === "source_read" ? sourceTables[operation.source] :
      operation.kind === "join" ? [values.get(operation.left), values.get(operation.right)] :
      operation.kind === "lookup" ? [values.get(operation.input), values.get(operation.table)] : values.get(operation.input);
    const inputHash = observe ? observationHash({ operation, parameters, dependencies }) : "";
    let output: Row[];
    try {
      output = executeOperation(operation, values, sourceTables, parameters, checkDeadline);
      if (output.length > Math.min(ir.runtimeLimits.maxRows, contract.maxRows)) {
        fail("ROW_LIMIT_EXCEEDED", "Operation " + operation.id + " exceeded the row limit");
      }
      checkDeadline();
    } catch (error) {
      observe?.({ operation: structuredClone(operation), inputHash, outcome: "failed", errorCode: error instanceof SkillExecutionError ? error.code : "EXECUTION_ERROR" });
      throw error;
    }
    observe?.({ operation: structuredClone(operation), inputHash, outputHash: observationHash(output), outcome: "succeeded" });
    values.set(operation.id, output);
    rowsByOperation[operation.id] = output.length;
    checkDeadline();
  }

  const records = values.get(ir.outputStep)!;
  validateContractPostconditions(records, contract);
  return {
    records,
    metrics: {
      operationsExecuted: ir.operations.length,
      rowsByOperation,
      durationMs: performance.now() - start
    }
  };
}
