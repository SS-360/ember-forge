# Run Ember Forge and inspect its evidence

This guide has two paths: a quick offline run of the exact exported skill, and a local application demo. The offline path needs only Node.js 24 and the repository. The live-source path also needs the presenter's configured Zetaris stack and local source map. Neither path needs an AWS cluster or a public, always-on service.

## 1. Quick offline demonstration

From the repository root, run:

```sh
node demo-kit/zetaris/verify.mjs
```

The command checks both tracked Zetaris-origin snapshots with the included skill. Expected result:

```json
{
  "status": "passed",
  "supported": "2 result rows matched the Zetaris source snapshot",
  "unsupported": "UNKNOWN_UNIT",
  "providerCalls": 0,
  "zetarisCalls": 0
}
```

The supported result is CUP-RED: demand 25, stock 15, shortage 10; MUG-BLUE: demand 5, stock 8, shortage 0. The unsupported sample contains `CRATE` and must return `UNKNOWN_UNIT` without writing an output result.

To inspect the output directly in PowerShell:

```powershell
node demo-kit\skill\runtime\emberforge-runtime.mjs `
  --input demo-kit\zetaris\input.json `
  --output "$env:TEMP\ember-forge-result.json"
Get-Content "$env:TEMP\ember-forge-result.json" -Raw
```

This runs the exported Node.js procedure against a JSON snapshot. It does not read Zetaris or call a model. The runner's package verifier also checks the export from another working directory. The included Node network guard instruments common Node APIs; it is not an operating-system sandbox.

## 2. Start the application

Requirements: Node.js 24.13 or later within Node 24, pnpm 11.25, and Git. From a fresh clone:

```sh
pnpm install --frozen-lockfile
pnpm doctor
pnpm dev
```

Open [http://127.0.0.1:5174](http://127.0.0.1:5174). No provider key is needed to explore the synthetic examples or run the packaged skill. A fresh clone keeps provider calls disabled by default.

In **Workbench → Zetaris stock sources**, choose **Read Zetaris stock** to show the local source reads. Then choose **Use snapshot for agent run**. Inspect the saved agent run and its recorded actions, select the relevant successful traces and counterexample in Compilation, and open Verification to inspect the candidate and its checks.

Repeating the live read requires the local Zetaris bundle, Docker services, JDK, `.env` credentials, and the private source map in `.local/`. Repeating agent runs or synthesis also requires the local provider authorization. Follow [local credentials and source setup](credentials.md) and [provider authorization](provider-authorization.md); never put credentials in this repository or a demo recording.

## 3. Reproduce the H-MEM feature proof

After installing dependencies, run:

```sh
pnpm exec vitest run packages/memory/test/skill-memory.test.ts
pnpm hmem:conformance
pnpm memory:demo
```

The recorded product suite passed 7/7 tests, the pinned H-MEM conformance suite passed 13/13 checks, and the demo showed verified warm retrieval and execution followed by a schema-change refusal. The run creates a detailed local artifact under ignored `artifacts/memory-demo/`.

## 4. Run the project checks

```sh
pnpm test
pnpm typecheck
pnpm --filter @emberforge/web build
```

The latest recorded source check passed 85 tests in 19 files, TypeScript checking, and the Vite production build. The export verifier and H-MEM demo are separate commands because each demonstrates a particular product path. The documentation itself does not claim that opening the app runs these checks.

## Evidence index

| What to verify | Tracked evidence | What it establishes | What it does not establish |
| --- | --- | --- | --- |
| Zetaris-to-skill run | [`source-evidence.json`](../demo-kit/zetaris/source-evidence.json) | Two local source-read receipts, three original-agent jobs, four traces, exact candidate identity, and offline result | Real business data, different database vendors, live Zetaris query during skill execution |
| Supported and unsupported source-derived inputs | [`input.json`](../demo-kit/zetaris/input.json), [`unsupported.json`](../demo-kit/zetaris/unsupported.json), [`verify.mjs`](../demo-kit/zetaris/verify.mjs) | Reproducible result and explicit `UNKNOWN_UNIT` refusal without model or Zetaris calls | Live source availability on a judge's machine |
| Candidate test results | [`verification.json`](../demo-kit/skill/verification.json) | Candidate hash, 7/7 supported, 14/14 refused, zero false acceptances on the finite development set | Held-out real-world accuracy or universal task coverage |
| Original agent actions | [`workbench-activity.json`](../demo-kit/workbench-activity.json) | A sanitized 14-step activity record: reads, filters, lookups, conversion, aggregation, join, shortage calculation, result | Private model reasoning; this particular trace is a separate synthetic fixture run, not the Zetaris source workflow |
| Automatic host selection | [`OpenClaw receipt`](evidence/openclaw-auto-selection-20261027.json), [`OpenClaw activity`](../demo-kit/openclaw-activity.json) | OpenClaw selected the skill without its name in the prompt, ran one supported input, and preserved the unsupported reason | General selection accuracy; the host remapped the runner's exit code 2 to 1 |
| Codex and Claude Code execution | [Host/source verification](host-and-zetaris-verification.md) | Explicit supported and unsupported runs of the same earlier package in both hosts with the app stopped | Automatic selection of the newer Zetaris candidate in those hosts |
| Hermes automatic selection | [Host/source verification](host-and-zetaris-verification.md) | One supported run of the newer package without naming it in the prompt | Broader selection accuracy or an unsupported-input run in Hermes |
| H-MEM product path | [H-MEM demonstration](meterless-engine-demo.md), [test source](../packages/memory/test/skill-memory.test.ts) | Real library registration/retrieval/execution/invalidation and conformance results | Hosted H-MEM service or production readiness |
| Repeated-run comparison | [Live verification](live-verification.md), [evaluation results](evaluation-results.md) | Small paired synthetic study with requests, correctness, and runtime measurements | Dollar savings, break-even reuse count, or real workload performance |

### Reading the records accurately

- The Zetaris evidence describes synthetic rows read through a locally configured Zetaris installation. The two registered sources shared one local PostgreSQL server.
- The 21/21 development result belongs to the Zetaris-origin candidate. The 27/27 repeated comparison belongs to a separate stock-reconciliation candidate and three repeats of nine cases.
- The exported runner can execute without a model call; a host may still use its own model to decide which skill to select.
- Raw local run artifacts, credentials, and the private source map are ignored by Git. The tracked JSON proof files contain sanitized inputs and a summary of hashes and outcomes.
- No direct sponsor feedback or endorsement is recorded. The sponsor integration review reports our observed engineering lessons only.

For the user-facing product story, see [what Ember Forge does and who it helps](product-story.md). For how each sponsor technology was used and what we learned, see the [sponsor integration review](sponsor-integration-review.md).
