# Host execution and live Zetaris stock reads

Verified on 26–27 October 2026 after the human explicitly requested completion of the host and source checks. Raw local artifacts are ignored by Git; the sanitized OpenClaw receipt is tracked under `docs/evidence/`. No publication or submission occurred.

## Same exported skill in two hosts

Both hosts used `stock-nemotron-be33034d-retry-2@0.1.0`, candidate hash `0e1fade2e1aeeb01fb0f1afb3ec773d33f4b4847d02fe3ec4250f644608391fa`. Installed file manifests still match the checked export. Package identity: `571bf6f58d871db92253d15d6dda4d656bf04a5f128ae5bfed3a99fce35f0943`.

| Check | Codex CLI 0.163.0 | Claude Code 2.1.309 |
| --- | --- | --- |
| Installation outside Ember Forge repository | Verified in `.agents/skills/` | Verified in `.claude/skills/` |
| Explicit skill invocation | `$stock-nemotron-be33034d-retry-2`, installed instructions read | Actual `Skill` tool invocation, followed by bundled runner commands |
| Fresh supported input | Exact independent output hash matched, native exit 0 | Same hash matched, successful shell result |
| Fresh unknown-unit input | `UNKNOWN_UNIT`, native exit 2 captured from PowerShell | `UNKNOWN_UNIT`, shell explicitly recorded exit 2 |
| Ember Forge API and web server stopped | Both ports unreachable at session start | Both ports unreachable at session start |
| Automatic skill selection | Unverified | Unverified |

The supported output was 12 units of demand against 6 on hand for `PRODUCT-d5fc5f94-A`, giving shortage 6; the second product had demand 18 against 50, giving shortage 0. The private reviewer labels stayed outside both host workspaces. These are two synthetic cases, not a broad host benchmark.

Codex used the existing ChatGPT account. Its CLI JSONL did not retain the exact default model identity. The final native-exit rehearsal took 70.130 seconds and reported 76,158 input tokens (50,432 cached) and 832 output tokens, including host context. Earlier attempts are additional overhead, not included in those final-session numbers.

**Claude Code used NVIDIA Nemotron, not an Anthropic Claude model.** Its inherited Ollama endpoint could not serve its default Claude model. A temporary authenticated loopback Messages bridge translated Claude Code's requests to the already-authorized free NVIDIA endpoint, retained finite request limits and persistent ledger accounting, and omitted raw model reasoning. The final session invoked `Skill`, executed both unchanged runtime commands and completed in 28.850 seconds. It reported 27,316 input and 527 output tokens. The CLI displayed an estimated `$0.119804` with `costBasis: unknown`; this is not an invoice or the NVIDIA endpoint's price. The bridge's zero-dollar authorization/ledger records are the configured provider accounting evidence. No paid API fallback was enabled.

Evidence directories:

- `artifacts/host-verification/codex-4516d449-201d-47d9-8c90-05594374b0a6/`
- `artifacts/host-verification/claude-f158e7e7-8021-40ac-b7d2-9e4761f7a82e/`
- `artifacts/host-verification/claude-provider-dfa499ae-e6c7-402d-9e64-e2aec0b2c4f2.json`

Each host directory contains invocation parameters, actual tool events, completion usage, and an independently checked `verified-execution.json`. Candidate-bound compatibility receipts reference those evidence hashes; the Verification screen now displays the checked host statuses.

The retained failures include Codex's initial Windows sandbox configuration, PowerShell exit-code remapping, a nested child-process restriction, the unavailable default Claude model, denied redirecting shell commands, and exploratory model calls that exhausted a bridge limit. The final tests used the normal unelevated/read-only Codex sandbox and narrowly allowed Claude shell commands. No global permission or security setting was weakened. Host inference still consumes tokens even though the supported skill procedure makes no model call.

## Hermes automatic selection and execution

On 27 October, an isolated Hermes profile automatically selected and ran the newer verified package `zetaris-stock-207ca2ab-retry-3@0.1.0`, candidate hash `efdb2a2d6e247fa03f54a984beb32bea6a16c1ce03bb66115b689fe4f41db647`. The prompt did not name the skill. Hermes inspected the matching skill, invoked `runtime/emberforge-runtime.mjs` against the staged `input.json`, and wrote `result.json`. The result file identity and bounded interpreter mode matched the package, and the output hash `255fdd1affe89fa4ce747ee3ff478d7fb715ea67a85b7142de64b62d98495cfd` matched the independent expected result.

The evidence records 4 Nemotron calls, 79,091 input tokens, and 524 output tokens under the previously authorized free endpoint, a $0 ceiling, and a 192,000-token run allowance. App ports 3001 and 5174 were unreachable at the start. The temporary Hermes profile was deleted after the run, leaving the global Hermes profile unchanged. Hermes version was not captured.

This was one synthetic JSON-snapshot request. It did not read Zetaris, verify unknown-input refusal in Hermes, or measure selection accuracy on a broader prompt set. It used a different candidate from the shared Codex/Claude rehearsal above. Hermes and OpenClaw have since both automatically selected and executed this newer package on one supported synthetic input each, providing a narrow same-package, two-host transfer result rather than a broader benchmark. See [compatibility matrix](skill-compatibility.md).

Evidence: `artifacts/host-verification/hermes-auto-cea3576d-90bd-4b10-94ef-48e4274f9d1c.json`.

## OpenClaw automatic selection and execution

On 27 October, OpenClaw 2026.10.6 installed the exact `zetaris-stock-207ca2ab-retry-3@0.1.0` export into its active workspace. The Gateway registry then reported the skill as `openclaw-workspace` and eligible (58 skills total). A fresh main-agent session used GPT-6-Luna and a normal reconciliation request that did not name the skill. OpenClaw selected the installed skill and invoked its bundled runner against a synthetic fixture; the runner exited 0 in `bounded-local-interpreter` mode.

The result was demand 11 / stock 4 / shortage 7 for `PRODUCT-1b0ec09d-A`, and demand 4 / stock 50 / shortage 0 for `PRODUCT-1b0ec09d-B`. An independent invocation of the exported runtime produced the same stable result fields. The complete result hashes differ because `metrics.durationMs` is measured per run. The bundled export verifier also passed. The test made no Zetaris stock reads and did not publish to ClawHub.

The three OpenClaw receipts report 21,701 input / 903 output tokens for installation, 18,982 / 667 for supported execution, and 18,989 / 501 for the unsupported-input refusal. Reported usage cost sums to **$0.00964078**; this is OpenClaw's usage metadata, not an invoice. The user explicitly requested GPT-6-Luna for these tests. This allowance does not change the separate $0 ceiling for NVIDIA Nemotron calls.

Evidence: [sanitized OpenClaw verification record](evidence/openclaw-auto-selection-20261027.json). A second automatic-selection run used a synthetic unapproved unit and preserved `UNKNOWN_UNIT` without guessing. OpenClaw surfaced host-level exit code 1, while direct execution of the same runner and fixture returned its documented native exit code 2. So the refusal reason is correct, but OpenClaw does not preserve the runner's exit status through its tool wrapper. Broader selection accuracy remains untested.

## Actual stock reads through Zetaris

Two dedicated PostgreSQL databases were created inside the existing local Docker instance, independently registered with Zetaris:

- `EMBER_SQL_ORDERS_BE33034D` → `ember_orders_be33034d`, containing 6 orders.
- `EMBER_SQL_WAREHOUSE_BE33034D` → `ember_warehouse_be33034d`, containing 2 inventory rows, 4 aliases and 2 unit conversions.

These are **synthetic demonstration records**. The two sources share one PostgreSQL server; this does not establish heterogeneous-backend or production-data coverage. Existing metastore, audit databases, volumes and other registered datasets were preserved. Earlier empty CSV registrations and failed filestore attempts remain recorded; file-access protections were not disabled.

The application uses the downloaded official Zetaris JDBC driver on loopback port 10000. Java credentials travel over child stdin, not command arguments. Runtime reads accept only fixed server-side source mappings and validated stock parameters; callers cannot submit SQL or source names. The helper rejects remote JDBC targets and write statements through its read path. A JDK is required for this source-file bridge; JDK 25.0.2 was exercised locally. The exported skill still requires Node only.

All four tables were read twice through Zetaris. Equal content hashes provide an optimistic stability check, **not transaction snapshot isolation**. The resulting live-mode dataset produced:

| SKU | Demand | On hand | Shortage |
| --- | --- | --- | --- |
| CUP-RED | 25 | 15 | 10 |
| MUG-BLUE | 5 | 8 | 0 |

An actual SQL join across both registered sources matched the independent stock report. A controlled freshness check changed demo inventory from 15 to 17, observed shortage 8 through Zetaris, then restored inventory to 15 in a `finally` block.

Evidence:

- Baseline source read: `artifacts/zetaris/stock-reads/109c9316-691d-4258-8a82-686be831fd62.json`.
- Freshness read: `artifacts/zetaris/stock-reads/52b9dd09-a856-479e-a5a9-28d762bf5e8c.json`.
- Restoration check: `artifacts/zetaris/stock-live-be33034d/freshness-check.json`.
- Cross-source SQL and matching result: `artifacts/zetaris/stock-live-be33034d/join-verified.json`.
- Private local source mappings: `.local/zetaris-stock-sources.json`, containing no database password.

Workbench → **Zetaris stock sources → Read Zetaris stock** invokes the real source-read route. This report uses the independent stock evaluator on live query results; it does not silently broaden the exported skill's fixture-only contract, synthesize a live-source skill, or trigger model fallback. SaaS REST pagination and the separate production tenant snapshot interface remain outside this local JDBC proof.

## Current checks

The latest source passes TypeScript, 85 tests across 19 files, and the frontend production build. Source-read boundary tests cover remote targets, write SQL, and caller query injection. Hermes and OpenClaw each add one automatic-selection/runtime success for the same newer package on supported synthetic input. OpenClaw also refused an unsupported unit with the correct reason, though its host-level exit code differs from the runner's native code. Real warehouse accuracy, dollar savings, deployment and submission are not established by these checks.

The host procedure follows the official [Codex skill evaluation guidance](https://developers.openai.com/blog/eval-skills) and [Claude Code skills contract](https://code.claude.com/docs/en/skills). Source registration follows the [Zetaris SQL manual](https://kbase.zetaris.com/knowledge/sql-manual); the running local bundle's own JDBC contract supplied the endpoint and driver.
