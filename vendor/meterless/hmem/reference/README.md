# H-MEM reference implementation

This is the unchanged deterministic implementation of the [pinned H-MEM specification](../AGENTS.md), with zero runtime dependencies and optional JSON persistence. Its TypeScript source and smoke test are retained from upstream.

Use the Ember Forge workspace tools from the repository root:

```sh
pnpm hmem:conformance
pnpm exec vitest run vendor/meterless/hmem/reference/test/smoke.test.ts
```

The mock embedder and injectable clock make the reference repeatable. This is a local reference engine, not a production storage or embedding service. Upstream examples and extended documentation are available at the [pinned source](https://github.com/Meterless/Meterless/tree/1742dec56a66e58eef9dda2d2b865823758ca8cd/engines/hmem/reference). See [the vendor package note](../README.md) for the files retained and omitted in this repository.
