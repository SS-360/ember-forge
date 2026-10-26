import { useEffect, useRef, useState } from "react";

interface Sample { sampleId: string; inputHash: string; provenance: { evidenceClass: string; sourceLabel: string } }
interface RecordedRun { jobId: string; sampleId: string; state: string; startedAt: string | null; modelCalls: number }
interface AgentState { jobId: string; state: string; stage: string; message?: string; run?: { reason?: string; mode: string; calls: unknown[]; traces: Array<{ traceId: string }>; result?: Array<Record<string, unknown>>; events: Array<{ state: string; attempt: number; tool?: string; operationId?: string; code?: string; rowCount?: number }> } }
async function request<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), ...(signal ? { signal } : {}) });
  const data = await response.json() as T & { message?: string; error?: string };
  if (!response.ok) throw new Error(data.message ?? data.error ?? "Local request failed.");
  return data;
}
export function WorkSample({ busy, onRecorded, initialSampleId = "" }: { busy: boolean; onRecorded: (traceIds: string[]) => Promise<void>; initialSampleId?: string }) {
  const [samples, setSamples] = useState<Sample[]>([]), [selectedId, setSelectedId] = useState(initialSampleId);
  const [payload, setPayload] = useState(""), [error, setError] = useState<string | null>(null), [saving, setSaving] = useState(false);
  const [readiness, setReadiness] = useState<{ available: boolean; message: string; mode: string } | null>(null);
  const [state, setState] = useState<AgentState | null>(null), [jobId, setJobId] = useState<string | null>(null);
  const [recordedRuns, setRecordedRuns] = useState<RecordedRun[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([request<Sample[]>("/api/work-samples", undefined, controller.signal), request<NonNullable<typeof readiness>>("/api/agent/readiness", undefined, controller.signal), request<RecordedRun[]>("/api/agent/runs", undefined, controller.signal)]).then(([nextSamples, nextReadiness, nextRuns]) => { setSamples(nextSamples); setReadiness(nextReadiness); setRecordedRuns(nextRuns); }).catch((error: unknown) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Sample preparation is unavailable."); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const next = await request<AgentState>("/api/agent/runs/" + jobId, undefined, controller.signal);
        if (controller.signal.aborted) return;
        setState(next);
        if (next.state === "running") timer = setTimeout(() => void poll(), 750);
        else { setJobId(null); setRecordedRuns(await request<RecordedRun[]>("/api/agent/runs", undefined, controller.signal)); await onRecorded(next.run?.traces.map((trace) => trace.traceId) ?? []); }
      } catch (error) { if (!controller.signal.aborted) { setJobId(null); setError(error instanceof Error ? error.message : "Agent observation unavailable."); } }
    }
    void poll();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [jobId, onRecorded]);
  async function save() {
    setSaving(true); setError(null);
    try {
      if (new Blob([payload]).size > 900000) throw new Error("Use a sample envelope smaller than 900 KB.");
      const sample = await request<Sample>("/api/work-samples", JSON.parse(payload));
      setSamples((items) => [...items, sample]); setSelectedId(sample.sampleId); setPayload("");
    } catch (error) { setError(error instanceof Error ? error.message : "Sample could not be saved."); }
    finally { setSaving(false); }
  }
  async function observe() {
    setSaving(true); setError(null); setState(null);
    try { const job = await request<{ jobId: string }>("/api/agent/runs", { sampleId: selectedId }); setJobId(job.jobId); }
    catch (error) { setError(error instanceof Error ? error.message : "Original agent could not start."); }
    finally { setSaving(false); }
  }
  async function inspectRecorded(id: string) {
    if (!id) { setState(null); return; }
    setSaving(true); setError(null);
    try { const next = await request<AgentState>("/api/agent/runs/" + id); setState(next); if (next.state === "running") setJobId(id); }
    catch (error) { setError(error instanceof Error ? error.message : "Recorded run is unavailable."); }
    finally { setSaving(false); }
  }
  const disabled = busy || saving || jobId !== null;
  return <section className="compilation-sources work-sample" aria-labelledby="work-sample-title">
    <div className="section-title-row"><div><h2 id="work-sample-title">Observe a work sample</h2><p>For a warehouse coordinator: reconcile open orders, unit names, inventory, and shortages.</p></div><span className="origin-label">{readiness?.available ? readiness.mode === "test_only" ? "Test transport" : "Original agent" : "Agent disabled"}</span></div>
    <p className="pane-caption">{readiness?.message ?? "Checking local readiness…"} Importing saves local data without running it. Model execution sends approved table observations to the configured provider.</p>
    {error && <p role="alert" className="inline-error">{error}</p>}
    <label className="field"><span>Recorded agent run</span><select value={state?.jobId ?? ""} disabled={disabled} onChange={(event) => void inspectRecorded(event.target.value)}><option value="">Inspect a previous run</option>{recordedRuns.map((run) => <option key={run.jobId} value={run.jobId}>{run.state} · {run.modelCalls} requests · {run.jobId.slice(0, 8)}</option>)}</select></label>
    <details><summary>Import sanitized JSON or CSV</summary><p className="pane-caption">Use the work-sample envelope documented in <code>docs/agent-workflow.md</code>. CSV envelopes contain the four named CSV strings. Set provenance and <code>sanitizedConfirmed: true</code>; remove confidential fields first.</p>
      <label className="field"><span>Work-sample envelope</span><textarea rows={7} value={payload} disabled={disabled} onChange={(event) => setPayload(event.target.value)} spellCheck={false} placeholder='{"format":"json","provenance":{"evidenceClass":"user_sanitized","sourceLabel":"Warehouse sample","sanitizedConfirmed":true},"parameters":{...},"dataset":{...}}' /></label>
      <div className="compilation-source-actions"><button className="button button--secondary" type="button" disabled={disabled} onClick={() => fileInput.current?.click()}>Choose JSON file</button><button className="button button--secondary" type="button" disabled={disabled || !payload.trim()} onClick={() => void save()}>Save local sample</button></div>
      <input type="file" ref={fileInput} className="visually-hidden" aria-label="Choose sanitized work-sample envelope" accept="application/json,.json" disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 900000) { setError("Choose a file smaller than 900 KB."); return; } void file.text().then(setPayload).catch(() => setError("Could not read the sample file.")); event.target.value = ""; }} />
    </details>
    <div className="work-sample-controls"><label className="field"><span>Saved sample</span><select value={selectedId} disabled={disabled} onChange={(event) => setSelectedId(event.target.value)}><option value="">Choose a sample</option>{samples.map((sample) => <option key={sample.sampleId} value={sample.sampleId}>{sample.provenance.sourceLabel} · {sample.provenance.evidenceClass === "synthetic_fixture" ? "synthetic" : "user sanitized"} · {sample.inputHash.slice(0, 8)}</option>)}</select></label><button type="button" className="button button--primary" disabled={disabled || !selectedId || !readiness?.available} onClick={() => void observe()}>Observe agent run</button>{jobId && <button type="button" className="button button--secondary" onClick={() => void request("/api/agent/runs/" + jobId + "/cancel", {}).catch((error: unknown) => setError(error instanceof Error ? error.message : "Cancellation failed."))}>Cancel</button>}</div>
    {state && <div aria-live="polite"><p><strong>{state.stage}</strong> · {state.state} · {state.run?.calls.length ?? 0} model requests {state.run?.reason && <code>{state.run.reason}</code>}</p>{state.message && <p>{state.message}</p>}
      <ol className="work-sample-events">{state.run?.events.map((event, index) => <li key={index}><span>{event.state}</span>{event.tool && <code>{event.tool}</code>}{event.operationId && <code>{event.operationId}</code>}{event.rowCount !== undefined && <span>{event.rowCount} rows</span>}{event.code && <code>{event.code}</code>}</li>)}</ol>
      {state.run?.result && <><h3>Shortage report</h3><div className="table-scroll"><table className="data-table"><thead><tr>{["sku", "demandEach", "onHandEach", "shortageEach"].map((field) => <th key={field} scope="col">{field}</th>)}</tr></thead><tbody>{state.run.result.map((row, index) => <tr key={index}>{["sku", "demandEach", "onHandEach", "shortageEach"].map((field) => <td key={field}>{String(row[field] ?? "")}</td>)}</tr>)}</tbody></table></div><p className="pane-caption">Saved locally under <code>artifacts/agent-runs/{state.jobId}/shortage-report.json</code>.</p></>}
    </div>}
  </section>;
}
