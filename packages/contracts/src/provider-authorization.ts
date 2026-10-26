import { z } from "zod";
import { formatVersionSchema } from "./format.js";

const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const ProviderScopeSchema = z.object({
  baseUrl: z.url().max(500).refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash &&
      (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
  }, "Use an HTTPS endpoint or an explicit local endpoint without embedded credentials."),
  model: z.string().trim().min(1).max(150),
  accountReference: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/)
}).strict();
export const ProviderAllowanceSchema = z.object({
  maxRequests: z.number().int().min(1).max(1000),
  maxTokens: z.number().int().min(1).max(10000000),
  maxConcurrentJobs: z.literal(1)
}).strict();
const common = {
  schemaVersion: formatVersionSchema("provider-authorization/1"),
  authorizationId: z.string().uuid(), scope: ProviderScopeSchema,
  allowance: ProviderAllowanceSchema, approvedAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
  approvalEvidenceHash: Hash
};
export const ProviderAuthorizationSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("disabled") }).strict(),
  z.object({ ...common, mode: z.literal("verified_zero_cost"), entitlementEvidenceHash: Hash,
    maxSessionCostUsd: z.literal(0), inputUsdPerMillionTokens: z.literal(0), outputUsdPerMillionTokens: z.literal(0)
  }).strict(),
  z.object({ ...common, mode: z.literal("metered_with_approved_cap"),
    maxSessionCostUsd: z.number().positive().max(10000),
    inputUsdPerMillionTokens: z.number().positive().max(10000), outputUsdPerMillionTokens: z.number().positive().max(10000)
  }).strict()
]);
export type ProviderAuthorization = z.infer<typeof ProviderAuthorizationSchema>;
export type ActiveProviderAuthorization = Exclude<ProviderAuthorization, { mode: "disabled" }>;

/** An operator records this only after the human approved these exact bounded allowances. */
export const ProviderApprovalEvidenceSchema = z.object({
  kind: z.literal("human_provider_allowance"), authorizationId: z.string().uuid(),
  mode: z.enum(["verified_zero_cost", "metered_with_approved_cap"]),
  scope: ProviderScopeSchema, allowance: ProviderAllowanceSchema,
  maxSessionCostUsd: z.number().min(0).max(10000),
  inputUsdPerMillionTokens: z.number().min(0).max(10000), outputUsdPerMillionTokens: z.number().min(0).max(10000),
  approvedAt: z.iso.datetime(), expiresAt: z.iso.datetime(), confirmedByUser: z.literal(true)
}).strict();
/** Human-reviewed external entitlement evidence; never inferred from a key or a zero price. */
export const ZeroCostEntitlementEvidenceSchema = z.object({
  kind: z.literal("reviewed_provider_zero_cost_entitlement"),
  scope: ProviderScopeSchema, validFrom: z.iso.datetime(), validUntil: z.iso.datetime(),
  coversAllRequestsIncludingRetries: z.literal(true),
  source: z.enum(["provider_dashboard", "provider_contract", "provider_documentation"]),
  reference: z.string().trim().min(5).max(500), reviewedByUser: z.literal(true)
}).strict();

export function providerScopeKey(scope: z.infer<typeof ProviderScopeSchema>): string {
  return JSON.stringify({ baseUrl: new URL(scope.baseUrl).href.replace(/\/+$/, ""), model: scope.model, accountReference: scope.accountReference });
}
export function assertAuthorizationCurrent(authorization: ActiveProviderAuthorization, now = Date.now()): void {
  if (Date.parse(authorization.approvedAt) > now || Date.parse(authorization.expiresAt) <= now || Date.parse(authorization.expiresAt) <= Date.parse(authorization.approvedAt)) throw new Error("PROVIDER_AUTHORIZATION_EXPIRED");
}
