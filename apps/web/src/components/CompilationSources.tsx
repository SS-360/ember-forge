import { useRef, useState } from "react";
import type { CompilerReadiness, TraceRecord } from "../types.js";
import { Glyph } from "./Glyph.js";

export function CompilationSources({ traces, selectedIds, busy, readiness, suggestedName, onToggle, onImport, onLoadExamples, onCompile }: {
  traces: TraceRecord[];
  selectedIds: string[];
  busy: boolean;
  readiness: CompilerReadiness | null;
  suggestedName: string;
  onToggle: (id: string, checked: boolean) => void;
  onImport: (payload: unknown) => Promise<void>;
  onLoadExamples: () => void;
  onCompile: (skillId: string, method: "assembly" | "synthesis") => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [skillId, setSkillId] = useState(suggestedName);
  const [fileError, setFileError] = useState<string | null>(null);
  const [method, setMethod] = useState<"assembly" | "synthesis">("assembly");
  const selected = traces.filter((trace) => selectedIds.includes(trace.traceId));
  const successes = selected.filter((trace) => trace.outcome === "succeeded").length;
  const counterexamples = selected.length - successes;
  const nameValid = /^[a-z0-9][a-z0-9-]{1,63}$/.test(skillId) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(skillId);

  async function importFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    try {
      if (file.size > 900000) throw new Error("Choose a trace JSON file smaller than 900 KB.");
      await onImport(JSON.parse(await file.text()));
    } catch (error) { setFileError(error instanceof Error ? error.message : "The trace file could not be read."); }
    finally { if (fileInput.current) fileInput.current.value = ""; }
  }

  return <section className="compilation-sources" aria-labelledby="compilation-sources-title">
    <div className="compilation-sources-heading">
      <div><h2 id="compilation-sources-title">Compile a skill</h2><p>Choose your traces, give the skill a name, and make repeated work reusable.</p></div>
      <div className="compilation-source-actions">
        <button className="button button--quiet" type="button" disabled={busy} onClick={onLoadExamples}>Load replay examples</button>
        <button className="button button--secondary" type="button" disabled={busy} onClick={() => fileInput.current?.click()}><Glyph name="plus" />Import traces</button>
        <input ref={fileInput} type="file" accept="application/json,.json" className="visually-hidden" aria-label="Import sanitized trace JSON" disabled={busy} onChange={(event) => void importFile(event.target.files?.[0])} />
      </div>
    </div>
    {fileError && <p className="inline-error" role="alert">{fileError}</p>}
    <form className="compile-controls" onSubmit={(event) => { event.preventDefault(); if (!busy && nameValid && successes >= 2 && counterexamples >= 1 && (method === "assembly" || readiness?.synthesis.available)) onCompile(skillId, method); }}>
      <label>New candidate name<input aria-label="New candidate name" value={skillId} onChange={(event) => setSkillId(event.target.value)} pattern="[a-z0-9][a-z0-9-]{1,63}" minLength={2} maxLength={64} required disabled={busy} spellCheck={false} autoCapitalize="none" aria-invalid={skillId.length > 0 && !nameValid ? true : undefined} aria-describedby={skillId.length > 0 && !nameValid ? "compile-name-help compile-name-error" : "compile-name-help"} />{skillId.length > 0 && !nameValid && <span className="inline-error" id="compile-name-error">Use 2–64 lowercase letters, numbers, or hyphens. Start with a letter or number and avoid reserved system names.</span>}</label>
      <div className="compile-requirements" id="compile-name-help"><strong>{successes} successful · {counterexamples} {counterexamples === 1 ? "counterexample" : "counterexamples"}</strong><span>Select two distinct successful inputs and a counterexample.</span></div>
      <button className="button button--primary" type="submit" disabled={busy || !nameValid || successes < 2 || counterexamples < 1}>{busy ? "Working…" : "Compile candidate"}<Glyph name="chevron" /></button>
    </form>
    <details className="compiler-settings"><summary>Compilation method <span>{method === "assembly" ? "Trace assembly" : "Synthesis"}</span></summary>
      <div className="compilation-method"><label htmlFor="compiler-method">Method</label><select id="compiler-method" value={method} disabled={busy} onChange={(event) => setMethod(event.target.value as "assembly" | "synthesis")}><option value="assembly">Deterministic trace assembly</option><option value="synthesis" disabled={!readiness?.synthesis.available}>{readiness?.synthesis.mode === "test_only" ? "Test-only synthesis transport" : "Nemotron synthesis"}{readiness?.synthesis.available ? "" : " · unavailable"}</option></select><span>{method === "assembly" ? "Matching operation graphs only. Replay examples come from the hand-authored seed." : "Bounded generation and repair. Evaluation inputs stay outside the compiler context."}</span></div>
      <p className="pane-caption">{readiness?.synthesis.message ?? "Checking availability. Provider calls remain disabled until the server permits them."}</p>
    </details>
    <details className="compilation-trace-disclosure" open={traces.length === 0}><summary>Compilation traces <span>{selected.length} of {traces.length} selected</span></summary>
    {traces.length ? <div className="trace-import-list">
      {traces.map((trace) => <label className={"imported-trace" + (selectedIds.includes(trace.traceId) ? " imported-trace--selected" : "")} key={trace.traceId}>
        <input type="checkbox" checked={selectedIds.includes(trace.traceId)} disabled={busy || (!selectedIds.includes(trace.traceId) && selectedIds.length >= 32)} onChange={(event) => onToggle(trace.traceId, event.target.checked)} />
        <span className={"run-status run-status--" + trace.outcome}>{trace.outcome === "succeeded" ? "Success" : trace.reason ?? trace.outcome}</span>
        <code title={trace.traceId}>{trace.traceId.slice(0, 8)}…</code>
        <span>{trace.operationCount ? trace.operationCount + " operations" : "Rejected before operations"}</span>
        <span>{trace.recordingMethod === "compiled_runtime_replay" ? "Runtime replay" : trace.originalAgentVerified ? "Recorded original agent" : "Declared agent tools"}</span>
        <span>{trace.evidenceClass === "synthetic_fixture" ? "Synthetic fixture" : "User sanitized"}</span>
        <span>{trace.replayVerified ? "Snapshot replay verified" : "Snapshot replay unverified"}</span>
        <code className="trace-fingerprint" title={trace.hash}>sha256 {trace.hash.slice(0, 10)}…</code>
      </label>)}
    </div> : <div className="empty-inline">Load replay examples or import a sanitized trace set to begin.</div>}
    </details>
  </section>;
}
