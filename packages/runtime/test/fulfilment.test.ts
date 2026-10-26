import { describe, it, expect } from "vitest";
import { fulfilmentExceptions } from "../src/fulfilment.js";

const policy = { schemaVersion: "emberforge.fulfilment-policy/1", id: "dispatch-review", version: "0.1.0", graceDays: 1, includeIncomplete: true };
const input = { taskFamily: "fulfilment-exceptions", sourceMode: "snapshot", schemaVersion: "fulfilment-v1", policyVersion: "0.1.0", asOfDate: "2026-10-26", orders: [
  { orderId: "A", sku: "cup", promisedDate: "2026-10-23", quantity: 10, status: "open" },
  { orderId: "B", sku: "mug", promisedDate: "2026-10-26", quantity: 4, status: "open" },
  { orderId: "C", sku: "cup", promisedDate: "2026-10-20", quantity: 2, status: "cancelled" }
], shipments: [{ shipmentId: "S1", orderId: "A", sku: "cup", shippedDate: "2026-10-25", quantity: 3, status: "shipped" }] };
describe("fulfilment template domain", () => {
  it("joins partial shipments, classifies overdue and incomplete, and excludes cancelled orders", () => {
    expect(fulfilmentExceptions(policy, input).records).toEqual([
      { orderId: "A", sku: "cup", ordered: 10, shipped: 3, remaining: 7, reason: "delayed", overdueDays: 2 },
      { orderId: "B", sku: "mug", ordered: 4, shipped: 0, remaining: 4, reason: "incomplete", overdueDays: 0 }
    ]);
  });
  it("honours inclusive grace boundaries, excludes future/cancelled shipments and completed orders", () => {
    const data = structuredClone(input);
    data.orders[0]!.promisedDate = "2026-10-25";
    data.shipments.push({ shipmentId: "S2", orderId: "A", sku: "cup", shippedDate: "2026-10-27", quantity: 7, status: "shipped" });
    expect(fulfilmentExceptions({ ...policy, includeIncomplete: false }, data).records).toEqual([]);
    data.shipments[1]!.shippedDate = "2026-10-26";
    expect(fulfilmentExceptions(policy, data).records.map((r) => r.orderId)).toEqual(["B"]);
    data.shipments[1]!.status = "cancelled";
    expect(fulfilmentExceptions(policy, data).records[0]!.remaining).toBe(7);
  });
  it("refuses malformed dates, duplicate IDs, unknown orders, schema drift and excess shipments", () => {
    expect(() => fulfilmentExceptions(policy, { ...input, asOfDate: "2026-02-30" })).toThrow("INPUT_CONTRACT_MISMATCH");
    expect(() => fulfilmentExceptions(policy, { ...input, orders: [...input.orders, input.orders[0]] })).toThrow("DUPLICATE_ID");
    expect(() => fulfilmentExceptions(policy, { ...input, shipments: [{ ...input.shipments[0], orderId: "unknown" }] })).toThrow("SHIPMENT_ORDER_MISMATCH");
    expect(() => fulfilmentExceptions(policy, { ...input, schemaVersion: "v2" })).toThrow("INPUT_CONTRACT_MISMATCH");
    expect(() => fulfilmentExceptions(policy, { ...input, shipments: [{ ...input.shipments[0], quantity: 11 }] })).toThrow("OVER_FULFILLED");
  });
});
