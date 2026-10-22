import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SkillContractSchema,
  SkillDefinitionSchema,
  StockDatasetSchema,
  StockParametersSchema
} from "@pocketforge/contracts";
import { executeSkill } from "./index.js";

interface CliOptions {
  inputPath?: string;
  outputPath?: string;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if ((flag === "--input" || flag === "-i") && value) {
      options.inputPath = value;
      index += 1;
    } else if ((flag === "--output" || flag === "-o") && value) {
      options.outputPath = value;
      index += 1;
    } else if (flag === "--help" || flag === "-h") {
      console.log("Usage: node runtime/pocketforge-runtime.mjs --input input.json [--output result.json]");
      process.exit(0);
    } else {
      throw new Error("Unknown or incomplete argument: " + String(flag));
    }
  }
  if (!options.inputPath) throw new Error("An input JSON file is required.");
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const skillPath = path.join(cwd, "skill.json");
  const contractPath = path.join(cwd, "contract.json");
  const inputPath = path.resolve(cwd, options.inputPath!);
  const [rawSkill, rawContract, rawInput] = await Promise.all([
    readFile(skillPath, "utf8"),
    readFile(contractPath, "utf8"),
    readFile(inputPath, "utf8")
  ]);
  const skill = SkillDefinitionSchema.parse(JSON.parse(rawSkill));
  const contract = SkillContractSchema.parse(JSON.parse(rawContract));
  const input = JSON.parse(rawInput) as { parameters?: unknown; dataset?: unknown };
  const parameters = StockParametersSchema.parse(input.parameters);
  const dataset = StockDatasetSchema.parse(input.dataset);
  const result = executeSkill(skill, contract, parameters, dataset);
  const output = {
    skillId: skill.id,
    skillVersion: skill.version,
    sourceMode: dataset.sourceMode,
    modelCallCount: 0,
    records: result.records,
    metrics: result.metrics
  };
  const serialized = JSON.stringify(output, null, 2) + "\n";
  if (options.outputPath) {
    const outputPath = path.resolve(cwd, options.outputPath);
    await writeFile(outputPath, serialized, "utf8");
    console.log(JSON.stringify({ status: "succeeded", output: options.outputPath }));
  } else {
    process.stdout.write(serialized);
  }
}

main().catch((error) => {
  const code = typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" ? error.code : "INPUT_OR_RUNTIME_ERROR";
  process.stderr.write(JSON.stringify({
    status: code === "INPUT_OR_RUNTIME_ERROR" ? "failed" : "unsupported",
    reason: code,
    message: error instanceof Error ? error.message : String(error)
  }) + "\n");
  process.exitCode = 2;
});

