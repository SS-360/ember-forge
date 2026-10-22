# Pocket Forge architecture

The current product is a local, fixture-mode vertical slice. The diagram separates implemented paths from planned live-provider paths.

```mermaid
flowchart LR
  UI[React + Vite UI] -->|HTTP /api| API[Fastify API]
  API --> DB[(SQLite run metadata)]
  API --> ART[JSON run and export artifacts]
  API --> FIX[Versioned synthetic fixtures]
  API --> ORACLE[Deterministic reference procedure]
  API --> CONTRACT[Zod task and parameter contracts]
  CANDIDATE[Bounded skill IR] --> VALIDATOR[Static checks and contract verifier]
  VALIDATOR --> RUNTIME[Trusted TypeScript interpreter]
  RUNTIME --> EVAL[Development and frozen evaluators]
  API --> EXPORT[Standalone package builder]
  EXPORT --> PACKAGE[Skill JSON + contract + runtime + tests + evidence]
  MEMORY[packages/memory adapter + local demo] --> HMEM[H-MEM pinned local reference]
  NEMOTRON[Nemotron API] -. credentials and budget unavailable .-> API
  ZETARIS[Zetaris sources] -. tenant contract and credentials unavailable .-> API
```

## Implemented boundaries

- The UI sends typed task parameters to Fastify. The local task endpoint reads only the synthetic fixture and records the result in SQLite plus a JSON artifact.
- The runtime interprets bounded declarative instructions. Candidate validity and input applicability are decided by deterministic checks; H-MEM retrieval nominates records but does not authorize execution.
- The exporter includes the runtime and a network guard, then verifies supported execution and an explicit rejection with model calls disabled.
- Live Nemotron orchestration and Zetaris connectors are not implemented. Their boxes above show target integrations, not current capabilities.

## Principal packages

- `apps/web`: React/TypeScript five-screen application.
- `apps/api`: Fastify local API and SQLite run history.
- `packages/contracts`: Zod schemas for task, trace, program, skill, and export data.
- `packages/compiler`: bounded candidate and development-suite helpers.
- `packages/runtime`: trusted interpreter and standalone entrypoint.
- `packages/memory`: H-MEM adapter and skill registry.
- `packages/evaluator`: deterministic stock-reconciliation oracle.
- `evaluation/frozen-v1`: separated synthetic input/label split and evaluator report.
- `vendor/meterless/hmem`: pinned upstream reference, attribution, instructions, and conformance suite.
