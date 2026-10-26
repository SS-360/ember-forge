# Demo and submission preparation

26 October 2026. Draft narrative and evidence plan, not a submitted entry or a claim of full readiness.

Current update: explicit Codex and Claude Code invocation/execution, with the app stopped, now pass for the exact new export. Claude Code uses the free Nemotron backend. Live local Zetaris stock reads, a cross-source join and a freshness check also pass on synthetic data. See [host/source verification](host-and-zetaris-verification.md); earlier preparation-only statements below describe the previous checkpoint.

## Three-minute demo

| Time | What to show | Evidence gate |
| --- | --- | --- |
| 0:00–0:25 | Warehouse coordinator has open orders in mixed units, inconsistent SKU names and inventory shortages | Identify real sanitized versus synthetic provenance; show concrete rows |
| 0:25–0:55 | Original agent inspects sources, chooses trusted operations and produces an actual shortage report | Genuine dated run, prompt/config hashes and usage; recorded genuine run is labeled if not live |
| 0:55–1:25 | Select two successful inputs and a counterexample; propose/check/repair a new skill | Original run-bound lineage; no seed-copy or oracle answers in generation |
| 1:25–1:50 | Read the procedure, zero-reserve/open-order contract and paired evaluation | Frozen protocol predates candidate; show quality/refusals as well as time/tokens |
| 1:50–2:20 | Export; stop Ember Forge; execute fresh supported input from another directory | Same candidate/package hash; actual shortage rows, no procedure reasoning endpoint |
| 2:20–2:45 | Second host explicitly invokes the same package; changed policy rejects | Codex and Claude discovery/invocation/execution recorded separately; host model usage separate |
| 2:45–3:00 | H-MEM warm retrieval and policy invalidation; state remaining limits | Retrieved memory ID, acceptance checks, refusal and no silent billable fallback |

## Setup and transfer

With Node 24.13+ in the Node 24 line and pnpm 11.25 installed, run `pnpm setup:local` from a fresh clone. It installs locked dependencies with scripts disabled and starts the local API/UI; it does not run tests, export checks or provider calls. A network/cache and host runtime are prerequisites. This new fresh-clone command has static review only; a clean-environment rehearsal is pending.

After verification and an actual export exist:

```powershell
pnpm transfer:prepare artifacts/exports/NEW-SKILL artifacts/comparisons/first-protocol/protocol.private.json '../Ember Forge transfer rehearsal'
```

Preparation requires a directory outside the source repository. It copies the exact manifest-matching export into `.agents/skills/` and `.claude/skills/` in separate directories with spaces, adds fresh paired inputs, keeps reviewer labels outside host workspaces and writes unverified evidence templates. It starts no host/model and does not re-export or execute package checks. Do not promote a template to compatibility evidence without actual host logs and independent results. Hermes now has a separate one-prompt synthetic selection/execution rehearsal for a newer export; OpenClaw remains unverified because its CLI is absent. The exact candidate and limitations are in [host/source verification](host-and-zetaris-verification.md).

## Draft submission copy

**Ember Forge turns observed warehouse reconciliation work into reusable executable Agent Skills.** A coordinator can inspect the procedure and its boundaries, carry the same export into another agent, and reuse verified work on changed inputs. Meterless H-MEM nominates a validated procedure; deterministic hash/contract checks decide whether it can run. Unsupported policy/data returns a reason instead of silently starting a model.

Current implementation is a local prototype. Genuine Nemotron original runs, a new synthesized/exported candidate, and all 108 frozen four-arm invocations now have recorded evidence. The executable passed all 27 invocations without a model call; a direct network-blocked external-directory run also passed. These are synthetic inputs. Later checks now verify local Zetaris stock reads and cross-source joins, plus explicit Codex/Claude Code execution with the app stopped. The records are synthetic and the Claude Code backend is Nemotron. Monetary savings remain unverified. See [live verification](live-verification.md).

## Architecture and evidence manifest

React work sample → Fastify local sample store → bounded original-agent tool session → independently labeled sanitized trace → Nemotron proposal/repair → independent development checks → completed immutable export → H-MEM nomination → artifact/contract checks → local execution or refusal. Source snapshots and private evaluation labels stay outside synthesis context. The existing [architecture](architecture.md), [agent workflow](agent-workflow.md) and [comparison protocol](comparison-protocol.md) describe the boundaries.

For a release manifest retain: exact source commit/content manifest; dependency lock hash; source/sample provenance and input hashes; original-run prompt/config/request/usage records; selected trace hashes; synthesis lineage and build overhead; development report; protocol sealed before candidate; first paired outcomes and separate reruns; candidate/package manifests; two hosts' versions/discovery/invocation/process logs and result hashes; server-stopped observation; H-MEM retrieval/refusal records; current-source screenshot/video dates. Secrets and raw private samples remain excluded from public artifacts.

## Official event check

Observed on 26 October: the [official event page](https://hackathon.genai.works/event/open-agent-hackathon-2026) lists **Reasoning Architecture as Track 03**, a 22–27 October build window and submission closure **27 October 2026, 23:45 UTC** (28 October, 05:15 IST). Its wildcard explicitly names both Meterless and Zetaris. The [official academy page](https://academy.genai.works/courses/open-agent-hackathon-2026/details) describes Zetaris data, a Meterless Engine, and Nemotron/Nightshift. Some expanded rules and exact sponsor obligations were not visible in the retrieved public page; eligibility and final submission fields remain unconfirmed until those current rules are reviewed. Do not rely on stale October 15–20 pages or substitute an unrelated Devpost event. No claim of eligibility, sponsor completion or guaranteed placement is made.
