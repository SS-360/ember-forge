import { z } from "zod";
import { StockDatasetSchema, StockParametersSchema, type StockParameters } from "@emberforge/contracts";
import { canonicalHash } from "@emberforge/compiler/trace-compiler";

type View = "orders" | "inventory" | "aliases" | "unitConversions";
const views: View[] = ["orders", "inventory", "aliases", "unitConversions"];
const Identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/);
const SnapshotSchema = z.object({
  snapshotId: Identifier, snapshotAt: z.string().datetime(), policyVersion: z.string().min(1).max(64),
  sourceVersions: z.object({ orders: Identifier, inventory: Identifier, productRules: Identifier }).strict(),
  sourceSchemaVersions: z.object({ orders: Identifier, inventory: Identifier, productRules: Identifier }).strict()
}).strict();
const PageSchema = z.object({
  queryId: Identifier, snapshotId: Identifier, sourceVersion: Identifier,
  rows: z.array(z.record(z.string(), z.unknown())).max(100),
  nextPageToken: z.string().min(1).max(2048).optional()
}).strict();
type Snapshot = z.infer<typeof SnapshotSchema>;
type Page = z.infer<typeof PageSchema>;

/** A tenant-specific implementation must be written against its verified contract.
 * No endpoint, authentication shape, SQL syntax or pagination URL is guessed here.
 * Implementations must honor signals and perform read-only, parameterized view reads.
 */
export interface ZetarisTenantTransport {
  evidenceClass: "test_only" | "tenant_verified";
  tenantContractHash: string;
  registeredViews: Record<View, { viewId: string; registeredSourceId: string }>;
  beginSnapshot(options: { signal: AbortSignal }): Promise<Snapshot>;
  openView(input: { snapshotId: string; viewId: string; parameters: StockParameters; pageSize: 100; readOnly: true; signal: AbortSignal }): Promise<Page>;
  nextPage(input: { queryId: string; pageToken: string; signal: AbortSignal }): Promise<Page>;
  closeQuery(input: { queryId: string; signal: AbortSignal }): Promise<void>;
  endSnapshot(input: { snapshotId: string; signal: AbortSignal }): Promise<void>;
}
export class ZetarisReadError extends Error {
  constructor(readonly code: string) { super(code); this.name = "ZetarisReadError"; }
}
async function bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => { abort = () => reject(new ZetarisReadError("SOURCE_READ_CANCELLED")); signal.addEventListener("abort", abort, { once: true }); });
  try { return await Promise.race([operation, cancelled]); }
  finally { if (abort) signal.removeEventListener("abort", abort); }
}

export async function readZetarisSnapshot(transport: ZetarisTenantTransport, parametersInput: unknown, options: { signal?: AbortSignal; timeoutMs?: number } = {}) {
  const parameters = StockParametersSchema.parse(parametersInput);
  if (!/^[a-f0-9]{64}$/.test(transport.tenantContractHash)) throw new ZetarisReadError("TENANT_CONTRACT_UNVERIFIED");
  for (const view of views) {
    Identifier.parse(transport.registeredViews[view]?.viewId);
    Identifier.parse(transport.registeredViews[view]?.registeredSourceId);
  }
  if (new Set(views.map((view) => transport.registeredViews[view].registeredSourceId)).size < 2) throw new ZetarisReadError("TWO_REGISTERED_SOURCES_REQUIRED");
  const timeoutMs = options.timeoutMs ?? 10000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new ZetarisReadError("SOURCE_TIMEOUT_INVALID");
  const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(options.signal ? [options.signal] : [])]);
  signal.throwIfAborted();
  const rawSnapshot = await bounded(transport.beginSnapshot({ signal }), signal);
  const parsedSnapshot = SnapshotSchema.safeParse(rawSnapshot);
  if (!parsedSnapshot.success) {
    const snapshotId = Identifier.safeParse(rawSnapshot && typeof rawSnapshot === "object" ? rawSnapshot.snapshotId : undefined);
    if (snapshotId.success) {
      try { const cleanup = AbortSignal.timeout(2000); await bounded(transport.endSnapshot({ snapshotId: snapshotId.data, signal: cleanup }), cleanup); }
      catch { /* The malformed snapshot remains a failed read, even if cleanup also fails. */ }
    }
    throw new ZetarisReadError("SOURCE_RESPONSE_SCHEMA_INVALID");
  }
  const snapshot = parsedSnapshot.data;
  const tables: Record<View, Array<Record<string, unknown>>> = { orders: [], inventory: [], aliases: [], unitConversions: [] };
  const queries: Array<{ view: View; queryId: string; registeredSourceId: string; sourceVersion: string; pages: number; rows: number; resultHash: string }> = [];
  let totalRows = 0;
  let result: { dataset: z.infer<typeof StockDatasetSchema>; evidence: Record<string, unknown> } | undefined;
  let failure: unknown;
  try {
    for (const view of views) {
      signal.throwIfAborted();
      const sourceVersion = view === "orders" ? snapshot.sourceVersions.orders : view === "inventory" ? snapshot.sourceVersions.inventory : snapshot.sourceVersions.productRules;
      const rawPage = await bounded(transport.openView({ snapshotId: snapshot.snapshotId, viewId: transport.registeredViews[view].viewId, parameters, pageSize: 100, readOnly: true, signal }), signal);
      const parsedPage = PageSchema.safeParse(rawPage);
      if (!parsedPage.success) {
        const query = Identifier.safeParse(rawPage && typeof rawPage === "object" ? rawPage.queryId : undefined);
        if (query.success) {
          try { const cleanup = AbortSignal.timeout(2000); await bounded(transport.closeQuery({ queryId: query.data, signal: cleanup }), cleanup); }
          catch { /* Preserve the original schema failure; the snapshot is also closed below. */ }
        }
        throw new ZetarisReadError("SOURCE_RESPONSE_SCHEMA_INVALID");
      }
      const firstPage = parsedPage.data;
      const queryId = firstPage.queryId;
      const tokens = new Set<string>();
      let pages = 0;
      let queryFailure: unknown;
      try {
        let page = firstPage;
        while (true) {
          if (++pages > 100) throw new ZetarisReadError("SOURCE_PAGE_LIMIT");
          if (page.queryId !== queryId || page.snapshotId !== snapshot.snapshotId || page.sourceVersion !== sourceVersion) throw new ZetarisReadError("SOURCE_SNAPSHOT_CHANGED");
          totalRows += page.rows.length;
          if (totalRows > 5000) throw new ZetarisReadError("ROW_LIMIT_EXCEEDED");
          tables[view].push(...page.rows);
          if (!page.nextPageToken) break;
          if (pages >= 100) throw new ZetarisReadError("SOURCE_PAGE_LIMIT");
          if (tokens.has(page.nextPageToken)) throw new ZetarisReadError("SOURCE_CURSOR_REPEATED");
          tokens.add(page.nextPageToken);
          page = PageSchema.parse(await bounded(transport.nextPage({ queryId, pageToken: page.nextPageToken, signal }), signal));
        }
        queries.push({ view, queryId, registeredSourceId: transport.registeredViews[view].registeredSourceId, sourceVersion, pages, rows: tables[view].length, resultHash: canonicalHash(tables[view]) });
      } catch (error) { queryFailure = error; }
      try { const cleanup = AbortSignal.timeout(2000); await bounded(transport.closeQuery({ queryId, signal: cleanup }), cleanup); }
      catch { queryFailure ??= new ZetarisReadError("SOURCE_QUERY_CLEANUP_FAILED"); }
      if (queryFailure) throw queryFailure;
    }
    const dataset = StockDatasetSchema.parse({ sourceMode: "live", sourceVersions: snapshot.sourceVersions, sourceSchemaVersions: snapshot.sourceSchemaVersions, orders: tables.orders, inventory: tables.inventory, productRules: { version: snapshot.policyVersion, aliases: tables.aliases, unitConversions: tables.unitConversions } });
    result = { dataset, evidence: { evidenceClass: transport.evidenceClass, tenantContractHash: transport.tenantContractHash, snapshotId: snapshot.snapshotId, snapshotAt: snapshot.snapshotAt, queries, paginationComplete: true, datasetHash: canonicalHash(dataset), limitation: "Tenant transport evidence must be verified separately. Reading live data does not authorize execution by a fixture-only skill." } };
  } catch (error) { failure = error; }
  try { const cleanup = AbortSignal.timeout(2000); await bounded(transport.endSnapshot({ snapshotId: snapshot.snapshotId, signal: cleanup }), cleanup); }
  catch { failure ??= new ZetarisReadError("SOURCE_SNAPSHOT_CLEANUP_FAILED"); }
  if (failure) throw failure instanceof ZetarisReadError ? failure : failure instanceof z.ZodError ? new ZetarisReadError("SOURCE_RESPONSE_SCHEMA_INVALID") : new ZetarisReadError(signal.aborted ? "SOURCE_READ_CANCELLED" : "SOURCE_TRANSPORT_FAILED");
  if (!result) throw new ZetarisReadError("SOURCE_RESULT_MISSING");
  return result;
}
