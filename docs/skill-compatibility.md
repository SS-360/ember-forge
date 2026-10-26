# Agent Skill compatibility matrix

Status checked: 23 October 2026 (Asia/Calcutta)

Ember Forge exports the open Agent Skills directory format: `SKILL.md` with required `name` and `description` metadata plus relative references to the bounded runner and evidence. Local export checks validate metadata, links, candidate identity, file hashes, and runner behavior. Codex repository discovery is verified for the generated `stock-reconciliation-compiled` candidate; invocation through a model remains unverified in every host.

## Host status

| Harness | Format | Install/discovery | Invocation | Correct execution | Evidence/status |
| --- | --- | --- | --- | --- | --- |
| Codex CLI 0.163.0 | Generated; local metadata and resource checks pass | Verified for stock-reconciliation-compiled | Not tested | Not tested through the host | Installed into an isolated project's `.agents/skills/`; real app-server skills/list returned enabled=true, scope=repo. |
| Claude Code | Generated; local metadata and resource checks pass | Not tested | Not tested | Not tested | Copy the extracted folder under `.claude/skills/` in a project. Ember Forge discovery and invocation remain unverified. |
| OpenClaw | Generated; local metadata and resource checks pass | Not tested | Not tested | Not tested | Install under the host's configured Agent Skills root. Ember Forge discovery and invocation remain unverified. |
| Hermes | Generated; local metadata and resource checks pass | Not tested | Not tested | Not tested | Install under the host's configured Agent Skills root. Ember Forge discovery and invocation remain unverified. |

Claude Code 2.1.309 is installed locally, but its discovery and invocation have not been exercised. Finding a CLI executable or reading its version does not satisfy a compatibility gate.

## Codex discovery evidence

On 23 October, `scripts/check-codex-discovery.ts` exported and checked the generated candidate, copied it into an isolated ignored workspace, and used Codex's documented initialize → initialized → skills/list protocol. The response identified the staged SKILL.md as enabled with repository scope. The check did not start a thread or a turn and did not request inference. [Official app-server documentation](https://learn.chatgpt.com/docs/app-server) describes this discovery API.

Local evidence: `artifacts/harness-checks/codex/fa7f757c-e633-465c-8d2e-c0abff86e3d2/discovery.json`. A candidate-hash-bound summary under artifacts/compatibility/ feeds the UI's discovery status. It cannot promote invocation or execution to verified.

Reproduce with an installed Codex CLI:

```powershell
pnpm harness:codex --candidate artifacts/candidates/stock-reconciliation-compiled
```

On Windows, if the command shim cannot preserve stdio, set `EMBERFORGE_CODEX_BINARY` to the installed official codex.exe path before the command. The process needs access to its own Codex configuration/runtime directories; the filesystem sandbox prevented startup, while the same local check outside the sandbox passed. No credential or permission setting was changed.

## Verification gates

Record four different results for each harness. Passing one gate does not imply the next:

1. **Format validation:** frontmatter, required keys, name/directory match, relative links, package contents, and declared environment requirements validate.
2. **Installation and discovery:** the actual harness installs the bundle and lists or otherwise exposes the skill.
3. **Invocation:** explicit invocation and, where supported, automatic selection both direct the harness to the bundled runner and supply inputs safely.
4. **Correct execution:** a new supported input produces the independently expected result; an unsupported input is rejected with an actionable reason. Ember Forge is not running during execution.

The cross-harness-transfer claim requires gates 1–4 in at least two real harnesses. Any unavailable or untested host stays `unverified`. Record harness version, installation instructions, invocation command/prompt, input hashes, result hashes, logs, and error behavior before changing a row's status. The current export is the standard Agent Skills folder; it is not itself a Codex plugin bundle or Claude Code marketplace package. A plugin can optionally distribute that skill with host-specific metadata.

## Runtime and cost boundaries

The standalone runner currently supports only the stock-reconciliation seed schema and requires JSON input. It does not report a fabricated model-call count. The bundled check disables common Node networking entry points as instrumentation; it is not an OS sandbox. Measure harness selection/invocation tokens separately from standalone runtime work. Live business-data retrieval is not part of the current seed export; a host tool/MCP or a verified data connector will be required for direct source access.

## Official format references

- [Agent Skills specification](https://agentskills.io/specification)
- [Codex skill documentation](https://learn.chatgpt.com/docs/build-skills)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [OpenClaw skills](https://docs.openclaw.ai/tools/skills)
- [Hermes Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
