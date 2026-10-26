import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "artifacts/exports/fulfilment-exceptions/0.1.0");
const runtime = path.join(output, "runtime/run.mjs");
await mkdir(path.join(output, "runtime"), { recursive: true });
await mkdir(path.join(output, "examples"), { recursive: true });
await mkdir(path.join(output, "tests"), { recursive: true });
const policy = JSON.parse(await readFile(path.join(root, "skills/fulfilment-exceptions/policy.json"), "utf8"));
const sample = JSON.parse(await readFile(path.join(root, "fixtures/dev/fulfilment-exceptions.json"), "utf8"));
const expected = {
  status: "succeeded" as const, taskFamily: "fulfilment-exceptions", sourceMode: "snapshot", asOfDate: "2026-10-26", policyId: "dispatch-review", modelCalls: 0, origin: "configured_template",
  records: [
    { orderId: "ORD-2001", sku: "CUP-RED", ordered: 10, shipped: 3, remaining: 7, reason: "delayed", overdueDays: 2 },
    { orderId: "ORD-2002", sku: "MUG-BLUE", ordered: 4, shipped: 0, remaining: 4, reason: "incomplete", overdueDays: 0 }
  ]
};
const contract = {
  schemaVersion: "emberforge.skill-contract/1", taskFamily: "fulfilment-exceptions", skillId: "fulfilment-exceptions", skillVersion: "0.1.0",
  supportedSourceModes: ["fixture", "snapshot"], inputSchema: "fulfilment-v1", policyVersion: "0.1.0", maxOrders: 2500, maxShipments: 2500, maxInputBytes: 1000000,
  assumptions: ["Order and shipment IDs are unique.", "Each shipment refers to the same SKU as its order.", "Cancelled orders and cancelled shipments do not count.", "Shipments after the as-of date do not count.", "Only rows matching this schema and policy version are accepted."],
  refusalCodes: ["POLICY_INVALID", "INPUT_CONTRACT_MISMATCH", "DUPLICATE_ID", "SHIPMENT_ORDER_MISMATCH", "OVER_FULFILLED", "INPUT_TOO_LARGE", "INPUT_JSON_INVALID"]
};
const cases: Array<{ id: string; input: unknown; expected: { status: "succeeded" | "unsupported"; reason?: string } }> = [
  { id: "snapshot-sample", input: sample, expected },
  { id: "unknown-order", input: { ...sample, shipments: [{ shipmentId: "SHIP-X", orderId: "MISSING", sku: "X", shippedDate: "2026-10-20", quantity: 1, status: "shipped" }] }, expected: { status: "unsupported", reason: "SHIPMENT_ORDER_MISMATCH" } },
  { id: "over-fulfilled", input: { ...sample, shipments: [{ shipmentId: "SHIP-X", orderId: "ORD-2001", sku: "CUP-RED", shippedDate: "2026-10-20", quantity: 11, status: "shipped" }] }, expected: { status: "unsupported", reason: "OVER_FULFILLED" } },
  { id: "schema-change", input: { ...sample, schemaVersion: "fulfilment-v2" }, expected: { status: "unsupported", reason: "INPUT_CONTRACT_MISMATCH" } }
];
const skill = ["---", "name: fulfilment-exceptions", "description: Find delayed or incomplete order fulfilment from a policy-bound orders and shipments snapshot. Use when asked to audit shipment completion against promised dates.", "---", "", "# Fulfilment exceptions", "", "This skill runs a configured, bounded template. It is not a Nemotron-generated skill. Use it only for the declared `fulfilment-v1` input and `0.1.0` policy.", "", "Load a JSON input, then run `node runtime/run.mjs --input <path>` from this skill folder. Return the runner's JSON records and state the `asOfDate`. Do not infer missing shipment rows or change the configured grace period. Exit code 2 means the input was refused.", "", "Run `node tests/verify.mjs` to replay the bundled finite examples. Review `contract.json` and `policy.json` before using a different business policy.", ""].join("\n");
const verifier = `import{readFile}from"node:fs/promises";import{spawnSync}from"node:child_process";import path from"node:path";import{fileURLToPath}from"node:url";const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");const cases=JSON.parse(await readFile(new URL("./cases.json",import.meta.url),"utf8"));const norm=x=>Array.isArray(x)?x.map(norm):x&&typeof x==="object"?Object.fromEntries(Object.keys(x).sort().map(k=>[k,norm(x[k])])):x;for(const c of cases){const file=path.join(root,c.inputFile);const p=spawnSync(process.execPath,[path.join(root,"runtime/run.mjs"),"--input",file],{encoding:"utf8",timeout:10000,windowsHide:true});let actual;try{actual=JSON.parse(p.status===0?p.stdout:p.stderr)}catch{throw Error(c.id+": invalid runner response")};if(JSON.stringify(norm(actual))!==JSON.stringify(norm(c.expected))||p.status!==(c.expected.status==="succeeded"?0:2))throw Error(c.id+": result mismatch")}console.log(JSON.stringify({status:"passed",cases:cases.length}));`;
await Promise.all([
  writeFile(path.join(output, "SKILL.md"), skill),
  writeFile(path.join(output, "README.md"), "# Fulfilment Exceptions 0.1.0\n\nPortable Agent Skill package for a configured orders and shipment snapshot. It runs locally without Ember Forge, a network connection, or a model call. The package accepts synthetic examples and compatible caller snapshots.\n\n## Run\n\n`node runtime/run.mjs --input input.json`\n\n## Check\n\n`node tests/verify.mjs` runs four finite examples. A passing package check does not establish production readiness, broad accuracy, or model learning.\n"),
  writeFile(path.join(output, "contract.json"), JSON.stringify(contract, null, 2) + "\n"),
  writeFile(path.join(output, "policy.json"), JSON.stringify(policy, null, 2) + "\n"),
  writeFile(path.join(output, "examples/input.example.json"), JSON.stringify(sample, null, 2) + "\n"),
  writeFile(path.join(output, "examples/expected.json"), JSON.stringify(expected, null, 2) + "\n"),
  writeFile(path.join(output, "tests/cases.json"), JSON.stringify(cases.map(({ id, input, expected }) => ({ id, inputFile: "tests/inputs/" + id + ".json", expected })), null, 2) + "\n"),
  writeFile(path.join(output, "tests/verify.mjs"), verifier)
]);
await mkdir(path.join(output, "tests/inputs"), { recursive: true });
await Promise.all(cases.map(({ id, input }) => writeFile(path.join(output, "tests/inputs", id + ".json"), JSON.stringify(input, null, 2) + "\n")));
await build({ entryPoints: [path.join(root, "packages/runtime/src/fulfilment-cli.ts")], outfile: runtime, bundle: true, packages: "bundle", platform: "node", format: "esm", target: "node24", sourcemap: false, minify: false });
const check = execFileSync(process.execPath, [path.join(output, "tests/verify.mjs")], { cwd: output, encoding: "utf8", windowsHide: true });
if (!check.includes('"status":"passed"')) throw new Error("FULFILMENT_PACKAGE_CHECK_FAILED");
const verification = { schemaVersion: "emberforge.fulfilment-package-check/1", status: "passed", checkedAt: new Date().toISOString(), origin: "configured_template", cases: cases.map(({ id, expected }) => ({ id, outcome: expected.status, ...(expected.reason ? { reason: expected.reason } : {}) })), modelCalls: 0, networkCalls: 0, limitation: "Four finite synthetic package examples; this is not a held-out or production evaluation." };
await writeFile(path.join(output, "verification.json"), JSON.stringify(verification, null, 2) + "\n");
const files = ["SKILL.md", "README.md", "contract.json", "policy.json", "verification.json", "runtime/run.mjs", "examples/input.example.json", "examples/expected.json", "tests/cases.json", "tests/verify.mjs", ...cases.map(({ id }) => "tests/inputs/" + id + ".json")];
const hashes = Object.fromEntries(await Promise.all(files.map(async (name) => [name, createHash("sha256").update(await readFile(path.join(output, name))).digest("hex")])));
const provenance = { schemaVersion: "emberforge.configured-skill-package/1", skillId: "fulfilment-exceptions", version: "0.1.0", origin: "configured_template", packageCheck: verification, files: hashes, limitation: "This rules template is configured from a fixed trusted workflow, not learned from agent trajectories." };
await writeFile(path.join(output, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");
const packageHash = createHash("sha256").update(JSON.stringify({ files: hashes, provenance })).digest("hex");
console.log(JSON.stringify({ status: verification.status, packageDirectory: path.relative(root, output), cases: cases.length, packageHash }));
