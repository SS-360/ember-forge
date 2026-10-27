# Capability and release evidence

## 27 October 2026 status

The local prototype has two distinct workflow families: a stock-reconciliation skill generated from Nemotron traces and a checked fulfilment-exceptions template with a portable `SKILL.md` package. The stock candidate `zetaris-stock-207ca2ab-retry-3` was generated from receipt-bound snapshots of actual local Zetaris reads, then passed 21 finite synthetic development checks and offline export verification. The source-to-agent-to-skill chain is documented in the [Zetaris demo guide](zetaris-demo.md) and has tracked offline inputs. The fulfilment package uses synthetic snapshots and fixed trusted logic; it does not demonstrate second-domain learning.

Explicit Codex and Claude Code execution exists for an earlier stock package. Hermes and OpenClaw automatically selected and executed the same newer package on one supported synthetic input each, providing a limited same-package two-host result. OpenClaw also rejected an unknown unit with `UNKNOWN_UNIT`, but its tool wrapper reported exit 1 while the runner's native refusal code is 2. Broader selection accuracy remains untested. Offline ClawHub staging is implemented; publication is blocked on owner approval of ClawHub's MIT-0 licensing requirement. A clean-checkout rehearsal and protected cloud deployment remain unverified. The project is a local prototype, not production-ready. H-MEM is the demonstrated Meterless Engine; the public Academy FAQ permits direct Nemotron and any cloud, so neither Nightshift nor AWS hosting blocks the current prototype. The supplied guide recommends Nightshift and unseen hub rules could add requirements. Report call/token/latency measurements with test scope and failures; no savings or break-even claim is currently supported.

Historical 25 October checkpoint. The user's later authorization expanded work to free-endpoint rehearsals and testing. The details below should be read with the dated updates in [progress](progress.md) and [host/source verification](host-and-zetaris-verification.md).

| Capability | Implementation | Evidence boundary |
| --- | --- | --- |
| Apple-style UI, Ember Forge name/pocket-and-flame mark, amber-red accents | Implemented | Prior screenshots in docs/design predate the rename; the retained SVG mark and renamed wordmark need fresh visual observation |
| Typed IR, assembly, independent development/frozen protocol | Implemented | Historical v2 assembled candidate: 21 development and 21 frozen synthetic cases; not a fresh current-source result or learning claim |
| Normalized traces and separate source snapshots | Implemented | Historical snapshot replay; newly added zero-operation applicability failures still need exercise |
| Bounded synthesis/repair and typed provider adapter | Implemented | Test-only prior controller evidence; current authorization/composition integration unverified |
| Three server-owned authorization modes | Implemented | Default disabled, current human cap $0; no confirmed free entitlement or activation |
| Persistent request/token/cost reservations | Implemented | SQLite transaction code; concurrency, expiry, restart and ambiguous-usage scenarios not exercised |
| Durable jobs and cancellation | Implemented | Transactional checkpoints, shared cancellation flag, owner recovery and preserved malformed legacy files; runtime scenarios unverified |
| Candidate export completion receipt | Implemented | Downloads require a successful receipt matching candidate and verification hashes; current packages need explicit re-export/checks to acquire that receipt |
| H-MEM library registration/retrieval/execution/invalidation | Implemented and demonstrated | Actual UI/API path; product integration suite 7/7, pinned conformance 13/13, cold/warm demo and stale-policy/schema rejection |
| Zetaris-origin stock-to-skill path | Implemented and demonstrated | Two live local sources were captured into receipt-bound snapshots, run through the original agent and compiled into a candidate passing 21/21 checks; the exported skill runs offline against the tracked snapshot. SaaS tenant transport is unverified. |
| Host transfer | Portable format implemented | Codex and Claude explicitly ran the same older package; Hermes and OpenClaw automatically selected and ran the same newer package on one supported synthetic case each; OpenClaw refused `UNKNOWN_UNIT` but its tool wrapper remapped native exit 2 to 1 |
| ClawHub package preparation | Offline staging command implemented | Rechecks and stages an exact verified folder; publication has not occurred and MIT-0 rights/owner decision are pending |
| Cloud deployment | Not deployed; not required by public FAQ | Any cloud is allowed. No authenticated hosted environment, persistent operational service or deployment rehearsal; the local demo and offline skill package need no AWS cluster or 24/7 service. |
| Live savings / generalization | Not established | Candidate generation and comparisons use synthetic data; no representative real-data accuracy or broad savings result |

## Current-source setup and local walkthrough

1. Use this working directory's current files. Run `pnpm source:state` to capture a content manifest and dirty status; it does not execute tests or model clients. An older remote clone is not evidence about this source state.
2. Install dependencies using the lockfile and an available cache. Start `pnpm dev`; startup now starts the API/UI without automatically running export checks.
3. Workbench: load the labeled synthetic replay examples, name a new candidate, and assemble it when compilation/verification is explicitly wanted. Compilation triggers its product verification/export checks.
4. Verification: inspect supported/rejected examples and separate frozen results. Existing immutable candidate and frozen artifacts must not be overwritten for a rehearsal.
5. Skill Library: register a passing candidate, inspect cold lookup/warm execution and deliberate policy drift. These are product executions; run them only when requested.
6. For an authorized transfer rehearsal, export/check an exact candidate, install the actual package into isolated Codex and Claude workspaces, stop Ember Forge, and use new supported/unsupported JSON from an unrelated path with spaces. Record discovery, invocation and execution separately. Host model access/cost must be authorized before model-backed sessions.

## Short demo outline

Show repeated reconciliation work → explicit synthetic traces → assembly → finite development verification → separately frozen inputs → inspect/download package → use the library on a changed input → change policy and show refusal. Call the current procedure assembled seed replay throughout. Add a live model-learning segment only after genuine trajectories, generated candidate lineage and fresh evaluation are evidenced.

## Outstanding release gates

- Rehearse the existing live local Zetaris → receipt-bound snapshot → agent trace → skill workflow and the offline packaged reproduction.
- Check unseen hub rule documents if available; the public FAQ permits direct Nemotron and H-MEM already meets the Engine requirement.
- Review the hub's current Rules, Technical Execution Requirements, Submission Requirements, Disqualification Checklist, AI Usage Policy, and required setup/scoring resources.
- Prepare the demo video, slide deck, sponsor-technology explanation, and final HackOS submission.
- Rerun the full test suite after the current packaging edits and capture counts/failures against a named source manifest.
- Confirm free entitlement/credentials, finite request/token authorization and the actual tenant contract before activation.
- Resolve or document OpenClaw's exit-code remapping and broaden selection tests before making a general cross-harness accuracy claim.
- Build a protected cloud deployment only if remote judging access is needed; the local demo and portable package do not require a 24/7 AWS cluster.
- Resolve MIT-0 rights and owner metadata before considering ClawHub publication.
- Broaden fair measurements before making any savings claim.
- Rehearse current-source setup and exact-package transfer in isolated locations. Record unresolved gaps without promoting historical evidence.
- The user authorized pushing the current essential files to the existing private GitHub repository on 25 October. This source publication does not establish that the outstanding release gates have passed. No public deployment or submission is included.
