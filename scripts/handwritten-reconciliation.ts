import { StockDatasetSchema, StockParametersSchema } from "../packages/contracts/src/index.js";
export class ScriptRefusal extends Error { constructor(readonly code: string) { super(code); } }
/** Human-readable deterministic reference arm. No candidate graph or model is used. */
export function handwrittenReconciliation(parametersInput: unknown, datasetInput: unknown, policyVersion = "stock-v1") {
  const parameters = StockParametersSchema.safeParse(parametersInput), data = StockDatasetSchema.safeParse(datasetInput);
  if (!parameters.success) throw new ScriptRefusal("INPUT_PARAMETERS_INVALID");
  if (!data.success) throw new ScriptRefusal("INPUT_DATASET_INVALID");
  const p = parameters.data, d = data.data;
  const refuse = (code: string): never => { throw new ScriptRefusal(code); };
  if (d.sourceMode !== "fixture") refuse("UNSUPPORTED_SOURCE_MODE");
  if (p.policyVersion !== policyVersion) refuse("POLICY_VERSION_MISMATCH");
  if (d.productRules.version !== p.policyVersion) refuse("POLICY_VERSION_MISMATCH");
  if (d.sourceSchemaVersions.orders !== "orders/v1" || d.sourceSchemaVersions.inventory !== "inventory/v1" || d.sourceSchemaVersions.productRules !== "product-rules/v1") refuse("SCHEMA_VERSION_MISMATCH");
  if (d.orders.length + d.inventory.length + d.productRules.aliases.length + d.productRules.unitConversions.length > 5000) refuse("ROW_LIMIT_EXCEEDED");
  if (d.inventory.some((item) => item.snapshotDate > p.throughDate)) refuse("INVENTORY_SNAPSHOT_AFTER_RANGE");
  const unique = <T>(items: T[], getKey: (item: T) => string, reason: string) => { const seen = new Set<string>(); for (const item of items) { const key = getKey(item); if (seen.has(key)) refuse(reason); seen.add(key); } };
  unique(d.productRules.aliases, (item) => item.alias, "DUPLICATE_SKU_ALIAS");
  unique(d.productRules.unitConversions, (item) => item.unit, "DUPLICATE_UNIT_RULE");
  unique(d.orders, (item) => item.orderId, "DUPLICATE_ORDER_ID");
  unique(d.inventory, (item) => JSON.stringify([item.warehouseId, item.sku]), "DUPLICATE_INVENTORY_KEY");
  const demand = new Map<string, number>();
  for (const order of d.orders) {
    if (order.status !== "open" || order.warehouseId !== p.warehouseId || order.orderDate < p.fromDate || order.orderDate > p.throughDate) continue;
    const sku = d.productRules.aliases.find((item) => item.alias === order.sku)?.canonicalSku;
    if (!sku) refuse("UNKNOWN_SKU_ALIAS");
    const factor = d.productRules.unitConversions.find((item) => item.unit === order.unit)?.eachPerUnit;
    if (factor === undefined) refuse("UNKNOWN_UNIT");
    const each = order.quantity * factor!;
    if (!Number.isSafeInteger(each) || !Number.isSafeInteger((demand.get(sku!) ?? 0) + each)) refuse("QUANTITY_OVERFLOW");
    demand.set(sku!, (demand.get(sku!) ?? 0) + each);
  }
  return [...demand.keys()].sort((a, b) => a.localeCompare(b)).map((sku) => {
    const stock = d.inventory.find((item) => item.warehouseId === p.warehouseId && item.sku === sku);
    if (!stock) return refuse("INVENTORY_NOT_FOUND");
    const demandEach = demand.get(sku)!;
    return { sku, demandEach, onHandEach: stock.onHandEach, shortageEach: Math.max(demandEach - stock.onHandEach, 0) };
  });
}
