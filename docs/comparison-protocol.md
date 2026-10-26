# Paired evaluation protocol

The first live protocol was frozen before candidate generation on 26 October 2026. All 108 measurements completed under explicit free-endpoint authorization; see [live verification](live-verification.md). No cost savings, break-even point or general performance pass is claimed.

## Four arms

| Arm | Access | What is measured |
| --- | --- | --- |
| A: original agent | Exact approved model, bounded tool session and caller input; no candidate or saved procedure | Reasoning/tool discovery on every input |
| B: instruction-only SKILL.md | Same model, limits and tool vocabulary; saved candidate procedure as instructions, no executable runner | Whether saved instructions already remove repeated reasoning |
| C: exported executable skill | Existing checked immutable export, new input, separate Node process from an unrelated directory | Bundled procedure correctness/refusal and end-to-end process latency |
| D: handwritten script | Separate deterministic reconciliation implementation, same semantic contract | Capability/speed reference; no claim of beating equivalent code |

The instruction-only file is saved in the measurement directory. The adapter configuration hashes differ because the instructions differ; model/account/tool access and limits are bound by `sameModelAndToolsHash`. Host selection/invocation is not included in A/B/C timings here; measure it separately in the transfer rehearsal. D runs in-process and must not be presented as an apples-to-apples process-startup latency comparison with C. Its correctness is still independently judged.

## Freeze first

Prepare a private input file with `policyVersion`, `cases`, `compilationInputHashes` and `developmentInputHashes`. Every case has `caseId`, `provenance`, `category`, `parameters`, `dataset`. Required categories: `new_supported`, `schema_drift`, `stale_policy`, `unknown_unit`, `ambiguous_alias`, `malformed_quantity`, `duplicate_identity`. Include several changed supported combinations and correct alias/unit variations, not just one happy path. Malformed-quantity cases deliberately retain invalid JSON values for contract rejection. Real user samples and synthetic samples retain separate labels.

Once local verification is authorized, **before synthesizing/inspecting a new candidate**:

```powershell
pnpm comparison:freeze .local/comparison-inputs.json artifacts/comparisons/first-protocol
```

The command executes the independent reference to seal labels and saves a private protocol plus public hash manifest. It refuses overlap with declared compilation/development hashes, duplicate inputs and missing categories. Review that declared hashes actually include every training/development input; the tool cannot establish independence from an incomplete operator-supplied list. The model never receives private labels. More synthetic rows alone do not establish real-world utility.

## Collect after authorization

First obtain a new actual candidate/package and measured build summary. The summary must bind its `candidateHash`, actual `candidateCreatedAt`, total `elapsedMs`, `accountedCostUsd`, `inputTokens`, `outputTokens`. Build overhead includes original observations, synthesis, repair, development verification and packaging, not just a final warm export. Unknown cost/tokens are `null`; keep underlying records for review.

```powershell
pnpm comparison:run artifacts/comparisons/first-protocol/protocol.private.json artifacts/exports/NEW-SKILL .local/build-summary.json 'artifacts/comparisons/first results'
```

This command makes model calls and executes evaluations. The first run completed with the human's authorization. It requires exact-scope zero-cost authorization and persistent quotas; it cannot raise the $0 ceiling. It verifies the existing export manifest/receipt without re-exporting, checks the policy boundary and requires the protocol's timestamp to precede the reported candidate creation time. That timestamp comparison is chronology evidence only when supported by actual immutable source artifacts, not proof against a forged build summary.

Three repetitions use paired identical inputs and deterministic rotating arm order. Input/output tokens, actual model-request counts, accounted token cost, complete latency, correctness, false acceptance, appropriate refusal, failures and timeouts are retained for every invocation. Unknown transport usage remains unknown and fully reserved in the provider ledger. Each measurement is appended before another begins; timeout/cancellation stops the comparison. A new output directory is mandatory. Reruns never replace first outcomes.

## Reporting rule

Publish per-case results and denominators, separated by supported/unsupported and provenance. Include all failure/timeout outcomes, total build overhead, warm reuse measurements and host invocation overhead. Approved token prices yield **accounted** cost, not a provider invoice; actual charges stay unknown without billing evidence. Do not compute savings when quality, usage or pricing is unknown. Break-even is meaningful only for comparable measured quality and positive reuse savings after measured build cost. The current runner intentionally produces no automatic savings/break-even claim.

The instruction-only baseline still invokes a model; a host using the executable skill can also spend tokens choosing that skill. The procedure alone needing no reasoning endpoint is a separate property from a host being fully offline.
