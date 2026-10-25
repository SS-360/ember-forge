import type { SkillOperation } from "./types.js";

export function describeOperation(operation: SkillOperation): { title: string; detail: string } {
  switch (operation.kind) {
    case "source_read": return { title: "Read " + operation.source, detail: "Read the approved " + operation.source + " table." };
    case "filter": return { title: "Filter rows", detail: operation.predicates.map((predicate) => {
      const operators = { eq: "=", ne: "≠", lt: "<", lte: "≤", gt: ">", gte: "≥" };
      const value = predicate.value.kind === "parameter" ? "$" + predicate.value.name : JSON.stringify(predicate.value.value);
      return predicate.field + " " + operators[predicate.operator] + " " + value;
    }).join("; ") };
    case "lookup": return { title: "Look up " + operation.outputField, detail: `${operation.keyField} → ${operation.table}.${operation.valueField}; missing values reject with ${operation.missingCode}.` };
    case "unit_convert": return { title: "Convert quantity", detail: `${operation.outputField} = ${operation.quantityField} × ${operation.factorField}.` };
    case "aggregate": return { title: "Aggregate " + operation.outputField, detail: `Sum ${operation.sumField} by ${operation.groupBy.join(", ")}.` };
    case "project": return { title: "Project fields", detail: operation.fields.map((field) => field.from === field.to ? field.from : field.from + " → " + field.to).join(", ") };
    case "join": return { title: "Join rows", detail: `${operation.left} ↔ ${operation.right} on ${operation.on.map((key) => key.leftField + " = " + key.rightField).join(", ")}; required ${operation.cardinality.replaceAll("_", " ")} matches.` };
    case "compute": return { title: "Calculate " + operation.outputField, detail: `${operation.outputField} = max(${operation.leftField} − ${operation.rightField}, 0).` };
    case "validate": return { title: "Validate rows", detail: operation.assertions.map((assertion) => assertion.check === "unique_by" ? "unique by " + assertion.fields.join(", ") : assertion.field + " " + assertion.check.replaceAll("_", " ")).join("; ") };
    case "emit": return { title: "Emit result", detail: "Return rows from " + operation.input + "." };
  }
}

export function rejectionExplanation(code?: string): string {
  const explanations: Record<string, string> = {
    UNKNOWN_UNIT: "An order uses a unit absent from the approved conversion table.",
    UNKNOWN_SKU_ALIAS: "A product alias has no approved canonical SKU mapping.",
    INVENTORY_NOT_FOUND: "A demanded product has no matching inventory record.",
    POLICY_VERSION_MISMATCH: "The requested policy differs from this skill's supported policy.",
    SCHEMA_VERSION_MISMATCH: "A source schema differs from this skill's supported schema.",
    INVENTORY_SNAPSHOT_AFTER_RANGE: "The inventory snapshot is later than the requested date range.",
    ROW_LIMIT_EXCEEDED: "The input exceeds the declared row limit.",
    POSTCONDITION_FAILED: "The result failed a required correctness check.",
    NO_VERIFIED_APPLICABLE_SKILL: "No verified skill in the library matches this task and input.",
    SKILL_ARTIFACT_HASH_MISMATCH: "The stored skill changed after verification and has been deprecated.",
    SKILL_ARTIFACT_UNAVAILABLE: "The verified skill files are unavailable.",
    DUPLICATE_ORDER_ID: "Two order rows share the same order ID.",
    DUPLICATE_INVENTORY_KEY: "Multiple inventory rows describe the same warehouse and product.",
    DUPLICATE_SKU_ALIAS: "A product alias appears more than once in the approved mapping.",
    DUPLICATE_UNIT_RULE: "A unit appears more than once in the conversion table.",
    QUANTITY_OVERFLOW: "A quantity or calculation exceeds the safe numeric range.",
    INPUT_CONTRACT_INVALID: "The input has an invalid field, quantity, or calendar date.",
    UNSUPPORTED_SOURCE_MODE: "This skill does not support the supplied source mode."
  };
  return code ? explanations[code] ?? "The input could not be handled within the declared contract." : "No rejection reason was recorded.";
}
