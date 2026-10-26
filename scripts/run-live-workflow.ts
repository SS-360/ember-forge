import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [argument, retryFlag] = process.argv.slice(2);
if (!argument) throw new Error("Usage: pnpm workflow:run <prepared-workflow-directory>. Performs explicitly authorized model runs, synthesis, checks and export.");
const directory = path.resolve(root, argument);
if (!directory.startsWith(path.join(root, "artifacts", "live-workflows") + path.sep)) throw new Error("Use a prepared local workflow directory.");
interface Workflow { candidateId: string; stage: string; samples: string[]; agentJobs: string[]; traceIds: string[]; priorAgentJobs?: Array<{ sampleIndex: number; jobId: string; reason: string }>; priorSynthesisJobs?: Array<{ jobId: string; candidateId: string; result: unknown }>; synthesisJobId?: string; result?: unknown }
const manifestPath = path.join(directory, "workflow.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Workflow;
const inputs = JSON.parse(await readFile(path.join(directory, "compilation-inputs.private.json"), "utf8")) as Array<{ caseId: string; parameters: unknown; dataset: unknown; evidenceClass: string }>;
const save = async () => { await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n"); };
async function api<T>(route: string, body?: unknown): Promise<T> {
  const response = await fetch("http://127.0.0.1:3001" + route, { ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  const result = await response.json() as T & { message?: string; error?: string };
  if (!response.ok) throw new Error(result.error ?? result.message ?? "API_HTTP_" + response.status);
  return result;
}
const readiness = await api<{ available: boolean }>("/api/agent/readiness");
if (!readiness.available) throw new Error("ORIGINAL_AGENT_NOT_READY");
for (const [index, input] of inputs.entries()) {
  if (!manifest.samples[index]) { manifest.samples[index] = (await api<{ sampleId: string }>("/api/work-samples", { format: "json", provenance: { evidenceClass: input.evidenceClass, sourceLabel: "Original Nemotron synthetic " + input.caseId, sanitizedConfirmed: true }, parameters: input.parameters, dataset: input.dataset })).sampleId; await save(); }
  if (manifest.agentJobs[index] && retryFlag === "--retry-failed") {
    const previous = await api<{ state: string; run?: { reason?: string; traces?: unknown[] } }>("/api/agent/runs/" + manifest.agentJobs[index]);
    if (["failed", "interrupted", "cancelled"].includes(previous.state) || (previous.state === "refused" && !previous.run?.traces?.length)) {
      (manifest.priorAgentJobs ??= []).push({ sampleIndex: index, jobId: manifest.agentJobs[index]!, reason: previous.run?.reason ?? previous.state });
      manifest.agentJobs[index] = ""; await save();
    }
  }
  if (!manifest.agentJobs[index]) { manifest.agentJobs[index] = (await api<{ jobId: string }>("/api/agent/runs", { sampleId: manifest.samples[index] })).jobId; await save(); }
  const jobId = manifest.agentJobs[index]!;
  let previous = "";
  for (;;) {
    const job = await api<{ state: string; stage: string; run?: { status: string; reason?: string; calls: unknown[]; traces: Array<{ traceId: string }> } }>("/api/agent/runs/" + jobId);
    const progress = input.caseId + ": " + job.stage + " / " + job.state + " / " + (job.run?.calls.length ?? 0) + " provider calls";
    if (progress !== previous) { console.log(progress); previous = progress; }
    if (job.state !== "running") {
      try { await writeFile(path.join(directory, "agent-" + index + "-" + jobId + ".json"), JSON.stringify(job, null, 2) + "\n", { flag: "wx" }); }
      catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error; }
      manifest.traceIds = [...new Set([...manifest.traceIds, ...(job.run?.traces.map((trace) => trace.traceId) ?? [])])];
      manifest.stage = "original_runs"; await save();
      if (!["ready", "refused"].includes(job.state)) throw new Error("ORIGINAL_RUN_" + job.state.toUpperCase() + ":" + (job.run?.reason ?? "unknown"));
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}
if (manifest.synthesisJobId && retryFlag === "--retry-failed") {
  const previous = await api<{ state: string }>("/api/compiler/jobs/" + manifest.synthesisJobId);
  if (["failed", "cancelled", "budget_exhausted", "rejected", "interrupted"].includes(previous.state)) {
    (manifest.priorSynthesisJobs ??= []).push({ jobId: manifest.synthesisJobId, candidateId: manifest.candidateId, result: previous });
    manifest.candidateId = manifest.candidateId.replace(/-retry-\d+$/, "") + "-retry-" + manifest.priorSynthesisJobs.length;
    delete manifest.synthesisJobId; delete manifest.result; await save();
  }
}
if (!manifest.synthesisJobId) {
  manifest.synthesisJobId = (await api<{ jobId: string }>("/api/compiler/jobs", { skillId: manifest.candidateId, traceIds: manifest.traceIds })).jobId;
  manifest.stage = "synthesis"; await save();
}
let previous = "";
for (;;) {
  const job = await api<{ state: string; stage: string; packageError?: string; result?: unknown }>("/api/compiler/jobs/" + manifest.synthesisJobId);
  const progress = "Synthesis: " + job.stage + " / " + job.state;
  if (progress !== previous) { console.log(progress); previous = progress; }
  if (job.state !== "running") {
    manifest.stage = job.state; manifest.result = job; await save();
    if (job.state !== "validated" || job.packageError) throw new Error(job.packageError ?? "SYNTHESIS_" + job.state.toUpperCase());
    console.log(JSON.stringify({ status: "validated_and_exported", candidateId: manifest.candidateId, directory: path.relative(root, directory) })); break;
  }
  await new Promise((resolve) => setTimeout(resolve, 750));
}
