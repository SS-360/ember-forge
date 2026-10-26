import {
  ProductRulesSchema,
  StockDatasetSchema,
  StockParametersSchema,
  StockResultSchema,
  type StockDataset,
  type StockParameters,
  type StockResult
} from "@emberforge/contracts";

export class UnsupportedInputError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "UnsupportedInputError";
    this.code = code;
  }
}

function key(warehouseId: string, sku: string): string {
  return warehouseId + "\u0000" + sku;
}

function buildUniqueMap<T>(
  entries: readonly T[],
  getKey: (entry: T) => string,
  duplicateCode: string,
  description: string
): Map<string, T> {
  const result = new Map<string, T>();
  for (const entry of entries) {
    const itemKey = getKey(entry);
    if (result.has(itemKey)) {
      throw new UnsupportedInputError(duplicateCode, "Duplicate " + description + ": " + itemKey);
    }
    result.set(itemKey, entry);
  }
  return result;
}

export function reconcileStock(parametersInput: StockParameters, datasetInput: StockDataset): StockResult {
  const parameters = StockParametersSchema.parse(parametersInput);
  const dataset = StockDatasetSchema.parse(datasetInput);
  const rules = ProductRulesSchema.parse(dataset.productRules);

  if (rules.version !== parameters.policyVersion) {
    throw new UnsupportedInputError(
      "POLICY_VERSION_MISMATCH",
      "Requested policy " + parameters.policyVersion + " does not match data policy " + rules.version
    );
  }
  const requiredSchemas = {
    orders: "orders/v1",
    inventory: "inventory/v1",
    productRules: "product-rules/v1"
  };
  for (const source of ["orders", "inventory", "productRules"] as const) {
    if (dataset.sourceSchemaVersions[source] !== requiredSchemas[source]) {
      throw new UnsupportedInputError(
        "SCHEMA_VERSION_MISMATCH",
        "Unsupported " + source + " schema version " + dataset.sourceSchemaVersions[source]
      );
    }
  }
  if (dataset.orders.length + dataset.inventory.length + rules.aliases.length + rules.unitConversions.length > 5000) {
    throw new UnsupportedInputError("ROW_LIMIT_EXCEEDED", "The stock-reconciliation task permits at most 5000 source rows.");
  }
  if (dataset.inventory.some((record) => record.snapshotDate > parameters.throughDate)) {
    throw new UnsupportedInputError(
      "INVENTORY_SNAPSHOT_AFTER_RANGE",
      "Inventory snapshot is later than the requested end date"
    );
  }

  const aliases = buildUniqueMap(
    rules.aliases,
    (entry) => entry.alias,
    "DUPLICATE_SKU_ALIAS",
    "SKU alias"
  );
  const units = buildUniqueMap(
    rules.unitConversions,
    (entry) => entry.unit,
    "DUPLICATE_UNIT_RULE",
    "unit conversion"
  );
  buildUniqueMap(
    dataset.orders,
    (order) => order.orderId,
    "DUPLICATE_ORDER_ID",
    "order ID"
  );
  const inventoryByKey = buildUniqueMap(
    dataset.inventory,
    (record) => key(record.warehouseId, record.sku),
    "DUPLICATE_INVENTORY_KEY",
    "inventory key"
  );

  const demand = new Map<string, number>();
  for (const order of dataset.orders) {
    if (order.status === "cancelled") continue;
    if (order.warehouseId !== parameters.warehouseId) continue;
    if (order.orderDate < parameters.fromDate || order.orderDate > parameters.throughDate) continue;

    const alias = aliases.get(order.sku);
    if (!alias) {
      throw new UnsupportedInputError("UNKNOWN_SKU_ALIAS", "No approved product alias for " + order.sku);
    }
    const unit = units.get(order.unit);
    if (!unit) {
      throw new UnsupportedInputError("UNKNOWN_UNIT", "No approved conversion for unit " + order.unit);
    }

    const converted = order.quantity * unit.eachPerUnit;
    if (!Number.isSafeInteger(converted)) {
      throw new UnsupportedInputError("QUANTITY_OVERFLOW", "Converted quantity exceeds safe integer range");
    }
    const sku = alias.canonicalSku;
    const next = (demand.get(sku) ?? 0) + converted;
    if (!Number.isSafeInteger(next)) {
      throw new UnsupportedInputError("QUANTITY_OVERFLOW", "Aggregated demand exceeds safe integer range for " + sku);
    }
    demand.set(sku, next);
  }

  const lines = [...demand.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sku, demandEach]) => {
      const inventory = inventoryByKey.get(key(parameters.warehouseId, sku));
      if (!inventory) {
        throw new UnsupportedInputError("INVENTORY_NOT_FOUND", "No inventory record for " + sku);
      }
      const shortageEach = Math.max(demandEach - inventory.onHandEach, 0);
      return {
        sku,
        demandEach,
        onHandEach: inventory.onHandEach,
        shortageEach
      };
    });

  return StockResultSchema.parse({
    taskFamily: "stock-reconciliation",
    parameters,
    policyVersion: rules.version,
    lines
  });
}

