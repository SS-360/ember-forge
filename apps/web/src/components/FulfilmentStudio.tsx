import { useEffect, useState } from "react";

type Policy = { schemaVersion: "emberforge.fulfilment-policy/1"; id: string; version: "0.1.0"; graceDays: number; includeIncomplete: boolean };
type Result = { status: string; taskFamily: string; sourceMode: string; asOfDate: string; policyId: string; modelCalls: number; origin: string; records: Array<{ orderId: string; sku: string; ordered: number; shipped: number; remaining: number; reason: string; overdueDays: number }> };

export function FulfilmentStudio() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/fulfilment/example").then(async (response) => { const value = await response.json(); if (!response.ok) throw Error(value.error); setPolicy(value.policy); setInput(JSON.stringify(value.input, null, 2)); }).catch(() => setError("The local fulfilment example is unavailable.")); }, []);
  async function run() {
    if (!policy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const source = JSON.parse(input);
      const response = await fetch("/api/fulfilment/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policy, input: source }) });
      const value = await response.json();
      if (!response.ok) throw Error(value.error ?? "RUN_FAILED");
      setResult(value);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Input could not be processed."); }
    finally { setBusy(false); }
  }
  async function download() {
    if (!policy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/fulfilment/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policy }) });
      if (!response.ok) { const value = await response.json(); throw Error(value.error ?? "EXPORT_FAILED"); }
      const url = URL.createObjectURL(await response.blob()), link = document.createElement("a");
      link.href = url; link.download = `fulfilment-${policy.id}-0.1.0.tar.gz`; link.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The configured skill could not be exported."); }
    finally { setBusy(false); }
  }
  return <details className="compilation-sources work-sample">
    <summary>Second workflow · fulfilment exceptions</summary>
    <h2>Review delayed and incomplete orders</h2>
    <p className="pane-caption">A configurable workflow template for an orders and shipment snapshot. Name the policy, adjust its grace rule, inspect refusals, then export a portable Agent Skill with those settings. This template has its own schema and does not claim model synthesis.</p>
    {policy && <div className="work-sample-controls">
      <label className="field"><span>Policy id</span><input value={policy.id} maxLength={48} pattern="[a-z][a-z0-9-]{0,47}" onChange={(event) => setPolicy({ ...policy, id: event.target.value })} /></label>
      <label className="field"><span>Grace period · days</span><input type="number" min="0" max="30" value={policy.graceDays} onChange={(event) => setPolicy({ ...policy, graceDays: Number(event.target.value) })} /></label>
      <label className="field"><span>Report incomplete orders</span><select value={String(policy.includeIncomplete)} onChange={(event) => setPolicy({ ...policy, includeIncomplete: event.target.value === "true" })}><option value="true">Yes</option><option value="false">Only overdue</option></select></label>
      <button type="button" className="button button--primary" disabled={busy} onClick={() => void run()}>{busy ? "Checking snapshot…" : "Run fulfilment check"}</button>
      <button type="button" className="button button--secondary" disabled={busy} onClick={() => void download()}>{busy ? "Preparing skill…" : "Download configured skill"}</button>
    </div>}
    <label className="field"><span>Orders and shipments snapshot · JSON</span><textarea rows={10} spellCheck={false} value={input} onChange={(event) => setInput(event.target.value)} aria-label="Orders and shipment snapshot JSON" /></label>
    {error && <p role="alert" className="inline-error">{error}</p>}
    {result && <div aria-live="polite"><p>Check complete · {result.records.length} exception{result.records.length === 1 ? "" : "s"} · {result.sourceMode} · {result.modelCalls} model calls · configured template</p><div className="table-scroll"><table className="data-table"><thead><tr><th>Order</th><th>Item</th><th>Shipped / ordered</th><th>Remaining</th><th>Reason</th></tr></thead><tbody>{result.records.map((record) => <tr key={record.orderId}><td>{record.orderId}</td><td>{record.sku}</td><td>{record.shipped} / {record.ordered}</td><td>{record.remaining}</td><td>{record.reason}{record.overdueDays ? ` · ${record.overdueDays} days` : ""}</td></tr>)}{!result.records.length && <tr><td colSpan={5}>No exceptions matched this policy.</td></tr>}</tbody></table></div><p className="pane-caption">The exported runner handles the same contract offline. Review its assumptions before using a different source schema.</p></div>}
  </details>;
}
