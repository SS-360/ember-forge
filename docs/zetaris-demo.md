# Zetaris-to-skill demonstration

Ember Forge has a complete **local** Zetaris-to-skill path on synthetic data. The source reads run live through the configured Zetaris JDBC bridge, and their results are saved as receipt-bound snapshots. The app can select a saved snapshot for original-agent runs; those traces feed Nemotron synthesis and independent candidate verification. The resulting portable skill accepts the snapshot as JSON, so judges can execute it offline.

## Verified path

The run recorded as `207ca2ab-ec2c-4050-a785-1854378c6365` used:

1. Two reads from independently registered local Zetaris sources.
2. Three original-agent jobs against receipt-bound snapshots.
3. Four traces: two successes, one failure, and one explicit unsupported case.
4. Nemotron synthesis of `zetaris-stock-207ca2ab-retry-3@0.1.0`.
5. Independent development verification: **21/21 passed** (7 supported, 14 rejected).
6. Execution of the exact exported package on a tracked Zetaris-origin snapshot: success with deterministic shortage rows. A second snapshot refuses an unapproved unit as `UNKNOWN_UNIT` (native exit 2).

The concise public evidence and source-derived inputs are in [`demo-kit/zetaris/`](../demo-kit/zetaris/). The exported package is at [`demo-kit/skill/`](../demo-kit/skill/). No credentials or local source mapping are included.

## Live demo on the developer's laptop

This displays the real Zetaris contribution without hosting anything publicly:

1. Keep the configured local Zetaris Docker stack running.
2. Start Ember Forge with `pnpm dev` and open [http://127.0.0.1:5174](http://127.0.0.1:5174).
3. In **Workbench → Zetaris stock sources**, choose **Read Zetaris stock**. Show the two registered sources and the shortage results.
4. Choose **Use snapshot for agent run**. The app attaches the receipt-bound snapshot to the adjacent WorkSample flow.
5. Record an agent run, inspect its trace, and show the validated candidate in Verification.

The original live-source reads and synthesis were already recorded in the evidence above. Repeating the agent and synthesis stages requires the local provider authorization configured on the demo machine.

## Reproduce the artifact on a judge's machine

A judge does not need the developer's local Zetaris service, account, `.env`, or AWS resources to test the skill made from that source workflow. From the repository root, run:

```powershell
node demo-kit\skill\runtime\emberforge-runtime.mjs `
  --input demo-kit\zetaris\input.json `
  --output "$env:TEMP\ember-forge-result.json"
Get-Content "$env:TEMP\ember-forge-result.json" -Raw
```

For the explicit refusal, run the same interpreter with `demo-kit\zetaris\unsupported.json`; it returns `UNKNOWN_UNIT` with exit code 2. Both offline runs make zero Zetaris and model calls.

To replay both assertions in one command, run `node demo-kit\zetaris\verify.mjs`. It runs the package under the export's Node network instrumentation. The package's own verifier separately checks execution from an unrelated working directory.

The live source stage is local because the verified Zetaris instance listens on loopback and has private source mappings. A public deployment is only needed if the organizers specifically require a URL that they can access remotely. No public-cloud or AWS cluster is required for the local demo or portable skill evaluation; no 24/7 AWS service was created.

## Scope boundary

The generated skill runs on the captured snapshot, not by querying live Zetaris at each execution. The evidence proves a real source-read-to-skill-creation path over synthetic rows and portable execution of its output. The two PostgreSQL databases shared one local instance; this does not establish real-business accuracy, heterogeneous production sources, or transaction-level snapshot isolation.
