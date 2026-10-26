import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TraceSetSchema } from "@emberforge/contracts/traces";
import { buildDevelopmentSuite } from "../src/development-suite.js";
import { captureReplayExamples } from "../src/trace-fixtures.js";
import { compileFromTraces, deterministicTraceAdapter } from "../src/trace-compiler.js";

const root = new URL("../../../", import.meta.url);
const fixture = JSON.parse(await readFile(fileURLToPath(new URL("fixtures/dev/stock-reconciliation.json", root)), "utf8"));
const skill = JSON.parse(await readFile(fileURLToPath(new URL("skills/stock-reconciliation/skill.json", root)), "utf8"));
const contract = JSON.parse(await readFile(fileURLToPath(new URL("skills/stock-reconciliation/contract.json", root)), "utf8"));
const examples = captureReplayExamples(skill, contract, fixture);
const compile = (traces: unknown[]) => compileFromTraces({ traces, skillId: "trace-assembled-check", developmentCases: buildDevelopmentSuite(fixture) });

describe("sanitized trace compilation", () => {
  it("captures real successful and failing operation events without raw input values", () => {
    const roundTrip = TraceSetSchema.parse(JSON.parse(JSON.stringify(examples)));
    expect(roundTrip.traces.filter((trace) => trace.label.outcome === "succeeded")).toHaveLength(2);
    const counterexample = roundTrip.traces.find((trace) => trace.label.outcome === "unsupported")!;
    expect(counterexample.calls.at(-1)).toMatchObject({ outcome: "failed", errorCode: "UNKNOWN_UNIT", operation: { id: "lookup_unit_factor" } });
    expect(JSON.stringify(roundTrip)).not.toContain(fixture.parameters.warehouseId);
    expect(JSON.stringify(roundTrip)).not.toContain(fixture.dataset.orders[0].orderId);
    expect(roundTrip.traces[0]?.outputArtifactHash).toBe(roundTrip.traces[0]?.calls.at(-1)?.outputHash);
  });

  it("assembles the input operation graph with lineage and independently verifies the new candidate", async () => {
    const traces = structuredClone(examples.traces);
    // Rename every operation/reference to prove the adapter consumes the traces rather than seed IDs.
    const ids = new Map(traces[0]!.calls.map((call, index) => [call.operation.id, "observed_" + index]));
    for (const trace of traces) for (const call of trace.calls) {
      call.operation.id = ids.get(call.operation.id)!;
      for (const key of ["input", "table", "left", "right"] as const) {
        if (key in call.operation) {
          const operation = call.operation as unknown as Record<string, string>;
          operation[key] = ids.get(operation[key]!)!;
        }
      }
    }
    const result = await compile(traces);
    expect(result.skill.ir.operations[0]?.id).toBe("observed_0");
    expect(result.verification.status).toBe("validated");
    expect(result.verification.candidateOrigin).toBe("deterministic_trace_assembly");
    expect(result.lineage.traces).toHaveLength(3);
    expect(result.lineage.operations.every((item) => item.traceIds.length === 2)).toBe(true);
    expect(result.lineage.traces.some((trace) => trace.outcome === "unsupported")).toBe(true);
  });

  it("rejects graph disagreement and duplicate successful input evidence", async () => {
    const differing = structuredClone(examples.traces);
    const compute = differing[1]!.calls.find((call) => call.operation.kind === "compute")!.operation;
    if (compute.kind === "compute") compute.leftField = "onHandEach";
    await expect(compile(differing)).rejects.toMatchObject({ code: "TRACE_STRUCTURE_DIFFERS" });
    const duplicate = structuredClone(examples.traces);
    duplicate[1]!.inputHash = duplicate[0]!.inputHash;
    await expect(compile(duplicate)).rejects.toMatchObject({ code: "DUPLICATE_INPUT_EVIDENCE" });
  });

  it("retains a rejected revision when agreeing traces describe an incorrect procedure", async () => {
    const wrong = structuredClone(examples.traces);
    for (const trace of wrong) for (const call of trace.calls) {
      if (call.operation.kind === "compute") {
        call.operation.leftField = "onHandEach";
        call.operation.rightField = "demandEach";
      }
    }
    const result = await compile(wrong);
    expect(result.exportable).toBe(false);
    expect(result.verification.status).toBe("rejected");
    expect(result.revisions[0]?.status).toBe("rejected");
  });

  it("rejects raw log fields, input-specific literals, and promoted failed labels", () => {
    expect(TraceSetSchema.safeParse({ ...examples, rawProviderLog: { apiKey: "should-never-be-stored" } }).success).toBe(false);
    const unredacted = structuredClone(examples);
    const filter = unredacted.traces[0]!.calls.find((call) => call.operation.kind === "filter")!.operation;
    if (filter.kind === "filter") filter.predicates[1]!.value = { kind: "literal", value: "private-warehouse" };
    expect(TraceSetSchema.safeParse(unredacted).success).toBe(false);
    const promoted = structuredClone(examples);
    promoted.traces[2]!.label = { authority: "independent_evaluator", evaluatorVersion: "stock-reference/1", outcome: "succeeded" };
    expect(TraceSetSchema.safeParse(promoted).success).toBe(false);
  });

  it("keeps development cases outside adapter context and cancels a stalled adapter", async () => {
    const seenKeys: string[] = [];
    await compileFromTraces({ traces: examples.traces, skillId: "context-isolation-check", developmentCases: buildDevelopmentSuite(fixture), adapter: {
      id: deterministicTraceAdapter.id,
      async generate(context, signal) { seenKeys.push(...Object.keys(context)); return deterministicTraceAdapter.generate(context, signal); }
    } });
    expect(seenKeys.sort()).toEqual(["limits", "skillId", "traces", "version"]);
    await expect(compileFromTraces({ traces: examples.traces, skillId: "cancelled-check", developmentCases: buildDevelopmentSuite(fixture), timeoutMs: 20, adapter: {
      id: deterministicTraceAdapter.id, async generate() { return new Promise(() => {}); }
    } })).rejects.toMatchObject({ name: "TimeoutError" });
  });
});
