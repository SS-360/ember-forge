# Capability and release evidence

Updated 27 October 2026. Ember Forge is a working local prototype. The [product story](product-story.md) describes the problem and users; the [run guide](run-and-evidence.md) links runnable examples and the evidence behind each result.

## Current capabilities

| Capability | Observed result | Scope |
| --- | --- | --- |
| Local workbench | Samples, original-agent activity, skill creation, verification, export, and Skill Library implemented | Local application; no hosted production service |
| Zetaris-origin workflow | Two source-read receipts, three original-agent jobs, four traces, and a Nemotron-generated candidate | Synthetic rows from two registered databases on one local PostgreSQL server |
| Generated stock skill | 21/21 development cases: 7 correct supported results and 14 expected refusals | Candidate `zetaris-stock-207ca2ab-retry-3@0.1.0`; finite development evidence |
| Portable package | Included source-derived snapshot executes offline; unapproved unit returns `UNKNOWN_UNIT` | The runner consumes JSON snapshots and makes no live Zetaris query |
| H-MEM library | 7/7 product tests, 13/13 pinned conformance checks, warm execution, and schema-change invalidation | Pinned local reference engine; zero model calls in the reuse demo |
| Codex and Claude Code | Explicit supported and unsupported execution of the same earlier stock export with Ember Forge stopped | Automatic selection of the newer Zetaris candidate remains unverified in these hosts |
| Hermes and OpenClaw | Automatically selected and ran the same newer package once each on supported synthetic input | Small transfer check; broad selection accuracy is untested |
| Unsupported OpenClaw input | Correct `UNKNOWN_UNIT` refusal | Host wrapper changed native runner exit 2 to 1 |
| Fulfilment workflow | Separate template with one supported package case and three refusals | Configured trusted logic; not a second workflow learned from traces |
| Project checks | Latest recorded full suite: 85 tests in 19 files; TypeScript and frontend production build passed | Re-run the commands below after implementation changes |
| Marketplace preparation | Local ClawHub package staging implemented | Publication has not occurred; MIT-0 rights and owner metadata need review |

## Reproduce the checks

From the repository root after installing dependencies:

```sh
pnpm test
pnpm typecheck
pnpm --filter @emberforge/web build
pnpm hmem:conformance
node demo-kit/zetaris/verify.mjs
```

For the interactive source-to-skill walkthrough and H-MEM demonstration, follow the [run and evidence guide](run-and-evidence.md). Original-agent or synthesis calls require the local [provider authorization](provider-authorization.md). Fresh clones keep provider execution disabled.

## Evidence and limits

- [Zetaris demo](zetaris-demo.md): live source reads at snapshot creation, followed by agent runs, synthesis, and portable snapshot execution.
- [H-MEM demonstration](meterless-engine-demo.md): actual Skill Library registration, retrieval, execution, and stale-schema refusal.
- [Host/source verification](host-and-zetaris-verification.md): exact package identities, prompts, outcomes, and host limitations.
- [Live comparison](live-verification.md): a separate stock candidate's small synthetic repeated-run study, including failed agent runs and incomplete whole-workflow usage accounting.
- [Sponsor integration review](sponsor-integration-review.md): what was used, integration obstacles, and engineering observations.

Real warehouse accuracy, broad workflow learning, general cost savings, and production readiness are unverified. The compiled skill consumes a captured snapshot; direct live queries during each exported-skill execution are outside its current contract. Equivalent hand-written deterministic code remains a valid alternative.

No cloud deployment or marketplace publication is recorded. The local demo and offline package need no AWS cluster or always-on public service. The public Academy FAQ permits direct Nemotron; H-MEM is the implemented Meterless Engine. Nightshift is a separate recommendation in the supplied solutioning guide. Full event resource obligations are discussed in the [resource audit](hackathon-resource-audit.md).
