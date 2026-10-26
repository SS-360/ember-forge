# Ember Forge demo kit

This folder contains the exact verified stock skill folder installed in OpenClaw, a synthetic input and deterministic expected result, and sanitized OpenClaw/workbench activity. It contains no sponsor credentials or live business data. The workbench trace is a separate run from the OpenClaw input/output pair.

## Run the sample skill

Use Node.js 24.13 or newer. The verified `zetaris-stock-207ca2ab-retry-3@0.1.0` package is included at [`skill/`](skill/), with candidate SHA-256 `efdb2a2d6e247fa03f54a984beb32bea6a16c1ce03bb66115b689fe4f41db647`. From the repository root in PowerShell:

```powershell
$skillDir = (Resolve-Path 'demo-kit\skill').Path
$result = Join-Path $env:TEMP 'ember-forge-demo-result.json'
node (Join-Path $skillDir 'runtime\emberforge-runtime.mjs') `
  --input 'demo-kit\stock-reconciliation\input.json' `
  --output $result
Get-Content -LiteralPath $result -Raw
```

Compare the `status`, `skillId`, `skillVersion`, `executionMode`, and `records` fields with [`expected-output.json`](stock-reconciliation/expected-output.json). Runtime timings are intentionally omitted because they change on each run. This sample uses a local JSON snapshot; it does not connect to Zetaris or call a model. The same fixture was used in the supported OpenClaw selection run.

## Show agent activity

[`openclaw-activity.json`](openclaw-activity.json) records the real OpenClaw 2026.10.6 test sessions: local installation, automatic skill selection without naming the skill, successful bounded execution, and the unknown-unit refusal. It lists observed tool names and outcomes, not private model reasoning. The refusal reason was correct (`UNKNOWN_UNIT`); OpenClaw's tool wrapper reported exit 1 while the same raw runtime returned its documented exit 2.

[`workbench-activity.json`](workbench-activity.json) is a sanitized 14-step trace from a separate original Nemotron stock-agent run. It shows source reads, filters, lookups, unit conversion, aggregation, joining, shortage calculation, and result emission using operation names and hashes. It is synthetic fixture evidence, not private reasoning or live Zetaris output. Its input/output hashes do not describe the OpenClaw sample run above.

In the local Ember Forge workbench, the **Recorded agent run** selector reopens existing run activity and shortage reports without another model request. Run records are stored under ignored `artifacts/agent-runs/`; they are local evidence and are not included in a fresh Git clone.

## Scope

All sample records are synthetic development data. One supported example and one unknown-unit refusal demonstrate the procedure's bounded behavior, not general accuracy or production readiness. The verified OpenClaw host session used GPT-6-Luna; its recorded usage cost is listed in the activity JSON and is not an invoice.
