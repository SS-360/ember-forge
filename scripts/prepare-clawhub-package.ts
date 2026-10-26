import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, copyFile, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [sourceArgument] = process.argv.slice(2).filter((argument) => argument !== "--");
if (!sourceArgument) throw new Error("Usage: pnpm marketplace:prepare -- <verified-export-directory>");

const exportRoot = path.resolve(projectRoot, "artifacts", "exports");
const source = path.resolve(projectRoot, sourceArgument);
const sourceRelative = path.relative(exportRoot, source);
if (!sourceRelative || sourceRelative.startsWith("..") || path.isAbsolute(sourceRelative)) {
  throw new Error("Only a checked package inside artifacts/exports can be staged.");
}

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(path.join(source, file), "utf8")) as T;
const [skill, contract, verification, provenance, skillMarkdown] = await Promise.all([
  readJson<{ id: string; version: string }>("skill.json"),
  readJson<{ skillId: string; skillVersion: string }>("contract.json"),
  readJson<{ status: string; candidateHash: string; skillId: string; skillVersion: string }>("verification.json"),
  readJson<{ candidateHash: string; skillId: string; skillVersion: string }>("provenance.json"),
  readFile(path.join(source, "SKILL.md"), "utf8")
]);
if (verification.status !== "validated" || verification.skillId !== skill.id || verification.skillVersion !== skill.version ||
  contract.skillId !== skill.id || contract.skillVersion !== skill.version || provenance.skillId !== skill.id ||
  provenance.skillVersion !== skill.version || provenance.candidateHash !== verification.candidateHash ||
  !/^[a-z0-9-]{1,64}$/.test(skill.id) || !new RegExp(`^name: ${skill.id}$`, "m").test(skillMarkdown)) {
  throw new Error("Export identity, verification, provenance, or ClawHub skill metadata do not match.");
}

const verifier = path.join(source, "tests", "verify-export.mjs");
await access(verifier);
execFileSync(process.execPath, [verifier], { cwd: source, stdio: "inherit", windowsHide: true });

const stageRoot = path.join(projectRoot, "artifacts", "marketplace", "clawhub", randomUUID());
const stagedSkill = path.join(stageRoot, skill.id);
const stagedFiles: Array<{ path: string; sha256: string; bytes: number }> = [];
const copyTree = async (from: string, to: string, prefix = ""): Promise<void> => {
  const info = await lstat(from);
  if (info.isSymbolicLink()) throw new Error(`Refusing symlink in exported package: ${prefix || from}`);
  if (info.isDirectory()) {
    await mkdir(to, { recursive: true });
    const entries = await readdir(from, { withFileTypes: true });
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      await copyTree(path.join(from, entry.name), path.join(to, entry.name), relative);
    }
    return;
  }
  if (!info.isFile()) throw new Error(`Refusing non-regular package entry: ${prefix}`);
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
  const contents = await readFile(from);
  stagedFiles.push({ path: prefix.replaceAll("\\", "/"), sha256: createHash("sha256").update(contents).digest("hex"), bytes: contents.byteLength });
};
await copyTree(source, stagedSkill);
const report = {
  schemaVersion: "emberforge.clawhub-staging/1",
  status: "prepared_for_owner_review",
  skillId: skill.id,
  skillVersion: skill.version,
  candidateHash: verification.candidateHash,
  stagedSkillDirectory: path.relative(projectRoot, stagedSkill),
  directoryMatchesSkillName: path.basename(stagedSkill) === skill.id,
  fileCount: stagedFiles.length,
  bytes: stagedFiles.reduce((sum, item) => sum + item.bytes, 0),
  files: stagedFiles.sort((a, b) => a.path.localeCompare(b.path)),
  publication: "not_published",
  licenseReview: "ClawHub requires MIT-0 for published skills; the project owner has not selected or confirmed that license. Do not publish until rights and license are approved."
};
await mkdir(stageRoot, { recursive: true });
await writeFile(path.join(stageRoot, "staging-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
