# Live workflow verification — 26 October 2026

The human authorized local tests and the free Nemotron workflow. This record covers synthetic stock-reconciliation data, genuine hosted model calls, a newly generated candidate, and local execution. It does not establish real warehouse accuracy or paid-service authorization. Later explicit Codex/Claude Code execution and live local Zetaris stock reads are now verified in [the host/source record](host-and-zetaris-verification.md).

## Exact candidate and export

| Item | Evidence |
| --- | --- |
| Candidate | `stock-nemotron-be33034d-retry-2@0.1.0` |
| Candidate SHA-256 | `0e1fade2e1aeeb01fb0f1afb3ec773d33f4b4847d02fe3ec4250f644608391fa` |
| Synthesis job | `2c3b3e2e-55df-4855-8390-d23efb803d9a` |
| Job created | `2026-10-26T14:26:18.140Z` |
| Successful synthesis | One request, 13,543 input / 1,122 output tokens; 35.854 seconds controller duration |
| Development checks | 7/7 supported outputs correct, 14/14 expected refusals, zero false acceptances |
| Standalone package receipt | Passed at `2026-10-26T14:26:55.426Z`, bound to the candidate and verification hashes |
| Package identity SHA-256 | `571bf6f58d871db92253d15d6dda4d656bf04a5f128ae5bfed3a99fce35f0943` |

The exact export is under `artifacts/exports/stock-nemotron-be33034d-retry-2/0.1.0/0e1fade2e1ae-8ba1d3dc-f078-4ac5-a7d5-1c693c77d857/`. Local artifacts are Git-ignored and are not shipped as repository source.

The successful synthesis is only the final generation request. The whole workflow took 2,084,042 ms from preparation to completed export, including failed runs, retries, and engineering pauses. Its ledger records 58 requests after preparation, including four with unknown usage. Exact whole-build input/output token totals are therefore unknown. Zero dollars is free-endpoint accounting under the configured rates, not an inspected invoice or a measured savings claim.

## Original-agent evidence

| Original job | Outcome | Requests |
| --- | --- | --- |
| `970c9270-0643-4e7d-8b92-89eb791eddbc` | Warehouse A output independently checked | 9 |
| `766a6125-4290-48c9-a4de-c2e0da335d93` | Warehouse B output independently checked | 5 |
| `ca5df42d-70f1-4be8-af5f-62ffc699a33b` | Unknown unit correctly refused | 2 |

The original agent receives caller inputs, source/schema observations, and trusted tool schemas. It does not load a seed skill, candidate graph, reference implementation, or reference answer. Its tool decisions, request metadata, checked traces and source snapshots are retained under `artifacts/agent-runs/`. Raw reasoning and API credentials are not logged.

The compiler receives the checked original trajectories. Development inputs and answer rows remain outside its context; repair feedback contains verdicts. Identity fields are constrained to the caller's requested candidate, and generated operations still undergo independent static and development checks.

## Retained failures and repairs

Earlier jobs exposed multiple-tool responses, transport timeouts, unnecessary refusals, missing operation-state references, and Windows file-lock failures. Their records remain in the workflow manifest and original job directories. Two earlier synthesis jobs remain recorded: identity validation failures, followed by a request timeout. They were not edited into successful runs.

Repairs enforce one tool action, expose graph-step metadata, account for known usage on protocol errors, distinguish timeouts, stop on independently confirmed unsupported data, publish complete immutable checkpoint files, and constrain candidate identity. Synthesis now permits a finite 90-second request / 300-second job deadline; original-agent comparison bounds remain 30 seconds / 120 seconds.

## Frozen comparison

The nine-case protocol was frozen at `2026-10-26T13:52:11.427Z`, before the new candidate. Its SHA-256 is `958cb8fb5a452b3fb738795f7ae51a1d51f74fd8c1a7ca2b789a99c15867c3e9`. Compilation and development input overlap is checked. Cases share a synthetic domain generator; independence here means separate inputs, not independently sourced real-world data.

Three repetitions compare the original Nemotron agent, instruction-only saved skill on the same model/tools, exact standalone export, and a handwritten script. All **108 invocations** completed. Every outcome was persisted before the next. First outcomes, full agent evidence, and `results.json`/`summary.json` are under `artifacts/live-workflows/be33034d-579e-4a23-a781-6f37b544c5a1/comparison-first/`. No candidate or prompt was repaired against these frozen outcomes.

| Approach | Supported outputs correct | Correct refusals | Model requests, all 27 invocations | Supported-input median latency |
| --- | --- | --- | --- | --- |
| Original Nemotron agent | 6/9 | 18/18 | 91 | 38.46 s |
| Instruction-only saved skill | 9/9 | 18/18 | 33 | 23.78 s |
| Exact executable export | 9/9 | 18/18 | 0 | 117.87 ms |
| Handwritten script | 9/9 | 18/18 | 0 | 0.315 ms, in-process |

Each row contains 27 invocations: three repetitions of three supported and six unsupported inputs. Repetitions do not create additional independent cases. False acceptances were zero for all four approaches. The original agent retained two call-limit failures on warehouse A and one provider timeout on the changed-rule-table case. One original-agent invocation has unknown usage. Known response totals are 391,040 input / 10,418 output tokens for the original agent and 203,916 / 10,979 for instruction-only; the former is a lower bound, not a complete total.

Supported-input latency includes failed attempts. Many unsupported inputs reject before any model call, so their millisecond-level guard checks must not be mixed into a headline model-runtime median. Export timings include Node process startup; the handwritten script runs in-process, so its timing is a capability reference rather than a comparable process benchmark. No invoice, dollar savings, or break-even calculation is established, and equivalent deterministic code remains a valid alternative.

This protocol is separate from the workbench's optional 21-case post-development freeze action. The latter panel does not display this script's paired results.

## Memory, interface, and portability

The generated candidate passed an isolated H-MEM demonstration: cold miss, verified registration, process-level service reload, applicable retrieval, bounded execution, then schema-drift rejection and deprecation. Evidence: `artifacts/memory-demo/18d777b7-439a-4166-80d7-8aed6727747e.json`. Existing application memory was preserved. A failed first memory rehearsal exposed search sensitivity to generated names; task-oriented memory text and a regression check address it.

Fresh browser inspection shows the generated candidate, saved original runs with tool steps/shortage reports, the 21-case report, and an enabled checked export. Screenshots are `workbench-verified.png` and `verification-21.png` in the workflow directory. The original SVG and amber-red design are preserved.

The exact package is copied into separate Codex and Claude rehearsal workspaces **outside the source repository**, under `D:/Pocket Forge/Ember Forge host rehearsal be33034d/`, with fresh supported/unsupported inputs and matching manifests. The earlier staging directory inside artifacts is retained as superseded preparation. Later host rehearsals verified discovery, explicit invocation and both executions with the same package and the app stopped; see [host/source verification](host-and-zetaris-verification.md). Automatic selection remains unverified.

A direct standalone check from the external Codex workspace passed a fresh supported input (exit 0, exact independent output hash) and unknown-unit input (exit 2, correct reason), with no credentials and the exported Node network instrumentation blocking networking. Evidence: `standalone-network-blocked.json` beside the two workspaces. A first manual invocation failed before execution because Windows `--import` needed a file URL; that error is recorded and the unchanged package then passed. This direct Node invocation does not count as a Codex host session. The app servers were running; network-blocked execution and bundled dependencies establish the narrower process independence observed here, not a server-stopped host rehearsal.

## Current local checks and remaining proof

Historical checkpoint: `pnpm typecheck`, 69 Vitest tests across 14 files, and the Vite production build passed. The initial sandbox test run had a Windows export permission failure; the authorized elevated run passed, and later regression checks passed. The latest current-source suite and build results are recorded in [progress](progress.md).

The later user-authorized continuation verified two-host execution, real local Zetaris stock queries, a cross-source join and a controlled freshness check on synthetic data. The latest full suite now passes 85 tests across 19 files, with TypeScript and frontend production build passing. See [host/source verification](host-and-zetaris-verification.md). No deployment, marketplace publication, or event submission occurred.
