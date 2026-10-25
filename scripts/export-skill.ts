import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { SkillContractSchema, SkillDefinitionSchema, StockDatasetSchema, StockParametersSchema } from "../packages/contracts/src/index.js";
import { reconcileStock } from "../packages/evaluator/src/index.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function exportVerifiedCandidate(options: { candidateDirectory: string; outputDirectory?: string; signal?: AbortSignal }): Promise<{
  status: "exported_and_verified"; skillId: string; skillVersion: string; candidateHash: string; artifactDirectory: string; verification: string
}> {
const candidateDirectory = path.resolve(projectRoot, options.candidateDirectory);
options.signal?.throwIfAborted();
const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, "utf8")) as unknown;
const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) :
  value !== null && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize((value as Record<string, unknown>)[key])])) : value;
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const canonicalHash = (value: unknown): string => sha256(JSON.stringify(normalize(value)));
const [skillInput, contractInput, verificationInput, casesInput] = await Promise.all([
  readJson(path.join(candidateDirectory, "skill.json")),
  readJson(path.join(candidateDirectory, "contract.json")),
  readJson(path.join(candidateDirectory, "verification.json")),
  readJson(path.join(candidateDirectory, "tests", "cases.json"))
]);
const skill = SkillDefinitionSchema.parse(skillInput);
options.signal?.throwIfAborted();
const contract = SkillContractSchema.parse(contractInput);
const verification = verificationInput as {
  schemaVersion?: string; status?: string; scope?: string; candidateOrigin?: string;
  skillId?: string; skillVersion?: string; candidateHash?: string;
  supportedCaseCount?: number; correctSupportedCount?: number; unsupportedCaseCount?: number;
  rejectedUnsupportedCount?: number; falseAcceptanceCount?: number; needlessFallbackCount?: number;
  cases?: Array<{ caseId: string; expectedOutcome: string; actualOutcome: string; passed: boolean; expectedReason?: string; expectedResultHash?: string }>;
};
if (contract.skillId !== skill.id || contract.skillVersion !== skill.version || contract.taskFamily !== skill.taskFamily) {
  throw new Error("Candidate contract identity does not match skill.json.");
}
if (verification.schemaVersion !== "pocketforge.verification/1" || verification.status !== "validated" ||
  verification.scope !== "finite-development-suite" || verification.skillId !== skill.id ||
  verification.skillVersion !== skill.version || verification.candidateHash !== canonicalHash({ skill, contract })) {
  throw new Error("Verification is missing, rejected, or stale for this candidate.");
}
const cases = verification.cases ?? [];
const lineage = ["deterministic_trace_assembly", "nemotron_synthesis", "test_synthesis"].includes(verification.candidateOrigin ?? "")
  ? await readJson(path.join(candidateDirectory, "lineage.json")) : undefined;
if (!cases.length || cases.some((item) => item.passed !== true) ||
  verification.falseAcceptanceCount !== 0 || verification.correctSupportedCount !== verification.supportedCaseCount ||
  verification.rejectedUnsupportedCount !== verification.unsupportedCaseCount) {
  throw new Error("Only a complete, passing verification report can be exported.");
}
const baseline = cases.find((item) => item.expectedOutcome === "supported" && item.expectedResultHash);
if (!baseline?.expectedResultHash) throw new Error("Verification has no supported result hash to check the exported runner against.");
if (!casesInput || typeof casesInput !== "object" || !Array.isArray((casesInput as { cases?: unknown }).cases)) {
  throw new Error("Candidate tests/cases.json is missing or invalid.");
}
const manifestCases = (casesInput as { cases: Array<{ caseId?: unknown; expectedOutcome?: unknown; expectedReason?: unknown }> }).cases;
if (manifestCases.length !== cases.length || cases.some((testCase) => {
  const manifestCase = manifestCases.find((item) => item.caseId === testCase.caseId);
  return !manifestCase || manifestCase.expectedOutcome !== testCase.expectedOutcome ||
    (manifestCase.expectedReason ?? undefined) !== (testCase.expectedReason ?? undefined);
})) throw new Error("Verification cases do not match tests/cases.json.");

const fixturePath = path.join(projectRoot, "fixtures", "dev", "stock-reconciliation.json");
let fixtureInput: unknown;
try { fixtureInput = await readJson(path.join(candidateDirectory, "verification-input.json")); }
catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  fixtureInput = await readJson(fixturePath);
}
const fixture = fixtureInput as { parameters: Record<string, unknown>; dataset: { orders: Array<Record<string, unknown>>; [key: string]: unknown } };
const reference = reconcileStock(StockParametersSchema.parse(fixture.parameters), StockDatasetSchema.parse(fixture.dataset));
if (canonicalHash(reference.lines) !== baseline.expectedResultHash) throw new Error("The packaged example does not match the supported verification evidence.");
const inputExample = { provenance: "synthetic-development-fixture", ...fixture };
const unsupported = structuredClone(fixture);
if (!unsupported.dataset.orders.length) throw new Error("The development fixture has no order to mutate.");
unsupported.dataset.orders[0] = { ...unsupported.dataset.orders[0]!, unit: "PALLET" };
const unsupportedExample = { provenance: "synthetic-development-fixture", ...unsupported };
const target = options.outputDirectory
  ? path.resolve(projectRoot, options.outputDirectory)
  : path.join(projectRoot, "artifacts", "exports", skill.id, skill.version, `${canonicalHash({ skill, contract }).slice(0, 12)}-${randomUUID()}`);
await mkdir(path.join(target, "runtime"), { recursive: true });
await mkdir(path.join(target, "tests"), { recursive: true });
await mkdir(path.join(target, "examples"), { recursive: true });

const skillDocumentText = [
  "---", "name: " + skill.id,
  "description: Execute the verified " + skill.taskFamily + " procedure for compatible inputs. Use only when the user requests this task and the input matches the applicability contract. Do not use for other task families, schemas, policies, or live data sources.",
  "---", "", "# " + skill.id, "",
  "Use this skill only when the request is a " + skill.taskFamily + " task and the supplied parameters, source mode, schema versions, policy version, and row count satisfy [the contract](contract.json). The runner reads JSON supplied by the user; it does not connect to external data sources.", "",
  "## Execute", "", "1. Prepare an input JSON file using [the example](input.example.json) and confirm it matches the contract. Never place credentials in the input.",
  "2. Resolve the installed skill directory from the SKILL.md file the host loaded. Use an absolute path to the bundled runtime, quoted for spaces; do not assume the caller is in this folder. Replace /absolute/path/to/" + skill.id + " below with that directory. Run with Node.js 24.13 or newer:", "", "   ```sh", "   node \"/absolute/path/to/" + skill.id + "/runtime/pocketforge-runtime.mjs\" --input input.json --output result.json", "   ```", "",
  "3. Return the result and execution status. The runner makes no model calls.", "4. If the runner exits with status 2, report the machine-readable rejection reason and request compatible data or use the host's normal reasoning workflow. Do not silently alter schemas, policy, aliases, or units.", "",
  "Run node with the absolute, quoted path to tests/verify-export.mjs in the same installed skill directory to check the bundled examples. Verification covers a finite synthetic development suite only.", "", "## Resources", "",
  "- [Input contract](contract.json)", "- [Verification evidence](verification.json)", "- [Verification cases](tests/cases.json)",
  ...(lineage ? ["- [Trace lineage and compilation limits](lineage.json)"] : []), "- [Runtime instructions](README.md)", ""
].join("\n");
const readmeText = [
  "# " + skill.id + " " + skill.version, "", "This Agent Skill folder contains a portable SKILL.md and a bounded local interpreter bundle. Supported inputs execute without Pocket Forge or Nemotron. The example uses synthetic stock-reconciliation data; the package does not connect to Zetaris or any other live source.", "",
  "## Requirements and execution", "", "- Node.js 24.13 or newer in the Node 24 release line.", "- JSON input matching contract.json.", "", "Copy input.example.json to input.json, replace its parameters and dataset with approved data matching the contract, then run:", "", "```sh", "node runtime/pocketforge-runtime.mjs --input input.json --output result.json", "```", "",
  "The commands above assume you opened this skill folder. From another directory or an agent host, resolve the installed folder from the loaded SKILL.md location and use an absolute, quoted path to runtime/pocketforge-runtime.mjs (and tests/verify-export.mjs). Input and output paths use the caller's working directory. Bundled skill and contract assets use the runtime file's directory. Omit --output to write result JSON to stdout. Exit code 2 means unsupported input; other nonzero codes mean execution or package failure.", "",
  "## Verify", "", "```sh", "node tests/verify-export.mjs", "```", "", "The check runs from an unrelated temporary directory whose name contains spaces. It checks supported output against its recorded result hash, plus policy/schema drift, unknown units, malformed JSON, output paths, and a missing package asset. Its network guard instruments Node networking entry points; it is not an OS sandbox.", "",
  "## Evidence and limits", "", "verification.json records " + cases.length + " finite development cases (" + (verification.supportedCaseCount ?? 0) + " supported and " + (verification.unsupportedCaseCount ?? 0) + " unsupported). This is synthetic development evidence, not a held-out evaluation. " + (verification.candidateOrigin === "deterministic_trace_assembly" ? "This candidate was assembled from agreeing sanitized operation traces by a deterministic adapter; it does not demonstrate model learning. " : verification.candidateOrigin === "test_synthesis" ? "This candidate came from a test-only synthesis transport; it does not establish live model learning or access. " : verification.candidateOrigin === "nemotron_synthesis" ? "This candidate was generated through the bounded Nemotron adapter and independently checked on development inputs. Provider generation does not establish held-out generalization. " : "The provided candidate is not represented as learned from Nemotron traces. ") + (lineage ? "See lineage.json for trace hashes, operation links and limitations. " : "") + "See provenance.json for candidate and artifact hashes.", "",
  "## Install in an agent harness", "", "For Codex, extract this archive and copy the skill folder into the repository's .agents/skills/ directory. For Claude Code, copy it into the project's .claude/skills/ directory. For OpenClaw, Hermes, and other Agent Skills hosts, use the configured skills directory documented by that host.", "", "This is the standard Agent Skills folder, not a Codex plugin bundle or a Claude Code plugin marketplace package. A host may wrap skills in a plugin for distribution, but that is optional and host-specific. Installation, discovery, invocation and correct execution require separate recorded checks in each host. Folder format alone does not prove invocation; consult the project's compatibility evidence.", ""
].join("\n");
const noticeText = [
  "# Third-party notices", "", "## Zod 4.6.7", "", "The runtime bundle includes Zod 4.6.7.", "", "MIT License", "", "Copyright (c) 2025 Colin McDonnell", "",
  "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the Software), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:", "",
  "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.", "", "THE SOFTWARE IS PROVIDED AS IS, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.", ""
].join("\n");

const writes: Array<[string, string]> = [
  ["skill.json", JSON.stringify(skill, null, 2) + "\n"],
  ["contract.json", JSON.stringify(contract, null, 2) + "\n"],
  ["tests/cases.json", JSON.stringify(casesInput, null, 2) + "\n"],
  ["verification.json", JSON.stringify(verification, null, 2) + "\n"],
  ["input.example.json", JSON.stringify(inputExample, null, 2) + "\n"],
  ["examples/unsupported-unknown-unit.json", JSON.stringify(unsupportedExample, null, 2) + "\n"],
  ["bindings.example.json", JSON.stringify({ inputFile: "input.example.json", sourceMode: "fixture", notes: "Replace the example arrays with approved data matching contract.json. The runner does not need Pocket Forge, provider credentials, or a source connector." }, null, 2) + "\n"],
  ["provenance.json", JSON.stringify({ schemaVersion: "pocketforge.export-provenance/1", skillId: skill.id, skillVersion: skill.version, candidateHash: canonicalHash({ skill, contract }), candidateOrigin: verification.candidateOrigin ?? "unknown", verificationScope: verification.scope, files: { "skill.json": sha256(JSON.stringify(skill, null, 2) + "\n"), "contract.json": sha256(JSON.stringify(contract, null, 2) + "\n"), "verification.json": sha256(JSON.stringify(verification, null, 2) + "\n") } }, null, 2) + "\n"],
  ["package.json", JSON.stringify({ name: `pocketforge-${skill.id}`, version: skill.version, private: true, type: "module", engines: { node: ">=24.13.0 <25" }, scripts: { run: "node runtime/pocketforge-runtime.mjs --input input.json", verify: "node tests/verify-export.mjs" } }, null, 2) + "\n"],
  ["SKILL.md", skillDocumentText], ["README.md", readmeText], ["THIRD_PARTY_NOTICES.md", noticeText]
];
if (lineage) writes.push(["lineage.json", JSON.stringify(lineage, null, 2) + "\n"]);
await Promise.all(writes.map(([name, contents]) => writeFile(path.join(target, name), contents, "utf8")));
options.signal?.throwIfAborted();
const skillDocument = await readFile(path.join(target, "SKILL.md"), "utf8");
const frontmatter = skillDocument.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!frontmatter || !new RegExp(`^name: ${skill.id}$`, "m").test(frontmatter[1]!) || !/^description: .+/m.test(frontmatter[1]!)) {
  throw new Error("Generated SKILL.md does not have valid required Agent Skills metadata.");
}
for (const [, link] of skillDocument.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
  if (/^(?:[a-z]+:|\/|#)/i.test(link!)) throw new Error("SKILL.md references a non-portable resource: " + link);
  await access(path.resolve(target, link!));
}

const bundle = await build({
  absWorkingDir: projectRoot,
  entryPoints: [path.join(projectRoot, "packages", "runtime", "src", "export-cli.ts")],
  outfile: path.join(target, "runtime", "pocketforge-runtime.mjs"), bundle: true, packages: "bundle",
  platform: "node", format: "esm", target: "node24", sourcemap: false, minify: false, metafile: true
});
const outputMeta = Object.values(bundle.metafile.outputs).find((item) => item.entryPoint?.endsWith("export-cli.ts"));
options.signal?.throwIfAborted();
const remainingImports = outputMeta?.imports.filter((item) => !item.path.startsWith("node:")) ?? [];
if (remainingImports.length) throw new Error("Export bundle has runtime dependencies: " + remainingImports.map((item) => item.path).join(", "));

await writeFile(path.join(target, "tests", "network-guard.mjs"), `import http from "node:http";\nimport https from "node:https";\nimport net from "node:net";\nimport tls from "node:tls";\nconst blocked=()=>{throw new Error("Network access blocked by the export instrumentation check.")};\nglobalThis.fetch=blocked;\nfor(const [m,names] of [[http,["request","get"]],[https,["request","get"]],[net,["connect","createConnection"]],[tls,["connect"]]])for(const name of names)Object.defineProperty(m,name,{value:blocked,configurable:true,writable:true});\n`, "utf8");
const verifier = `import assert from "node:assert/strict";\nimport {createHash} from "node:crypto";\nimport {spawnSync} from "node:child_process";\nimport {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";\nimport os from "node:os";\nimport path from "node:path";\nimport {fileURLToPath,pathToFileURL} from "node:url";\nconst root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");\nconst temp=await mkdtemp(path.join(os.tmpdir(),"pocket forge package check "));\nconst pkg=path.join(root,"runtime","pocketforge-runtime.mjs");\nconst guard=path.join(root,"tests","network-guard.mjs");\nconst input=JSON.parse(await readFile(path.join(root,"input.example.json"),"utf8"));\nconst unsupported=JSON.parse(await readFile(path.join(root,"examples","unsupported-unknown-unit.json"),"utf8"));\nconst verification=JSON.parse(await readFile(path.join(root,"verification.json"),"utf8"));\nconst bootstrap='process.argv=[process.execPath,process.env.PF_RUNTIME_URL,"--input",process.env.PF_INPUT,"--output",process.env.PF_OUTPUT];import(process.env.PF_RUNTIME_URL).catch(e=>{console.error(e);process.exitCode=1})';const run=(runtime,data,filename="input.json",output=path.join(temp,"result.json"))=>{const file=path.join(temp,filename);return writeFile(file,typeof data==="string"?data:JSON.stringify(data)).then(()=>spawnSync(process.execPath,["--import",pathToFileURL(guard).href,"-e",bootstrap],{cwd:temp,encoding:"utf8",env:{PATH:process.env.PATH??"",SystemRoot:process.env.SystemRoot??"",TEMP:temp,TMP:temp,NVIDIA_API_KEY:"dummy-offline-test-key",ZETARIS_API_KEY:"dummy-offline-test-key",PF_RUNTIME_URL:pathToFileURL(runtime).href,PF_INPUT:file,PF_OUTPUT:output}}))};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;\ntry{\n let r=await run(pkg,input);assert.equal(r.status,0,r.stderr);const output=JSON.parse(await readFile(path.join(temp,"result.json"),"utf8"));assert.equal(output.skillId,"${skill.id}");assert.equal(output.skillVersion,"${skill.version}");assert.equal(createHash("sha256").update(JSON.stringify(canonical(output.records))).digest("hex"),"${baseline.expectedResultHash}");\n r=await run(pkg,unsupported,"unsupported.json");assert.equal(r.status,2);assert.equal(JSON.parse(r.stderr).reason,"UNKNOWN_UNIT");\n const policy=structuredClone(input);policy.parameters.policyVersion="stock-v2";r=await run(pkg,policy,"policy.json");assert.equal(JSON.parse(r.stderr).reason,"POLICY_VERSION_MISMATCH");\n const schema=structuredClone(input);schema.dataset.sourceSchemaVersions.orders="orders/v2";r=await run(pkg,schema,"schema.json");assert.equal(JSON.parse(r.stderr).reason,"SCHEMA_VERSION_MISMATCH");\n r=await run(pkg,"{not json","malformed.json");assert.equal(JSON.parse(r.stderr).reason,"INPUT_INVALID_JSON");\n r=await run(pkg,input,"bad-output.json",path.join(temp,"missing-parent","out.json"));assert.equal(JSON.parse(r.stderr).reason,"OUTPUT_WRITE_FAILED");\n const broken=path.join(temp,"missing-skill-assets");await mkdir(path.join(broken,"runtime"),{recursive:true});await mkdir(path.join(broken,"tests"),{recursive:true});await copyFile(pkg,path.join(broken,"runtime","pocketforge-runtime.mjs"));await copyFile(guard,path.join(broken,"tests","network-guard.mjs"));r=await run(path.join(broken,"runtime","pocketforge-runtime.mjs"),input,"missing-asset-input.json");assert.equal(JSON.parse(r.stderr).reason,"SKILL_PACKAGE_INCOMPLETE");\n console.log(JSON.stringify({status:"passed",workingDirectory:temp,supportedResultHash:"${baseline.expectedResultHash}",unsupported:"UNKNOWN_UNIT",policyDrift:"POLICY_VERSION_MISMATCH",schemaDrift:"SCHEMA_VERSION_MISMATCH",malformedJson:"INPUT_INVALID_JSON",invalidOutput:"OUTPUT_WRITE_FAILED",missingPackageAsset:"SKILL_PACKAGE_INCOMPLETE",networkCheck:"Node API instrumentation only; not an OS sandbox",providerCalls:"disabled"},null,2));\n}finally{await rm(temp,{recursive:true,force:true})}\n`;
await writeFile(path.join(target, "tests", "verify-export.mjs"), verifier, "utf8");
const provenanceFiles = [
  "SKILL.md", "skill.json", "contract.json", "tests/cases.json", "verification.json", "input.example.json",
  "examples/unsupported-unknown-unit.json", "bindings.example.json", "package.json", "README.md",
  "THIRD_PARTY_NOTICES.md", "runtime/pocketforge-runtime.mjs", "tests/network-guard.mjs", "tests/verify-export.mjs"
];
if (lineage) provenanceFiles.push("lineage.json");
const artifactHashes: Record<string, string> = {};
for (const name of provenanceFiles) artifactHashes[name] = sha256(await readFile(path.join(target, name)));
const provenance = {
  schemaVersion: "pocketforge.export-provenance/1",
  skillId: skill.id,
  skillVersion: skill.version,
  candidateHash: canonicalHash({ skill, contract }),
  candidateOrigin: verification.candidateOrigin ?? "unknown",
  verificationScope: verification.scope,
  files: artifactHashes,
  packageCheck: { status: "pending" as "pending" | "passed", candidateHash: canonicalHash({ skill, contract }), verificationHash: artifactHashes["verification.json"], completedAt: null as string | null }
};
await writeFile(path.join(target, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n", "utf8");
options.signal?.throwIfAborted();
const check = await import("node:child_process").then(({ execFile }) => new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
  execFile(process.execPath, [path.join(target, "tests", "verify-export.mjs")], { cwd: projectRoot, encoding: "utf8", timeout: 30000, maxBuffer: 1_000_000, ...(options.signal ? { signal: options.signal } : {}) }, (error, stdout, stderr) => {
    if (error) reject(new Error("Exported package verification failed: " + stdout + stderr, { cause: error }));
    else resolve({ stdout, stderr });
  });
}));
options.signal?.throwIfAborted();
if ((JSON.parse(check.stdout) as { status?: string }).status !== "passed") throw new Error("Exported package check did not confirm success.");
provenance.packageCheck.status = "passed";
provenance.packageCheck.completedAt = new Date().toISOString();
const receiptPath = path.join(target, "provenance-" + randomUUID() + ".tmp");
await writeFile(receiptPath, JSON.stringify(provenance, null, 2) + "\n", "utf8");
await rename(receiptPath, path.join(target, "provenance.json"));
return { status: "exported_and_verified", skillId: skill.id, skillVersion: skill.version, candidateHash: canonicalHash({ skill, contract }), artifactDirectory: path.relative(projectRoot, target), verification: check.stdout.trim() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let candidateDirectory = "skills/stock-reconciliation";
  let outputDirectory: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === "--candidate" && value) { candidateDirectory = value; index += 1; }
    else if (flag === "--output-dir" && value) { outputDirectory = value; index += 1; }
    else if (flag === "--help" || flag === "-h") {
      console.log("Usage: pnpm eval:export [--candidate <skill-directory>] [--output-dir <directory>]");
      process.exit(0);
    } else throw new Error("Unknown or incomplete argument: " + String(flag));
  }
  console.log(JSON.stringify(await exportVerifiedCandidate({ candidateDirectory, ...(outputDirectory ? { outputDirectory } : {}) }), null, 2));
}
