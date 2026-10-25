# Evaluation results

Updated 24 October 2026. These results are finite synthetic checks, not a representative benchmark or generalization claim.

## Independent protocol v2

- Available app path: compile from 3 compilation trajectories, independently verify 21 development inputs, then use **Freeze and evaluate** to create new synthetic inputs after the candidate is fixed.
- Candidate: stock-reconciliation-protocol-v2, hash `ec2d4b62fd5881d87a7827f4eae05b24bee25227ef619a1b13ce811c7bc19fcd`. Origin is deterministic trace assembly from hand-authored seed-runtime replay, not model synthesis.
- Development: 7/7 supported correct, 14/14 unsupported rejected, 0 false acceptances, 0 needless fallbacks.
- Frozen: 7/7 supported correct, 14/14 unsupported rejected, 0 false acceptances, 0 needless fallbacks. Split hash `e173e786dbf858f2bd2e4583e0f7780e287bc86bb829655cc83d886fa442c56b`.
- Evidence: `artifacts/candidates/stock-reconciliation-protocol-v2/` and `artifacts/frozen-evaluations/ec2d4b62fd5881d87a7827f4eae05b24bee25227ef619a1b13ce811c7bc19fcd/`. Generated local artifacts are Git-ignored; the application reproduces the protocol with a fresh frozen seed/result.
- Five supported frozen cases have three paired local reference/runtime timing repetitions, retained as raw measurements. Compiler/export/orchestration overhead and live agent/instruction-only/cache baselines are unmeasured; no savings or break-even conclusion is justified.
- Frozen inputs are generated after development and withheld from generation/repair. The first split and result are retained per candidate hash, including failures. Input/content hashes reject overlap and stale split manifests.
- Both partitions use the same independent domain generator. A fresh synthetic seed is a narrower claim than independently sourced real-world generalization. One domain, fixed policy/schema boundary, and finite cases remain substantial limits.

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
- The historical v1 experiment had no repeated timing study. V2 retains five inputs × three repetitions for reference/runtime only. No production-scale run or cost/break-even calculation has been performed.
- These outcomes say nothing about live Zetaris connectivity or real business datasets.

Use these counts as smoke-test evidence only. Create a new separately sourced holdout set before evaluating performance claims; never expose held-out labels to the compiler.
