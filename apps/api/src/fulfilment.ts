import type { FastifyInstance } from "fastify";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { FulfilmentPolicySchema, type FulfilmentPolicy } from "@emberforge/contracts/fulfilment";
import { fulfilmentExceptions, FulfilmentRefusal } from "@emberforge/runtime/fulfilment";
type ArchiveFile = { name: string; data: Buffer };

async function packageFiles(directory: string, prefix = ""): Promise<ArchiveFile[]> {
  const output: ArchiveFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name), name = prefix ? prefix + "/" + entry.name : entry.name;
    if (entry.isDirectory()) output.push(...await packageFiles(absolute, name));
    else if (entry.isFile()) output.push({ name, data: await readFile(absolute) });
  }
  return output;
}

function archive(files: ArchiveFile[]): Buffer {
  const blocks: Buffer[] = [];
  for (const file of files) {
    const name = Buffer.from(file.name);
    if (name.length > 100) throw new Error("ARCHIVE_PATH_TOO_LONG");
    const header = Buffer.alloc(512);
    name.copy(header); header.write("0000644\0", 100, 8, "ascii"); header.write("0000000\0", 108, 8, "ascii"); header.write("0000000\0", 116, 8, "ascii");
    header.write(file.data.length.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii"); header.write("00000000000\0", 136, 12, "ascii"); header.fill(0x20, 148, 156); header[156] = 0x30; header.write("ustar\0", 257, 6, "ascii"); header.write("00", 263, 2, "ascii");
    header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
    blocks.push(header, file.data);
    if (file.data.length % 512) blocks.push(Buffer.alloc(512 - file.data.length % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks), { level: 9 });
}

function jsonFile(value: unknown): Buffer { return Buffer.from(JSON.stringify(value, null, 2) + "\n"); }
function sha256(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }

async function customizedPackage(directory: string, policy: FulfilmentPolicy): Promise<Buffer> {
  const files = await packageFiles(directory, "fulfilment-exceptions");
  if (!files.some((file) => file.name === "fulfilment-exceptions/SKILL.md") || !files.some((file) => file.name === "fulfilment-exceptions/provenance.json") || files.length > 40 || files.reduce((sum, file) => sum + file.data.length, 0) > 5_000_000) throw new Error("PACKAGE_INVALID");
  const fileMap = new Map(files.map((file) => [file.name, file.data]));
  const requiredJson = (name: string) => {
    const data = fileMap.get("fulfilment-exceptions/" + name);
    if (!data) throw new Error("PACKAGE_FILE_MISSING");
    return JSON.parse(data.toString("utf8")) as any;
  };
  fileMap.set("fulfilment-exceptions/policy.json", jsonFile(policy));
  const caseManifest = requiredJson("tests/cases.json") as Array<{ id: string; inputFile: string; expected: unknown }>;
  const checkedCases = caseManifest.map((testCase) => {
    const inputBytes = fileMap.get("fulfilment-exceptions/" + testCase.inputFile);
    if (!inputBytes) throw new Error("PACKAGE_INPUT_MISSING");
    const input = JSON.parse(inputBytes.toString("utf8"));
    try {
      testCase.expected = fulfilmentExceptions(policy, input);
    } catch (error) {
      if (!(error instanceof FulfilmentRefusal)) throw error;
      testCase.expected = { status: "unsupported", reason: error.code };
    }
    return { id: testCase.id, outcome: (testCase.expected as { status: string }).status, ...((testCase.expected as { reason?: string }).reason ? { reason: (testCase.expected as { reason: string }).reason } : {}) };
  });
  fileMap.set("fulfilment-exceptions/tests/cases.json", jsonFile(caseManifest));
  const sampleCase = caseManifest.find((testCase) => testCase.id === "snapshot-sample");
  if (sampleCase) fileMap.set("fulfilment-exceptions/examples/expected.json", jsonFile(sampleCase.expected));
  const policyHash = sha256(fileMap.get("fulfilment-exceptions/policy.json")!);
  const verification = {
    schemaVersion: "emberforge.fulfilment-package-check/1",
    status: "configured",
    configuredAt: new Date().toISOString(),
    origin: "configured_template",
    policyId: policy.id,
    policyHash,
    cases: checkedCases,
    modelCalls: 0,
    networkCalls: 0,
    limitation: "Selected policy is bundled with the checked workflow runtime. The archive's finite verifier has not been run for this customized policy; run node tests/verify.mjs after download."
  };
  fileMap.set("fulfilment-exceptions/verification.json", jsonFile(verification));
  const provenance = requiredJson("provenance.json") as { schemaVersion: string; skillId: string; version: string; [key: string]: unknown };
  const fileHashes = Object.fromEntries([...fileMap.entries()].filter(([name]) => name !== "fulfilment-exceptions/provenance.json").map(([name, data]) => [name.slice("fulfilment-exceptions/".length), sha256(data)]));
  fileMap.set("fulfilment-exceptions/provenance.json", jsonFile({
    ...provenance,
    packageCheck: verification,
    policyHash,
    files: fileHashes,
    limitation: "Configured fulfilment template customized with the selected policy. The bundled finite verifier remains available and must be run on this downloaded archive."
  }));
  const bundled = [...fileMap.entries()].map(([name, data]) => ({ name, data }));
  if (bundled.length > 40 || bundled.reduce((sum, file) => sum + file.data.length, 0) > 5_000_000) throw new Error("PACKAGE_TOO_LARGE");
  return archive(bundled);
}

export async function registerFulfilmentRoutes(app: FastifyInstance, projectRoot: string) {
  const packageDirectory = path.join(projectRoot, "artifacts", "exports", "fulfilment-exceptions", "0.1.0");
  app.post("/api/fulfilment/run", async (request, reply) => {
    const body = request.body as { policy?: unknown; input?: unknown } | null;
    if (!body || typeof body !== "object" || !Object.hasOwn(body, "policy") || !Object.hasOwn(body, "input") || Object.keys(body).some((key) => !["policy", "input"].includes(key))) return reply.code(400).send({ error: "REQUEST_INVALID" });
    try { return fulfilmentExceptions(body.policy, body.input); }
    catch (error) { return reply.code(422).send({ error: error instanceof FulfilmentRefusal ? error.code : "INPUT_REJECTED" }); }
  });
  app.get("/api/fulfilment/example", async (_request, reply) => {
    try {
      const [policy, input] = await Promise.all([readFile(path.join(projectRoot, "skills/fulfilment-exceptions/policy.json"), "utf8"), readFile(path.join(projectRoot, "fixtures/dev/fulfilment-exceptions.json"), "utf8")]);
      return { policy: JSON.parse(policy), input: JSON.parse(input) };
    } catch { return reply.code(503).send({ error: "EXAMPLE_UNAVAILABLE" }); }
  });
  app.get("/api/fulfilment/export", async (_request, reply) => {
    try {
      const files = await packageFiles(packageDirectory, "fulfilment-exceptions");
      if (!files.some((file) => file.name === "fulfilment-exceptions/SKILL.md") || !files.some((file) => file.name === "fulfilment-exceptions/provenance.json") || files.length > 40 || files.reduce((sum, file) => sum + file.data.length, 0) > 5_000_000) throw new Error("PACKAGE_INVALID");
      const bytes = archive(files);
      return reply.header("Content-Type", "application/gzip").header("Content-Disposition", 'attachment; filename="fulfilment-exceptions-0.1.0.tar.gz"').send(bytes);
    } catch { return reply.code(503).send({ error: "FULFILMENT_EXPORT_NOT_BUILT", message: "Build the checked local skill bundle before downloading it." }); }
  });
  app.post("/api/fulfilment/export", async (request, reply) => {
    const body = request.body as { policy?: unknown } | null;
    if (!body || typeof body !== "object" || !Object.hasOwn(body, "policy") || Object.keys(body).some((key) => key !== "policy")) return reply.code(400).send({ error: "REQUEST_INVALID" });
    const policy = FulfilmentPolicySchema.safeParse(body.policy);
    if (!policy.success) return reply.code(422).send({ error: "POLICY_INVALID" });
    try {
      const bytes = await customizedPackage(packageDirectory, policy.data);
      return reply.header("Content-Type", "application/gzip").header("Content-Disposition", `attachment; filename="fulfilment-${policy.data.id}-0.1.0.tar.gz"`).send(bytes);
    } catch { return reply.code(503).send({ error: "FULFILMENT_EXPORT_NOT_BUILT", message: "Build the checked local skill bundle before downloading it." }); }
  });
}
