import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProviderAuthorizationSchema, assertAuthorizationCurrent, type ActiveProviderAuthorization } from "@emberforge/contracts/provider-authorization";
import { canonicalHash } from "@emberforge/compiler/trace-compiler";
import type { CostReservation, SynthesisCostLedger } from "@emberforge/compiler/synthesis-controller";

function nanoUsd(value: number): number {
  const amount = Math.ceil(value * 1000000000);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(amount)) throw new Error("INVALID_LEDGER_AMOUNT");
  return amount;
}
function tokens(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || value === undefined || value < 0) throw new Error("INVALID_LEDGER_TOKEN_COUNT");
  return value;
}
interface Totals { requests: number; charged_nano: number; charged_tokens: number; pending: number }
export class ProviderLedgerError extends Error {
  constructor(readonly code: string) { super(code); this.name = "ProviderLedgerError"; }
}

/** SQLite transactions serialize reservations across processes. No restart refunds a pending request. */
export class PersistentProviderLedger implements SynthesisCostLedger {
  readonly persistent = true as const;
  private readonly database: DatabaseSync;
  private readonly authorization: ActiveProviderAuthorization;
  private localSuspendedReason: string | undefined;
  constructor(file: string, authorizationInput: ActiveProviderAuthorization) {
    const authorization = ProviderAuthorizationSchema.parse(authorizationInput);
    if (authorization.mode === "disabled") throw new Error("PROVIDER_AUTHORIZATION_REQUIRED");
    assertAuthorizationCurrent(authorization);
    this.authorization = authorization;
    mkdirSync(path.dirname(file), { recursive: true });
    this.database = new DatabaseSync(file);
    this.database.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS provider_authorizations (
        authorization_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, blocked_reason TEXT
      );
      CREATE TABLE IF NOT EXISTS provider_reservations (
        reservation_id TEXT PRIMARY KEY, authorization_id TEXT NOT NULL REFERENCES provider_authorizations(authorization_id),
        reserved_nano INTEGER NOT NULL, charged_nano INTEGER NOT NULL,
        reserved_tokens INTEGER NOT NULL, charged_tokens INTEGER NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending','settled')), created_at TEXT NOT NULL, settled_at TEXT,
        run_id TEXT, call_index INTEGER, UNIQUE(authorization_id,run_id,call_index)
      );
    `);
    try {
      this.transaction(() => {
        const version = (this.database.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
        if (version > 2) throw new Error("PROVIDER_LEDGER_VERSION_UNSUPPORTED");
        const columns = new Set((this.database.prepare("PRAGMA table_info(provider_reservations)").all() as unknown as Array<{ name: string }>).map((column) => column.name));
        if (!columns.has("run_id")) this.database.exec("ALTER TABLE provider_reservations ADD COLUMN run_id TEXT");
        if (!columns.has("call_index")) this.database.exec("ALTER TABLE provider_reservations ADD COLUMN call_index INTEGER");
        this.database.exec("CREATE UNIQUE INDEX IF NOT EXISTS provider_run_call ON provider_reservations(authorization_id,run_id,call_index) WHERE run_id IS NOT NULL; PRAGMA user_version=2;");
        const fingerprint = canonicalHash(authorization);
        const existing = this.database.prepare("SELECT fingerprint FROM provider_authorizations WHERE authorization_id=?").get(authorization.authorizationId) as { fingerprint: string } | undefined;
        if (existing && existing.fingerprint !== fingerprint) throw new Error("PROVIDER_AUTHORIZATION_CHANGED");
        if (!existing) this.database.prepare("INSERT INTO provider_authorizations(authorization_id,fingerprint) VALUES(?,?)").run(authorization.authorizationId, fingerprint);
      });
    } catch (error) { this.database.close(); throw error; }
  }
  private transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try { const result = operation(); this.database.exec("COMMIT"); return result; }
    catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
  private totals(): Totals {
    return this.database.prepare(`SELECT COUNT(*) AS requests, COALESCE(SUM(charged_nano),0) AS charged_nano,
      COALESCE(SUM(charged_tokens),0) AS charged_tokens, COALESCE(SUM(state='pending'),0) AS pending
      FROM provider_reservations WHERE authorization_id=?`).get(this.authorization.authorizationId) as unknown as Totals;
  }
  reserve(usd: number, quota?: { tokens: number; runId?: string; call?: number }): CostReservation {
    const amount = nanoUsd(usd), tokenCount = tokens(quota?.tokens);
    if (tokenCount < 1) throw new ProviderLedgerError("INVALID_LEDGER_TOKEN_RESERVATION");
    return this.transaction(() => {
      assertAuthorizationCurrent(this.authorization);
      if (this.localSuspendedReason) throw new ProviderLedgerError("PROVIDER_ALLOWANCE_SUSPENDED");
      const authorization = this.database.prepare("SELECT blocked_reason FROM provider_authorizations WHERE authorization_id=?").get(this.authorization.authorizationId) as { blocked_reason: string | null };
      if (authorization.blocked_reason) throw new ProviderLedgerError("PROVIDER_ALLOWANCE_SUSPENDED");
      const used = this.totals();
      if (used.requests >= this.authorization.allowance.maxRequests) throw new ProviderLedgerError("PROVIDER_REQUEST_ALLOWANCE_EXHAUSTED");
      if (used.charged_tokens + tokenCount > this.authorization.allowance.maxTokens) throw new ProviderLedgerError("PROVIDER_TOKEN_ALLOWANCE_EXHAUSTED");
      if (used.charged_nano + amount > Math.floor(this.authorization.maxSessionCostUsd * 1000000000)) throw new ProviderLedgerError("SESSION_BUDGET_EXHAUSTED");
      const id = randomUUID();
      this.database.prepare(`INSERT INTO provider_reservations(reservation_id,authorization_id,reserved_nano,charged_nano,reserved_tokens,charged_tokens,state,created_at,run_id,call_index)
        VALUES(?,?,?,?,?,?,'pending',?,?,?)`).run(id, this.authorization.authorizationId, amount, amount, tokenCount, tokenCount, new Date().toISOString(), quota?.runId ?? null, quota?.call ?? null);
      return { id, reservedUsd: amount / 1000000000 };
    });
  }
  settle(reservation: CostReservation, actualUsd: number, usage?: { tokens: number }): void {
    const amount = nanoUsd(actualUsd), tokenCount = tokens(usage?.tokens);
    this.transaction(() => {
      const record = this.database.prepare("SELECT reserved_nano,reserved_tokens,state FROM provider_reservations WHERE reservation_id=? AND authorization_id=?").get(reservation.id, this.authorization.authorizationId) as { reserved_nano: number; reserved_tokens: number; state: string } | undefined;
      if (!record || record.state !== "pending" || record.reserved_nano / 1000000000 !== reservation.reservedUsd) throw new Error("INVALID_COST_RESERVATION");
      this.database.prepare("UPDATE provider_reservations SET charged_nano=?,charged_tokens=?,state='settled',settled_at=? WHERE reservation_id=?").run(amount, tokenCount, new Date().toISOString(), reservation.id);
      if (amount > record.reserved_nano || tokenCount > record.reserved_tokens) this.database.prepare("UPDATE provider_authorizations SET blocked_reason='PROVIDER_USAGE_EXCEEDED_RESERVATION' WHERE authorization_id=?").run(this.authorization.authorizationId);
    });
  }
  suspend(reason: string): void {
    if (!/^[A-Z][A-Z0-9_]{1,79}$/.test(reason)) throw new Error("INVALID_SUSPENSION_REASON");
    this.localSuspendedReason = reason;
    this.database.prepare("UPDATE provider_authorizations SET blocked_reason=? WHERE authorization_id=?").run(reason, this.authorization.authorizationId);
  }
  snapshot() {
    const used = this.totals();
    const authorization = this.database.prepare("SELECT blocked_reason FROM provider_authorizations WHERE authorization_id=?").get(this.authorization.authorizationId) as { blocked_reason: string | null };
    return { authorizationId: this.authorization.authorizationId, requests: used.requests, chargedTokens: used.charged_tokens, chargedUsd: used.charged_nano / 1000000000, pendingReservations: used.pending, suspended: Boolean(authorization.blocked_reason || this.localSuspendedReason), reason: authorization.blocked_reason ?? this.localSuspendedReason ?? null };
  }
  close(): void { this.database.close(); }
}
