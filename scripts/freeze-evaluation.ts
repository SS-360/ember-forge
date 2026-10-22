import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StockDatasetSchema, StockParametersSchema } from "../packages/contracts/src/index.js";
import { reconcileStock, UnsupportedInputError } from "../packages/evaluator/src/stock-reconciliation.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const splitDirectory = path.join(projectRoot, "evaluation", "frozen-v1");
const fixture = JSON.parse(await readFile(path.join(projectRoot, "fixtures", "dev", "stock-reconciliation.json"), "utf8"));

type FrozenCase = { caseId: string; parameters: unknown; dataset: unknown };
const reorder = <T,>(items: T[]): T[] => [...items].reverse();
const cases: FrozenCase[] = [];
const supported: Array<{ caseId: string; expectedHash: string }> = [];
const unsupported: Array<{ caseId: string; expectedReason: string }> = [];

function addSupported(caseId: string, parameters: unknown, dataset: unknown): void {
  cases.push({ caseId, parameters, dataset });
  const parsedParameters = StockParametersSchema.parse(parameters);
  const parsedDataset = StockDatasetSchema.parse(dataset);
  const result = reconcileStock(parsedParameters, parsedDataset);
  const normalized = result.lines.map((row) => Object.fromEntries(Object.entries(row).sort(([left], [right]) => left.localeCompare(right))));
  supported.push({ caseId, expectedHash: createHash("sha256").update(JSON.stringify(normalized)).digest("hex") });
}

function addUnsupported(caseId: string, parameters: unknown, dataset: unknown, expectedReason: string): void {
  cases.push({ caseId, parameters, dataset });
  try {
    reconcileStock(StockParametersSchema.parse(parameters), StockDatasetSchema.parse(dataset));
    throw new Error("Frozen unsupported case was accepted by the independent oracle: " + caseId);
  } catch (error) {
    const reason = error instanceof UnsupportedInputError ? error.code : undefined;
    if (reason !== expectedReason) {
      throw new Error("Frozen label mismatch for " + caseId + ": expected " + expectedReason + ", got " + String(reason));
    }
    unsupported.push({ caseId, expectedReason });
  }
}

const baseParameters = fixture.parameters;
const baseDataset = fixture.dataset;
const adjusted = structuredClone(baseDataset);
adjusted.orders[0].orderId = "HELD-001";
adjusted.orders[0].quantity = 3;
adjusted.orders[1].orderId = "HELD-002";
adjusted.orders[1].quantity = 2;
adjusted.orders[2].orderId = "HELD-003";
adjusted.orders[2].quantity = 3;
addSupported("frozen-adjusted-quantities-and-identities", baseParameters, { ...adjusted, orders: reorder(adjusted.orders) });

const secondWarehouse = structuredClone(baseDataset);
secondWarehouse.inventory.push({ warehouseId: "WH-02", sku: "CUP-RED", snapshotDate: "2026-10-22", onHandEach: 12 });
addSupported("frozen-secondary-warehouse", { ...baseParameters, warehouseId: "WH-02" }, secondWarehouse);

const earlySnapshot = structuredClone(baseDataset);
earlySnapshot.inventory = earlySnapshot.inventory.map((record: { snapshotDate: string }) => ({ ...record, snapshotDate: "2026-10-22" }));
addSupported("frozen-date-boundary-and-snapshot", { ...baseParameters, throughDate: "2026-10-22" }, earlySnapshot);

const historic = structuredClone(baseDataset);
historic.inventory = historic.inventory.map((record: { snapshotDate: string }) => ({ ...record, snapshotDate: "2026-10-19" }));
addSupported("frozen-historic-date-range", { ...baseParameters, fromDate: "2026-10-19", throughDate: "2026-10-19" }, historic);

addUnsupported("frozen-policy-version-change", { ...baseParameters, policyVersion: "stock-v9" }, baseDataset, "POLICY_VERSION_MISMATCH");
addUnsupported("frozen-order-schema-change", baseParameters, {
  ...baseDataset,
  sourceSchemaVersions: { ...baseDataset.sourceSchemaVersions, orders: "orders/v3" }
}, "SCHEMA_VERSION_MISMATCH");
addUnsupported("frozen-future-snapshot", baseParameters, {
  ...baseDataset,
  inventory: baseDataset.inventory.map((record: { sku: string; snapshotDate: string }) =>
    record.sku === "MUG-BLUE" ? { ...record, snapshotDate: "2026-10-24" } : record)
}, "INVENTORY_SNAPSHOT_AFTER_RANGE");
addUnsupported("frozen-unknown-unit-on-blue-mug", baseParameters, {
  ...baseDataset,
  orders: baseDataset.orders.map((record: { orderId: string; unit: string }) =>
    record.orderId === "ORD-1003" ? { ...record, unit: "PALLET" } : record)
}, "UNKNOWN_UNIT");
addUnsupported("frozen-missing-blue-inventory", baseParameters, {
  ...baseDataset,
  inventory: baseDataset.inventory.filter((record: { sku: string }) => record.sku !== "MUG-BLUE")
}, "INVENTORY_NOT_FOUND");
addUnsupported("frozen-unknown-product-alias", baseParameters, {
  ...baseDataset,
  orders: baseDataset.orders.map((record: { orderId: string; sku: string }) =>
    record.orderId === "ORD-1001" ? { ...record, sku: "GREEN-WIDGET" } : record)
}, "UNKNOWN_SKU_ALIAS");

const labels = Object.fromEntries([
  ...supported.map((item) => [item.caseId, { expectedOutcome: "supported", expectedResultHash: item.expectedHash }]),
  ...unsupported.map((item) => [item.caseId, { expectedOutcome: "unsupported", expectedReason: item.expectedReason }])
]);
await mkdir(splitDirectory, { recursive: true });
await writeFile(path.join(splitDirectory, "inputs.json"), JSON.stringify({
  schemaVersion: "pocketforge.evaluation-inputs/1",
  cases
}, null, 2) + "\n", "utf8");
await writeFile(path.join(splitDirectory, "labels.json"), JSON.stringify({
  schemaVersion: "pocketforge.evaluation-labels/1",
  labels
}, null, 2) + "\n", "utf8");
await writeFile(path.join(splitDirectory, "protocol.json"), JSON.stringify({
  schemaVersion: "pocketforge.evaluation-protocol/1",
  split: "frozen-smoke-v1",
  frozenAt: new Date().toISOString(),
  taskFamilies: ["stock-reconciliation"],
  caseCount: cases.length,
  supportedCaseCount: supported.length,
  unsupportedCaseCount: unsupported.length,
  labelsStoredSeparately: true,
  compilerReceivesLabels: false,
  scope: "Small synthetic smoke split; not held-out or representative evaluation. One procedure family only."
}, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ split: "frozen-smoke-v1", cases: cases.length, supported: supported.length, unsupported: unsupported.length }, null, 2));
