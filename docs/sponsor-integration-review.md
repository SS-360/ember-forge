# Sponsor integration review

This report separates what the project actually used from what remains a plan. All example business records are synthetic. This is the team's technical review; it is not sponsor approval or sponsor feedback.

## At a glance

| Technology | How Ember Forge used it | Evidence | Boundary |
| --- | --- | --- | --- |
| Zetaris | Read registered order and warehouse sources through the local JDBC service; save the results with source receipts | Two source reads, three original-agent jobs, four traces, and the validated Zetaris-origin skill are summarized in [`source-evidence.json`](../demo-kit/zetaris/source-evidence.json) | Local synthetic sources; the skill later runs on the saved snapshot, not a live query |
| NVIDIA Nemotron | Choose tools for the original agent and propose a typed skill from selected traces | Candidate `zetaris-stock-207ca2ab-retry-3@0.1.0`, hash-bound development report, and original run details in [host/source verification](host-and-zetaris-verification.md) | Free prototyping endpoint under a $0 NVIDIA ceiling; synthetic task only |
| Meterless H-MEM | Store and retrieve verified skills in the actual Skill Library, then check whether the stored skill still fits | 7/7 product tests, 13/13 pinned conformance checks, cold/warm run and schema refusal in [the H-MEM demo](meterless-engine-demo.md) | Local pinned reference implementation; no hosted H-MEM service |
| Meterless Nightshift | Not connected in this prototype | Direct Nemotron is allowed by the public Academy FAQ; see [the resource audit](hackathon-resource-audit.md) | The supplied solutioning guide recommends Nightshift; we make no claim of using it |

The [public Academy FAQ](https://academy.genai.works/courses/open-agent-hackathon-2026/details) permits direct Nemotron or a Meterless route and says any cloud may be used. Ember Forge uses direct Nemotron. Cloud deployment is optional for this local prototype.

## Zetaris: bring separated records into one task

### What we connected

The local Zetaris installation exposed an official JDBC driver and SQL endpoint. Ember Forge's server uses a fixed, private map of approved tables and read-only task parameters. The UI does not accept free-form SQL or a caller-supplied source name.

Two separately registered sources held orders and warehouse rules/inventory. The application read orders, inventory, product aliases, and unit conversions through Zetaris, compared the combined result with an independent stock report, and checked that a controlled inventory change altered the result as expected before restoring the demo data.

The end-to-end skill-creation run then saved two source results as receipt-bound snapshots, used them for three original-agent jobs, retained two successful traces plus a failed and an unsupported result, and synthesized the candidate now in the demo kit. Its expected output is CUP-RED shortage 10 and MUG-BLUE shortage 0.

### What was difficult

- **Getting the local platform running:** the downloaded images required a personal registry sign-in. The first image pull failed before the sign-in; no cloud cluster was created.
- **Using the local contract correctly:** the local JDBC login and organization identifier differ from the placeholder SaaS API-key configuration. The integration uses the downloaded driver and local bundle's documented connection details.
- **Keeping access controlled:** the server uses a fixed source map and read-only queries. The map and credentials stay in ignored local files; neither is part of the exported skill or repository evidence.
- **Choosing a portable boundary:** a judge cannot reach the developer's `localhost`. We therefore prove the live source read on the configured laptop, then pass the resulting snapshot into skill creation. The exported package can be run offline from the checked snapshot.
- **Being precise about what two sources mean:** the two logical PostgreSQL databases ran on the same local PostgreSQL instance. The check is not evidence of multiple production vendors, transaction-level snapshot isolation, or accuracy on a real warehouse.

### What we learned

Zetaris contributed a real, inspectable data step to the workflow. A source receipt links that step to the snapshot used in later agent runs, so the origin of the example is visible. For this demo, a local source-to-snapshot path was more practical than requiring judges to provision an AWS cluster. Live queries during every exported-skill run would be a separate feature.

## NVIDIA Nemotron: investigate, then propose a reusable procedure

### How the agent uses Nemotron

For an original run, Ember Forge sends the task, the approved input snapshot, the task rules, observed schemas, and a small list of tool choices. Nemotron returns exactly one structured action at a time: inspect a schema, read a source, run up to eight declared operations, or refuse. Ember Forge validates and executes that action, records its result, and gives the agent the next observation. It does not accept generated JavaScript, Python, or SQL.

For skill creation, Nemotron receives selected successful and counterexample traces, their schemas, and limited test verdicts. It returns one typed candidate. A separate checker—not Nemotron—decides whether the candidate's outputs and refusals match the expected behavior. Test answers and frozen cases are kept out of the generation request.

### What worked and what we had to correct

- The original agent selected trusted actions on synthetic inputs and produced traces with operation names, outcomes, row counts, and hashes. Private chain-of-thought and API credentials are not included in the trace files.
- The generated candidate passed all 21 development cases: all 7 supported inputs matched, all 14 unsupported inputs were rejected, and there were no false acceptances.
- Three earlier candidate revisions failed on duplicate join keys. Those failures were retained; the final report is not a rewritten success history. The team tightened the join and warehouse filtering rules before accepting the passing revision.
- Earlier runs also exposed provider timeouts, malformed or multi-action responses, mistaken refusals, and Windows file-lock behavior. The implementation added finite call/time/token limits, strict one-action responses, independent checks, and persisted run state. See [the detailed Nemotron run record](live-verification.md).
- A free endpoint was used under a server-enforced $0 NVIDIA allowance. Fresh clones do not send model requests until a local owner configures authorization. The separate OpenClaw host rehearsal used GPT-6-Luna at the user's request; its reported $0.00964078 is usage metadata, not an invoice.

### What the comparison says—and does not say

A separate frozen synthetic comparison repeated nine cases three times. The original agent passed 24/27 invocations, the instruction-only version passed 27/27 with 33 model requests, and the executable export passed 27/27 with zero model requests. The export's supported-input median was 117.87 ms including Node startup; the instruction-only median was 23.78 seconds. These results show that the tested procedure can avoid model calls at execution. They do not include all compilation/orchestration cost, establish a cash saving, or predict performance on real data. Full per-arm details and caveats are in [live verification](live-verification.md).

## Meterless H-MEM: make stored skills useful and safe to reuse

H-MEM is part of the actual Skill Library feature, not an unused dependency. When a person registers a candidate, Ember Forge verifies it and stores the skill with its source, test, and applicability evidence. Later, H-MEM can find the candidate for a similar task. The app then checks its hash, schema, and policy against the current input before it runs.

The passing demo retrieves and executes a verified skill without model calls. After the inventory schema is changed, the same entry is refused with `SCHEMA_VERSION_MISMATCH` and marked deprecated. The product suite passed 7/7; the pinned upstream checks passed 13/13. The demo and exact commands are in [the H-MEM guide](meterless-engine-demo.md).

One early retrieval rehearsal exposed sensitivity to generated skill names. The team changed the memory description to use the task people ask for and added a regression check. The memory engine now helps find a candidate, while exact hashes and input rules still decide whether it may run.

## Sponsor feedback and next integration work

We have **not received direct review or endorsement from Zetaris, NVIDIA, or Meterless**. The findings above are our own integration observations, not statements made by those sponsors.

The remaining sponsor-related work is to keep improving the judge's visibility into source receipts and agent actions, test with non-synthetic data only when approved access exists, and consider Nightshift only if a full event rule or a clear product benefit calls for it. The present prototype already demonstrates H-MEM, Zetaris-origin workflow creation, and direct Nemotron use. It does not claim a hosted cloud service or real-warehouse validation.
