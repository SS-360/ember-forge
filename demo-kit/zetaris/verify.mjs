import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runtime = path.join(root, "demo-kit", "skill", "runtime", "emberforge-runtime.mjs");
const guard = path.join(root, "demo-kit", "skill", "tests", "network-guard.mjs");
const bootstrap = "process.argv=[process.execPath,process.env.EF_RUNTIME_URL,'--input',process.env.EF_INPUT,'--output',process.env.EF_OUTPUT];import(process.env.EF_RUNTIME_URL).catch(error=>{console.error(error);process.exitCode=1})";
const run = (input) => {
  const outputPath = path.join(os.tmpdir(), "emberforge-zetaris-" + randomUUID() + ".json");
  const child = spawnSync(process.execPath, ["--import", pathToFileURL(guard).href, "-e", bootstrap], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    timeout: 10000,
    env: {
    PATH: process.env.PATH ?? "",
    SystemRoot: process.env.SystemRoot ?? "",
    TEMP: os.tmpdir(),
      TMP: os.tmpdir(),
      EF_RUNTIME_URL: pathToFileURL(runtime).href,
      EF_INPUT: path.join(root, "demo-kit", "zetaris", input),
      EF_OUTPUT: outputPath
    }
  });
  const result = child.status === 0
    ? JSON.parse(readFileSync(outputPath, "utf8"))
    : JSON.parse(child.stderr);
  try { rmSync(outputPath); } catch {}
  return { status: child.status, result, stderr: child.stderr };
};

const supported = run("input.json");
assert.equal(supported.status, 0, supported.stderr);
const output = supported.result;
assert.equal(output.status, "succeeded");
assert.equal(output.skillId, "zetaris-stock-207ca2ab-retry-3");
assert.equal(output.skillVersion, "0.1.0");
assert.equal(output.executionMode, "bounded-local-interpreter");
assert.deepEqual(output.records, [
  { sku: "CUP-RED", demandEach: 25, onHandEach: 15, shortageEach: 10 },
  { sku: "MUG-BLUE", demandEach: 5, onHandEach: 8, shortageEach: 0 }
]);

const unsupported = run("unsupported.json");
assert.equal(unsupported.status, 2, unsupported.stderr);
const refusal = unsupported.result;
assert.equal(refusal.status, "unsupported");
assert.equal(refusal.reason, "UNKNOWN_UNIT");

console.log(JSON.stringify({
  status: "passed",
  supported: "2 result rows matched the Zetaris source snapshot",
  unsupported: refusal.reason,
  providerCalls: 0,
  zetarisCalls: 0,
  networkGuard: "Node API instrumentation only; not an OS sandbox"
}, null, 2));
