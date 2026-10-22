import type { VerificationCase } from "./index.js";

interface DevelopmentFixture {
  parameters: Record<string, unknown>;
  dataset: {
    orders: Array<Record<string, unknown>>;
    inventory: Array<Record<string, unknown>>;
    sourceSchemaVersions: Record<string, string>;
  };
}

export function buildDevelopmentSuite(fixture: DevelopmentFixture): VerificationCase[] {
  const { parameters, dataset } = fixture;
  const changedInput = {
    ...dataset,
    orders: [
      {
        orderId: "ORD-NEVER-SEEN",
        warehouseId: "WH-01",
        orderDate: "2026-10-23",
        sku: "red-cup",
        quantity: 1,
        unit: "BOX",
        status: "open"
      },
      ...[...dataset.orders].reverse()
    ]
  };

  const unsupportedCases: Array<{ caseId: string; expectedReason: string; parameters: unknown; dataset: unknown }> = [
    {
      caseId: "dev-unknown-unit",
      expectedReason: "UNKNOWN_UNIT",
      parameters,
      dataset: {
        ...dataset,
        orders: dataset.orders.map((order, index) => index === 0 ? { ...order, unit: "PALLET" } : order)
      }
    },
    {
      caseId: "dev-changed-policy",
      expectedReason: "POLICY_VERSION_MISMATCH",
      parameters: { ...parameters, policyVersion: "stock-v2" },
      dataset
    },
    {
      caseId: "dev-changed-schema",
      expectedReason: "SCHEMA_VERSION_MISMATCH",
      parameters,
      dataset: { ...dataset, sourceSchemaVersions: { ...dataset.sourceSchemaVersions, inventory: "inventory/v2" } }
    },
    {
      caseId: "dev-future-inventory-snapshot",
      expectedReason: "INVENTORY_SNAPSHOT_AFTER_RANGE",
      parameters,
      dataset: {
        ...dataset,
        inventory: dataset.inventory.map((record) => ({ ...record, snapshotDate: "2026-10-24" }))
      }
    },
    {
      caseId: "dev-missing-inventory",
      expectedReason: "INVENTORY_NOT_FOUND",
      parameters,
      dataset: { ...dataset, inventory: dataset.inventory.filter((record) => record.sku !== "CUP-RED") }
    }
  ];

  return [
    { caseId: "dev-supported-baseline", expectedOutcome: "supported", parameters, dataset },
    {
      caseId: "dev-supported-new-order-id-and-row-order",
      expectedOutcome: "supported",
      parameters: { ...parameters, fromDate: "2026-10-23", throughDate: "2026-10-23" },
      dataset: changedInput
    },
    ...unsupportedCases.map((testCase) => ({ ...testCase, expectedOutcome: "unsupported" as const }))
  ];
}
