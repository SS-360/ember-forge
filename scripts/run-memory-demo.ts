import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StockDatasetSchema, StockParametersSchema } from "../packages/contracts/src/index.js";
import { SkillMemoryService } from "../packages/memory/src/index.js";
import { executeSkill } from "../packages/runtime/src/index.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (relativePath: string): Promise<any> =>
  JSON.parse(await readFile(path.join(projectRoot, relativePath), "utf8"));
const [fixture, skill, contract, verification] = await Promise.all([
  readJson("fixtures/dev/stock-reconciliation.json"),
  readJson("skills/stock-reconciliation/skill.json"),
  readJson("skills/stock-reconciliation/contract.json"),
  readJson("skills/stock-reconciliation/verification.json")
]);
const parameters = StockParametersSchema.parse(fixture.parameters);
const dataset = StockDatasetSchema.parse(fixture.dataset);
const runId = randomUUID();
const storageDir = path.join(projectRoot, "artifacts", "memory-demo", runId);
const outputDir = path.join(projectRoot, "artifacts", "memory-demo");
await mkdir(outputDir, { recursive: true });

const cold = new SkillMemoryService({ projectRoot, storageDir });
const registered = cold.registerValidatedSkill({ skill, contract, verification });

const warm = new SkillMemoryService({ projectRoot, storageDir });
const warmSelection = warm.retrieveApplicable({
  query: "reconcile stock demand and inventory",
  parameters,
  dataset
});
if (!warmSelection.selected) throw new Error("The warm H-MEM retrieval did not find an applicable skill.");
const execution = executeSkill(
  warmSelection.selected.skill,
  warmSelection.selected.contract,
  parameters,
  dataset
);

const changedSchema = {
  ...dataset,
  sourceSchemaVersions: { ...dataset.sourceSchemaVersions, inventory: "inventory/v2" }
};
const staleSelection = warm.retrieveApplicable({
  query: "reconcile stock demand and inventory",
  parameters,
  dataset: changedSchema
});
if (staleSelection.selected) throw new Error("A stale skill was selected after a source schema change.");
const staleReason = staleSelection.rejections[0]?.reason;
if (staleReason !== "SCHEMA_VERSION_MISMATCH") {
  throw new Error("Expected schema invalidation, received " + String(staleReason));
}

const resultHash = createHash("sha256")
  .update(JSON.stringify(execution.records))
  .digest("hex");
const artifact = {
  evidenceLabel: "SYNTHETIC H-MEM INTEGRATION DEMO",
  runId,
  sourceMode: "fixture",
  candidateHash: registered.candidateHash,
  cold: {
    registeredMemoryId: registered.memoryId,
    storedEvidenceIds: registered.evidenceIds
  },
  warm: {
    selectedSkillId: warmSelection.selected.skill.id,
    selectedSkillVersion: warmSelection.selected.skill.version,
    retrievedMemoryId: warmSelection.selected.memoryId,
    relevance: warmSelection.selected.relevance,
    retrievalReason: warmSelection.retrieval.retrievalReason,
    outputHash: resultHash,
    output: execution.records
  },
  invalidation: {
    selectedSkill: null,
    reason: staleReason,
    finalStatus: warm.list().find((entry) => entry.memoryId === registered.memoryId)?.status,
    trustLedgerActions: warm.hmem.ledger.history(registered.memoryId).map((entry) => entry.action)
  },
  limitation: "Synthetic fixture integration only; it does not establish live Nemotron or Zetaris access."
};
const outputPath = path.join(outputDir, runId + ".json");
await writeFile(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  evidenceLabel: artifact.evidenceLabel,
  runId,
  warmRetrieved: artifact.warm.selectedSkillId + "@" + artifact.warm.selectedSkillVersion,
  resultHash,
  invalidationReason: artifact.invalidation.reason,
  finalStatus: artifact.invalidation.finalStatus,
  artifact: path.relative(projectRoot, outputPath)
}, null, 2));

