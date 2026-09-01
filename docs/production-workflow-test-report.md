# Production workflow test, August 31, 2026

## Assessment

**Fail for acceptance of the requested new workflow.** Production did not serve the features from `df7dcdbd14a8adc5f09128b6f04067fbdb21281b` during this test. The older release completed registration, exact strategy drafting, visible confirmation, synthetic Court execution, a manual variant, and anonymous report sharing with revocation. Its advertised agent variant and ordinary 3% risk inputs still failed.

This was a live HTTPS browser test at [Strategy Court production](https://strategy-court-production.up.railway.app/), using actual page WebMCP tools and visible controls. It was not a localhost test, an API-only simulation, or a rerun of unit tests. All performance results below use explicitly synthetic software data and are not market evidence or trading advice.

## Deployment evidence

| Evidence | Observation |
| --- | --- |
| Requested source | `df7dcdbd14a8adc5f09128b6f04067fbdb21281b`, Add shared investigations and reproducible samples. The local checkout was at this commit. |
| GitHub deployment | The latest record remained deployment `6170223390`, environment `giving-success / production`, SHA `84aeee6acc7116e31dd149ae501c4ddfe168a021`. It was created August 30 at 19:11:09 UTC and marked successful at 19:11:46 UTC. [Deployment record](https://api.github.com/repos/Ffinnis/strategy-court-public/deployments/6170223390), [statuses](https://api.github.com/repos/Ffinnis/strategy-court-public/deployments/6170223390/statuses). |
| New commit status | GitHub's combined status was `pending` with an empty statuses array. No deployment record for the requested commit appeared in the checked responses. This does not establish that an actual rollout was underway. |
| Served assets | `/assets/index-DBXjstPn.js` and `/assets/index-CHeRVDTc.css`, unchanged at the 14:39:53, 14:42:42, and 14:47:39 UTC checkpoints. |
| JavaScript fingerprint | At 14:45:54 UTC the entry asset returned HTTP 200, 222,846 bytes, SHA-256 `be91a28c62ac63fa427f180a6a2899b6330f7ec40d673136e1f8551b2f110b68`. It lacked the checked `create_case`, `inspect_trade`, `propose_case_decision`, and `saved_sample` strings. The live tool list independently lacked the three named tools. |
| Health | Initially HTTP 200, `status: ok`, queue depth 0, engine `strategy-court-domain/0.1.0`. At 14:46:59 UTC health returned HTTP 503. At 14:47:39 UTC it returned HTTP 200 with queue depth 0 again. |

The tested artifact is identified by its URL and content hash above. Deployment metadata associates production with `84aeee6`; the application did not expose a source SHA, so this is not a cryptographic source-to-artifact verification. Neither a successful push nor a healthy response was treated as proof that `df7dcdb` was running. Rechecks were separated by account setup and workflow testing, not repeated rapid polling.

## Account and scope

- Created the unique identity `Production QA 20260831 66962b` through the production registration UI. Used an invented address under the reserved `example.test` domain and a cryptographically generated password with 256 random bits plus complexity characters. No confirmation email was required.
- Kept credentials in memory only. No password, account email, session token, cookie, or authentication body was printed, saved in the repository, or included in screenshots. No session storage was inspected.
- Signed out the pre-existing browser session without opening its records, then used only the new QA account. Finished signed out.
- Created one labeled synthetic QA case and one built-in sample case through Open sample. Ran exactly two sequential Court jobs, the baseline and one manual holding-cap variant. The sample remains unconfirmed and unrun.
- Changed no application code, branch, deployment, configuration, data-rights flag, or other user's records. Did not commit or push. The only repository deliverable is this report.
- Read release readiness, the earlier agent workflow report, prepared-sample instructions, and relevant current and older-release contracts for orientation. Their historical test results are not counted as production passes here.

## Live verification

| Scenario | Result | Observed versus expected |
| --- | --- | --- |
| Registration and fresh landing | Pass | Registration opened `/new` with empty fields. `get_case_context` returned no active case, zero active version, and no run. |
| Session persistence and sign-in | Pass | Reload restored the QA account. Sign-out returned the public landing page and removed WebMCP tools. Signing in with the generated credentials returned to `/new`. Later case reloads retained the account and saved records. |
| Agent discovery | Partial | Fresh-account tools were `get_case_context`, `list_indicator_catalog`, `read_tool_result`, `create_strategy_draft`, and `create_custom_indicator`. No `create_case` existed. |
| Agent case creation, idempotency, strict unknown fields, conflicting creation | Blocked by deployed version | Did not call unadvertised tools or substitute direct API requests. These requested fixes cannot be certified on this release. Manual case creation worked. |
| Indicator contract and exact draft | Pass | Read the SMA catalog, then used `create_strategy_draft` with named `period: 20` and `source: close` arguments. Visible rules matched SPY close above/below SMA20, daily long-only, next-open market fills, 0 bps commission and 5 bps slippage each side. |
| Human confirmation boundary | Pass for exposed interface | Draft result said `confirmed: false`. Court displayed “Confirm the strategy first” and “The Court cannot test an unapproved interpretation.” Neither a confirmation tool nor `run_court` was exposed before approval. The QA operator clicked the visible “Confirm this interpretation” control. Only then was `run_court` advertised. No direct API guard-bypass attempt was made. |
| Baseline Court | Pass | Explicit `dataSnapshotPolicy: frozen` completed all seven tests. UI and tool context agreed on Fragile, 91 trades and the seven findings below. Equity/drawdown chart rendered at desktop size. |
| Agent failure evidence | Partial | `inspect_failure_period` loaded `risk_profile`, switched to Evidence, and populated the stress-period row. Its paginated result identified the period and exact trades/costs. The older UI did not open the newer shared inspector or focus a shared chart selection. |
| Human trade inspection | Pass for local UI, fail for shared context | Clicking the March 3, 2020 SPY trade opened a readable drawer with entry/exit fills, quantity, costs, reason and regime. `get_case_context` contained no selected-evidence state or selection actor. `inspect_trade` was absent. |
| Invalid evidence selection | Pass within available tool | `qa_missing_failure` returned `ok: false`, “Failure evidence not found,” and HTTP 404. The open human trade drawer and active case/version remained unchanged. Invalid trade selection could not be tested because that tool was absent. |
| Reload persistence | Partial | Confirmed rules, both versions, both runs and the Fragile result persisted. Reload closed the trade drawer and reset the active tab to Strategy. Selection persistence did not pass. |
| Agent-proposed variant | Fail | A schema-compliant `structuredPatch` request returned “The variant batch is invalid,” HTTP 422, no changed IDs, and zero attempts consumed. See P1 below. |
| Manual 3% stop and take profit | Fail | Both failed native step validation. No job or variant was created. See P2 below. |
| Other manual variant and comparison | Pass | A separately labeled 10-day holding-cap experiment completed and remained evaluation-informed and Fragile. UI compared both versions; WebMCP comparison returned a paginated result for the exact two requested IDs. |
| Decision drafts, editing, persistence, confirmation and immutable decision history | Blocked by deployed version | `propose_case_decision` and decision-edit/confirm controls were absent. The labels “Decision record” and “Decision history” referred to verdicts and audit events, not the newer cited conclusions. No private decision draft was created, so draft leakage and immutable supersession were not tested. |
| Honest stopping outcome | Pass for test conduct; product decision flow blocked | Both evaluated versions were Fragile. Retained both results, reported rejection for this QA scenario, and stopped after one feasible manual variant. No verdict was altered or repeatedly tuned to unlock replay. No confirmed rejection was saved through the absent decision feature. |
| Sharing and anonymous access | Pass | Created one unlisted link from Audit for the synthetic baseline. Signed out before opening it. Anonymous API returned HTTP 200, and the browser showed Version 1, all seven verdicts, 91 trades and synthetic provenance. Reload preserved the report. |
| Public privacy | Pass within checked data | Read the actual anonymous report response. It omitted the checked private case, baseline run and baseline version IDs, account email/password and owner-user keys. The report contained only the QA case's content and synthetic prices. Unconfirmed decision-text exclusion remains untested because that feature was absent. |
| Citation navigation | Blocked by deployed version | Public report had no decision citations or links to specific verdict/failure/trade citations. Existing general links did not provide the requested citation workflow. |
| Revocation | Pass | Owner UI persisted Revoked. After sign-out, the first anonymous recheck encountered a server error during the health incident. After health recovered, “Try again” returned HTTP 404 and “Shared resource not found.” The old QA link no longer opened the report. |
| Open sample | Partial, prepared-data gate blocked | Open sample created an account-owned unconfirmed RSI pullback draft for AAPL/MSFT/NVDA/QQQ/SPY, 2020–2024. It did not report a pinned provider snapshot, show the new missing-prepared-sample error, or offer the newer separate fallback action. It retained the prior Audit tab until Strategy was selected. The deployed sample path creates an ordinary draft. No approved real-data sample was established by this test. |
| Synthetic labeling | Pass for executed runs | Explicit frozen policy, Court chart and public provenance identified `synthetic_demo`, feed `frozen`, adjustment `none`. The landing preview also said its prices were generated. Did not claim this established a real sample or data-display permission. |
| Replay | Gate passes; successful replay blocked | Both versions had an empty replay-eligible list. UI said “No version is eligible for replay.” `start_replay_probation` rejected the baseline with “Choose a version listed as replay-eligible by get_case_context.” No replay was started or advanced. |
| Monitoring | Untested refresh, saved empty state visible | Probation showed Not checked and no saved completed-bar evaluation. Browser auto-review rejected `refresh_monitoring` before execution, classifying a fresh production market-data fetch as outside its allowed synthetic scope. No workaround, alternative UI refresh, raw request, or provider probe was used. Therefore provider configuration and successful monitoring remain unknown. |
| Responsive behavior | Pass for checked views | Measured actual viewport `390 × 844` and document scroll width `390` for the manual variant form, trade drawer and anonymous report. Readable controls and content; workspace tabs used horizontal overflow. Restored default viewport and verified `1280 × 720`. This is not all-page/all-device coverage. |
| Console and requests | Partial pass with an availability incident | Captured console warning/error reads returned empty arrays. Network diagnostics recorded expected invalid-evidence 404, reproduced variant 422, transient report 500 and final revoked-report 404. A few canceled navigations produced `net::ERR_ABORTED`. The first event-buffer read reported truncation, so this is not a complete HAR or proof of zero other failures. |

## Findings requiring attention

### P1: requested workflow is not deployed

The missing tools, unchanged assets and old successful deployment record prevent production acceptance of `df7dcdb`. The case-creation retry/validation fixes, shared evidence selection, cited decisions and prepared-sample workflow must be retested after the intended artifact is observably deployed. This test made no deployment changes.

### P1: advertised agent variant fails

After the baseline completed and `risk_profile` was inspected, called the actual production tool:

```json
{
  "caseId": "df396b9c-8cf7-4951-8680-1013621f46ef",
  "variants": [{
    "name": "QA 66962b holding cap 10",
    "hypothesis": "A ten-day holding cap reduces unrecovered exposure in this synthetic QA run.",
    "rationale": "Bounded QA check after risk_profile failure, without treating synthetic results as trading evidence.",
    "expectedWeaknessAddressed": "Risk profile",
    "structuredPatch": { "risk": { "maxHoldingDays": 10 } }
  }]
}
```

Expected a created and evaluated variant using the advertised schema. Observed HTTP 422 on `/api/cases/<QA case>/variants`, `ok: false`, “The variant batch is invalid,” `changedIds: []`, and `variantCount: 0`. The subsequent manual holding-cap variant succeeded, so this was not an engine inability to evaluate that control. This reproduces earlier B1 on production; the local fix is not certified as deployed.

### P2: ordinary 3% inputs cannot submit

In Variants, chose Stop loss, entered `3`, entered an expected outcome and clicked Run variant. Repeated with Take profit. Both inputs reported `min: 0.01`, `step: 0.1`, `stepMismatch: true`, and “The two nearest valid values are 2.91 and 3.01.” Both retained all three attempts and submitted no Court job. Expected 3% to be valid. Did not substitute 3.01% and count it as a pass. The separate successful manual experiment used a 10-day holding cap.

### P2: evidence selection does not cross the human/agent boundary

Human trade selection was visible in a drawer, but absent from agent context. Agent failure inspection returned evidence and updated a row without the newer shared inspector. Reload discarded the human selection. These are observed limitations of the served release, not evidence that the new selection implementation regressed.

### P2: agent export does not match the selected version

With Version 1 active, context identified baseline run `2fb2d9e6-77b4-4571-b069-5a753842c424`. `export_case_report` instead returned a manifest beginning with Version 2 and run/report ID `1f758834-146e-403b-9674-1ce65a80a0c4`, the newer holding-cap run. The visible Share report flow correctly shared Version 1. An agent must inspect the returned manifest's version rather than assume it matches the active evidence. Only the first report-result page was needed to establish this mismatch; the full 615,230-character tool result was not reassembled.

### P2 incident: brief production unavailability

At 14:46:59 UTC `/api/health` returned HTTP 503. The anonymous revoked-report request returned HTTP 500 with a generic request error at the same stage. At 14:47:39 UTC health returned HTTP 200, queue depth 0, and the same entry assets. A subsequent visible retry returned the correct revoked-report 404. Cause and exact outage duration are unknown; no production configuration or services were changed by this tester. The recovered state does not erase the incident.

## Actual records and synthetic findings

| Record | ID |
| --- | --- |
| Main QA case | `df396b9c-8cf7-4951-8680-1013621f46ef` |
| Baseline version | `c39f698d-494f-4211-8141-74c247600114` |
| Baseline run | `2fb2d9e6-77b4-4571-b069-5a753842c424` |
| Baseline snapshot | `120681d1-4d98-4683-a34b-ff9f7e041cd0` |
| Manual holding-cap version | `b53200f7-a94b-4dbc-beee-d89d66aa334f` |
| Manual holding-cap run | `1f758834-146e-403b-9674-1ce65a80a0c4` |
| Built-in sample case, unconfirmed and unrun | `0fddc6d4-dc69-4abf-a9bd-8bccdfd9e7f2` |
| Built-in sample draft | `f868d000-0edb-41ac-a8ea-04a7965034e9` |

Baseline provenance was provider `synthetic_demo`, feed `frozen`, adjustment `none`, 1,304 bars, range 2020-01-02 through 2024-12-31, engine `strategy-court-domain/0.1.0`. Snapshot hash was `e9df147317c4a38607d00ae3d7b3fa4a1e95d8a953d8888072ec42addac7569b`; reproducibility ID was `sha256:309d845e1cdccc4eaaabda23aaaa5648e8412cdf21adced6f67d59c901c727ea`. The synthetic fixture's reported retrieval timestamp was `2026-08-31T00:00:00.000Z`, not evidence of an Alpaca retrieval.

| Test | Baseline | 10-day holding cap |
| --- | --- | --- |
| Evidence sufficiency | Pass, 30 evaluation trades | Pass, 43 evaluation trades |
| Out-of-sample robustness | Pass | Pass |
| Parameter stability | Pass, 8/8 profitable neighbors | Pass, 12/12 profitable neighbors |
| Execution resilience | Pass | Pass |
| Regime stability | Warning, 2/3 regimes positive | Warning, 2/3 regimes positive |
| Profit concentration | Fail, best five contribute 104.4% | Fail, best five contribute 75.6% |
| Risk profile | Fail, unrecovered drawdown | Fail, unrecovered drawdown |

The baseline had 91 completed trades, net return +106.2%, profit factor 2.19 and maximum drawdown 14.6%. The holding cap had 134 trades, net return +88.2%, profit factor 1.73 and maximum drawdown 13.8%. Both remained Fragile. These generated-data results justify stopping this QA investigation; they establish no real-world strategy quality.

## Evidence captures and remaining limits

Screenshots are local task artifacts outside the repository:

- [Desktop Court and chart](/Users/roman/.codex/visualizations/2026/08/31/01a05841-f169-70b0-9152-82958e48cde9/production-court-desktop.png)
- [3% take-profit validation at 390 × 844](/Users/roman/.codex/visualizations/2026/08/31/01a05841-f169-70b0-9152-82958e48cde9/production-variant-3percent.png)
- [Phone trade inspector](/Users/roman/.codex/visualizations/2026/08/31/01a05841-f169-70b0-9152-82958e48cde9/production-trade-phone.png)
- [Anonymous phone report](/Users/roman/.codex/visualizations/2026/08/31/01a05841-f169-70b0-9152-82958e48cde9/production-report-phone.png)
- [Transient report error](/Users/roman/.codex/visualizations/2026/08/31/01a05841-f169-70b0-9152-82958e48cde9/production-revoked-report-error.png)
- [Revoked report after recovery](/Users/roman/.codex/visualizations/2026/08/31/01a05841-f169-70b0-9152-82958e48cde9/production-report-revoked.png)

Real Alpaca execution, provider entitlement, sample-display permission, a pinned approved sample, real-data outage independence, successful replay/advancement, fresh monitoring, decision-draft privacy, citation navigation and immutable confirmed-decision history remain unverified in production. Earlier local and isolated test coverage does not replace those checks. No load test, forced outage, broad data probing or successful-mutation retry for output recovery was performed.

Final browser state was signed out with the QA share revoked and the viewport reset. QA records were retained. The last checked health response was healthy with an empty queue; the requested new build still was not evidenced as deployed.
