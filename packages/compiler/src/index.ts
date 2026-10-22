import { createHash } from "node:crypto";
import {
  SkillContractSchema,
  SkillDefinitionSchema,
  StockDatasetSchema,
  StockParametersSchema,
  type SkillContract,
  type SkillDefinition
} from "@pocketforge/contracts";
import { reconcileStock, UnsupportedInputError } from "@pocketforge/evaluator";
import { executeSkill, SkillExecutionError, validateSkillIR } from "@pocketforge/runtime";

export type VerificationCase =
  | {
      caseId: string;
      expectedOutcome: "supported";
      parameters: unknown;
      dataset: unknown;
    }
  | {
      caseId: string;
      expectedOutcome: "unsupported";
      parameters: unknown;
      dataset: unknown;
      expectedReason: string;
    };

export interface VerificationCaseResult {
  caseId: string;
  expectedOutcome: "supported" | "unsupported";
  actualOutcome: "correct" | "incorrect" | "reference_mismatch";
  passed: boolean;
  expectedReason?: string;
  actualReason?: string;
  expectedResultHash?: string;
  actualResultHash?: string;
  durationMs: number;
}

export interface VerificationReport {
  schemaVersion: "pocketforge.verification/1";
  scope: "finite-development-suite";
  candidateOrigin: "provided_candidate_draft";
  skillId: string;
  skillVersion: string;
  candidateHash: string;
  status: "validated" | "rejected";
  supportedCaseCount: number;
  correctSupportedCount: number;
  unsupportedCaseCount: number;
  rejectedUnsupportedCount: number;
  falseAcceptanceCount: number;
  needlessFallbackCount: number;
  coverage: number;
  cases: VerificationCaseResult[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface CompileCandidateResult {
  skill: SkillDefinition;
  contract: SkillContract;
  verification: VerificationReport;
  exportable: boolean;
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

function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeForHash(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function makeResult(
  input: Omit<VerificationCaseResult, "durationMs">,
  durationMs: number
): VerificationCaseResult {
  return { ...input, durationMs };
}

export function verifyCandidate(
  skillInput: unknown,
  contractInput: unknown,
  cases: readonly VerificationCase[]
): VerificationReport {
  const startedAt = new Date().toISOString();
  const timerStart = performance.now();
  const skill = SkillDefinitionSchema.parse(skillInput);
  const contract = SkillContractSchema.parse(contractInput);
  validateSkillIR(skill.ir);
  if (skill.id !== contract.skillId || skill.version !== contract.skillVersion ||
    skill.taskFamily !== contract.taskFamily) {
    throw new Error("Skill definition and applicability contract do not match");
  }
  if (cases.length === 0) throw new Error("A candidate requires at least one verification case");
  const caseIds = new Set<string>();
  const results: VerificationCaseResult[] = [];

  for (const testCase of cases) {
    if (caseIds.has(testCase.caseId)) throw new Error("Duplicate verification case id " + testCase.caseId);
    caseIds.add(testCase.caseId);
    const caseStart = performance.now();
    const parameters = StockParametersSchema.parse(testCase.parameters);
    const dataset = StockDatasetSchema.parse(testCase.dataset);

    if (testCase.expectedOutcome === "supported") {
      let expected: ReturnType<typeof reconcileStock>;
      try {
        expected = reconcileStock(parameters, dataset);
      } catch (error) {
        results.push(makeResult({
          caseId: testCase.caseId,
          expectedOutcome: "supported",
          actualOutcome: "reference_mismatch",
          passed: false,
          actualReason: error instanceof UnsupportedInputError ? error.code : "REFERENCE_ERROR"
        }, performance.now() - caseStart));
        continue;
      }
      try {
        const actual = executeSkill(skill, contract, parameters, dataset).records;
        const expectedJson = canonicalJson(expected.lines);
        const actualJson = canonicalJson(actual);
        results.push(makeResult({
          caseId: testCase.caseId,
          expectedOutcome: "supported",
          actualOutcome: expectedJson === actualJson ? "correct" : "incorrect",
          passed: expectedJson === actualJson,
          expectedResultHash: sha256(expectedJson),
          actualResultHash: sha256(actualJson)
        }, performance.now() - caseStart));
      } catch (error) {
        results.push(makeResult({
          caseId: testCase.caseId,
          expectedOutcome: "supported",
          actualOutcome: "incorrect",
          passed: false,
          actualReason: error instanceof SkillExecutionError ? error.code : "EXECUTION_ERROR"
        }, performance.now() - caseStart));
      }
      continue;
    }

    try {
      reconcileStock(parameters, dataset);
      results.push(makeResult({
        caseId: testCase.caseId,
        expectedOutcome: "unsupported",
        actualOutcome: "reference_mismatch",
        passed: false,
        expectedReason: testCase.expectedReason,
        actualReason: "REFERENCE_ACCEPTED_CASE"
      }, performance.now() - caseStart));
      continue;
    } catch (error) {
      const referenceReason = error instanceof UnsupportedInputError ? error.code : "REFERENCE_ERROR";
      if (referenceReason !== testCase.expectedReason) {
        results.push(makeResult({
          caseId: testCase.caseId,
          expectedOutcome: "unsupported",
          actualOutcome: "reference_mismatch",
          passed: false,
          expectedReason: testCase.expectedReason,
          actualReason: referenceReason
        }, performance.now() - caseStart));
        continue;
      }
    }

    try {
      executeSkill(skill, contract, parameters, dataset);
      results.push(makeResult({
        caseId: testCase.caseId,
        expectedOutcome: "unsupported",
        actualOutcome: "incorrect",
        passed: false,
        expectedReason: testCase.expectedReason,
        actualReason: "FALSE_ACCEPTANCE"
      }, performance.now() - caseStart));
    } catch (error) {
      const actualReason = error instanceof SkillExecutionError ? error.code : "EXECUTION_ERROR";
      const passed = actualReason === testCase.expectedReason;
      results.push(makeResult({
        caseId: testCase.caseId,
        expectedOutcome: "unsupported",
        actualOutcome: passed ? "correct" : "incorrect",
        passed,
        expectedReason: testCase.expectedReason,
        actualReason
      }, performance.now() - caseStart));
    }
  }

  const supported = results.filter((result) => result.expectedOutcome === "supported");
  const unsupported = results.filter((result) => result.expectedOutcome === "unsupported");
  const correctSupportedCount = supported.filter((result) => result.passed).length;
  const rejectedUnsupportedCount = unsupported.filter((result) => result.passed).length;
  const falseAcceptanceCount = unsupported.filter((result) => result.actualReason === "FALSE_ACCEPTANCE").length;
  const needlessFallbackCount = supported.filter((result) => result.actualReason !== undefined).length;
  const status = correctSupportedCount === supported.length &&
    rejectedUnsupportedCount === unsupported.length ? "validated" : "rejected";
  const endedAt = new Date().toISOString();
  const candidateHash = sha256(canonicalJson({ skill, contract }));
  const durationMs = performance.now() - timerStart;

  return {
    schemaVersion: "pocketforge.verification/1",
    scope: "finite-development-suite",
    candidateOrigin: "provided_candidate_draft",
    skillId: skill.id,
    skillVersion: skill.version,
    candidateHash,
    status,
    supportedCaseCount: supported.length,
    correctSupportedCount,
    unsupportedCaseCount: unsupported.length,
    rejectedUnsupportedCount,
    falseAcceptanceCount,
    needlessFallbackCount,
    coverage: supported.length === 0 ? 0 : correctSupportedCount / supported.length,
    cases: results,
    startedAt,
    endedAt,
    durationMs
  };
}

export function compileCandidate(
  skillInput: unknown,
  contractInput: unknown,
  cases: readonly VerificationCase[]
): CompileCandidateResult {
  const skill = SkillDefinitionSchema.parse(skillInput);
  const contract = SkillContractSchema.parse(contractInput);
  const verification = verifyCandidate(skill, contract, cases);
  return {
    skill,
    contract,
    verification,
    exportable: verification.status === "validated"
  };
}

