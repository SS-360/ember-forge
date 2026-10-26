# Original agent to executable skill

26 October 2026. Implemented preparation; no new model trajectory or runtime pass is claimed.

## Audit and smallest gaps

Before this continuation the repository had a trusted instruction interpreter, seed/runtime replay, sanitized trace import, bounded Nemotron synthesis/repair, independent synthetic development checks, package completion receipts and H-MEM retrieval. It lacked an original agent choosing tools, user work-sample ingestion, a paired four-arm protocol and same-package two-host preparation. Historical fixture success and Codex discovery do not prove the intended full loop.

## Implemented flow

1. **Work sample:** save strict JSON or CSV envelopes locally with `synthetic_fixture` or `user_sanitized` provenance and an explicit sanitization acknowledgement. No import automatically executes data or sends it to a model.
2. **Observe:** an authorized adapter chooses schema inspection, paginated source reads and batches of at most eight trusted operations. `createOperationSession` executes each graph increment without loading a seed or candidate. The tool vocabulary covers reads, filters, alias/unit lookup, conversion, aggregation, joins, checks and emission. It accepts no arbitrary code or generated SQL.
3. **Check and repair:** emitted rows are independently checked. Only verdicts, not reference rows, return to the original agent. Failures remain recorded and a bounded repair restarts with empty operation state. Schema/policy/identity failures before model execution remain preflight refusals and are not promoted to model trajectories.
4. **Trace:** each eligible attempt records normalized operations, input/output hashes and independent outcome. Original-run records separately contain prompt/config/response hashes, usage, reserved/accounted costs, timings and concise observed states. Source values remain in ignored local samples/snapshots; hidden reasoning and credentials are not saved. Tool previews sent to the model can contain approved sample values.
5. **Propose a skill:** select two distinct successful inputs and a counterexample. Live synthesis requires original-provider traces with matching local run records and receipts. Imported `agentOrigin` declarations alone cannot satisfy that requirement. Generation receives sanitized trajectories, schemas and verdict-only repair feedback; no seed program, independent evaluator implementation, development answers or frozen inputs are supplied. Existing deterministic replay assembly remains separately labeled.
6. **Verify/export/register/reuse:** existing independent development verification, completed package checks, exact candidate hashes, H-MEM registration/retrieval and applicability checks remain in force. No out-of-contract path silently starts reasoning.

Visible states are observing → proposing → checking → repair/refused/ready. Readable tool names, row counts, rejection reasons and the actual shortage rows appear in the Work sample panel. Job evidence and `shortage-report.json` are stored under `artifacts/agent-runs/<jobId>/`. Cancellation aborts transport; interrupted requests are not automatically resumed. The existing shared ledger retains uncertain reservations.

## Supported policy

Orders are eligible only when open and within the requested warehouse/date range. Quantities and conversion factors are whole safe integers. Alias and unit maps come from the caller's versioned product rules, not embedded input answers. Inventory snapshots cannot be later than the range. Identities must be unique; missing aliases, units and inventory reject. Reserve stock is **zero**. Alternative eligibility/reserve policies and fractional quantities require a new explicit contract/primitive and independent checks; they are not silently supported.

`fixture` currently identifies the enabled local table transport. Provenance separately distinguishes synthetic examples from sanitized user data. It is not a claim of a live Zetaris read or representative real-world evaluation.

## Work-sample envelopes

POST `/api/work-samples` or paste an envelope into the panel:

```json
{
  "format": "json",
  "provenance": { "evidenceClass": "user_sanitized", "sourceLabel": "Warehouse reconciliation sample", "sanitizedConfirmed": true },
  "parameters": { "warehouseId": "WH-01", "fromDate": "2026-10-20", "throughDate": "2026-10-23", "policyVersion": "stock-v1" },
  "dataset": {
    "sourceMode": "fixture",
    "sourceVersions": { "orders": "sample-1", "inventory": "sample-1", "productRules": "stock-v1" },
    "sourceSchemaVersions": { "orders": "orders/v1", "inventory": "inventory/v1", "productRules": "product-rules/v1" },
    "orders": [], "inventory": [],
    "productRules": { "version": "stock-v1", "aliases": [], "unitConversions": [] }
  }
}
```

This is an envelope shape, not a verified work example. For CSV use `format: "csv"`, the same provenance/parameters, `metadata` containing `sourceVersions`, `sourceSchemaVersions` and `policyVersion`, and four CSV strings named `orders`, `inventory`, `aliases`, `unitConversions` instead of `dataset`. Headers:

```csv
orderId,warehouseId,orderDate,sku,quantity,unit,status
warehouseId,sku,snapshotDate,onHandEach
alias,canonicalSku
unit,eachPerUnit
```

Those are four separate table headers. Quoted commas/newlines and doubled quotes are supported. Missing/extra columns, invalid integers, unclosed quotes, unknown fields, oversized envelopes and more than 5000 total rows reject. Names and commercial figures may still be sensitive: sanitization is the operator's responsibility, not an automatic guarantee from a label.

GET `/api/work-samples` lists saved identities/provenance. POST `/api/agent/runs` with `{ "sampleId": "<uuid>" }` starts only when provider composition permits it. GET `/api/agent/runs` lists retained runs; GET `/api/agent/runs/<jobId>` observes state; POST its `/cancel` endpoint requests cancellation. The workbench's Recorded agent run selector reopens past results without another model request. The human has now explicitly authorized local tests and the free Nemotron workflow.

## Remaining proof

Two checked original successes and a valid unknown-unit counterexample now support a newly synthesized/exported candidate. Its 21 development checks passed. The first frozen four-arm comparison completed 108 invocations, retaining all failures. See [live verification](live-verification.md) for exact identities and results. Explicit Codex/Claude Code invocation and local Zetaris stock reads are now verified; see [host/source verification](host-and-zetaris-verification.md). Real operational datasets and relevant sponsor eligibility remain separate requirements.
