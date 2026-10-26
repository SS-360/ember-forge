import { useCallback, useEffect, useMemo, useState } from "react";
import { Glyph } from "./components/Glyph.js";
import { ProcedurePane } from "./components/ProcedurePane.js";
import { RunEvidence } from "./components/RunEvidence.js";
import { RunFixtureDialog, type FixtureRunInput } from "./components/RunFixtureDialog.js";
import { VerificationExport } from "./components/VerificationExport.js";
import { CompilationSources } from "./components/CompilationSources.js";
import { SkillLibrary } from "./components/SkillLibrary.js";
import { WorkSample } from "./components/WorkSample.js";
import { ZetarisStock } from "./components/ZetarisStock.js";
import { FulfilmentStudio } from "./components/FulfilmentStudio.js";
import { WorkspaceNavigation, type WorkspaceView } from "./components/WorkspaceNavigation.js";
import { rejectionExplanation } from "./procedure-summary.js";
import type {
  CandidateSummary, CompilerReadiness, HealthPayload, PackagePreview, RunRecord, SkillPayload, TraceRecord, VerificationCaseDetail, VerificationReport
} from "./types.js";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  if (!response.ok) {
    let message = "Request failed (" + response.status + ")";
    try {
      const error = await response.json() as { message?: string; error?: string };
      message = error.message ?? error.error ?? message;
    } catch { /* Keep the HTTP fallback message. */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function App() {
  const [view, setView] = useState<WorkspaceView>("workbench");
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [comparedRunIds, setComparedRunIds] = useState<string[]>([]);
  const [skillPayload, setSkillPayload] = useState<SkillPayload | null>(null);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [traces, setTraces] = useState<TraceRecord[]>([]);
  const [selectedTraceIds, setSelectedTraceIds] = useState<string[]>([]);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [caseDetails, setCaseDetails] = useState<VerificationCaseDetail[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PackagePreview | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [snapshotSampleId, setSnapshotSampleId] = useState("");
  const [readiness, setReadiness] = useState<CompilerReadiness | null>(null);
  const [compilerJob, setCompilerJob] = useState<{ jobId: string; stage: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextHealth, nextRuns, nextSkill, nextTraces, nextCandidates, nextReadiness] = await Promise.all([
        api<HealthPayload>("/api/health"),
        api<RunRecord[]>("/api/runs"),
        api<SkillPayload>("/api/workspace"),
        api<TraceRecord[]>("/api/traces"),
        api<CandidateSummary[]>("/api/candidates"),
        api<CompilerReadiness>("/api/compiler/readiness").catch(() => null)
      ]);
      const candidatePath = "/api/skills/" + encodeURIComponent(nextSkill.skill.id);
      const [nextPreview, nextCaseDetails] = await Promise.all([
        api<PackagePreview>(candidatePath + "/preview?candidateHash=" + encodeURIComponent(nextSkill.verification.candidateHash)).catch(() => null),
        api<VerificationCaseDetail[]>(candidatePath + "/verification-cases")
      ]);

      setHealth(nextHealth);
      setReadiness(nextReadiness);
      setRuns(nextRuns);
      setSkillPayload(nextSkill);
      setCandidates(nextCandidates);
      setTraces(nextTraces);
      setSelectedTraceIds((current) => {
        const retained = current.filter((id) => nextTraces.some((trace) => trace.traceId === id));
        return retained.length ? retained.slice(0, 32) : nextTraces.slice(0, 32).map((trace) => trace.traceId);
      });
      setCaseDetails(nextCaseDetails);
      setPreview(nextPreview);
      setSelectedRunId((current) => current && nextRuns.some((run) => run.id === current)
        ? current
        : nextRuns.find((run) => run.status === "succeeded")?.id ?? nextRuns[0]?.id ?? null);
      setComparedRunIds((current) => {
        const retained = current.filter((id) => nextRuns.some((run) => run.id === id)).slice(0, 2);
        if (retained.length) return retained;
        const success = nextRuns.find((run) => run.status === "succeeded");
        const unsupported = nextRuns.find((run) => run.status === "unsupported");
        return success && unsupported ? [success.id, unsupported.id] : nextRuns.slice(0, 2).map((run) => run.id);
      });
      setSelectedCaseId((current) => current && nextSkill.verification.cases.some((item) => item.caseId === current)
        ? current
        : nextSkill.verification.cases.find((item) => item.caseId === "dev-unknown-unit")?.caseId ?? nextSkill.verification.cases[0]?.caseId ?? null);
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const agentRecorded = useCallback(async (ids: string[]) => {
    await refresh();
    if (ids.length) setSelectedTraceIds(ids);
  }, [refresh]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId]
  );
  const comparedRuns = useMemo(
    () => comparedRunIds.map((id) => runs.find((run) => run.id === id)).filter((run): run is RunRecord => Boolean(run)),
    [comparedRunIds, runs]
  );

  function toggleComparison(runId: string, checked: boolean) {
    setComparedRunIds((current) => {
      if (checked) return current.includes(runId) || current.length >= 2 ? current : [...current, runId];
      return current.filter((id) => id !== runId);
    });
  }

  async function runExample(input: FixtureRunInput) {
    setBusy(true);
    setNotice(null);
    try {
      const run = await api<RunRecord>("/api/tasks/run", { method: "POST", body: JSON.stringify(input) });
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      setSelectedRunId(run.id);
      setView("workbench");
      setRunDialogOpen(false);
      setNotice(run.status === "succeeded" ? "Synthetic reference run recorded." : "Input rejected with " + (run.reason ?? "an unsupported condition") + ".");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function runVerification(): Promise<void> {
    if (!skillPayload) return;
    setBusy(true);
    setNotice(null);
    setApiError(null);
    try {
      const candidatePath = "/api/skills/" + encodeURIComponent(skillPayload.skill.id);
      const report = await api<VerificationReport>(candidatePath + "/verify", { method: "POST", body: "{}" });
      setSkillPayload((current) => current ? { ...current, verification: report } : current);
      const nextPreview = await api<PackagePreview>(
        candidatePath + "/preview?candidateHash=" + encodeURIComponent(report.candidateHash)
      ).catch(() => null);
      setPreview(nextPreview);
      setView("verification");
      setNotice(report.status === "validated" ? "The candidate passed the finite development suite." : "The candidate did not pass every development case.");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveTraces(payload: unknown): Promise<void> {
    const result = await api<{ imported: number; existing: number; traces: TraceRecord[] }>("/api/traces/import", { method: "POST", body: JSON.stringify(payload) });
    const nextTraces = await api<TraceRecord[]>("/api/traces");
    setTraces(nextTraces);
    setSelectedTraceIds(result.traces.map((trace) => trace.traceId).slice(0, 32));
    setNotice(result.imported + " sanitized traces imported" + (result.existing ? "; " + result.existing + " already present." : ".") + " Trace labels remain provenance assertions until candidate verification.");
  }

  async function importTraces(payload: unknown): Promise<void> {
    setBusy(true); setApiError(null); setNotice(null);
    try { await saveTraces(payload); }
    catch (error) { setApiError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function loadReplayExamples(): Promise<void> {
    setBusy(true); setApiError(null); setNotice(null);
    try { await saveTraces(await api<unknown>("/api/traces/replay-examples")); }
    catch (error) { setApiError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function compileTraces(skillId: string, method: "assembly" | "synthesis"): Promise<void> {
    setBusy(true); setApiError(null); setNotice(null);
    try {
      if (method === "synthesis") {
        const started = await api<{ jobId: string }>("/api/compiler/jobs", { method: "POST", body: JSON.stringify({ skillId, traceIds: selectedTraceIds }) });
        setCompilerJob({ jobId: started.jobId, stage: "queued" });
        for (let poll = 0; poll < 270; poll++) {
          const job = await api<{ state: string; stage: string; packageError?: string; error?: string; result?: { failure?: { message: string } } }>("/api/compiler/jobs/" + started.jobId);
          setCompilerJob({ jobId: started.jobId, stage: job.stage });
          if (job.state !== "running") {
            await refresh(); setView("verification");
            setNotice(job.packageError ?? job.result?.failure?.message ?? job.error ?? "Synthesis job " + job.state + ". Inspect the candidate and its verification evidence.");
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        throw new Error("The job is still pending. Inspect /api/compiler/jobs/" + started.jobId + " before starting another.");
      }
      const result = await api<SkillPayload & { packageError?: string }>("/api/skills/compile", { method: "POST", body: JSON.stringify({ skillId, traceIds: selectedTraceIds }) });
      setSkillPayload(result);
      await refresh();
      setView("verification");
      setNotice(result.packageError ?? (result.verification.status === "validated"
        ? "Candidate assembled from selected operation traces. The finite development suite and offline package checks passed."
        : "Candidate saved with failed development checks. Inspect its report before revising the traces."));
    } catch (error) { setApiError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); setCompilerJob(null); }
  }

  async function cancelCompilation() {
    if (!compilerJob) return;
    try { await api("/api/compiler/jobs/" + compilerJob.jobId + "/cancel", { method: "POST", body: "{}" }); }
    catch (error) { setApiError(error instanceof Error ? error.message : "Cancellation failed."); }
  }

  async function selectCandidate(skillId: string): Promise<void> {
    setBusy(true); setApiError(null); setNotice(null);
    try {
      await api<SkillPayload>("/api/workspace/candidate", { method: "POST", body: JSON.stringify({ skillId }) });
      await refresh();
    } catch (error) { setApiError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function downloadSkill(): Promise<void> {
    if (!skillPayload) return;
    setBusy(true);
    setApiError(null);
    try {
      const skill = skillPayload.skill;
      const hash = skillPayload.verification.candidateHash;
      const response = await fetch("/api/skills/" + encodeURIComponent(skill.id) + "/export?candidateHash=" + encodeURIComponent(hash));
      if (!response.ok) {
        let message = "Export failed (" + response.status + ")";
        try { message = (await response.json() as { message?: string }).message ?? message; } catch { /* Keep the HTTP fallback. */ }
        throw new Error(message);
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = skill.id + "-" + skill.version + "-agent-skill.tar.gz";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setNotice("Verified Agent Skill package downloaded.");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const exportCurrent = Boolean(skillPayload &&
    skillPayload.verification.status === "validated" &&
    preview?.candidateHash === skillPayload.verification.candidateHash);
  const viewHeading = view === "workbench" ? "Your skill workspace" : view === "verification" ? "Verification" : "Your skill library";
  const viewDescription = view === "workbench" ? "Turn repeated work into a skill you can inspect, verify, and reuse." : view === "verification" ? "Understand what your skill supports before putting it to work." : "Keep verified skills close. Run new tasks with confidence.";
  const suggestedName = useMemo(() => {
    const names = new Set(candidates.map((candidate) => candidate.id));
    const base = "stock-reconciliation-compiled";
    if (!names.has(base)) return base;
    let suffix = 2;
    while (names.has(base + "-" + suffix)) suffix++;
    return base + "-" + suffix;
  }, [candidates]);

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-lockup"><img src="/ember-forge.svg" className="brand-mark" width="34" height="34" alt="" /><span>Ember Forge</span></div>
      <WorkspaceNavigation view={view} onChange={setView} />
      <div className="topbar-action">
        <button className="button button--secondary" type="button" disabled={!exportCurrent || busy} onClick={() => void downloadSkill()}><Glyph name="download" />Export skill</button>
      </div>
    </header>
    <div className="workspace-heading">
      <div className="workspace-title"><h1>{viewHeading}</h1><p>{viewDescription}</p></div>
        <div className="candidate-context">
          <label htmlFor="current-skill-candidate">Current candidate</label>
          <div className="candidate-controls">
          {skillPayload ? <select id="current-skill-candidate" className="candidate-select" aria-label="Current skill candidate" value={skillPayload.skill.id} disabled={busy} onChange={(event) => void selectCandidate(event.target.value)}>
            {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.id}{candidate.status === "rejected" ? " · rejected" : ""}</option>)}
          </select> : <code>Loading…</code>}
          <code className="version-code">v{skillPayload?.skill.version ?? "—"}</code>
          </div>
          <span className="origin-label">{skillPayload?.verification.candidateOrigin === "nemotron_synthesis" ? "Nemotron synthesis" : skillPayload?.verification.candidateOrigin === "test_synthesis" ? "Test-only synthesis" : skillPayload?.lineage ? "Trace assembly" : "Development seed"}</span>
        </div>
    </div>

    <div className="source-banner" role="note">
      <Glyph name="info" />
      <div><strong>Local workspace</strong><span>Local sources. Replay examples are synthetic; original agent runs require explicit provider authorization.</span></div>
    </div>

    {apiError && <div className="alert alert--error" role="alert"><Glyph name="reject" /><span>{apiError}</span><button className="text-button" type="button" onClick={() => void refresh()}>Retry</button></div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    {compilerJob && <div className="notice" role="status">Synthesis: {compilerJob.stage} <code>{compilerJob.jobId}</code><button className="text-button" type="button" onClick={() => void cancelCompilation()}>Cancel compilation</button></div>}
    {loading && !apiError ? <div className="loading-state" role="status">Loading local workspace…</div> : null}

    {!loading && skillPayload && view === "workbench" && <main className="workbench-view">
      <ZetarisStock busy={busy || compilerJob !== null} onSnapshot={(id) => { setSnapshotSampleId(id); setNotice("Source snapshot saved and selected. Observe its agent run to collect compilation evidence."); }} />
      <FulfilmentStudio />
      <WorkSample key={snapshotSampleId} initialSampleId={snapshotSampleId} busy={busy || compilerJob !== null} onRecorded={agentRecorded} />
      <CompilationSources traces={traces} selectedIds={selectedTraceIds} busy={busy} readiness={readiness} suggestedName={suggestedName}
        onToggle={(id, checked) => setSelectedTraceIds((current) => checked ? [...new Set([...current, id])].slice(0, 32) : current.filter((traceId) => traceId !== id))}
        onImport={importTraces} onLoadExamples={() => void loadReplayExamples()} onCompile={(skillId, method) => void compileTraces(skillId, method)} />
      <section className="workbench-grid" aria-label="Skill compilation workbench">
        <aside className="trace-pane" aria-labelledby="runs-title">
          <div className="pane-heading trace-pane-heading">
            <h2 id="runs-title">Reference runs <span>({runs.length})</span></h2>
            <button className="icon-button" type="button" aria-label="Record a fixture run" title="Record a fixture run" onClick={() => setRunDialogOpen(true)}><Glyph name="plus" /></button>
          </div>
          <p className="pane-caption">Compare fixture results here. Choose compiler inputs in Compilation traces.</p>
          <div className="run-list">
            {runs.map((run) => {
              const isSelected = run.id === selectedRunId;
              const isCompared = comparedRunIds.includes(run.id);
              const compareDisabled = !isCompared && comparedRunIds.length >= 2;
              return <div className={["run-entry", isSelected ? "run-entry--selected" : ""].join(" ")} key={run.id}>
                <button className="run-entry-main" type="button" aria-current={isSelected ? "true" : undefined} onClick={() => setSelectedRunId(run.id)}>
                  <span className={"status-mark status-mark--" + run.status}><Glyph name={run.status === "succeeded" ? "check" : "reject"} /></span>
                  <span className="run-entry-copy">
                    <span className="run-entry-meta"><code>{new Date(run.createdAt).toLocaleString()}</code><code>{run.id.slice(0, 8)}…</code></span>
                    <strong>{run.status === "succeeded" ? "Success" : run.status === "unsupported" ? "Unsupported" : "Failed"}</strong>
                    <span>{run.status === "succeeded" ? (run.parameters?.warehouseId ? "Warehouse " + run.parameters.warehouseId : run.taskName) : rejectionExplanation(run.reason)}</span>
                    <small>{run.reason ?? run.outcomeSummary}</small>
                  </span>
                </button>
                <label className="compare-toggle" title="Include this run in comparison">
                  <input type="checkbox" checked={isCompared} disabled={compareDisabled} onChange={(event) => toggleComparison(run.id, event.target.checked)} aria-label={"Compare run " + run.id} />
                </label>
              </div>;
            })}
            {!runs.length && <div className="empty-state"><strong>No runs recorded</strong><span>Use the plus button to record a synthetic example.</span></div>}
          </div>
        </aside>
        <RunEvidence run={selectedRun} />
        <ProcedurePane payload={skillPayload} />
      </section>

      <section className="compare-footer" aria-label="Selected run comparison">
        <div className="compare-footer-title"><h2>Reference-run comparison</h2><p>For inspection only. These checkboxes do not select compiler inputs.</p></div>
        <div className="compare-slots">{[0, 1].map((slot) => {
          const run = comparedRuns[slot];
          return <div className="compare-slot" key={slot}>
            {run ? <><StatusBadge status={run.status} /><div><code>{run.id.slice(0, 8)}…</code><span>{run.parameters ? `${run.parameters.warehouseId} · ${run.parameters.fromDate} → ${run.parameters.throughDate}` : "Input metadata was not recorded"}</span><strong>{run.status === "succeeded" ? "Success" : run.reason ?? run.status}</strong></div></> : <span className="compare-slot-empty">Choose a reference run to compare</span>}
          </div>;
        })}</div>
        <button className="button button--primary" type="button" disabled={busy || !skillPayload} onClick={() => void runVerification()}><Glyph name="scale" />{busy ? "Working…" : "Verify candidate"}</button>
      </section>
    </main>}

    {!loading && skillPayload && view === "verification" && <main className="verification-view">
      <VerificationExport
        report={skillPayload?.verification ?? null}
        caseDetails={caseDetails}
        preview={preview}
        selectedCaseId={selectedCaseId}
        busy={busy}
        codexDiscovered={Boolean(skillPayload?.harnessChecks?.some((check) => check.harness === "codex" && check.candidateHash === skillPayload.verification.candidateHash && check.discovery === "verified"))}
        codexExecuted={Boolean(skillPayload?.harnessChecks?.some((check) => check.harness === "codex" && check.candidateHash === skillPayload.verification.candidateHash && check.execution === "verified"))}
        claudeExecuted={Boolean(skillPayload?.harnessChecks?.some((check) => check.harness === "claude" && check.candidateHash === skillPayload.verification.candidateHash && check.execution === "verified"))}
        onSelectCase={setSelectedCaseId}
        onVerify={() => void runVerification()}
        onExport={() => void downloadSkill()}
      />
    </main>}

    {!loading && skillPayload && view === "library" && <main className="library-main"><SkillLibrary candidateId={skillPayload.skill.id} verified={skillPayload.verification.status === "validated"} /></main>}

    <footer className="app-footer">
      <span>Local stock-reconciliation prototype · inspect each run’s source and model evidence</span>
      <span>{health?.database === "sqlite" ? "Run history stored locally" : "Local API unavailable"}</span>
    </footer>
    {runDialogOpen && <RunFixtureDialog busy={busy} onClose={() => setRunDialogOpen(false)} onSubmit={(input) => void runExample(input)} />}
  </div>;
}

function StatusBadge({ status }: { status: RunRecord["status"] }) {
  return <span className={"status-mark status-mark--" + status}><Glyph name={status === "succeeded" ? "check" : "reject"} /></span>;
}

export default App;
