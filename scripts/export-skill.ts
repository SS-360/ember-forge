import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillDirectory = path.join(projectRoot, "skills", "stock-reconciliation");
const artifactDirectory = path.join(projectRoot, "artifacts", "exports", "stock-reconciliation", "0.1.0", randomUUID());

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort().map((key) => [key, normalize(object[key])]));
  }
  return value;
}

function candidateHash(skill: unknown, contract: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalize({ skill, contract }))).digest("hex");
}

const [skillText, contractText, verificationText, fixtureText] = await Promise.all([
  readFile(path.join(skillDirectory, "skill.json"), "utf8"),
  readFile(path.join(skillDirectory, "contract.json"), "utf8"),
  readFile(path.join(skillDirectory, "verification.json"), "utf8"),
  readFile(path.join(projectRoot, "fixtures", "dev", "stock-reconciliation.json"), "utf8")
]);
const skill = JSON.parse(skillText) as { id: string; version: string };
const contract = JSON.parse(contractText);
const verification = JSON.parse(verificationText) as {
  status: string;
  candidateHash: string;
  scope: string;
  cases: Array<{ caseId: string; expectedResultHash?: string }>;
};
if (verification.status !== "validated" || verification.scope !== "finite-development-suite") {
  throw new Error("Only a validated finite-suite candidate can be exported.");
}
if (candidateHash(JSON.parse(skillText), contract) !== verification.candidateHash) {
  throw new Error("The verification report is stale for the current skill or contract.");
}

const fixture = JSON.parse(fixtureText) as { parameters: unknown; dataset: { orders: Array<Record<string, unknown>> } };
const unsupportedInput = structuredClone(fixture);
if (unsupportedInput.dataset.orders.length === 0) throw new Error("The example dataset has no order to mutate.");
unsupportedInput.dataset.orders[0] = { ...unsupportedInput.dataset.orders[0], unit: "PALLET" };

await mkdir(path.join(artifactDirectory, "runtime"), { recursive: true });
await mkdir(path.join(artifactDirectory, "tests"), { recursive: true });
await mkdir(path.join(artifactDirectory, "examples"), { recursive: true });
await Promise.all([
  writeFile(path.join(artifactDirectory, "skill.json"), skillText, "utf8"),
  writeFile(path.join(artifactDirectory, "contract.json"), contractText, "utf8"),
  writeFile(path.join(artifactDirectory, "tests", "cases.json"), await readFile(path.join(skillDirectory, "tests", "cases.json"), "utf8"), "utf8"),
  writeFile(path.join(artifactDirectory, "verification.json"), verificationText, "utf8"),
  writeFile(path.join(artifactDirectory, "input.example.json"), JSON.stringify({
    provenance: "synthetic-development-fixture",
    ...fixture
  }, null, 2) + "\n", "utf8"),
  writeFile(path.join(artifactDirectory, "examples", "unsupported-unknown-unit.json"), JSON.stringify({
    provenance: "synthetic-development-fixture",
    ...unsupportedInput
  }, null, 2) + "\n", "utf8"),
  writeFile(path.join(artifactDirectory, "bindings.example.json"), JSON.stringify({
    inputFile: "input.example.json",
    sourceMode: "fixture",
    notes: "Replace dataset arrays with data from your approved source adapter. No credentials are needed by the exported runtime."
  }, null, 2) + "\n", "utf8"),
  writeFile(path.join(artifactDirectory, "package.json"), JSON.stringify({
    name: "pocketforge-stock-reconciliation-skill",
    version: skill.version,
    private: true,
    type: "module",
    engines: { node: ">=24.13.0 <25" },
    scripts: {
      run: "node runtime/pocketforge-runtime.mjs --input input.json",
      verify: "node tests/verify-export.mjs"
    }
  }, null, 2) + "\n", "utf8"),
  writeFile(path.join(artifactDirectory, "README.md"), `# ${skill.id} ${skill.version}\n\nThis is a portable, bounded Pocket Forge skill package. It runs supported stock-reconciliation inputs locally without calling Nemotron or Pocket Forge. It may read only the JSON input file supplied on the command line; this fixture build does not connect to Zetaris or any other live source.\n\n## Requirements\n\n- Node.js 24.13 or newer in the Node 24 release line\n\n## Run\n\nCopy \`input.example.json\` to \`input.json\`, replace its parameters and dataset with data that matches \`contract.json\`, then run:\n\n\`\`\`sh\nnode runtime/pocketforge-runtime.mjs --input input.json --output result.json\n\`\`\`\n\nOr omit \`--output\` to print the result JSON. The result includes a \`modelCallCount\` of 0. The bundled runtime is self-contained and does not need \`pnpm install\`.\n\n## Verify this package\n\n\`\`\`sh\nnode tests/verify-export.mjs\n\`\`\`\n\nThe verification script launches the runtime from this directory with Node networking entry points disabled, a dummy NVIDIA key present, and an unsupported unknown-unit case. It checks the supported output against the recorded development result hash and checks that the unsupported case is rejected.\n\n## Supported scope and evidence\n\nThe contract declares supported source mode, schema versions, policy version, assumptions, row limit, and execution time limit. \`verification.json\` records the finite development suite: ${verification.cases.length} cases. Its scope is synthetic development fixtures, not a held-out evaluation or a guarantee for arbitrary business data. Candidate origin: provided development draft.\n\nThe unknown-unit example in \`examples/\` is expected to fail with \`UNKNOWN_UNIT\`. Unsupported inputs must be handled by the calling application; this exported package never silently invokes a model.\n`, "utf8"),
  writeFile(path.join(artifactDirectory, "THIRD_PARTY_NOTICES.md"), `# Third-party notices\n\n## Zod 4.6.7\n\nThe runtime bundle includes Zod 4.6.7.\n\nMIT License\n\nCopyright (c) 2025 Colin McDonnell\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`, "utf8")
]);

const bundle = await build({
  absWorkingDir: projectRoot,
  entryPoints: [path.join(projectRoot, "packages", "runtime", "src", "export-cli.ts")],
  outfile: path.join(artifactDirectory, "runtime", "pocketforge-runtime.mjs"),
  bundle: true,
  packages: "bundle",
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: false,
  minify: false,
  metafile: true
});
const outputMeta = Object.values(bundle.metafile.outputs).find((output) => output.entryPoint?.endsWith("export-cli.ts"));
const remainingImports = outputMeta?.imports.filter((item) => !item.path.startsWith("node:")) ?? [];
if (remainingImports.length > 0) {
  throw new Error("The export bundle has runtime dependencies: " + remainingImports.map((item) => item.path).join(", "));
}

await writeFile(path.join(artifactDirectory, "tests", "network-guard.mjs"), `import http from "node:http";\nimport https from "node:https";\nimport net from "node:net";\nimport tls from "node:tls";\nconst blocked = () => { throw new Error("Network access is disabled during the offline export check."); };\nglobalThis.fetch = blocked;\nfor (const [module, names] of [[http, ["request", "get"]], [https, ["request", "get"]], [net, ["connect", "createConnection"]], [tls, ["connect"]]]) {\n  for (const name of names) Object.defineProperty(module, name, { value: blocked, configurable: true, writable: true });\n}\n`, "utf8");
await writeFile(path.join(artifactDirectory, "tests", "verify-export.mjs"), `import assert from "node:assert/strict";\nimport { createHash } from "node:crypto";\nimport { spawnSync } from "node:child_process";\nimport { readFile } from "node:fs/promises";\nimport path from "node:path";\nimport { fileURLToPath } from "node:url";\nconst root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");\nconst verification = JSON.parse(await readFile(path.join(root, "verification.json"), "utf8"));\nconst canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;\nconst run = (input) => spawnSync(process.execPath, ["--import", "./tests/network-guard.mjs", "runtime/pocketforge-runtime.mjs", "--input", input], { cwd: root, encoding: "utf8", env: { ...process.env, NVIDIA_API_KEY: "dummy-offline-test-key", NVIDIA_BASE_URL: "https://offline.invalid", ZETARIS_API_KEY: "dummy-offline-test-key" } });\nconst supported = run("input.example.json");\nassert.equal(supported.status, 0, supported.stderr || "supported input failed");\nconst result = JSON.parse(supported.stdout);\nassert.equal(result.skillId, "${skill.id}");\nassert.equal(result.skillVersion, "${skill.version}");\nassert.equal(result.modelCallCount, 0);\nconst matchingCase = verification.cases.find((item) => item.caseId === "dev-supported-baseline");\nassert.ok(matchingCase?.expectedResultHash, "baseline result hash is missing");\nconst actualHash = createHash("sha256").update(JSON.stringify(canonical(result.records))).digest("hex");\nassert.equal(actualHash, matchingCase.expectedResultHash, "exported result differs from the verified baseline");\nconst unsupported = run("examples/unsupported-unknown-unit.json");\nassert.equal(unsupported.status, 2, "unsupported input should be rejected");\nassert.equal(JSON.parse(unsupported.stderr).reason, "UNKNOWN_UNIT");\nconsole.log(JSON.stringify({ status: "passed", network: "disabled", modelCallCount: result.modelCallCount, supportedResultHash: actualHash, unsupportedReason: "UNKNOWN_UNIT" }, null, 2));\n`, "utf8");

const check = await import("node:child_process").then(({ spawnSync }) => spawnSync(process.execPath, [path.join(artifactDirectory, "tests", "verify-export.mjs")], {
  cwd: artifactDirectory,
  encoding: "utf8",
  env: { ...process.env, NVIDIA_API_KEY: "dummy-offline-test-key", NVIDIA_BASE_URL: "https://offline.invalid", ZETARIS_API_KEY: "dummy-offline-test-key" }
}));
if (check.status !== 0) throw new Error("Fresh-directory export verification failed: " + check.stdout + check.stderr);
console.log(JSON.stringify({
  status: "exported_and_verified",
  skillId: skill.id,
  skillVersion: skill.version,
  candidateHash: verification.candidateHash,
  artifactDirectory: path.relative(projectRoot, artifactDirectory),
  verification: check.stdout.trim()
}, null, 2));
