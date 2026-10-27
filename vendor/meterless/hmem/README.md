# Meterless H-MEM used by Ember Forge

This directory contains the pinned H-MEM reference implementation and conformance suite used by Ember Forge's Skill Library.

- Upstream: [Meterless/Meterless, engines/hmem at 1742dec](https://github.com/Meterless/Meterless/tree/1742dec56a66e58eef9dda2d2b865823758ca8cd/engines/hmem)
- License: [Apache 2.0](LICENSE)
- Provenance and packaging changes: [UPSTREAM.json](UPSTREAM.json)
- Full local specification: [AGENTS.md](AGENTS.md)
- Implementation: [reference/src](reference/src/index.ts)
- Engine checks: [conformance](conformance/README.md)

The TypeScript implementation, tests, conformance runner, and vectors are retained unchanged. Upstream promotional images, workshops, examples, duplicated documentation, and the separate npm lockfile were omitted from this focused copy. This README and the reference README describe the local package; the complete upstream material remains available at the pinned link above.

From the Ember Forge repository root, use its existing pnpm workspace:

```sh
pnpm install --frozen-lockfile
pnpm hmem:conformance
pnpm exec vitest run packages/memory/test/skill-memory.test.ts
pnpm memory:demo
```

The reference engine uses deterministic hash embeddings and optional JSON persistence. Ember Forge integrates it into verified-skill retrieval and adds artifact and input checks before execution. See [the product demonstration](../../../docs/meterless-engine-demo.md) for observed results and limits.
