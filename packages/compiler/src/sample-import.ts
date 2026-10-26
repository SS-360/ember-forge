import { z } from "zod";
import { OrderRecordSchema, InventoryRecordSchema, ProductRulesSchema, StockDatasetSchema, StockParametersSchema } from "@emberforge/contracts";
import { canonicalHash } from "./trace-compiler.js";

/** RFC 4180-style comma/quote/newline parser; no delimiter inference or formula evaluation. */
export function parseCsv(text: string): Record<string, string>[] {
  if (Buffer.byteLength(text, "utf8") > 900000) throw new Error("CSV_BYTE_LIMIT");
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, afterQuote = false;
  const pushRow = () => { row.push(cell); if (row.some((value) => value !== "")) rows.push(row); row = []; cell = ""; afterQuote = false; };
  for (let i = 0; i < text.length; i++) {
    const character = text[i]!;
    if (quoted) {
      if (character !== '"') cell += character;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else { quoted = false; afterQuote = true; }
      continue;
    }
    if (afterQuote && ![",", "\r", "\n"].includes(character)) throw new Error("CSV_INVALID_QUOTE");
    if (character === '"') { if (cell.length || afterQuote) throw new Error("CSV_INVALID_QUOTE"); quoted = true; }
    else if (character === ",") { row.push(cell); cell = ""; afterQuote = false; }
    else if (character === "\n" || character === "\r") { if (character === "\r" && text[i + 1] === "\n") i++; pushRow(); }
    else cell += character;
  }
  if (quoted) throw new Error("CSV_UNCLOSED_QUOTE");
  if (cell || row.length || afterQuote) pushRow();
  const headers = rows.shift();
  if (!headers?.length || new Set(headers).size !== headers.length || headers.some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))) throw new Error("CSV_HEADERS_INVALID");
  if (rows.length > 5000) throw new Error("CSV_ROW_LIMIT");
  return rows.map((values) => {
    if (values.length !== headers.length) throw new Error("CSV_COLUMN_COUNT");
    return Object.fromEntries(headers.map((name, index) => [name, values[index]!]));
  });
}
const numericRows = (text: string, fields: string[]) => parseCsv(text).map((row) => Object.fromEntries(Object.entries(row).map(([name, value]) => {
  if (!fields.includes(name)) return [name, value];
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("CSV_INVALID_QUANTITY");
  return [name, Number(value)];
})));
const Provenance = z.object({ evidenceClass: z.enum(["synthetic_fixture", "user_sanitized"]), sourceLabel: z.string().trim().min(1).max(140), sanitizedConfirmed: z.literal(true) }).strict();
const Metadata = z.object({ sourceVersions: StockDatasetSchema.shape.sourceVersions, sourceSchemaVersions: StockDatasetSchema.shape.sourceSchemaVersions, policyVersion: z.string().min(1) }).strict();
export const SampleImportSchema = z.discriminatedUnion("format", [
  z.object({ format: z.literal("json"), provenance: Provenance, parameters: StockParametersSchema, dataset: StockDatasetSchema }).strict(),
  z.object({ format: z.literal("csv"), provenance: Provenance, parameters: StockParametersSchema, metadata: Metadata, orders: z.string().max(900000), inventory: z.string().max(900000), aliases: z.string().max(900000), unitConversions: z.string().max(900000) }).strict()
]);
export function importWorkSample(input: unknown, options: { allowSnapshot?: boolean } = {}) {
  const parsed = SampleImportSchema.parse(input);
  const dataset = parsed.format === "json" ? parsed.dataset : StockDatasetSchema.parse({ sourceMode: "fixture", sourceVersions: parsed.metadata.sourceVersions, sourceSchemaVersions: parsed.metadata.sourceSchemaVersions, orders: numericRows(parsed.orders, ["quantity"]).map((row) => OrderRecordSchema.parse(row)), inventory: numericRows(parsed.inventory, ["onHandEach"]).map((row) => InventoryRecordSchema.parse(row)), productRules: ProductRulesSchema.parse({ version: parsed.metadata.policyVersion, aliases: parseCsv(parsed.aliases), unitConversions: numericRows(parsed.unitConversions, ["eachPerUnit"]) }) });
  if (dataset.sourceMode !== "fixture" && !(options.allowSnapshot && dataset.sourceMode === "snapshot")) throw new Error("LOCAL_JSON_SOURCE_REQUIRED");
  if (dataset.orders.length + dataset.inventory.length + dataset.productRules.aliases.length + dataset.productRules.unitConversions.length > 5000) throw new Error("SAMPLE_ROW_LIMIT");
  const parameters = parsed.parameters;
  return { schemaVersion: "emberforge.work-sample/1" as const, provenance: parsed.provenance, parameters, dataset, inputHash: canonicalHash({ parameters, dataset }), boundary: dataset.sourceMode === "snapshot" ? "Immutable, receipt-bound snapshot captured from Zetaris. Synthetic versus operational provenance remains separate. Execution reads this snapshot without contacting the source." : "Local JSON tables; fixture is the transport mode. evidenceClass describes synthetic versus user-supplied provenance. No live connector or agent execution is implied." };
}
