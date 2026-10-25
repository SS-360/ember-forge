# Pocket Forge — Project Description

Prepared: 23 October 2026. Status: product brief; see [progress](progress.md) and [claims](claims.md) for implementation and measured evidence.
Intended submission: Track 3 — Reasoning Architecture, Open Agent Hackathon 2026.

## The idea in one sentence

Pocket Forge is an agent that converts repeated reasoning into a reusable executable skill, checks when that skill is applicable, and falls back to reasoning when it is not.

## The problem

An AI agent may repeatedly perform the same kind of work: inspect a dataset, find the relevant records, join information from another source, calculate results, validate them, and produce a report. Although the inputs change, much of the procedure stays the same.

Today, an agent can spend model calls rediscovering that procedure on every run. Saving the previous answer does not solve this: the next input is different. Saving a natural-language instruction still requires a model to interpret it.

Pocket Forge asks a different question: can the useful procedure become an ordinary program, with explicit conditions for when it works?

## What the user receives

The user supplies a task, access to approved data sources, and examples of correct behavior. Pocket Forge observes actual agent executions, proposes a reusable procedure, tests it, and exports an installable Agent Skill. The primary artifact follows the open Agent Skills folder format so compatible agent harnesses can discover its `SKILL.md` and invoke its bundled, bounded runner. A standalone CLI is included as a secondary way to run the same procedure.

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

Pocket Forge examines several executions and generates a procedure that accepts a date range and warehouse identifier. The procedure performs the same operations on new records without asking an LLM to reconstruct the workflow.

If a new supplier introduces an unknown unit, the input contract rejects that case. In the application, the user can choose to send it back to Nemotron for investigation. In a standalone export with reasoning disabled, it returns a structured “unsupported” result. It does not guess a conversion.

This is the target product example. The current implementation covers synthetic stock reconciliation, a hand-authored seed, strict normalized trace import, deterministic assembly of agreeing operation graphs, and standard Agent Skills export with a bounded runner and trace lineage. Its replay examples are captured from the seed interpreter. It does not yet learn a new algorithm from agent trajectories, demonstrate live Nemotron/Zetaris access, or prove installation and execution in external agent harnesses. Those remain implementation milestones.

## How the system works

1. **Observe:** record real tool calls, inputs, outputs, failures, and independently checked outcomes.
2. **Generalize:** Nemotron identifies common operations and differences that must become parameters or branches.
3. **Compile:** express the procedure in a bounded executable representation, then package it with a runtime and standard Agent Skills entrypoint.
4. **Verify:** test correctness on development examples, new inputs, and deliberately unsupported cases.
5. **Reuse:** install the package into a compatible agent harness, select it only when its applicability checks pass, and run the bundled procedure. For direct deterministic operation, callers may invoke the runner without agent orchestration.
6. **Revise:** a failure or changed assumption creates a new candidate version; it does not silently alter a validated skill.

## Why this is an agent project

Nemotron decides what evidence to inspect, what reusable structure to propose, which failures need investigation, and when a candidate should be revised or rejected. The system carries out tool calls and produces executable artifacts. Deterministic checks, rather than Nemotron's own approval, determine whether a candidate qualifies for export.

## Sponsor roles

| Technology | Working role |
|---|---|
| NVIDIA Nemotron | Investigates trajectories, generates candidate skill programs and contracts, and revises candidates using test feedback. |
| Zetaris | Provides approved queries across separate operational data sources for the original workflow and live skill execution. |
| Meterless H-MEM | Stores and retrieves skill records, evidence references, applicability conditions, failures, and superseded versions. |
| Codex | Development tool used to implement and verify the product; not a required dependency of the exported skill. |

H-MEM is a specified memory architecture with a reference implementation, not simply a label for a custom cache. The implementation must follow a pinned upstream version and demonstrate real use. See the [official H-MEM documentation](https://github.com/Meterless/Meterless/tree/main/engines/hmem).

## What would make the demonstration convincing

Run the original workflow with Nemotron, compile a skill, install it into a different supported harness, and execute new supported inputs without Pocket Forge running. Then submit an unsupported input and show a clear refusal or an explicit reasoning fallback. Demonstrate end-to-end discovery and execution in at least two real harnesses before claiming cross-harness transfer.

Show correctness, skill coverage, false acceptance, needless fallback, model/tool calls, compilation cost, break-even reuse count, and latency together. Report standalone runner cost separately from any agent orchestration. A system that rejects every input is not successful; neither is one that accepts everything and returns incorrect results.

## Boundaries and originality

Pocket Forge does not train a smaller model, quantize model weights, or optimize GPU memory. It compiles a bounded procedure. Its first release supports structured, read-only data workflows, not arbitrary browser automation or unrestricted generated code.

Executable skill induction has prior research, including [SKILL-DISCO](https://arxiv.org/abs/2606.26669). Our proposed contribution is a usable workflow with explicit applicability contracts, independently measured generalization, controlled fallback, and portable Agent Skills exports that carry executable bounded procedures across harnesses. Those benefits must be demonstrated; they are not established yet.

This is an independent project, not a NeuroDBG extension. Track 3 is the intended fit because the central contribution is turning experience and reasoning into reliable execution. See the [official event tracks](https://hackathon.genai.works/event/open-agent-hackathon-2026).

## Short submission draft

Pocket Forge turns repeated agent work into portable, executable Agent Skills. Nemotron investigates real task trajectories, identifies reusable procedures, and generates parameterized programs. Independent tests establish which inputs each program supports. Meterless H-MEM retrieves validated skills and their applicability evidence, while Zetaris connects the fragmented data those skills operate on. Supported tasks then run through a trusted bounded runner without repeated reasoning for the procedure; unfamiliar cases are explicitly rejected or escalated. The product exports a standard `SKILL.md` bundle, executable procedure, contract, tests, provenance, and measured performance for installation into compatible agent harnesses. A standalone CLI remains available for direct use.

Implementation details: [Pocket Forge Implementation Plan](implementation-plan.md).
