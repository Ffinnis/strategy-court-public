# Reviewer test guide

## Open the app

Live URL: https://strategy-court-production.up.railway.app/

Use ChatGPT's in-app browser, or Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled and the browser relaunched. These are the [hackathon's documented testing environments](https://webmcp.devpost.com/resources). In Chrome, enable `chrome://flags/#devtools-webmcp-support` to inspect tools in DevTools. Other browsers retain the manual interface but may not expose WebMCP.

Create an email/password account through the app. Google login is not required. Cases are private to the signed-in account; no existing user's credentials or provider API keys are needed in the browser. If the submission provides a separate judge account, use those credentials instead. Do not put passwords in the public repository.

## Fast judge path

Use this prompt after signing in:

> Open the prepared sample if it is available. Otherwise choose the synthetic software demo and say clearly that its generated prices test the investigation workflow, not market performance. Read the active rules, leave confirmation to me, run Court after I confirm, then select the failed test that most limits confidence. Keep the returned verdict and IDs. Do not tune the strategy or search for a better result.

This path needs no shared credentials. If the saved sample is unavailable, choose **Use synthetic software demo** in the visible app before asking the agent to continue. The synthetic route exercises the same case, confirmation, Court, evidence-selection, decision and report workflow. It does not establish anything about the named securities.

## Exercise WebMCP

1. Choose **Open sample** to open the prepared RSI strategy with saved Alpaca history. If it is unavailable, choose **Use synthetic software demo** for a complete software-workflow test, or ask the operator to [prepare the real-data sample](./prepared-sample.md). You can also ask an agent to call `create_case` with your idea, reviewed settings, and a stable request ID.
2. Without an open case, ask the agent to call `list_cases`, then `open_case` with an exact returned ID. The visible app must navigate to that owned investigation. With a case open, call `get_case_context` with `{}` and check `currentState.caseId` against the visible case. Repeating `create_case` with the same request ID and settings must return the original case.
3. For a new strategy, ask for a daily long-only rule that buys above SMA 120 and sells below SMA 120, using next-open execution and five basis points of slippage per side. The agent first calls `list_indicator_catalog` with `ids: ["sma"]` to read exact parameter names, then `create_strategy_draft`. Indicators use a structured `arguments` array; compound rules use `all`, `any`, or `not`, not executable JavaScript.
4. Review the visible rules and confirm them yourself. An agent tool cannot bypass this confirmation.
5. Ask the agent to run the confirmed version through `run_court`. Use the case ID, version ID, locked dates and symbols from context. Prepared samples default to `saved_sample`; ordinary cases default to `refresh`. For offline software testing only, explicitly choose **Synthetic demo** or pass `dataSnapshotPolicy: "frozen"`. Generated prices are not actual market evidence.
6. Read `get_case_context` after completion. A successful execution can still produce a weak or inconclusive strategy verdict; it is not a promise of profit. If the run is Invalid, read the returned reason rather than interpreting it as zero return.
7. Ask the agent to call `inspect_trade` or `inspect_failure_period` with IDs from that run. The exact inspector opens with a **Selected by agent** status and matching chart focus. Select another trade manually, then check that context reports it with `actor: "user"`. Closing the inspector clears selection; changing tabs preserves it but reports it hidden. Large responses use `read_tool_result` pages.
8. Ask the agent to call `propose_case_decision` with a rationale, one to five evidence references, uncertainty and revisit criteria. Edit and confirm the private draft in Court. Reload and check that the confirmed decision persists. The report and any existing share link include confirmed history, but never private drafts. A recorded rejection tells the agent to stop unless you ask to revisit it.
9. Optionally test a controlled variant for a stated hypothesis, compare all attempts, and inspect Audit. The three-change limit still applies. `get_monitoring_status` reads saved latest-bar evidence; `refresh_monitoring` requests a new evaluation. Replay is separate, requires an eligible surviving or inconclusive result, and uses a prepared holdout for the sample. Recording a decision does not unlock or start replay.

## Offline data and failure states

- Synthetic coverage: fictional weekday sessions for AAPL, MSFT, NVDA, QQQ, SPY; 2020 through 2025. Symbol labels do not make these actual security prices. The default sample tests through 2024 and keeps 2025 for replay. Other symbols or ranges correctly fail coverage validation.
- Latest-bar monitoring uses the current completed trading date. A frozen snapshot cannot check dates beyond its coverage; use refresh for a current check.
- Refresh: requires server-side Alpaca credentials and a working provider. A page times out after 15 seconds; the snapshot deadline is 60 seconds. Failure does not silently substitute frozen data.
- Saved sample: works without a provider request after preparation. A missing manifest, changed snapshot hash, incompatible engine or missing replay snapshot produces an explicit error. **Use synthetic software demo** is a separate opt-in fallback on the landing page.
- Missing tools: verify browser support, sign-in, and the open case. Tools are registered progressively as the case advances; refresh the tool list after confirmation or a run.
- Expired result handle: repeat the original read-only request. Do not repeat a mutation merely to retrieve its output; read the case context instead.
- Results are deterministic historical simulations. Monitoring is an on-demand check of completed bars, not automatic live trading, a scheduler, or a prediction model.

## Operator checks before submission

Run `bun run check` with a test PostgreSQL database, then verify `/api/health`, the landing page, `/auth`, `/new`, the case route, and chart assets on the final HTTPS origin. Test an authenticated WebMCP workflow on that same origin. Do not deploy over an active Court run: `/api/health` should report `queueDepth: 0`.

Supply judge access instructions in the submission if needed. Video production and the application description are handled by the project owner. Check repository visibility, license recognition, third-party permissions, and personal eligibility separately; a passing code test does not establish contest eligibility.
