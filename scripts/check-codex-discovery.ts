import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { SkillDefinitionSchema } from "../packages/contracts/src/index.js";
import { exportVerifiedCandidate } from "./export-skill.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--candidate" || !args[1]) throw new Error("Usage: pnpm harness:codex --candidate <verified-candidate-directory>");
const candidateDirectory = path.resolve(projectRoot, args[1]);
const skill = SkillDefinitionSchema.parse(JSON.parse(await readFile(path.join(candidateDirectory, "skill.json"), "utf8")));
const runRoot = path.join(projectRoot, "artifacts", "harness-checks", "codex", randomUUID());
const workspace = path.join(runRoot, "workspace");
const skillPath = path.join(workspace, ".agents", "skills", skill.id);
await mkdir(path.dirname(skillPath), { recursive: true });
const exported = await exportVerifiedCandidate({ candidateDirectory, outputDirectory: path.join(runRoot, "export", skill.id) });
await cp(path.resolve(projectRoot, exported.artifactDirectory), skillPath, { recursive: true, errorOnExist: true, force: false });

const command = process.env.POCKETFORGE_CODEX_BINARY;
const proc = command ? spawn(command, ["app-server", "--listen", "stdio://"], { cwd: workspace, stdio: ["pipe", "pipe", "pipe"], windowsHide: true }) : process.platform === "win32"
  ? spawn("powershell.exe", ["-NoProfile", "-Command", "codex app-server --listen stdio://"], { cwd: workspace, stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
  : spawn("codex", ["app-server", "--listen", "stdio://"], { cwd: workspace, stdio: ["pipe", "pipe", "pipe"] });
const lines = readline.createInterface({ input: proc.stdout });
let nextId = 1;
let diagnosticBytes = 0;
let accessDenied = false;
const sentMethods: string[] = [];
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
proc.stderr.on("data", (data: Buffer) => { diagnosticBytes += data.length; if (/access is denied|permission denied/i.test(data.toString())) accessDenied = true; });
const failPending = (error: Error) => {
  for (const value of pending.values()) { clearTimeout(value.timer); value.reject(error); }
  pending.clear();
};
proc.on("error", failPending);
proc.on("close", (code) => failPending(new Error("Codex app-server closed before the discovery response (exit " + code + (accessDenied ? ", filesystem access denied" : "") + "). If a Windows shell shim cannot preserve stdio, set POCKETFORGE_CODEX_BINARY to the installed codex.exe path.")));
const closed = new Promise<void>((resolve) => proc.once("close", () => resolve()));
lines.on("line", (line) => {
  let message: { id?: number; result?: unknown; error?: { message?: string } };
  try { message = JSON.parse(line); } catch { return; }
  const request = typeof message.id === "number" ? pending.get(message.id) : undefined;
  if (!request) return;
  pending.delete(message.id!); clearTimeout(request.timer);
  if (message.error) request.reject(new Error(message.error.message ?? "Codex discovery request failed."));
  else request.resolve(message.result);
});
function send(method: string, params: unknown): void {
  sentMethods.push(method);
  proc.stdin.write(JSON.stringify({ method, params }) + "\n");
}
function request(method: string, params: unknown): Promise<unknown> {
  sentMethods.push(method);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Codex discovery timed out after 20 seconds.")); }, 20000);
    pending.set(id, { resolve, reject, timer });
    proc.stdin.write(JSON.stringify({ id, method, params }) + "\n", (error) => { if (error) failPending(error); });
  });
}

try {
  const initialized = await request("initialize", { clientInfo: { name: "pocketforge_discovery_check", title: "Pocket Forge discovery check", version: "0.1.0" } }) as { userAgent?: string };
  send("initialized", {});
  const result = await request("skills/list", { cwds: [workspace], forceReload: true }) as {
    data?: Array<{ cwd: string; skills: Array<{ name: string; path: string; enabled: boolean; scope?: string }>; errors: unknown[] }>
  };
  const listing = result.data?.find((item) => path.resolve(item.cwd).toLowerCase() === path.resolve(workspace).toLowerCase());
  const discovered = listing?.skills.find((item) => item.name === skill.id && path.resolve(item.path).toLowerCase() === path.join(skillPath, "SKILL.md").toLowerCase());
  if (!discovered || !discovered.enabled) throw new Error("Codex did not discover and enable the staged exported skill.");
  const evidence = {
    schemaVersion: "pocketforge.harness-discovery/1", checkedAt: new Date().toISOString(),
    harness: "codex", harnessUserAgent: initialized.userAgent, status: "discovered",
    skillId: skill.id, skillVersion: skill.version, candidateHash: exported.candidateHash,
    installation: path.relative(projectRoot, skillPath), discoveredSkill: discovered,
    methodsSent: sentMethods, inferenceRequested: false,
    unrelatedSkillErrorCount: listing?.errors.length ?? 0, diagnosticBytes,
    limitations: ["No thread or turn was started. Discovery does not establish invocation, selection accuracy, or correct execution through a model."]
  };
  await writeFile(path.join(runRoot, "discovery.json"), JSON.stringify(evidence, null, 2) + "\n", "utf8");
  const compatibilityRoot = path.join(projectRoot, "artifacts", "compatibility", exported.candidateHash);
  await mkdir(compatibilityRoot, { recursive: true });
  await writeFile(path.join(compatibilityRoot, "codex.json"), JSON.stringify({
    harness: "codex", candidateHash: exported.candidateHash, checkedAt: evidence.checkedAt,
    discovery: "verified", invocation: "unverified", execution: "unverified",
    evidence: path.relative(projectRoot, path.join(runRoot, "discovery.json"))
  }, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ status: evidence.status, harness: evidence.harness, skillId: skill.id, enabled: discovered.enabled, scope: discovered.scope, inferenceRequested: false, evidence: path.relative(projectRoot, path.join(runRoot, "discovery.json")) }, null, 2));
} finally {
  proc.stdin.end();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([closed, new Promise<void>((resolve) => { timeout = setTimeout(() => { proc.kill(); resolve(); }, 3000); })]);
  if (timeout) clearTimeout(timeout);
  lines.close();
}
