import Fastify from "fastify";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { registerFulfilmentRoutes } from "./fulfilment.js";

function archiveEntry(bytes: Buffer, target: string): Buffer | undefined {
  const tar = gunzipSync(bytes);
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) return undefined;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const size = parseInt(header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim(), 8);
    const start = offset + 512;
    if (name === target) return tar.subarray(start, start + size);
    offset = start + Math.ceil(size / 512) * 512;
  }
  return undefined;
}

describe("fulfilment workflow API and portable package", () => {
  it("runs the example and rejects an out-of-contract shipment", async () => {
    const app = Fastify();
    await registerFulfilmentRoutes(app, process.cwd());
    try {
      const example = await app.inject({ method: "GET", url: "/api/fulfilment/example" });
      expect(example.statusCode).toBe(200);
      const body = example.json();
      const run = await app.inject({ method: "POST", url: "/api/fulfilment/run", payload: body });
      expect(run.statusCode).toBe(200);
      expect(run.json().records.map((row: { orderId: string; reason: string }) => [row.orderId, row.reason])).toEqual([["ORD-2001", "delayed"], ["ORD-2002", "incomplete"]]);
      const unsupported = await app.inject({ method: "POST", url: "/api/fulfilment/run", payload: { policy: body.policy, input: { ...body.input, schemaVersion: "fulfilment-v2" } } });
      expect(unsupported.statusCode).toBe(422);
      expect(unsupported.json()).toMatchObject({ error: "INPUT_CONTRACT_MISMATCH" });
    } finally { await app.close(); }
  });

  it("downloads a gzip package containing the root Agent Skill and bounded runner", async () => {
    const app = Fastify();
    await registerFulfilmentRoutes(app, process.cwd());
    try {
      const response = await app.inject({ method: "GET", url: "/api/fulfilment/export" });
      expect(response.statusCode).toBe(200);
      const tar = gunzipSync(response.rawPayload);
      expect(tar.includes(Buffer.from("fulfilment-exceptions/SKILL.md"))).toBe(true);
      expect(tar.includes(Buffer.from("fulfilment-exceptions/runtime/run.mjs"))).toBe(true);
      expect(tar.includes(Buffer.from("fulfilment-exceptions/provenance.json"))).toBe(true);
    } finally { await app.close(); }
  });

  it("exports the selected policy and refreshes its finite example expectations", async () => {
    const app = Fastify();
    await registerFulfilmentRoutes(app, process.cwd());
    try {
      const example = (await app.inject({ method: "GET", url: "/api/fulfilment/example" })).json();
      const policy = { ...example.policy, id: "strict-dispatch", graceDays: 5, includeIncomplete: false };
      const response = await app.inject({ method: "POST", url: "/api/fulfilment/export", payload: { policy } });
      expect(response.statusCode).toBe(200);
      const tar = gunzipSync(response.rawPayload);
      expect(tar.includes(Buffer.from("fulfilment-exceptions/SKILL.md"))).toBe(true);
      expect(JSON.parse(archiveEntry(response.rawPayload, "fulfilment-exceptions/policy.json")!.toString("utf8"))).toEqual(policy);
      const cases = JSON.parse(archiveEntry(response.rawPayload, "fulfilment-exceptions/tests/cases.json")!.toString("utf8"));
      expect(cases.find((item: { id: string }) => item.id === "snapshot-sample").expected.records).toEqual([]);
      const verification = JSON.parse(archiveEntry(response.rawPayload, "fulfilment-exceptions/verification.json")!.toString("utf8"));
      expect(verification).toMatchObject({ status: "configured", policyId: "strict-dispatch", modelCalls: 0, networkCalls: 0 });
      expect(verification.limitation).toContain("has not been run for this customized policy");
      const invalid = await app.inject({ method: "POST", url: "/api/fulfilment/export", payload: { policy: { ...policy, graceDays: 31 } } });
      expect(invalid.statusCode).toBe(422);
      expect(invalid.json()).toMatchObject({ error: "POLICY_INVALID" });
    } finally { await app.close(); }
  });
});
