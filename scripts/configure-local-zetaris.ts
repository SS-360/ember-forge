import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Credentials remain in local files/process memory. This command never calls NVIDIA.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [flag, bundleArgument] = process.argv.slice(2);
if (flag !== "--bundle" || !bundleArgument) throw new Error("Usage: pnpm zetaris:configure --bundle <extracted-local-bundle>");
const placeholder = (value: string | undefined) => !value?.trim() || /<[^>]*>|^your[_ -]|^replace[_ -]|^example[_ -]/i.test(value.trim());
try {
  const projectPath = path.join(root, ".env");
  const projectText = await readFile(projectPath, "utf8"), project = parseEnv(projectText);
  const bundle = parseEnv(await readFile(path.join(path.resolve(bundleArgument), ".env"), "utf8"));
  const username = placeholder(project.ZETARIS_USERNAME) ? bundle.ZETARIS_ADMIN_EMAIL : project.ZETARIS_USERNAME;
  const password = placeholder(project.ZETARIS_PASSWORD) ? bundle.ZETARIS_ADMIN_PASSWORD : project.ZETARIS_PASSWORD;
  if (!username || !password) throw new Error("LOCAL_ZETARIS_CREDENTIALS_MISSING");
  const response = await fetch("http://localhost:3000/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!response.ok) throw new Error("LOCAL_ZETARIS_LOGIN_HTTP_" + response.status);
  const raw = await response.json() as Record<string, unknown>;
  const candidate = raw.data && typeof raw.data === "object" ? raw.data as Record<string, unknown> : raw;
  const user = candidate.user && typeof candidate.user === "object" ? candidate.user as Record<string, unknown> : {};
  const orgId = candidate.orgId ?? user.orgId ?? candidate.organizationId;
  const token = candidate.idToken ?? candidate.token ?? candidate.accessToken;
  if (typeof token !== "string" || !token || !["string", "number"].includes(typeof orgId)) {
    console.log(JSON.stringify({ localLogin: "unconfirmed", responseFieldNames: Object.keys(raw), envModified: false, credentialsPrinted: false }));
    process.exitCode = 1;
  } else {
    const changes: Record<string, string> = { ZETARIS_BASE_URL: "http://localhost:3000", ZETARIS_USERNAME: username, ZETARIS_PASSWORD: password, ZETARIS_ORG_ID: String(orgId), ZETARIS_JDBC_URL: "jdbc:zetaris:lightning@localhost:10000", ZETARIS_JDBC_DRIVER_JAR: path.join(path.resolve(bundleArgument), "jdbc", "ndp-jdbc-driver-2.4.3.1-7eff043-driver.jar").replaceAll("\\", "/") };
    if (placeholder(project.ZETARIS_API_KEY)) changes.ZETARIS_API_KEY = "";
    let next = projectText;
    for (const [name, value] of Object.entries(changes)) {
      if (/[\r\n\0]/.test(value)) throw new Error("ENV_VALUE_INVALID");
      const line = name + "=" + JSON.stringify(value), pattern = new RegExp("^\\s*" + name + "\\s*=.*$", "m");
      next = pattern.test(next) ? next.replace(pattern, () => line) : next.replace(/\s*$/, "") + "\n" + line + "\n";
    }
    const parsed = parseEnv(next);
    if (Object.entries(changes).some(([name, value]) => parsed[name] !== value) || Object.entries(project).some(([name, value]) => name.startsWith("NVIDIA_") && parsed[name] !== value)) throw new Error("ENV_ROUND_TRIP_INVALID");
    await writeFile(projectPath, next);
    console.log(JSON.stringify({ localLogin: "succeeded", orgIdResolved: true, localConnectionSettingsUpdated: Object.keys(changes), credentialsPrinted: false, tokenPersisted: false, nvidiaSettingsUnchanged: true, limitation: "Local login/configuration only. This is not a verified federated source read or an enabled production tenant transport." }));
  }
} catch (error) {
  const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "LOCAL_ZETARIS_CONFIGURATION_FAILED";
  console.log(JSON.stringify({ localLogin: "failed", code, credentialsPrinted: false }));
  process.exitCode = 1;
}
