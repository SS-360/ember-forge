# Ember Forge — Project Description

Prepared: 23 October 2026; updated 27 October 2026. For the plain-language story, current build details, sponsor review, and reproducible evidence, see [product story](product-story.md), [how it works](how-it-works.md), [sponsor integration review](sponsor-integration-review.md), and [run and evidence guide](run-and-evidence.md).
Intended submission: Track 3 — Reasoning Architecture, Open Agent Hackathon 2026.

## The idea in one sentence

Ember Forge turns examples of repeated agent work into a reusable skill, checks whether each new input fits, and refuses cases outside the skill's rules.

## The problem

An AI agent may repeatedly perform the same kind of work: inspect a dataset, find the relevant records, join information from another source, calculate results, validate them, and produce a report. Although the inputs change, much of the procedure stays the same.

Today, an agent can spend model calls rediscovering that procedure on every run. Saving the previous answer does not solve this: the next input is different. Saving a natural-language instruction still requires a model to interpret it.

Ember Forge asks a different question: can the useful procedure become an ordinary program, with explicit conditions for when it works?

## What the user receives

The user supplies a task, access to approved data sources, and examples of correct behavior. Ember Forge observes actual agent executions, proposes a reusable procedure, tests it, and exports an installable Agent Skill. The primary artifact follows the open Agent Skills folder format so compatible agent harnesses can discover its `SKILL.md` and invoke its bundled, bounded runner. A standalone CLI is included as a secondary way to run the same procedure.

The portable package contains:

- A standard `SKILL.md` with activation guidance, supported task scope, inputs, outputs, runtime requirements, permissions, failure behavior, and relative links to package resources.
- A parameterized executable procedure and the small trusted runtime needed to execute it.
- A supported-input contract: required schemas, versions, parameters, and business assumptions.
- Tests and a verification report describing what was checked.
- Example data-source bindings that contain no embedded credentials.
- An explicit response for unsupported inputs, rather than a fabricated result.
- Provenance and measurements comparing the skill with the original reasoning workflow.

The same package can be installed into compatible agents such as Codex, Claude Code, OpenClaw, and Hermes. A harness-specific plugin manifest or connector is added only where that host requires it, and compatibility is claimed only after format, discovery, invocation, and execution are verified separately. The exported procedure can execute without a reasoning-model call for supported inputs; agent-side selection may still use model tokens, and live data access may still require a configured tool or network connection. “No reasoning endpoint” does not automatically mean “no network.”

## An example

Consider a recurring stock-reconciliation task. Orders are in a database, inventory snapshots are in a file source, and a versioned table defines unit conversions and product aliases.

An agent initially investigates how these sources relate. It learns that some quantities are recorded in boxes, others in individual units, and cancelled orders should be excluded. It queries records, normalizes quantities, joins product identities, aggregates demand, and reports shortages.

Ember Forge examines several executions and generates a procedure that accepts a date range and warehouse identifier. The procedure performs the same operations on new records without asking an LLM to reconstruct the workflow.

If a supplier introduces an unknown unit, the exported skill rejects it as `UNKNOWN_UNIT`. The current library path does not automatically fall back to reasoning. A person can start a separate original-agent run in the app to investigate the data.

The stock-reconciliation path is now implemented on synthetic records. Local Zetaris reads were saved as receipt-bound snapshots, used in original Nemotron agent runs, and passed into skill creation. Nemotron generated the `zetaris-stock-207ca2ab-retry-3@0.1.0` candidate; it passed 21/21 development cases and is included in the demo kit. H-MEM is used in the Skill Library. Codex and Claude Code explicitly ran an earlier package; Hermes and OpenClaw automatically selected the same newer package once each on supported synthetic inputs. See the [proof index](run-and-evidence.md) for exactly what each result establishes.

## How the system works

1. **Observe:** Nemotron chooses from a fixed list of approved data actions; Ember Forge records the action, result, and outcome.
2. **Propose:** Nemotron turns selected successful and counterexample traces into a typed procedure candidate.
3. **Check:** an independent stock evaluator tests the candidate. Failed revisions remain visible.
4. **Package:** passing procedures ship with instructions, accepted inputs, runner, examples, verification, and provenance.
5. **Reuse:** compatible hosts can select the skill and run its procedure on new supported JSON snapshots.
6. **Refuse safely:** changed schemas, policies, or unknown values produce a stated reason instead of a guessed result.

## Why this is an agent project

Nemotron makes one structured tool choice at a time during the original task and proposes one structured skill candidate during compilation. Ember Forge executes only approved actions and checks the result with an independent evaluator. Deterministic checks, rather than Nemotron's own approval, decide whether a candidate qualifies for export. See [how the agent is built](how-it-works.md).

## Sponsor roles

| Technology | Working role |
|---|---|
| NVIDIA Nemotron | Chooses original-agent actions and proposes skill candidates from selected traces. |
| Zetaris | Reads approved local sources when Ember Forge creates the receipt-linked snapshots used in agent runs and compilation. The exported skill does not query Zetaris at runtime. |
| Meterless H-MEM | Powers verified-skill registration, retrieval, and stale-schema/policy invalidation in the local Skill Library. |
| Codex | Development tool used to implement and verify the product; not a required dependency of the exported skill. |

H-MEM is a specified memory architecture with a reference implementation, not simply a label for a custom cache. The implementation must follow a pinned upstream version and demonstrate real use. See the [official H-MEM documentation](https://github.com/Meterless/Meterless/tree/main/engines/hmem).

## Evidence and limits

The current demo includes the local Zetaris source step, original Nemotron runs, a generated skill with 21/21 finite development checks, H-MEM reuse evidence, and host execution. The [run guide](run-and-evidence.md) links the exact inputs and records. The Zetaris-origin export runs offline from its included snapshot. Host evidence is deliberately scoped: one package has supported automatic-selection runs in Hermes and OpenClaw; Codex and Claude Code explicitly ran an earlier package.

In a separate synthetic comparison, the executable passed 27/27 repeated invocations with zero model requests; the instruction-only version used 33 requests, and the original agent passed 24/27. Compilation and orchestration costs are not included in that execution comparison, so no total dollar savings or break-even point is claimed. Real-world accuracy, broad generalization, production readiness, and sponsor endorsement remain unverified. See [evaluation details](live-verification.md) and the [claims ledger](claims.md).

## Boundaries and originality

Ember Forge does not train a smaller model, quantize model weights, or optimize GPU memory. It compiles a bounded procedure. Its first release supports structured, read-only data workflows, not arbitrary browser automation or unrestricted generated code.

Portable agent skills and task-specific automation already exist. Ember Forge's project aim is to join recorded tool activity, explicit input rules, independent checks, and a self-contained runnable export in one workflow. Related research includes [SKILL-DISCO](https://arxiv.org/abs/2606.26669). Our current result is limited to one learned stock-reconciliation task; broad generalization remains future work.

This is an independent project, not a NeuroDBG extension. Track 3 is the intended fit because the central contribution is turning experience and reasoning into reliable execution. See the [official event tracks](https://hackathon.genai.works/event/open-agent-hackathon-2026).

## Short submission draft

Ember Forge turns repeated agent work into portable, executable Agent Skills. Nemotron investigates real task trajectories, identifies reusable procedures, and generates parameterized programs. Independent tests establish which inputs each program supports. Meterless H-MEM retrieves validated skills and their applicability evidence, while Zetaris connects the fragmented data those skills operate on. Supported tasks then run through a trusted bounded runner without repeated reasoning for the procedure; unfamiliar cases are explicitly rejected or escalated. The product exports a standard `SKILL.md` bundle, executable procedure, contract, tests, provenance, and measured performance for installation into compatible agent harnesses. A standalone CLI remains available for direct use.

Implementation details: [Ember Forge Implementation Plan](implementation-plan.md).
