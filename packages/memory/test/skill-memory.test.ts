import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { StockDatasetSchema, StockParametersSchema } from "@emberforge/contracts";
import { executeSkill } from "@emberforge/runtime";
import { SkillMemoryService } from "../src/index.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureUrl = new URL("../../../fixtures/dev/stock-reconciliation.json", import.meta.url);
const skillUrl = new URL("../../../skills/stock-reconciliation/skill.json", import.meta.url);
const contractUrl = new URL("../../../skills/stock-reconciliation/contract.json", import.meta.url);
const verificationUrl = new URL("../../../skills/stock-reconciliation/verification.json", import.meta.url);
const [fixture, skill, contract, verification] = await Promise.all([
  readFile(fileURLToPath(fixtureUrl), "utf8").then(JSON.parse),
  readFile(fileURLToPath(skillUrl), "utf8").then(JSON.parse),
  readFile(fileURLToPath(contractUrl), "utf8").then(JSON.parse),
  readFile(fileURLToPath(verificationUrl), "utf8").then(JSON.parse)
]);
const dataset = StockDatasetSchema.parse(fixture.dataset);
const parameters = StockParametersSchema.parse(fixture.parameters);

async function createStorageDir(): Promise<string> {
  const artifactsRoot = path.join(projectRoot, "artifacts");
  await mkdir(artifactsRoot, { recursive: true });
  return mkdtemp(path.join(artifactsRoot, "hmem-test-"));
}

async function removeStorageDir(storageDir: string): Promise<void> {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedTarget = path.resolve(storageDir);
  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw new Error("Refusing to remove a test directory outside the project.");
  }
  await rm(resolvedTarget, { recursive: true, force: true });
}

describe("H-MEM-backed skill memory", () => {
  it("registers, retrieves, and executes a validated candidate after a cold/warm restart", async () => {
    const storageDir = await createStorageDir();
    try {
      const cold = new SkillMemoryService({ projectRoot, storageDir });
      const registered = cold.registerValidatedSkill({ skill, contract, verification });
      expect(registered.status).toBe("validated");

      const warm = new SkillMemoryService({ projectRoot, storageDir });
      const result = warm.retrieveApplicable({
        query: "reconcile stock demand and inventory",
        parameters,
        dataset
      });
      expect(result.selected?.skill.id).toBe("stock-reconciliation");
      expect(result.selected?.evidenceIds).toContain("verification:" + verification.candidateHash);
      expect(result.retrieval.nominatedMemoryIds).toContain(registered.memoryId);

      const execution = executeSkill(result.selected!.skill, result.selected!.contract, parameters, dataset);
      expect(execution.records).toEqual([
        { sku: "CUP-RED", demandEach: 25, onHandEach: 15, shortageEach: 10 },
        { sku: "MUG-BLUE", demandEach: 5, onHandEach: 8, shortageEach: 0 }
      ]);
    } finally {
      await removeStorageDir(storageDir);
    }
  });

  it("invalidates and audits a retrieved skill when its source schema changes", async () => {
    const storageDir = await createStorageDir();
    try {
      const service = new SkillMemoryService({ projectRoot, storageDir });
      service.registerValidatedSkill({ skill, contract, verification });
      const changedDataset = {
        ...dataset,
        sourceSchemaVersions: { ...dataset.sourceSchemaVersions, inventory: "inventory/v2" }
      };
      const result = service.retrieveApplicable({
        query: "stock reconciliation",
        parameters,
        dataset: changedDataset
      });
      expect(result.selected).toBeUndefined();
      expect(result.rejections).toEqual([
        expect.objectContaining({ reason: "SCHEMA_VERSION_MISMATCH" })
      ]);
      expect(service.list()[0]?.status).toBe("deprecated");
      expect(service.hmem.ledger.history(service.list()[0]!.memoryId)
        .some((entry) => entry.action === "update")).toBe(true);
    } finally {
      await removeStorageDir(storageDir);
    }
  });

  it("invalidates on policy changes and never treats retrieved memory as authorization", async () => {
    const storageDir = await createStorageDir();
    try {
      const service = new SkillMemoryService({ projectRoot, storageDir });
      service.registerValidatedSkill({ skill, contract, verification });
      const result = service.retrieveApplicable({
        query: "stock reconciliation",
        parameters: { ...parameters, policyVersion: "stock-v2" },
        dataset
      });
      expect(result.selected).toBeUndefined();
      expect(result.rejections[0]?.reason).toBe("POLICY_VERSION_MISMATCH");
      expect(service.list()[0]?.invalidatedReason).toBe("POLICY_VERSION_MISMATCH");
    } finally {
      await removeStorageDir(storageDir);
    }
  });

  it("does not deprecate a skill for one unsupported source mode", async () => {
    const storageDir = await createStorageDir();
    try {
      const service = new SkillMemoryService({ projectRoot, storageDir });
      service.registerValidatedSkill({ skill, contract, verification });
      const result = service.retrieveApplicable({
        query: "stock reconciliation",
        parameters,
        dataset: { ...dataset, sourceMode: "live" }
      });
      expect(result.selected).toBeUndefined();
      expect(result.rejections[0]?.reason).toBe("UNSUPPORTED_SOURCE_MODE");
      expect(service.list()[0]?.status).toBe("validated");
    } finally {
      await removeStorageDir(storageDir);
    }
  });

  it("rejects unverified candidates before writing skill memory", async () => {
    const storageDir = await createStorageDir();
    try {
      const service = new SkillMemoryService({ projectRoot, storageDir });
      expect(() => service.registerValidatedSkill({
        skill,
        contract,
        verification: { ...verification, status: "rejected" }
      })).toThrow(/Only a validated candidate/);
      expect(service.list()).toHaveLength(0);
      expect(service.hmem.store.all()).toHaveLength(0);
    } finally {
      await removeStorageDir(storageDir);
    }
  });

  it("does not register altered code under another candidate's verification evidence", async () => {
    const storageDir = await createStorageDir();
    try {
      const service = new SkillMemoryService({ projectRoot, storageDir });
      const modifiedSkill = structuredClone(skill);
      const compute = modifiedSkill.ir.operations.find((operation: { kind: string }) => operation.kind === "compute");
      compute.leftField = "onHandEach";
      expect(() => service.registerValidatedSkill({
        skill: modifiedSkill,
        contract,
        verification
      })).toThrow(/does not match this exact skill and contract/);
      expect(service.list()).toHaveLength(0);
      expect(service.hmem.store.all()).toHaveLength(0);
    } finally {
      await removeStorageDir(storageDir);
    }
  });
});

