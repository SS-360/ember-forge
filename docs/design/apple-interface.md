# Apple-inspired interface

User-requested direction, 24 October 2026. Applied the apple-design skill. This supersedes the earlier visual direction while preserving the application's data and workflows.

## Design choices

- System typography with size-specific tracking, comfortable leading and readable evidence text.
- Quiet neutral canvas, white working surfaces, subtle depth and an amber-red action color (`#b9471e`), updated at the user's request. Buttons, links, focus rings, checked controls and selected evidence use the same warm accent family.
- Sticky translucent toolbar with three destinations. A critically damped spring moves the selection surface from its current position and velocity; rapid changes retarget the same motion without locking input.
- Primary compilation controls come before advanced method and trace details. Candidate names default to an unused local name; invalid names have inline descriptions.
- Operation, run, verification, package and library styles follow the same spacing and material hierarchy. Verification case labels are readable names; full IDs remain on hover and in case detail.
- Immediate press feedback, visible keyboard focus, a native modal with a dimmed backdrop, and a 44px mobile navigation target.
- Reduced-motion users get immediate navigation selection and no press scaling. Reduced-transparency and increased-contrast preferences use solid materials and stronger boundaries.

## Implementation

- `apps/web/src/apple-interface.css`: presentation layer loaded after structural/state styles.
- `apps/web/src/components/WorkspaceNavigation.tsx`: navigation and interruptible, critically damped motion; no new animation dependency.
- `App.tsx`, `CompilationSources.tsx`, `VerificationExport.tsx`: hierarchy, progressive disclosure, inline feedback, suggested names and case labels.

## Observed result

- TypeScript checking and Vite production compilation passed. No automated tests were added or run for this UI change.
- App rendered at http://127.0.0.1:5174/. Workbench, verification, library and fixture modal were opened through their actual controls.
- Desktop: 1706×960 CSS px, three workbench columns, no document overflow.
- Phone: 390×844 CSS px, no document overflow; compile action ends at y781 and navigation targets are 44px high. Temporary viewport overrides were reset.
- Inline invalid-name feedback was observed. Its input now has a stable accessible name independent of the error description.
- Actual screenshots: [desktop](apple-desktop.jpg), [phone](apple-phone.jpg), [modal](apple-sheet.jpg). Capture is working again; older screenshot-failure entries describe earlier attempts.

Preference-specific rendering and full keyboard/assistive-technology coverage remain unverified. Earlier Vite embedded-browser WebSocket issues are not treated as resolved by this styling change.
