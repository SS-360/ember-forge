# Provider integration readiness

This page records the exact prerequisites for turning the current local fixture demo into a sponsor-connected workflow. No provider request has been made from this workspace.

## NVIDIA Nemotron

Configuration fields are server-only in `.env.example`:

- `NVIDIA_BASE_URL` (currently set to the documented NVIDIA API base URL)
- `NVIDIA_MODEL` (must be a model alias enabled for the user's account)
- `NVIDIA_API_KEY`
- `NVIDIA_SESSION_BUDGET_USD` (required bounded session ceiling)

Before adding calls, confirm account entitlement and the current tool-calling request/response format against NVIDIA's documentation. Implement a narrow read-only tool schema, token/output/time limits, usage logging, one active compilation, a three-revision maximum, and at most twelve rounds. Never send a key to the browser or include it in an export. Do not infer that configured credentials imply a verified call.

**Current status:** no key, model alias, or spend ceiling is configured. Candidate generation and live fallback are disabled. The registered seed program is hand-authored.

## Zetaris

`ZETARIS_BASE_URL` and `ZETARIS_API_KEY` are intentionally empty. Obtain the active tenant's documented authentication, endpoint, pagination, source registration, and schema details before implementation; do not copy a guessed URL from an older example. The acceptance target is a read-only query across two distinct sources (orders/inventory plus product/unit rules) with source version, query ID, snapshot time, row limit, and result hash recorded.

**Current status:** no endpoint or credentials are configured. Only labeled synthetic fixtures are used.

## Meterless H-MEM

The local integration uses the pinned reference at `vendor/meterless/hmem`, commit `1742dec56a66e58eef9dda2d2b865823758ca8cd`, with upstream instructions and license retained. Cold/warm retrieval, trust-ledger handling, stale schema/policy invalidation, and the upstream conformance runner have local evidence. This is not a claim that a production hosted H-MEM service is running.

## After credentials arrive

1. Confirm the approved budget and endpoint/account details without recording secrets in evidence.
2. Add one bounded, typed read-only call per provider and retain sanitized requests, responses, query IDs, and hashes.
3. Test unavailable-provider, expired-auth, timeout, pagination, schema-change, and explicit cancellation states.
4. Re-run export and evaluation with the same data snapshot and report live versus fixture evidence separately.
