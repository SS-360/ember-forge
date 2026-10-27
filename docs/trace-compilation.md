# Sanitized traces and deterministic compilation

Updated 27 October 2026. Ember Forge has two skill-creation paths for the stock-reconciliation domain: assembly of a common graph from matching traces, and a bounded Nemotron synthesis path. Nemotron generated the current Zetaris-origin candidate from original-agent traces; the candidate passed 21/21 finite development cases. This demonstrates one task family, not general learning across workflows. Start with the [plain-language workflow](how-it-works.md) and [run/evidence guide](run-and-evidence.md).

## Use the local application

1. Start `pnpm dev` and open `http://127.0.0.1:5174/`.
2. In **Workbench → Compile a skill**, load replay examples or import a sanitized trace-set JSON file.
3. Select at least two successful traces with different input hashes and one counterexample. At most 32 traces can be selected.
4. Enter an unused lowercase candidate name and compile. Candidate names preserve separate artifacts; an existing name cannot be overwritten.
5. Inspect the finite development report and package. The header selector reopens previous candidates.
6. Download the Agent Skill and run its bundled interpreter with compatible JSON inputs.

Replay examples are captured from actual operations executed by the hand-authored seed interpreter. Two supported runs and one unknown-unit failure are checked against the independent reference. These are synthetic runtime replays, not evidence of learning from an agent. The trace recorder emits normalized arguments and hashes without raw input rows or provider logs.

## Import contract

The strict schema is `packages/contracts/src/traces.ts`. A file has `schemaVersion: "emberforge.trace-set/1"` and a `traces` array. Each trace contains:

| Field | Purpose |
| --- | --- |
| `traceId`, `recordedAt`, `taskFamily` | Recording identity, timestamp, and supported domain |
| `evidenceClass`, `recordingMethod`, optional `sourceCandidateHash` | Explicit synthetic/user provenance and replay/agent-tool distinction |
| `sourceMode`, `policyVersion`, source/schema versions | Applicability and source lineage |
| `inputHash`, `parameterNames` | Input fingerprint and symbolic caller parameters; raw parameter values are excluded |
| `calls` | Ordered, allowlisted operation descriptors, input/output hashes, outcomes, and stable error codes |
| `outputArtifactHash` | Successful output fingerprint; must agree with the final emit call |
| `label` | Declared independent evaluator/version, outcome, and rejection reason |
| `redaction` | Required profile with raw logs and raw input values explicitly absent |

Unknown fields are rejected before persistence. Filter literals are restricted to the task's open/cancelled statuses; input-specific values must use parameter references. A successful trace ends with a successful emit and cannot contain a failed call. A counterexample must end at its labeled failed operation. Importing the same ID with different evidence is rejected.

This schema enforces structure and excludes raw payload fields. It is not a universal detector of secrets hidden in otherwise allowed identifiers, and imported evaluator labels remain provenance assertions until replayed. Original snapshots are not reconstructed from hashes or sent to the generation adapter.

### Local source snapshots

Replay examples retain separate local snapshots. For custom imports, POST a strict `emberforge.source-snapshot/1` object containing `inputHash`, `parameters`, and `dataset` to `/api/traces/:traceId/replay`. Content hash, source/schema/policy versions, normalized observations and the independent evaluator outcome must agree. Empty-call records now require `failureStage: "applicability"`, a recognized pre-operation rejection and no output; replay uses the trusted applicability check rather than inventing tool calls. Malformed raw inputs still cannot use the strictly typed snapshot format. Raw snapshots stay under ignored `artifacts/source-snapshots/` and outside model context. New pre-operation paths have not been exercised in this implementation-only continuation.

Generic trace replay examples use fixture inputs. The separate Zetaris route stores read results as receipt-bound snapshots and supports the recorded original-agent and synthesis path for those snapshots. The candidate's portable runtime accepts the snapshot as JSON; live source queries occur before, not during, exported-skill execution. See the [Zetaris demo](zetaris-demo.md).

## Assembly and verification boundaries

- Two successful operation graphs must agree exactly, including symbolic parameters and operator arguments. Their inputs must have distinct hashes.
- Counterexamples must follow a prefix of that graph. They are retained as counterexample lineage, not promoted to successful examples.
- The adapter receives sanitized development traces, requested candidate identity, and fixed row/runtime limits. Independent verification cases and held-out data are not passed to it.
- The generated graph uses the existing typed IR and trusted interpreter. Arbitrary scripts are not accepted.
- New candidates use a 21-case independent synthetic development split, separate from the three compilation inputs, with input-hash overlap rejection. Historical candidates retain their original seven-case suite. Incorrect agreeing graphs cannot be exported.
- Assembly has a 10-second deadline and disconnect cancellation. Package checks have a separate 30-second child-process timeout. Synthesis jobs use bounded revisions, calls, tokens, cost reservations, per-call/overall deadlines, polling, explicit cancellation and restart interruption. SSE streaming is not implemented.
- `lineage.json` records the adapter, compiler-context hash, trace hashes/input hashes/outcomes, operation-to-trace links, and limitations. Exported provenance hashes include this file.

The assembly path is a parameterized replay baseline. It is useful for validating ingestion, lineage, verification, and packaging, and by itself does not establish model-driven workflow learning. The separate Nemotron path has produced a candidate from original-agent traces; its evidence and finite limits are documented in [live verification](live-verification.md) and the [Zetaris integration review](sponsor-integration-review.md).

## Bounded synthesis and evaluation

The injectable controller accepts legitimate graph variations and typed candidate repairs; it does not require exact graph consensus. Independent evaluator code, development inputs/answers, and frozen inputs are outside its context. Repair feedback includes development verdicts only. Candidate origins distinguish `test_synthesis`, `nemotron_synthesis`, `deterministic_trace_assembly`, and the supplied seed. Only exact operation argument matches receive source-trace links.

The Nemotron adapter sends one typed candidate request and rejects malformed, truncated, multi-action, or usage-unverified responses. The local provider ledger applies a $0 ceiling and finite request/token/time limits. The free prototyping endpoint has been used for original-agent runs and skill synthesis; fresh clones still default to providers disabled. Injected transports are test-only. Historical failures and successful request details are in [live verification](live-verification.md); exact environment setup is in [provider authorization](provider-authorization.md).

After a passing development result, **Freeze and evaluate** generates a new synthetic split, rejects overlap with compilation/development, and retains the first split/result for the candidate hash. Failures are not sent into repair. Shared generator and finite-domain limits remain visible. Raw local timing pairs cover up to five passing supported cases with three repetitions, without invented provider baselines or savings claims.

## Local API

| Route | Behavior |
| --- | --- |
| `GET /api/traces/replay-examples` | Capture/cache the synthetic seed replay trace set |
| `POST /api/traces/import` | Validate a trace set and preserve immutable trace identities |
| `GET /api/traces` | List summaries and fingerprints |
| `POST /api/traces/:traceId/replay` | Validate an original local snapshot and reproduce normalized observations |
| `GET /api/compiler/readiness` | Report actual transport availability and the $0 production gate |
| `POST /api/compiler/jobs` | Start an authorized server-configured synthesis job; disabled by default |
| `GET /api/compiler/jobs/:jobId` | Inspect stage, attempts, revisions, usage and final evidence |
| `POST /api/compiler/jobs/:jobId/cancel` | Request cancellation |
| `POST /api/skills/compile` | Assemble selected `traceIds` under an unused `skillId`, verify, and prepare a passing package |
| `GET /api/candidates` | List saved candidate summaries |
| `GET /api/workspace` | Load the active candidate, report, and optional lineage |
| `POST /api/workspace/candidate` | Select a saved candidate |
| `POST /api/skills/:skillId/verify` | Refresh development verification and build a passing export |
| `GET /api/skills/:skillId/preview?candidateHash=…` | Inspect the matching current package tree and instructions |
| `GET /api/skills/:skillId/export?candidateHash=…` | Download the matching current archive |
| `GET/POST /api/skills/:skillId/frozen-evaluation` | Inspect or create the retained frozen evaluation |
| `GET /api/library` | List verified/deprecated memory records |
| `POST /api/library/register` | Independently recheck and register a candidate |
| `POST /api/library/execute` | Retrieve an applicable verified skill and execute, or return a reason |

Imported traces, generated candidates, active selection, and exports live under ignored `artifacts/`. The seed remains under `skills/stock-reconciliation/`.
