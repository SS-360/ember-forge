import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const required = ["NVIDIA_BASE_URL", "NVIDIA_MODEL", "NVIDIA_API_KEY", "ZETARIS_BASE_URL", "ZETARIS_API_KEY", "NVIDIA_SESSION_BUDGET_USD"];
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
      sessionBudgetConfigured: Boolean(values.get("NVIDIA_SESSION_BUDGET_USD"))
    },
    zetaris: {
      baseUrlConfigured: Boolean(values.get("ZETARIS_BASE_URL")),
      apiKeyConfigured: Boolean(values.get("ZETARIS_API_KEY"))
    }
  },
  liveNemotronReady: Boolean(values.get("NVIDIA_BASE_URL") && values.get("NVIDIA_MODEL") && values.get("NVIDIA_API_KEY") && values.get("NVIDIA_SESSION_BUDGET_USD")),
  liveZetarisReady: Boolean(values.get("ZETARIS_BASE_URL") && values.get("ZETARIS_API_KEY"))
};

console.log(JSON.stringify(report, null, 2));
if (report.nodeMajor !== 24) {
  console.error("Pocket Forge expects Node 24 LTS.");
  process.exitCode = 1;
}

