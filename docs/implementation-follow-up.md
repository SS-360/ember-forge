# Ember Forge — implementation follow-up

Review date: 23 October 2026; implementation update: 25 October 2026 (Asia/Calcutta)
Project: independent Track 3 entry. Do not merge with VRAM Rescue or NeuroDBG.
Decision: the primary output is a portable Agent Skills package for Codex, Claude Code, OpenClaw, Hermes, and other compatible harnesses. A standalone CLI remains a secondary interface. Skill-file generation alone is not the product differentiator; the export must carry a bounded executable procedure, applicability contract, tests, evidence, and provenance.

This checklist reconciles the product decision with the inspected implementation. It is ordered by dependency and judged by evidence. A format that looks compatible is not counted as installation, discovery, invocation, or correct execution.

## Review findings

- The local React/Fastify workbench and verification/export application, typed contracts, bounded interpreter, H-MEM integration, and portable export path exist.
- Candidate-specific export includes contracts, finite verification, bounded runtime, examples, hashes and lineage. Historical checks passed before the latest continuation; the 45-test count is not a current-source suite result. On 25 October the user chose implementation only. See release-readiness.md for pending validation.
- The saved evaluation is 10/10 on a small synthetic smoke split: four supported cases and six rejected cases. It is not a representative held-out evaluation.
- `packages/compiler/src/index.ts` validates supplied drafts. `trace-compiler.ts` now assembles an exact common operation graph from sanitized development traces, with independent verification and lineage. This is a parameterized replay baseline; algorithm synthesis and Nemotron generation remain unfinished.
- `apps/api/src/index.ts` uses a deterministic fixture reference. Live Nemotron and Zetaris outputs are not evidenced.
- The exporter accepts a candidate directory, checks identity, schemas, report hash, test manifest, and result evidence, and writes an Agent Skills package with a candidate-named archive root. The API now requires the current candidate hash to download the matching export.
- `packages/runtime/src/export-cli.ts` now resolves skill and contract assets relative to the runtime package and resolves input/output paths relative to the caller's current working directory.
- The runtime no longer emits fabricated model-call metadata. The child-process package checks instrument common Node network entry points; they are not an OS-level sandbox or proof that every possible network path is blocked.
- No live provider credentials or approved spend ceiling are recorded. No live provider call has been made.
- Historical browser checks cover import, assembly, verification, lineage and download. The downloaded archive passed its verifier at that time. Current Apple/amber-red screenshots exist. New completion receipts require an explicit re-export; no current export check, live provider evidence or multi-host invocation is claimed.

## Prioritized checklist

### Review execution priorities — 23 October

1. **Scoped UX and correctness:** move the existing compilation composer into the first viewport; distinguish normalized compiler inputs from coarse fixture-run comparison; derive procedure descriptions from typed semantics; improve readable control/evidence text. Implemented, with real desktop/390px captures; interaction checks continue as related work lands.
2. **Bounded synthesis:** retain exact graph assembly as a baseline and implement an injectable generation/repair controller with distinct provenance, cancellation, attempt/call/token/time limits, and transport failures. Use fake transports only for offline development; live evidence requires configured credentials and approved spending.
3. **Independent evaluation:** build compilation/development/frozen splits now, with source lineage and input-hash overlap rejection. Sponsor readiness is not a dependency for offline evaluator work. Keep holdouts and oracle implementation outside generator/repair context.
4. **Consequential memory:** wire verified-candidate registration and applicability-checked warm retrieval into an application execution path, preserving cold/warm/invalidation evidence.
5. **Host/live gates:** continue from proven Codex discovery to isolated supported/unsupported invocation in two harnesses only under the required provider/spend authorization. Prepare connector contracts offline; retain unverified statuses until real responses exist.

### P0 — installable, candidate-specific Agent Skills export

- [x] **1. Reconcile the product decision and plan.**
  Spec ref: `product-description.md > What the user receives`; `implementation-plan.md > Portable Agent Skills and harness compatibility`.
  What to build: Make installable Agent Skills the primary artifact and keep direct CLI execution secondary. Record the real current gaps and the following work in this checklist.
  Acceptance: Product brief, implementation plan, and this checklist agree on artifact and completion criteria.
  Verify: Read the three documents and check that none claims current harness support without evidence.

- [x] **2. Generalize export around a verified candidate.**
  Spec ref: `implementation-plan.md > Compiler and fallback workflow`; `implementation-plan.md > Portable Agent Skills and harness compatibility`.
  What to build: Accept a selected candidate's ID/version and candidate directory or registry record; bind the export to its current skill, contract, tests, verification, and provenance hashes. Remove fixed IDs, versions, and source directories from the exporter. Reject stale, rejected, or incomplete verification.
  Acceptance: Two different verified candidate IDs/versions produce distinct, correctly identified bundles; a modified artifact cannot reuse stale verification.
  Verify: Export both candidates, inspect their manifests and hashes, and attempt export with a stale verification report.

- [x] **3. Produce a standards-compliant portable skill folder.**
  Spec ref: `implementation-plan.md > Portable Agent Skills and harness compatibility`.
  What to build: Add valid `SKILL.md` YAML frontmatter and accurate activation/non-activation conditions, supported inputs, outputs, runtime/dependencies, permissions, failure behavior, and relative resource links. Bundle the trusted runner, contract, tests, verification report, candidate provenance, example bindings, and setup guide. Keep host metadata versioned and separate from the standards-only core.
  Acceptance: The name matches the parent directory; required metadata validates against the Agent Skills specification; all bundled links resolve; no credentials, machine-specific absolute paths, or undeclared dependencies are present.
  Verify: Run a format validator, unpack the artifact in a clean directory, and inspect every referenced resource.

- [x] **4. Make exported execution independent of caller working directory.**
  Spec ref: `implementation-plan.md > Portable Agent Skills and harness compatibility`.
  What to build: Resolve bundled `skill.json` and `contract.json` relative to the runtime module/package. Keep input and output paths relative to the calling process directory. Return actionable errors for missing runtime/assets and malformed inputs.
  Acceptance: The packaged runtime succeeds from an unrelated directory and a path containing spaces; input/output path semantics are documented.
  Verify: Run the bundle from a temporary unrelated working directory whose path contains spaces.

- [x] **5. Verify packaged error and boundary behavior.**
  Spec ref: `implementation-plan.md > Data and execution contracts`; `implementation-plan.md > Evaluation protocol`.
  What to build: Add package-level checks for missing bundled assets, malformed input JSON, schema drift, policy drift, unsupported units, and invalid output paths. Keep model/provider calls disabled and do not infer call counts from result metadata.
  Acceptance: Every invalid or unsupported runtime input exits nonzero with a stable machine-readable reason; supported outputs match an independent expected result; the runner has no provider client or non-Node runtime dependency.
  Verify: The exported-package check runs a child process from a temporary working directory containing spaces and covers each case. A missing executable cannot return an application-level JSON reason. The Node monkeypatch is an instrumentation check, not an OS sandbox.

- [ ] **6. Establish and prove harness compatibility.**
  Current partial implementation: Codex CLI 0.163.0 installs/discovers the generated candidate in an isolated repository skill directory, returning enabled=true and scope=repo through its local app-server API. No thread, turn or inference was requested. Invocation and execution through the host, and every gate in a second harness, remain open. Claude Code 2.1.309 is installed but untested.
  Spec ref: `implementation-plan.md > Portable Agent Skills and harness compatibility`.
  What to build: Track format validation, installation/discovery, invocation, and correct execution separately for Codex, Claude Code, OpenClaw, and Hermes. Add only the host-specific metadata required by official documentation.
  Acceptance: At least two real harnesses install/discover the exported skill, invoke it on a new supported input without Ember Forge running, and display an actionable rejection for an unsupported case. Other untested hosts remain `unverified`.
  Verify: Preserve harness version, installation steps, prompts/commands, inputs, outputs, and logs in `docs/skill-compatibility.md`.

### P0 — demonstrate compilation from experience

- [ ] **7. Ingest labeled execution traces safely.**
  Current partial implementation: immutable traces, separate local snapshots, hash/metadata checks and independent operation replay are implemented. Empty-call applicability failures now have explicit recording/replay support; these new branches are unverified. Genuine original agent recordings remain outstanding.
  Spec ref: `implementation-plan.md > Data and execution contracts`; `implementation-plan.md > Compiler and fallback workflow`.
  What to build: Define typed trace records for task, redacted inputs/hashes, source and policy versions, tool calls/outcomes, output artifacts, failures, and independent labels. Keep raw provider logs separate; redact credentials and sensitive fields.
  Acceptance: Multiple successful and failed traces can be imported, validated, linked to evidence, and replayed without exposing secrets.
  Verify: Schema tests plus a sanitized multi-trace fixture round trip.

- [ ] **8. Generate a new bounded candidate from multiple traces.**
  Current partial implementation: assembly baseline, bounded synthesis/repair, typed transport, server-owned zero-cost/metered authorization, persistent quotas, durable checkpoints and cancellation exist. Test provenance is explicit. No enabled authorization was created under the $0 ceiling. Runtime/concurrency/error checks, actual free entitlement/credentials and model-learning evidence remain open.
  Spec ref: `implementation-plan.md > Compiler and fallback workflow`.
  What to build: Add an injectable Nemotron candidate-generation adapter that receives sanitized development traces, emits the existing typed IR and contract, and uses bounded time/token/retry limits, cancellation, and an explicitly approved spend ceiling. Keep arbitrary generated scripts out of the runtime.
  Acceptance: The candidate is genuinely produced from traces, with visible lineage and accepted/rejected revisions; it is not the existing hand-authored answer mislabeled as learned.
  Verify: First use a deterministic mock adapter and contract tests; use live Nemotron only after credentials, entitlement, and budget are explicitly configured.

- [ ] **9. Prevent evaluation leakage and prove generalization.**
  Current partial implementation: distinct 3-case compilation/21-case development/fresh 21-case frozen synthetic partitions, hash/content overlap gates, separate evaluator context and retained first frozen result are implemented. The assembled v2 candidate passed all development/frozen cases. Real model candidates and independently sourced real-world generalization remain unproved.
  Spec ref: `implementation-plan.md > Evaluation protocol`.
  What to build: Keep independent oracle code and final labels out of compiler context. Generate varied supported inputs and visible failures/revisions; freeze new holdouts after development.
  Acceptance: A newly generated candidate passes unseen supported cases and explicitly rejects known unsupported cases. Reusing failed held-out feedback creates a new holdout before further claims.
  Verify: Record candidate lineage, split hashes, compiler-visible inputs, and independent evaluation output.

### P1 — establish measured advantage and complete live integrations

- [ ] **10. Compare against fair baselines and account for compilation cost.**
  Spec ref: `implementation-plan.md > Evaluation protocol`.
  What to build: Compare fresh agent reasoning, instruction-only skill, exact-answer cache, parameterized replay, compiled skill, and a human-written procedure where useful. Measure correctness, false acceptance, needless fallback, model/tool calls, tokens, wall time, export/compile overhead, and break-even reuse count.
  Acceptance: Results use identical data snapshots, independent expected results, and at least five timing cases repeated three times. Report orchestration overhead separately from standalone execution; avoid unsupported p95 claims.
  Verify: Freeze the protocol/split and regenerate the report from a fresh clone.

- [ ] **11. Strengthen no-reasoning and memory evidence.**
  Current partial implementation: actual app library registration, verified hash/applicability checks, H-MEM retrieval, warm new-input execution and policy deprecation are evidenced through the UI/API. OS-level network isolation and live compilation-to-warm-reuse evidence remain open.
  Spec ref: `implementation-plan.md > Meterless H-MEM`; `implementation-plan.md > Evaluation protocol`.
  What to build: Instrument all model clients and use an actual network-isolated runtime where available. Show H-MEM cold compilation, warm retrieval of only verified applicable skills, provenance, and schema/policy invalidation.
  Acceptance: Provider calls fail the run if attempted in offline mode; the product demo shows reuse and stale-policy rejection. Upstream H-MEM conformance alone is not treated as product proof.
  Verify: Preserve runtime/network test configuration, client call logs, H-MEM evidence IDs, and product-level outputs.

- [ ] **12. Verify live Nemotron and Zetaris when ready.**
  Current partial implementation: typed provider and tenant transport interfaces, bounded source pagination/snapshot/cleanup orchestration and disabled readiness gates exist. There is no live provider or tenant evidence; authorization is $0 and free access is unconfirmed.
  Spec ref: `implementation-plan.md > Sponsor integration contracts`.
  What to build: Validate a real Nemotron typed tool call and real Zetaris reads across two registered sources. Capture sanitized request/usage IDs, query/source/version identifiers, pagination completeness, restart-safe evidence, timeouts, and cancellation.
  Acceptance: Live outputs are distinguishable from fixtures and reproducible. Missing credentials or a tenant contract keep this item blocked; do not guess endpoints or make paid calls without a configured approval ceiling.
  Verify: Update `docs/readiness.md` and evidence files only with actual responses; preserve secret redaction.

### P2 — make the transfer demo judge-ready

- [ ] **13. Rehearse the cross-harness story from a fresh clone.**
  Spec ref: `implementation-plan.md > Submission package and demo`.
  What to build: Demonstrate repeated work, compilation, verification, installation in another harness, new supported execution, measured improvement, then a changed policy causing safe refusal. Prepare setup, architecture, claim/evidence and limitation materials, a short demo, and deck.
  Acceptance: A clean checkout reproduces the artifact and demo without hidden state; the story leads with reconciliation work and labels any fixture or edited-replay evidence.
  Verify: Follow the README from a fresh clone, capture commands/results, and recheck the official submission form and deadline before any external submission.

## External references

- [Agent Skills specification](https://agentskills.io/specification)
- [Codex skill building](https://learn.chatgpt.com/docs/build-skills)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [OpenClaw skills](https://docs.openclaw.ai/tools/skills)
- [Hermes skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
- [Open Agent Hackathon 2026](https://hackathon.genai.works/event/open-agent-hackathon-2026)

## Approval gates and current blockers

Local documentation, package code, fixtures, test code, and compatibility research can proceed under the existing build authorization. Do not make billable Nemotron calls, purchase resources, change OS/driver settings, expose public endpoints, or submit externally without the applicable approval. Live sponsor evidence depends on credentials and an approved spend ceiling. Cross-harness evidence depends on access to at least two real harness installations; absence of an installation means `unverified`, not supported by assumption.
