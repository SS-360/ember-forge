import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { freezeComparison } from "../packages/compiler/src/comparison.js";

const [inputPath, outputDirectory] = process.argv.slice(2);
if (!inputPath || !outputDirectory) throw new Error("Usage: pnpm comparison:freeze <private-inputs.json> <new-output-directory>. Runs the independent reference; requires verification authorization.");
const protocol = freezeComparison(JSON.parse(await readFile(path.resolve(inputPath), "utf8")));
const output = path.resolve(outputDirectory);
await mkdir(output); // Never overwrite a prior protocol/first outcome.
await writeFile(path.join(output, "protocol.private.json"), JSON.stringify(protocol, null, 2) + "\n", { flag: "wx" });
await writeFile(path.join(output, "manifest.json"), JSON.stringify({ schemaVersion: protocol.schemaVersion, protocolHash: protocol.protocolHash, frozenAt: protocol.frozenAt, caseCount: protocol.cases.length, inputHashes: protocol.cases.map((item) => item.inputHash), provenance: [...new Set(protocol.cases.map((item) => item.provenance))], executionCollected: false }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status: "frozen", protocolHash: protocol.protocolHash, output, resultsCollected: false }));
