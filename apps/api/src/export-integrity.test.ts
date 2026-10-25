import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { exportFilesMatchManifest } from "./export-integrity.js";

it("rejects changed, missing, additional, or unsafe package manifest files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pocketforge integrity "));
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  try {
    await mkdir(path.join(directory, "runtime"));
    await writeFile(path.join(directory, "runtime", "runner.mjs"), "trusted runner");
    await writeFile(path.join(directory, "provenance.json"), "{}");
    const manifest = { "runtime/runner.mjs": hash("trusted runner") };
    expect(await exportFilesMatchManifest(directory, manifest)).toBe(true);
    expect(await exportFilesMatchManifest(directory, { ...manifest, "../outside": hash("outside") })).toBe(false);
    expect(await exportFilesMatchManifest(directory, { ...manifest, "missing.json": hash("missing") })).toBe(false);
    await writeFile(path.join(directory, "runtime", "runner.mjs"), "changed runner");
    expect(await exportFilesMatchManifest(directory, manifest)).toBe(false);
    await writeFile(path.join(directory, "runtime", "runner.mjs"), "trusted runner");
    await writeFile(path.join(directory, "undeclared.json"), "unexpected");
    expect(await exportFilesMatchManifest(directory, manifest)).toBe(false);
  } finally {
    if (!directory.startsWith(path.join(os.tmpdir(), "pocketforge integrity "))) throw new Error("Unexpected cleanup path");
    await rm(directory, { recursive: true, force: true });
  }
});
