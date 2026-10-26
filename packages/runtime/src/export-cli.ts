import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SkillContractSchema,
  SkillDefinitionSchema,
  StockDatasetSchema,
  StockParametersSchema
} from "@emberforge/contracts";
import { executeSkill, SkillExecutionError } from "./index.js";

interface CliOptions {
  inputPath?: string;
  outputPath?: string;
}

class CliError extends Error {
  constructor(readonly code: string, message: string, readonly status: "failed" | "unsupported" = "failed") {
    super(message);
    this.name = "CliError";
  }
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
      console.log("Usage: node runtime/emberforge-runtime.mjs --input <file.json> [--output <result.json>]");
      process.exit(0);
    } else {
      throw new CliError("ARGUMENT_INVALID", "Unknown or incomplete argument: " + String(flag));
    }
  }
  if (!options.inputPath) throw new CliError("INPUT_REQUIRED", "An input JSON file is required.");
  return options;
}

async function readPackageJson<T>(filePath: string, label: string): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CliError("SKILL_PACKAGE_INVALID", label + " is not valid JSON.");
    }
    throw new CliError("SKILL_PACKAGE_INCOMPLETE", "Could not read bundled " + label + ".");
  }
}

function parseInputJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CliError("INPUT_INVALID_JSON", "Input file must contain valid JSON.");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CliError("INPUT_SHAPE_INVALID", "Input JSON must be an object with parameters and dataset fields.");
  }
  return value as Record<string, unknown>;
}

function normalizeError(error: unknown): { status: "failed" | "unsupported"; reason: string; message: string } {
  if (error instanceof CliError) return { status: error.status, reason: error.code, message: error.message };
  if (error instanceof SkillExecutionError) return { status: "unsupported", reason: error.code, message: error.message };
  if (error instanceof Error && error.name === "ZodError") {
    return { status: "failed", reason: "SKILL_PACKAGE_INVALID", message: "Bundled skill or contract does not match its declared schema." };
  }
  return { status: "failed", reason: "RUNTIME_FAILURE", message: error instanceof Error ? error.message : String(error) };
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    const callerDirectory = process.cwd();
    const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
    const packageRoot = path.resolve(moduleDirectory, "..");
    const skillPath = path.join(packageRoot, "skill.json");
    const contractPath = path.join(packageRoot, "contract.json");
    const inputPath = path.resolve(callerDirectory, options.inputPath!);

    const [skillInput, contractInput, inputText] = await Promise.all([
      readPackageJson<unknown>(skillPath, "skill.json"),
      readPackageJson<unknown>(contractPath, "contract.json"),
      readFile(inputPath, "utf8").catch(() => {
        throw new CliError("INPUT_READ_FAILED", "Could not read the requested input file.");
      })
    ]);
    const skillResult = SkillDefinitionSchema.safeParse(skillInput);
    if (!skillResult.success) {
      throw new CliError("SKILL_PACKAGE_INVALID", "Bundled skill.json does not match the supported skill schema.");
    }
    const contractResult = SkillContractSchema.safeParse(contractInput);
    if (!contractResult.success) {
      throw new CliError("SKILL_PACKAGE_INVALID", "Bundled contract.json does not match the supported contract schema.");
    }

    const input = asRecord(parseInputJson(inputText));
    const parameters = StockParametersSchema.safeParse(input.parameters);
    if (!parameters.success) {
      throw new CliError("INPUT_PARAMETERS_INVALID", "Input parameters do not match the supported schema.", "unsupported");
    }
    const dataset = StockDatasetSchema.safeParse(input.dataset);
    if (!dataset.success) {
      throw new CliError("INPUT_DATASET_INVALID", "Input dataset does not match the supported schema.", "unsupported");
    }

    const result = executeSkill(skillResult.data, contractResult.data, parameters.data, dataset.data);
    const output = {
      status: "succeeded",
      skillId: skillResult.data.id,
      skillVersion: skillResult.data.version,
      executionMode: "bounded-local-interpreter",
      records: result.records,
      metrics: result.metrics
    };
    const serialized = JSON.stringify(output, null, 2) + "\n";
    if (options.outputPath) {
      const outputPath = path.resolve(callerDirectory, options.outputPath);
      await writeFile(outputPath, serialized, "utf8").catch(() => {
        throw new CliError("OUTPUT_WRITE_FAILED", "Could not write the requested output file. Check its parent directory and permissions.");
      });
      console.log(JSON.stringify({ status: "succeeded", output: options.outputPath }));
    } else {
      process.stdout.write(serialized);
    }
  } catch (error) {
    const normalized = normalizeError(error);
    process.stderr.write(JSON.stringify(normalized) + "\n");
    process.exitCode = normalized.status === "unsupported" ? 2 : 1;
  }
}

void main();
