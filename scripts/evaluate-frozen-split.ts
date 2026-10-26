import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const splitDirectory = path.join(projectRoot, "evaluation", "frozen-v1");
const exportArgument = process.argv[2];
if (!exportArgument) throw new Error("Usage: pnpm eval:frozen <export-directory>");
const exportDirectory = path.resolve(projectRoot, exportArgument);

interface FrozenCase {
  caseId: string;
  parameters: unknown;
  dataset: unknown;
}
interface Label {
  expectedOutcome: "supported" | "unsupported";
  expectedResultHash?: string;
  expectedReason?: string;
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort().map((key) => [key, normalize(object[key])]));
  }
  return value;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

const [inputManifestText, labelsText, verificationText, skillText, contractText] = await Promise.all([
  readFile(path.join(splitDirectory, "inputs.json"), "utf8"),
  readFile(path.join(splitDirectory, "labels.json"), "utf8"),
  readFile(path.join(exportDirectory, "verification.json"), "utf8"),
  readFile(path.join(exportDirectory, "skill.json"), "utf8"),
  readFile(path.join(exportDirectory, "contract.json"), "utf8")
]);
const inputManifest = JSON.parse(inputManifestText) as { cases: FrozenCase[] };
const labels = JSON.parse(labelsText) as { labels: Record<string, Label> };
const verification = JSON.parse(verificationText) as { status: string; candidateHash: string };
const candidateHash = hash({ skill: JSON.parse(skillText), contract: JSON.parse(contractText) });
assert.equal(verification.status, "validated", "candidate must pass its visible development suite");
assert.equal(verification.candidateHash, candidateHash, "export verification is stale for this candidate");

const runtimePath = path.join(exportDirectory, "runtime", "emberforge-runtime.mjs");
// Historical exports retain their original filenames and hash-bound manifests.
const packageRuntime = await readFile(runtimePath).then(() => runtimePath).catch((error: NodeJS.ErrnoException) => {
  if (error.code !== "ENOENT") throw error;
  return path.join(exportDirectory, "runtime", "pocketforge-runtime.mjs");
});
const scratch = await mkdtemp(path.join(os.tmpdir(), "emberforge-frozen-"));
const results: Array<{ caseId: string; expectedOutcome: string; actualOutcome: string; passed: boolean; reason?: string; durationMs: number }> = [];
try {
  const networkGuard = pathToFileURL(path.join(exportDirectory, "tests", "network-guard.mjs")).href;
  for (const testCase of inputManifest.cases) {
    const label = labels.labels[testCase.caseId];
    assert.ok(label, "frozen label missing for " + testCase.caseId);
    const inputPath = path.join(scratch, testCase.caseId + ".json");
    await writeFile(inputPath, JSON.stringify({ parameters: testCase.parameters, dataset: testCase.dataset }), "utf8");
    const startedAt = performance.now();
    const child = spawnSync(process.execPath, [
      "--import", networkGuard,
      packageRuntime,
      "--input", inputPath
    ], {
      cwd: exportDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        NVIDIA_API_KEY: "dummy-offline-evaluation-key",
        NVIDIA_BASE_URL: "https://offline.invalid",
        ZETARIS_API_KEY: "dummy-offline-evaluation-key"
      }
    });
    const durationMs = performance.now() - startedAt;
    let actualOutcome: string;
    let reason: string | undefined;
    if (label.expectedOutcome === "supported") {
      if (child.status !== 0) {
        actualOutcome = "rejected_supported";
        try { reason = JSON.parse(child.stderr).reason; } catch { reason = "RUNTIME_ERROR"; }
      } else {
        const output = JSON.parse(child.stdout) as { modelCallCount: number; records: unknown };
        assert.equal(output.modelCallCount, 0);
        const actualHash = hash(output.records);
        actualOutcome = actualHash === label.expectedResultHash ? "correct" : "incorrect";
        reason = actualHash;
      }
    } else {
      if (child.status !== 2) {
        actualOutcome = "false_acceptance";
      } else {
        try { reason = JSON.parse(child.stderr).reason; } catch { reason = "RUNTIME_ERROR"; }
        actualOutcome = reason === label.expectedReason ? "rejected_correctly" : "rejected_wrong_reason";
      }
    }
    const passed = actualOutcome === "correct" || actualOutcome === "rejected_correctly";
    results.push({ caseId: testCase.caseId, expectedOutcome: label.expectedOutcome, actualOutcome, passed, ...(reason ? { reason } : {}), durationMs });
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}

const supported = results.filter((item) => item.expectedOutcome === "supported");
const unsupported = results.filter((item) => item.expectedOutcome === "unsupported");
const report = {
  schemaVersion: "emberforge.frozen-evaluation-report/1",
  split: "frozen-smoke-v1",
  scope: "Small synthetic smoke split; not held-out or representative evaluation. One procedure family only.",
  candidateHash,
  passed: results.filter((item) => item.passed).length,
  total: results.length,
  correctSupported: supported.filter((item) => item.actualOutcome === "correct").length,
  supportedTotal: supported.length,
  correctRejections: unsupported.filter((item) => item.actualOutcome === "rejected_correctly").length,
  unsupportedTotal: unsupported.length,
  falseAcceptances: unsupported.filter((item) => item.actualOutcome === "false_acceptance").length,
  cases: results,
  generatedAt: new Date().toISOString()
};
await writeFile(path.join(splitDirectory, "latest-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
if (report.passed !== report.total) process.exitCode = 1;
