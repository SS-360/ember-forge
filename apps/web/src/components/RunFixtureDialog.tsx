import { useEffect, useRef, type FormEvent } from "react";
import { Glyph } from "./Glyph.js";

export interface FixtureRunInput {
  taskName: string;
  taskDescription: string;
  warehouseId: string;
  fromDate: string;
  throughDate: string;
}

export function RunFixtureDialog({
  busy, onClose, onSubmit
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: FixtureRunInput) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    onSubmit({
      taskName: String(values.get("taskName") ?? ""),
      taskDescription: String(values.get("taskDescription") ?? ""),
      warehouseId: String(values.get("warehouseId") ?? ""),
      fromDate: String(values.get("fromDate") ?? ""),
      throughDate: String(values.get("throughDate") ?? "")
    });
  }

  return <dialog ref={dialogRef} className="run-dialog" aria-labelledby="run-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="dialog-heading"><div><h2 id="run-dialog-title">Record a fixture run</h2><p>Execute the local stock reference against synthetic data.</p></div><button className="icon-button" type="button" aria-label="Close" onClick={onClose}><Glyph name="close" /></button></div>
    <form onSubmit={submit}>
      <label className="field"><span>Task name</span><input name="taskName" defaultValue="Stock reconciliation" maxLength={120} required /></label>
      <label className="field"><span>Task description</span><textarea name="taskDescription" defaultValue="Match eligible orders to inventory. Normalize known aliases and units. Report demand, stock on hand, and shortages." rows={3} maxLength={2000} required /></label>
      <div className="dialog-field-grid">
        <label className="field"><span>Warehouse</span><select name="warehouseId" defaultValue="WH-01"><option value="WH-01">WH-01</option><option value="WH-02">WH-02</option></select></label>
        <label className="field"><span>From</span><input name="fromDate" type="date" defaultValue="2026-10-20" required /></label>
        <label className="field"><span>Through</span><input name="throughDate" type="date" defaultValue="2026-10-23" required /></label>
      </div>
      <div className="dialog-footer"><span>Fixture reference · 0 model calls</span><button className="button button--primary" type="submit" disabled={busy}>{busy ? "Running…" : "Run example"}<Glyph name="arrow" /></button></div>
    </form>
  </dialog>;
}
