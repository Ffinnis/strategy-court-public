# Reviewer test guide

## Open the app

Live URL: https://strategy-court-production.up.railway.app/

Use ChatGPT's in-app browser, or Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled and the browser relaunched. These are the [hackathon's documented testing environments](https://webmcp.devpost.com/resources). In Chrome, enable `chrome://flags/#devtools-webmcp-support` to inspect tools in DevTools. Other browsers retain the manual interface but may not expose WebMCP.

Create an email/password account through the app. Google login is not required. Cases are private to the signed-in account; no existing user's credentials or provider API keys are needed in the browser. If the submission provides a separate judge account, use those credentials instead. Do not put passwords in the public repository.

## Exercise WebMCP

1. Choose **Open sample** to open the sample RSI strategy, or create a case for QQQ with a 2020-01-02 to 2024-12-31 test range and $10,000 capital.
2. Ask the agent to call `get_case_context` with `{}`. Check `currentState.caseId` against the visible case. With no open case, the tool tells the agent to open one rather than inventing an ID.
3. For a new strategy, ask for a daily long-only rule that buys above SMA 120 and sells below SMA 120, using next-open execution and five basis points of slippage per side. The agent first calls `list_indicator_catalog` with `ids: ["sma"]` to read exact parameter names, then `create_strategy_draft`. Indicators use a structured `arguments` array; compound rules use `all`, `any`, or `not`, not executable JavaScript.
4. Review the visible rules and confirm them yourself. An agent tool cannot bypass this confirmation.
5. Ask the agent to run the confirmed version through `run_court`. Use the case ID, version ID, locked dates, and symbols returned by the context tool. Default policy `refresh` reads real Alpaca SIP history on the server. For offline software testing only, explicitly pass `dataSnapshotPolicy: "frozen"`, labeled **Synthetic demo** in the interface. Generated prices are not actual market evidence.
6. Read `get_case_context` after completion. A successful execution can still produce a weak or inconclusive strategy verdict; it is not a promise of profit. If the run is Invalid, read the returned reason rather than interpreting it as zero return.
7. Ask the agent to inspect a returned failure ID. The visible Evidence tab and the tool response should describe the same trades and period. Large evidence responses return a handle; read all `read_tool_result` pages before interpreting the complete evidence.
8. Optionally create a controlled variant, compare versions, and inspect Audit. Every attempt remains attributed to the user, agent, or system. The investigation permits at most three post-evaluation changes.
9. Call `get_monitoring_status` to read saved latest-bar evidence. Call `refresh_monitoring` only to request a new evaluation. Replay is separate and only allowed for an eligible surviving or inconclusive version; a rejected or fragile result does not unlock replay.

## Offline data and failure states

- Synthetic coverage: fictional weekday sessions for AAPL, MSFT, NVDA, QQQ, SPY; 2020 through 2025. Symbol labels do not make these actual security prices. The default sample tests through 2024 and keeps 2025 for replay. Other symbols or ranges correctly fail coverage validation.
- Latest-bar monitoring uses the current completed trading date. A frozen snapshot cannot check dates beyond its coverage; use refresh for a current check.
- Refresh: requires server-side Alpaca credentials and a working provider. A page times out after 15 seconds; the snapshot deadline is 60 seconds. Failure does not silently substitute frozen data.
- Missing tools: verify browser support, sign-in, and the open case. Tools are registered progressively as the case advances; refresh the tool list after confirmation or a run.
- Expired result handle: repeat the original read-only request. Do not repeat a mutation merely to retrieve its output; read the case context instead.
- Results are deterministic historical simulations. Monitoring is an on-demand check of completed bars, not automatic live trading, a scheduler, or a prediction model.

## Operator checks before submission

Run `bun run check` with a test PostgreSQL database, then verify `/api/health`, the landing page, `/auth`, `/new`, the case route, and chart assets on the final HTTPS origin. Test an authenticated WebMCP workflow on that same origin. Do not deploy over an active Court run: `/api/health` should report `queueDepth: 0`.

Supply judge access instructions in the submission if needed. Video production and the application description are handled by the project owner. Check repository visibility, license recognition, third-party permissions, and personal eligibility separately; a passing code test does not establish contest eligibility.
