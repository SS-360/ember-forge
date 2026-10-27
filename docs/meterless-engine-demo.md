# Meterless Engine demonstration: H-MEM

Ember Forge implements Meterless H-MEM in the working **Skill Library**, rather than only listing it as a dependency. The UI calls the local library API; the API independently rechecks a candidate before registration. `SkillMemoryService` writes the verified skill, applicability conditions, provenance, and verification evidence through the pinned Meterless H-MEM reference. On retrieval, H-MEM nominates a candidate. Deterministic artifact-hash and input-contract checks authorize execution through Ember Forge's bounded interpreter. Stale schema or policy versions are rejected and audited. Automatic model fallback is disabled.

## Reproduce the passing proof

From the repository root:

```sh
pnpm exec vitest run packages/memory/test/skill-memory.test.ts
pnpm hmem:conformance
pnpm memory:demo
```

Observed on 27 October 2026:

| Check | Result |
| --- | --- |
| Product-level H-MEM integration tests | **7/7 passed** |
| Pinned Meterless H-MEM conformance suite | **13/13 passed** |
| Cold/warm integration demo | Retrieved and executed `stock-reconciliation@0.1.0` |
| Schema change | Refused with `SCHEMA_VERSION_MISMATCH`; stale entry marked `deprecated` |
| Provider calls in the demo | **0** |

The demo reports a `resultHash` and writes the full synthetic run record to `artifacts/memory-demo/<run-id>.json`. `artifacts/` is git-ignored, so every clone can run the proof without relying on this machine's prior evidence. The sample execution produced shortages for `CUP-RED` and `MUG-BLUE` using the bundled stock fixture.

The product integration test covers retrieval even when the candidate has a generated identifier, cold registration followed by warm retrieval across a service restart, bounded result correctness, schema and policy invalidation, preservation of entries after unsupported source mode, and refusal of unverified or altered candidates.

## Demonstrate it in the UI

1. Start the local app with `pnpm dev` and open [http://127.0.0.1:5174](http://127.0.0.1:5174).
2. Open **Skill library** and choose **Register current candidate**. The app re-runs the candidate's independent development verification before registration.
3. Choose **Load synthetic input**, then **Retrieve and execute**. The result shows the H-MEM memory ID, candidate, output rows, retrieval evidence, and `0` model calls.
4. In the JSON editor, change `dataset.sourceSchemaVersions.inventory` from its recorded version to `inventory/v2`, then run again. The app shows `SCHEMA_VERSION_MISMATCH` and records the entry as deprecated instead of executing stale logic.

## Implementation and limits

- UI: [`SkillLibrary.tsx`](../apps/web/src/components/SkillLibrary.tsx)
- API routes and execution evidence: [`library.ts`](../apps/api/src/library.ts)
- H-MEM adapter and verified registry: [`packages/memory/src/index.ts`](../packages/memory/src/index.ts)
- Product integration test: [`skill-memory.test.ts`](../packages/memory/test/skill-memory.test.ts)
- Pinned upstream reference and license: [`vendor/meterless/hmem`](../vendor/meterless/hmem/README.md)

These checks prove a local working integration with synthetic stock data. They do not establish a hosted Meterless service, Meterless Nightshift integration, live Zetaris access, cloud deployment, or production readiness.
