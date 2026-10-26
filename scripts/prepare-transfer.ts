import { cp, mkdir, readFile, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SkillDefinitionSchema, SkillContractSchema } from "../packages/contracts/src/index.js";
import { canonicalHash } from "../packages/compiler/src/trace-compiler.js";
import { exportFilesMatchManifest } from "../apps/api/src/export-integrity.js";
import type { FrozenComparison } from "../packages/compiler/src/comparison.js";

const [packageArgument, protocolArgument, outputArgument] = process.argv.slice(2);
if (!packageArgument || !protocolArgument || !outputArgument) throw new Error("Usage: pnpm transfer:prepare <existing-checked-export> <frozen-protocol.private.json> <new-output-directory>. Copies files only; no host/model/export checks are run.");
const source = path.resolve(packageArgument), output = path.resolve(outputArgument);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (output === projectRoot || output.startsWith(projectRoot + path.sep)) throw new Error("Stage host workspaces outside the source repository so parent project files cannot provide hidden dependencies.");
if (output === source || output.startsWith(source + path.sep)) throw new Error("Output must be outside the immutable package.");
if (!(await lstat(source)).isDirectory() || (await lstat(source)).isSymbolicLink()) throw new Error("Use a regular exported directory.");
const provenance = JSON.parse(await readFile(path.join(source, "provenance.json"), "utf8"));
if (provenance.packageCheck?.status !== "passed" || !await exportFilesMatchManifest(source, provenance.files)) throw new Error("An existing matching package-check receipt and file manifest are required; preparation does not run checks.");
const skill = SkillDefinitionSchema.parse(JSON.parse(await readFile(path.join(source, "skill.json"), "utf8"))), contract = SkillContractSchema.parse(JSON.parse(await readFile(path.join(source, "contract.json"), "utf8")));
const candidateHash = canonicalHash({ skill, contract });
if (candidateHash !== provenance.candidateHash || candidateHash !== provenance.packageCheck.candidateHash || provenance.packageCheck.verificationHash !== provenance.files["verification.json"]) throw new Error("Candidate/receipt identity mismatch.");
const packageHash = canonicalHash({ files: provenance.files, provenance });
const protocol = JSON.parse(await readFile(path.resolve(protocolArgument), "utf8")) as FrozenComparison;
const { protocolHash, ...payload } = protocol;
if (canonicalHash(payload) !== protocolHash) throw new Error("Frozen protocol hash mismatch.");
const selected = [protocol.cases.find((item) => item.expected.outcome === "supported"), protocol.cases.find((item) => item.expected.outcome === "unsupported")];
if (selected.some((item) => !item)) throw new Error("Include fresh supported and unsupported protocol cases.");
await mkdir(output); // Fresh rehearsal; no overwrite or inference.
const reviewer = path.join(output, "reviewer-only"); await mkdir(reviewer);
await writeFile(path.join(reviewer, "expected.private.json"), JSON.stringify(selected.map((item) => ({ caseId: item!.caseId, inputHash: item!.inputHash, expected: item!.expected })), null, 2) + "\n", { flag: "wx" });
for (const host of ["codex", "claude"] as const) {
  const workspace = path.join(output, host + " unrelated working directory");
  const installed = path.join(workspace, host === "codex" ? ".agents" : ".claude", "skills", skill.id);
  await mkdir(path.dirname(installed), { recursive: true });
  await cp(source, installed, { recursive: true, force: false, errorOnExist: true });
  if (!await exportFilesMatchManifest(installed, provenance.files)) throw new Error("Installed copy does not match the original package.");
  const inputs = path.join(workspace, "fresh inputs"); await mkdir(inputs);
  for (const item of selected) await writeFile(path.join(inputs, item!.caseId + ".json"), JSON.stringify({ parameters: item!.parameters, dataset: item!.dataset }, null, 2) + "\n", { flag: "wx" });
  await writeFile(path.join(workspace, "REHEARSAL.md"), ["# " + host + " exact-package rehearsal", "", "Prepared only. Nothing has been invoked or executed.", "", "1. Stop Ember Forge's API and web servers. Record how that was observed. Do not stop unrelated processes.", "2. Start this host in this unrelated workspace after model access is separately authorized. Record the installed host version and its discovery evidence.", "3. Explicitly invoke the installed " + skill.id + " skill. Ask it to execute both files under fresh inputs using the bundled runner; do not rewrite the algorithm or read reviewer-only labels.", "4. Retain actual tool invocations, process exit codes, supported output and unsupported stderr, plus host model usage/latency. Compare results independently using reviewer-only/expected.private.json outside this workspace.", "5. Distinguish discovery, explicit invocation, and execution. Keep automatic selection unverified unless separately exercised.", "", "Candidate SHA-256: " + candidateHash, "Package identity SHA-256: " + packageHash, "Protocol SHA-256: " + protocolHash, "", "The procedure needs no Nemotron endpoint; the host may still need its own model/network connection. Hash manifests are integrity metadata, not a security sandbox.", ""].join("\n"), { flag: "wx" });
  await writeFile(path.join(output, host + ".evidence.template.json"), JSON.stringify({ schemaVersion: "emberforge.transfer-rehearsal/1", status: "prepared_unverified", host, candidateHash, packageHash, protocolHash, workspace, installed, discovery: null, explicitInvocation: null, automaticSelection: null, execution: null, serverStoppedEvidence: null, hostVersion: null, hostTokens: null, hostInvocationMs: null, actualResultArtifacts: [], limitations: ["Preparation does not establish any host gate. Operator observations require review against actual logs and result hashes."] }, null, 2) + "\n", { flag: "wx" });
}
console.log(JSON.stringify({ status: "prepared_unverified", output, candidateHash, packageHash, hostsExecuted: [] }));
