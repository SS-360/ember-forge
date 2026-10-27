# Open Agent Hackathon resource and readiness audit

Checked 27 October 2026 (Asia/Calcutta) against the resource-hub text pasted by the project owner and the official public event and Academy pages linked below. This is a project-fit audit, not a legal eligibility opinion or a submission. The pasted capture does not include the bodies of most hub documents; no resources were marked as read during this audit.

## Current assessment

Ember Forge has a working Track 03 prototype with a demonstrated Meterless H-MEM feature and a verified Zetaris-origin workflow. Two local Zetaris reads were materialized as receipt-bound snapshots, used for three original-agent jobs and four traces, then compiled into a candidate that passed 21/21 development cases. The skill executes against the captured snapshot; it does not query Zetaris during each later execution. H-MEM satisfies the Meterless Engine requirement. The public Academy FAQ says the product may run Nemotron directly or through Meterless, and that any cloud is allowed; Ember Forge already has direct Nemotron evidence. Nightshift is recommended in the supplied solutioning guide, but it is not a reason to claim the Engine or current local prototype is incomplete. The full hub rules were not included in the supplied capture, so an additional Nightshift mandate in those documents remains unverified.

## What the event materials say

The official [event page](https://hackathon.genai.works/event/open-agent-hackathon-2026) lists Track 03, Reasoning Architecture; a team size of 1–5; and the hard submission deadline of **27 October 2026 at 23:45 UTC** (28 October at 05:15 in India). Its 100-point scoring weights are Impact 30, Technical 20, Innovation 15, Demo 15, Product & UX 10, and Sponsor Tech 10. Sponsor Tech is scored on how effectively sponsor technology addresses the problem and improves the product. The official [Academy page](https://academy.genai.works/courses/open-agent-hackathon-2026/details) describes Zetaris as the data layer and a Meterless Engine for memory/state/routing. Its FAQ says NVIDIA Nemotron can be connected directly or through Meterless, and that any cloud is allowed. A cloud provider is permitted, not required; there is no public URL or 24/7 AWS requirement in that FAQ.

The supplied hub capture records **1/7 onboarding resources reviewed** and **0/3 required resources completed**. The visible required resources are:

| Resource | Hub grouping | State in supplied capture |
| --- | --- | --- |
| FAQ | Onboarding | Not reviewed |
| Participant Setup Guide | Onboarding | Not reviewed |
| Zetaris Scoring Methodology | Featured resources | Not reviewed |

The capture also lists, without their document contents, Official Rules, Submission Requirements, Technical Execution Requirements, Disqualification Checklist, AI Usage Policy, Team Formation Rules, and Code of Conduct. Exact obligations and disqualification conditions in those documents remain unverified. The public event page exposes a rules section, but the retrieved page text did not include the full expanded rule content.

## APPROACH guide checklist

The pasted **How to APPROACH Solutioning For Your Track** guide says a strong build should pick one track, have all team members on HackOS, use Zetaris as its data layer, include at least one Meterless Engine in a working feature, use Meterless Nightshift as its primary AI provider, use NVIDIA where it contributes, produce a working agent, show evidence of how it reached its output, and submit through HackOS by the deadline. It also recommends a real demo, repository, and sponsor explanation. Current implementation evidence maps as follows:

| Guide item | Current status | Evidence / remaining work |
| --- | --- | --- |
| One primary track | **Intended** | The implementation plan targets Track 03, Reasoning Architecture. No submission is recorded. The project connects data, task rules, memory, and bounded execution. |
| Team members on HackOS | **Unverified** | Confirm every participant's account and the event's current team/dashboard settings. |
| Zetaris is the task data layer | **Implemented through source snapshots** | The local Workbench reads two registered synthetic sources through Zetaris, then **Use snapshot for agent run** passes a receipt-bound snapshot into the original-agent workflow. A recorded run used two Zetaris reads, three agent jobs and four traces to generate the validated `zetaris-stock-207ca2ab-retry-3` candidate (21/21 development cases passed). The portable skill consumes that captured JSON snapshot and does not query Zetaris at runtime. See the [judge walkthrough and tracked proof](zetaris-demo.md). |
| Meterless Engine in a working feature | **Implemented and demonstrated** | Pinned H-MEM runs in the actual Skill Library registration/retrieval/execution/invalidation path. The product integration suite passed 7/7 tests, the pinned engine conformance suite passed 13/13, and `pnpm memory:demo` completed warm retrieval/execution followed by `SCHEMA_VERSION_MISMATCH` invalidation. See the [reproduction steps and observed result](meterless-engine-demo.md). |
| Meterless Nightshift | **Not integrated; not a current prototype blocker** | The app uses NVIDIA Nemotron directly, a path the public Academy FAQ explicitly permits. H-MEM is already implemented as the Meterless Engine in the working Skill Library feature and has passing product/conformance tests. The supplied solutioning guide recommends Nightshift and it may strengthen the sponsor-tech story, but the public FAQ does not require it. |
| NVIDIA where it contributes | **Partially evidenced** | Nemotron original-agent calls and synthesis have run on synthetic inputs under the separately authorized $0 endpoint ceiling. They have not been routed through Nightshift. |
| Working agent | **Demonstrated from Zetaris-origin snapshots** | A local source read was captured with provenance, passed into original-agent jobs, and used in Nemotron synthesis. The exported skill was run against the tracked source snapshot and separately refuses an unsupported unit. All sample rows are synthetic. |
| Show how the agent reached the output | **Evidence exists** | A sanitized 14-step workbench trace is in [`demo-kit/workbench-activity.json`](../demo-kit/workbench-activity.json); host activity is in [`demo-kit/openclaw-activity.json`](../demo-kit/openclaw-activity.json). These describe separate synthetic runs and retain tool names, outcomes, and hashes, not private model reasoning. |
| Submission through HackOS | **Not done** | No HackOS submission, team eligibility confirmation, final demo video, or slide deck is recorded. Submission is an owner action. |
| Cursor | **Not treated as required by the public course page** | The official Academy says “Cursor or any AI coding tool.” The build used Codex/other agent tooling; confirm against the full current Technical Execution Requirements and FAQ before submission. |

## Data, judging, and demo checklist

The pasted APPROACH guide asks whether judges can run the solution without manual data steps; whether data can be registered in Zetaris; whether the solution handles Zetaris/Nightshift/API outages; whether a sample fallback exists; whether request timeouts and retries are bounded; whether sources are licensed and non-sensitive; whether sources are documented in the README; and whether output can be explained with evidence.

| Check | Current answer |
| --- | --- |
| Judge can run without manual setup | **Portable skill:** yes, with Node.js and the included Zetaris-origin snapshot. **Live-source stage:** show it on the presenter's laptop; judges would need their own local Zetaris stack and source setup to repeat live queries. The offline package path is documented in [`demo-kit/zetaris/`](../demo-kit/zetaris/). |
| Data can be registered in Zetaris | **Locally verified on synthetic rows** in two registered PostgreSQL sources. No public cloud dataset is configured, and AWS is not required for the local demo. |
| Fallback if Zetaris or Nightshift is unavailable | The tracked source snapshot runs offline through the exported skill. The app does not automatically switch from a failed live Zetaris read to sample data, and Nightshift fallback behavior is not implemented. |
| Timeouts and retries bounded | Several model/job and local source paths enforce bounds. Nightshift and remote-source behavior are unimplemented and are outside the current local judge path. |
| Data licensing and sensitivity | Current examples are synthetic and contain no real personal or confidential records. They are suitable as sample data; no real-data claim is made. |
| README documents data sources | The README and credentials/source docs explain local synthetic sources and limitations. Add judge-specific setup steps after a fresh-clone rehearsal. |
| Output can be traced to evidence | A sanitized workbench trace and a separate OpenClaw activity record are tracked. The OpenClaw sample input/result pair is runnable independently. |

The hub lists a **Submission Requirements** document, a **Submission Form Preview**, a **Demo Video Guide**, and strong/weak submission examples, but their actual contents were not included in the pasted text. The Academy describes shipping, documenting, and demoing the agent, but exact required video duration, slide format, repository fields, and sponsor explanation must be checked against the current hub documents before submission.

## Submission proof still needed

1. Review the three required hub resources and the rules, submission, technical, disqualification, and AI policy documents in full. Capture current copies or their exact text in the repository without copying private credentials.
2. Confirm age/location eligibility, account uniqueness, and team/HackOS status against the current official rules.
3. The H-MEM Engine requirement is demonstrated. Nemotron is directly integrated, which the public Academy FAQ allows. If the unseen hub rules add a Nightshift requirement, check that document; the supplied solutioning guide's recommendation is not itself a blocker to this working prototype. Keep the data boundary clear: Zetaris is read live at snapshot creation; the compiled skill executes against that receipt-bound snapshot.
4. Record a short demo and prepare the slide deck, repository link, sponsor-technology explanation, synthetic sample input/output, and limitations.
5. Finish and submit in HackOS before the official deadline. Nothing in this audit submits or changes the user's HackOS account.

The verified workflow results and limitations are in [release readiness](release-readiness.md), [host and Zetaris verification](host-and-zetaris-verification.md), and [live verification](live-verification.md).
