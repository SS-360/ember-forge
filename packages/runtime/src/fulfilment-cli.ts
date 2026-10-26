import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fulfilmentExceptions, FulfilmentRefusal } from "./fulfilment.js";

try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--input") throw new Error("USAGE: node runtime/run.mjs --input input.json");
  const input = await readFile(args[1]!, "utf8");
  if (Buffer.byteLength(input) > 1_000_000) throw new FulfilmentRefusal("INPUT_TOO_LARGE");
  const policy = JSON.parse(await readFile(fileURLToPath(new URL("../policy.json", import.meta.url)), "utf8"));
  let data: unknown;
  try { data = JSON.parse(input); } catch { throw new FulfilmentRefusal("INPUT_JSON_INVALID"); }
  console.log(JSON.stringify(fulfilmentExceptions(policy, data), null, 2));
} catch (error) {
  const reason = error instanceof FulfilmentRefusal ? error.code : "EXECUTION_FAILED";
  console.error(JSON.stringify({ status: error instanceof FulfilmentRefusal ? "unsupported" : "failed", reason }));
  process.exitCode = error instanceof FulfilmentRefusal ? 2 : 1;
}
