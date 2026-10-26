import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { writeImmutableArtifact } from "../../../scripts/atomic-artifact.js";

it("publishes complete immutable JSON checkpoints under continuous concurrent reads", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "emberforge-atomic-artifact-"));
  await writeImmutableArtifact(directory, "checkpoint-00.json", { generation: 0, complete: true });
  const latest = async () => path.join(directory, (await readdir(directory)).filter((name) => name.startsWith("checkpoint-")).sort().at(-1)!);
  let done = false;
  const reader = (async () => { while (!done) { const value = JSON.parse(await readFile(await latest(), "utf8")); expect(value.complete).toBe(true); } })();
  try {
    for (let generation = 1; generation <= 20; generation++) {
      await writeImmutableArtifact(directory, "checkpoint-" + String(generation).padStart(2, "0") + ".json", { generation, complete: true });
    }
    expect(JSON.parse(await readFile(await latest(), "utf8")).generation).toBe(20);
    await expect(writeImmutableArtifact(directory, "checkpoint-20.json", { generation: 999 })).rejects.toThrow();
  } finally {
    done = true; await reader;
    if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("Unexpected temporary directory.");
    await rm(directory, { recursive: true, force: true });
  }
});
