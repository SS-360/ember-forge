# zetaris-stock-207ca2ab-retry-3 0.1.0

This Agent Skill folder contains a portable SKILL.md and a bounded local interpreter bundle. Supported inputs execute without Ember Forge or Nemotron. The example uses synthetic stock-reconciliation data; the package does not connect to Zetaris or any other live source.

## Requirements and execution

- Node.js 24.13 or newer in the Node 24 release line.
- JSON input matching contract.json.

Copy input.example.json to input.json, replace its parameters and dataset with approved data matching the contract, then run:

```sh
node runtime/emberforge-runtime.mjs --input input.json --output result.json
```

The commands above assume you opened this skill folder. From another directory or an agent host, resolve the installed folder from the loaded SKILL.md location and use an absolute, quoted path to runtime/emberforge-runtime.mjs (and tests/verify-export.mjs). Input and output paths use the caller's working directory. Bundled skill and contract assets use the runtime file's directory. Omit --output to write result JSON to stdout. Exit code 2 means unsupported input; other nonzero codes mean execution or package failure.

## Verify

```sh
node tests/verify-export.mjs
```

The check runs from an unrelated temporary directory whose name contains spaces. It checks supported output against its recorded result hash, plus policy/schema drift, unknown units, malformed JSON, output paths, and a missing package asset. Its network guard instruments Node networking entry points; it is not an OS sandbox.

## Evidence and limits

verification.json records 21 finite development cases (7 supported and 14 unsupported). This is synthetic development evidence, not a held-out evaluation. This candidate was generated through the bounded Nemotron adapter and independently checked on development inputs. Provider generation does not establish held-out generalization. See lineage.json for trace hashes, operation links and limitations. See provenance.json for candidate and artifact hashes.

## Install in an agent harness

For Codex, extract this archive and copy the skill folder into the repository's .agents/skills/ directory. For Claude Code, copy it into the project's .claude/skills/ directory. For OpenClaw, Hermes, and other Agent Skills hosts, use the configured skills directory documented by that host.

This is the standard Agent Skills folder, not a Codex plugin bundle or a Claude Code plugin marketplace package. A host may wrap skills in a plugin for distribution, but that is optional and host-specific. Installation, discovery, invocation and correct execution require separate recorded checks in each host. Folder format alone does not prove invocation; consult the project's compatibility evidence.
