# Zetaris-to-skill demo

This kit records a complete local source-to-skill workflow using synthetic data:

```text
two local PostgreSQL sources
  → registered and queried through Zetaris
  → receipt-bound JSON snapshots
  → original-agent runs and labeled traces
  → Nemotron skill candidate
  → 21/21 development checks
  → portable snapshot-based export
```

The tracked [source evidence](source-evidence.json) summarizes the verified workflow. The supported [snapshot input](input.json) and [unknown-unit input](unsupported.json) are the exact snapshots used in that recorded workflow. The verified [`zetaris-stock-207ca2ab-retry-3` skill](../skill/) is included at the demo-kit root.

## Run the portable skill

From the repository root with Node.js 24:

```powershell
node demo-kit\skill\runtime\emberforge-runtime.mjs `
  --input demo-kit\zetaris\input.json `
  --output "$env:TEMP\ember-forge-result.json"
Get-Content "$env:TEMP\ember-forge-result.json" -Raw
```

It returns `CUP-RED` shortage 10 and `MUG-BLUE` shortage 0. No Zetaris or model service is called during this portable run.

To check the supported result and unsupported refusal in one command, run:

```powershell
node demo-kit\zetaris\verify.mjs
```

The unsupported sample refuses `CRATE` with `UNKNOWN_UNIT` and native exit code 2:

```powershell
node demo-kit\skill\runtime\emberforge-runtime.mjs --input demo-kit\zetaris\unsupported.json
```

## Show the live source stage

For a live local demonstration, the presenter's machine needs the already configured Zetaris Docker stack, its private local source mapping, and Ember Forge's local app. In **Workbench → Zetaris stock sources**, choose **Read Zetaris stock**, then **Use snapshot for agent run**. The receipt-bound snapshot becomes the selected WorkSample for the agent. Select its traces in Compilation and inspect the verified candidate.

The full demo does **not** require an AWS cluster, public API, or 24/7 cloud service. The online source stage is local to the presenter's machine. Judges can independently run the packaged snapshot skill above without their own Zetaris account or model credentials. The live read itself cannot be replayed from another laptop without a separately configured Zetaris environment.

All records are synthetic. The exported skill is snapshot-bound; it does not open a live Zetaris connection at execution time.
