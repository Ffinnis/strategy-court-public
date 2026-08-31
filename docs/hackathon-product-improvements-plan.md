# Strategy Court product improvements

Date: August 31, 2026. Status: implemented locally; real-data preparation and final deployed verification remain pending.

The implementation adds shared evidence selection and chart focus, immutable confirmed investigation decisions, private agent drafts, cited reports, agent case creation with retry safety, provenance-aware caching and pinned sample execution. See [the reviewer guide](./reviewer-testing.md) and [sample operator instructions](./prepared-sample.md).

Local tests and an authenticated WebMCP browser journey cover the software workflow. Local Alpaca credentials are absent; no genuine market sample or contest video has been produced. The baseline observations and original acceptance plan below remain as implementation context.

Validation: `bun run check` passes with 166 tests across 32 files, typechecking and production builds. Browser checks passed at desktop width and 390 px: agent case creation, exact strategy review, explicit synthetic execution, trade/failure selection, chart focus, editable agent decision, confirmation, reload persistence, disabled ineligible replay, and report citation navigation. The local report showed no browser warnings or errors. No deployment was performed.

## 1. Scope and decisions

The user agreed to plan investigation decisions and shared evidence selection, supported easier agent setup, and preferred real market data for the demo.

- Make rejecting a weak idea a useful, completed investigation. Preserve the evidence and the user's reason.
- Let a person and their agent inspect the same failure or trade, with matching chart context.
- Let a signed-in agent create a case from the user's stated idea, then hand off exact rules and assumptions for human review.
- Demonstrate one reproducible investigation using saved Alpaca history, with no silent synthetic substitution.

Keep the existing test engine, seven verdicts, three-variant limit, evaluation-contamination labels, and replay eligibility rules. Do not add indicators, brokerage execution, automatic optimization, anonymous write access, or a broad visual redesign.

Recommended order: verify real-data prerequisites first; build shared evidence references; add the decision record; complete agent setup; prepare and verify the real-data demo. Evidence references support both the inspector and the decision's citations.

## 2. Baseline before these changes

| Area | Confirmed behavior and touchpoints |
| --- | --- |
| Next steps | `apps/web/src/webmcp/useWebMcp.ts` → `nextActions` recommends variants after a completed run with no variants. `components/AgentRail.vue` contains similar guidance but is not mounted by the current workspace. Add the visible decision to the active Court screen. |
| Case lifecycle | `apps/api/src/types.ts` and `apps/api/src/store.ts` model cases, versions and runs. Execution updates `court_cases.status`; there is no separate investigation decision. |
| Reports | `apps/api/src/services/sharing.ts` → `buildReportManifest` builds reports for a specific completed run. Public shares are live manifests rebuilt on reads. `reportTradesCsv` exports trades. |
| Evidence | `components/tabs/EvidenceTab.vue` owns local `selectedFailure` and `selectedTrade`. The chart separately owns its symbol and range. Tab remounts discard local selection. |
| WebMCP inspection | `webmcp/useWebMcp.ts` → `snapshot` exposes the active tab, not the selected evidence. `inspect_failure_period` loads evidence and opens the Evidence tab without selecting the inspector target. |
| Setup | `App.vue` enables WebMCP for signed-in users. `get_case_context` tells users without an active case to create one manually. `stores/court.ts` → `createCase` exists but does not accept an actor or cancellation signal. |
| Market data | Court UI, store and API default to `refresh`. `AlpacaMarketProvider.getSnapshot` fetches and validates history. `executeCourt` records provenance and reproducibility metadata. `createSample` creates a case and unconfirmed draft, not a completed run. |
| Cache risk | `Store.findSnapshot` checks date coverage and exact symbols, but not provider, feed or adjustment. Court and replay use it for `prefer_cache`. A compatible date range alone does not establish compatible evidence. |
| Migrations | `Store.migrate` executes the imported `migrations/001_postgres.sql`. A new numbered SQL file would not execute unless the migration runner changed. |

Frontend paths in this table are relative to `apps/web/src` unless written in full.

## 3. Target behavior

### A. A recorded investigation decision

Proposed outcomes:

| Stored outcome | User-facing choice | Meaning |
| --- | --- | --- |
| `rejected` | Close this investigation | The user has enough reason to stop pursuing this version. This does not delete the case or claim universal failure. |
| `needs_more_evidence` | Gather more evidence | The record explains the unresolved question and the next evidence needed. |
| `ready_for_replay` | Continue to replay | The user chooses further testing of an eligible version. Recording the choice does not start replay. |

- Place an editable decision section beside the completed Court findings, using the existing flat layout. Keep charts and detailed verdicts available.
- Each decision includes a concise rationale, one to five references to actual run evidence, remaining uncertainties, and criteria for revisiting the conclusion. "None identified" must be explicit if an uncertainty or revisit field is intentionally empty.
- Bind the record to an exact case, strategy version and completed run. An invalid or failed execution leads to repair/retry guidance, not an evidence-backed research decision.
- The agent may create a decision draft. The person can edit its wording and outcome before confirmation. Agent prose is an interpretation; the underlying numbers still come from the engine.
- Persist drafts privately so refresh does not lose work. After confirmation, keep the record immutable. Later decisions supersede it without deleting prior records.
- Treat closure as a research conclusion, separate from execution status. A person may explicitly continue investigating. New runs do not erase the earlier conclusion, and the interface must label which run it describes.
- Derive next-step guidance in one frontend helper shared by the active Court screen and WebMCP. After a completed run, lead with reviewing evidence and recording a decision. Offer variants only for an explicit hypothesis, not as the automatic next step. Do not reintroduce the unused sidebar for this feature.
- An inconclusive result should prompt a specific evidence question. A recorded rejection ends the default agent workflow. A later explicit user request can resume work.
- Replay keeps its current server checks. A decision cannot make a fragile, rejected or invalid run eligible.
- Include confirmed decisions for the report's exact run in private reports, public shares and JSON exports. Keep draft text and private actor IDs out of public responses. Leave trade CSV columns unchanged.
- Existing share links continue to reflect later confirmed revisions, with timestamps and history. Immutable publication is outside this change. Show that confirming a decision updates an already-shared report.

### B. Shared evidence selection

- Add a store-owned `evidenceSelection` scoped by `caseId`, `versionId` and `runId`. Its target is a failure ID or a trade ID; resolve the object from the run and evidence cache.
- Use the same selection action for table rows, chart trade markers and WebMCP inspection. Keep transient crosshair movement local; moving the pointer must not continuously change agent context.
- Include the selected target, symbol, typed date range, inspector visibility and loading/error state in `get_case_context`. Keep large evidence behind the existing paginated result mechanism.
- Make `inspect_failure_period` open the exact failure inspector. Add `inspect_trade` for one trade, its execution assumptions, relevant bars and related failures. Assemble trade details from the existing run result and `marketEvidence`; no new trade-detail API is needed for the initial scope.
- Require the currently displayed completed run for tools that change selection. Reject stale or foreign run IDs instead of displaying older evidence beside a newer chart. A plain context read for another case must not inherit the active case's selection.
- Drive chart symbol, visible range and selected marker emphasis from the chosen evidence. For a failure involving several symbols, show the available symbols and choose the first deterministically; do not imply that the first symbol explains the whole failure.
- Preserve selection across tab changes and refreshes of the same run. Report that the inspector is hidden when another tab is active. Clear selection on close, sign-out, case/version switch or replacement of the displayed run.
- Use a selection revision plus the case/version/run identity to guard asynchronous work. A late request may fill its scoped cache but cannot reopen a closed inspector, switch tabs, replace a newer selection or overwrite its error.
- Preserve loading, retry, Escape and keyboard focus restoration. Agent selection should show a small "Selected by agent" status; use a stable inspector trigger as the focus fallback.
- Use typed start/end dates, not the formatted `period` label. Domain trades currently lack IDs. Introduce one shared, run-scoped identity mapper using each trade's original persisted array index. Use it for server validation, tools, tables and markers; sorting or filtering must not change an identity.

### C. Agent setup from the user's idea

- Add `create_case` to signed-in WebMCP availability before a case exists. Reuse the existing owner-scoped `POST /api/cases` and manual intake validation limits.
- Accept the name, stated rules, symbols, dates, capital and costs. Return the effective settings so proposed defaults are visible. Do not invent unspecified entry/exit rules; ask about material ambiguity before creating a structured strategy draft.
- Extend `createCase` to accept actor and cancellation context; record agent creation accurately. Navigate to the created case and load it before advertising draft tools.
- Keep `create_case`, `list_indicator_catalog` and `create_strategy_draft` separate. The saved case is not approval to run it. Human strategy confirmation remains unchanged.
- Add an optional client request ID to case creation. Retries with the same owner, key and payload return the original case; conflicting reuse returns a clear conflict. The existing manual flow remains compatible.
- Return the created case ID even if the subsequent navigation or refresh fails, with recovery instructions. Do not repeat creation to recover a lost response.
- Keep the manual wizard. Add a short landing/setup explanation of agent assistance and the review handoff; do not rewrite the page layout.

### D. A reproducible real-data sample

- Verify deployment credentials, history coverage and the account's permission for judge access, charts and exported evidence before preparing the public demo. Credential presence and account rights were not inspected during planning.
- Fix cache matching to include provider, feed and adjustment in addition to dates and symbols. Real-data `prefer_cache` must never select `synthetic_demo`. Replay must use provenance compatible with the Court snapshot.
- Introduce a server-owned sample manifest containing a sample ID, exact strategy and case settings, pinned Court snapshot ID/hash, expected engine version, and an optional separately pinned replay snapshot.
- Expose only the sample ID to clients. Use a bounded sample creation endpoint to copy settings and an unconfirmed draft into the current user's case. Do not expose arbitrary snapshot selection or another user's case history.
- Persist the sample identity on the new case. Add a `saved_sample` run policy that resolves the approved snapshot through that identity, verifies its hash, provenance, coverage and expected engine version, and rejects missing or incompatible data. Keep the existing `refresh`, `prefer_cache` and `frozen` policy values compatible. Variants can reuse the same snapshot; each result must retain its own exact strategy definition.
- Show "Saved Alpaca history" with feed, adjustment, historical dates and retrieval time. Do not call a stored historical snapshot live market data. A fresh fetch remains a separate explicit choice; using it ends exact sample reproducibility for that run.
- Start by evaluating the existing sample settings, which test 2020 through 2024. Keep the actual findings, including weak or inconclusive outcomes. Do not tune a strategy until a preferred verdict appears.
- Keep 2025 reserved for replay. Fetch/store its compatible snapshot separately when needed, but do not expose unrevealed holdout bars through Court context, evidence selection or reports. Do not require replay in the demo if the sample is ineligible.
- Run the normal deterministic engine against the pinned data after human confirmation. Do not fabricate results or depend on a new provider request for each judging session.
- Keep synthetic fixtures and the clearly labeled synthetic landing preview for software tests. Do not commit downloaded prices, credentials, databases or saved user results.

## 4. Proposed contracts and persistence

The following contracts guided the implementation. Decision text and references are stored together in validated `fields_json`; history is returned in case context and bounded through the existing tool-result pagination.

| Change | Location and contract |
| --- | --- |
| Evidence reference | `packages/schemas` defines a closed union for a verdict, failure or trade within a run. A selection accepts failure/trade targets; a decision can also cite a verdict such as insufficient evidence. Validate membership, not just ID shape. |
| Evidence state/tools | `apps/web/src/types.ts`, `stores/court.ts`, `webmcp/useWebMcp.ts`, `EvidenceTab.vue`, chart components and marker mapping. Add `inspect_trade`; enrich context additively. Selection is browser state, not a database record. |
| Decision draft | `POST /api/cases/:caseId/decision-drafts` accepts run/version, outcome, bounded text, evidence references and request ID. User or agent can create a private draft. WebMCP exposes it as `propose_case_decision`. |
| Decision confirmation | `POST /api/cases/:caseId/decisions/:decisionId/confirm` accepts the user's final edited fields and expected predecessor ID. No WebMCP confirmation tool. Reject `actor !== user` using the existing convention. |
| Decision storage | Add `investigation_decisions`: IDs for case/version/run, draft/confirmed state, outcome, text, evidence JSON, source actor, creator, timestamps, confirmed-by and superseded-decision ID. Scope all reads through the owning case. Add request-ID uniqueness for retry safety and an index for case/run history. |
| Decision integrity | Confirm under the existing case transaction lock. Revalidate run/version/evidence association, replay eligibility and predecessor. A repeated identical confirmation returns the saved record; stale or conflicting confirmation returns 409. Confirmed content cannot be updated. |
| Decision reads | Extend `CaseContext`, frontend normalization and WebMCP with current-run decision and draft summaries. Fetch history on demand rather than expanding every tool response. Extend `buildReportManifest`, `normalizeSharedReport` and `SharedReportPage.vue` with optional confirmed decision fields. Older reports render without them. |
| Case retry safety | Add nullable creation request ID and canonical input hash to `court_cases`, with an owner-scoped unique index. Requests without a key keep their existing behavior. |
| Sample creation | `POST /api/samples/:sampleId/cases` copies the server manifest through the same owner checks, transaction and creation request-ID rules. Add a nullable sample ID to `court_cases`. Do not persist provider secrets in the manifest. |
| Sample execution | Extend run policy validation, UI controls and WebMCP schema with `saved_sample`. Resolve the sample server-side; user/agent callers cannot submit arbitrary snapshot IDs. |
| Cache identity | Extend `Store.findSnapshot` inputs and all callers with required provenance. Keep pinned sample lookup separate from "newest compatible cache" lookup. |

Reuse the existing audit log for decision proposals, confirmations and supersession. Existing case/run audit and provenance cover setup and sample execution. Do not log private decision text into general server logs or add an analytics service.

Authority limit: session authentication enforces case ownership. The existing `x-actor` convention distinguishes UI and WebMCP requests but is not cryptographic proof of human action. This change should preserve the explicit review handoff without claiming a stronger guarantee.

## 5. Implementation stages and acceptance

| Stage | Deliverable | Completion check |
| --- | --- | --- |
| 0. Data preflight | Verify Alpaca access/coverage and display/export permission; prepare an internal baseline run. Fix cache provenance before enabling saved-data use. | A real request cannot pick a synthetic cache entry. The baseline has real provenance and usable findings, or an explicit operational blocker. |
| 1. Shared evidence | Typed references, shared selection, failure/trade tools, chart focus and context. | A human-selected trade appears in agent context; an agent-selected failure opens the matching inspector and period. |
| 2. Decision record | Additive storage/API, editable drafts, human confirmation, report integration and shared next-step guidance. | A weak strategy can finish with a recorded rejection and cited evidence. Refresh/export preserve it. The agent is not automatically told to optimize it. |
| 3. Agent setup | `create_case`, actor/cancellation propagation, retry safety and clear setup copy. | From a signed-in landing page, one request creates one case, opens the rules review and leaves execution locked until human confirmation. |
| 4. Prepared demo | Sample manifest, pinned-data execution, reviewer instructions and recorded demo. | A new judge account can complete the case using saved real data while provider requests are unavailable. Report provenance matches the executed snapshot. |

Meaningful tests to add or extend during implementation:

- Schema/service tests for foreign evidence references, invalid runs, user-only confirmation, immutable confirmed content, stale predecessor conflicts, and retry deduplication.
- API/report tests showing that drafts remain private, owner isolation holds, reports include only their exact run's confirmed decisions, old reports still load, and trade CSV stays unchanged.
- Store/tool tests using the mocked `document.modelContext`, Pinia and fetch setup in `apps/web/tests/integrity.test.ts`: selection in both directions, stale/foreign runs, tab visibility, sign-out/reset, close during loading, and delayed A after newer B.
- Chart mapping tests for stable trade identity, marker-to-trade selection and date/symbol focus. Browser checks for actual highlight/range behavior, retry, Escape and restored focus.
- Setup tests for agent audit attribution, schema limits, unconfirmed execution denial, duplicate retries and recovery after case creation succeeds but navigation fails.
- Market tests for synthetic-cache rejection, provider/feed/adjustment mismatch, pinned-data execution during provider outage, missing/hash-mismatched snapshots, compatible replay provenance and unrevealed holdout isolation.
- Determinism check: the same rules/settings/engine and pinned snapshot reproduce numerical results. Compare metadata and inputs explicitly; do not assume separately created cases must have identical identity-dependent IDs.

Run `bun run check` after implementation with the test database available, then complete the authenticated WebMCP journey on the final HTTPS origin. Static source checks alone do not prove the interaction works.

## 6. Migration, rollout and limits

- Use additive, idempotent SQL through the existing migration entry point. No historical backfill is required: old cases have no decision, request ID or sample identity.
- Deploy server support and migrations before the updated client. Missing new response fields must remain safe for older records. Preserve existing routes, policy values and test fixtures.
- Do not deploy over an active Court run. Verify queue depth and complete the signed-in flow after deployment.
- Keep database additions on rollback; revert application code without deleting investigation records or snapshots. A rolled-back client should still open ordinary cases.
- Existing published reports update when their confirmed decisions change. Immutable report snapshots are deferred.
- The real-data demo remains conditional on deployment credentials and the provider agreement. No assumption about redistribution rights follows from the repository's MIT license.
- Preserve current sentence-case copy, sans-serif typography and flat layouts. Any broader UI redesign must first follow the repository's CollectUI reference workflow.

## 7. Demo and success criteria

Use one actual investigation, under the hackathon's three-minute video limit:

1. Bring a stated trading idea into a signed-in case and show the proposed assumptions.
2. Confirm the exact strategy rules as the person.
3. Run Court on the saved Alpaca snapshot and show the real verdict.
4. Select one trade or failure; ask the agent to explain that exact evidence and follow its chart selection.
5. Review and confirm the investigation decision, then open the report with citations and data provenance.

Success means a first-time reviewer can explain the strongest finding, what remains uncertain, and the user's next step. A rejection is a complete outcome. Replay and variants appear only when the actual investigation warrants them.

Planning references: [official judging criteria and rules](https://webmcp.devpost.com/rules), [submission and testing guidance](https://webmcp.devpost.com/resources), `docs/reviewer-testing.md`, and `docs/third-party-materials.md`.
