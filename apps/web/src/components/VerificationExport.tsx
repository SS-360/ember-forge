import type { PackagePreview, VerificationCase, VerificationCaseDetail, VerificationReport } from "../types.js";
import { Glyph } from "./Glyph.js";
import { FrozenEvaluation } from "./FrozenEvaluation.js";

interface TreeEntry {
  path: string;
  label: string;
  depth: number;
  folder: boolean;
}

function buildTreeEntries(files: string[]): TreeEntry[] {
  const entries = new Map<string, TreeEntry>();
  for (const file of files) {
    const parts = file.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      const folderPath = parts.slice(0, index).join("/");
      entries.set(folderPath, { path: folderPath, label: parts[index - 1] + "/", depth: index, folder: true });
    }
    entries.set(file, { path: file, label: parts[parts.length - 1]!, depth: parts.length, folder: false });
  }
  return [...entries.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function observedLabel(testCase: VerificationCase): string {
  if (testCase.expectedOutcome === "supported") return testCase.passed ? "Correct result" : testCase.actualReason ?? testCase.actualOutcome;
  return testCase.actualReason ? "Reject · " + testCase.actualReason : testCase.actualOutcome;
}

function caseTitle(id: string): string {
  const words = id.replace(/^(development|frozen|dev)-/, "").replace(/-[a-f0-9]{8}$/, "").split("-");
  return words.map((word) => word.length === 1 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function VerificationExport({
  report, caseDetails, preview, selectedCaseId, busy, codexDiscovered, codexExecuted, claudeExecuted, onSelectCase, onVerify, onExport
}: {
  report: VerificationReport | null;
  caseDetails: VerificationCaseDetail[];
  preview: PackagePreview | null;
  selectedCaseId: string | null;
  busy: boolean;
  codexDiscovered: boolean;
  codexExecuted: boolean;
  claudeExecuted: boolean;
  onSelectCase: (caseId: string) => void;
  onVerify: () => void;
  onExport: () => void;
}) {
  if (!report) return <div className="empty-state"><strong>Verification is not available</strong><span>Load the current candidate from the local API.</span></div>;
  const selected = report.cases.find((item) => item.caseId === selectedCaseId) ?? report.cases[0] ?? null;
  const selectedDetail = selected ? caseDetails.find((item) => item.caseId === selected.caseId) : undefined;
  const stats = [
    { value: report.correctSupportedCount, label: "supported examples correct", total: "of " + report.supportedCaseCount + " in this suite", status: "positive" },
    { value: report.rejectedUnsupportedCount, label: "unsupported examples rejected", total: "of " + report.unsupportedCaseCount + " in this suite", status: "caution" },
    { value: report.falseAcceptanceCount, label: "false acceptances", total: "in this suite", status: "neutral" },
    { value: report.needlessFallbackCount, label: "needless fallbacks", total: "in this suite", status: "neutral" }
  ];
  const tree = preview ? buildTreeEntries(preview.files) : [];
  const exportable = report.status === "validated" && preview?.candidateHash === report.candidateHash;

  return <div className="verification-layout">
    <section className="verification-results" aria-labelledby="verification-title">
      <div className="section-title-row">
        <div><h2 id="verification-title">Verification report</h2><p>Results for this finite development suite ({report.cases.length} cases). Not a measure of generalization.</p></div>
        <button className="button button--secondary" type="button" disabled={busy} onClick={onVerify}>{busy ? "Verifying…" : "Run again"}</button>
      </div>

      <div className="verification-summary">
        {stats.map((item) => <div className={"summary-item summary-item--" + item.status} key={item.label}>
          <strong>{item.value}</strong><span>{item.label}</span><small>{item.total}</small>
        </div>)}
      </div>

      <div className="table-heading"><h3>Verification cases ({report.cases.length} total)</h3><span>Finite synthetic suite</span></div>
      <div className="table-scroll">
        <table className="data-table case-table">
          <thead><tr><th scope="col">Case</th><th scope="col">Class</th><th scope="col">Expected</th><th scope="col">Observed</th><th scope="col">Result</th></tr></thead>
          <tbody>{report.cases.map((testCase) => <tr key={testCase.caseId} className={selected?.caseId === testCase.caseId ? "row-selected" : ""}>
            <td><button type="button" className="case-link" title={testCase.caseId} onClick={() => onSelectCase(testCase.caseId)} aria-current={selected?.caseId === testCase.caseId ? "true" : undefined}>{caseTitle(testCase.caseId)}</button></td>
            <td>{testCase.expectedOutcome}</td>
            <td>{testCase.expectedOutcome === "supported" ? "Correct result" : "Reject · " + (testCase.expectedReason ?? "unsupported")}</td>
            <td>{observedLabel(testCase)}</td>
            <td><span className={"case-result " + (testCase.passed ? "case-result--passed" : "case-result--failed")}><Glyph name={testCase.passed ? "check" : "reject"} />{testCase.passed ? "PASS" : "FAIL"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>

      {selected && <section className="case-detail" aria-labelledby="case-detail-title">
        <div className="case-detail-heading"><h3 id="case-detail-title">Case detail — {selected.caseId}</h3><span>Case {report.cases.findIndex((item) => item.caseId === selected.caseId) + 1} of {report.cases.length}</span></div>
        <div className="case-detail-body">
          <div className="case-input">
            <span className={"class-label class-label--" + selected.expectedOutcome}>{selected.expectedOutcome}</span>
            <h4>Input excerpt</h4>
            <pre>{JSON.stringify(selectedDetail?.inputExcerpt ?? { parameters: selectedDetail?.parameters ?? null }, null, 2)}</pre>
          </div>
          <dl className="case-outcome">
            <div><dt>Expected</dt><dd>{selected.expectedOutcome === "supported" ? "Correct result" : <code>{selected.expectedReason ?? "unsupported"}</code>}</dd></div>
            <div><dt>Observed</dt><dd>{selected.actualReason ? <code>{selected.actualReason}</code> : observedLabel(selected)}</dd></div>
            <div><dt>Result</dt><dd className={selected.passed ? "text-success" : "text-danger"}><Glyph name={selected.passed ? "check" : "reject"} />{selected.passed ? "PASS" : "FAIL"}</dd></div>
            <div><dt>Run linkage</dt><dd>{selectedDetail?.runLinkage ?? "No run linkage recorded for this development case."}</dd></div>
          </dl>
        </div>
      </section>}
      <div className="report-footnote"><code>candidate {report.candidateHash.slice(0, 16)}…</code><span>{report.scope}</span></div>
      {preview && <FrozenEvaluation key={report.candidateHash} skillId={preview.skillId} candidateHash={report.candidateHash} verified={report.status === "validated"} />}
    </section>

    <aside className="package-pane" aria-labelledby="package-title">
      <div className="package-pane-heading"><h2 id="package-title">Package preview</h2><span>{preview ? "Verified candidate" : "Package not ready"}</span></div>
      <div className="file-tree" role="list" aria-label="Agent Skill package files">
        {preview ? <>
          <div className="tree-root"><Glyph name="chevronDown" className="glyph tree-folder" /><Glyph name="folder" className="glyph tree-folder-icon" /><strong>{preview.skillId}/</strong></div>
          {tree.map((entry) => <div key={entry.path} role="listitem" className={entry.path === "SKILL.md" ? "tree-entry tree-entry--selected" : "tree-entry"} style={{ "--tree-depth": entry.depth } as React.CSSProperties}>
            {entry.folder ? <Glyph name="chevronDown" className="glyph tree-folder" /> : <Glyph name="file" className="glyph tree-file" />}
            <code>{entry.label}</code>
          </div>)}
        </> : <p className="empty-inline">Verify and export the current candidate to prepare a package preview.</p>}
      </div>
      <div className="skill-document-preview">
        <div className="preview-heading"><strong><Glyph name="info" /> SKILL.md</strong><span>Package instructions</span></div>
        <pre>{preview?.skillDocument ?? "The package includes the Agent Skills instructions and the bounded offline runtime."}</pre>
      </div>
      <div className="package-actions">
        <button className="button button--primary button--wide" type="button" disabled={busy || !exportable} onClick={onExport}>
          <Glyph name="download" />{busy ? "Preparing…" : "Download Agent Skill"}
        </button>
        <p>{exportable ? "Current candidate matches this finite verification suite." : "A current passing verification and package are required before download."}</p>
        <small>Package format and offline runtime checked locally.</small>
      </div>
      <div className="host-compatibility">
        <h3>Host compatibility · Agent Skills folder</h3>
        <table className="host-table">
          <thead><tr><th scope="col">Host</th><th scope="col">Status</th></tr></thead>
          <tbody>
            <tr><td>Codex</td><td><span className="compat-dot compat-dot--ready" />{codexExecuted ? "Explicit invocation + execution verified" : codexDiscovered ? "Repo discovery verified · invocation unverified" : "Folder format ready · discovery unverified"}</td></tr>
            <tr><td>Claude Code</td><td><span className="compat-dot compat-dot--ready" />{claudeExecuted ? "Invocation + execution verified · Nemotron backend" : "Folder format ready · discovery unverified"}</td></tr>
            <tr><td>OpenClaw</td><td><span className="compat-dot" />Unverified</td></tr>
            <tr><td>Hermes</td><td><span className="compat-dot" />Unverified</td></tr>
          </tbody>
        </table>
        <p className="plugin-note"><Glyph name="info" />This is an Agent Skills folder package, not a plugin marketplace bundle.</p>
      </div>
    </aside>
  </div>;
}
