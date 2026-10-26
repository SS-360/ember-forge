import { FulfilmentInputSchema, FulfilmentPolicySchema, type FulfilmentException } from "../../contracts/src/fulfilment.js";

export class FulfilmentRefusal extends Error {
  constructor(readonly code: string) { super(code); }
}
/** Trusted second-domain template. No generated source, network, or model calls. */
export function fulfilmentExceptions(policyInput: unknown, input: unknown) {
  const policy = FulfilmentPolicySchema.safeParse(policyInput), parsed = FulfilmentInputSchema.safeParse(input);
  if (!policy.success) throw new FulfilmentRefusal("POLICY_INVALID");
  if (!parsed.success) throw new FulfilmentRefusal("INPUT_CONTRACT_MISMATCH");
  const data = parsed.data;
  const orders = new Map(data.orders.map((row) => [row.orderId, row]));
  if (orders.size !== data.orders.length || new Set(data.shipments.map((s) => s.shipmentId)).size !== data.shipments.length) throw new FulfilmentRefusal("DUPLICATE_ID");
  const shipped = new Map<string, number>();
  for (const shipment of data.shipments) {
    const order = orders.get(shipment.orderId);
    if (!order || order.sku !== shipment.sku) throw new FulfilmentRefusal("SHIPMENT_ORDER_MISMATCH");
    if (shipment.status === "cancelled" || shipment.shippedDate > data.asOfDate) continue;
    shipped.set(order.orderId, (shipped.get(order.orderId) ?? 0) + shipment.quantity);
  }
  const records: FulfilmentException[] = [];
  for (const order of orders.values()) {
    const sent = shipped.get(order.orderId) ?? 0;
    if (sent > order.quantity) throw new FulfilmentRefusal("OVER_FULFILLED");
    if (order.status === "cancelled" || sent === order.quantity) continue;
    const days = Math.round((Date.parse(data.asOfDate) - Date.parse(order.promisedDate)) / 86_400_000) - policy.data.graceDays;
    if (days <= 0 && !policy.data.includeIncomplete) continue;
    records.push({ orderId: order.orderId, sku: order.sku, ordered: order.quantity, shipped: sent, remaining: order.quantity - sent, reason: days > 0 ? "delayed" : "incomplete", overdueDays: Math.max(0, days) });
  }
  records.sort((a, b) => a.orderId.localeCompare(b.orderId));
  return { status: "succeeded" as const, taskFamily: "fulfilment-exceptions" as const, sourceMode: data.sourceMode, asOfDate: data.asOfDate, policyId: policy.data.id, records, modelCalls: 0, origin: "configured_template" as const };
}
