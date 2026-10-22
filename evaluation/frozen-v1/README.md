# Frozen smoke split v1

This split is separate from the compiler's development cases. The evaluator passes only `inputs.json` to the exported runtime; `labels.json` is read only by the evaluator process. The exported runtime receives neither labels nor a model endpoint.

The protocol currently covers one procedure family with a deliberately small synthetic smoke split. It is not a held-out benchmark and does not support broad generalization claims. The split must be replaced with separately sourced held-out data before reporting benchmark performance.

Run `pnpm eval:freeze` once to generate the initial files from the independent reference procedure, then use `pnpm eval:frozen artifacts/exports/stock-reconciliation/0.1.0/<export-id>` to evaluate a verified standalone bundle. `latest-report.json` is an evaluation artifact, not an immutable label file.
