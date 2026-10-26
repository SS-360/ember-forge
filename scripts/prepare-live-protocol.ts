import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProtocolSplit, assertSplitSeparation } from "../packages/evaluator/src/protocol-fixtures.js";
import { freezeComparison } from "../packages/compiler/src/comparison.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runId = randomUUID(), directory = path.join(root, "artifacts", "live-workflows", runId);
const compilation = buildProtocolSplit("compilation", "original-nemotron-" + runId);
const development = buildProtocolSplit("development", "emberforge-development-v2");
const holdout = buildProtocolSplit("frozen", "paired-first-" + runId);
assertSplitSeparation([compilation, development, holdout]);
const categories = {
  "warehouse-a": "new_supported", "warehouse-b": "new_supported", "changed-rule-table": "new_supported", "unknown-unit": "unknown_unit", "schema-change": "schema_drift", "policy-change": "stale_policy", "duplicate-alias": "ambiguous_alias", "negative-quantity": "malformed_quantity", "duplicate-order": "duplicate_identity"
} as const;
const cases = Object.entries(categories).map(([name, category]) => {
  const item = holdout.cases.find((candidate) => candidate.caseId.includes("-" + name + "-"));
  if (!item) throw new Error("Missing protocol category " + name);
  return { caseId: item.caseId, category, provenance: "synthetic_fixture" as const, parameters: item.parameters, dataset: item.dataset };
});
const protocol = freezeComparison({ policyVersion: "stock-v1", cases, compilationInputHashes: compilation.inputHashes, developmentInputHashes: development.inputHashes });
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, "protocol.private.json"), JSON.stringify(protocol, null, 2) + "\n", { flag: "wx" });
await writeFile(path.join(directory, "compilation-inputs.private.json"), JSON.stringify(compilation.cases.map((item) => ({ caseId: item.caseId, parameters: item.parameters, dataset: item.dataset, evidenceClass: "synthetic_fixture" })), null, 2) + "\n", { flag: "wx" });
const manifest = { schemaVersion: "emberforge.live-workflow/1", runId, createdAt: new Date().toISOString(), directory: path.relative(root, directory), candidateId: "stock-nemotron-" + runId.slice(0, 8), protocolHash: protocol.protocolHash, frozenAt: protocol.frozenAt, compilationInputHashes: compilation.inputHashes, developmentSplitHash: development.splitHash, evaluationCases: protocol.cases.length, stage: "prepared_before_candidate", samples: [], agentJobs: [], traceIds: [], evidenceClass: "synthetic_fixture", limitation: "Independent input partitions from a shared synthetic domain generator. No real warehouse or live Zetaris source evidence is established by these inputs." };
await writeFile(path.join(directory, "workflow.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(manifest));
