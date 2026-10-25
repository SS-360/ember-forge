# Readiness

Updated 24 October 2026, Asia/Calcutta.

## P0 checks

| Check | Status | Evidence |
| --- | --- | --- |
| Separate project repository | Complete | Independent Git repository initialized at this folder. |
| Runtime | Complete | Local Node is v24.13.0; pnpm is v11.25.0. Node 24 is an LTS release in the official release schedule. |
| Credential configuration | Partial | .env.example defines server-only provider settings. No matching NVIDIA or Zetaris environment variables or .env file were present in the handoff folder. |
| Live Nemotron typed tool call | Blocked | No NVIDIA_API_KEY is configured. No request has been made. |
| Live Zetaris query across two sources | Blocked | No Zetaris endpoint or credential is configured. Tenant-specific endpoints have not been guessed. |
| H-MEM source and instructions | Complete | Meterless/engines/hmem copied from commit 1742dec56a66e58eef9dda2d2b865823758ca8cd. Its AGENTS.md, docs, reference, conformance vectors/runner, and Apache-2.0 license are retained. |
| H-MEM integration | Integrated into the app | Actual Skill Library registration, cold lookup, warm new-input execution and policy invalidation have retained local API artifacts. Hash/applicability checks remain deterministic. This is the pinned minimal reference. |
| API budget | Explicitly $0 | User requested free operation. No free provider entitlement has been confirmed and no live request has been made. Configuration alone cannot enable calls. |

## P0 exit decision

Sponsor connectivity cannot be claimed yet. Per the implementation plan, local engineering may continue with synthetic fixtures as long as every artifact says fixture and live sponsor proof remains unresolved.

## Local demo readiness

| Check | Status | Evidence |
| --- | --- | --- |
| Local app starts | Complete | `pnpm run dev`; API at `127.0.0.1:3001`, Vite at `127.0.0.1:5174`. |
| Local workflow | Implemented for fixture mode | Workbench with fixture setup/history, trace assembly, verification/export, frozen evaluation and actual Skill Library execution. |
| Persistent local execution record | Complete | Local SQLite plus JSON trace artifact under `artifacts/`. |
| Package runs without a model client | Checked for bundled examples | Fresh-directory package execution has no provider client. Node network instrumentation is not an OS-level network sandbox. |
| Responsive check | Complete for sampled viewports | Desktop review and mobile viewport 388×843 CSS px; document has no horizontal overflow. |
| Current static compilation | Passed | TypeScript checking and Vite production compilation pass. Historical suite counts predate the latest integration; no fresh full-suite claim is made. |
| End-to-end live provider workflow | Blocked | $0 budget, free entitlement unconfirmed, no live credentials or validated Zetaris tenant transport. |
| Submission readiness | Not complete | Reproduction rehearsal and media/submission materials are still needed. |

The local demo uses a hand-authored seed, synthetic fixture runs, and deterministic assembly from normalized operation traces. Replay samples are explicitly identified; they do not establish model learning. Live Nemotron generation and Zetaris reads remain unverified.

## References

- Node release schedule: https://nodejs.org/en/about/previous-releases
- Pinned H-MEM source: https://github.com/Meterless/Meterless/tree/1742dec56a66e58eef9dda2d2b865823758ca8cd/engines/hmem
- NVIDIA chat completions API: https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-super-vl-120b-a12b-infer
- Zetaris tenant-specific connector references are in the implementation plan; confirm the active account contract before coding the live connector.

