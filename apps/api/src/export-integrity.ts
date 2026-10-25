import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/** Compare actual regular files to the export manifest, without following symlinks or manifest paths. */
export async function exportFilesMatchManifest(directory: string, manifest: unknown): Promise<boolean> {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) return false;
  const entries = Object.entries(manifest);
  if (!entries.length || entries.some(([name, hash]) => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash) ||
    name === "provenance.json" || !name || name.startsWith("/") || name.includes("\\") || name.split("/").some((part) => !part || part === "." || part === ".."))) return false;
  const actual = new Map<string, string>();
  let unsafeEntry = false;
  async function visit(current: string, prefix = ""): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const name = prefix ? prefix + "/" + entry.name : entry.name;
      if (entry.isDirectory()) await visit(path.join(current, entry.name), name);
      else if (entry.isFile()) {
        if (name !== "provenance.json") actual.set(name, createHash("sha256").update(await readFile(path.join(current, entry.name))).digest("hex"));
      } else unsafeEntry = true;
    }
  }
  try { await visit(directory); }
  catch { return false; }
  return !unsafeEntry && actual.size === entries.length && entries.every(([name, hash]) => actual.get(name) === hash);
}
