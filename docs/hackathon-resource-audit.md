# Open Agent Hackathon resource and readiness audit

Checked 27 October 2026 (Asia/Calcutta) against the resource-hub text pasted by the project owner and the official public event and Academy pages linked below. This is a project-fit audit, not a legal eligibility opinion or a submission. The pasted capture does not include the bodies of most hub documents; no resources were marked as read during this audit.

## Current assessment

Ember Forge has a credible Track 03 prototype and real sponsor-adjacent engineering evidence, but the pasted guide and Academy's public description expose two material integration gaps: Meterless Nightshift is not integrated as the primary AI runtime, and the verified local Zetaris read path is not yet used by the original stock agent or exported skill. Do not describe the current build as fully sponsor-compliant or submission-ready.

## What the event materials say

The official [event page](https://hackathon.genai.works/event/open-agent-hackathon-2026) lists Track 03, Reasoning Architecture; a team size of 1–5; and the hard submission deadline of **27 October 2026 at 23:45 UTC** (28 October at 05:15 in India). Its 100-point scoring weights are Impact 30, Technical 20, Innovation 15, Demo 15, Product & UX 10, and Sponsor Tech 10. Sponsor Tech is scored on how effectively sponsor technology addresses the problem and improves the product. The official [Academy page](https://academy.genai.works/courses/open-agent-hackathon-2026/details) describes Zetaris as the data layer, a Meterless Engine for memory/state/routing, and the Power layer as Meterless Nightshift with NVIDIA Nemotron.

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
| Zetaris is the task data layer | **Partial** | Two local synthetic PostgreSQL sources were registered and read through Zetaris; join and controlled freshness checks passed. That route is a separate workbench action. The original Nemotron agent and exported skill still operate on fixture/JSON snapshot data. Wire the verified source route into the task the judges will run, or disclose this boundary. |
| Meterless Engine in a working feature | **Implemented and demonstrated** | Pinned H-MEM runs in the actual Skill Library registration/retrieval/execution/invalidation path. The product integration suite passed 7/7 tests, the pinned engine conformance suite passed 13/13, and `pnpm memory:demo` completed warm retrieval/execution followed by `SCHEMA_VERSION_MISMATCH` invalidation. See the [reproduction steps and observed result](meterless-engine-demo.md). |
| Nightshift is the primary AI provider | **Not implemented; highest sponsor gap** | The current app uses the configured NVIDIA Nemotron adapter directly. H-MEM is local and is not Nightshift. The local Windows runtime, token file, process, and default API listener were absent during the read-only check. The official provider contract documents plain-text chat but does not establish the forced function-calling and token-usage response contract Ember Forge requires. Install/start the local runtime, then verify protocol compatibility before routing agent or synthesis calls. Treat primary-Nightshift as the guide's explicit direction and a Sponsor Tech scoring risk; the retrieved rules text did not reveal whether it is disqualifying. |
| NVIDIA where it contributes | **Partially evidenced** | Nemotron original-agent calls and synthesis have run on synthetic inputs under the separately authorized $0 endpoint ceiling. They have not been routed through Nightshift. |
| Working agent | **Demonstrated on synthetic fixtures** | Original agent runs, generated stock skill, bounded export execution, and a separate Zetaris stock path are implemented. The complete end-to-end agent task is not yet driven by live Zetaris data. |
| Show how the agent reached the output | **Evidence exists** | A sanitized 14-step workbench trace is in [`demo-kit/workbench-activity.json`](../demo-kit/workbench-activity.json); host activity is in [`demo-kit/openclaw-activity.json`](../demo-kit/openclaw-activity.json). These describe separate synthetic runs and retain tool names, outcomes, and hashes, not private model reasoning. |
| Submission through HackOS | **Not done** | No HackOS submission, team eligibility confirmation, final demo video, or slide deck is recorded. Submission is an owner action. |
| Cursor | **Not treated as required by the public course page** | The official Academy says “Cursor or any AI coding tool.” The build used Codex/other agent tooling; confirm against the full current Technical Execution Requirements and FAQ before submission. |

## Data, judging, and demo checklist

The pasted APPROACH guide asks whether judges can run the solution without manual data steps; whether data can be registered in Zetaris; whether the solution handles Zetaris/Nightshift/API outages; whether a sample fallback exists; whether request timeouts and retries are bounded; whether sources are licensed and non-sensitive; whether sources are documented in the README; and whether output can be explained with evidence.

| Check | Current answer |
| --- | --- |
| Judge can run without manual setup | **Exported skill sample:** yes, with Node.js and the included JSON input. **Full app/agent:** fresh-clone/judge rehearsal not done; local provider authorization and local Zetaris are machine-specific. |
| Data can be registered in Zetaris | **Locally verified on synthetic rows** in two local PostgreSQL sources. A judge cannot use the owner's loopback service; no judge-accessible cloud dataset is configured. |
| Fallback if Zetaris or Nightshift is unavailable | The export works on its JSON snapshot, and a fixture path exists. A single orchestrated agent path that falls back safely from Nightshift/Zetaris is not implemented or verified. There is no documented `SAMPLE_MODE=true` switch. |
| Timeouts and retries bounded | Several model/job and source paths enforce bounds; full failure behavior across Nightshift and judge-accessible remote sources is unverified. |
| Data licensing and sensitivity | Current examples are synthetic and contain no real personal or confidential records. They are suitable as sample data; no real-data claim is made. |
| README documents data sources | The README and credentials/source docs explain local synthetic sources and limitations. Add judge-specific setup steps after a fresh-clone rehearsal. |
| Output can be traced to evidence | A sanitized workbench trace and a separate OpenClaw activity record are tracked. The OpenClaw sample input/result pair is runnable independently. |

The hub lists a **Submission Requirements** document, a **Submission Form Preview**, a **Demo Video Guide**, and strong/weak submission examples, but their actual contents were not included in the pasted text. The Academy describes shipping, documenting, and demoing the agent, but exact required video duration, slide format, repository fields, and sponsor explanation must be checked against the current hub documents before submission.

## Submission proof still needed

1. Review the three required hub resources and the rules, submission, technical, disqualification, and AI policy documents in full. Capture current copies or their exact text in the repository without copying private credentials.
2. Confirm age/location eligibility, account uniqueness, and team/HackOS status against the current official rules.
3. Either implement Nightshift as primary and connect the task's Zetaris data path, or make an explicit owner decision about submitting with these sponsor gaps. Do not relabel current direct Nemotron/local JDBC evidence as Nightshift or an end-to-end Zetaris agent run.
4. Record a short demo and prepare the slide deck, repository link, sponsor-technology explanation, synthetic sample input/output, and limitations.
5. Finish and submit in HackOS before the official deadline. Nothing in this audit submits or changes the user's HackOS account.

The verified workflow results and limitations are in [release readiness](release-readiness.md), [host and Zetaris verification](host-and-zetaris-verification.md), and [live verification](live-verification.md).
