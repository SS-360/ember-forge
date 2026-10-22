import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  StockDatasetSchema,
  StockParametersSchema,
  TaskTraceSchema,
  type SourceMode,
  type TraceStep
} from "../packages/contracts/src/index.js";
import { reconcileStock, UnsupportedInputError } from "../packages/evaluator/src/index.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "fixtures", "dev", "stock-reconciliation.json");
const rawFixture = await readFile(fixturePath, "utf8");
const fixture = JSON.parse(rawFixture) as {
  fixtureLabel: string;
  parameters: unknown;
  dataset: unknown;
};
const dataset = StockDatasetSchema.parse(fixture.dataset);
if (dataset.sourceMode !== "fixture") {
  throw new Error("This script only accepts explicitly labeled fixture data.");
}
const parameters = StockParametersSchema.parse(fixture.parameters);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const outputDir = path.join(projectRoot, "artifacts", "runs");
await mkdir(outputDir, { recursive: true });

type RunCase = {
  label: string;
  sourceMode: SourceMode;
  data: typeof dataset;
  expected: "succeeded" | "unsupported";
};

const cases: RunCase[] = [
  {
    label: fixture.fixtureLabel,
    sourceMode: "fixture",
    data: dataset,
    expected: "succeeded"
  },
  {
    label: "SYNTHETIC UNSUPPORTED FIXTURE — unknown unit must be rejected",
    sourceMode: "fixture",
    data: {
      ...dataset,
      orders: dataset.orders.map((order, index) => index === 0 ? { ...order, unit: "PALLET" } : order)
    },
    expected: "unsupported"
  }
];

async function writeCase(runCase: RunCase): Promise<Record<string, unknown>> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const steps: TraceStep[] = [];

  function step<T>(
    id: string,
    kind: TraceStep["kind"],
    source: string | undefined,
    input: unknown,
    action: () => T
  ): T {
    const stepStartedAt = new Date().toISOString();
    const timerStart = performance.now();
    try {
      const output = action();
      const durationMs = performance.now() - timerStart;
      steps.push({
        id,
        kind,
        ...(source ? { source } : {}),
        ...(input === undefined ? {} : { inputHash: hash(JSON.stringify(input)) }),
        outputHash: hash(JSON.stringify(output)),
        startedAt: stepStartedAt,
        endedAt: new Date().toISOString(),
        durationMs,
        outcome: "succeeded"
      });
      return output;
    } catch (error) {
      const durationMs = performance.now() - timerStart;
      steps.push({
        id,
        kind,
        ...(source ? { source } : {}),
        ...(input === undefined ? {} : { inputHash: hash(JSON.stringify(input)) }),
        startedAt: stepStartedAt,
        endedAt: new Date().toISOString(),
        durationMs,
        outcome: "failed",
        ...(error instanceof UnsupportedInputError ? { errorCode: error.code } : {})
      });
      throw error;
    }
  }

  const orders = step("read_orders", "source_read", "fixture.orders", runCase.data.sourceVersions.orders, () => runCase.data.orders);
  const inventory = step("read_inventory", "source_read", "fixture.inventory", runCase.data.sourceVersions.inventory, () => runCase.data.inventory);
  const productRules = step("read_product_rules", "source_read", "fixture.productRules", runCase.data.sourceVersions.productRules, () => runCase.data.productRules);
  let result: ReturnType<typeof reconcileStock> | undefined;
  let outcome: "succeeded" | "unsupported" | "failed" = "succeeded";
  let unsupportedReason: string | undefined;
  try {
    result = step("reconcile", "aggregate", undefined, { orders, inventory, productRules, parameters }, () =>
      reconcileStock(parameters, { ...runCase.data, orders, inventory, productRules })
    );
    step("validate_output", "validate", undefined, result, () => {
      for (const line of result!.lines) {
        if (line.shortageEach !== Math.max(line.demandEach - line.onHandEach, 0)) {
          throw new Error("Output postcondition failed for " + line.sku);
        }
      }
      return { validLines: result!.lines.length };
    });
    step("emit_result", "emit", undefined, result, () => result);
  } catch (error) {
    if (error instanceof UnsupportedInputError) {
      outcome = "unsupported";
      unsupportedReason = error.code;
    } else {
      outcome = "failed";
    }
  }

  if (outcome !== runCase.expected) {
    throw new Error("Expected " + runCase.expected + " but received " + outcome);
  }

  const endedAt = new Date().toISOString();
  const trace = TaskTraceSchema.parse({
    runId,
    taskFamily: "stock-reconciliation",
    sourceMode: runCase.sourceMode,
    executor: "fixture_reference",
    startedAt,
    endedAt,
    modelCallCount: 0,
    steps,
    outcome,
    ...(result ? { resultHash: hash(JSON.stringify(result)) } : {}),
    ...(unsupportedReason ? { unsupportedReason } : {})
  });
  const artifact = {
    evidenceLabel: runCase.label,
    runId,
    taskFamily: "stock-reconciliation",
    sourceMode: runCase.sourceMode,
    executor: "fixture_reference",
    modelCallCount: 0,
    sourceVersions: runCase.data.sourceVersions,
    inputHash: hash(JSON.stringify({ parameters, data: runCase.data })),
    trace,
    ...(result ? { result } : {}),
    limitation: "Synthetic fixture evidence only. This is not a Nemotron baseline, live Zetaris query, or general correctness proof."
  };
  const outputPath = path.join(outputDir, runId + ".json");
  await writeFile(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  return {
    evidenceLabel: runCase.label,
    runId,
    outcome,
    modelCallCount: trace.modelCallCount,
    resultHash: trace.resultHash,
    unsupportedReason: trace.unsupportedReason,
    artifact: path.relative(projectRoot, outputPath)
  };
}

const evidence = [];
for (const runCase of cases) {
  evidence.push(await writeCase(runCase));
}
console.log(JSON.stringify({ cases: evidence }, null, 2));

