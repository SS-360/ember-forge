import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { SkillContractSchema, SkillDefinitionSchema } from "@emberforge/contracts";
import { assessApplicability } from "@emberforge/runtime";
import type { SkillContract, SkillDefinition, StockDataset, StockParameters } from "@emberforge/contracts";

interface HmemMemoryRecord {
  id: string;
  tags: string[];
}

interface HmemFacade {
  add(input: {
    content: string;
    type: "factual" | "general";
    layer: "working" | "long_term";
    tags: string[];
    confidence: number;
    source: string;
    provenance: {
      origin: "plan_completion";
      learnedAt: number;
      label: string;
      refs: string[];
    };
    chatId: string;
    missionId: string;
    goalRunId: string;
  }): HmemMemoryRecord;
  query(query: string, options: { topN: number; threshold: number; chatId: string }): {
    memories: Array<{ memory: HmemMemoryRecord; relevance: number }>;
    trace: { retrievalReason: string; strategy: string };
  };
  store: {
    get(memoryId: string): HmemMemoryRecord | undefined;
    update(memoryId: string, patch: Partial<HmemMemoryRecord>): HmemMemoryRecord;
    all(): HmemMemoryRecord[];
  };
  ledger: {
    history(memoryId: string): Array<{ action: string }>;
  };
}

const hmemModulePath = "../../../vendor/meterless/hmem/reference/src/index.js";
const hmemModule = await import(hmemModulePath) as {
  HMEM: new (options: { persistDir: string; actor: string }) => HmemFacade;
};
const HMEM = hmemModule.HMEM;

export type SkillMemoryStatus = "validated" | "rejected" | "deprecated";

export interface SkillMemoryEntry {
  skillId: string;
  skillVersion: string;
  status: SkillMemoryStatus;
  policyVersion: string;
  sourceSchemaVersions: SkillContract["sourceSchemaVersions"];
  supportedSourceModes: SkillContract["supportedSourceModes"];
  candidateHash: string;
  memoryId: string;
  skillPath: string;
  contractPath: string;
  evidenceIds: string[];
  registeredAt: string;
  invalidatedReason?: string;
}

export interface SkillSelection {
  selected?: {
    skill: SkillDefinition;
    contract: SkillContract;
    memoryId: string;
    relevance: number;
    evidenceIds: string[];
  };
  retrieval: {
    query: string;
    retrievalReason: string;
    strategy: string;
    nominatedMemoryIds: string[];
  };
  rejections: Array<{
    skillId: string;
    skillVersion: string;
    memoryId: string;
    reason: string;
  }>;
}

interface RegistryFile {
  schemaVersion: 1;
  chatId?: string;
  entries: SkillMemoryEntry[];
}

function safePath(root: string, relativePath: string): string {
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  if (!absolutePath.startsWith(absoluteRoot + path.sep)) {
    throw new Error("Skill memory path escapes the project root");
  }
  return absolutePath;
}

function cleanTags(tags: string[]): string[] {
  return tags.filter((tag) => !tag.startsWith("status:"));
}

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object).sort().map((key) => [key, normalizeForHash(object[key])])
    );
  }
  return value;
}

function candidateHash(skill: SkillDefinition, contract: SkillContract): string {
  const canonical = JSON.stringify(normalizeForHash({ skill, contract }));
  return createHash("sha256").update(canonical).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class SkillMemoryService {
  readonly hmem: HmemFacade;
  private readonly projectRoot: string;
  private readonly storageDir: string;
  private readonly registryPath: string;
  private readonly chatId: string;
  private registry: RegistryFile;

  constructor(options: { projectRoot: string; storageDir: string }) {
    this.projectRoot = path.resolve(options.projectRoot);
    this.storageDir = path.resolve(options.storageDir);
    fs.mkdirSync(this.storageDir, { recursive: true });
    this.registryPath = path.join(this.storageDir, "registry.json");
    this.registry = fs.existsSync(this.registryPath)
      ? JSON.parse(fs.readFileSync(this.registryPath, "utf8")) as RegistryFile
      : { schemaVersion: 1, entries: [] };
    if (this.registry.schemaVersion !== 1 || !Array.isArray(this.registry.entries)) {
      throw new Error("Unsupported Ember Forge skill registry format");
    }
    // Keep existing chat-scoped memories reachable without rewriting their trust ledger.
    this.chatId = this.registry.chatId ?? (fs.existsSync(this.registryPath) ? "pocketforge-local" : "emberforge-local");
    this.registry.chatId = this.chatId;
    this.hmem = new HMEM({
      persistDir: path.join(this.storageDir, "hmem"),
      actor: "emberforge"
    });
  }

  list(): SkillMemoryEntry[] {
    return structuredClone(this.registry.entries);
  }

  registerValidatedSkill(input: {
    skill: unknown;
    contract: unknown;
    verification: unknown;
    artifactPaths?: { skillPath: string; contractPath: string };
  }): SkillMemoryEntry {
    const skill = SkillDefinitionSchema.parse(input.skill);
    const contract = SkillContractSchema.parse(input.contract);
    if (skill.id !== contract.skillId || skill.version !== contract.skillVersion ||
      skill.taskFamily !== contract.taskFamily) {
      throw new Error("Skill and contract identity do not match");
    }
    if (!isRecord(input.verification) || input.verification.status !== "validated" ||
      input.verification.skillId !== skill.id || input.verification.skillVersion !== skill.version ||
      typeof input.verification.candidateHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(input.verification.candidateHash)) {
      throw new Error("Only a validated candidate with a content hash can enter the skill library");
    }
    const candidateHash = input.verification.candidateHash;
    if (candidateHash !== candidateHashForSkill(skill, contract)) {
      throw new Error("Verification evidence does not match this exact skill and contract");
    }
    const existing = this.registry.entries.find((entry) =>
      entry.skillId === skill.id && entry.skillVersion === skill.version
    );
    if (existing) {
      if (existing.candidateHash === candidateHash && existing.status === "validated") return existing;
      throw new Error("A skill version is immutable; create a new version to replace it");
    }

    const skillPath = input.artifactPaths?.skillPath ?? "skills/" + skill.id + "/skill.json";
    const contractPath = input.artifactPaths?.contractPath ?? "skills/" + skill.id + "/contract.json";
    const storedSkill = SkillDefinitionSchema.parse(JSON.parse(fs.readFileSync(safePath(this.projectRoot, skillPath), "utf8")));
    const storedContract = SkillContractSchema.parse(JSON.parse(fs.readFileSync(safePath(this.projectRoot, contractPath), "utf8")));
    if (candidateHashForSkill(storedSkill, storedContract) !== candidateHash) throw new Error("Stored artifacts do not match the verified candidate.");
    const caseIds = Array.isArray(input.verification.cases)
      ? input.verification.cases
        .map((item) => isRecord(item) && typeof item.caseId === "string" ? item.caseId : undefined)
        .filter((item): item is string => Boolean(item))
      : [];
    const evidenceIds = ["verification:" + candidateHash, ...caseIds];
    const memory = this.hmem.add({
      content: "Ember Forge validated skill " + skill.id + " version " + skill.version +
        " for stock reconciliation. Reconcile stock demand and inventory using orders, product aliases and unit conversions. Policy " + contract.policyVersion +
        ". Source schemas " + contract.sourceSchemaVersions.orders + ", " +
        contract.sourceSchemaVersions.inventory + ", " + contract.sourceSchemaVersions.productRules +
        ". Evidence " + candidateHash + ".",
      type: "factual",
      layer: "long_term",
      tags: [
        "emberforge:skill",
        "skill:" + skill.id,
        "version:" + skill.version,
        "status:validated",
        "policy:" + contract.policyVersion,
        "schema:" + contract.sourceSchemaVersions.orders,
        "schema:" + contract.sourceSchemaVersions.inventory,
        "schema:" + contract.sourceSchemaVersions.productRules
      ],
      confidence: 1,
      source: "verification:" + candidateHash,
      provenance: {
        origin: "plan_completion",
        learnedAt: Date.now(),
        label: "validated using an independent finite verification suite",
        refs: evidenceIds
      },
      chatId: this.chatId,
      missionId: "skill-library",
      goalRunId: skill.id + ":" + skill.version
    });
    const entry: SkillMemoryEntry = {
      skillId: skill.id,
      skillVersion: skill.version,
      status: "validated",
      policyVersion: contract.policyVersion,
      sourceSchemaVersions: contract.sourceSchemaVersions,
      supportedSourceModes: contract.supportedSourceModes,
      candidateHash,
      memoryId: memory.id,
      skillPath,
      contractPath,
      evidenceIds,
      registeredAt: new Date().toISOString()
    };
    this.registry.entries.push(entry);
    this.persistRegistry();
    return structuredClone(entry);
  }

  recordRejectedCandidate(input: {
    skillId: string;
    skillVersion: string;
    candidateHash: string;
    reason: string;
    evidenceIds: string[];
  }): HmemMemoryRecord {
    const record = this.hmem.add({
      content: "Ember Forge rejected candidate " + input.skillId + " version " + input.skillVersion +
        " because " + input.reason + ". Evidence " + input.candidateHash + ".",
      type: "general",
      layer: "working",
      tags: [
        "emberforge:skill",
        "skill:" + input.skillId,
        "version:" + input.skillVersion,
        "status:rejected",
        "failure:" + input.reason
      ],
      confidence: 0.95,
      source: "verification:" + input.candidateHash,
      provenance: {
        origin: "plan_completion",
        learnedAt: Date.now(),
        label: "candidate verification rejected this draft",
        refs: input.evidenceIds
      },
      chatId: this.chatId,
      missionId: "skill-library",
      goalRunId: input.skillId + ":" + input.skillVersion
    });
    return record;
  }

  recordExecutionFailure(input: {
    skillId: string;
    skillVersion: string;
    runId: string;
    reason: string;
    sourceVersions: Record<string, string>;
  }): HmemMemoryRecord {
    const record = this.hmem.add({
      content: "Ember Forge skill " + input.skillId + " version " + input.skillVersion +
        " rejected an input during run " + input.runId + " with reason " + input.reason +
        ". Source snapshots " + Object.values(input.sourceVersions).join(", ") + ".",
      type: "factual",
      layer: "working",
      tags: [
        "emberforge:failure",
        "skill:" + input.skillId,
        "version:" + input.skillVersion,
        "failure:" + input.reason
      ],
      confidence: 1,
      source: "execution:" + input.runId,
      provenance: {
        origin: "plan_completion",
        learnedAt: Date.now(),
        label: "structured unsupported execution result",
        refs: [input.runId, ...Object.values(input.sourceVersions)]
      },
      chatId: this.chatId,
      missionId: "skill-library",
      goalRunId: input.runId
    });
    return record;
  }

  retrieveApplicable(input: {
    query: string;
    parameters: StockParameters;
    dataset: StockDataset;
  }): SkillSelection {
    const retrieval = this.hmem.query(input.query, { topN: 5, threshold: 0.35, chatId: this.chatId });
    const rejections: SkillSelection["rejections"] = [];
    for (const candidate of retrieval.memories) {
      const entry = this.registry.entries.find((item) => item.memoryId === candidate.memory.id);
      if (!entry) continue;
      if (entry.status !== "validated") {
        rejections.push({ skillId: entry.skillId, skillVersion: entry.skillVersion, memoryId: entry.memoryId, reason: entry.invalidatedReason ?? "MEMORY_NOT_VALIDATED" });
        continue;
      }

      let skill: SkillDefinition;
      let contract: SkillContract;
      try {
        skill = SkillDefinitionSchema.parse(JSON.parse(fs.readFileSync(
          safePath(this.projectRoot, entry.skillPath), "utf8"
        )));
        contract = SkillContractSchema.parse(JSON.parse(fs.readFileSync(
          safePath(this.projectRoot, entry.contractPath), "utf8"
        )));
      } catch {
        this.deprecate(entry, "SKILL_ARTIFACT_UNAVAILABLE");
        rejections.push({
          skillId: entry.skillId,
          skillVersion: entry.skillVersion,
          memoryId: entry.memoryId,
          reason: "SKILL_ARTIFACT_UNAVAILABLE"
        });
        continue;
      }

      if (candidateHashForSkill(skill, contract) !== entry.candidateHash) {
        this.deprecate(entry, "SKILL_ARTIFACT_HASH_MISMATCH");
        rejections.push({ skillId: entry.skillId, skillVersion: entry.skillVersion, memoryId: entry.memoryId, reason: "SKILL_ARTIFACT_HASH_MISMATCH" });
        continue;
      }

      const verdict = assessApplicability(contract, input.parameters, input.dataset);
      if (!verdict.supported) {
        if (verdict.reason === "POLICY_VERSION_MISMATCH" ||
          verdict.reason === "SCHEMA_VERSION_MISMATCH" ||
          verdict.reason === "SKILL_ARTIFACT_UNAVAILABLE") {
          this.deprecate(entry, verdict.reason);
        }
        rejections.push({
          skillId: entry.skillId,
          skillVersion: entry.skillVersion,
          memoryId: entry.memoryId,
          reason: verdict.reason
        });
        continue;
      }
      return {
        selected: {
          skill,
          contract,
          memoryId: entry.memoryId,
          relevance: candidate.relevance,
          evidenceIds: [...entry.evidenceIds]
        },
        retrieval: {
          query: input.query,
          retrievalReason: retrieval.trace.retrievalReason,
          strategy: retrieval.trace.strategy,
          nominatedMemoryIds: retrieval.memories.map((item) => item.memory.id)
        },
        rejections
      };
    }
    return {
      retrieval: {
        query: input.query,
        retrievalReason: retrieval.trace.retrievalReason,
        strategy: retrieval.trace.strategy,
        nominatedMemoryIds: retrieval.memories.map((item) => item.memory.id)
      },
      rejections
    };
  }

  private deprecate(entry: SkillMemoryEntry, reason: string): void {
    entry.status = "deprecated";
    entry.invalidatedReason = reason;
    this.persistRegistry();
    const memory = this.hmem.store.get(entry.memoryId);
    if (memory) {
      this.hmem.store.update(entry.memoryId, {
        tags: [...cleanTags(memory.tags), "status:deprecated", "invalidated:" + reason]
      });
    }
    this.recordExecutionFailure({
      skillId: entry.skillId,
      skillVersion: entry.skillVersion,
      runId: "invalidation-" + entry.skillId + "-" + entry.skillVersion,
      reason,
      sourceVersions: entry.sourceSchemaVersions
    });
  }

  private persistRegistry(): void {
    fs.writeFileSync(this.registryPath, JSON.stringify(this.registry, null, 2) + "\n", "utf8");
  }
}

function candidateHashForSkill(skill: SkillDefinition, contract: SkillContract): string {
  return candidateHash(skill, contract);
}
