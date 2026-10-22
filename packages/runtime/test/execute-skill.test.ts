import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { StockDatasetSchema, StockParametersSchema } from "@pocketforge/contracts";
import { reconcileStock } from "../../evaluator/src/index.js";
import { executeSkill, SkillExecutionError, validateSkillIR } from "../src/index.js";

const root = new URL("../../../", import.meta.url);
const fixture = JSON.parse(await readFile(fileURLToPath(new URL("fixtures/dev/stock-reconciliation.json", root)), "utf8"));
const skill = JSON.parse(await readFile(fileURLToPath(new URL("skills/stock-reconciliation/skill.json", root)), "utf8"));
const contract = JSON.parse(await readFile(fileURLToPath(new URL("skills/stock-reconciliation/contract.json", root)), "utf8"));
const dataset = StockDatasetSchema.parse(fixture.dataset);
const parameters = StockParametersSchema.parse(fixture.parameters);

describe("bounded stock skill runtime", () => {
  it("runs the bounded program and matches the independent oracle", () => {
    const actual = executeSkill(skill, contract, parameters, dataset);
    const expected = reconcileStock(parameters, dataset);
    expect(actual.records).toEqual(expected.lines);
    expect(actual.metrics.operationsExecuted).toBe(skill.ir.operations.length);
    expect(actual.metrics.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("generalizes to unseen order identifiers and row order", () => {
    const changedDataset = {
      ...dataset,
      orders: [
        {
          orderId: "ORD-NEVER-SEEN",
          warehouseId: "WH-01",
          orderDate: "2026-10-23",
          sku: "red-cup",
          quantity: 1,
          unit: "BOX",
          status: "open" as const
        },
        ...[...dataset.orders].reverse()
      ]
    };
    const changedParameters = { ...parameters, fromDate: "2026-10-23", throughDate: "2026-10-23" };
    const actual = executeSkill(skill, contract, changedParameters, changedDataset);
    const expected = reconcileStock(changedParameters, changedDataset);
    expect(actual.records).toEqual(expected.lines);
    expect(actual.records).toEqual([{ sku: "CUP-RED", demandEach: 12, onHandEach: 15, shortageEach: 0 }]);
  });

  it("rejects a changed source schema before executing the program", () => {
    expect(() => executeSkill(skill, contract, parameters, {
      ...dataset,
      sourceSchemaVersions: { ...dataset.sourceSchemaVersions, inventory: "inventory/v2" }
    })).toThrowError(expect.objectContaining({ code: "SCHEMA_VERSION_MISMATCH" }));
  });

  it("checks semantic postconditions even if a skill program has a wrong formula", () => {
    const wrongSkill = structuredClone(skill);
    const compute = wrongSkill.ir.operations.find((operation: { kind: string }) => operation.kind === "compute");
    compute.leftField = "onHandEach";
    compute.rightField = "demandEach";
    expect(() => executeSkill(wrongSkill, contract, parameters, dataset)).toThrowError(
      expect.objectContaining({ code: "POSTCONDITION_FAILED" })
    );
  });

  it("rejects unknown units without guessing", () => {
    const unsupported = {
      ...dataset,
      orders: dataset.orders.map((order, index) => index === 0 ? { ...order, unit: "PALLET" } : order)
    };
    expect(() => executeSkill(skill, contract, parameters, unsupported)).toThrowError(
      expect.objectContaining({ code: "UNKNOWN_UNIT" })
    );
  });

  it("rejects a forward reference in the operation graph", () => {
    const invalidIr = {
      ...skill.ir,
      operations: [
        { id: "filter_first", kind: "filter", input: "orders_later", predicates: [
          { field: "status", operator: "eq", value: { kind: "literal", value: "open" } }
        ] },
        { id: "orders_later", kind: "source_read", source: "orders" },
        { id: "emit_result", kind: "emit", input: "filter_first" }
      ],
      outputStep: "emit_result"
    };
    expect(() => validateSkillIR(invalidIr)).toThrowError(
      expect.objectContaining({ code: "INVALID_OPERATION_GRAPH" })
    );
  });

  it("never runs a write or arbitrary-code instruction", () => {
    const invalidIr = {
      ...skill.ir,
      operations: [
        { id: "unsafe", kind: "execute_sql", sql: "DELETE FROM inventory" }
      ],
      outputStep: "unsafe"
    };
    expect(() => validateSkillIR(invalidIr)).toThrow();
  });

  it("rejects a snapshot dated after the requested range", () => {
    const futureSnapshot = {
      ...dataset,
      inventory: dataset.inventory.map((record) => ({ ...record, snapshotDate: "2026-10-24" }))
    };
    expect(() => executeSkill(skill, contract, parameters, futureSnapshot)).toThrowError(
      expect.objectContaining({ code: "INVENTORY_SNAPSHOT_AFTER_RANGE" })
    );
  });

  it("uses machine-readable unsupported errors", () => {
    try {
      executeSkill(skill, contract, parameters, {
        ...dataset,
        sourceMode: "live"
      });
      throw new Error("expected source mode rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(SkillExecutionError);
      expect((error as SkillExecutionError).code).toBe("UNSUPPORTED_SOURCE_MODE");
    }
  });
});

