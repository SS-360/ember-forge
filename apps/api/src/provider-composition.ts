import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { ProviderAuthorizationSchema, ProviderApprovalEvidenceSchema, ZeroCostEntitlementEvidenceSchema, assertAuthorizationCurrent, providerScopeKey, type ProviderAuthorization } from "@pocketforge/contracts/provider-authorization";
import { createNemotronAdapter, type ProviderFetch } from "@pocketforge/compiler/nemotron-adapter";
import { canonicalHash } from "@pocketforge/compiler/trace-compiler";
import { PersistentProviderLedger } from "./provider-ledger.js";
import type { SynthesisDependencies } from "./synthesis.js";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function disabled(reason: string, authorizationMode: ProviderAuthorization["mode"] = "disabled") {
  return { dependencies: { authorization: { mode: "disabled" } as const, readinessReason: reason }, authorizationMode, close() {} };
}

/** Inert composition: no request is sent until an authorized job reserves its quotas. */
export async function composeSynthesisProvider(projectRoot: string, options: {
  approvedSpendingLimitUsd: number;
  environment?: NodeJS.ProcessEnv;
  /** Injected transports always retain test-only provenance, including zero-cost authorization checks. */
  testTransport?: ProviderFetch;
}): Promise<{ dependencies: SynthesisDependencies; authorizationMode: ProviderAuthorization["mode"]; close: () => void }> {
  const privateRoot = path.join(projectRoot, ".local");
  let authorization: ProviderAuthorization;
  try { authorization = ProviderAuthorizationSchema.parse(JSON.parse(await readFile(path.join(privateRoot, "provider-authorization.json"), "utf8"))); }
  catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    return disabled(missing ? "Provider execution is disabled. No server-owned authorization or confirmed free entitlement is configured." : "Provider authorization is invalid; execution remains disabled.");
  }
  if (authorization.mode === "disabled") return disabled("Provider execution is disabled in the server-owned authorization record.");
  let ledger: PersistentProviderLedger | undefined;
  try {
    assertAuthorizationCurrent(authorization);
    if (!Number.isFinite(options.approvedSpendingLimitUsd) || options.approvedSpendingLimitUsd < 0 || authorization.maxSessionCostUsd > options.approvedSpendingLimitUsd) return disabled("The configured metered allowance exceeds the human-approved session spending ceiling.", authorization.mode);
    const approvalBytes = await readFile(path.join(privateRoot, "provider-approval.json"));
    if (hash(approvalBytes) !== authorization.approvalEvidenceHash) throw new Error("APPROVAL_EVIDENCE_HASH_MISMATCH");
    const approval = ProviderApprovalEvidenceSchema.parse(JSON.parse(approvalBytes.toString("utf8")));
    const expectedApproval = {
      kind: "human_provider_allowance", authorizationId: authorization.authorizationId, mode: authorization.mode,
      scope: authorization.scope, allowance: authorization.allowance,
      maxSessionCostUsd: authorization.maxSessionCostUsd,
      inputUsdPerMillionTokens: authorization.inputUsdPerMillionTokens, outputUsdPerMillionTokens: authorization.outputUsdPerMillionTokens,
      approvedAt: authorization.approvedAt, expiresAt: authorization.expiresAt, confirmedByUser: true
    };
    if (canonicalHash(approval) !== canonicalHash(expectedApproval)) throw new Error("APPROVAL_SCOPE_MISMATCH");
    if (authorization.mode === "verified_zero_cost") {
      const entitlementBytes = await readFile(path.join(privateRoot, "provider-entitlement.json"));
      if (hash(entitlementBytes) !== authorization.entitlementEvidenceHash) throw new Error("ENTITLEMENT_EVIDENCE_HASH_MISMATCH");
      const entitlement = ZeroCostEntitlementEvidenceSchema.parse(JSON.parse(entitlementBytes.toString("utf8")));
      if (providerScopeKey(entitlement.scope) !== providerScopeKey(authorization.scope) || Date.parse(entitlement.validFrom) > Date.now() || Date.parse(entitlement.validUntil) < Date.parse(authorization.expiresAt)) throw new Error("ENTITLEMENT_SCOPE_OR_EXPIRY_MISMATCH");
    }
    const environment = options.environment ?? process.env;
    if (!environment.NVIDIA_API_KEY || !environment.NVIDIA_BASE_URL || !environment.NVIDIA_MODEL || !environment.NVIDIA_ACCOUNT_REFERENCE) return disabled("Authorization evidence is present; the matching server-only endpoint, model, account reference and credential are still required.", authorization.mode);
    const configuredScope = { baseUrl: environment.NVIDIA_BASE_URL, model: environment.NVIDIA_MODEL, accountReference: environment.NVIDIA_ACCOUNT_REFERENCE };
    if (providerScopeKey(configuredScope) !== providerScopeKey(authorization.scope)) throw new Error("PROVIDER_CONFIGURATION_SCOPE_MISMATCH");
    ledger = new PersistentProviderLedger(path.join(privateRoot, "provider-ledger.sqlite"), authorization);
    if (ledger.snapshot().suspended) { ledger.close(); return disabled("This authorization is suspended after a quota/accounting incident; it cannot make another request.", authorization.mode); }
    const maxProviderCalls = Math.min(6, authorization.allowance.maxRequests);
    const adapter = createNemotronAdapter({ baseUrl: configuredScope.baseUrl, model: configuredScope.model, accountReference: configuredScope.accountReference, apiKey: environment.NVIDIA_API_KEY, maxOutputTokens: 4096 }, options.testTransport ? { transport: options.testTransport } : undefined);
    const providerLedger = ledger;
    return {
      authorizationMode: authorization.mode,
      dependencies: {
        adapter, authorization, ledger: providerLedger, dispose() { providerLedger.close(); },
        readinessReason: adapter.mode === "test_only" ? "Test-only injected transport; entitlement and bounded allowance checks still apply. No live model evidence." : authorization.mode === "verified_zero_cost" ? "Server-owned, human-reviewed zero-cost entitlement with finite request/token quotas." : "Server-owned metered allowance with an approved spending cap.",
        policy: {
          authorization, maxRevisions: Math.min(3, maxProviderCalls), maxProviderCalls,
          maxInputTokens: 64000, maxOutputTokens: 4096, maxTotalTokens: Math.min(192000, authorization.allowance.maxTokens),
          timeoutMs: 90000, perCallTimeoutMs: 30000,
          maxCompilationCostUsd: authorization.maxSessionCostUsd,
          inputUsdPerMillionTokens: authorization.inputUsdPerMillionTokens, outputUsdPerMillionTokens: authorization.outputUsdPerMillionTokens
        }
      },
      close() { providerLedger.close(); }
    };
  } catch {
    ledger?.close();
    // Never return raw configuration, evidence bodies, credential values or transport errors.
    return disabled("Provider authorization, entitlement, scope or persistent accounting could not be confirmed. Execution remains disabled.", authorization.mode);
  }
}
