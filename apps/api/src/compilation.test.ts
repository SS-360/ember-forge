import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { registerCompilationRoutes } from "./compilation.js";

const sourceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const temporaryRoots: string[] = [];
afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    if (!root.startsWith(path.join(os.tmpdir(), "emberforge trace routes "))) throw new Error("Unexpected cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});

async function createApp() {
  const root = await mkdtemp(path.join(os.tmpdir(), "emberforge trace routes "));
  temporaryRoots.push(root);
  await Promise.all([mkdir(path.join(root, "skills", "stock-reconciliation"), { recursive: true }), mkdir(path.join(root, "fixtures", "dev"), { recursive: true })]);
  await Promise.all([
    ...["skill.json", "contract.json", "verification.json"].map((name) => copyFile(path.join(sourceRoot, "skills", "stock-reconciliation", name), path.join(root, "skills", "stock-reconciliation", name))),
    copyFile(path.join(sourceRoot, "fixtures", "dev", "stock-reconciliation.json"), path.join(root, "fixtures", "dev", "stock-reconciliation.json"))
  ]);
  const exported: string[] = [];
  const app = Fastify();
  await registerCompilationRoutes(app, root, { exportCandidate: async (directory) => { exported.push(directory); } });
  return { app, root, exported };
}

describe("trace import and compilation API", () => {
  it("rejects an unsafe import before writing evidence", async () => {
    const { app, root } = await createApp();
    try {
      const sample = (await app.inject({ method: "GET", url: "/api/traces/replay-examples" })).json();
      sample.traces[0].providerApiKey = "do-not-store";
      const invalid = await app.inject({ method: "POST", url: "/api/traces/import", payload: sample });
      expect(invalid.statusCode).toBe(400);
      expect(await readdir(path.join(root, "artifacts", "traces"))).toEqual([]);
    } finally { await app.close(); }
  });

  it("round-trips imports, preserves identity conflicts, and persists a separately named candidate", async () => {
    const { app, root, exported } = await createApp();
    try {
      const sample = (await app.inject({ method: "GET", url: "/api/traces/replay-examples" })).json();
      expect((await app.inject({ method: "POST", url: "/api/traces/import", payload: sample })).json()).toMatchObject({ imported: 3, existing: 0 });
      expect((await app.inject({ method: "POST", url: "/api/traces/import", payload: sample })).json()).toMatchObject({ imported: 0, existing: 3 });
      const modified = structuredClone(sample);
      modified.traces[0].inputHash = "a".repeat(64);
      expect((await app.inject({ method: "POST", url: "/api/traces/import", payload: modified })).statusCode).toBe(409);
      const payload = { skillId: "assembled-route-check", traceIds: sample.traces.map((trace: { traceId: string }) => trace.traceId) };
      const compiled = await app.inject({ method: "POST", url: "/api/skills/compile", payload });
      expect(compiled.statusCode).toBe(201);
      expect(compiled.json()).toMatchObject({ exportable: true, verification: { candidateOrigin: "deterministic_trace_assembly", status: "validated" } });
      expect(exported).toEqual([path.join(root, "artifacts", "candidates", payload.skillId)]);
      expect((await app.inject({ method: "GET", url: "/api/workspace" })).json().skill.id).toBe(payload.skillId);
      expect((await app.inject({ method: "GET", url: "/api/candidates" })).json().map((candidate: { id: string }) => candidate.id)).toEqual(["assembled-route-check", "stock-reconciliation"]);
      expect((await app.inject({ method: "POST", url: "/api/workspace/candidate", payload: { skillId: "stock-reconciliation" } })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/api/workspace" })).json().skill.id).toBe("stock-reconciliation");
      expect((await app.inject({ method: "POST", url: "/api/workspace/candidate", payload: { skillId: "../outside" } })).statusCode).toBe(400);
      const lineage = JSON.parse(await readFile(path.join(exported[0]!, "lineage.json"), "utf8"));
      expect(lineage.traces).toHaveLength(3);
      expect((await app.inject({ method: "POST", url: "/api/skills/compile", payload })).statusCode).toBe(409);
    } finally { await app.close(); }
  });
});
