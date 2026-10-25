import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function git(args: string[], optional = false): string {
  const command = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (command.status !== 0 && !optional) throw new Error("Unable to capture repository source state.");
  return command.status === 0 ? command.stdout : "";
}
const names = [...new Set(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean))].sort();
const files: Array<{ path: string; sha256?: string; missing?: true }> = [];
const excluded: string[] = [];
for (const name of names) {
  const portable = name.replaceAll("\\", "/");
  const parts = portable.split("/");
  if (parts.some((part) => [".git", ".local", ".aws", ".codex", ".agents", "node_modules", "artifacts"].includes(part)) || parts.some((part) => part !== ".env.example" && /^\.env(?:\.|$)/.test(part)) || /\.(?:pem|key|crt|p12|pfx)$/i.test(portable)) { excluded.push(portable); continue; }
  const file = path.resolve(root, portable);
  if (!file.startsWith(root + path.sep)) throw new Error("Source manifest path escaped the repository.");
  let resolved: string;
  try { resolved = await realpath(file); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") { files.push({ path: portable, missing: true }); continue; }
    throw error;
  }
  if (!resolved.startsWith(root + path.sep)) { excluded.push(portable); continue; }
  files.push({ path: portable, sha256: createHash("sha256").update(await readFile(resolved)).digest("hex") });
}
const stateHash = createHash("sha256").update(JSON.stringify(files)).digest("hex");
const manifest = {
  schemaVersion: "pocketforge.source-state/1", stateHash, capturedAt: new Date().toISOString(),
  headCommit: git(["rev-parse", "HEAD"], true).trim() || null,
  dirty: Boolean(git(["status", "--porcelain"]).trim()), files, excluded,
  scope: "working-file content manifest; not a commit, test result, or atomic filesystem snapshot"
};
const directory = path.join(root, "artifacts", "source-states");
await mkdir(directory, { recursive: true });
const target = path.join(directory, stateHash + ".json");
try { await writeFile(target, JSON.stringify(manifest, null, 2) + "\n", { encoding: "utf8", flag: "wx" }); }
catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error; }
console.log(JSON.stringify({ stateHash, files: files.length, dirty: manifest.dirty, manifest: path.relative(root, target), checksRun: false }, null, 2));
