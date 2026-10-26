import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const required = ["NVIDIA_BASE_URL", "NVIDIA_MODEL", "NVIDIA_API_KEY", "NVIDIA_ACCOUNT_REFERENCE", "ZETARIS_BASE_URL", "ZETARIS_API_KEY", "ZETARIS_USERNAME", "ZETARIS_PASSWORD", "NVIDIA_SESSION_BUDGET_USD"];
const values = new Map(required.map((name) => [name, process.env[name] ?? ""]));
const report = {
  node: process.version,
  nodeMajor: Number(process.versions.node.split(".")[0]),
  pnpmExpected: "11.25.0",
  providers: {
    nvidia: {
      baseUrlConfigured: Boolean(values.get("NVIDIA_BASE_URL")),
      modelConfigured: Boolean(values.get("NVIDIA_MODEL")),
      apiKeyConfigured: Boolean(values.get("NVIDIA_API_KEY")),
      accountReferenceConfigured: Boolean(values.get("NVIDIA_ACCOUNT_REFERENCE")),
      sessionBudgetConfigured: Boolean(values.get("NVIDIA_SESSION_BUDGET_USD"))
    },
    zetaris: {
      baseUrlConfigured: Boolean(values.get("ZETARIS_BASE_URL")),
      localLoginConfigured: Boolean(values.get("ZETARIS_USERNAME") && values.get("ZETARIS_PASSWORD")),
      apiKeyConfigured: Boolean(values.get("ZETARIS_API_KEY"))
    }
  },
  liveNemotronReady: false,
  liveZetarisReady: false,
  executionReadiness: "The server supplies no live provider or tenant transport. Configuration is not execution evidence or spending authorization.",
  authorizedSessionBudgetUsd: 0,
  freeProviderAccessVerified: false
};

console.log(JSON.stringify(report, null, 2));
if (report.nodeMajor !== 24) {
  console.error("Ember Forge expects Node 24 LTS.");
  process.exitCode = 1;
}

