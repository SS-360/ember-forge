import { createHash } from "node:crypto";
import type { StockDataset, StockParameters } from "@pocketforge/contracts";

export type ProtocolPartition = "compilation" | "development" | "frozen";
export type ProtocolCase = { caseId: string; parameters: unknown; dataset: unknown } & (
  { expectedOutcome: "supported" } | { expectedOutcome: "unsupported"; expectedReason: string }
);
export interface ProtocolSplit {
  schemaVersion: "pocketforge.evaluation-split/2";
  partition: ProtocolPartition;
  generatorVersion: "stock-protocol/2";
  seedHash: string;
  cases: ProtocolCase[];
  inputHashes: string[];
  splitHash: string;
}
export function protocolHash(value: unknown): string {
  const normalize = (item: unknown): unknown => Array.isArray(item) ? item.map(normalize) : item !== null && typeof item === "object"
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize((item as Record<string, unknown>)[key])])) : item;
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}
export function caseInputHash(testCase: { parameters: unknown; dataset: unknown }): string { return protocolHash({ parameters: testCase.parameters, dataset: testCase.dataset }); }
const isoDay = (day: number) => new Date(Date.UTC(2026, 9, day)).toISOString().slice(0, 10);

/** Synthetic domain generator, independent of the seed IR and existing development fixture file. */
export function buildProtocolSplit(partition: ProtocolPartition, seed: string): ProtocolSplit {
  const seedHash = protocolHash({ partition, seed });
  const number = parseInt(seedHash.slice(0, 6), 16);
  const tag = seedHash.slice(0, 8);
  const day = 3 + number % 15;
  const warehouseA = "WH-" + tag + "-A", warehouseB = "WH-" + tag + "-B";
  const skuA = "PRODUCT-" + tag + "-A", skuB = "PRODUCT-" + tag + "-B";
  const factor = 2 + number % 8;
  const parameters: StockParameters = { warehouseId: warehouseA, fromDate: isoDay(day), throughDate: isoDay(day + 3), policyVersion: "stock-v1" };
  const dataset: StockDataset = {
    sourceMode: "fixture", sourceVersions: { orders: "orders-" + tag, inventory: "inventory-" + tag, productRules: "rules-" + tag },
    sourceSchemaVersions: { orders: "orders/v1", inventory: "inventory/v1", productRules: "product-rules/v1" },
    orders: [
      { orderId: tag + "-1", warehouseId: warehouseA, orderDate: isoDay(day), sku: "alias-a", quantity: 1 + number % 5, unit: "PACK", status: "open" },
      { orderId: tag + "-2", warehouseId: warehouseA, orderDate: isoDay(day + 3), sku: "alias-a", quantity: 3, unit: "EACH", status: "open" },
      { orderId: tag + "-3", warehouseId: warehouseA, orderDate: isoDay(day + 1), sku: "alias-b", quantity: 2, unit: "PACK", status: "open" },
      { orderId: tag + "-4", warehouseId: warehouseB, orderDate: isoDay(day + 2), sku: "alias-b", quantity: 4, unit: "EACH", status: "open" },
      { orderId: tag + "-5", warehouseId: warehouseA, orderDate: isoDay(day + 2), sku: "alias-a", quantity: 99, unit: "UNAPPROVED", status: "cancelled" },
      { orderId: tag + "-6", warehouseId: warehouseA, orderDate: isoDay(day - 1), sku: "not-registered", quantity: 7, unit: "PACK", status: "open" }
    ],
    inventory: [warehouseA, warehouseB].flatMap((warehouseId) => [
      { warehouseId, sku: skuA, snapshotDate: isoDay(day), onHandEach: 3 + number % 7 },
      { warehouseId, sku: skuB, snapshotDate: isoDay(day), onHandEach: 50 }
    ]),
    productRules: { version: "stock-v1", aliases: [{ alias: "alias-a", canonicalSku: skuA }, { alias: "alias-b", canonicalSku: skuB }], unitConversions: [{ unit: "EACH", eachPerUnit: 1 }, { unit: "PACK", eachPerUnit: factor }] }
  };
  const cases: ProtocolCase[] = [];
  const add = (name: string, mutate: (input: { parameters: StockParameters; dataset: StockDataset }) => void, reason?: string) => {
    const input = structuredClone({ parameters, dataset }); mutate(input);
    cases.push({ caseId: `${partition}-${name}-${tag}`, ...input, ...(reason ? { expectedOutcome: "unsupported" as const, expectedReason: reason } : { expectedOutcome: "supported" as const }) });
  };
  add("warehouse-a", () => {});
  add("warehouse-b", (input) => { input.parameters.warehouseId = warehouseB; });
  add("unknown-unit", (input) => { input.dataset.orders[0]!.unit = "CRATE"; }, "UNKNOWN_UNIT");
  if (partition !== "compilation") {
    add("inclusive-day-boundary", (input) => { input.parameters.fromDate = isoDay(day + 3); });
    add("row-order", (input) => { input.dataset.orders.reverse(); input.dataset.inventory.reverse(); });
    add("empty-orders", (input) => { input.dataset.orders = []; });
    add("changed-rule-table", (input) => { input.dataset.productRules.unitConversions[1]!.eachPerUnit = factor + 7; input.dataset.sourceVersions.productRules += "-variant"; });
    add("large-supported", (input) => { input.dataset.orders = Array.from({ length: 4800 }, (_, index) => ({ ...input.dataset.orders[0]!, orderId: tag + "-large-" + index })); });
    add("unknown-alias", (input) => { input.dataset.orders[0]!.sku = "unmapped"; }, "UNKNOWN_SKU_ALIAS");
    add("missing-inventory", (input) => { input.dataset.inventory = input.dataset.inventory.filter((row) => row.sku !== skuA || row.warehouseId !== warehouseA); }, "INVENTORY_NOT_FOUND");
    add("future-snapshot", (input) => { input.dataset.inventory[0]!.snapshotDate = isoDay(day + 4); }, "INVENTORY_SNAPSHOT_AFTER_RANGE");
    add("policy-change", (input) => { input.parameters.policyVersion = "stock-v2"; }, "POLICY_VERSION_MISMATCH");
    add("schema-change", (input) => { input.dataset.sourceSchemaVersions.orders = "orders/v2"; }, "SCHEMA_VERSION_MISMATCH");
    add("duplicate-order", (input) => { input.dataset.orders.push(structuredClone(input.dataset.orders[0]!)); }, "DUPLICATE_ORDER_ID");
    add("duplicate-inventory", (input) => { input.dataset.inventory.push(structuredClone(input.dataset.inventory[0]!)); }, "DUPLICATE_INVENTORY_KEY");
    add("duplicate-alias", (input) => { input.dataset.productRules.aliases.push(structuredClone(input.dataset.productRules.aliases[0]!)); }, "DUPLICATE_SKU_ALIAS");
    add("duplicate-unit", (input) => { input.dataset.productRules.unitConversions.push(structuredClone(input.dataset.productRules.unitConversions[0]!)); }, "DUPLICATE_UNIT_RULE");
    add("quantity-overflow", (input) => { input.dataset.orders[0]!.quantity = Number.MAX_SAFE_INTEGER; }, "QUANTITY_OVERFLOW");
    add("row-limit", (input) => { input.dataset.orders = Array.from({ length: 5001 }, (_, index) => ({ ...input.dataset.orders[0]!, orderId: tag + "-over-limit-" + index })); }, "ROW_LIMIT_EXCEEDED");
    add("negative-quantity", (input) => { input.dataset.orders[0]!.quantity = -1; }, "INPUT_CONTRACT_INVALID");
    add("invalid-calendar-date", (input) => { input.parameters.fromDate = "2026-02-30"; }, "INPUT_CONTRACT_INVALID");
  }
  const inputHashes = cases.map(caseInputHash);
  return { schemaVersion: "pocketforge.evaluation-split/2", partition, generatorVersion: "stock-protocol/2", seedHash, cases, inputHashes, splitHash: protocolHash({ partition, seedHash, cases, inputHashes }) };
}

export function assertSplitSeparation(splits: readonly ProtocolSplit[]): void {
  const seen = new Map<string, string>();
  for (const split of splits) {
    if (split.inputHashes.length !== split.cases.length || split.cases.some((testCase, index) => caseInputHash(testCase) !== split.inputHashes[index])) throw new Error("Evaluation split input hashes are stale.");
    if (split.splitHash !== protocolHash({ partition: split.partition, seedHash: split.seedHash, cases: split.cases, inputHashes: split.inputHashes })) throw new Error("Evaluation split content hash is stale.");
    for (const [index, hash] of split.inputHashes.entries()) {
      if (seen.has(hash)) throw new Error("Evaluation input overlap between " + seen.get(hash) + " and " + split.cases[index]!.caseId);
      seen.set(hash, split.cases[index]!.caseId);
    }
  }
}
