import { useState } from "react";
import type { SkillPayload } from "../types.js";
import { describeOperation } from "../procedure-summary.js";
import { Glyph } from "./Glyph.js";

export function ProcedurePane({ payload }: { payload: SkillPayload | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!payload) return <section className="procedure-pane"><p className="empty-inline">Candidate details are unavailable.</p></section>;
  const { skill, contract } = payload;
  const selected = skill.ir.operations.find((operation) => operation.id === selectedId) ?? skill.ir.operations[0];
  const linkedTraceIds = payload.lineage?.operations.find((item) => item.operationId === selected?.id)?.traceIds ?? [];
  const origin = payload.verification.candidateOrigin;
  const originLabel = origin === "nemotron_synthesis" ? "Nemotron synthesis" : origin === "test_synthesis" ? "Test-only synthesis" : origin === "deterministic_trace_assembly" ? "Trace assembly" : "Development seed";
  return <section className="procedure-pane" aria-labelledby="procedure-title">
    <div className="pane-heading pane-heading--stacked">
      <div><h2 id="procedure-title">Bounded procedure</h2><p>{originLabel} · {skill.id} v{skill.version}</p></div>
      <span className="origin-label">{originLabel}</span>
    </div>
    <ol className="operation-list">
      {skill.ir.operations.map((operation, index) => {
        const description = describeOperation(operation);
        return <li key={operation.id}><button type="button" className={"operation-button" + (selected?.id === operation.id ? " operation-button--selected" : "")} aria-pressed={selected?.id === operation.id} onClick={() => setSelectedId(operation.id)}>
          <span className="operation-number">{index + 1}</span>
          <span className="operation-copy"><strong>{description.title}</strong><small>{description.detail}</small></span>
          <Glyph name="chevron" className="glyph glyph--chevron" />
        </button></li>;
      })}
    </ol>
    <section className="contract-section" aria-labelledby="contract-heading">
      <div className="subsection-heading"><h3 id="contract-heading">Supported-input contract</h3><span>{skill.taskFamily}</span></div>
      <dl className="contract-strip">
        <div><dt>Source mode</dt><dd>{contract.supportedSourceModes.join(", ")}</dd></div>
        <div><dt>Policy</dt><dd>{contract.policyVersion}</dd></div>
        <div><dt>Schemas</dt><dd>{Object.values(contract.sourceSchemaVersions).join(" · ")}</dd></div>
        <div><dt>Row limit</dt><dd>{contract.maxRows.toLocaleString()}</dd></div>
        <div><dt>Runtime limit</dt><dd>{contract.maxRuntimeMs.toLocaleString()} ms</dd></div>
      </dl>
      <details className="assumptions-disclosure"><summary>Contract assumptions ({contract.assumptions.length})</summary><ul>{contract.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></details>
    </section>
    <section className="inspector-section" aria-labelledby="inspector-heading">
      <div className="subsection-heading"><h3 id="inspector-heading">Operation evidence</h3><Glyph name="info" className="glyph glyph--muted" /></div>
      {selected ? <div className="inspector-message">
        <strong>{describeOperation(selected).title}</strong><code>{selected.id}</code>
        {payload.lineage ? <><p>{linkedTraceIds.length ? linkedTraceIds.length + " successful compilation traces contain these exact operation arguments." : "No exact operation match was recorded in the source traces. Inspect compilation provenance."}</p>{linkedTraceIds.map((traceId) => <code key={traceId}>trace {traceId}</code>)}</> : <p>This hand-authored seed has no operation-to-trace provenance.</p>}
        <details className="operation-arguments"><summary>Inspect actual operation arguments</summary><pre>{JSON.stringify(selected, null, 2)}</pre></details>
      </div> : <p className="empty-inline">No operations recorded.</p>}
      {payload.lineage && <details className="assumptions-disclosure"><summary>Compilation method and limits</summary><code>{payload.lineage.adapterId}</code><ul>{payload.lineage.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></details>}
    </section>
  </section>;
}
