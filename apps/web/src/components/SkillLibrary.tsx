import { useCallback, useEffect, useState } from "react";
import { rejectionExplanation } from "../procedure-summary.js";

interface Entry {
  skillId: string; skillVersion: string; status: string; candidateHash: string;
  policyVersion: string; memoryId: string; evidenceIds: string[]; invalidatedReason?: string;
}
interface Execution {
  runId: string; status: string; reason?: string; modelCallCount: number; durationMs: number;
  candidate?: { skillId: string; skillVersion: string; memoryId: string };
  result?: Array<Record<string, unknown>>; artifact: string;
  retrieval: { strategy: string; retrievalReason: string; nominatedMemoryIds: string[] };
  rejections: Array<{ skillId: string; reason: string }>;
  sequence?: string[];
  nextAction?: string;
}
async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json() as T & { message?: string; error?: string };
  if (!response.ok) throw new Error(data.message ?? data.error ?? "Local request failed.");
  return data;
}

export function SkillLibrary({ candidateId, verified }: { candidateId: string; verified: boolean }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState("stock reconciliation");
  const [inputText, setInputText] = useState("");
  const [execution, setExecution] = useState<Execution | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => { setEntries(await request<Entry[]>("/api/library")); }, []);
  useEffect(() => { void load().catch((error: unknown) => setError(error instanceof Error ? error.message : "Library unavailable.")); }, [load]);
  async function register() {
    setBusy(true); setError(null); setNotice(null);
    try {
      await request("/api/library/register", { skillId: candidateId });
      await load(); setNotice("Verified candidate registered in local H-MEM.");
    } catch (error) { setError(error instanceof Error ? error.message : "Registration failed."); }
    finally { setBusy(false); }
  }
  async function example() {
    setBusy(true); setError(null);
    try { setInputText(JSON.stringify(await request("/api/library/example"), null, 2)); }
    catch (error) { setError(error instanceof Error ? error.message : "Example unavailable."); }
    finally { setBusy(false); }
  }
  async function execute() {
    setBusy(true); setError(null); setNotice(null); setExecution(null);
    try {
      if (new Blob([inputText]).size > 900000) throw new Error("Use an input smaller than 900 KB.");
      const input = JSON.parse(inputText) as Record<string, unknown>;
      const result = await request<Execution>("/api/library/execute", { query, parameters: input.parameters, dataset: input.dataset });
      setExecution(result); await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Execution failed."); }
    finally { setBusy(false); }
  }
  return <div className="library-view">
    <section className="library-registry" aria-labelledby="library-title">
      <div className="section-title-row"><div><h2 id="library-title">Skill library</h2><p>H-MEM nominates verified skills. The runtime checks applicability and artifact hashes before execution.</p></div>
        <button className="button button--secondary" type="button" disabled={busy || !verified} onClick={() => void register()}>Register current candidate</button></div>
      <p className="pane-caption">Current candidate: <code>{candidateId}</code>. Registration repeats development verification. A deprecated version requires a new candidate version.</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {entries.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th scope="col">Skill</th><th scope="col">Status</th><th scope="col">Policy</th><th scope="col">Evidence</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.memoryId}>
        <td>{entry.skillId}<small className="library-version">v{entry.skillVersion}</small></td><td>{entry.status}{entry.invalidatedReason && <small className="library-version">{rejectionExplanation(entry.invalidatedReason)} <code>{entry.invalidatedReason}</code></small>}</td><td><code>{entry.policyVersion}</code></td><td><code title={entry.candidateHash}>{entry.candidateHash.slice(0, 12)}…</code><small className="library-version">{entry.evidenceIds.length} evidence references</small></td>
      </tr>)}</tbody></table></div> : <div className="empty-inline">No verified skills registered. Register the current passing candidate to make it available for retrieval.</div>}
    </section>
    <section className="library-execution" aria-labelledby="library-execution-title">
      <div className="section-title-row"><div><h2 id="library-execution-title">Run a task from memory</h2><p>Supply new compatible data. Missing or stale skills return a reason; model fallback is disabled.</p></div><button type="button" className="button button--quiet" disabled={busy} onClick={() => void example()}>Load synthetic input</button></div>
      <div className="library-execution-grid"><form className="library-input" onSubmit={(event) => { event.preventDefault(); void execute(); }}>
        <label className="field"><span>Task for retrieval</span><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={500} minLength={3} required disabled={busy} /></label>
        <label className="field"><span>Parameters and dataset · JSON</span><textarea value={inputText} onChange={(event) => setInputText(event.target.value)} rows={15} required disabled={busy} spellCheck={false} placeholder='{"parameters": {...}, "dataset": {...}}' /></label>
        <button className="button button--primary" type="submit" disabled={busy || !inputText.trim()}>{busy ? "Working…" : "Retrieve and execute"}</button>
      </form><div className="library-result" aria-live="polite">
        {execution ? <><h3>{execution.status === "succeeded" ? "Executed from verified memory" : "Compatible skill required"}</h3>
          {execution.reason && <p>{rejectionExplanation(execution.reason)} <code>{execution.reason}</code></p>}
          {execution.nextAction && <p>{execution.nextAction}</p>}
          {execution.sequence && <p className="pane-caption">{execution.sequence.map((step) => step.replaceAll("_", " ")).join(" → ")}</p>}
          {execution.candidate && <p className="pane-caption">Accepted H-MEM entry <code>{execution.candidate.memoryId}</code> after artifact hash and input contract checks.</p>}
          {execution.rejections.map((item, index) => <p className="pane-caption" key={index}>{item.skillId}: {rejectionExplanation(item.reason)} <code>{item.reason}</code></p>)}
          <dl className="contract-strip"><div><dt>Model calls</dt><dd>{execution.modelCallCount}</dd></div><div><dt>Total duration</dt><dd>{execution.durationMs.toFixed(2)} ms</dd></div><div><dt>Selected skill</dt><dd>{execution.candidate?.skillId ?? "None"}</dd></div><div><dt>Retrieval</dt><dd>{execution.retrieval.strategy}</dd></div></dl>
          {execution.result && <pre>{JSON.stringify(execution.result, null, 2)}</pre>}
          <details><summary>Retrieval and execution evidence</summary><pre>{JSON.stringify(execution, null, 2)}</pre></details>
        </> : <p className="empty-inline">Execution results and retrieval evidence appear here. Inputs remain local; this path makes no provider calls.</p>}
      </div></div>
    </section>
  </div>;
}
