import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createOperationSession } from "@emberforge/runtime";
import { runOriginalAgent, type AgentAdapter } from "../src/agent-loop.js";
import { parseCsv } from "../src/sample-import.js";
import { InMemoryCostLedger, SynthesisProviderError, type SynthesisPolicy } from "../src/synthesis-controller.js";

const fixture = JSON.parse(await readFile(new URL("../../../fixtures/dev/stock-reconciliation.json", import.meta.url), "utf8"));
const contract = JSON.parse(await readFile(new URL("../../../skills/stock-reconciliation/contract.json", import.meta.url), "utf8"));
const policy: SynthesisPolicy = { maxRevisions: 2, maxProviderCalls: 3, maxInputTokens: 2000, maxOutputTokens: 200, maxTotalTokens: 10000, timeoutMs: 5000, perCallTimeoutMs: 1000, maxCompilationCostUsd: 0, inputUsdPerMillionTokens: 0, outputUsdPerMillionTokens: 0 };
const adapter = (decide: AgentAdapter["decide"]): AgentAdapter => ({ id: "test-only-original-agent/1", mode: "test_only", configHash: "a".repeat(64), inputTokenUpperBound: () => 800, decide });

describe("original-agent preparation (offline diagnostics; not model-learning evidence)", () => {
  it("parses quoted CSV without accepting extra characters after a closing quote", () => {
    expect(parseCsv('alias,canonicalSku\r\n"name, one","SKU"\r\n')).toEqual([{ alias: "name, one", canonicalSku: "SKU" }]);
    expect(() => parseCsv('alias,canonicalSku\n"bad"x,SKU')).toThrow("CSV_INVALID_QUOTE");
  });
  it("requires lookup tables to exist before a lookup executes", () => {
    const session = createOperationSession(contract, fixture.parameters, fixture.dataset);
    session.execute({ id: "orders", kind: "source_read", source: "orders" });
    expect(() => session.execute({ id: "resolve", kind: "lookup", input: "orders", table: "future_aliases", keyField: "sku", tableKeyField: "alias", valueField: "canonicalSku", outputField: "canonicalSku", missingCode: "UNKNOWN_SKU_ALIAS" })).toThrow("unavailable step");
  });
  it("keeps preflight policy refusal distinct from an original-model trace", async () => {
    let providerCalls = 0;
    const result = await runOriginalAgent({ parameters: fixture.parameters, dataset: fixture.dataset, policyVersion: "different-policy", evidenceClass: "synthetic_fixture", policy, adapter: adapter(async () => { providerCalls++; throw new Error("must not be called"); }) });
    expect(providerCalls).toBe(0); expect(result.status).toBe("refused"); expect(result.traces).toHaveLength(0);
  });
  it("records independently correct original-agent refusals without inventing operations", async () => {
    const dataset = structuredClone(fixture.dataset);
    for (const order of dataset.orders) order.unit = "unknown-test-unit";
    const result = await runOriginalAgent({ parameters: fixture.parameters, dataset, evidenceClass: "synthetic_fixture", policy, adapter: adapter(async (context) => {
      expect(JSON.stringify(context)).not.toContain("expectedResult");
      return { action: { kind: "refuse", reason: "UNKNOWN_UNIT" }, usage: { inputTokens: 30, outputTokens: 20 } };
    }) });
    expect(result.traces[0]).toMatchObject({ calls: [], failureStage: "agent_refusal", label: { outcome: "unsupported", reason: "UNKNOWN_UNIT" }, agentOrigin: { mode: "test_only" } });
    expect(result.calls).toHaveLength(1);
  });
  it("captures source snapshots with genuine content-addressed source versions", async () => {
    const dataset = structuredClone(fixture.dataset); dataset.sourceMode = "snapshot";
    dataset.sourceVersions = { orders: "zetaris:" + "a".repeat(64), inventory: "zetaris:" + "b".repeat(64), productRules: "zetaris:" + "c".repeat(64) };
    for (const order of dataset.orders) order.unit = "unknown-snapshot-unit";
    const result = await runOriginalAgent({ parameters: fixture.parameters, dataset, evidenceClass: "synthetic_fixture", policy, adapter: adapter(async () => ({ action: { kind: "refuse", reason: "UNKNOWN_UNIT" }, usage: { inputTokens: 30, outputTokens: 20 } })) });
    expect(result.status).toBe("refused"); expect(result.traces[0]?.sourceMode).toBe("snapshot"); expect(result.traces[0]?.sourceVersions).toEqual(dataset.sourceVersions);
  });
  it("rejects direct live source execution before contacting the model", async () => {
    let calls = 0;
    await expect(runOriginalAgent({ parameters: fixture.parameters, dataset: { ...fixture.dataset, sourceMode: "live" }, evidenceClass: "synthetic_fixture", policy, adapter: adapter(async () => { calls++; throw Error("must not run"); }) })).rejects.toMatchObject({ code: "SOURCE_MODE_UNVERIFIED" });
    expect(calls).toBe(0);
  });
  it("retains the reservation when usage is unknown and starts no second request", async () => {
    const ledger = new InMemoryCostLedger(0);
    const result = await runOriginalAgent({ parameters: fixture.parameters, dataset: fixture.dataset, evidenceClass: "synthetic_fixture", policy, ledger, adapter: adapter(async () => { throw new Error("ambiguous transport failure"); }) });
    expect(result.calls).toHaveLength(1); expect(result.calls[0]?.usageUncertain).toBe(true);
    expect(ledger.snapshot().pendingReservationCount).toBe(1); expect(result.status).toBe("failed");
  });
  it("honors cancellation at the persisted pre-transport checkpoint", async () => {
    let providerCalls = 0; const controller = new AbortController();
    const result = await runOriginalAgent({ parameters: fixture.parameters, dataset: fixture.dataset, evidenceClass: "synthetic_fixture", policy, signal: controller.signal, checkpoint: async (run) => { if (run.events.at(-1)?.state === "proposing") controller.abort(); }, adapter: adapter(async () => { providerCalls++; throw new Error("must not be called"); }) });
    expect(providerCalls).toBe(0); expect(result.status).toBe("cancelled");
  });
  it("settles measured usage on rejected provider responses instead of marking it unknown", async () => {
    const ledger = new InMemoryCostLedger(0);
    const result = await runOriginalAgent({ parameters: fixture.parameters, dataset: fixture.dataset, evidenceClass: "synthetic_fixture", policy, ledger, adapter: adapter(async () => { throw new SynthesisProviderError("AGENT_TOOL_CALL_COUNT_INVALID", "Invalid call count.", false, { inputTokens: 40, outputTokens: 30 }); }) });
    expect(result.calls[0]).toMatchObject({ usage: { inputTokens: 40, outputTokens: 30 }, usageUncertain: false });
    expect(ledger.snapshot().pendingReservationCount).toBe(0); expect(result.calls).toHaveLength(1);
  });
  it("records an unjustified refusal as a failed attempt rather than a supported boundary", async () => {
    const result = await runOriginalAgent({ parameters: fixture.parameters, dataset: fixture.dataset, evidenceClass: "synthetic_fixture", policy, adapter: adapter(async () => ({ action: { kind: "refuse", reason: "INSUFFICIENT_CONTEXT" }, usage: { inputTokens: 30, outputTokens: 20 } })) });
    expect(result.status).toBe("failed"); expect(result.traces).toHaveLength(0);
    expect(result.attempts.every((attempt) => attempt.verdict === "NEEDLESS_REFUSAL")).toBe(true);
  });
  it("stops after an independently confirmed tool rejection without asking the model to guess a repair", async () => {
    const dataset = structuredClone(fixture.dataset); for (const order of dataset.orders) order.unit = "unknown-test-unit";
    let calls = 0;
    const result = await runOriginalAgent({ parameters: fixture.parameters, dataset, evidenceClass: "synthetic_fixture", policy, adapter: adapter(async () => {
      calls++; return { action: { kind: "execute", operations: [
        { id: "orders", kind: "source_read", source: "orders" }, { id: "units", kind: "source_read", source: "unitConversions" },
        { id: "lookup_units", kind: "lookup", input: "orders", table: "units", keyField: "unit", tableKeyField: "unit", valueField: "eachPerUnit", outputField: "factor", missingCode: "UNKNOWN_UNIT" }
      ] }, usage: { inputTokens: 30, outputTokens: 100 } };
    }) });
    expect(calls).toBe(1); expect(result.status).toBe("refused"); expect(result.reason).toBe("UNKNOWN_UNIT");
    expect(result.traces[0]?.label.outcome).toBe("unsupported");
  });
});
