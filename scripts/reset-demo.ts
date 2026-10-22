import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactsPath = path.join(projectRoot, "artifacts");
const resolvedRoot = path.resolve(projectRoot);
const resolvedArtifacts = path.resolve(artifactsPath);
if (!resolvedArtifacts.startsWith(resolvedRoot + path.sep)) {
  throw new Error("Refusing to reset a path outside this project.");
}
await rm(artifactsPath, { recursive: true, force: true });
await mkdir(path.join(artifactsPath, "runs"), { recursive: true });
console.log("Demo artifacts cleared; source files and credentials were not touched.");

