# Readiness

Prepared 23 October 2026, Asia/Calcutta.

## P0 checks

| Check | Status | Evidence |
| --- | --- | --- |
| Separate project repository | Complete | Independent Git repository initialized at this folder. |
| Runtime | Complete | Local Node is v24.13.0; pnpm is v11.25.0. Node 24 is an LTS release in the official release schedule. |
| Credential configuration | Partial | .env.example defines server-only provider settings. No matching NVIDIA or Zetaris environment variables or .env file were present in the handoff folder. |
| Live Nemotron typed tool call | Blocked | No NVIDIA_API_KEY is configured. No request has been made. |
| Live Zetaris query across two sources | Blocked | No Zetaris endpoint or credential is configured. Tenant-specific endpoints have not been guessed. |
| H-MEM source and instructions | Complete | Meterless/engines/hmem copied from commit 1742dec56a66e58eef9dda2d2b865823758ca8cd. Its AGENTS.md, docs, reference, conformance vectors/runner, and Apache-2.0 license are retained. |
| H-MEM integration | Complete for the local skill flow | H-MEM-backed records are persisted and retrieved; applicability checks remain deterministic. Cold/warm retrieval and schema/policy invalidation have product tests and a local demo artifact. This uses the pinned minimal reference, not a production H-MEM service. |
| Approved API budget | Blocked | NVIDIA_SESSION_BUDGET_USD is intentionally blank. No billable API requests have been made. |

## P0 exit decision

Sponsor connectivity cannot be claimed yet. Per the implementation plan, local engineering may continue with synthetic fixtures as long as every artifact says fixture and live sponsor proof remains unresolved.

## Local demo readiness

| Check | Status | Evidence |
| --- | --- | --- |
| Local app starts | Complete | `pnpm run dev`; API at `127.0.0.1:3001`, Vite at `127.0.0.1:5174`. |
| Five-screen workflow | Complete for fixture mode | Browser walkthrough: setup, execution history, compiler, verification, and library/export. |
| Persistent local execution record | Complete | Local SQLite plus JSON trace artifact under `artifacts/`. |
| Package can run without model/network access | Complete for the bundled fixture | Fresh-directory export verification reports network disabled and model-call count 0. |
| Responsive check | Complete for sampled viewports | Desktop review and mobile viewport 388×843 CSS px; document has no horizontal overflow. |
| Current test/typecheck gates | Complete | `pnpm typecheck`, `pnpm test` (35 checks), and `pnpm run doctor` passed on 23 October. |
| End-to-end live provider workflow | Blocked | No live credentials, spend ceiling, or validated Zetaris tenant contract. |
| Submission readiness | Not complete | Reproduction rehearsal and media/submission materials are still needed. |

The local demo is not the full sponsor-connected end product. The skill is a hand-authored seed procedure, task runs use synthetic fixtures, and live Nemotron generation and Zetaris reads remain unverified.

## References

- Node release schedule: https://nodejs.org/en/about/previous-releases
- Pinned H-MEM source: https://github.com/Meterless/Meterless/tree/1742dec56a66e58eef9dda2d2b865823758ca8cd/engines/hmem
- NVIDIA chat completions API: https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-super-vl-120b-a12b-infer
- Zetaris tenant-specific connector references are in the implementation plan; confirm the active account contract before coding the live connector.

