# Skill marketplace packaging

Ember Forge exports an ordinary Agent Skills folder: a root `SKILL.md` with `name` and `description` frontmatter, plus a bounded Node runner, contract, synthetic examples, tests, verification results, and provenance. A host-specific plugin wrapper is optional. The same folder can be copied into Codex or Claude Code skill directories, or installed into an OpenClaw workspace.

## Prepare an OpenClaw / ClawHub review package

First export and verify the candidate in Ember Forge. Then stage that exact export:

```powershell
pnpm marketplace:prepare -- artifacts/exports/<skill-id>/<version>/<verified-export-folder>
```

The command reruns the package's offline verifier, checks candidate/contract/provenance identity and frontmatter, rejects symlinks, then copies every regular file without rewriting it. It places the copy in an ignored, uniquely named folder under `artifacts/marketplace/clawhub/` whose immediate skill-directory name matches `SKILL.md`'s `name`. `staging-report.json` records the candidate hash and SHA-256 for every staged file. The command does not log in, call a marketplace, upload, or publish anything.

OpenClaw can install a local folder with `openclaw skills install ./path/to/skill --as <slug>` into the active workspace. This CLI is not installed in the current environment, so the package's OpenClaw discovery, selection, and execution remain unverified. See the [official OpenClaw skill documentation](https://docs.openclaw.ai/tools/skills).

## ClawHub publication gate

ClawHub accepts folders with a root `SKILL.md` and supporting regular files. Its current publishing guide requires skills published on ClawHub to be licensed under **MIT-0**, a permissive license allowing commercial use and redistribution without attribution. Ember Forge has no top-level license, and the project owner has not chosen MIT-0 for generated skills. Therefore, a staged package is for review only; it is not authorized or ready to publish until the owner confirms licensing rights and acceptance.

After that decision, the owner can use the reviewed folder with ClawHub's documented `clawhub login` and `clawhub skill publish <folder> --slug <slug> --name <display-name> --owner <handle>` flow. ClawHub validates metadata and the exact files, then runs its security checks before a release becomes available. Owner, slug, display name, categories, and registry security results have not been supplied or verified here. See the [publishing guide](https://docs.openclaw.ai/clawhub/publishing) and [skill-format requirements](https://docs.openclaw.ai/clawhub/skill-format).

## Current boundaries

- ClawHub staging is offline; registry publication has not occurred.
- OpenClaw CLI is absent, so local install, discovery, automatic selection, and execution still need a real harness run.
- A ClawHub listing would distribute the skill files; it would not create an Ember Forge hosted service or prove production readiness.
- The stock package reads a supplied JSON snapshot. Its supported runtime does not make a model call or connect to Zetaris.
