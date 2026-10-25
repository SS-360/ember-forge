import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildProtocolSplit, assertSplitSeparation } from "@pocketforge/evaluator/protocol";
import { SkillDefinitionSchema, type SkillOperation } from "@pocketforge/contracts";
import { captureReplayCases } from "../src/trace-fixtures.js";
import { compileFromTraces } from "../src/trace-compiler.js";
import { verifyCandidate } from "../src/index.js";
import { synthesizeCandidate, InMemoryCostLedger, SynthesisProviderError, type SynthesisAdapter, type SynthesisContext, type SynthesisPolicy } from "../src/synthesis-controller.js";

const root = new URL("../../../", import.meta.url);
const seed = SkillDefinitionSchema.parse(JSON.parse(await readFile(fileURLToPath(new URL("skills/stock-reconciliation/skill.json", root)), "utf8")));
const contract = JSON.parse(await readFile(fileURLToPath(new URL("skills/stock-reconciliation/contract.json", root)), "utf8"));
const compilation = buildProtocolSplit("compilation", "controller-compilation-2");
const development = buildProtocolSplit("development", "controller-development-2");
const traces = captureReplayCases(seed, contract, compilation.cases).traces;
const policy: SynthesisPolicy = { maxRevisions: 3, maxProviderCalls: 4, maxInputTokens: 1000, maxOutputTokens: 1000, maxTotalTokens: 10000, timeoutMs: 10000, perCallTimeoutMs: 1000, maxCompilationCostUsd: 1, inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 1 };

function renameOperations(operations: SkillOperation[], prefix: string): SkillOperation[] {
  const names = new Map(operations.map((operation, index) => [operation.id, prefix + index]));
  return operations.map((source) => {
    const operation = structuredClone(source);
    operation.id = names.get(operation.id)!;
    for (const field of ["input", "left", "right", "table"] as const) if (field in operation) {
      const record = operation as unknown as Record<string, string>;
      record[field] = names.get(record[field]!)!;
    }
    return operation;
  });
}
function draft(context: SynthesisContext, wrong = false) {
  const skill = structuredClone(seed);
  skill.id = context.skillId; skill.version = context.version;
  skill.ir.operations = renameOperations(skill.ir.operations, "generated_");
  skill.ir.outputStep = skill.ir.operations.at(-1)!.id;
  if (wrong) for (const operation of skill.ir.operations) if (operation.kind === "compute") { operation.leftField = "onHandEach"; operation.rightField = "demandEach"; }
  return { skill, contract: { ...structuredClone(contract), skillId: context.skillId, skillVersion: context.version } };
}
function fakeAdapter(generate: SynthesisAdapter["generate"]): SynthesisAdapter {
  return { id: "test-only-scripted-generation/1", mode: "test_only", inputTokenUpperBound: () => 800, generate };
}
const response = (context: SynthesisContext, wrong = false) => ({ draft: draft(context, wrong), usage: { inputTokens: 300, outputTokens: 400 }, requestId: "test-fixture-request-" + context.revision });
const run = (adapter: SynthesisAdapter, overrides: Partial<Parameters<typeof synthesizeCandidate>[0]> = {}) => synthesizeCandidate({ skillId: "synthesis-controller-check", traces, developmentCases: development.cases, adapter, policy, ...overrides });

describe("bounded synthesis controller with test-only transports", () => {
  it("repairs a rejected candidate from varied trajectories that exact graph replay cannot reconcile", async () => {
    const varied = structuredClone(traces);
    const renamed = renameOperations(varied[1]!.calls.map((call) => call.operation), "alternative_");
    varied[1]!.calls.forEach((call, index) => { call.operation = renamed[index]!; });
    await expect(compileFromTraces({ skillId: "assembly-baseline-check", traces: varied, developmentCases: development.cases })).rejects.toMatchObject({ code: "TRACE_STRUCTURE_DIFFERS" });
    const contexts: SynthesisContext[] = [];
    const result = await run(fakeAdapter(async (context) => { contexts.push(structuredClone(context)); return response(context, context.revision === 1); }), { traces: varied });
    expect(result.state).toBe("validated");
    expect(result.revisions.map((revision) => revision.status)).toEqual(["rejected", "validated"]);
    expect(contexts[1]?.feedback?.stage).toBe("development_verification");
    expect(contexts[1]?.previousCandidate).toBeDefined();
    expect(result.candidate?.verification.candidateOrigin).toBe("test_synthesis");
    expect(result.lineage.method).toBe("test_synthesis");
    expect(result.usage.basis).toBe("test_fixture");
    expect(result.lineage.operations.every((operation) => operation.traceIds.length === 0)).toBe(true);
    expect(Object.keys(contexts[0]!).sort()).toEqual(["limits", "revision", "skillId", "taskFamily", "traces", "version"]);
    expect(JSON.stringify(contexts[0]).includes(development.cases[0]!.caseId)).toBe(false);
    const privateWarehouse = (development.cases[0]!.parameters as { warehouseId: string }).warehouseId;
    expect(JSON.stringify(contexts).includes(privateWarehouse)).toBe(false);
    // Freeze a separate test-only holdout only after generation completes, then evaluate outside the adapter.
    const frozen = buildProtocolSplit("frozen", "post-generation-test-holdout-2");
    assertSplitSeparation([compilation, development, frozen]);
    expect(JSON.stringify(contexts).includes(frozen.seedHash)).toBe(false);
    const heldout = verifyCandidate(result.candidate!.skill, result.candidate!.contract, frozen.cases);
    expect(heldout.status).toBe("validated");
    expect(result.attempts[0]?.contextHash).not.toBe(result.attempts[1]?.contextHash);
  });

  it("blocks compilation/development input overlap before calling the adapter", async () => {
    let called = false;
    await expect(run(fakeAdapter(async (context) => { called = true; return response(context); }), { developmentCases: compilation.cases })).rejects.toMatchObject({ code: "EVALUATION_INPUT_OVERLAP" });
    expect(called).toBe(false);
  });

  it("rejects arbitrary draft fields, then accepts a typed repaired draft", async () => {
    const result = await run(fakeAdapter(async (context) => ({ ...response(context), draft: context.revision === 1 ? { ...draft(context), script: "untrusted code must never execute" } : draft(context) })));
    expect(result.revisions.map((revision) => revision.status)).toEqual(["static_invalid", "validated"]);
  });

  it("enforces revision and call limits without relaxing failed verification", async () => {
    const result = await run(fakeAdapter(async (context) => response(context, true)), { policy: { ...policy, maxRevisions: 2, maxProviderCalls: 2 } });
    expect(result.state).toBe("rejected");
    expect(result.revisions).toHaveLength(2);
    expect(result.candidate?.exportable).toBe(false);
    expect(result.usage.providerCalls).toBe(2);
  });

  it("reserves cost and tokens before transport and stops on an exhausted session ledger", async () => {
    let called = false;
    const result = await run(fakeAdapter(async (context) => { called = true; return response(context); }), { ledger: new InMemoryCostLedger(0.0001) });
    expect(result.state).toBe("budget_exhausted"); expect(called).toBe(false);
    const tokens = await run(fakeAdapter(async (context) => response(context)), { policy: { ...policy, maxTotalTokens: 100 } });
    expect(tokens.failure?.code).toBe("TOKEN_BUDGET_EXHAUSTED");
    expect(tokens.usage.providerCalls).toBe(0);
  });

  it("retains an uncertain reservation on transport failure and bounds a retry", async () => {
    let calls = 0;
    const ledger = new InMemoryCostLedger(1);
    const result = await run(fakeAdapter(async (context) => { if (++calls === 1) throw new SynthesisProviderError("RATE_LIMITED", "Test-only transient response", true); return response(context); }), { ledger });
    expect(result.state).toBe("validated"); expect(result.usage.providerCalls).toBe(2);
    expect(result.usage.uncertainUsageCalls).toBe(1);
    expect(ledger.snapshot().pendingReservationCount).toBe(1);
    expect(ledger.snapshot().chargedUsd).toBeCloseTo(result.usage.accountedUsd);
  });

  it("cancels a stalled transport and cannot export a candidate with excessive reported usage", async () => {
    const abort = new AbortController();
    const pending = run(fakeAdapter(async () => new Promise(() => {})), { signal: abort.signal });
    setTimeout(() => abort.abort(), 10);
    expect((await pending).state).toBe("cancelled");
    const exceeded = await run(fakeAdapter(async (context) => ({ ...response(context), usage: { inputTokens: 2000, outputTokens: 2000 } })));
    expect(exceeded.failure?.code).toBe("PROVIDER_USAGE_EXCEEDED_LIMIT");
    expect(exceeded.candidate).toBeUndefined();
  });
});
