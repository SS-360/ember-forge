# Agent Skill compatibility matrix

Status checked: 27 October 2026 (Asia/Calcutta)

Current update: the exact `zetaris-stock-207ca2ab-retry-3@0.1.0` export passed automatic selection and execution in both Hermes and OpenClaw on one synthetic supported input per host. Hermes used the authorized free Nemotron endpoint; OpenClaw used GPT-6-Luna after the user explicitly requested it. Stable result fields matched independent executions in both runs. OpenClaw also selected the skill and rejected an unsupported unit with `UNKNOWN_UNIT`, but its tool wrapper reported exit 1 while the runner's native code is 2. This is a narrow same-package, two-host transfer result; it does not measure broader selection accuracy. Codex and Claude Code evidence below concerns an older package. See [host/source verification](host-and-zetaris-verification.md).

The new `stock-nemotron-be33034d-retry-2` package passed standalone checks and all 27 executable-arm frozen invocations. Exact copies were explicitly invoked and executed in external Codex/Claude Code workspaces with the app stopped. A direct Node invocation from an external workspace passed supported/unsupported inputs with network instrumentation and no credentials; that is not a host session. The older discovery result below remains scoped to its earlier candidate. See [live verification](live-verification.md).

Ember Forge exports the open Agent Skills directory format: `SKILL.md` with required `name` and `description` metadata plus relative references to the bounded runner and evidence. Local export checks validate metadata, links, candidate identity, file hashes, and runner behavior. `stock-nemotron-be33034d-retry-2` has explicit invocation/execution evidence in Codex and Claude Code. The newer `zetaris-stock-207ca2ab-retry-3` has one automatic-selection and execution rehearsal in Hermes. These records concern different artifacts and do not establish cross-harness transfer for the newer export.

## Host status

| Harness | Format | Install/discovery | Invocation | Correct execution | Evidence/status |
| --- | --- | --- | --- | --- | --- |
| Codex CLI 0.163.0 | Checks pass | Verified for new Nemotron candidate | Explicit invocation verified | Supported output and unknown-unit refusal verified, native exits 0/2 | Same exact package, external workspace, app stopped; account model identity not retained. |
| Claude Code 2.1.309 | Checks pass | Verified for new Nemotron candidate | Actual Skill tool invoked | Supported output and unknown-unit refusal verified, native exits 0/2 | Same exact package, external workspace, app stopped; free NVIDIA Nemotron backend, not an Anthropic model. |
| OpenClaw 2026.10.6 | Generated; local package checks pass | Verified in active workspace; registry says eligible | Automatically selected in fresh sessions without naming the skill | Supported result matched reference; synthetic unknown unit rejected as `UNKNOWN_UNIT` | Newer candidate, GPT-6-Luna. OpenClaw's tool wrapper reported exit 1 for a native runner refusal exit 2. See [receipt](evidence/openclaw-auto-selection-20261027.json). |
| Hermes Agent CLI | Generated; local package checks pass | Verified in an isolated temporary profile | Automatic selection via `skill_view` observed without naming the skill in the prompt | Bundled runner invoked; one synthetic result matched the independent expected hash | New candidate `zetaris-stock-207ca2ab-retry-3@0.1.0`; app stopped; 4 Nemotron calls; version was not retained. This does not match the Codex/Claude artifact. |

Codex/Claude share the same older export and are backed by actual tool events and independent results. Hermes and OpenClaw both exercised the same newer export, so the supported same-package transfer gate has one result on each of those two hosts. This is not a selection-accuracy benchmark. OpenClaw's unknown-unit refusal reason was correct, but exit-code preservation through its wrapper remains an interoperability issue.

## Hermes automatic-selection evidence

The isolated rehearsal asked Hermes to handle a matching stock-shortage request without naming the installed skill. Hermes inspected and selected `zetaris-stock-207ca2ab-retry-3`, called its bundled runner using `input.json`/`result.json`, and returned a successful result. The result file's skill identity, interpreter mode, and output hash matched the verified package and independent evaluator.

- Candidate hash: `efdb2a2d6e247fa03f54a984beb32bea6a16c1ce03bb66115b689fe4f41db647`.
- Input hash: `6886406febb0957b505958cfc2db80e0b9186018783a3e3983c08bc579d6f291`.
- Expected and observed result hash: `255fdd1affe89fa4ce747ee3ff478d7fb715ea67a85b7142de64b62d98495cfd`.
- Host inference: 4 Nemotron calls; 79,091 input and 524 output tokens. The isolated provider bridge enforced a $0 ceiling and a 192,000-token run allowance under the user's free-endpoint authorization. This is model-use accounting, not a measured savings claim or invoice.
- API/UI ports 3001 and 5174 were unreachable at the start. Hermes used a temporary profile that was deleted after evidence capture; the user's global Hermes configuration was not changed.
- Source mode was a local synthetic JSON snapshot. This rehearsal did not read Zetaris and does not measure automatic selection accuracy beyond this single prompt.

Local evidence: `artifacts/host-verification/hermes-auto-cea3576d-90bd-4b10-94ef-48e4274f9d1c.json`.

OpenClaw's active Gateway installed the local skill folder with the documented flow:

```sh
openclaw skills install ./path/to/skill --as <slug>
```

The Gateway registry listed the candidate as eligible, and a fresh GPT-6-Luna session selected and executed it on one synthetic supported input. This test did not publish to ClawHub. See the [OpenClaw skills guide](https://docs.openclaw.ai/tools/skills) and the [sanitized run record](evidence/openclaw-auto-selection-20261027.json).

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

The narrow supported-input transfer result now covers gates 1–4 for one package in two real harnesses. It does not establish broad selection accuracy. OpenClaw's refusal reason is correct, but native exit-code preservation needs follow-up. Any unavailable or untested host stays `unverified`. Record harness version, installation instructions, invocation command/prompt, input hashes, result hashes, logs, and error behavior before changing a row's status. The current export is the standard Agent Skills folder; it is not itself a Codex plugin bundle or Claude Code marketplace package. OpenClaw/ClawHub staging and publication requirements are in [marketplace packaging](marketplace.md).

## Runtime and cost boundaries

The standalone runner currently supports only the stock-reconciliation seed schema and requires JSON input. It does not report a fabricated model-call count. The bundled check disables common Node networking entry points as instrumentation; it is not an OS sandbox. Measure harness selection/invocation tokens separately from standalone runtime work. Live business-data retrieval is not part of the current seed export; a host tool/MCP or a verified data connector will be required for direct source access.

## Official format references

- [Agent Skills specification](https://agentskills.io/specification)
- [Codex skill documentation](https://learn.chatgpt.com/docs/build-skills)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [OpenClaw skills](https://docs.openclaw.ai/tools/skills)
- [ClawHub publishing](https://docs.openclaw.ai/clawhub/publishing)
- [Hermes Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
