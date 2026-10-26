# Fulfilment exceptions workflow

Ember Forge includes a second, bounded domain: identifying delayed and incomplete fulfilment by reconciling orders with shipment rows. It has a separate strict input schema and trusted runtime; it does not reuse or relabel the stock reconciliation program.

The local workbench lets an operator adjust a one-to-thirty-day grace policy, include incomplete orders, inspect or replace the JSON snapshot, run the check, and download an Agent Skills package. Orders and shipments are read-only input. The runner rejects duplicate identifiers, unknown order references, SKU mismatches, over-fulfilment, malformed dates, and schema changes. Cancelled rows do not count, and shipments after the as-of date are ignored.

The current implementation is a configured template. Its rules were written and checked in code; the package does not claim that Nemotron learned this workflow. It accepts synthetic fixtures or caller-supplied snapshots but has no shipment-system connector. Configure `skills/fulfilment-exceptions/policy.json` for a different grace period or incomplete-order policy, then rebuild the export with `pnpm fulfilment:export`.

The export is written to the ignored directory `artifacts/exports/fulfilment-exceptions/0.1.0/` and can be downloaded from the workbench. Its root `SKILL.md` and portable runner fit file-backed Agent Skills hosts; the folder can also be published to a compatible skill registry after its owner reviews the package and registry requirements. Publishing has not been performed. Four finite synthetic examples pass as part of the package build. This is package evidence, not held-out quality or production readiness.
