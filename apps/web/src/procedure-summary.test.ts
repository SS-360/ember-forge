import { describe, expect, it } from "vitest";
import { describeOperation, rejectionExplanation } from "./procedure-summary.js";
import type { SkillOperation } from "./types.js";

describe("procedure descriptions follow typed semantics", () => {
  it("shows changed filter arguments even when an old operation ID is retained", () => {
    const operation: SkillOperation = { id: "filter_orders", kind: "filter", input: "read_orders", predicates: [
      { field: "status", operator: "eq", value: { kind: "literal", value: "cancelled" } },
      { field: "orderDate", operator: "lt", value: { kind: "parameter", name: "fromDate" } }
    ] };
    expect(describeOperation(operation).detail).toContain('status = "cancelled"');
    expect(describeOperation(operation).detail).toContain("orderDate < $fromDate");
    expect(describeOperation(operation).detail).not.toContain("open");
  });
  it("handles renamed, reordered, or omitted operations without inventing stages", () => {
    const operations: SkillOperation[] = [
      { id: "unusual_result", kind: "emit", input: "earlier_step" },
      { id: "calculate_shortage", kind: "compute", input: "joined", formula: "subtract_floor_zero", leftField: "onHandEach", rightField: "demandEach", outputField: "remainder" }
    ];
    expect(operations.map(describeOperation).map((item) => item.title)).toEqual(["Emit result", "Calculate remainder"]);
    expect(describeOperation(operations[1]!).detail).toBe("remainder = max(onHandEach − demandEach, 0).");
    expect(operations.slice(1).map(describeOperation)).toHaveLength(1);
  });
  it("explains rejection codes without treating missing metadata as an unknown value", () => {
    expect(rejectionExplanation("UNKNOWN_UNIT")).toContain("conversion table");
    expect(rejectionExplanation()).toBe("No rejection reason was recorded.");
  });
});
