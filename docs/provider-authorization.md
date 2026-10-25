# Server-owned provider authorization

Implementation update: 25 October 2026. No provider was activated or called. The human's current spending ceiling remains **$0**. Runtime/error-path verification is pending; the user explicitly chose implementation only.

## Modes

| Mode | Requirements | Result |
| --- | --- | --- |
| `disabled` | Default, absent/invalid records, expired approval or failed accounting | No provider request |
| `verified_zero_cost` | Human-reviewed external entitlement covering all requests/retries, exact endpoint/model/account binding, and an explicitly approved request/token allowance and expiry | Zero-dollar accounting with finite persistent request/token quotas |
| `metered_with_approved_cap` | Exact human-approved scope, prices, requests, tokens, expiry and spending cap | Currently denied by the server's $0 ceiling |

The browser cannot submit these records or override prices/limits. Job requests accept only a candidate name and trace IDs. Supplying a key or setting prices to zero is insufficient.

## Local records

The loader reads fixed files under Git-ignored `.local/`, which is also denied by Vite's filesystem server:

1. `provider-authorization.json`: the strict discriminated union in `packages/contracts/src/provider-authorization.ts`. An inert example is provided in `config/provider-authorization.example.json`.
2. `provider-approval.json`: `human_provider_allowance`, binding the authorization ID, scope, finite allowance, prices, approval time and expiry to the human's actual approval. Its exact byte SHA-256 must match the authorization record.
3. For zero-cost mode, `provider-entitlement.json`: `reviewed_provider_zero_cost_entitlement`, recording a human-reviewed external reference, validity period, exact scope and coverage of every request including retries. Its exact byte SHA-256 must also match.
4. Matching credential/base URL/model/account reference stay in the server environment or `.env`; no secret is sent to the UI or package.

These records are operator-maintained attestations. Hash matching establishes local consistency, not a provider signature or automatic verification of current billing terms. Do not invent confirmation records, mark an unreviewed offer verified, or treat a free-credit balance as a guarantee that requests cannot become billable. No enabled record was created during this work.

Configuration is loaded at startup. Revocation/configuration changes require stopping/restarting the local API; approvals are also checked for expiry before each reservation. The server's current $0 ceiling cannot be increased by a file or browser request.

## Persistent accounting

- `.local/provider-ledger.sqlite` serializes reservations with SQLite `BEGIN IMMEDIATE`, WAL and full synchronization. Authorization identity/content is immutable in that ledger.
- Request count, worst-case tokens and priced cost are reserved before transport. Settled known usage can release unused token/cost reservations; request count is not refunded.
- Missing usage, ambiguous timeouts and interrupted requests retain their full reservation. Restarting does not reset or refund them. Run/call IDs prevent the same call identity from being reserved again.
- Quotas apply across processes using this workspace's ledger. This is not account-wide billing control over other projects or clients.
- Usage above reservation suspends the authorization. Configured prices are accounting assumptions, not a measured provider invoice. Provider-side billing guarantees still require the external entitlement/contract.
- One running synthesis job per workspace is enforced by a transactional job-store index. A stopped owner's job becomes interrupted; another live owner's job is not stolen. No interrupted job silently resumes a possibly billable request.

## Readiness information still needed

Provide credentials locally, a confirmed zero-cost endpoint/model/account entitlement and its validity, an explicit maximum request/token allowance and expiry, and the tenant's verified Zetaris authentication/query/source contract. Keys stay out of chat. No additional spending is authorized by this checklist.

Full tests, injected-transport quota/error scenarios, concurrent-process recovery, live requests and invoice behavior remain unverified. Existing historical fixture results do not establish these new safeguards.
