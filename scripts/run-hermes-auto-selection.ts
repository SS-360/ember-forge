import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composeSynthesisProvider } from "../apps/api/src/provider-composition.js";
import { reconcileStock } from "../packages/evaluator/src/stock-reconciliation.js";
import { canonicalHash } from "../packages/compiler/src/trace-compiler.js";
import { exportFilesMatchManifest } from "../apps/api/src/export-integrity.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedPackage = process.argv[2];
if (!requestedPackage) throw new Error("Usage: pnpm host:hermes-auto <checked-export-directory>");
const packageDirectory = path.resolve(root, requestedPackage);
if (!packageDirectory.startsWith(path.join(root, "artifacts", "exports") + path.sep)) throw new Error("Use a checked export under artifacts/exports.");
process.loadEnvFile(path.join(root, ".env"));
const composition = await composeSynthesisProvider(root, { approvedSpendingLimitUsd: 0 });
const { authorization, ledger, policy } = composition.dependencies;
if (composition.authorizationMode !== "verified_zero_cost" || !authorization || authorization.mode !== "verified_zero_cost" || !ledger || !policy || !process.env.NVIDIA_API_KEY) {
  composition.close();
  throw new Error("FREE_PROVIDER_NOT_READY");
}
const activeAuthorization = authorization as Extract<NonNullable<typeof authorization>, { mode: "verified_zero_cost" }>;
const providerScope = activeAuthorization.scope;

const skillFile = path.join(packageDirectory, "SKILL.md");
const skillText = await readFile(skillFile, "utf8");
const skillName = /^name:\s*([a-z0-9-]+)\s*$/m.exec(skillText)?.[1];
if (!skillName) { composition.close(); throw new Error("SKILL_FRONTMATTER_INVALID"); }
const provenance = JSON.parse(await readFile(path.join(packageDirectory, "provenance.json"), "utf8")) as { files: Record<string, string> };
if (!await exportFilesMatchManifest(packageDirectory, provenance.files)) { composition.close(); throw new Error("SKILL_PACKAGE_HASH_MISMATCH"); }
const runId = randomUUID();
const profile = path.join(root, ".local", "hermes-auto-" + runId);
const profileSkill = path.join(profile, "skills", skillName);
if (existsSync(profile) || existsSync(path.join(packageDirectory, ".env"))) { composition.close(); throw new Error("ISOLATED_HERMES_PROFILE_INVALID"); }
await mkdir(path.join(profile, "skills"), { recursive: true });
await cp(packageDirectory, profileSkill, { recursive: true, force: false, errorOnExist: true });
const example = JSON.parse(await readFile(path.join(packageDirectory, "input.example.json"), "utf8")) as { parameters: any; dataset: any; provenance?: string };
const fresh = structuredClone(example);
fresh.provenance = "synthetic automatic-selection rehearsal; independent from the compilation traces";
fresh.dataset.orders[0].orderId = "AUTO-SELECT-001";
fresh.dataset.orders[0].quantity += 1;
const expected = reconcileStock(fresh.parameters, fresh.dataset).lines;
const inputHash = canonicalHash({ parameters: fresh.parameters, dataset: fresh.dataset });
const profileWork = path.join(profile, "workspace-" + runId.slice(0, 8));
await mkdir(profileWork, { recursive: false });
await writeFile(path.join(profileWork, "input.json"), JSON.stringify(fresh, null, 2) + "\n", { flag: "wx" });
const prompt = `Reconcile the open stock orders for ${fresh.parameters.warehouseId} from ${fresh.parameters.fromDate} through ${fresh.parameters.throughDate} using input.json in the current folder. This supported task matches one of the installed skills. Select and run the matching skill's bundled procedure automatically, then report whether it completed. The input already matches the skill contract; invoke its bundled runtime directly without opening reference files.`;
const promptHash = createHash("sha256").update(prompt).digest("hex");
const nonce = randomUUID();
const providerCalls: Array<Record<string, unknown>> = [];
const proxyErrors: Array<{ code: string; inputBound?: number; outputCap?: number }> = [];
let busy = false;
let providerCallCount = 0;
let usedTokens = 0;
const maxCalls = Math.min(8, activeAuthorization.allowance.maxRequests);
const maxOutputTokens = 1024;
const maxRequestBytes = 1_000_000;
let currentRequestBounds: { inputBound?: number; outputCap?: number } = {};
const upstreamBase = new URL(providerScope.baseUrl);
if (upstreamBase.protocol !== "https:" || providerScope.model !== process.env.NVIDIA_MODEL) { composition.close(); throw new Error("PROVIDER_SCOPE_MISMATCH"); }

function textContent(value: any): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((block) => block?.type === "text").map((block) => String(block.text ?? "")).join("\n");
  return "";
}
function toolResultRecords(messages: any[]): unknown[] | undefined {
  for (const message of messages) {
    if (message?.role !== "tool") continue;
    const content = textContent(message.content);
    const start = content.indexOf("\"executionMode\"");
    if (start < 0 || !content.includes("bounded-local-interpreter")) continue;
    const objectStart = content.lastIndexOf("{", start);
    for (let index = objectStart; index >= 0; index--) {
      if (content[index] !== "{") continue;
      let depth = 0, quoted = false, escaped = false;
      for (let end = index; end < content.length; end++) {
        const char = content[end]!;
        if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === "\"") quoted = false; continue; }
        if (char === "\"") quoted = true;
        else if (char === "{") depth++;
        else if (char === "}" && --depth === 0) {
          try {
            const parsed = JSON.parse(content.slice(index, end + 1));
            if (parsed?.executionMode === "bounded-local-interpreter" && Array.isArray(parsed.records)) return parsed.records;
          } catch { /* Keep scanning for the CLI's JSON payload. */ }
          break;
        }
      }
    }
  }
  return undefined;
}
function functionCalls(message: any): Array<{ name: string; argumentsText: string; parsedArguments?: any }> {
  return (message?.tool_calls ?? []).filter((call: any) => call?.type === "function" && typeof call.function?.name === "string").map((call: any) => {
    const argumentsText = typeof call.function.arguments === "string" ? call.function.arguments : "{}";
    try { return { name: call.function.name, argumentsText, parsedArguments: JSON.parse(argumentsText) }; }
    catch { return { name: call.function.name, argumentsText }; }
  });
}
function safeCallSummary(messages: any[], calls: ReturnType<typeof functionCalls>) {
  const selected = calls.map((call) => call.name === "skill_view" ? call.parsedArguments?.name ?? call.parsedArguments?.skill : undefined).find((name) => name === skillName);
  const terminalArgs = calls.filter((call) => call.name === "terminal").map((call) => JSON.stringify(call.parsedArguments ?? call.argumentsText));
  const runnerCommand = terminalArgs.find((args) => args.includes("emberforge-runtime.mjs") && args.includes("--input"));
  const runnerInvoked = Boolean(runnerCommand);
  const runnerTargetsExpectedFiles = Boolean(runnerCommand && runnerCommand.includes("input.json") && runnerCommand.includes("--output") && runnerCommand.includes("result.json"));
  const records = toolResultRecords(messages);
  return { selectedSkillName: selected, runnerInvoked, runnerTargetsExpectedFiles, ...(records ? { runtimeOutputHash: canonicalHash(records) } : {}) };
}
function streamResponse(res: http.ServerResponse, response: any, calls: ReturnType<typeof functionCalls>): void {
  const created = Math.floor(Date.now() / 1000);
  const event = (chunk: unknown) => res.write("data: " + JSON.stringify(chunk) + "\n\n");
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  event({ id: response.id, object: "chat.completion.chunk", created, model: providerScope.model, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] });
  const message = response.choices[0].message;
  if (typeof message.content === "string" && message.content) event({ id: response.id, object: "chat.completion.chunk", created, model: providerScope.model, choices: [{ index: 0, delta: { content: message.content }, finish_reason: null }] });
  for (const [index, call] of calls.entries()) event({ id: response.id, object: "chat.completion.chunk", created, model: providerScope.model, choices: [{ index: 0, delta: { tool_calls: [{ index, id: message.tool_calls[index].id, type: "function", function: { name: call.name, arguments: call.argumentsText } }] }, finish_reason: null }] });
  event({ id: response.id, object: "chat.completion.chunk", created, model: providerScope.model, choices: [{ index: 0, delta: {}, finish_reason: calls.length ? "tool_calls" : "stop" }] });
  res.write("data: [DONE]\n\n"); res.end();
}

const server = http.createServer(async (req, res) => {
  let acquired = false;
  currentRequestBounds = {};
  try {
    if (req.method === "GET" && req.url === "/v1/models") {
      if (req.headers.authorization !== "Bearer " + nonce) { res.writeHead(401).end(); return; }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ object: "list", data: [{ id: providerScope.model, object: "model", owned_by: "nvidia" }] }));
      return;
    }
    if (req.headers.authorization !== "Bearer " + nonce) { res.writeHead(401).end(); return; }
    if (req.method !== "POST" || req.url?.split("?")[0] !== "/v1/chat/completions") { res.writeHead(404).end(); return; }
    let bodyText = "";
    for await (const part of req) { bodyText += part; if (Buffer.byteLength(bodyText) > maxRequestBytes) throw new Error("REQUEST_TOO_LARGE"); }
    const body = JSON.parse(bodyText || "{}");
    if (busy || providerCallCount >= maxCalls) throw new Error("PROVIDER_CALL_LIMIT");
    if (!Array.isArray(body.messages) || !body.messages.length) throw new Error("REQUEST_INVALID");
    busy = true; acquired = true; providerCallCount++;
    const requestedOutput = Number.isSafeInteger(body.max_tokens) && body.max_tokens > 0 ? body.max_tokens : maxOutputTokens;
    const outputCap = Math.min(maxOutputTokens, requestedOutput, policy.maxOutputTokens);
    const upstream: Record<string, unknown> = {
      model: providerScope.model,
      messages: body.messages,
      ...(Array.isArray(body.tools) ? { tools: body.tools } : {}),
      ...(body.tool_choice !== undefined ? { tool_choice: body.tool_choice } : {}),
      ...(body.stop !== undefined ? { stop: body.stop } : {}),
      parallel_tool_calls: false,
      max_tokens: outputCap,
      reasoning_effort: "none",
      temperature: 0,
      stream: false
    };
    const inputBound = Math.ceil(Buffer.byteLength(JSON.stringify(upstream), "utf8") / 2) + 1024;
    currentRequestBounds = { inputBound, outputCap };
    if (inputBound > policy.maxInputTokens || inputBound + outputCap > policy.maxTotalTokens - usedTokens) throw new Error("TOKEN_ALLOWANCE_EXCEEDED");
    const reservation = ledger.reserve(0, { tokens: inputBound + outputCap, runId, call: providerCallCount });
    const call: Record<string, unknown> = { call: providerCallCount, inputUpperBound: inputBound, outputCap, requestHash: createHash("sha256").update(bodyText).digest("hex"), usageUnknown: true };
    providerCalls.push(call);
    const upstreamUrl = new URL(upstreamBase.toString().replace(/\/$/, "") + "/chat/completions");
    const response = await fetch(upstreamUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.NVIDIA_API_KEY }, body: JSON.stringify(upstream), signal: AbortSignal.timeout(90_000), redirect: "error" });
    if (!response.ok) throw new Error("PROVIDER_HTTP_" + response.status);
    const result = await response.json() as any;
    const usage = result?.usage;
    if (!Number.isSafeInteger(usage?.prompt_tokens) || !Number.isSafeInteger(usage?.completion_tokens) || usage.prompt_tokens < 0 || usage.completion_tokens < 0 || usage.prompt_tokens > inputBound || usage.completion_tokens > outputCap) {
      ledger.suspend?.("PROVIDER_USAGE_EXCEEDED_RESERVATION");
      throw new Error("PROVIDER_USAGE_INVALID");
    }
    ledger.settle(reservation, 0, { tokens: usage.prompt_tokens + usage.completion_tokens });
    usedTokens += usage.prompt_tokens + usage.completion_tokens;
    const message = result?.choices?.[0]?.message;
    if (!message) throw new Error("PROVIDER_RESPONSE_INVALID");
    const calls = functionCalls(message);
    const summary = safeCallSummary(body.messages, calls);
    Object.assign(call, { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, usageUnknown: false, requestId: String(result.id ?? "").slice(0, 200), toolNames: calls.map((item) => item.name), ...(summary.selectedSkillName ? { selectedSkillName: summary.selectedSkillName } : {}), runnerInvoked: summary.runnerInvoked, runnerTargetsExpectedFiles: summary.runnerTargetsExpectedFiles, ...(summary.runtimeOutputHash ? { runtimeOutputHash: summary.runtimeOutputHash } : {}) });
    const outgoing = { id: result.id ?? "chatcmpl-" + runId, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: providerScope.model, choices: [{ index: 0, message: { role: "assistant", ...(typeof message.content === "string" ? { content: message.content } : { content: null }), ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}) }, finish_reason: calls.length ? "tool_calls" : "stop" }], usage: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, total_tokens: usage.prompt_tokens + usage.completion_tokens } };
    if (body.stream === true) streamResponse(res, outgoing, calls);
    else res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(outgoing));
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "PROVIDER_PROXY_FAILED";
    proxyErrors.push({ code, ...currentRequestBounds });
    if (!res.headersSent) res.writeHead(code.startsWith("PROVIDER_HTTP_") ? 502 : 429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: code, type: "api_error" } }));
    if (providerCalls.at(-1)?.usageUnknown === true) Object.assign(providerCalls.at(-1)!, { error: code });
  } finally { if (acquired) busy = false; }
});

const evidenceDirectory = path.join(root, "artifacts", "host-verification");
await mkdir(evidenceDirectory, { recursive: true });
const evidencePath = path.join(evidenceDirectory, "hermes-auto-" + runId + ".json");
const startEvidence = async (fields: Record<string, unknown>) => writeFile(evidencePath, JSON.stringify(fields, null, 2) + "\n");
let serverAddress: string;
try {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("LOCAL_PROXY_BIND_FAILED");
  serverAddress = `http://127.0.0.1:${address.port}/v1`;
  const env: NodeJS.ProcessEnv = { ...process.env, HERMES_HOME: profile };
  for (const key of Object.keys(env)) if (/(API_KEY|TOKEN|SECRET|PASSWORD|ACCESS_KEY|CREDENTIAL)/i.test(key)) delete env[key];
  for (const key of Object.keys(env)) if (/^(HTTP|HTTPS|ALL)_PROXY$/i.test(key)) delete env[key];
  env.NO_PROXY = "127.0.0.1,localhost,::1";
  env.no_proxy = env.NO_PROXY;
  env.HERMES_HOME = profile;
  const config = [
    "model:", `  default: ${JSON.stringify(providerScope.model)}`, "  provider: custom", `  base_url: ${JSON.stringify(serverAddress)}`, `  api_key: ${JSON.stringify(nonce)}`, "  api_mode: chat_completions",
    "toolsets:", "  - skills", "  - terminal", "agent:", "  max_turns: 5", "  api_max_retries: 0", "  intent_ack_continuation: false",
    "memory:", "  memory_enabled: false", "  user_profile_enabled: false",
    "terminal:", "  backend: local", `  cwd: ${JSON.stringify(profileWork)}`, "  timeout: 45", "  home_mode: profile", "  auto_source_bashrc: false", "  docker_network: false", ""
  ].join("\n");
  await writeFile(path.join(profile, "config.yaml"), config);
  await startEvidence({ schemaVersion: "emberforge.hermes-auto-selection/1", state: "running", runId, host: "Hermes Agent CLI", candidateId: JSON.parse(await readFile(path.join(packageDirectory, "skill.json"), "utf8")).id, candidateHash: JSON.parse(await readFile(path.join(packageDirectory, "verification.json"), "utf8")).candidateHash, packagePath: path.relative(root, packageDirectory), packageManifestVerified: true, inputHash, expectedOutputHash: canonicalHash(expected), promptHash, explicitSkillNameInPrompt: false, serverPorts: [3001, 5174], provider: "NVIDIA Nemotron free endpoint through local metered-limit bridge", model: providerScope.model, costCeilingUsd: 0, tokenCeiling: policy.maxTotalTokens, providerCalls, rawPromptRetained: false, rawResponseRetained: false, rawReasoningRetained: false });
  const apiPort = await isListening(3001), webPort = await isListening(5174);
  const hermesBinary = "C:/Users/Sam/AppData/Local/hermes/hermes-agent/venv/Scripts/hermes.exe";
  const startedAt = new Date().toISOString();
  let stdout = "", stderr = "";
  const pythonBinary = "C:/Users/Sam/AppData/Local/hermes/hermes-agent/venv/Scripts/python.exe";
  const pythonProbe = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(pythonBinary, ["-c", "import sys,urllib.request; request=urllib.request.Request(sys.argv[1]+'/models',headers={'Authorization':'Bearer '+sys.argv[2]}); opener=urllib.request.build_opener(urllib.request.ProxyHandler({})); response=opener.open(request,timeout=4); print(response.status)", serverAddress, nonce], { cwd: profileWork, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let probeStdout = "", probeStderr = "";
    child.stdout.on("data", (chunk: Buffer) => { probeStdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { probeStderr += chunk.toString("utf8"); });
    const timeout = setTimeout(() => child.kill(), 5000);
    child.once("error", (error) => { clearTimeout(timeout); resolve({ code: null, stdout: probeStdout, stderr: error.message }); });
    child.once("close", (code) => { clearTimeout(timeout); resolve({ code, stdout: probeStdout, stderr: probeStderr }); });
  });
  const loopbackBridgeReachable = pythonProbe.code === 0 && pythonProbe.stdout.trim() === "200";
  const nodeLoopbackBridgeReachable = await fetch(serverAddress + "/models", { headers: { Authorization: "Bearer " + nonce }, signal: AbortSignal.timeout(3000) }).then((response) => response.status === 200).catch(() => false);
  let exitCode: number | null = pythonProbe.code;
  if (loopbackBridgeReachable) {
    const child = spawn(hermesBinary, ["chat", "--query", prompt, "--quiet", "--source", "tool", "--max-turns", "5"], { cwd: profileWork, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); if (stdout.length > 1_000_000) child.kill(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); if (stderr.length > 100_000) stderr = stderr.slice(-100_000); });
    const timeout = setTimeout(() => child.kill(), 240_000);
    exitCode = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    clearTimeout(timeout);
  } else {
    stdout = "Hermes subprocess loopback preflight failed.";
    stderr = pythonProbe.stderr.trim().split(/\r?\n/).at(-1) ?? "LOOPBACK_PREFLIGHT_FAILED";
  }
  const selectedSkill = providerCalls.some((call) => call.selectedSkillName === skillName);
  const runnerInvoked = providerCalls.some((call) => call.runnerInvoked === true);
  const runnerTargetsExpectedFiles = providerCalls.some((call) => call.runnerTargetsExpectedFiles === true);
  const toolOutputHash = providerCalls.map((call) => call.runtimeOutputHash).find((hash) => typeof hash === "string");
  let resultFileStatus: string | null = null;
  let resultFileIdentityMatches = false;
  let resultFileOutputHash: string | undefined;
  try {
    const resultFile = JSON.parse(await readFile(path.join(profileWork, "result.json"), "utf8")) as { status?: string; skillId?: string; skillVersion?: string; executionMode?: string; records?: unknown };
    resultFileStatus = typeof resultFile.status === "string" ? resultFile.status : null;
    const packagedSkill = JSON.parse(await readFile(path.join(packageDirectory, "skill.json"), "utf8")) as { id?: string; version?: string };
    resultFileIdentityMatches = resultFile.skillId === packagedSkill.id && resultFile.skillVersion === packagedSkill.version && resultFile.executionMode === "bounded-local-interpreter" && Array.isArray(resultFile.records);
    if (resultFileIdentityMatches) resultFileOutputHash = canonicalHash(resultFile.records);
  } catch { /* Missing or invalid output remains unverified. */ }
  const observedOutputHash = resultFileOutputHash ?? toolOutputHash;
  const passed = loopbackBridgeReachable && nodeLoopbackBridgeReachable && !apiPort && !webPort && exitCode === 0 && selectedSkill && runnerInvoked && runnerTargetsExpectedFiles && resultFileStatus === "succeeded" && resultFileIdentityMatches && resultFileOutputHash === canonicalHash(expected);
  const startupDiagnostic = providerCalls.length === 0
    ? [stderr.trim(), stdout.trim()].filter(Boolean).join(" | ").replaceAll(profile, "<isolated-profile>").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/https?:\/\/\S+/gi, "[endpoint]").replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]").slice(0, 400)
    : undefined;
  await startEvidence({ schemaVersion: "emberforge.hermes-auto-selection/1", status: passed ? "passed" : "needs-review", runId, host: "Hermes Agent CLI", hostVersion: "locally installed; hermes --version not retained in this run", candidateId: JSON.parse(await readFile(path.join(packageDirectory, "skill.json"), "utf8")).id, candidateHash: JSON.parse(await readFile(path.join(packageDirectory, "verification.json"), "utf8")).candidateHash, packageManifestVerified: true, packagePath: path.relative(root, packageDirectory), inputHash, expectedOutputHash: canonicalHash(expected), observedOutputHash: observedOutputHash ?? null, resultFileStatus, resultFileIdentityMatches, resultFileOutputHash: resultFileOutputHash ?? null, toolOutputHash: toolOutputHash ?? null, promptHash, explicitSkillNameInPrompt: false, automaticSelection: selectedSkill ? "verified_skill_view" : "not_observed", selectedSkillName: selectedSkill ? skillName : null, bundledRunnerInvoked: runnerInvoked, runnerTargetsExpectedFiles, executionMatchedReference: resultFileOutputHash === canonicalHash(expected), loopbackBridgeReachable, nodeLoopbackBridgeReachable, appApiReachableAtStart: apiPort, appWebReachableAtStart: webPort, sourceMode: "snapshot", provider: "NVIDIA Nemotron free endpoint through local metered-limit bridge", model: providerScope.model, costCeilingUsd: 0, tokenCeiling: policy.maxTotalTokens, calls: providerCalls, proxyErrors, inputTokens: providerCalls.reduce((sum, call) => sum + Number(call.inputTokens ?? call.inputUpperBound ?? 0), 0), outputTokens: providerCalls.reduce((sum, call) => sum + Number(call.outputTokens ?? 0), 0), exitCode, startedAt, finishedAt: new Date().toISOString(), stdoutHash: createHash("sha256").update(stdout).digest("hex"), stdoutBytes: Buffer.byteLength(stdout), stderrHash: createHash("sha256").update(stderr).digest("hex"), stderrBytes: Buffer.byteLength(stderr), rawPromptRetained: false, rawResponseRetained: false, rawReasoningRetained: false, limitations: ["One synthetic workflow and one automatic-selection prompt; this does not measure general skill-selection accuracy.", "Hermes host inference uses Nemotron and is separate from the exported runtime, which makes no model calls.", "The temporary isolated Hermes profile was deleted after evidence capture; global Hermes configuration was not changed.", "The saved policy-bound bundle reads a local JSON snapshot and does not connect to Zetaris."] });
  console.log(JSON.stringify({ status: passed ? "passed" : "needs-review", evidence: path.relative(root, evidencePath), selectedSkill, runnerInvoked, runnerTargetsExpectedFiles, resultFileStatus, executionMatchedReference: resultFileOutputHash === canonicalHash(expected), modelCalls: providerCalls.length, inputTokens: providerCalls.reduce((sum, call) => sum + Number(call.inputTokens ?? call.inputUpperBound ?? 0), 0), outputTokens: providerCalls.reduce((sum, call) => sum + Number(call.outputTokens ?? 0), 0), loopbackBridgeReachable, nodeLoopbackBridgeReachable, appApiReachableAtStart: apiPort, appWebReachableAtStart: webPort, ...(startupDiagnostic ? { startupDiagnostic } : {}) }));
  if (!passed) process.exitCode = 1;
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  composition.close();
  const configPath = path.join(profile, "config.yaml");
  if (existsSync(configPath)) {
    const configText = await readFile(configPath, "utf8");
    await writeFile(configPath, configText.replace(/^  base_url: .*$/m, "  base_url: \"http://127.0.0.1:1/v1\"").replace(/^  api_key: .*$/m, "  api_key: \"\""));
  }
  const sessions = path.join(profile, "sessions");
  if (existsSync(sessions)) for (const entry of await readdir(sessions, { withFileTypes: true })) if (entry.isFile() && entry.name.startsWith("request_dump_")) await rm(path.join(sessions, entry.name));
  if (profile === path.join(root, ".local", "hermes-auto-" + runId)) await rm(profile, { recursive: true, force: true });
}

async function isListening(port: number): Promise<boolean> {
  try { await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(500) }); return true; }
  catch { return false; }
}
