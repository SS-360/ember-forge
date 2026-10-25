import { describe, expect, it } from "vitest";
import { buildProtocolSplit, assertSplitSeparation, caseInputHash, protocolHash } from "../src/protocol-fixtures.js";

describe("independent evaluation split manifests", () => {
  it("uses distinct source seeds and rejects overlap even across partitions", () => {
    const compilation = buildProtocolSplit("compilation", "compile-inputs");
    const development = buildProtocolSplit("development", "dev-inputs");
    const frozen = buildProtocolSplit("frozen", "frozen-inputs");
    expect(() => assertSplitSeparation([compilation, development, frozen])).not.toThrow();
    development.cases[0] = { ...structuredClone(compilation.cases[0]!), caseId: "copied-input-different-label" };
    development.inputHashes = development.cases.map(caseInputHash);
    development.splitHash = protocolHash({ partition: development.partition, seedHash: development.seedHash, cases: development.cases, inputHashes: development.inputHashes });
    expect(() => assertSplitSeparation([compilation, development])).toThrow(/overlap/);
  });
  it("detects modified split contents and includes boundary and malformed cases", () => {
    const development = buildProtocolSplit("development", "case-coverage");
    expect(development.cases.some((item) => item.caseId.includes("large-supported"))).toBe(true);
    expect(development.cases.some((item) => item.caseId.includes("invalid-calendar-date"))).toBe(true);
    development.cases[0]!.dataset = {};
    expect(() => assertSplitSeparation([development])).toThrow(/stale/);
  });
});
