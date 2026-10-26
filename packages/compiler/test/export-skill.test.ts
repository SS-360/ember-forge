import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildDevelopmentSuite } from "../src/development-suite.js";
import { compileCandidate } from "../src/index.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("candidate-specific Agent Skill exports", () => {
  it("exports a second verified ID/version and rejects stale verification", async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "Ember Forge candidate export "));
    try {
      const sourceRoot = path.join(projectRoot, "skills", "stock-reconciliation");
      const candidateRoot = path.join(temporaryRoot, "stock-reconciliation-alt");
      const outputRoot = path.join(temporaryRoot, "exported skill");
      await mkdir(path.join(candidateRoot, "tests"), { recursive: true });
      const originalSkill = JSON.parse(await readFile(path.join(sourceRoot, "skill.json"), "utf8")) as Record<string, unknown>;
      const originalContract = JSON.parse(await readFile(path.join(sourceRoot, "contract.json"), "utf8")) as Record<string, unknown>;
      const fixture = JSON.parse(await readFile(path.join(projectRoot, "fixtures", "dev", "stock-reconciliation.json"), "utf8")) as Parameters<typeof buildDevelopmentSuite>[0];
      const skill = { ...originalSkill, id: "stock-reconciliation-alt", version: "0.2.0" };
      const contract = { ...originalContract, skillId: skill.id, skillVersion: skill.version };
      const compiled = compileCandidate(skill, contract, buildDevelopmentSuite(fixture));
      const manifest = {
        suite: "candidate-specific exporter integration check",
        scope: "finite development fixtures; not held-out evaluation",
        cases: compiled.verification.cases.map((item) => ({
          caseId: item.caseId,
          expectedOutcome: item.expectedOutcome,
          ...(item.expectedReason ? { expectedReason: item.expectedReason } : {})
        }))
      };
      await Promise.all([
        writeFile(path.join(candidateRoot, "skill.json"), JSON.stringify(compiled.skill, null, 2) + "\n"),
        writeFile(path.join(candidateRoot, "contract.json"), JSON.stringify(compiled.contract, null, 2) + "\n"),
        writeFile(path.join(candidateRoot, "verification.json"), JSON.stringify(compiled.verification, null, 2) + "\n"),
        writeFile(path.join(candidateRoot, "tests", "cases.json"), JSON.stringify(manifest, null, 2) + "\n")
      ]);

      const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
      const exportRun = spawnSync(process.execPath, [tsxCli, path.join(projectRoot, "scripts", "export-skill.ts"), "--candidate", candidateRoot, "--output-dir", outputRoot], {
        cwd: projectRoot,
        encoding: "utf8"
      });
      expect(exportRun.status, exportRun.stderr + exportRun.stdout).toBe(0);
      const skillDocument = await readFile(path.join(outputRoot, "SKILL.md"), "utf8");
      expect(skillDocument).toMatch(/^name: stock-reconciliation-alt$/m);
      const provenance = JSON.parse(await readFile(path.join(outputRoot, "provenance.json"), "utf8")) as { skillId: string; skillVersion: string; candidateHash: string };
      expect(provenance).toMatchObject({ skillId: "stock-reconciliation-alt", skillVersion: "0.2.0", candidateHash: compiled.verification.candidateHash });
      const packageCheck = spawnSync(process.execPath, [path.join(outputRoot, "tests", "verify-export.mjs")], { cwd: projectRoot, encoding: "utf8" });
      expect(packageCheck.status, packageCheck.stderr + packageCheck.stdout).toBe(0);

      const staleSkill = {
        ...compiled.skill,
        ir: {
          ...compiled.skill.ir,
          runtimeLimits: { ...compiled.skill.ir.runtimeLimits, maxRows: compiled.skill.ir.runtimeLimits.maxRows - 1 }
        }
      };
      await writeFile(path.join(candidateRoot, "skill.json"), JSON.stringify(staleSkill, null, 2) + "\n");
      const staleRun = spawnSync(process.execPath, [tsxCli, path.join(projectRoot, "scripts", "export-skill.ts"), "--candidate", candidateRoot, "--output-dir", path.join(temporaryRoot, "stale export")], {
        cwd: projectRoot,
        encoding: "utf8"
      });
      expect(staleRun.status).not.toBe(0);
      expect(staleRun.stderr + staleRun.stdout).toContain("Verification is missing, rejected, or stale");
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
