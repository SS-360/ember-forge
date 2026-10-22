# Pocket Forge

Pocket Forge is a local application for turning repeated read-only structured-data workflows into portable executable skills. The current vertical slice focuses on stock reconciliation across orders, inventory, and product/unit rules.

## Current state

The local fixture-mode application includes Task Setup, Execution History, Skill Compiler, Verification, and Skill Library. It records deterministic synthetic runs locally, checks a bounded seed program against contracts and examples, and downloads a verified standalone skill package. Exported supported runs do not call Nemotron; the package includes a typed JSON instruction program and trusted interpreter.

This is not yet the fully sponsor-connected product. There are no live Nemotron or Zetaris credentials configured and no approved API spend ceiling. The seed skill is hand-authored, not generated from live agent trajectories. All current run and evaluation evidence is synthetic and finite. See [readiness](docs/readiness.md), [progress](docs/progress.md), [architecture](docs/architecture.md), [provider integration prerequisites](docs/integrations.md), [evaluation limits/results](docs/evaluation-results.md), and [claims](docs/claims.md).

## Requirements and setup

- Node.js 24.13.0
- pnpm 11.25.0

Install dependencies and inspect readiness:

```powershell
pnpm install --frozen-lockfile
pnpm run doctor
```

Copy `.env.example` to `.env` only when provider configuration is available. Keep keys server-side; never put them in the browser or a skill export. Live integrations remain disabled until credentials and a bounded NVIDIA session budget are configured and the Zetaris tenant API/auth contract is verified.

## Run the local app

```powershell
pnpm run dev
```

The development command first builds and verifies the standalone seed skill, then starts the Fastify API on `127.0.0.1:3001` and the Vite UI on `127.0.0.1:5174`. Run records and generated packages are written under the ignored `artifacts/` directory.

## Verification commands

```powershell
pnpm typecheck
pnpm test
pnpm eval
pnpm eval:skill
pnpm memory:demo
pnpm hmem:conformance
pnpm eval:export
pnpm eval:frozen artifacts/exports/stock-reconciliation/0.1.0/<export-id>
```

The frozen split is a small synthetic smoke suite, not a representative held-out benchmark. `pnpm eval:export` verifies the package in a fresh directory with network access disabled and checks a supported input plus an explicit unsupported input.

## Scope

The current skill handles stock reconciliation with a bounded TypeScript interpreter, explicit input contract, source/policy version checks, and deterministic rejection of unsupported cases. It does not execute arbitrary generated code, write to business systems, or claim universal task support. Live Nemotron investigation/generation, real Zetaris queries across two sources, cancellable provider jobs, and submission materials remain outstanding.

The product and full implementation brief are in [docs/product-description.md](docs/product-description.md) and [docs/implementation-plan.md](docs/implementation-plan.md).
