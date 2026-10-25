# Pocket Forge

Pocket Forge turns repeated agent workflows into portable, executable Agent Skills: a standard skill folder carries the instructions, bounded runner, supported-input contract, tests, verification, and provenance. A standalone CLI is a secondary way to run the same verified procedure. The current vertical slice focuses on stock reconciliation across orders, inventory, and product/unit rules.

## Current state

The local application has a compilation workbench, verification/export, and Skill Library. It records synthetic reference runs, imports sanitized operation traces, assembles matching operation graphs into new candidates, verifies them on a separate 21-case development split, and exports portable Agent Skills. A later action freezes new synthetic evaluation inputs and retains the first result for that candidate hash. The library uses local H-MEM retrieval, checks verified artifact hashes and applicability, and executes supported inputs without provider calls. Candidate selection preserves earlier evidence. Codex repository discovery is verified for one older candidate; invocation and execution in two hosts remain unverified.

The user set the session budget to **$0**. No free provider entitlement or live credentials have been confirmed, so production model synthesis stays disabled. A bounded synthesis/repair controller, Nemotron transport adapter, and cancellable persisted API jobs are implemented; injected fake transports are explicitly test-only. The available compiler remains deterministic assembly from seed-runtime replay, which does not establish learning. All current execution/evaluation evidence is synthetic and finite. See [progress](docs/progress.md), [trace compilation](docs/trace-compilation.md), [integration readiness](docs/integrations.md), and [claims](docs/claims.md).

## Requirements and setup

- Node.js 24.13.0
- pnpm 11.25.0

Install dependencies and inspect readiness:

```powershell
pnpm install --frozen-lockfile
pnpm run doctor
```

Copy `.env.example` to `.env` only when provider configuration is available. Keep keys server-side. Provider composition now requires server-owned approval records, exact scope binding, persistent quotas and—for zero-cost mode—human-reviewed external entitlement evidence. No enabled authorization was created; the server still enforces the user's $0 ceiling. See [provider authorization](docs/provider-authorization.md). Configuration alone is not free access or spending permission.

## Run the local app

```powershell
pnpm run dev
```

The development command starts the Fastify API on `127.0.0.1:3001` and Vite UI on `127.0.0.1:5174` without automatically running tests or export checks. Run records and generated packages live under ignored `artifacts/`. Downloads now require a completed, candidate-bound package-check receipt; older exports remain on disk but require an explicit re-export before the app serves them.

Open **Workbench → Compile a skill → Load replay examples**, enter an unused name, and compile. The three selected compilation traces have replayable local snapshots and do not overlap the development inputs. Inspect verification, optionally **Freeze and evaluate**, and download the Agent Skill. In **Skill library**, register a passing candidate, load or edit input JSON, and retrieve/execute it. Changed policies or schemas deprecate incompatible memory entries. Custom trace imports use the format in the [trace guide](docs/trace-compilation.md).

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

The frozen split is a small synthetic smoke suite, not a representative held-out benchmark. `pnpm eval:export` checks the package in a fresh directory, instruments Node networking APIs, and verifies supported output plus boundary/error cases. This instrumentation is not an operating-system network sandbox.

## Scope

The current executable domain is stock reconciliation. It uses bounded typed operations, applicability checks and explicit rejection. General workflow learning, live Nemotron evidence, a verified Zetaris tenant transport, invocation in multiple hosts, and submission materials remain outstanding. The local source-reader contract handles bounded pages, snapshots and cleanup but has no live tenant HTTP implementation. Follow [implementation follow-up](docs/implementation-follow-up.md).

The product and full implementation brief are in [docs/product-description.md](docs/product-description.md) and [docs/implementation-plan.md](docs/implementation-plan.md).

Current implementation/evidence gates and a local demo outline are in [release readiness](docs/release-readiness.md). `pnpm source:state` records the actual working-file content manifest without running tests or provider clients. Historical suite counts and candidate results do not verify later uncommitted changes.
