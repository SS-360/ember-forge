# UI fidelity and responsive review

Updated 24 October 2026 against the two user-approved concepts in this folder.

## Latest user direction: Apple Design

The user subsequently requested the apple-design skill and a UI modification. The resulting system typography, translucent toolbar, spring navigation, simplified compilation controls and consistent working surfaces supersede the earlier visual direction. See [Apple interface notes](apple-interface.md) and the actual [desktop](apple-desktop.jpg), [phone](apple-phone.jpg) and [modal](apple-sheet.jpg) captures. Current phone measurements are 390×844 CSS px with no document overflow and compile bottom y781. Screenshot capture is working again. The sections below retain the earlier concept comparison as history, not current visual requirements.

## Accepted references

- Compilation workspace concept: accepted-compilation-workspace.png
- Verification and export concept: accepted-verification-export.png
- The user requested a frontier AI lab workbench direction and explicitly rejected the SS-360 design skill. No SS-360 styling was applied.

## Implementation comparison

| Comparison point | Accepted concept | Implementation |
| --- | --- | --- |
| Overall layout | Compact header, source banner, trace list, evidence pane, procedure pane; separate verification/export state | Implemented in App.tsx, RunEvidence.tsx, ProcedurePane.tsx, and VerificationExport.tsx; the previous five-page rail was removed |
| Palette | Cool near-white canvas, graphite dividers/text, restrained blue selections and actions | Implemented with CSS variables in styles.css; violet only marks the selected procedure code |
| Typography | Sans interface, monospace IDs/schema/code, no decorative serif | Implemented with system sans and ui-monospace stacks |
| Evidence and lineage | Synthetic source stated; coarse fixture traces; inspectable procedure evidence | Existing fixture-run steps remain coarse and API-backed. The added normalized compilation-trace path shows actual interpreter observations, recording method, hashes, and operation-to-trace lineage for assembled candidates |
| Verification content | Development cases, selected rejection and expected/observed reasons | Case rows come from the selected candidate's report: historical seven-case seed suite or new 21-case protocol. Frozen evaluation is separate. Input excerpts come from the API; run linkage is explicitly null |
| Package preview | Actual Agent Skills tree, SKILL.md preview, download and host readiness limits | Candidate-bound files/instructions and current-hash downloads. Codex discovery is verified for one older candidate only; invocation remains unverified |
| Existing actions | Inspect runs, verify, export, and record an example | Run selection/comparison, verification, export, and a compact fixture-run dialog are retained. Candidate selection, trace import/replay loading, and deterministic compilation were added for the implemented pipeline |
| Responsive behavior | Three columns on wide screens; stack panes on smaller widths; scroll wide tables inside their region | Breakpoints at 1260px, 940px, and 680px. Latest actual CSS widths 1706 and 390 show no document overflow; the library stacks on phone |

## Data-driven differences

- The concepts contain invented per-step timestamps; the app omits those and displays only the coarse stored trace steps.
- The procedure panel renders each actual typed operation in its current order and derives descriptions from its arguments. The current candidate has 16 operations. No prose is keyed to operation IDs.
- The selected case and file tree are populated from the finite suite and exported artifact. The UI does not claim that the hand-authored seed was generated from these traces.
- The two approved concepts do not show the pre-existing “record fixture run” form. It remains available through a compact dialog so the current run workflow is preserved.
- The compilation composer now sits above the workbench grid. It distinguishes compiler trace selection from reference-run comparison and shows method/readiness without implying live access. Compile ends at y803 on a 390×844 phone viewport, within the first viewport. The header candidate selector preserves prior candidates.
- Skill Library is a third navigation state using the same flat surfaces and typography. It exposes real registration, JSON input, H-MEM retrieval, output and invalidation evidence. Frozen evaluation appears below development results.
- The secondary text token was darkened from #718098 to #61728a. The new token has a calculated 4.65:1 contrast on the #f7f9fc canvas; this is a token check, not a complete contrast audit of every state.

## Verification performed

- pnpm typecheck passed after the UI and API changes.
- pnpm --filter @emberforge/web exec vite build passed after the UI changes.
- The sandboxed localhost processes could not be reached by the browser. Starting the loopback servers outside the sandbox resolved the connection issue. The target remains http://127.0.0.1:5174/.
- Browser page identity and meaningful content were observed without a framework overlay. On 24 October the embedded browser reported a Vite development WebSocket connection/send error; HTTP interactions and production compilation work. Do not describe the latest console as clean.
- The interaction path replay loading → three selected traces → new candidate compilation → seven-case verification report → archive download completed. The generated procedure inspector displayed two supporting trace IDs for selected operations.
- Additional checks passed: switching from generated candidate to seed and back; fixture-run dialog execution; selecting a different verification case; toggling comparison evidence; and rerunning verification with an enabled download afterward. The actual Codex discovery result is shown only for its matching candidate hash, with invocation still unverified.
- The actual downloaded archive was extracted to an unrelated temporary directory, and its packaged verifier passed supported output, unknown unit, schema/policy drift, malformed JSON, invalid output path, and missing-asset checks.
- Earlier width-clamp diagnosis was incorrect: 75% page zoom changes requested physical dimensions to CSS dimensions. Actual measured dimensions on 24 October were 1706×960 and 390×844, both without document overflow. The phone compile action occupies y764–803. Earlier keyboard navigation showed a solid focus outline; full keyboard review of the library remains open.
- Screenshots succeeded on 23 October and are saved as ember-forge-desktop.jpg and ember-forge-phone.jpg under the task visualization directory. They predate the new library. On 24 October both screenshot methods again failed, even with preview visibility enabled, so no current library screenshot was saved. This is not final visual sign-off.
- Actual latest interactions: empty library lookup → verified registration → changed-order warm execution (49 demand/34 shortage) → policy change refusal and deprecation; separate 21-case candidate assembly → frozen evaluation (21 passing) → new library registration/execution. Latest true phone library and workbench DOM checks have no page overflow.

## Remaining visual review

1. Capture the current implementation, including library and frozen evaluation, at desktop and true phone widths when screenshot capture works.
2. Inspect both renders against the accepted concepts for first-viewport copy, spacing, clipping, table density, operation panel height, and responsive overflow.
3. Repeat interaction coverage after related changes, including file-picker import of a custom sanitized JSON set; current import API rejection and round-trip checks are automated, while the browser used the replay-load action.
4. Update this ledger with the screenshots, observed mismatches, and fixes before claiming visual fidelity.
