# Provider integration readiness

This page records the exact prerequisites for turning the current local fixture demo into a sponsor-connected workflow. No provider request has been made from this workspace.

## NVIDIA Nemotron

Configuration fields are server-only in `.env.example`:

- `NVIDIA_BASE_URL` (currently set to the documented NVIDIA API base URL)
- `NVIDIA_MODEL` (must be a model alias enabled for the user's account)
- `NVIDIA_API_KEY`
- `NVIDIA_ACCOUNT_REFERENCE` (non-secret label binding credentials to the reviewed scope)
- `NVIDIA_SESSION_BUDGET_USD` remains informational compatibility configuration; it cannot raise the server's current $0 authorization.

Before adding calls, confirm account entitlement and the current tool-calling request/response format against NVIDIA's documentation. Implement a narrow read-only tool schema, token/output/time limits, usage logging, one active compilation, a three-revision maximum, and at most twelve rounds. Never send a key to the browser or include it in an export. Do not infer that configured credentials imply a verified call.

**Current status (25 October):** user budget is $0; no free entitlement or live credentials are established by this work. A bounded controller, typed transport, server-owned authorization modes, persistent request/token/cost reservations and durable job checkpoints are implemented. Zero-cost activation requires human-reviewed external entitlement plus a bounded human allowance; positive metered allowance is denied by the current server ceiling. No enabled records or live calls were created. Current runtime/concurrency/error behavior remains unverified because the user chose implementation only. See [authorization](provider-authorization.md) and [release readiness](release-readiness.md).

Adapter request shape was prepared against the [official Nemotron API reference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b-infer). Model alias/account capabilities must be checked before use.

## Zetaris

`ZETARIS_BASE_URL` and `ZETARIS_API_KEY` are intentionally empty. Obtain the active tenant's documented authentication, endpoint, pagination, source registration, and schema details before implementation; do not copy a guessed URL from an older example. The acceptance target is a read-only query across two distinct sources (orders/inventory plus product/unit rules) with source version, query ID, snapshot time, row limit, and result hash recorded.

**Current status:** no endpoint/credentials are configured. apps/api/src/zetaris.ts defines the injectable tenant contract and bounded read orchestration: four allowlisted read-only views across at least two registered source IDs, shared snapshot, version consistency, at most 100 pages per query, 5000 rows in total, cancellation and resource cleanup. There is no tenant-specific HTTP/auth implementation or live evidence. The transport must implement the tenant's verified [API contract](https://kbase.zetaris.com/knowledge/zetaris-api-release); no endpoint paths are inferred.

## Meterless H-MEM

The local integration uses the pinned reference at `vendor/meterless/hmem`, commit `1742dec56a66e58eef9dda2d2b865823758ca8cd`. Skill Library now uses it through the actual UI/API: verified registration, immutable artifact hash checks, retrieval, deterministic applicability, runtime execution, and policy/schema deprecation. Local execution artifacts preserve nominated memories, selected candidate, evidence references, rejections and durations. Cold lookup, changed-input warm execution and policy invalidation were observed on 24 October. This is the pinned minimal local reference, not a hosted production service.

## After credentials arrive

1. Confirm the approved budget and endpoint/account details without recording secrets in evidence.
2. Add one bounded, typed read-only call per provider and retain sanitized requests, responses, query IDs, and hashes.
3. Test unavailable-provider, expired-auth, timeout, pagination, schema-change, and explicit cancellation states.
4. Re-run export and evaluation with the same data snapshot and report live versus fixture evidence separately.
