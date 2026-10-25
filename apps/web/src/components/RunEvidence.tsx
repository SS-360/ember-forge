import type { RunRecord } from "../types.js";
import { Glyph } from "./Glyph.js";
import { rejectionExplanation } from "../procedure-summary.js";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function RunEvidence({ run }: { run: RunRecord | null }) {
  if (!run) {
    return <section className="evidence-pane">
      <div className="pane-heading"><h2>Run evidence</h2><span className="muted">No run selected</span></div>
      <div className="empty-state"><strong>Select a run</strong><span>Recorded examples appear in the run list.</span></div>
    </section>;
  }

  const parameters = run.parameters ?? run.result?.parameters;
  const resultLines = run.result?.lines ?? [];
  return <section className="evidence-pane" aria-labelledby="run-evidence-title">
    <div className="pane-heading">
      <h2 id="run-evidence-title">Run evidence</h2>
      <span className={"run-status run-status--" + run.status}>
        <Glyph name={run.status === "succeeded" ? "check" : "reject"} />
        {run.status === "succeeded" ? "Success" : run.status === "unsupported" ? "Unsupported" : "Failed"}
      </span>
      <code className="run-id">{run.id.slice(0, 8)}…</code>
    </div>

    <dl className="run-metadata">
      <div><dt>Warehouse</dt><dd>{parameters?.warehouseId ?? "Not recorded"}</dd></div>
      <div><dt>Date range</dt><dd>{parameters ? parameters.fromDate + " → " + parameters.throughDate : "Not recorded"}</dd></div>
      <div><dt>Policy</dt><dd>{parameters?.policyVersion ?? "Not recorded"}</dd></div>
      <div><dt>Recorded</dt><dd>{formatDate(run.createdAt)}</dd></div>
    </dl>

    <div className="trace-section">
      <div className="subsection-heading">
        <h3>Execution steps</h3>
        <span>Coarse trace · {run.executor}</span>
      </div>
      {run.trace?.steps.length ? <ol className="trace-steps">
        {run.trace.steps.map((step, index) => <li key={step.id + "-" + index}>
          <span className={"trace-step-index trace-step-index--" + step.outcome}>{step.outcome === "succeeded" ? <Glyph name="check" /> : <Glyph name="reject" />}</span>
          <code>{step.id}</code>
          <span className="trace-step-kind">{step.kind.replaceAll("_", " ")}</span>
          {step.errorCode && <code className="trace-error">{step.errorCode}</code>}
        </li>)}
      </ol> : <p className="empty-inline">No step-level trace was stored for this run.</p>}
    </div>

    <div className="result-section">
      <div className="subsection-heading"><h3>Output</h3><span>{resultLines.length} result rows</span></div>
      {resultLines.length ? <div className="table-scroll">
        <table className="data-table result-table">
          <thead><tr><th scope="col">SKU</th><th scope="col">Demand</th><th scope="col">On hand</th><th scope="col">Shortage</th></tr></thead>
          <tbody>{resultLines.map((line) => <tr key={line.sku}>
            <th scope="row"><code>{line.sku}</code></th>
            <td>{line.demandEach}</td><td>{line.onHandEach}</td><td>{line.shortageEach}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className={"run-reason run-reason--" + run.status}>
        <Glyph name={run.status === "succeeded" ? "info" : "reject"} />
        <div><strong>{run.reason ?? run.outcomeSummary}</strong><p>{run.reason ? rejectionExplanation(run.reason) : run.limitation}</p>{run.reason && <p>{run.limitation}</p>}</div>
      </div>}
    </div>
  </section>;
}
