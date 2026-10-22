# Claims and evidence

All current product measurements use synthetic fixture data and apply only to the stated finite cases.

| Claim | Evidence | Status / limit |
| --- | --- | --- |
| Node 24.13.0 and pnpm 11.25.0 are available locally | `pnpm run doctor`, 23 Oct 2026 | Verified locally |
| Pinned H-MEM reference is present and licensed | `vendor/meterless/hmem/UPSTREAM.json`, retained upstream license/docs | Verified locally at commit `1742dec56a66e58eef9dda2d2b865823758ca8cd` |
| H-MEM conformance suite passes | `pnpm hmem:conformance` | 13/13 on pinned reference; not evidence of a hosted production service |
| Stock reconciliation matches the independent oracle on development examples | `pnpm eval:skill`, `skills/stock-reconciliation/verification.json` | 2/2 supported examples; synthetic development cases only |
| Known unsupported development cases are rejected | `pnpm eval:skill`, `skills/stock-reconciliation/verification.json` | 5/5 rejected; finite synthetic suite only |
| Exported package runs with network access disabled and no model call | Export `artifacts/exports/stock-reconciliation/0.1.0/d46c88b6-9cfc-4308-8d4b-562cf65beb9c/verification.json` | Passed; one supported binding plus one unknown-unit rejection; this is not a universal offline guarantee for arbitrary sources |
| Frozen smoke split passes | `evaluation/frozen-v1/latest-report.json`, produced by `pnpm eval:frozen` against export `d46c88b6-9cfc-4308-8d4b-562cf65beb9c` | 10/10: 4/4 supported correct, 6/6 unsupported rejected, 0 false acceptances; small synthetic smoke split, one task family, not representative held-out evaluation |
| The local app persists a fixture task run and exposes the five product screens | Browser walkthrough; local SQLite `artifacts/pocketforge.sqlite`; run artifact `artifacts/runs/bc254a9e-84ec-46b7-bcdd-43bac175c5f5.json` | Observed locally; zero model calls and synthetic inputs |
| Nemotron live typed tool call works | Live provider request/response artifact with secrets removed | Blocked: no NVIDIA credentials or approved spend ceiling; no request made |
| Zetaris reads two distinct sources | Sanitized live query/source-version artifacts | Blocked: no tenant endpoint or credentials configured |
| Skill was generated from Nemotron trajectories | Candidate provenance plus retained trajectories | Not established; current seed skill is hand-authored |
