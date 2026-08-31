# Independent agent workflow test report

Date: August 31, 2026. Environment: existing local checkout, web at `http://localhost:5173`, API at `http://localhost:8787`.

Follow-up on August 31: B1–B4 below are now fixed and verified in the actual local browser. Advertised agent variants execute, rejected case creation preserves the investigation, extra intake fields are rejected, and whole-percentage risk inputs submit. The updated full check passes 170 tests. See [release-readiness.md](./release-readiness.md) for exact checks, QA records and remaining real-data/deployment limits. The original report below is retained as the record of what the independent test found before those fixes.

## Answer

An agent can create a case, discover indicator contracts, draft exact simple or compound rules, and run Court after a person confirms the rules. It can inspect specific evidence, propose a private decision, and return a report containing a visibly confirmed decision. That path worked in the actual browser using explicitly selected synthetic data.

The full agent workflow is **not verified**. The advertised WebMCP variant request fails at the client/API boundary. The manual risk-variant input also rejects ordinary whole-percentage values. Real Alpaca execution, the prepared real-data sample, and successful live-browser replay/monitoring remain unverified. Both tested strategies and their variants were genuinely Fragile; no verdict was changed to unlock replay.

## Scope and method

- Read `AGENTS.md`, the product-improvements plan, reviewer guide, prepared-sample instructions, Browser skill and unslop skill.
- Reused the existing listeners, initially node PID 70409 and bun PID 70410. No server was killed or started. Health returned `ok`, `queueDepth: 0`, engine `strategy-court-domain/0.1.0`.
- Used a separate in-app browser tab and the existing local UI QA session. Browser actions used the Browser skill, including its actual WebMCP capability. Visible confirmation clicks simulated the human test operator; they were not autonomous agent approval or a guard bypass.
- Preserved the dirty checkout. No feature code, verdicts, provider records, environment settings, production data, branches or commits were changed. QA cases remain in the local account.
- Checked credential presence as booleans only. Alpaca key, Alpaca secret and sample-display approval were all absent. No stored passwords, cookies or provider values were inspected.
- Browser screenshots were checked at desktop size and 390 px phone width. Resetting a stalled paginated browser read required reconnecting the browser control session; the existing QA tab and product state were retained. No mutation was repeated merely to recover output.
- Restored the default browser viewport at completion. The API remained healthy with an empty queue. The QQQ Version 2 test share displayed Revoked after the visible revoke flow; its old URL was not independently fetched afterward. The earlier SPY report link remains active locally (anonymous HTTP 200). QA cases and that report were retained, not deleted.

## Verification matrix

`Browser` means the live local application and actual registered WebMCP tools or visible UI. `Isolated tests` means executable tests with a temporary PostgreSQL schema, domain fixtures, or mocked frontend transport. These are not equivalent evidence.

| Scenario | Result | Evidence and limits |
| --- | --- | --- |
| Full baseline check | Pass | `rtk proxy bun run check`: 166 tests, 0 failures, 4,740 assertions, 32 files; all workspace typechecks and production builds passed. |
| Targeted integrity checks | Pass | 47 tests, 0 failures, 379 assertions across API investigation/hardening and web investigation/integrity tests. |
| Landing-page discovery | Pass, Browser | Signed-in landing registered `create_case`, `get_case_context`, `list_indicator_catalog`, `read_tool_result`, `create_strategy_draft`, `create_custom_indicator`. Context correctly reported no active case. |
| Case creation and stable retries | Pass, Browser | SPY case opened with returned settings. Identical stable request ID returned the same case ID. Audit contained one agent-attributed creation. |
| Conflicting request ID | Partial, Browser | Conflict was rejected with a clear message, but it cleared the active case. See B2. |
| Invalid symbol/date | Pass, Browser | `BTC` and `2024-02-30` were rejected; no replacement case was created. |
| Unexpected request field | Fail, Browser | `unexpected: true` created a case despite the closed advertised schema. See B3. |
| Exact simple rules | Pass, Browser | SPY close above/below SMA 20, daily long-only, next-open market fills, 0 bps commission and 5 bps slippage each side. |
| Exact compound rules | Pass, Browser | QQQ AND entry, OR exit, SMA 20, RSI 14, stop 5%, take profit 10%, maximum hold 20 trading days. Structured context preserved all branches and risk values. |
| Indicator contracts | Pass, Browser | Catalog returned `period` and `source`, including allowed sources and bounds. No guessed parameter names. |
| Custom indicator creation | Isolated tests only | Built-ins expressed both scenarios, so no extra private indicator was created in the browser. Existing tests exercised safe formulas, dependencies, argument validation and immutable compilation. |
| Human confirmation boundary | Pass, Browser and isolated tests | Court displayed “Confirm the strategy first” before approval. Visible approval unlocked execution. No confirmation WebMCP tool existed. API tests reject agent confirmation. |
| Real-data refresh error | Pass, Browser | SPY refresh produced an Invalid run with “Refresh requires ALPACA_API_KEY and ALPACA_API_SECRET”; no metrics, verdicts or synthetic fallback were fabricated. |
| Synthetic Court execution | Pass, Browser | Both scenarios completed all seven tests. Both were Fragile. Provenance explicitly identified `synthetic_demo`, `frozen`, adjustment `none`. |
| Determinism | Pass within stated scope | Repeated SPY run reused the same snapshot ID and reproduced all returned summary metrics and seven verdicts exactly. The full domain golden-result test also passed. Browser comparison did not independently diff every raw number in both manifests. |
| Paginated output | Pass with practical limit | Reassembled a 13,448-character case summary from seven pages. Failure inspection returned a 119,653-character handle; report export returned about 597k characters; four-version comparison returned 38,136 characters. Not every large handle was fully consumed. |
| Exact trade inspection | Pass, Browser | `trade-1` opened the SPY inspector for 2020-03-27 through 2020-05-19, with matching fills, costs and chart focus. |
| Exact failure inspection | Pass, Browser | `risk_profile` opened SPY 2021-11-01 through 2022-05-11, with 138 period bars, indicator evidence, execution costs and matching chart context. |
| Human selection and keyboard close | Pass, Browser | Human-selected `trade-0` appeared as `actor: user`. Escape cleared selection and restored the Evidence tab as agent-selection fallback. Closing a human-selected trade restored its exact row trigger. |
| Same-run refresh and tab changes | Pass, Browser | Context refresh preserved selection. `compare_strategy_versions` hid the selected inspector and returned `inspectorVisible: false`; returning to Evidence reopened the same QQQ trade with `true`. |
| Stale/foreign trade references | Pass, Browser | An earlier invalid run ID and `trade-9999` were rejected without selecting foreign evidence. |
| Delayed responses, sign-out, failure retry | Pass, isolated tests only | Tests cover late failure response losing to a newer selection, sign-out cleanup, retry after transport error and filtered stable trade IDs. No forced network outage or sign-out was injected into the shared browser session. |
| Private agent decision and edit/save | Pass, Browser | Agent proposed a cited rejection; operator edited and saved a private draft; edited text survived reload and confirmation. |
| Decision citations and stale references | Pass, Browser and isolated tests | Foreign run and nonexistent trade citation rejected. Live report links navigated to the exact verdict, failure and trade. |
| Immutable confirmation and supersession | Pass | Visible second confirmation produced two public confirmed records with the first text retained. Isolated API tests reject conflicting rewrites and stale predecessors, and allow identical confirmation retry. |
| Rejection ends default guidance | Pass, Browser | Context instructed the agent to preserve the record and continue only on an explicit revisit request. A later determinism test run had no inherited decision for the new run; the original report retained its history. |
| Public report/JSON privacy | Pass, Browser and anonymous HTTP | Confirmed decision appeared. A second private marker did not appear until confirmation. No owner keys or private case/draft IDs appeared in the public manifest. |
| Share revocation | Partial, Browser | QQQ Version 2 share changed to Revoked with “The previous link is revoked and no longer opens the record.” Browser control stalled around native confirmation; after reconnecting, the persisted revoked state was visible. The old URL was not independently fetched after revocation. |
| WebMCP controlled variants | Fail, Browser | Advertised `structuredPatch` produces API 422 and consumes no attempt. See B1. |
| Manual controlled variants | Partial, Browser | Hold cap 10 days and slippage 10 bps executed. Intended 3% stop was blocked by HTML step validation; disclosed 3.01% value executed to complete limit coverage. See B4. |
| Three-variant limit/comparison | Pass, Browser | Three evaluation-informed versions retained, all Fragile. Fourth tool call returned `ok: false`, “No variants were created,” count remained three. Comparison accepted all four version IDs and returned a paginated result. |
| Ineligible replay | Pass, Browser | Fragile SPY rejected by `start_replay_probation`; QQQ and all variants had no eligible version and disabled probation control. |
| Eligible replay and advancement | Isolated tests only; Browser blocked | Existing API/domain tests exercise eligible replay and incremental holdout reveal. The actual QA results were ineligible, so no live-browser replay was started or advanced. No repeated tuning or stored verdict changes. |
| Latest-bar monitoring | Error paths passed, Browser | Saved status stayed separate from replay. Frozen refresh rejected the uncovered current date; real refresh rejected missing Alpaca credentials. Successful latest-bar evaluation is isolated-test coverage only. |
| Pinned sample/provenance/outage/tamper | Pass, isolated adapter tests only | Pinned snapshot execution made zero provider calls, rejected tampering, required replay snapshot, matched report hash and Court range. Synthetic bars labeled test-only inside isolated fixtures are not genuine Alpaca evidence. |
| Missing prepared sample | Pass, Browser | Open sample displayed “The saved Alpaca sample has not been prepared on this server” and offered Use synthetic software demo as an explicit separate choice. No fallback case was created. |
| Holdout isolation | Pass, isolated tests and checked browser report | Court range stayed through 2024; SPY report's latest completed trade was 2024-12-19. No 2025 price rows were returned by the checked Court evidence. Fixture coverage metadata does mention 2025 availability; that is not a holdout-price reveal. |
| Desktop/phone and console | Pass for exercised views | Trade drawer and variant form worked at 390 px; desktop trade/chart layout checked. Captured console log inspection returned no warnings or errors. This is not coverage of every possible responsive state. |

## Reproducible findings

### B1. P1: advertised WebMCP variant payload cannot reach the engine

Prerequisite: open a completed confirmed case with an available variant slot. The QQQ QA case below had zero variants when this was reproduced; it now has three manual variants, so a fresh case is needed to repeat the boundary failure instead of hitting the attempt limit.

Call `create_strategy_variants` using its published schema:

```json
{
  "caseId": "7483317e-b380-42b7-9d42-1347911d7bc6",
  "variants": [{
    "name": "QA hold limit 10",
    "hypothesis": "A shorter hold cap reduces unrecovered exposure.",
    "rationale": "Single-control sensitivity test of the observed recovery failure.",
    "expectedWeaknessAddressed": "Risk profile",
    "structuredPatch": {"risk": {"maxHoldingDays": 10}}
  }]
}
```

Observed before the manual attempts: `ok: false`, “The variant batch is invalid,” no changed IDs, variant count zero. The three-item batch failed in the same way.

Cause: `apps/web/src/stores/court.ts:648` spreads the proposal and adds `patch`, retaining `structuredPatch`. `packages/schemas/src/validation.ts:321` allows only `patch` and rejects the retained key. `apps/web/src/webmcp/useWebMcp.ts:511` advertises the incompatible shape. Directly running the existing validator against the store's resulting shape reports `$[0].structuredPatch: Unexpected property`.

Impact: the required agent-to-variant path fails for schema-compliant callers. Existing tests pass because they do not validate the full advertised WebMCP payload after this translation against the API contract. Fix should remove the wire-only field during translation and add a boundary regression test, not loosen the API's closed schema.

### B2. P2: a rejected case request discards the currently open case

1. Open/create SPY QA with request ID `qa-independent-20260831-spy-sma20`.
2. Call `create_case` with that same ID but a different `name`.
3. The conflict correctly fails, but returned `currentState.caseId` becomes null instead of remaining the original SPY case.

Cause: the catch in `apps/web/src/stores/court.ts:557` unconditionally sets `currentCase` to null. Creation also clears monitoring state before success. Reopening the known `/case/<id>` recovers the saved case, but the active investigation is needlessly lost after an ordinary rejected request.

### B3. P2: `create_case` accepts fields its schema forbids

1. Submit valid SPY setup with a new stable request ID and `unexpected: true`.
2. The published tool schema says `additionalProperties: false`.
3. Actual result was `ok: true`, with a new case `321cc7e1-df9b-4566-9065-50951aa4fba2` opened.

Relevant paths: `apps/web/src/webmcp/useWebMcp.ts:302` validates intake values but does not enforce the advertised closed shape; `apps/web/src/stores/court.ts:541` forwards the spread input. The active browser WebMCP runtime did not reject the extra field for the application. Runtime validation must enforce the application's contract rather than relying on JSON-schema advertisement alone.

### B4. P2: normal percentage risk values cannot be submitted by the variant form

1. Open Variants, choose Stop loss, type `3`, enter an expected outcome, click Run variant.
2. Nothing is submitted. The input retains focus; no attempt is consumed.
3. Browser validity reports `stepMismatch: true` and “The two nearest valid values are 2.91 and 3.01.”

`apps/web/src/components/tabs/VariantsTab.vue:25` sets `min: 0.01` and `step: 0.1`. The input at line 262 binds both values. Native stepping starts from 0.01, so 3, 5 and 10 do not lie on the allowed step grid. The same configuration is present for take profit at line 26; only stop loss was reproduced live. The API accepts 3%. Align the step/base with the intended percentage precision.

## Actual runs and records

All performance numbers below are software-fixture results, not market claims or recommendations.

| Record | ID or result |
| --- | --- |
| SPY case | `1a62634c-1414-4050-bea9-133af94dd9f1` |
| SPY version | `a0ecf771-ede2-4a36-bfdb-ae26f3fb5a19` |
| Missing-credential refresh run | `756ea6ef-56fa-4cbd-99e1-96a77318d881`, Invalid |
| SPY synthetic run | `30ee0cd6-74ff-4911-bb1a-456f3661ecd6`, Fragile |
| SPY deterministic repeat | `19ad3b6c-6562-4096-a88e-6e966dcdb63a`, Fragile |
| Shared SPY snapshot | `67e3a0ce-d0da-4a8e-80bb-9e0d0607a7f1` |
| SPY snapshot hash | `e9df147317c4a38607d00ae3d7b3fa4a1e95d8a953d8888072ec42addac7569b` |
| SPY reproducibility ID | `sha256:a2eb9491813a6c68b7949a979578d4ca669004aa64e9f5f2336cdf6f910f6fe1` |
| Original agent decision draft | `7d61c724-9bd9-4ad8-9547-adff34f79bdb` |
| Edited, first confirmed decision | `c3899df9-0795-4c68-907d-2760a9f199e4` |
| Superseding confirmed decision | `330ad7b3-ca79-4eaf-9b1f-a377a80b38af` |
| QQQ case | `7483317e-b380-42b7-9d42-1347911d7bc6` |
| QQQ baseline version/run | `f5dac701-3086-4cc8-a254-730c2608bfcd` / `e2db0253-1d98-47f6-914f-b753cd047c9c` |
| QQQ snapshot | `0ec90adc-90a9-48cc-97d9-79563c6b87e8` |
| Manual hold-cap variant | `445586fb-c526-425f-ac20-b7c15afbeda3`, Fragile |
| Manual slippage variant | `be1d4888-3860-4538-8f95-2fdd05b558fe`, Fragile |
| Manual 3.01% stop variant | `e75247ef-4534-47f6-8f2f-fc97cc86ff84`, Fragile |
| Extra case created by B3 | `321cc7e1-df9b-4566-9065-50951aa4fba2`, no strategy/run |

SPY had 91 completed trades, 30 in evaluation, 106.1738175658% net return, 14.5769030781% maximum drawdown and 271-day unrecovered drawdown duration. The first four tests passed; regime stability warned; profit concentration and risk profile failed. Best-five contribution was 104.3559600916% of completed-trade net profit.

QQQ had 73 completed trades and 26 evaluation trades, about 49.7% net return and 8.4% drawdown. Evidence sufficiency and out-of-sample were Inconclusive; parameter stability passed; execution resilience warned; regime stability, profit concentration and risk profile failed. The UI comparisons showed 51.2% for the 10-day hold cap, 39.2% for doubled slippage, and 48.6% for the 3.01% stop. All remained Fragile and ineligible.

## Remaining prerequisites and untested boundaries

- Genuine Alpaca data requires server credentials, an appropriate feed/account entitlement, working provider access and an established basis for judge display/export. Credential presence alone would not establish permission.
- No real sample was prepared and `SAMPLE_DATA_DISPLAY_APPROVED` was not set. Pinned-data adapter tests do not substitute for that preparation.
- The original SPY report remains available at `http://localhost:5173/report/38bf90f716c65363adcb889a14e856d4eda83f864aaafea016cab1ade7f015d9`. After the determinism rerun, the active case selected the newer run. Management/revocation of that older-run link was not completed; no direct database or session manipulation was used to force cleanup.
- Successful browser replay and current-bar monitoring require valid eligible/current-data scenarios. Their isolated test paths passed, but the actual QA scenarios did not qualify or lacked coverage/credentials.
- A saved-case navigation-callback failure was not injected in the browser. Reopening a known case URL was verified; retry atomicity and ownership were tested separately.
- Actual browser sign-out, late-response races and forced offline retry were not exercised in this shared signed-in session. Their existing isolated tests passed.
- The final deployed HTTPS origin and production migration state were not tested. No deployment was performed.

Phone captures are local task artifacts: [variant form](/Users/roman/.codex/visualizations/2026/08/31/01a057c4-ca44-7f30-959e-5a093d5aebe8/qa-phone-variants.png) and [trade inspector](/Users/roman/.codex/visualizations/2026/08/31/01a057c4-ca44-7f30-959e-5a093d5aebe8/qa-phone-trade.png).
