# Ember Forge — Codex Implementation Plan

Prepared: 23 October 2026, Asia/Calcutta.
Status: active implementation plan; completed work and current gaps are recorded in [progress](progress.md), [readiness](readiness.md), and [implementation follow-up](implementation-follow-up.md).
Product explanation: [Ember Forge Description](product-description.md).

## 1. Project contract

Build an independent Track 3 product that learns reusable procedures from agent trajectories, compiles them into portable Agent Skills, and verifies their applicability on new inputs. The primary deliverable is a standards-based skill folder that compatible harnesses can discover and invoke. The standalone Ember Forge CLI remains a secondary interface to the same trusted runtime.

Do not merge this with VRAM Rescue. Do not import NeuroDBG source, its environment, or research results. These planning files are stored in the current workspace only for handoff. The actual project should live in a separate Codex project folder, suggested name `EmberForge`.

The first supported domain is read-only structured-data reconciliation. A skill consists of a generated program in a bounded intermediate representation (IR), an input contract, a versioned runtime, test artifacts, and data bindings. This is executable workflow compilation, not model training or answer caching.

### Proposed user journey

Connect approved data → run tasks with Nemotron → inspect observed trajectories → compile candidate → inspect validation → register skill → export an installable Agent Skill → install it in a separate harness → execute new inputs. Direct CLI execution remains available for workflows that do not need agent orchestration.

## 2. Event and operational constraints

- Intended track: Reasoning Architecture. Verify final submission fields against the current event page before publishing.
- Event deadline: 27 October 2026, 23:45 UTC / 28 October, 05:15 IST. Target both submissions by 27 October, 20:00 IST to preserve upload buffer.
- The pasted APPROACH guide requires Zetaris as the data layer, at least one Meterless Engine in a working feature, Meterless Nightshift as the primary AI provider, NVIDIA where it contributes, and an agent activity trail. The official Academy says “Cursor or any AI coding tool”; Cursor itself is not currently treated as mandatory. See [resource audit](hackathon-resource-audit.md) for the exact source and current gaps.
- Keep Zetaris on the agent's actual working data path. Route the product through Nightshift and NVIDIA Nemotron where appropriate; direct Nemotron connectivity alone does not meet the Nightshift-primary requirement.
- The user intends two submissions across different tracks. Confirm the current dashboard allowance and final rules before submission; do not assume an earlier form inspection establishes final eligibility.
- Keep source, demo, evidence, and attribution independent from the other entry. Disclose any shared utilities and pre-existing third-party components.
- No paid infrastructure or unbounded API experiments. Establish a user-approved API spend ceiling; technical defaults should bound attempts even when pricing is unavailable.

## 3. Scope and acceptance targets

### Must ship

1. Live task execution through Meterless Nightshift as the primary provider, using NVIDIA Nemotron where it contributes and typed, read-only data tools.
2. Successful and failed trajectory capture with verifiable task outcomes.
3. Generation of parameterized skill programs rather than stored answers.
4. Input applicability checks, postconditions, and version invalidation.
5. Meterless H-MEM retrieval of validated skills and relevant experience.
6. Zetaris-backed task execution spanning at least two distinct sources (local synthetic connectivity is verified; connection to the original-agent and exported-skill data path remains to be completed).
7. Candidate-specific Agent Skills exports that run supported inputs with reasoning access disabled.
8. Verified discovery, invocation, and correct execution in at least two real harnesses before claiming cross-harness transfer. **Passed for one supported synthetic case each in Hermes and OpenClaw with the same newer package**. OpenClaw also refused an unknown unit with the correct reason, but its wrapper remapped native exit 2 to 1; broader selection accuracy remains open. Codex and Claude Code evidence applies to an older export. Keep every untested scope unverified.
9. Independent evaluation and a polished local interface.

### Non-goals

Arbitrary browser automation, arbitrary generated Python/JavaScript execution, fine-tuning, GPU optimization, universal task support, live business writes, and an online skill marketplace.

### Initial task families

Use one coherent operational dataset and two related procedures:

- Stock reconciliation: filter eligible orders, normalize units, resolve known aliases, join inventory, aggregate shortages.
- Fulfilment exceptions: join orders with shipment records, apply versioned timing rules, emit delayed or incomplete items.

These are proposed demos. Implement the first completely before the second. Validate on at least one representative public or user-approved dataset if accessible; label synthetic fixtures and their limits.

Target for the bounded demo: all explicitly supported held-out cases correct and all known unsupported fixtures rejected. Report counts and coverage; passing a finite suite is not a universal correctness proof.

## 4. Stack and repository layout

Prefer TypeScript throughout: Node.js on a verified active LTS release, Fastify API, Zod schemas, React/Vite frontend, and SQLite metadata. Pin the working versions in lockfiles. Use a file-backed event log for execution evidence. Avoid adding a separate database service for internal state.

Suggested structure:

```text
apps/api/                  HTTP endpoints, SSE progress, job controller
apps/web/                  product UI
packages/contracts/        input, tool, trace, IR and export schemas
packages/agent/            Nemotron client and bounded orchestration
packages/compiler/         trace analysis, IR generation, revision loop
packages/runtime/          trusted IR interpreter and export entrypoint
packages/skill-export/     standards-based Agent Skills bundle and optional host adapters
packages/memory/           H-MEM adapter and product memory mapping
packages/connectors/       Zetaris and explicit fixture connectors
packages/evaluator/        independent checks and metrics
vendor/meterless/          pinned reference code and license if vendored
fixtures/dev/              visible development examples
evaluation/                frozen protocol and harness; hidden labels separate
artifacts/                 ignored run outputs and export bundles
docs/                      architecture, evidence, limitations, submission
```

Initial commands now implemented include `pnpm run doctor`, `pnpm run dev`, `pnpm test`, `pnpm eval`, and `pnpm demo:reset`. See the repository README for the current command list and phase status.

## 5. Sponsor integration contracts

### Nemotron

Use the documented OpenAI-compatible chat-completions endpoint with configurable `NVIDIA_BASE_URL`, `NVIDIA_MODEL`, and a server-side `NVIDIA_API_KEY`. Verify account access with a real typed tool call before choosing the model alias. Never expose secrets in browser code or exported skills.

Provide narrow tools: `describe_sources`, `query_view`, `inspect_trace`, `validate_candidate`, and `run_development_case`. Record decisions as short structured summaries with evidence IDs; do not require or expose private chain-of-thought.

Initial limits: one active compiler job, at most three candidate revisions and twelve model/tool rounds per compilation. Enforce token/output/time limits and cancel requests on user stop. Log actual usage and distinguish measured cost from estimates.

### Zetaris

Use a real account and verify its current API/authentication contract; older REST examples are references, not permission to invent endpoints. Register a relational source for orders/inventory and a separate file source for unit rules/aliases; optionally add shipment records through REST.

Expose approved views and typed query parameters. Do not give generated programs arbitrary SQL or database credentials. Handle pagination, authentication expiry, schema changes, row limits, and empty results. Preserve query IDs, source versions, snapshot times, and result hashes.

A cloud Zetaris instance cannot directly reach laptop `localhost`. Use organizer-provided connectivity or accessible test sources. Fixtures may unblock development, but a fixture-only run is not sponsor evidence. Render `live`, `snapshot`, and `fixture` modes clearly.

### Meterless H-MEM

Read the engine README, its AGENTS.md, architecture, record format, retrieval, trust-ledger, and conformance instructions before implementation. Pin a repository commit and use/adapt its reference implementation; preserve license and attribution. Do not replace it with an unrelated key-value cache and claim compliance.

Memory records represent candidate/validated/deprecated skills, applicability conditions, evidence IDs, failures, and version lineage. Retrieval may nominate a skill; deterministic applicability checks authorize execution. Retrieved hints cannot change immutable test labels or become facts without validation.

Demonstrate a cold run that compiles a skill and a warm run that retrieves and executes it. Also demonstrate that a changed schema/policy version invalidates the old skill. Run the pinned engine's applicable conformance suite and a product-level integration test. Document any unsupported engine features.

## 6. Data and execution contracts

Minimum records:

| Record | Required information |
|---|---|
| TaskSpec | task family, parameter schema, data bindings, policy version, postconditions |
| Trace | run ID, tool steps, normalized arguments, result hashes, errors, timestamps, model usage |
| Skill | ID/version, generated IR, parameter schema, assumptions, source fingerprints, runtime version |
| Verification | candidate hash, case IDs, checks, outcomes, coverage, environment, evaluator version |
| Execution | selected skill/version, applicability verdict, source snapshot, outputs, model-call count |

Use a small typed IR: source read, filter, project, typed join, lookup, unit conversion using an explicit table, aggregate, conditional branch, validate, and emit. All operators have row/time limits. Missing keys, unknown units, duplicate identity matches, and ambiguous dates must have explicit error behavior.

The compiler generates operation graphs and parameters, not arbitrary code. A trusted interpreter executes them. Export the generated IR plus the interpreter as an executable package. Call this bounded workflow compilation; do not imply unrestricted program synthesis.

Require stable ordering, explicit null semantics, decimal-safe quantities where necessary, and declared timezones. Never infer a new conversion factor during skill execution.

## 6.1 Portable Agent Skills and harness compatibility

Use the open Agent Skills folder format as the standards-only core. Every export has a `SKILL.md` with valid YAML frontmatter (`name`, `description`) and concise procedural instructions. The folder name matches the skill name. The description explains both the task handled and when the harness should invoke it. Include accurate activation and non-activation conditions, supported inputs, outputs, runtime dependencies, permissions/data access, failure behavior, and relative links to the bundled contract, tests, verification/provenance, and trusted runner.

Keep platform-specific metadata separate and versioned. Add Codex plugin files, Claude Code plugin packaging, or other harness metadata only where the relevant official documentation requires it. A host skill wrapper must invoke the packaged runtime on the user-provided inputs; it must not reproduce the algorithm as a prompt, silently broaden its contract, or fall back to a model without an explicit caller decision. The standalone CLI uses the same contract and procedure.

Track compatibility in a matrix with distinct statuses for: (1) format validation, (2) installation/discovery, (3) invocation, and (4) correct execution on a new supported input plus an actionable unsupported-input rejection. Target Codex, Claude Code, OpenClaw, and Hermes. Do not mark a harness supported based only on matching file layout; require real end-to-end evidence in at least two harnesses before claiming cross-harness transfer.

Resolve skill assets relative to the package/module location. Resolve the caller's input/output paths from the caller's current working directory. The package must contain no credentials, machine-specific absolute paths, hidden service requirements, or undeclared dependencies. Record runtime and host requirements, model/tool-call counts, and data/network access separately. Installation of executable skills grants the harness the execution permissions it already has, so make permission needs explicit and keep the interpreter allowlisted.

## 7. Compiler and fallback workflow

```text
Collect labeled trajectories
  → identify common structure and variable parameters
  → generate candidate IR + applicability contract
  → static type/graph/permission validation
  → development execution + independent postconditions
  → counterexample feedback to Nemotron
  → bounded revision or rejection
  → freeze candidate
  → held-out evaluator
  → register evidence and export
```

Hold-out data is not available to the compiler or tools. If a candidate fails a held-out evaluation and is revised using that feedback, treat the old test set as development data and create a new evaluation split.

Runtime decision: retrieve candidate → validate contract against parameters and source metadata → execute if supported → validate output. Unsupported or failed runs return `requires_reasoning` with a machine-readable reason. The app can explicitly invoke Nemotron; the exported offline-reasoning mode must never silently call it.

Do not learn a trusted skill from a failed trace simply because the model calls it successful. Preserve failed traces as counterexamples with independently determined labels.

## 8. APIs and interface

Proposed endpoints: `POST /tasks/run`, `GET /runs/:id`, `POST /skills/compile`, `GET /skills/:id`, `POST /skills/:id/execute`, `GET /skills/:id/export`, and `GET /jobs/:id/events` using SSE. Use job IDs and idempotency keys for long actions.

Five UI surfaces:

1. Task and data-source setup with connectivity status.
2. Trajectory view showing tool actions and outcomes.
3. Compilation view showing candidate revisions and failed checks.
4. Skill detail showing supported inputs, version, tests, and export.
5. Before/after comparison showing correctness, coverage, model calls, latency, and build cost.

Provide loading, cancellation, timeout, unavailable-provider, empty-data, and unsupported-input states. Display actual tool progress rather than fabricated percentage completion. Have one obvious primary action per screen. Use local execution for the hackathon before considering hosted deployment.

## 9. Evaluation protocol

Create a frozen seed/protocol before optimizing. Suggested bounded suite: 12 development cases; 24 unseen supported cases across both procedures; 12 unsupported/adversarial contract cases. If only one procedure ships, state the narrower coverage. Add variations in row order, dates, unseen identifiers, duplicates, missing records, and policy versions.

Compare:

- Original Nemotron agent on each new case.
- Exact-input response cache: demonstrates why new inputs require computation.
- Parameterized single-trajectory replay: tests whether multi-trace generalization adds value.
- Ember Forge compiled skill.
- A human-written reference procedure as a useful performance/correctness ceiling, not an AI competitor to hide.

Score exact canonical records, totals, and error outcomes using independent reference logic. Do not use an LLM as the sole judge. Count both false acceptance and needless fallback. Report `correct supported executions / all supported cases`, coverage, fallback rate, per-case calls, wall time, and compilation overhead.

Use an identical data snapshot for fairness; separately test live connector behavior. Repeat timing on at least five cases three times, separate cold startup from warm execution, and avoid p95 claims from tiny samples. Calculate break-even runs only when both baseline and compiled costs are measured and the per-run saving is positive.

Enforce the no-reasoning claim through a disabled provider and an instrumented client that fails on any attempted model call. A green UI counter alone is insufficient.

## 10. Sequenced implementation gates

| Phase | Work | Exit evidence |
|---|---|---|
| P0: readiness | Separate repository, lockfiles, credentials configuration, live Nemotron tool call, Zetaris query, pinned H-MEM reference | `docs/readiness.md` with real outputs and unresolved blockers |
| P1: truthful baseline | One task end to end, trace schemas, deterministic oracle, fixed fixtures | Correct baseline and retained failed example |
| P2: core compiler | Typed IR, generated candidate, static validator, executable interpreter | Candidate handles unseen development inputs; no answer hardcoding |
| P3: memory and boundaries | H-MEM retrieval, contract checks, invalidation, explicit fallback | Cold/warm and stale-skill tests |
| P4: package and evaluation | Candidate-specific portable Agent Skill export, isolated evaluator, baselines, harness matrix | Candidate-bound artifact passes format checks, runs from an unrelated working directory, and completes supported plus unsupported cases; at least two real harnesses discover and execute it before transfer is claimed |
| P5: product finish | UI, cancellation/recovery, onboarding, accessibility basics | Complete browser walkthrough and readable errors |
| P6: submission | Reproduction instructions, video, deck, results, licenses | Fresh-clone rehearsal and final checklist |

After P2, stop expanding if only exact recorded inputs work. Investigate parameterization rather than adding more task families. After P4, freeze features unless a correctness or submission blocker appears.

## 11. Calendar and coordination

Assume work starts 23 October; actual available working hours are not yet known. This is a dependency schedule, not a guarantee of completion in a few hours.

- **23 Oct:** P0 and P1; establish live integrations and the task oracle.
- **24 Oct:** P2 and P3; prove generation and reuse before investing in visual polish.
- **25 Oct:** P4; freeze evaluator, export, and run comparisons.
- **26 Oct:** P5 and reproduction fixes; freeze functional scope by evening.
- **27 Oct:** P6, record demo, verify submission fields, upload before 20:00 IST.

VRAM Rescue has its own milestones. Ember Forge needs no local GPU, so its development can coexist with GPU experiments. Do not silently spend both projects' API budgets on retries. Record daily status as completed evidence, failures, next gate, and scope cuts.

## 12. Quality gates and failure handling

- Missing sponsor access: continue fixture-based engineering, label it, and keep sponsor proof unresolved.
- Compiler produces invalid programs: keep the constrained IR; reduce the domain before allowing arbitrary code.
- Contract rejects everything: report low coverage; fix the contract rather than claiming perfect correctness.
- New source policy/schema: invalidate or revalidate; never silently reuse stale assumptions.
- User data contains instructions: treat them as data, never agent authority.
- Unexpected provider failure: preserve artifacts and return retryable state; do not fabricate success.
- Novelty weak: compare against replay and published work; emphasize measured boundaries and portability, not “first ever.”

## 13. Submission package and demo

Produce README, setup/doctor command, architecture diagram, supported scope, sponsor integration guide, measured results, limitations, third-party notices, deck, and a 1–4 minute video subject to final form verification. Never include secrets or redistribute restricted data.

Suggested video: 20 seconds problem; 40 seconds baseline; 50 seconds compilation and failures; 50 seconds unseen exported execution with model access disabled; 30 seconds unsupported case; 30 seconds measurements and sponsor roles. Use an edited replay for long compilation and clearly label it; keep an actual live execution available.

Track claim-to-evidence links in `docs/claims.md`: every number points to a run/protocol/artifact. Describe finite test results as measured observations, not guarantees.

## 14. Codex kickoff prompt

Paste this into a new Codex chat opened on the independent EmberForge project folder, with this plan available:

```text
Build Ember Forge according to docs/implementation-plan.md and
docs/product-description.md. This is an independent Track 3 project, not NeuroDBG
and not VRAM Rescue. First inspect the folder and applicable AGENTS.md files.
Preserve existing user work. Implement P0 through the later gates in order,
verifying each before expanding scope. Start with the typed task/trace/IR
contracts, a truthful baseline, and a bounded compiler, not a decorative UI.

Read and pin the actual Meterless H-MEM reference and required instructions;
implement it faithfully and retain license/provenance. Verify live Nemotron
and Zetaris connectivity when credentials are available. Never invent API
responses or count fixtures as live integration. Ask for missing secrets via
local configuration, never print them. Paid services require an agreed budget.

Generate executable parameterized IR, not cached answers. Keep independent
evaluation labels away from the compiler. Export a package that handles new
supported inputs with model access disabled and rejects unsupported cases.
Create docs/progress.md, docs/decisions.md, and docs/claims.md. Continue routine
local implementation autonomously; report concrete blockers and preserve
partial work. Do not create another chat, use subagents, publish, or submit
externally unless I authorize that action. Show commands actually run and
their results; do not describe planned capabilities as completed.
```

## 15. References and verification notes

Reviewed 23 October 2026. Recheck mutable APIs and pin compatible versions at P0.

- [Event, tracks, prizes and rules](https://hackathon.genai.works/event/open-agent-hackathon-2026).
- Organizer Build update supplied in this conversation: Cursor optional; working Meterless Engine required. Save an official current copy in the new repository when available.
- [Nemotron tool-calling API](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-super-vl-120b-a12b-infer): verify alias and account entitlement.
- [Meterless H-MEM](https://github.com/Meterless/Meterless/tree/main/engines/hmem): authoritative implementation/reference/conformance entry point.
- [Meterless engine guide](https://meterless.ai/engines.html): onboarding; its example dates may be stale, so use event dates above.
- [Zetaris connectors](https://kbase.zetaris.com/knowledge/connect) and [REST API](https://kbase.zetaris.com/knowledge/rest-api): verify tenant-specific auth and endpoints.
- [SKILL-DISCO paper](https://arxiv.org/abs/2606.26669): related work, not evidence of our own performance.

No deployment, account provisioning, benchmark execution, or implementation is performed by this document.
