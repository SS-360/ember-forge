import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { StockDatasetSchema, StockParametersSchema } from "@emberforge/contracts";
import { reconcileStock, UnsupportedInputError } from "../src/stock-reconciliation.js";

const fixtureUrl = new URL("../../../fixtures/dev/stock-reconciliation.json", import.meta.url);
const fixture = JSON.parse(await readFile(fileURLToPath(fixtureUrl), "utf8"));
const dataset = StockDatasetSchema.parse(fixture.dataset);
const parameters = StockParametersSchema.parse(fixture.parameters);

describe("stock reconciliation reference evaluator", () => {
  it("filters cancelled and other-warehouse orders, normalizes units, and aggregates deterministically", () => {
    expect(reconcileStock(parameters, dataset)).toEqual({
      taskFamily: "stock-reconciliation",
      parameters,
      policyVersion: "stock-v1",
      lines: [
        { sku: "CUP-RED", demandEach: 25, onHandEach: 15, shortageEach: 10 },
        { sku: "MUG-BLUE", demandEach: 5, onHandEach: 8, shortageEach: 0 }
      ]
    });
  });

  it("rejects an unknown unit instead of guessing a conversion", () => {
    const unsupportedDataset = {
      ...dataset,
      orders: dataset.orders.map((order, index) => index === 0 ? { ...order, unit: "PALLET" } : order)
    };
    expect(() => reconcileStock(parameters, unsupportedDataset)).toThrowError(
      expect.objectContaining({ code: "UNKNOWN_UNIT" })
    );
  });

  it("invalidates a changed policy version", () => {
    expect(() => reconcileStock({ ...parameters, policyVersion: "stock-v2" }, dataset)).toThrowError(
      expect.objectContaining({ code: "POLICY_VERSION_MISMATCH" })
    );
  });

  it("rejects duplicate inventory identities", () => {
    const duplicateDataset = {
      ...dataset,
      inventory: [...dataset.inventory, dataset.inventory[0]!]
    };
    expect(() => reconcileStock(parameters, duplicateDataset)).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_INVENTORY_KEY" })
    );
  });

  it("rejects impossible calendar dates at the contract boundary", () => {
    expect(() => StockParametersSchema.parse({
      ...parameters,
      fromDate: "2026-02-30"
    })).toThrow();
  });

  it("rejects a changed source schema version", () => {
    expect(() => reconcileStock(parameters, {
      ...dataset,
      sourceSchemaVersions: { ...dataset.sourceSchemaVersions, inventory: "inventory/v2" }
    })).toThrowError(expect.objectContaining({ code: "SCHEMA_VERSION_MISMATCH" }));
  });

  it("uses a machine-readable unsupported error", () => {
    const badRules = {
      ...dataset,
      productRules: { ...dataset.productRules, unitConversions: [] }
    };
    try {
      reconcileStock(parameters, badRules);
      throw new Error("expected unsupported result");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedInputError);
      expect((error as UnsupportedInputError).code).toBe("UNKNOWN_UNIT");
    }
  });
});

