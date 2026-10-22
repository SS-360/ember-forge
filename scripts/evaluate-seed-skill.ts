import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileCandidate, type VerificationCase } from "../packages/compiler/src/index.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(await readFile(path.join(projectRoot, "fixtures", "dev", "stock-reconciliation.json"), "utf8"));
const skill = JSON.parse(await readFile(path.join(projectRoot, "skills", "stock-reconciliation", "skill.json"), "utf8"));
const contract = JSON.parse(await readFile(path.join(projectRoot, "skills", "stock-reconciliation", "contract.json"), "utf8"));
const parameters = fixture.parameters;
const dataset = fixture.dataset;

const changedInput = {
  ...dataset,
  orders: [
    {
      orderId: "ORD-NEVER-SEEN",
      warehouseId: "WH-01",
      orderDate: "2026-10-23",
      sku: "red-cup",
      quantity: 1,
      unit: "BOX",
      status: "open"
    },
    ...[...dataset.orders].reverse()
  ]
};

const unsupportedCases: Array<{ caseId: string; expectedReason: string; parameters: unknown; dataset: unknown }> = [
  {
    caseId: "dev-unknown-unit",
    expectedReason: "UNKNOWN_UNIT",
    parameters,
    dataset: {
      ...dataset,
      orders: dataset.orders.map((order: { unit: string }, index: number) =>
        index === 0 ? { ...order, unit: "PALLET" } : order)
    }
  },
  {
    caseId: "dev-changed-policy",
    expectedReason: "POLICY_VERSION_MISMATCH",
    parameters: { ...parameters, policyVersion: "stock-v2" },
    dataset
  },
  {
    caseId: "dev-changed-schema",
    expectedReason: "SCHEMA_VERSION_MISMATCH",
    parameters,
    dataset: {
      ...dataset,
      sourceSchemaVersions: { ...dataset.sourceSchemaVersions, inventory: "inventory/v2" }
    }
  },
  {
    caseId: "dev-future-inventory-snapshot",
    expectedReason: "INVENTORY_SNAPSHOT_AFTER_RANGE",
    parameters,
    dataset: {
      ...dataset,
      inventory: dataset.inventory.map((record: { snapshotDate: string }) =>
        ({ ...record, snapshotDate: "2026-10-24" }))
    }
  },
  {
    caseId: "dev-missing-inventory",
    expectedReason: "INVENTORY_NOT_FOUND",
    parameters,
    dataset: {
      ...dataset,
      inventory: dataset.inventory.filter((record: { sku: string }) => record.sku !== "CUP-RED")
    }
  }
];

const cases: VerificationCase[] = [
  {
    caseId: "dev-supported-baseline",
    expectedOutcome: "supported",
    parameters,
    dataset
  },
  {
    caseId: "dev-supported-new-order-id-and-row-order",
    expectedOutcome: "supported",
    parameters: { ...parameters, fromDate: "2026-10-23", throughDate: "2026-10-23" },
    dataset: changedInput
  },
  ...unsupportedCases.map((testCase) => ({
    ...testCase,
    expectedOutcome: "unsupported" as const
  }))
];

const result = compileCandidate(skill, contract, cases);
const skillDir = path.join(projectRoot, "skills", "stock-reconciliation");
const testManifest = {
  suite: "stock-reconciliation development verification",
  scope: "finite development fixtures; not held-out evaluation",
  cases: cases.map((testCase) => ({
    caseId: testCase.caseId,
    expectedOutcome: testCase.expectedOutcome,
    ...(testCase.expectedOutcome === "unsupported" ? { expectedReason: testCase.expectedReason } : {})
  }))
};
await mkdir(path.join(skillDir, "tests"), { recursive: true });
await writeFile(path.join(skillDir, "tests", "cases.json"), JSON.stringify(testManifest, null, 2) + "\n", "utf8");
await writeFile(path.join(skillDir, "verification.json"), JSON.stringify(result.verification, null, 2) + "\n", "utf8");

console.log(JSON.stringify({
  status: result.verification.status,
  candidateOrigin: result.verification.candidateOrigin,
  supported: result.verification.correctSupportedCount + "/" + result.verification.supportedCaseCount,
  unsupportedRejected: result.verification.rejectedUnsupportedCount + "/" + result.verification.unsupportedCaseCount,
  falseAcceptanceCount: result.verification.falseAcceptanceCount,
  needlessFallbackCount: result.verification.needlessFallbackCount,
  coverage: result.verification.coverage,
  verificationFile: "skills/stock-reconciliation/verification.json"
}, null, 2));

if (!result.exportable) process.exitCode = 1;

