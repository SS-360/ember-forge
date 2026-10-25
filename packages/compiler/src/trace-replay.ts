import { SkillContractSchema, SkillDefinitionSchema, type SkillOperation } from "@pocketforge/contracts";
import { SanitizedTraceSchema, SourceSnapshotSchema } from "@pocketforge/contracts/traces";
import { reconcileStock, UnsupportedInputError } from "@pocketforge/evaluator";
import { executeSkill, assessApplicability, SkillExecutionError, type OperationObservation } from "@pocketforge/runtime";
import { canonicalHash, TraceCompilationError } from "./trace-compiler.js";

/** Raw source data stays in local snapshot artifacts, never in SynthesisContext. */
export { SourceSnapshotSchema };

export function replayTraceSnapshot(traceInput: unknown, snapshotInput: unknown, trustedContractInput: unknown) {
  const trace = SanitizedTraceSchema.parse(traceInput);
  const snapshot = SourceSnapshotSchema.parse(snapshotInput);
  if (canonicalHash({ parameters: snapshot.parameters, dataset: snapshot.dataset }) !== snapshot.inputHash) throw new TraceCompilationError("SNAPSHOT_HASH_MISMATCH", "Snapshot content does not match its input hash.");
  const trustedContract = SkillContractSchema.parse(trustedContractInput);
  if (snapshot.inputHash !== trace.inputHash || trace.sourceMode !== snapshot.dataset.sourceMode || trace.policyVersion !== snapshot.parameters.policyVersion || canonicalHash(trace.sourceVersions) !== canonicalHash(snapshot.dataset.sourceVersions) || canonicalHash(trace.sourceSchemaVersions) !== canonicalHash(snapshot.dataset.sourceSchemaVersions)) throw new TraceCompilationError("SNAPSHOT_TRACE_MISMATCH", "Snapshot hashes and source boundaries must match the recorded trace.");
  if (trace.sourceMode !== "fixture") throw new TraceCompilationError("REPLAY_BOUNDARY_UNVERIFIED", "Only independently supported fixture inputs can be replayed.");
  let expectedHash: string | undefined, expectedReason: string | undefined;
  try { expectedHash = canonicalHash(reconcileStock(snapshot.parameters, snapshot.dataset).lines); }
  catch (error) { if (!(error instanceof UnsupportedInputError)) throw error; expectedReason = error.code; }
  if (expectedReason !== trace.label.reason || (expectedHash && expectedHash !== trace.outputArtifactHash)) throw new TraceCompilationError("TRACE_LABEL_MISMATCH", "The independent reference disagrees with the imported label or result hash.");
  if (trace.failureStage === "applicability") {
    const verdict = assessApplicability(trustedContract, snapshot.parameters, snapshot.dataset);
    if (trace.calls.length !== 0 || verdict.supported || verdict.reason !== expectedReason) throw new TraceCompilationError("TRACE_REPLAY_MISMATCH", "The trusted applicability check did not reproduce the pre-operation failure.");
    return {
      schemaVersion: "pocketforge.trace-replay/1" as const, traceId: trace.traceId, traceHash: canonicalHash(trace), inputHash: snapshot.inputHash,
      status: "verified" as const, replayedAt: new Date().toISOString(), operationCount: 0,
      evaluatorVersion: "stock-reference/2", basis: "applicability_replay" as const,
      limitation: "Reproduces a contract rejection before any operation; it is not evidence of a live model trajectory."
    };
  }
  if (trustedContract.policyVersion !== trace.policyVersion || canonicalHash(trustedContract.sourceSchemaVersions) !== canonicalHash(trace.sourceSchemaVersions)) throw new TraceCompilationError("REPLAY_BOUNDARY_UNVERIFIED", "Operation replay must stay within the trusted fixture policy and schemas.");
  const operations: SkillOperation[] = trace.calls.map((call) => call.operation);
  let outputStep = operations.at(-1)!.id;
  if (operations.at(-1)!.kind !== "emit") {
    let emitId = "replay_emit";
    while (operations.some((operation) => operation.id === emitId)) emitId += "_";
    operations.push({ id: emitId, kind: "emit", input: outputStep }); outputStep = emitId;
  }
  const contract = { ...trustedContract, skillId: "trace-replay", skillVersion: "0.1.0" };
  const skill = SkillDefinitionSchema.parse({ id: contract.skillId, version: contract.skillVersion, taskFamily: trace.taskFamily, ir: { schemaVersion: "pocketforge.ir/1", runtimeLimits: { maxRows: contract.maxRows, maxRuntimeMs: contract.maxRuntimeMs }, operations, outputStep } });
  const observed: OperationObservation[] = [];
  let actualReason: string | undefined;
  try { executeSkill(skill, contract, snapshot.parameters, snapshot.dataset, (event) => observed.push(event)); }
  catch (error) { if (!(error instanceof SkillExecutionError)) throw error; actualReason = error.code; }
  if (actualReason !== expectedReason || canonicalHash(observed) !== canonicalHash(trace.calls)) throw new TraceCompilationError("TRACE_REPLAY_MISMATCH", "The bounded replay did not reproduce the recorded operation hashes and outcome.");
  return {
    schemaVersion: "pocketforge.trace-replay/1" as const, traceId: trace.traceId, traceHash: canonicalHash(trace), inputHash: snapshot.inputHash,
    status: "verified" as const, replayedAt: new Date().toISOString(), operationCount: observed.length,
    evaluatorVersion: "stock-reference/2", basis: "bounded_operation_replay" as const,
    limitation: "Reproduces normalized tool observations against a local snapshot. It does not prove that a live model originally produced the trajectory."
  };
}
