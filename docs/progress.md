# Progress

Last updated: 26 October 2026, Asia/Calcutta.

## Ember Forge rename — 26 October

The user requested the new name throughout the project. App text, page metadata, package scopes/imports, new export runtime filenames, generated format identifiers, asset names and documentation now use Ember Forge. The pocket logo is replaced by an ember in the existing amber-red palette. New exports use `emberforge-runtime.mjs`. Historical screenshots, hash-bound seed/evaluation records and existing local artifacts retain their original contents; compatibility handling preserves old schema identifiers, database history, environment-variable aliases and memory scopes. See [rename notes](rename.md).

This rename does not establish new runtime, provider or cross-host evidence. Verification and publication results for the rename are recorded separately from the historical results below.

Rename review: the offline frozen-lockfile dependency install and `pnpm typecheck` passed. README local links, SVG XML and Git whitespace checks passed. The publication audit reported no issues; its two warnings concern ignored dependency symlinks and Windows/MSYS path spelling. No test suite, API/export checks or live provider calls were run, in keeping with the user's implementation-only instruction. The development servers started with the renamed packages and reused existing database history. A fresh browser observation remains unavailable because the embedded browser's error page was blocked by its URL policy; the current logo and UI have not received a new visual sign-off.

## Source publication — 25 October

The user requested publication of the current changes to the existing private `SS-360/ember-forge` repository. Source, test definitions, documentation and design assets are included; local credentials, generated artifacts, databases and dependency directories remain excluded. No additional tests, export checks or provider calls were requested for this publication. The implementation and evidence limits below still apply.

## Implementation continuation — 25 October

The user chose **implementation only**: no full suite, isolated API/export checks, host sessions or live provider calls were run for this continuation. Earlier finite results and screenshots remain historical evidence, not a verification of this source state.

- Added explicit disabled, reviewed-zero-cost and metered-with-approved-cap authorization modes. Server composition binds endpoint/model/account, evidence hashes, human request/token allowance, expiry and prices. Metered mode remains denied by the current $0 server ceiling. No enabled approval/entitlement record was created.
- Added transactional persistent SQLite request/token/cost reservations and authorization fingerprints. Unknown usage remains reserved across restarts; reused run/call identities cannot reserve twice. This code still needs runtime/concurrency/error-path exercise.
- Replaced end-only job JSON writes with transactional stage, attempt, revision and accounting checkpoints; one running workspace job, persisted cancellation, dead-owner interruption and preservation of malformed legacy files. No interrupted provider request is automatically resumed.
- Propagated cancellation into exported-package checks and added a success receipt bound to candidate and verification hashes. Incomplete/cancelled/old unreceipted exports are not served. Existing artifacts remain intact; no re-export check was run here.
- Added explicit empty-call applicability failure recording/replay, without fabricating tool operations. Original live agent capture and model synthesis remain unverified.
- Added a current-source manifest command, disabled authorization example, [authorization setup](provider-authorization.md) and [release capability checklist/demo outline](release-readiness.md). `pnpm dev` now starts only the app, without implicit export checks.
- Apple-style UI, pocket/flame logo and amber-red #B9471E accents are preserved. No public push, deployment or submission occurred.
- `pnpm typecheck` passed after these source changes. This is static compilation only; it does not establish runtime behavior, test counts, provider access or package completion.

## Latest implementation — 24 October

- User-requested Apple Design UI refinement: system typography, translucent toolbar, interruptible spring navigation, clearer compilation hierarchy, inline naming feedback, readable verification case labels, and coordinated library/modal styling. TypeScript and production compilation pass. Actual 1706px desktop and 390px phone screenshots are saved in `docs/design/`; phone compile action remains in the first viewport. See `docs/design/apple-interface.md`. This later UI pass supersedes the prior screenshot-capture blocker and earlier frontier-style direction.

- Implemented bounded synthesis/repair controller and typed Nemotron chat-completions adapter, plus persisted asynchronous API jobs with polling, cancellation and restart interruption. Production supplies no live adapter; user budget is $0 and free access is unconfirmed. Adapter protocol and live provider behavior remain unverified.
- Independent synthetic protocol now has 3 compilation, 21 development and 21 freshly frozen cases, content hashes, and overlap rejection. Snapshot-backed replay reproduces actual normalized tool input/output hashes; arbitrary imports can attach a matching local snapshot through the replay API. Raw snapshots are excluded from generation context.
- New candidate `stock-reconciliation-protocol-v2`, hash `ec2d4b62fd5881d87a7827f4eae05b24bee25227ef619a1b13ce811c7bc19fcd`, passed 7/7 supported and 14/14 rejected development cases. Its package checks passed through the application.
- The same candidate passed 7/7 supported and 14/14 rejected frozen synthetic cases with zero false acceptances. Frozen split hash `e173e786dbf858f2bd2e4583e0f7780e287bc86bb829655cc83d886fa442c56b`. First split/result are retained per candidate hash. Five passing supported inputs have three local timing repetitions each; provider baselines, compilation overhead and savings remain unmeasured.
- Skill Library is now part of the application. Registration independently rechecks a candidate; H-MEM retrieves only verified, hash-matching artifacts before deterministic applicability checks and bounded execution. Actual UI cold lookup, warm new-input execution, changed-policy invalidation, and execution through the newly registered candidate completed with zero model calls. Evidence is under `artifacts/library-executions/`.
- Added an injectable Zetaris tenant transport contract with read-only registered views, shared snapshot/source IDs, bounded pagination, cursor/row limits, cancellation and cleanup. No tenant URLs are guessed; no live transport is installed or verified.
- `pnpm typecheck` and Vite production compilation passed. The historical automated-suite counts below predate this integration and are not a claim that the latest full suite was rerun.
- DOM measurements at actual CSS widths 1706 and 390 show no document overflow. At 390×844 the compile button ends at y803. Screenshot capture worked on 23 October but failed again on 24 October, including the new library state; fresh visual sign-off remains open. Vite's development WebSocket reports a transport error in the embedded browser; HTTP actions work and no framework overlay appears.

## Phase status

| Phase | Status | Evidence / remaining work |
| --- | --- | --- |
| P0: readiness | Partial, externally blocked | Budget is explicitly $0. Free provider entitlement, live credentials and tenant API contract are unconfirmed. |
| P1: baseline | Fixture slice complete | Typed task/source/trace contracts, deterministic stock-reconciliation oracle, synthetic dataset, and retained success/unsupported traces. |
| P2: compiler | Assembly available; bounded synthesis infrastructure implemented | Normalized traces, snapshot replay, independent verification, typed generation/repair controller, provider adapter and cancellable jobs exist. Production generation is disabled; real model learning remains unproved. |
| P3: memory/boundaries | Integrated with the local app | Library registration, warm execution and policy invalidation exercised through the actual UI/API; verified artifact hashes checked at retrieval. |
| P4: package/evaluation | Candidate-specific exports, offline checks and Codex repo discovery verified; invocation checks remain | Export includes SKILL.md, bounded runner, contract, examples, tests, verification, lineage and file hashes. The generated candidate was discovered and enabled by Codex CLI 0.163.0 in an isolated project without inference. Host invocation/execution remain unverified. The frozen synthetic smoke split is 10/10 with 0 false acceptances; it is not a representative held-out benchmark. |
| P5: product finish | Apple-style workbench, verification and library integrated | Pocket/flame logo and amber-red accents preserved; actual desktop/phone screenshots exist in docs/design. Full accessibility/import-flow coverage remains open. |
| P6: submission | Not started | Architecture/evidence package, reproduction rehearsal, demo recording, deck, current event-field/rules verification, and submission remain. |

## Implemented local product

- Frontend: React 19.3 + TypeScript + Vite 8; API: Node 24 + Fastify 5 + Zod; metadata: built-in `node:sqlite`.
- Main UI states: Workbench, Verification/export, and Skill Library. The run list and compact dialog retain fixture history/setup.
- Strict trace-set import rejects raw payload fields, invalid success/failure labels, conflicting identities, and input-specific literals. Runtime replay examples capture actual interpreter observations and are explicitly distinguished from agent trajectories. Generated candidates and operation-to-trace lineage are stored under ignored artifacts/candidates/; the active candidate is persisted and selectable.
- `POST /api/tasks/run` executes the local stock-reconciliation reference procedure against synthetic fixtures. It stores a trace-shaped artifact under `artifacts/runs/` and a searchable record in the local SQLite database. It makes zero model calls.
- POST /api/skills/compile assembles selected normalized traces through the deterministic adapter, verifies independently, and builds a passing Agent Skills export. POST /api/skills/:skillId/verify refreshes its report and package. Verification case details, package preview, and download work for the selected candidate. Downloads must match both candidate hash and the current verification file hash. See docs/trace-compilation.md for the API and precise limits.
- Current export includes a standard Agent Skills `SKILL.md`, candidate and contract JSON, trusted runtime, test examples, verification, provenance hashes, bindings, instructions, and attribution/license notice. The archive places files under a folder named after the skill, matching the required `name`. It does not prove host installation, discovery, or invocation. The package check uses a Node-level network guard and dummy provider keys; the guard is not an OS network sandbox.
- Historical concepts are stored under docs/design/accepted-*.png. The user's later Apple Design request, pocket/flame logo and amber-red palette supersede them; SS-360 remains excluded. Current screenshots and design notes are under docs/design/.

## Verification on 23 October

- `pnpm run doctor`: completed. Node 24.13.0 and pnpm 11.25.0 found; NVIDIA and Zetaris readiness both false because configuration is absent.
- `pnpm typecheck`: passed.
- `pnpm --filter @emberforge/web exec vite build`: passed after the current UI and API changes.
- Initial sandboxed localhost requests failed. Starting the loopback dev servers outside the sandbox resolved access. Browser DOM/interaction checks passed at the default 1316px width and the available 500px narrow width; no document overflow, no browser warnings/errors, visible keyboard focus, trace import/compilation, operation lineage, and package download were observed. Screenshot calls still fail, leaving visual comparison and a true phone viewport outstanding.
- `pnpm test`: 9 files and 45 checks passed, including trace privacy/label rejection, graph disagreement, duplicate-input evidence, incorrect procedure rejection, timeout cancellation, immutable import IDs, candidate persistence, and export-file integrity. Affected API/export tests passed again after candidate-specific host discovery status was added.
- Downloaded stock-reconciliation-compiled-0.1.0-agent-skill.tar.gz through the browser, extracted it to an unrelated temporary directory, and ran its packaged verifier successfully. The seven-case development report has 2 supported correct and 5 unsupported rejected. This candidate is deterministic trace assembly, not model learning.
- Codex CLI 0.163.0 discovered and enabled the staged generated skill with scope=repo through initialize/initialized/skills/list only. No conversation or inference turn was started. The UI displays this candidate-specific evidence while invocation/execution remain unverified. Claude Code 2.1.309 is installed; its skill discovery has not been exercised.
- `pnpm eval:export`: passed. Export candidate hash `7c13dadaa80140a068836503d1e2c0dfd17eeb55a1ea59579bca9906f079dc98`; isolated runner result hash `bdc1473c86d1ebb57d7f0c6981cdf361d6db8622c5cb48f3cabae8e266498306`; unsupported reason `UNKNOWN_UNIT`. Provider calls are disabled; Node network API instrumentation is not an OS sandbox.
- `pnpm eval:frozen artifacts/exports/stock-reconciliation/0.1.0/d46c88b6-9cfc-4308-8d4b-562cf65beb9c`: 10/10; 4/4 supported correct, 6/6 unsupported rejected, 0 false acceptances. Split is a small synthetic smoke set, one task family only.
- `pnpm hmem:conformance`: 13/13 passed against the pinned upstream reference (earlier in this work session).
- `pnpm eval:skill`: 2/2 supported development cases correct; 5/5 unsupported cases rejected; 0 false acceptances and 0 needless fallbacks (earlier in this work session).
- `pnpm memory:demo`: cold registration, warm retrieval/execution, and stale-schema invalidation completed (earlier in this work session).

## Outstanding blockers and next steps

1. Confirm free NVIDIA entitlement, credentials and a bounded request/token allowance before activation. Server-owned composition and persistent accounting code are implemented; live activation and runtime evidence remain open.
2. Obtain the Zetaris tenant contract/credentials and implement/verify its actual transport against two registered sources.
3. Record genuine original agent trajectories and verify live generation/repair; synthetic replay and test adapters are not evidence of learning.
4. Complete supported/unsupported invocation in Codex and a second real host. Current Codex evidence covers discovery only.
5. Broaden evaluation to independently sourced real inputs and fair provider baselines. Retain both historical v1 and current finite v2 results without generalization or savings claims.
6. Finish file-import, keyboard and full contrast coverage when verification is requested. Existing desktop/phone captures show the latest visual direction; no new screenshots are required for backend-only changes.
7. Exercise the latest adapter/job/connector error paths and full automated suite when implementation verification is requested. Complete P6 materials and fresh-clone rehearsal before publication/submission.

## Cost and evidence guardrails

- No paid provider calls have been made. The user explicitly authorized a $0 budget; free access is not established.
- All current product runs and evaluations are synthetic fixtures. They are not live Nemotron or Zetaris evidence.
- The seed skill is hand-authored. Current reports measure the bounded interpreter and contract checks, not model-generated workflow generalization.
- Replay-based assembly is labeled deterministic_trace_assembly in verification and provenance. It cannot serve as evidence of learning a new algorithm or of multi-trace generalization.
