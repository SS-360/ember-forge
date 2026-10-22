import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

type Page = "setup" | "history" | "compiler" | "verification" | "library";
type RunStatus = "succeeded" | "unsupported" | "failed";

interface RunRecord {
  id: string;
  taskName: string;
  taskFamily: string;
  status: RunStatus;
  sourceMode: string;
  executor: string;
  inputSummary: string;
  outcomeSummary: string;
  reason?: string;
  modelCallCount: number;
  createdAt: string;
  result?: { lines?: Array<{ sku: string; demandEach: number; onHandEach: number; shortageEach: number }> };
  artifactPath?: string;
  limitation: string;
}

interface VerificationCase {
  caseId: string;
  expectedOutcome: "supported" | "unsupported";
  actualOutcome: string;
  passed: boolean;
  expectedReason?: string;
  actualReason?: string;
}

interface VerificationReport {
  status: "validated" | "rejected";
  candidateHash: string;
  supportedCaseCount: number;
  correctSupportedCount: number;
  unsupportedCaseCount: number;
  rejectedUnsupportedCount: number;
  falseAcceptanceCount: number;
  needlessFallbackCount: number;
  coverage: number;
  scope: string;
  cases: VerificationCase[];
}

interface SkillPayload {
  skill: {
    id: string;
    version: string;
    taskFamily: string;
    ir: { operations: Array<{ id: string; kind: string; source?: string }> };
  };
  contract: {
    policyVersion: string;
    sourceSchemaVersions: Record<string, string>;
    supportedSourceModes: string[];
    maxRows: number;
    maxRuntimeMs: number;
    assumptions: string[];
  };
  verification: VerificationReport;
}

interface HealthPayload {
  status: string;
  mode: string;
  database: string;
  nvidiaConfigured: boolean;
  zetarisConfigured: boolean;
  liveNemotronExecution: boolean;
  liveZetarisQueries: boolean;
}

const navigation: Array<{ id: Page; label: string; icon: string }> = [
  { id: "setup", label: "Task Setup", icon: "setup" },
  { id: "history", label: "Execution History", icon: "history" },
  { id: "compiler", label: "Skill Compiler", icon: "compiler" },
  { id: "verification", label: "Verification", icon: "verification" },
  { id: "library", label: "Skill Library", icon: "library" }
];

const pageCopy: Record<Page, { title: string; subtitle: string }> = {
  setup: {
    title: "Create a reusable skill",
    subtitle: "Reconcile open order demand against warehouse inventory, then compile the validated procedure into a downloadable skill."
  },
  history: {
    title: "Execution history",
    subtitle: "Review recorded task outcomes and the evidence retained for each run."
  },
  compiler: {
    title: "Skill compiler",
    subtitle: "Inspect the bounded procedure, contract, and evidence before registering or exporting it."
  },
  verification: {
    title: "Verification",
    subtitle: "Check the candidate against supported examples and explicit rejection cases."
  },
  library: {
    title: "Skill library",
    subtitle: "Browse validated procedures, inspect their limits, and export a portable package."
  }
};

const operationGroups = [
  { title: "Read orders", detail: "Load order rows from the orders/v1 schema." },
  { title: "Filter eligible orders", detail: "Keep open orders for the requested warehouse and date range." },
  { title: "Normalize aliases and units", detail: "Apply approved product aliases and the explicit conversion table." },
  { title: "Aggregate demand", detail: "Sum converted quantities by canonical product." },
  { title: "Join inventory", detail: "Match demand to a unique inventory snapshot for the warehouse." },
  { title: "Calculate shortage", detail: "Compute the nonnegative difference between demand and stock on hand." },
  { title: "Validate and emit", detail: "Check output fields and identities before returning results." }
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const error = await response.json() as { message?: string; error?: string };
      message = error.message ?? error.error ?? message;
    } catch { /* Keep the HTTP fallback message. */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function Glyph({ name }: { name: string }) {
  const shared = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, ReactNode> = {
    setup: <><path d="M4 5.5h16M4 12h16M4 18.5h10" /><circle cx="7" cy="5.5" r="1.4" /><circle cx="16" cy="18.5" r="1.4" /></>,
    history: <><path d="M3.8 11a8.2 8.2 0 1 1 2.4 5.8" /><path d="M3.8 5.5V11h5.5M12 7v5l3.4 2" /></>,
    compiler: <><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></>,
    verification: <><path d="m5 12 4.2 4.2L19 6.5" /><circle cx="12" cy="12" r="9" /></>,
    library: <><path d="M5 4.5h12a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2z" /><path d="M5 17.5a2 2 0 0 1 2-2h12M9 8h6M9 11h6" /></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    check: <path d="m5 12 4.1 4.1L19 6.5" />,
    error: <><path d="M12 8v5m0 3h.01" /><circle cx="12" cy="12" r="9" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.5" /><path d="m16 16 4.5 4.5" /></>
  };
  return <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true" {...shared}>{paths[name] ?? paths.setup}</svg>;
}

function StatusMark({ status }: { status: "succeeded" | "unsupported" | "failed" }) {
  return <span className={`status-mark status-mark--${status}`} aria-label={status}>
    <Glyph name={status === "succeeded" ? "check" : "error"} />
  </span>;
}

function OutcomePill({ status }: { status: RunStatus }) {
  const label = status === "succeeded" ? "Passed" : status === "unsupported" ? "Rejected" : "Failed";
  return <span className={`outcome outcome--${status}`}>{label}</span>;
}

function App() {
  const [page, setPage] = useState<Page>("setup");
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [skillPayload, setSkillPayload] = useState<SkillPayload | null>(null);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextHealth, nextRuns, nextSkill] = await Promise.all([
        api<HealthPayload>("/api/health"),
        api<RunRecord[]>("/api/runs"),
        api<SkillPayload>("/api/skills/stock-reconciliation")
      ]);
      setHealth(nextHealth);
      setRuns(nextRuns);
      setSkillPayload(nextSkill);
      setSelectedRunId((current) => current && nextRuns.some((run) => run.id === current) ? current : nextRuns[0]?.id ?? null);
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selectedRun = useMemo(() => runs.find((run) => run.id === selectedRunId) ?? null, [runs, selectedRunId]);
  const latestRuns = useMemo(() => runs.slice(0, 2), [runs]);

  async function runExample(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice(null);
    try {
      const run = await api<RunRecord>("/api/tasks/run", {
        method: "POST",
        body: JSON.stringify({
          taskName: form.get("taskName"),
          taskDescription: form.get("taskDescription"),
          warehouseId: form.get("warehouseId"),
          fromDate: form.get("fromDate"),
          throughDate: form.get("throughDate")
        })
      });
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      setSelectedRunId(run.id);
      setNotice(run.status === "succeeded" ? "Synthetic reference run recorded." : `Input rejected with ${run.reason ?? "an unsupported condition"}.`);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function runVerification(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const report = await api<VerificationReport>("/api/skills/stock-reconciliation/verify", { method: "POST", body: "{}" });
      setSkillPayload((current) => current ? { ...current, verification: report } : current);
      setNotice(report.status === "validated" ? "The candidate passed the finite development suite." : "The candidate did not pass every development case.");
      setPage("verification");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function downloadSkill(): Promise<void> {
    setBusy(true);
    setApiError(null);
    try {
      const response = await fetch("/api/skills/stock-reconciliation/export");
      if (!response.ok) {
        const message = await response.json() as { message?: string };
        throw new Error(message.message ?? `Export failed (${response.status})`);
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "stock-reconciliation-0.1.0.tar.gz";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setNotice("Verified skill package downloaded.");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const screen = pageCopy[page];
  return <div className="app-shell">
    <aside className="sidebar" aria-label="Main navigation">
      <div className="brand">Pocket Forge</div>
      <nav className="navigation">
        {navigation.map((item) => <button
          key={item.id}
          type="button"
          className={`nav-item ${page === item.id ? "nav-item--active" : ""}`}
          aria-current={page === item.id ? "page" : undefined}
          onClick={() => { setPage(item.id); setNotice(null); }}
        >
          <Glyph name={item.icon} />
          <span>{item.label}</span>
        </button>)}
      </nav>
      <div className="sidebar-bottom"><span className="sidebar-status-dot" />Local workspace</div>
    </aside>

    <main className="main-area">
      <header className="page-header">
        <div className="page-title-block">
          <h1>{screen.title}</h1>
          <p>{screen.subtitle}</p>
        </div>
        <div className="mode-status" aria-live="polite">
          <span className="mode-dot" />
          {health ? "Fixture mode · Live providers not connected" : "Checking local API"}
        </div>
      </header>

      {apiError && <div className="alert alert--error" role="alert"><Glyph name="error" /><span>{apiError}</span><button className="text-button" type="button" onClick={() => void refresh()}>Retry</button></div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      {loading && !apiError ? <div className="loading-state" role="status">Loading local workspace…</div> : null}

      {!loading && page === "setup" && <TaskSetup
        onSubmit={runExample}
        busy={busy}
        runs={latestRuns}
        onSelectRun={(runId) => { setSelectedRunId(runId); setPage("history"); }}
        onOpenVerification={() => setPage("verification")}
      />}
      {!loading && page === "history" && <ExecutionHistory
        runs={runs}
        selectedRun={selectedRun}
        onSelect={(runId) => setSelectedRunId(runId)}
      />}
      {!loading && page === "compiler" && <SkillCompiler
        payload={skillPayload}
        health={health}
        busy={busy}
        onVerify={() => void runVerification()}
      />}
      {!loading && page === "verification" && <Verification
        report={skillPayload?.verification ?? null}
        busy={busy}
        onVerify={() => void runVerification()}
        onExport={() => void downloadSkill()}
      />}
      {!loading && page === "library" && <SkillLibrary
        payload={skillPayload}
        busy={busy}
        onExport={() => void downloadSkill()}
        onViewVerification={() => setPage("verification")}
      />}

      <footer className="page-footer">
        <span>Synthetic development fixtures only · No live data or model calls</span>
        <span>{health?.database === "sqlite" ? "Run history stored locally" : "Local API unavailable"}</span>
      </footer>
    </main>
  </div>;
}

function TaskSetup({
  onSubmit, busy, runs, onSelectRun, onOpenVerification
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  runs: RunRecord[];
  onSelectRun: (id: string) => void;
  onOpenVerification: () => void;
}) {
  return <div className="setup-grid">
    <section className="panel setup-panel">
      <div className="panel-heading"><h2>Task setup</h2></div>
      <form className="task-form" onSubmit={onSubmit}>
        <label className="field">
          <span>Task name</span>
          <input name="taskName" defaultValue="Stock reconciliation" maxLength={120} required />
        </label>
        <label className="field">
          <span>What should the agent do?</span>
          <textarea name="taskDescription" defaultValue="Match eligible orders to inventory. Normalize known aliases and units. Report demand, stock on hand, and shortages for a warehouse and date range." rows={3} maxLength={2000} required />
        </label>
        <div className="field">
          <span>Data sources</span>
          <div className="source-list" aria-label="Synthetic fixture data sources">
            <div><span>orders</span><small>synthetic fixture</small></div>
            <div><span>inventory</span><small>synthetic fixture</small></div>
            <div><span>product rules</span><small>synthetic fixture</small></div>
          </div>
        </div>
        <fieldset className="parameters">
          <legend>Example parameters</legend>
          <label className="field field--compact"><span>Warehouse</span><select name="warehouseId" defaultValue="WH-01"><option value="WH-01">WH-01</option><option value="WH-02">WH-02</option></select></label>
          <label className="field field--compact"><span>From</span><input name="fromDate" type="date" defaultValue="2026-10-20" required /></label>
          <label className="field field--compact"><span>Through</span><input name="throughDate" type="date" defaultValue="2026-10-23" required /></label>
        </fieldset>
        <button className="button button--primary" type="submit" disabled={busy}>
          {busy ? "Running fixture…" : "Run example"}<Glyph name="arrow" />
        </button>
        <p className="form-note">This executes the local reference procedure against synthetic data. It does not call Nemotron.</p>
      </form>
    </section>

    <section className="panel activity-panel">
      <div className="panel-heading"><h2>Execution history</h2><button className="text-button" type="button" onClick={() => onSelectRun(runs[0]?.id ?? "")}>View all</button></div>
      {runs.length > 0 ? <div className="activity-list">
        {runs.map((run) => <button className="activity-entry" key={run.id} type="button" onClick={() => onSelectRun(run.id)}>
          <StatusMark status={run.status} />
          <span className="activity-entry__body">
            <span className="activity-entry__title">{run.taskName}</span>
            <span className="activity-entry__summary">{run.status === "succeeded" ? run.result?.lines?.length + " SKU results" : run.reason ?? run.outcomeSummary}</span>
          </span>
          <span className="activity-entry__meta">{run.modelCallCount} calls</span>
        </button>)}
        <div className="compile-cta">
          <span className="timeline-hollow" />
          <div><h3>Compile skill</h3><p>Inspect the bounded program and its verification evidence.</p><button className="button button--outline" type="button" onClick={onOpenVerification}>View verification</button></div>
        </div>
      </div> : <div className="empty-state"><p>No runs recorded yet.</p><span>Run the synthetic example to add evidence to this history.</span></div>}
    </section>
  </div>;
}

function ExecutionHistory({ runs, selectedRun, onSelect }: { runs: RunRecord[]; selectedRun: RunRecord | null; onSelect: (id: string) => void }) {
  return <div className="stack-layout">
    <section className="panel table-panel">
      <div className="panel-heading"><h2>Runs</h2><span className="quiet-label">{runs.length} recorded</span></div>
      {runs.length > 0 ? <div className="table-scroll"><table className="data-table run-table">
        <thead><tr><th scope="col">Run</th><th scope="col">Status</th><th scope="col">Input</th><th scope="col">Outcome</th><th scope="col">Model calls</th></tr></thead>
        <tbody>{runs.map((run) => <tr key={run.id} className={selectedRun?.id === run.id ? "row-selected" : ""}>
          <td><button className="row-link" type="button" onClick={() => onSelect(run.id)}>{run.taskName}<span className="run-id">{run.id.slice(0, 8)}</span></button></td>
          <td><OutcomePill status={run.status} /></td>
          <td>{run.inputSummary}</td>
          <td className="outcome-summary">{run.outcomeSummary}</td>
          <td className="numeric-cell">{run.modelCallCount}</td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-state"><p>No runs recorded yet.</p><span>Run a fixture example from Task Setup.</span></div>}
    </section>
    {selectedRun && <section className="panel run-detail">
      <div className="detail-heading"><div><h2>{selectedRun.taskName}</h2><p>Recorded synthetic fixture outcome. {selectedRun.limitation}</p></div><OutcomePill status={selectedRun.status} /></div>
      <DetailRow label="Input"><code>{selectedRun.inputSummary}</code></DetailRow>
      <DetailRow label="Result summary">{selectedRun.result?.lines?.length ? <div className="result-block">{selectedRun.result.lines.map((line) => <code key={line.sku}>{line.sku} · demand {line.demandEach} · on hand {line.onHandEach} · shortage {line.shortageEach}</code>)}</div> : <code>{selectedRun.reason ?? selectedRun.outcomeSummary}</code>}</DetailRow>
      <DetailRow label="Executor"><code>{selectedRun.executor} · {selectedRun.modelCallCount} model calls</code></DetailRow>
      {selectedRun.artifactPath && <DetailRow label="Artifact"><code>{selectedRun.artifactPath}</code></DetailRow>}
    </section>}
  </div>;
}

function SkillCompiler({ payload, health, busy, onVerify }: { payload: SkillPayload | null; health: HealthPayload | null; busy: boolean; onVerify: () => void }) {
  if (!payload) return <EmptyLoading />;
  const { skill, contract, verification } = payload;
  return <div className="compiler-grid">
    <section className="panel program-panel">
      <div className="skill-identity"><div><h2>Stock reconciliation · v{skill.version}</h2><p>Draft origin: Hand-authored development seed</p></div><span className={`outcome ${verification.status === "validated" ? "outcome--succeeded" : "outcome--failed"}`}>{verification.status}</span></div>
      <div className="panel-subheading"><h3>Operation sequence</h3><p>Bounded steps executed by the trusted interpreter.</p></div>
      <ol className="operation-list">{operationGroups.map((operation, index) => <li key={operation.title}>
        <span className="operation-number">{index + 1}</span><div><h4>{operation.title}</h4><p>{operation.detail}</p></div>
      </li>)}</ol>
      <details className="ir-details"><summary>View instruction identifiers</summary><div>{skill.ir.operations.map((operation) => <code key={operation.id}>{operation.id}<span>{operation.kind}</span></code>)}</div></details>
    </section>
    <div className="compiler-aside">
      <section className="panel contract-panel">
        <div className="panel-heading"><h2>Applicability contract</h2></div>
        <p className="section-intro">Conditions under which this skill can be executed.</p>
        <dl className="contract-list">
          <div><dt>Source mode</dt><dd>{contract.supportedSourceModes.join(", ")}</dd></div>
          <div><dt>Policy</dt><dd>{contract.policyVersion}</dd></div>
          <div><dt>Schemas</dt><dd>{Object.values(contract.sourceSchemaVersions).join(" · ")}</dd></div>
          <div><dt>Rows</dt><dd>up to {contract.maxRows.toLocaleString()}</dd></div>
          <div><dt>Runtime</dt><dd>up to {contract.maxRuntimeMs.toLocaleString()} ms</dd></div>
        </dl>
        <div className="assumption-block"><h3>Assumptions</h3><ul>{contract.assumptions.slice(0, 4).map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></div>
      </section>
      <section className="panel provider-panel">
        <div className="panel-heading panel-heading--plain"><h2>Nemotron generation</h2></div>
        <div className="alert alert--notice"><Glyph name="error" /><span>{health?.nvidiaConfigured ? "Live Nemotron execution is not wired in this fixture build." : "Live compilation is blocked until NVIDIA credentials and a spend limit are configured."}</span></div>
        <div className="verify-action"><div><h3>Verification</h3><p>Run the candidate against the finite development fixtures and record the result.</p></div><button className="button button--primary" type="button" disabled={busy} onClick={onVerify}>{busy ? "Verifying…" : "Run verification"}<Glyph name="arrow" /></button></div>
      </section>
    </div>
  </div>;
}

function Verification({ report, busy, onVerify, onExport }: { report: VerificationReport | null; busy: boolean; onVerify: () => void; onExport: () => void }) {
  if (!report) return <EmptyLoading />;
  const stats = [
    { label: "Supported", value: `${report.correctSupportedCount} / ${report.supportedCaseCount}` },
    { label: "Unsupported rejected", value: `${report.rejectedUnsupportedCount} / ${report.unsupportedCaseCount}` },
    { label: "False acceptances", value: String(report.falseAcceptanceCount) },
    { label: "Needless fallbacks", value: String(report.needlessFallbackCount) }
  ];
  return <div className="stack-layout">
    <section className="panel metrics-panel">
      <div className="metrics-row">{stats.map((item) => <div className="metric" key={item.label}><span className="metric-dot" /><div><strong>{item.value}</strong><span>{item.label}</span></div></div>)}</div>
      <p className="scope-note">Synthetic development fixtures · not held-out evaluation</p>
    </section>
    <section className="panel table-panel verification-table-panel">
      <div className="panel-heading"><h2>Case results</h2><button className="text-button" type="button" disabled={busy} onClick={onVerify}>{busy ? "Verifying…" : "Run again"}</button></div>
      <div className="table-scroll"><table className="data-table verification-table">
        <thead><tr><th scope="col">Case</th><th scope="col">Expected</th><th scope="col">Result</th></tr></thead>
        <tbody>{report.cases.map((testCase) => <tr key={testCase.caseId}>
          <td><code>{testCase.caseId}</code></td>
          <td>{testCase.expectedOutcome === "supported" ? "Supported" : `Reject · ${testCase.expectedReason ?? "unsupported input"}`}</td>
          <td><span className={`case-result ${testCase.passed ? "case-result--passed" : "case-result--failed"}`}><span />{testCase.expectedOutcome === "supported" ? (testCase.passed ? "Correct" : "Mismatch") : (testCase.passed ? "Rejected correctly" : testCase.actualReason ?? testCase.actualOutcome)}</span></td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <section className="panel evidence-panel">
      <div className="hash-field"><span>Candidate hash</span><code>{report.candidateHash}</code></div>
      <div className="evidence-actions"><button className="button button--primary" type="button" disabled={busy || report.status !== "validated"} onClick={onExport}><Glyph name="download" />Export verified skill</button></div>
      <div className="evidence-foot"><span>{report.scope}</span><span>Run model calls · 0</span></div>
    </section>
  </div>;
}

function SkillLibrary({ payload, busy, onExport, onViewVerification }: { payload: SkillPayload | null; busy: boolean; onExport: () => void; onViewVerification: () => void }) {
  if (!payload) return <EmptyLoading />;
  const { skill, contract, verification } = payload;
  const files = [
    ["skill.json", "Bounded procedure definition"],
    ["contract.json", "Supported inputs and assumptions"],
    ["runtime/pocketforge-runtime.mjs", "Standalone trusted interpreter"],
    ["tests/", "Verification examples and offline check"],
    ["verification.json", "Finite-suite results and limitations"],
    ["bindings.example.json", "Example source binding"],
    ["README.md", "Setup and execution guide"]
  ];
  return <div className="stack-layout">
    <section className="panel library-table-panel">
      <div className="panel-heading"><h2>Skills</h2><span className="quiet-label">1 local skill</span></div>
      <div className="table-scroll"><table className="data-table library-table">
        <thead><tr><th scope="col">Skill</th><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Scope</th></tr></thead>
        <tbody><tr className="row-selected"><td>Stock reconciliation</td><td>{skill.version}</td><td><span className="case-result case-result--passed"><span />{verification.status === "validated" ? "Validated" : "Needs review"}</span></td><td>Fixture source mode</td></tr></tbody>
      </table></div>
    </section>
    <section className="panel skill-detail-panel">
      <div className="skill-detail-heading"><div><h2>Stock reconciliation</h2><p>Reconciles eligible order demand against inventory using explicit aliases and unit rules.</p></div><span className="version-label">v{skill.version}</span></div>
      <dl className="evidence-facts">
        <div><dt>Evidence</dt><dd>Finite development suite · {verification.correctSupportedCount} supported · {verification.rejectedUnsupportedCount} unsupported checks rejected · {verification.falseAcceptanceCount} false acceptances</dd></div>
        <div><dt>Contract</dt><dd>Schemas {Object.values(contract.sourceSchemaVersions).join(" · ")} · Policy {contract.policyVersion}</dd></div>
        <div><dt>Limitations</dt><dd>Hand-authored development seed · synthetic fixtures only · not held-out evaluation</dd></div>
      </dl>
      <div className="skill-actions"><button className="button button--primary" type="button" disabled={busy || verification.status !== "validated"} onClick={onExport}><Glyph name="download" />{busy ? "Preparing…" : "Export skill package"}</button><button className="button button--outline" type="button" onClick={onViewVerification}>View verification</button></div>
      <div className="package-files">
        <h3>Package files</h3>
        <div className="table-scroll"><table className="data-table"><thead><tr><th scope="col">File</th><th scope="col">Description</th></tr></thead>
          <tbody>{files.map(([name, description]) => <tr key={name}><td><code>{name}</code></td><td>{description}</td></tr>)}</tbody>
        </table></div>
      </div>
    </section>
  </div>;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="detail-row"><span>{label}</span><div>{children}</div></div>;
}

function EmptyLoading() {
  return <div className="empty-state"><p>Skill data is unavailable.</p><span>Check the local API connection and try again.</span></div>;
}

export default App;
