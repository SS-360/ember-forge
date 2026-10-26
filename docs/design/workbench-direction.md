# Ember Forge — Skill compilation workbench

Status: concepts approved by the user on 23 October 2026. The accepted references are `accepted-compilation-workspace.png` and `accepted-verification-export.png`. This document supersedes the generic dashboard composition in the historical `task-setup.png`, `execution-history.png`, `skill-compiler.png`, `verification.png`, and `skill-library.png` screenshots as the active visual target. Keep those files as historical artifacts only.

## Product interaction hierarchy

1. **Choose a compilation session and evidence.** Start from real successful and failed execution traces. In the current build, show only the available synthetic stock-reconciliation fixture runs and label their source and executor clearly.
2. **Compare observed runs.** Place the successful reconciliation beside the `UNKNOWN_UNIT` counterexample. Preserve the input, outcome, structured reason, source mode, and run ID available in each artifact.
3. **Inspect the candidate procedure.** Show the bounded operations, contract and identity as the artifact being compiled. The present seed is hand-authored; do not imply that it was learned from the fixture runs.
4. **Inspect evidence lineage.** Selecting a procedure operation should show supporting run/case links only when the data model contains them. The present artifacts have coarse trace steps and no IR-to-run mapping, so report “No operation-level trace links recorded” rather than drawing connections.
5. **Verify supported and unsupported cases.** Show the finite suite, actual outcomes, structured rejection reasons, and result rows. The current suite is synthetic development evidence, not held-out evaluation. A selected case must not expose private holdout labels to a compiler.
6. **Export the concrete artifact.** Preview `SKILL.md`, `skill.json`, `contract.json`, the bounded runtime, examples, tests, verification, and provenance. Enable download only for a current verified candidate. Show local format/runtime checks separately from host installation and discovery, which remain unverified.

## Screen composition

### Compilation workspace

- Compact single-row top bar: Ember Forge wordmark, selected session/skill, source-mode and provider-readiness text, and the verified export action when available.
- No persistent five-item navigation sidebar. Use a compact trace list at the left edge of the workspace, not another navigation/status column.
- Primary canvas split into **Run evidence** and **Candidate procedure**. Keep the run list compact and selected-run details inspectable. Keep the candidate operations legible and selectable.
- A narrow contract strip exposes source mode, policy, schema versions, row limit and runtime limit without a second full-height card column.
- A selection inspector shows the selected operation/case and its real provenance or an explicit missing-link message.
- Main action hierarchy: select evidence, inspect the procedure, verify the candidate, then export. Do not use a generic task form or a giant “Compile” button as the opening state.

### Verification and export

- Keep the same compact session header and identity so the state reads as the same compilation session.
- Results occupy the main area: supported cases, rejected unsupported cases, reasons, and actual failures. Selecting a case shows its supplied input, expected contract behavior, observed result, and run linkage only if recorded.
- A distinct artifact area previews the actual downloadable file tree and the `SKILL.md` text. Include the usable download action only when the API can return the current verified candidate.
- Label the finite fixture scope and the per-host status. Never imply a plugin bundle, host discovery, or an end-to-end harness result where none exists.

## Current truthful content

- Successful fixture run `16cefa74-1534-40f9-931c-8a35ab4904c4`: `WH-01`, 20–23 October 2026, `stock-v1`; output `CUP-RED` demand 25 / on hand 15 / shortage 10 and `MUG-BLUE` demand 5 / on hand 8 / shortage 0.
- Unsupported fixture run `5b6d3eb4-7537-43f0-8105-c98deafaa61d`: `UNKNOWN_UNIT`; the trace ends at the fixture reconciliation step.
- Candidate `stock-reconciliation` `0.1.0` is a provided hand-authored draft. Current finite verification has 2/2 supported examples correct, 5/5 unsupported examples rejected, 0 false acceptances, and 0 needless fallbacks. This does not establish representative generalization.
- The Agent Skills folder export and bounded offline runtime are implemented and checked. Codex/Claude Code/OpenClaw/Hermes install, discovery and invocation have not been exercised as real host flows.

## Visual system

Use a frontier AI lab research-workbench direction, without copying a specific lab's logo, proprietary interface, or exact layout:

- Cool neutral canvas: near-white workspace, soft graphite dividers, and charcoal text. Use restrained electric blue and violet for active selections, code focus, and verified state; use warm amber only for actionable warnings.
- Contemporary sans-serif hierarchy for interface text and a legible technical monospace for trace IDs, versions, code, schema values, and hashes. Avoid decorative serif display typography.
- A compact research-tool header, precise alignment, high information density, and generous space around the core transformation. Prefer trace lists, code/procedure panes, contract tables, and inspectors over repeated cards.
- Use subtle depth only to separate the active editor/inspector from the canvas; avoid glow, glass, gradients, ornamental AI motifs, and fake terminal overlays.
- Keep native controls, readable data, visible focus, responsive stacking, and status text that does not rely on color alone.
- Do not reuse the rejected dark left rail, orange primary buttons, decorative metric cards, filler badges, or generic dark “AI command center” styling.

## Accepted concept implementation inventory

The user approved both generated concept states. They are the layout and visual reference; keep visible values tied to the local API and the finite development suite.

- **First viewport copy:** Ember Forge; Skill compilation; candidate `stock-reconciliation` v0.1.0; Development seed; Export skill; Synthetic fixtures · fixture_reference · no live provider; Runs; Run evidence; Execution steps (coarse trace); Output (result); Bounded procedure · hand-authored seed; Parameters / contract; Inspector; Compare selected runs; Verify candidate.
- **Verification copy:** Skill compilation / Verification; finite development suite (7 cases), not a measure of generalization; Verification cases; Case detail; Package preview; `SKILL.md`; Download Agent Skill; Host compatibility; Agent Skills folder package, not a plugin marketplace bundle.
- **Canvas:** near-white cool gray (#f7f9fc estimated), white work surfaces, thin graphite-blue dividers (#d7dee8), deep charcoal/navy text (#101c30), muted slate secondary text (#52647e). Use saturated blue (#1769e8 estimated) for primary action and active selection, violet only for secondary code focus, green/red for outcomes, amber for evidence limitations. No gradients, glow, or warm paper tint.
- **Typography:** system sans for interface (`Inter, ui-sans-serif, system-ui` fallback); `ui-monospace, SFMono-Regular, Consolas` for IDs, schema values, versions, and code. H1 20–22px, section headings 15–17px, body 12–14px, labels/captions 10–12px; keep controls at a deliberate 12–14px.
- **Spacing and containers:** 20px outer desktop gutter, 8px spacing unit, 1px dividers, 4–6px control radii, compact table rows. Keep the data canvas open; use borders for structural separation, not nested card decoration. Desktop primary workspace uses trace list / evidence / procedure columns; below 1120px stack evidence and procedure; below 760px stack all panes and keep tables horizontally scrollable.
- **Controls and states:** concise compact header, two-state workbench/verification switch, disabled export with a visible reason when verification is stale, selected trace with a blue edge and light fill, keyboard-visible blue focus ring, explicit success/unsupported labels with icons and text. Maintain selected run and case details on narrow layouts.
- **Existing capabilities to retain:** recording a fixture run remains available from a compact dialog; run history becomes the trace list; candidate contract and assumptions remain inspectable; verification can be rerun; the verified Agent Skills archive remains downloadable; the package panel states which host installation checks are still unverified.
- **Intentional data corrections to the concepts:** show trace steps only as stored, coarse steps and do not invent operation timings; display the actual seven bounded verification cases and their real IDs; avoid exposing case inputs unless supplied by the API; state the actual host compatibility evidence rather than inferred readiness.

The initial concept pass was concept-only. After user approval, implement the two approved states in code, preserve existing functionality, and record any data-driven deviations from the screenshots here.

## Acceptance review

At first glance, a reviewer should see selected traces being transformed into a bounded procedure, understand why supported inputs can execute and why the new-unit case is rejected, see what evidence is missing, and obtain the actual Agent Skills package. If the opening view reads as a form, activity ledger, or generic dashboard with a “Compile” button, the design has failed.
