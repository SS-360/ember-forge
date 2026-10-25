import {
  SkillContractSchema, SkillDefinitionSchema, StockDatasetSchema, StockParametersSchema,
  type SkillContract, type SkillDefinition
} from "@pocketforge/contracts";
import { SanitizedTraceSchema, type SanitizedTrace, type TraceSet } from "@pocketforge/contracts/traces";
import { reconcileStock, UnsupportedInputError } from "@pocketforge/evaluator";
import { executeSkill, SkillExecutionError, type OperationObservation } from "@pocketforge/runtime";
import { buildDevelopmentSuite } from "./development-suite.js";
import { canonicalHash } from "./trace-compiler.js";

/** Captures actual runtime events. These replay fixtures are explicitly not agent learning evidence. */
export function captureReplayExamples(skillInput: unknown, contractInput: unknown, fixture: Parameters<typeof buildDevelopmentSuite>[0]): TraceSet {
  return captureReplayCases(skillInput, contractInput, buildDevelopmentSuite(fixture).filter((testCase) => testCase.expectedOutcome === "supported" || testCase.caseId === "dev-unknown-unit"));
}

export function captureReplayCases(skillInput: unknown, contractInput: unknown, cases: readonly { caseId: string; parameters: unknown; dataset: unknown }[]): TraceSet {
  const skill: SkillDefinition = SkillDefinitionSchema.parse(skillInput);
  const contract: SkillContract = SkillContractSchema.parse(contractInput);
  const sourceCandidateHash = canonicalHash({ skill, contract });
  const traces: SanitizedTrace[] = [];
  for (const testCase of cases) {
    const parameters = StockParametersSchema.parse(testCase.parameters);
    const dataset = StockDatasetSchema.parse(testCase.dataset);
    let expectedHash: string | undefined;
    let expectedReason: string | undefined;
    try { expectedHash = canonicalHash(reconcileStock(parameters, dataset).lines); }
    catch (error) {
      if (!(error instanceof UnsupportedInputError)) throw error;
      expectedReason = error.code;
    }
    const calls: OperationObservation[] = [];
    let outputHash: string | undefined;
    let actualReason: string | undefined;
    try { outputHash = canonicalHash(executeSkill(skill, contract, parameters, dataset, (event) => calls.push(event)).records); }
    catch (error) {
      if (!(error instanceof SkillExecutionError)) throw error;
      actualReason = error.code;
    }
    if (actualReason !== expectedReason || outputHash !== expectedHash) throw new Error("Replay does not agree with the independent reference for " + testCase.caseId);
    const inputHash = canonicalHash({ parameters, dataset });
    const identity = canonicalHash({ sourceCandidateHash, inputHash });
    const traceId = `${identity.slice(0, 8)}-${identity.slice(8, 12)}-4${identity.slice(13, 16)}-8${identity.slice(17, 20)}-${identity.slice(20, 32)}`;
    traces.push(SanitizedTraceSchema.parse({
      schemaVersion: "pocketforge.trace/1", traceId, taskFamily: "stock-reconciliation",
      evidenceClass: "synthetic_fixture", recordingMethod: "compiled_runtime_replay", sourceCandidateHash,
      recordedAt: new Date().toISOString(), sourceMode: dataset.sourceMode,
      policyVersion: parameters.policyVersion, sourceVersions: dataset.sourceVersions, sourceSchemaVersions: dataset.sourceSchemaVersions,
      inputHash, parameterNames: ["warehouseId", "fromDate", "throughDate", "policyVersion"], calls,
      ...(calls.length === 0 && actualReason ? { failureStage: "applicability" } : {}),
      ...(outputHash ? { outputArtifactHash: outputHash } : {}),
      label: { authority: "independent_evaluator", evaluatorVersion: "stock-reference/2", outcome: expectedReason ? "unsupported" : "succeeded", ...(expectedReason ? { reason: expectedReason } : {}) },
      redaction: { profile: "pocketforge.redaction/1", rawLogsIncluded: false, rawInputValuesIncluded: false, removedFieldCount: 0 }
    }));
  }
  return { schemaVersion: "pocketforge.trace-set/1", traces };
}
