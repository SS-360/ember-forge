# Provider integration readiness

Updated 27 October 2026. This current status supersedes the dated checkpoints below.

| Technology | Current state | Limit |
| --- | --- | --- |
| NVIDIA Nemotron | Typed adapter, bounded original-agent runs, and synthesis exercised with synthetic stock data under the separately authorized $0 ceiling. | Not routed through Meterless Nightshift. No real business-data accuracy claim. |
| Zetaris local | Read-only stock reads, cross-source reconciliation join, and controlled freshness check passed through the official local JDBC stack using two synthetic PostgreSQL databases. | Separate workbench path; the original agent and exported skill still use fixtures/JSON snapshots. Cloud/SaaS tenant transport remains unverified. |
| Meterless H-MEM | Pinned local reference participates in the actual Skill Library registration, retrieval, bounded execution, and policy/schema invalidation flow. | No hosted H-MEM service is used or claimed. |
| Meterless Nightshift | Not integrated or configured. | The official Academy describes Nightshift as the primary AI runtime layer; this is a major open sponsor gap. |

The latest full suite passes 85 tests across 19 files, with TypeScript and frontend production build passing. See [host/source evidence](host-and-zetaris-verification.md), [live workflow evidence](live-verification.md), and the [hackathon resource audit](hackathon-resource-audit.md). API keys remain in the ignored root `.env`; no secret values belong in this file or in chat.

## NVIDIA Nemotron

Configuration fields are server-only in `.env.example`:

- `NVIDIA_BASE_URL` (currently set to the documented NVIDIA API base URL)
- `NVIDIA_MODEL` (must be a model alias enabled for the user's account)
- `NVIDIA_API_KEY`
- `NVIDIA_ACCOUNT_REFERENCE` (non-secret label binding credentials to the reviewed scope)
- `NVIDIA_SESSION_BUDGET_USD` remains informational compatibility configuration; it cannot raise the server's current $0 authorization.

Before adding calls, confirm account entitlement and the current tool-calling request/response format against NVIDIA's documentation. Implement a narrow read-only tool schema, token/output/time limits, usage logging, one active compilation, a three-revision maximum, and at most twelve rounds. Never send a key to the browser or include it in an export. Do not infer that configured credentials imply a verified call.

**Historical checkpoint (25 October):** at that time no calls had been authorized or made. The dated 27 October status at the top supersedes that checkpoint; later Nemotron runs and synthesis are recorded in [live verification](live-verification.md).

Adapter request shape was prepared against the [official Nemotron API reference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b-infer). Model alias/account capabilities must be checked before use.

## Zetaris

The SaaS/tenant REST route uses a different contract from the local Docker/JDBC route. Obtain the active tenant's documented authentication, endpoint, pagination, source registration, and schema details before implementing SaaS access; do not copy a guessed URL from an older example.

**SaaS/tenant status:** the injectable tenant contract and bounded read orchestration exist, but no tenant-specific HTTP/auth transport is validated. The separate local JDBC route and its stock reads are verified; see [host/source verification](host-and-zetaris-verification.md). The tenant transport must implement the verified [API contract](https://kbase.zetaris.com/knowledge/zetaris-api-release); no endpoint paths are inferred.

## Meterless H-MEM

The local integration uses the pinned reference at `vendor/meterless/hmem`, commit `1742dec56a66e58eef9dda2d2b865823758ca8cd`. Skill Library now uses it through the actual UI/API: verified registration, immutable artifact hash checks, retrieval, deterministic applicability, runtime execution, and policy/schema deprecation. Local execution artifacts preserve nominated memories, selected candidate, evidence references, rejections and durations. Cold lookup, changed-input warm execution and policy invalidation were observed on 24 October. This is the pinned minimal local reference, not a hosted production service.

## Historical local setup checkpoints

**26 October checkpoint:** NVIDIA endpoint/account entitlement validation and execution were still pending at this date. Zetaris local login and a constant SELECT passed; the 27 October top summary and [host/source report](host-and-zetaris-verification.md) record the later two-source stock reads and join. The local route uses username/password and organisation ID rather than the placeholder SaaS API key. See [credential notes](credentials.md).

1. Confirm the approved budget and endpoint/account details without recording secrets in evidence.
2. Add one bounded, typed read-only call per provider and retain sanitized requests, responses, query IDs, and hashes.
3. Test unavailable-provider, expired-auth, timeout, pagination, schema-change, and explicit cancellation states.
4. Re-run export and evaluation with the same data snapshot and report live versus fixture evidence separately.
