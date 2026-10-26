import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composeSynthesisProvider } from "../apps/api/src/provider-composition.js";
import { createNemotronAgentAdapter } from "../packages/compiler/src/nemotron-adapter.js";
import { AgentActionSchema, type AgentContext } from "../packages/compiler/src/agent-loop.js";
import { canonicalHash } from "../packages/compiler/src/trace-compiler.js";
import { assertAuthorizationCurrent } from "../packages/contracts/src/provider-authorization.js";
import { SynthesisProviderError } from "../packages/compiler/src/synthesis-controller.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(path.join(root, ".env"));
const provider = await composeSynthesisProvider(root, { approvedSpendingLimitUsd: 0 });
const runId = randomUUID(), startedAt = new Date().toISOString(), started = performance.now();
const evidence: Record<string, unknown> = { schemaVersion: "emberforge.provider-connectivity/1", runId, startedAt, status: "not_started", credentialsIncluded: false, reasoningIncluded: false, scope: "Single synthetic tool-protocol connectivity check; not stock correctness, original trajectory learning, or invoice verification." };
try {
  const { authorization, ledger, policy } = provider.dependencies;
  if (authorization?.mode !== "verified_zero_cost" || !ledger || !policy) throw new Error("FREE_PROVIDER_NOT_CONFIGURED");
  assertAuthorizationCurrent(authorization);
  const adapter = createNemotronAgentAdapter({ baseUrl: process.env.NVIDIA_BASE_URL!, model: process.env.NVIDIA_MODEL!, accountReference: process.env.NVIDIA_ACCOUNT_REFERENCE!, apiKey: process.env.NVIDIA_API_KEY!, maxOutputTokens: 4096, reasoningEffort: "none" });
  const context: AgentContext = { task: "stock-reconciliation", parameters: { warehouseId: "CONNECTIVITY-PROBE", fromDate: "2026-10-20", throughDate: "2026-10-23", policyVersion: "stock-v1" }, boundary: { policyVersion: "stock-v1", sourceSchemaVersions: { orders: "orders/v1", inventory: "inventory/v1", productRules: "product-rules/v1" }, maxRows: 5000, reserveEach: 0, eligibleStatus: "open" }, attempt: 1, observations: [{ request: "Connectivity check only. Choose inspect_schema for orders. No business data was supplied." }] };
  const bound = adapter.inputTokenUpperBound(context), outputCap = 512;
  if (bound > policy.maxInputTokens) throw new Error("PROBE_CONTEXT_TOO_LARGE");
  const reservation = ledger.reserve(0, { tokens: bound + outputCap, runId, call: 1 });
  Object.assign(evidence, { status: "request_reserved", model: authorization.scope.model, promptHash: adapter.promptHash, configHash: adapter.configHash, contextHash: canonicalHash(context), inputTokenReservation: bound, outputTokenCap: outputCap, accountingBasis: "NVIDIA free hosted prototyping endpoint; no invoice inspected" });
  const directory = path.join(root, "artifacts", "provider-probes"); await mkdir(directory, { recursive: true });
  const artifact = path.join(directory, runId + ".json");
  await writeFile(artifact, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  try {
    const result = await adapter.decide(context, { signal: AbortSignal.timeout(30000), maxOutputTokens: outputCap });
    if (result.usage.inputTokens > bound || result.usage.outputTokens > outputCap) { ledger.suspend?.("PROVIDER_USAGE_EXCEEDED_RESERVATION"); throw new Error("PROVIDER_USAGE_EXCEEDED_LIMIT"); }
    ledger.settle(reservation, 0, { tokens: result.usage.inputTokens + result.usage.outputTokens });
    const parsed = AgentActionSchema.safeParse(result.action);
    Object.assign(evidence, { status: parsed.success ? "tool_call_verified" : "invalid_tool_action", action: parsed.success ? parsed.data : undefined, usage: result.usage, requestId: result.requestId, responseHash: canonicalHash(result.action), usageUncertain: false });
    if (!parsed.success) process.exitCode = 1;
  } catch (error) {
    const usage = error instanceof SynthesisProviderError ? error.usage : undefined;
    if (usage) ledger.settle(reservation, 0, { tokens: usage.inputTokens + usage.outputTokens });
    Object.assign(evidence, { status: "failed", code: error instanceof SynthesisProviderError ? error.code : error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "PROVIDER_CONNECTIVITY_FAILED", usageUncertain: !usage, ...(usage ? { usage } : {}) });
    process.exitCode = 1;
  } finally {
    evidence.durationMs = performance.now() - started;
    await writeFile(artifact, JSON.stringify(evidence, null, 2) + "\n");
    console.log(JSON.stringify({ ...evidence, artifact: path.relative(root, artifact) }));
  }
} catch (error) {
  console.log(JSON.stringify({ status: "not_started", code: error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "PROVIDER_CONFIGURATION_FAILED", credentialsIncluded: false })); process.exitCode = 1;
} finally { provider.close(); }
