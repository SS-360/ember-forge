---
name: zetaris-stock-207ca2ab-retry-3
description: Reconcile open stock orders against warehouse inventory, including SKU aliases, unit conversions, and shortage totals. Use when asked to reconcile stock, check inventory shortages, or compare open orders with available warehouse stock. Requires the declared snapshot schemas and policy; do not use for other data sources or policies.
---

# zetaris-stock-207ca2ab-retry-3

Use this skill only when the request is a stock-reconciliation task and the supplied parameters, source mode, schema versions, policy version, and row count satisfy [the contract](contract.json). The runner reads JSON supplied by the user; it does not connect to external data sources.

## Execute

1. Prepare an input JSON file using [the example](input.example.json) and confirm it matches the contract. Never place credentials in the input.
2. Run the bundled runtime with Node.js 24.13 or newer. Hermes substitutes ${HERMES_SKILL_DIR} with the loaded skill's absolute directory, including paths with spaces. Run this command from the caller's current directory:

   ```sh
   node "${HERMES_SKILL_DIR}/runtime/emberforge-runtime.mjs" --input input.json --output result.json
   ```

   Other hosts should resolve the runtime relative to the loaded SKILL.md location, quote the complete path, and run from the caller's working directory. The runner reads input/output paths from that working directory and makes no model calls.
3. Return the result and execution status. If the runner exits with status 2, report the machine-readable rejection reason and request compatible data or use the host's normal reasoning workflow. Do not silently alter schemas, policy, aliases, or units.

Run node with the absolute, quoted path to tests/verify-export.mjs in the same installed skill directory to check the bundled examples. Verification covers a finite synthetic development suite only.

## Resources

- [Input contract](contract.json)
- [Verification evidence](verification.json)
- [Verification cases](tests/cases.json)
- [Trace lineage and compilation limits](lineage.json)
- [Runtime instructions](README.md)
