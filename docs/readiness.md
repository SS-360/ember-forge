# Readiness

Updated 27 October 2026 (Asia/Calcutta). This replaces the older setup-only snapshot; current dated evidence lives in [progress](progress.md), [release readiness](release-readiness.md), and the [hackathon resource audit](hackathon-resource-audit.md).

## Product and sponsor evidence

| Check | Status | Evidence and limit |
| --- | --- | --- |
| Local application workflow | **Implemented** | Workbench, original-agent runs, trace-based skill compilation, verification/export, frozen evaluation, and Skill Library. |
| Current source quality gates | **Passed** | 85 tests across 19 files; TypeScript check and Vite production build pass. The isolated package verifier also passes for the OpenClaw-tested export. |
| Nemotron | **Connected and exercised** | Original-agent runs and synthesis on synthetic stock data under the user's $0 NVIDIA ceiling. No real-world accuracy or savings result. |
| Zetaris local source path | **Connected and exercised** | Read-only reads from two local synthetic PostgreSQL sources, reconciliation join, and controlled freshness check. This is a separate workbench path; the original agent/export still use fixture/JSON data. SaaS/cloud tenant transport is unverified. |
| Meterless H-MEM | **Integrated and demonstrated** | Actual Skill Library integration suite passes 7/7; pinned conformance passes 13/13; `pnpm memory:demo` demonstrates warm retrieval/execution and stale-schema invalidation. Reproduction steps: [Meterless H-MEM demo](meterless-engine-demo.md). This is a local reference engine. |
| Meterless Nightshift primary runtime | **Not integrated** | The user-provided APPROACH guide and official Academy describe Nightshift as the primary AI provider/runtime layer. This is the largest sponsor integration gap. |
| Agent activity evidence | **Available** | Original-agent runs save tool steps and outcomes. The tracked demo kit has a sanitized 14-step trace and OpenClaw activity record. Neither contains hidden/private model reasoning. |
| Host compatibility | **Narrowly demonstrated** | Codex/Claude explicitly ran an earlier export. Hermes/OpenClaw auto-selected the same newer export once each on a supported synthetic input; OpenClaw's refusal exit code is remapped by its wrapper. |
| Demo sample package | **Prepared** | Synthetic stock input, deterministic output, and host/workbench activity records in `demo-kit/`. |
| Hackathon resource review | **Partial** | The supplied hub snapshot says onboarding 1/7 and required resources 0/3. Several actual rule/submission documents are listed but their text was not included; see the audit. |
| HackOS submission readiness | **Incomplete** | Team eligibility/account status, full rule review, video, slide deck, sponsor explanation, and final submission are not verified or complete. Official deadline is 27 October 2026, 23:45 UTC. |
| Cloud deployment / production | **Not established** | No protected hosted deployment, real-data security review, or production operations evidence. |
| Savings / generalization | **Not established** | Small synthetic finite comparisons only; do not claim general savings or universal skill learning. |

## Immediate blockers

1. Integrate and verify Meterless Nightshift as the primary AI runtime; direct Nemotron API calls are not equivalent.
2. Connect the original stock-agent task to the verified Zetaris route or clearly disclose that its run/export path still uses fixtures.
3. Obtain and review the full current Rules, Technical Execution Requirements, Submission Requirements, Disqualification Checklist, and AI Usage Policy from the hub; verify team/HackOS eligibility.
4. Finish the demo video, slides, repository explanation, sponsor mapping, and HackOS submission before the official deadline.

## Evidence links

- [Host and Zetaris verification](host-and-zetaris-verification.md)
- [Nemotron workflow verification](live-verification.md)
- [Project progress](progress.md)
- [Demo and submission preparation](demo-and-submission.md)
- [Resource audit](hackathon-resource-audit.md)
