import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = parseEnv(await readFile(path.join(root, ".env"), "utf8"));
const base = new URL(env.ZETARIS_BASE_URL ?? "");
if (base.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(base.hostname) || base.port !== "3000" || base.username || base.password || base.search || base.hash) throw new Error("Use the documented local Zetaris UI endpoint on loopback port 3000.");
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function json(response: Response) {
  if (!response.ok) throw new Error("LOCAL_ZETARIS_HTTP_" + response.status);
  const text = await response.text();
  if (Buffer.byteLength(text) > 1000000) throw new Error("LOCAL_RESPONSE_TOO_LARGE");
  return { value: JSON.parse(text) as Record<string, unknown>, hash: hash(text) };
}
try {
  const login = await json(await fetch(new URL("/api/auth/login", base), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: env.ZETARIS_USERNAME, password: env.ZETARIS_PASSWORD }), signal: AbortSignal.timeout(15000), redirect: "error" }));
  const auth = login.value.data && typeof login.value.data === "object" ? login.value.data as Record<string, unknown> : login.value;
  const token = auth.idToken ?? auth.token ?? auth.accessToken;
  const orgId = auth.orgId ?? env.ZETARIS_ORG_ID;
  if (typeof token !== "string" || !orgId) throw new Error("LOCAL_AUTH_RESPONSE_UNRECOGNIZED");
  const requestId = randomUUID(), started = performance.now();
  const query = { select: "select 7 as seven", pageLimit: 5 };
  const result = await json(await fetch(new URL("/api/proxy/query/sql/start", base), { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "X-Org-ID": String(orgId), "X-Request-ID": requestId }, body: JSON.stringify(query), signal: AbortSignal.timeout(30000), redirect: "error" }));
  const containsSeven = (value: unknown): boolean => Array.isArray(value) ? value.some(containsSeven) : value !== null && typeof value === "object" && (Object.entries(value).some(([name, item]) => name === "seven" && String(item) === "7") || Object.values(value).some(containsSeven));
  const verified = containsSeven(result.value);
  const evidence = { schemaVersion: "emberforge.zetaris-connectivity/1", checkedAt: new Date().toISOString(), requestId, status: verified ? "query_verified" : "unconfirmed", endpoint: "local Docker UI proxy", query, queryHash: hash(JSON.stringify(query)), responseHash: result.hash, responseFieldNames: Object.keys(result.value), durationMs: performance.now() - started, credentialsIncluded: false, modelCalls: 0, limitation: "Constant SELECT through the local UI/API/query-engine stack only. Does not establish two-source registration, source snapshots, stock reconciliation or the production tenant transport." };
  const directory = path.join(root, "artifacts", "zetaris"); await mkdir(directory, { recursive: true });
  const artifact = path.join(directory, "connectivity-" + requestId + ".json");
  await writeFile(artifact, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ ...evidence, artifact: path.relative(root, artifact) }));
  if (!verified) process.exitCode = 1;
} catch (error) {
  const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "LOCAL_ZETARIS_PROBE_FAILED";
  console.log(JSON.stringify({ status: "failed", code, credentialsIncluded: false, modelCalls: 0 })); process.exitCode = 1;
}
