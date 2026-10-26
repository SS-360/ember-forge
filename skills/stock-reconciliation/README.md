# Stock reconciliation seed skill

This is a development candidate for the bounded Ember Forge instruction format. It was hand-authored as a runtime seed because live Nemotron access is not configured. It is not a skill learned from trajectories and is not a portable export yet.

The program filters open orders for the requested warehouse and inclusive date range, resolves approved aliases, converts approved whole-number units, aggregates demand, joins the inventory snapshot, validates postconditions, and emits shortage rows.

The current contract only supports fixture-mode data with the declared source schema and stock-v1 policy. It rejects unknown units, unknown aliases, missing inventory, changed schemas, changed policy versions, and inventory snapshots later than the requested end date.

Run pnpm eval:skill to recreate the finite development verification report. Passing these development cases does not establish held-out or live-source correctness.

