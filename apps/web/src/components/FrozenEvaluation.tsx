import { useEffect, useState } from "react";

interface FrozenReport {
  status: "not_run" | "passed" | "failed"; candidateHash: string;
  supportedCorrect?: number; supportedTotal?: number; rejectedUnsupported?: number; unsupportedTotal?: number;
  falseAcceptances?: number; frozenSplitHash?: string; completedAt?: string; limitations?: string[];
  timings?: Array<{ caseId: string; repeat: number; referenceMs: number; compiledMs: number }>;
}
export function FrozenEvaluation({ skillId, candidateHash, verified }: { skillId: string; candidateHash: string; verified: boolean }) {
  const [report, setReport] = useState<FrozenReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = "/api/skills/" + encodeURIComponent(skillId) + "/frozen-evaluation";
  useEffect(() => {
    const controller = new AbortController();
    setReport(null); setError(null);
    void fetch(url, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Frozen evaluation status is unavailable.");
      const result = await response.json() as FrozenReport;
      if (!controller.signal.aborted && result.candidateHash === candidateHash) setReport(result);
    }).catch((error: unknown) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Evaluation unavailable."); });
    return () => controller.abort();
  }, [url, candidateHash]);
  async function run() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json() as FrozenReport & { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Frozen evaluation failed.");
      if (result.candidateHash !== candidateHash) throw new Error("Candidate changed during evaluation. Reload this report.");
      setReport(result);
    } catch (error) { setError(error instanceof Error ? error.message : "Evaluation unavailable."); }
    finally { setBusy(false); }
  }
  return <section className="frozen-evaluation" aria-labelledby="frozen-evaluation-title">
    <div className="section-title-row"><div><h2 id="frozen-evaluation-title">Frozen evaluation</h2><p>Freeze new synthetic inputs after development. This candidate keeps the first split and its result, including failures.</p></div>
      <button className="button button--secondary" type="button" disabled={busy || !verified || Boolean(report && report.status !== "not_run")} onClick={() => void run()}>{busy ? "Evaluating…" : report && report.status !== "not_run" ? "Result retained" : "Freeze and evaluate"}</button></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {report && report.status !== "not_run" ? <>
      <p role="status"><strong>{report.status === "passed" ? "Passed" : "Failed"}</strong> · {report.supportedCorrect}/{report.supportedTotal} supported correct · {report.rejectedUnsupported}/{report.unsupportedTotal} unsupported rejected · {report.falseAcceptances} false acceptances.</p>
      <code className="frozen-hash">split {report.frozenSplitHash}</code>
      <details><summary>Scope, limitations and local timings</summary><ul>{report.limitations?.map((item) => <li key={item}>{item}</li>)}</ul><pre>{JSON.stringify(report.timings, null, 2)}</pre></details>
    </> : <p className="pane-caption">No frozen report is recorded in this panel. This evaluation runs only the compiled procedure and makes no model calls.</p>}
  </section>;
}
