import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StockParametersSchema, StockDatasetSchema, SkillContractSchema, SkillDefinitionSchema } from "../packages/contracts/src/index.js";
import { canonicalHash } from "../packages/compiler/src/trace-compiler.js";
import { runOriginalAgent } from "../packages/compiler/src/agent-loop.js";
import { createNemotronAgentAdapter } from "../packages/compiler/src/nemotron-adapter.js";
import { assertFrozenComparison, measurePairedComparison, type ArmRunner, type FrozenComparison } from "../packages/compiler/src/comparison.js";
import { composeSynthesisProvider } from "../apps/api/src/provider-composition.js";
import { exportFilesMatchManifest } from "../apps/api/src/export-integrity.js";
import { handwrittenReconciliation, ScriptRefusal } from "./handwritten-reconciliation.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [protocolPath, packagePath, buildPath, outputPath] = process.argv.slice(2);
if (!protocolPath || !packagePath || !buildPath || !outputPath) throw new Error("Usage: pnpm comparison:run <protocol.private.json> <checked-package> <build-summary.json> <new-output-directory>. Performs model calls/evaluations; only run after explicit authorization.");
try { process.loadEnvFile(path.join(projectRoot, ".env")); } catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error; }
const protocol = JSON.parse(await readFile(path.resolve(protocolPath), "utf8")) as FrozenComparison;
assertFrozenComparison(protocol);
const packageDirectory = path.resolve(packagePath), output = path.resolve(outputPath);
if (output === packageDirectory || output.startsWith(packageDirectory + path.sep)) throw new Error("Do not write measurements into the immutable package.");
const provenance = JSON.parse(await readFile(path.join(packageDirectory, "provenance.json"), "utf8"));
if (provenance.packageCheck?.status !== "passed" || !await exportFilesMatchManifest(packageDirectory, provenance.files)) throw new Error("The exact export must have an existing matching package-check receipt.");
const skill = SkillDefinitionSchema.parse(JSON.parse(await readFile(path.join(packageDirectory, "skill.json"), "utf8"))), contract = SkillContractSchema.parse(JSON.parse(await readFile(path.join(packageDirectory, "contract.json"), "utf8")));
const candidateHash = canonicalHash({ skill, contract }), packageHash = canonicalHash({ files: provenance.files, provenance });
if (candidateHash !== provenance.candidateHash || contract.policyVersion !== protocol.policyVersion) throw new Error("Candidate hash or task policy boundary mismatch.");
const build = JSON.parse(await readFile(path.resolve(buildPath), "utf8")) as { candidateHash: string; candidateCreatedAt: string; elapsedMs: number; accountedCostUsd: number | null; inputTokens: number | null; outputTokens: number | null };
if (build.candidateHash !== candidateHash || !Number.isFinite(Date.parse(build.candidateCreatedAt)) || !Number.isFinite(build.elapsedMs) || build.elapsedMs < 0 || [build.accountedCostUsd, build.inputTokens, build.outputTokens].some((value) => value !== null && (!Number.isFinite(value) || value < 0))) throw new Error("Supply measured build evidence; unknown token/cost values must be null.");
const composition = await composeSynthesisProvider(projectRoot, { approvedSpendingLimitUsd: 0 });
try {
  const { agentAdapter, policy, ledger } = composition.dependencies;
  if (!agentAdapter || !policy || !ledger || agentAdapter.mode !== "nemotron") throw new Error("Provider remains disabled under the $0 ceiling. Configure genuinely reviewed zero-cost authorization and finite quotas before an authorized evaluation.");
  const instructionText = ["---", "name: " + skill.id + "-instructions", "description: Reconcile local warehouse stock using the same trusted tools.", "---", "", "Follow this saved procedure on each new input. The executable runner is unavailable in this comparison arm. Resolve all parameter references from the caller. Never substitute recorded answers.", ...skill.ir.operations.map((operation, index) => (index + 1) + ". Perform the trusted operation described by " + JSON.stringify(operation)), "Refuse inputs outside the declared policy/schema boundary. Zero reserve; whole-number units only."].join("\n");
  const instructionAdapter = createNemotronAgentAdapter({ baseUrl: process.env.NVIDIA_BASE_URL!, model: process.env.NVIDIA_MODEL!, accountReference: process.env.NVIDIA_ACCOUNT_REFERENCE!, apiKey: process.env.NVIDIA_API_KEY!, maxOutputTokens: policy.maxOutputTokens, reasoningEffort: "none" }, undefined, { instructionText });
  await mkdir(output);
  await writeFile(path.join(output, "instruction-only.SKILL.md"), instructionText + "\n", { flag: "wx" });
  const schemaRefusal = (input: { parameters: unknown; dataset: unknown }) => !StockParametersSchema.safeParse(input.parameters).success ? "INPUT_PARAMETERS_INVALID" : !StockDatasetSchema.safeParse(input.dataset).success ? "INPUT_DATASET_INVALID" : undefined;
  const zero = { inputTokens: 0, outputTokens: 0, modelCalls: 0, accountedCostUsd: 0, hostInvocationMs: null };
  const agentRunner = (adapter: typeof agentAdapter): ArmRunner => async (input, signal) => {
    const refusal = schemaRefusal(input); if (refusal) return { ...zero, outcome: "unsupported", reason: refusal };
    const result = await runOriginalAgent({ ...input, policyVersion: protocol.policyVersion, evidenceClass: protocol.cases.find((item) => item.inputHash === canonicalHash(input))!.provenance, adapter, policy, ledger, signal });
    await writeFile(path.join(output, result.runId + ".agent.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
    const uncertain = result.calls.some((call) => call.usageUncertain);
    return { outcome: result.status === "ready" ? "supported" : result.status === "refused" ? "unsupported" : "failed", ...(result.result ? { records: result.result } : {}), ...(result.reason ? { reason: result.reason } : {}), inputTokens: uncertain ? null : result.calls.reduce((sum, call) => sum + (call.usage?.inputTokens ?? 0), 0), outputTokens: uncertain ? null : result.calls.reduce((sum, call) => sum + (call.usage?.outputTokens ?? 0), 0), modelCalls: result.calls.length, accountedCostUsd: uncertain ? null : result.calls.reduce((sum, call) => sum + call.accountedUsd, 0), hostInvocationMs: null, evidenceHash: canonicalHash(result) };
  };
  let serial = 0;
  const executable: ArmRunner = async (input, signal) => {
    const inputPath = path.join(output, "paired input " + ++serial + ".json");
    await writeFile(inputPath, JSON.stringify(input), { flag: "wx" });
    try {
      const child = await promisify(execFile)(process.execPath, [path.join(packageDirectory, "runtime", "emberforge-runtime.mjs"), "--input", inputPath], { cwd: output, signal, timeout: 120000, maxBuffer: 1000000 });
      const parsed = JSON.parse(child.stdout); return { ...zero, outcome: "supported", records: parsed.records };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 2 && "stderr" in error && typeof error.stderr === "string") { const rejection = JSON.parse(error.stderr); return { ...zero, outcome: "unsupported", reason: rejection.reason }; }
      throw error;
    }
  };
  const handwritten: ArmRunner = async (input, signal) => {
    signal.throwIfAborted();
    try { return { ...zero, outcome: "supported", records: handwrittenReconciliation(input.parameters, input.dataset, protocol.policyVersion) }; }
    catch (error) { if (error instanceof ScriptRefusal) return { ...zero, outcome: "unsupported", reason: error.code }; throw error; }
  };
  const metadata = { candidateHash, packageHash, candidateCreatedAt: build.candidateCreatedAt, originalConfigHash: agentAdapter.configHash, instructionConfigHash: instructionAdapter.configHash, sameModelAndToolsHash: canonicalHash({ scope: agentAdapter.providerScope, tools: "emberforge.trusted-operation-session/1", policy }), build: { elapsedMs: build.elapsedMs, accountedCostUsd: build.accountedCostUsd, inputTokens: build.inputTokens, outputTokens: build.outputTokens } };
  await writeFile(path.join(output, "run-manifest.json"), JSON.stringify({ ...metadata, protocolHash: protocol.protocolHash, startedAt: new Date().toISOString(), maximumAgentRequests: protocol.cases.length * protocol.repetitions * 2 * policy.maxProviderCalls, hostInvocations: "not included; separate transfer rehearsal" }, null, 2) + "\n", { flag: "wx" });
  const report = await measurePairedComparison(protocol, { original_agent: agentRunner(agentAdapter), instruction_skill: agentRunner(instructionAdapter), executable_skill: executable, handwritten_script: handwritten }, { ...metadata, record: async (measurement) => { await appendFile(path.join(output, "measurements.ndjson"), JSON.stringify(measurement) + "\n"); } });
  await writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ status: "collected", output, measurements: report.measurements.length, savingsClaim: "not automatically calculated" }));
} finally { composition.close(); }
