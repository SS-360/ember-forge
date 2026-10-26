import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(s + "T00:00:00Z");
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === s;
}, "Use a real ISO date");
const id = z.string().trim().min(1).max(100);
const quantity = z.number().int().nonnegative().max(1_000_000);
export const FulfilmentPolicySchema = z.object({
  schemaVersion: z.literal("emberforge.fulfilment-policy/1"),
  id: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/),
  version: z.literal("0.1.0"),
  graceDays: z.number().int().min(0).max(30),
  includeIncomplete: z.boolean()
}).strict();
export type FulfilmentPolicy = z.infer<typeof FulfilmentPolicySchema>;
export const FulfilmentInputSchema = z.object({
  taskFamily: z.literal("fulfilment-exceptions"),
  sourceMode: z.enum(["fixture", "snapshot"]),
  schemaVersion: z.literal("fulfilment-v1"),
  policyVersion: z.literal("0.1.0"),
  asOfDate: date,
  orders: z.array(z.object({ orderId: id, sku: id, promisedDate: date, quantity: quantity.positive(), status: z.enum(["open", "cancelled"]) }).strict()).max(2500),
  shipments: z.array(z.object({ shipmentId: id, orderId: id, sku: id, shippedDate: date, quantity: quantity.positive(), status: z.enum(["shipped", "cancelled"]) }).strict()).max(2500)
}).strict();
export type FulfilmentInput = z.infer<typeof FulfilmentInputSchema>;
export interface FulfilmentException { orderId: string; sku: string; ordered: number; shipped: number; remaining: number; reason: "delayed" | "incomplete"; overdueDays: number }
