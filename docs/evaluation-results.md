# Evaluation results

Updated 23 October 2026. These results are a finite synthetic smoke check, not a benchmark or generalization claim.

## Frozen smoke split v1

- Procedure: stock reconciliation only.
- Cases: 10 synthetic examples, with 4 supported and 6 unsupported inputs.
- Protocol: inputs and labels are stored separately; the evaluator passes inputs only to the exported runtime and compares output/rejection behavior against labels.
- Export candidate: `7c13dadaa80140a068836503d1e2c0dfd17eeb55a1ea59579bca9906f079dc98`.
- Result: 10/10 passed; 4/4 supported outputs matched exact canonical hashes; 6/6 unsupported cases were rejected; false acceptances: 0.
- Reasoning calls during standalone evaluation: 0. The export verification disables network access and includes an instrumented no-call check.
- Evidence: `evaluation/frozen-v1/latest-report.json` and `evaluation/frozen-v1/protocol.json`.

Reproduce with:

```powershell
pnpm eval:export
pnpm eval:frozen artifacts/exports/stock-reconciliation/0.1.0/<export-id>
```

## Limits

- The split is small, synthetic, and covers one task family; it is not a held-out or representative benchmark.
- The skill is hand-authored. The experiment does not test Nemotron-generated workflow generalization.
- No original Nemotron baseline, exact-answer cache baseline, or parameterized replay baseline has been measured because no provider credentials or budget are configured.
- No source-identical three-repeat latency study, production-scale run, or cost/break-even calculation has been performed.
- These outcomes say nothing about live Zetaris connectivity or real business datasets.

Use these counts as smoke-test evidence only. Create a new separately sourced holdout set before evaluating performance claims; never expose held-out labels to the compiler.
