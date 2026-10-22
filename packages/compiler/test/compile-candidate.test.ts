import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileCandidate, verifyCandidate, type VerificationCase } from "../src/index.js";

const root = new URL("../../../", import.meta.url);
const fixture = JSON.parse(await readFile(fileURLToPath(new URL("fixtures/dev/stock-reconciliation.json", root)), "utf8"));
const skill = JSON.parse(await readFile(fileURLToPath(new URL("skills/stock-reconciliation/skill.json", root)), "utf8"));
const contract = JSON.parse(await readFile(fileURLToPath(new URL("skills/stock-reconciliation/contract.json", root)), "utf8"));

const supportedCase: VerificationCase = {
  caseId: "dev-supported-base",
  expectedOutcome: "supported",
  parameters: fixture.parameters,
  dataset: fixture.dataset
};

const unknownUnitDataset = {
  ...fixture.dataset,
  orders: fixture.dataset.orders.map((order: { unit: string }, index: number) =>
    index === 0 ? { ...order, unit: "PALLET" } : order)
};

const unknownUnitCase: VerificationCase = {
  caseId: "dev-unsupported-unknown-unit",
  expectedOutcome: "unsupported",
  expectedReason: "UNKNOWN_UNIT",
  parameters: fixture.parameters,
  dataset: unknownUnitDataset
};

describe("candidate compiler and verifier", () => {
  it("validates a provided candidate against supported and unsupported cases", () => {
    const result = compileCandidate(skill, contract, [supportedCase, unknownUnitCase]);
    expect(result.exportable).toBe(true);
    expect(result.verification.candidateOrigin).toBe("provided_candidate_draft");
    expect(result.verification.correctSupportedCount).toBe(1);
    expect(result.verification.rejectedUnsupportedCount).toBe(1);
    expect(result.verification.falseAcceptanceCount).toBe(0);
  });

  it("does not approve a candidate that needlessly rejects a supported input", () => {
    const wrongSkill = structuredClone(skill);
    const compute = wrongSkill.ir.operations.find((operation: { kind: string }) => operation.kind === "compute");
    compute.leftField = "onHandEach";
    compute.rightField = "demandEach";
    const report = verifyCandidate(wrongSkill, contract, [supportedCase]);
    expect(report.status).toBe("rejected");
    expect(report.needlessFallbackCount).toBe(1);
    expect(report.coverage).toBe(0);
  });

  it("does not let a mislabeled unsupported fixture become evidence", () => {
    const mislabeled: VerificationCase = {
      caseId: "incorrect-label",
      expectedOutcome: "unsupported",
      expectedReason: "UNKNOWN_UNIT",
      parameters: fixture.parameters,
      dataset: fixture.dataset
    };
    const report = verifyCandidate(skill, contract, [mislabeled]);
    expect(report.status).toBe("rejected");
    expect(report.cases[0]?.actualOutcome).toBe("reference_mismatch");
  });
});

