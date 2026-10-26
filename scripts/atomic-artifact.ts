import { rename, writeFile, link, unlink } from "node:fs/promises";
import { setTimeout as pause } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/** Publish a complete, never-overwritten checkpoint. Readers never open the pending name. */
export async function writeImmutableArtifact(directory: string, name: string, value: unknown): Promise<void> {
  if (path.basename(name) !== name || !name.endsWith(".json")) throw new Error("Invalid artifact filename.");
  const pending = path.join(directory, "pending-" + randomUUID() + ".tmp");
  await writeFile(pending, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  await link(pending, path.join(directory, name)); // Atomic visibility; EEXIST preserves prior evidence.
  try { await unlink(pending); } catch { /* A scanner may hold the temp link; it is never read or reused. */ }
}

/** Readers/scanners can briefly hold a Windows destination open. Never unlink the prior artifact. */
export async function replaceArtifactFile(source: string, destination: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try { await rename(source, destination); return; }
    catch (error) {
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      if (attempt >= 7 || !["EPERM", "EBUSY", "EACCES"].includes(String(code))) throw error;
      await pause(5 * 2 ** attempt);
    }
  }
}
