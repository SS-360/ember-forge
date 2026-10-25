# Claims and evidence

All current product measurements use synthetic fixture data and apply only to the stated finite cases.

| Claim | Evidence | Status / limit |
| --- | --- | --- |
| Node 24.13.0 and pnpm 11.25.0 are available locally | `pnpm run doctor`, 23 Oct 2026 | Verified locally |
| Pinned H-MEM reference is present and licensed | `vendor/meterless/hmem/UPSTREAM.json`, retained upstream license/docs | Verified locally at commit `1742dec56a66e58eef9dda2d2b865823758ca8cd` |
| H-MEM conformance suite passes | `pnpm hmem:conformance` | 13/13 on pinned reference; not evidence of a hosted production service |
| Stock reconciliation matches the independent oracle on development examples | `pnpm eval:skill`, `skills/stock-reconciliation/verification.json` | 2/2 supported examples; synthetic development cases only |
| Known unsupported development cases are rejected | `pnpm eval:skill`, `skills/stock-reconciliation/verification.json` | 5/5 rejected; finite synthetic suite only |
| Exported package executes without a provider client | Export `artifacts/exports/stock-reconciliation/0.1.0/d46c88b6-9cfc-4308-8d4b-562cf65beb9c/verification.json` | Bundled example and rejection checked. Node network instrumentation is not an OS sandbox or universal offline guarantee |
| Frozen smoke split passes | `evaluation/frozen-v1/latest-report.json`, produced by `pnpm eval:frozen` against export `d46c88b6-9cfc-4308-8d4b-562cf65beb9c` | 10/10: 4/4 supported correct, 6/6 unsupported rejected, 0 false acceptances; small synthetic smoke split, one task family, not representative held-out evaluation |
| The workbench imports replay traces, compiles a separately named candidate, shows its report, and downloads a skill archive | Browser walkthrough of stock-reconciliation-compiled; local candidate/lineage/export artifacts; downloaded archive verifier | Observed locally; synthetic seed replay, deterministic graph assembly, 2 supported and 5 rejected development cases; no model-learning claim |
| Historical trace import, verification and export integrity rejected known invalid cases | Historical 45 tests across 9 files | Predates current authorization, persistence, receipt and pre-operation branches; not a current-source verification result |
| Codex discovers the generated skill as enabled in repository scope | artifacts/harness-checks/codex/fa7f757c-e633-465c-8d2e-c0abff86e3d2/discovery.json; Codex CLI 0.163.0 | Verified for stock-reconciliation-compiled through skills/list; no conversation/inference requested. Invocation and host execution remain unverified |
| Apple-style layout fits sampled desktop and phone widths | 1706×960 and 390×844; phone compile bottom y781; captures in docs/design | Current pocket/flame logo and amber-red accents have rendered evidence. No document overflow at sampled widths. Full keyboard/accessibility coverage remains open; earlier Vite transport errors are not claimed fixed |
| Nemotron live typed tool call works | Live provider request/response artifact with secrets removed | Blocked: no NVIDIA credentials or approved spend ceiling; no request made |
| Zetaris reads two distinct sources | Sanitized live query/source-version artifacts | Blocked: no tenant endpoint or credentials configured |
| Skill was generated from Nemotron trajectories | Candidate provenance plus retained trajectories | Not established; current seed skill is hand-authored |
| A newly named assembled candidate passes independent v2 cases | stock-reconciliation-protocol-v2, hash ec2d4b62fd5881d87a7827f4eae05b24bee25227ef619a1b13ce811c7bc19fcd | 7/7 supported correct and 14/14 rejected on development; same counts on newly frozen synthetic variants, zero false acceptances. This is assembly, not learned generalization |
| H-MEM participates in the actual application path | artifacts/library-executions: 1af83e25-3462-4af7-a998-454adbba3a32, c3ab5ce4-d91c-4bb1-afaa-502aac97e292, a7452b14-91f8-46a6-b7ef-5698802bb0a1 | Actual cold no-match, warm changed-order execution and policy invalidation with zero model calls. Later execution also selected the new v2 candidate |
| Snapshot replay reproduces the normalized examples | artifacts/source-snapshots and artifacts/trace-replays for the three v2 compilation traces | Local operation hashes/outcomes and independent labels reproduce. This does not establish an original live model trajectory |
| Bounded provider/source infrastructure and persistent authorization/jobs exist | Controller, typed transports, provider-composition.ts, provider-ledger.ts and synthesis-job-store.ts | Static implementation only for latest changes. No active entitlement, live call, tenant HTTP implementation, current error-path validation or savings claim |

Current authorization is $0. No billable call has been made. On 25 October the user chose implementation only; no full suite, API/export checks or host sessions ran in this continuation. Downloads now require a passed, hash-bound completion receipt; old artifacts are retained but need explicit re-export.
