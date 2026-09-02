# Release readiness, September 2, 2026

This document records the current production acceptance result. All earlier deployment notes are superseded.

## Verdict

The core product, WebMCP workflow, persistence, account isolation, desktop layout, and mobile evidence inspector were exercised against the live origin. Before recording, verify that the deployed build matches public `main` and passes the database cold-start probe.

This acceptance establishes software behavior. It does not establish trading performance or validate the generated prices as market evidence.

## Production verification

- Live origin: <https://strategy-court-production.up.railway.app/>
- Required revision: the `buildId` from `/api/health` must equal `git rev-parse origin/main`
- API health: `status: ok`, queue depth 0, recovered jobs 0
- Engine: `strategy-court-domain/0.1.0`
- Served assets: `index-W2wNWKPk.js` and `index-FH06kBDi.css`

This release adds bounded database wake-up handling. It retries only readiness probes, returns a retryable `503` while Postgres starts, and never replays the user's route or mutation.

## Acceptance evidence

| Area | Result |
| --- | --- |
| Local release gate | `bun run check` passed: 225 tests, 0 failures, 5,167 assertions across 36 files. Type checks, notices, fixture verification, and production builds passed. |
| Fresh accounts | Two isolated production accounts signed up successfully and started with empty case lists. |
| Case creation | A repeated `requestId` returned one case. Concurrent retries did not create duplicates. Unknown fields, unsupported symbols, and oversized search queries returned validation errors and created no cases. |
| Human authority | Court rejected an unconfirmed strategy. An agent-authored draft remained unconfirmed. Agent confirmation returned `user_confirmation_required`; confirmation through the user path succeeded. No WebMCP confirmation tool exists. |
| Court run | A fresh confirmed strategy completed with seven verdicts, three failures, reproducibility metadata, and an explicit `synthetic_demo` source. |
| Ownership | A second account could not list or read the first account's case, run, failure, or report. Anonymous case access returned an authentication error. |
| WebMCP | The production bundle contains all 19 progressive tool definitions. Live browser calls covered case listing and opening, case context, Court execution, evidence inspection, shared user selection, private decision drafting, report export, and paged result reconstruction. |
| Large results | A live 601,121-character report was reconstructed through `read_tool_result`. A second production report returned a 592,976-character manifest with a compact summary below the normal response budget. |
| Shared UI state | Agent-selected evidence opened the visible inspector. A trade selected in the interface returned through WebMCP with `actor: user`. |
| Decision boundary | An agent proposal appeared as a private draft with citations. The interface required the person to review and confirm it. The clean recording case intentionally has no decision yet. |
| Desktop UI | The completed case rendered at 1280 px without horizontal overflow, console warnings, or console errors. Results, Evidence, Compare, Rules, Replay, and Activity remained available. |
| Mobile UI | Landing and case workspace rendered at 390 px without horizontal overflow. The evidence inspector opened, focused its close control, and kept the relevant Inspect action within the viewport. |

## Recording case

The production QA account contains a clean evaluated case that can be used as a fallback during recording:

- Case: `43613d27-4f8c-4ef0-94b1-049103ba7e54`
- Version: `b852391c-8569-4d4b-88ac-d0771abd4755`
- Run: `e50daf5c-a6f3-4578-a11e-588acf975d1f`
- Strategy: SPY close above SMA 20; exit when close falls below SMA 20
- Range: January 2, 2020 through December 31, 2024
- Result: `Fragile`
- Pass: evidence sufficiency, out-of-sample robustness, parameter stability, execution resilience
- Warning: regime stability
- Fail: profit concentration and risk profile
- Trades: 91
- Decision: none

The clearest findings are:

- The best five trades contribute 104.4% of completed-trade net profit.
- The final drawdown did not recover before the test ended.

The case uses generated prices and must be presented as a software demonstration, not as evidence about SPY.

## Remaining risks and work

1. Two malformed API requests briefly returned `500 internal_error` during one parallel production probe around `2026-09-02 06:24 UTC`. Railway logs show that the service was waiting for its sleeping Postgres instance: `ETIMEDOUT`, `ECONNREFUSED`, then `database system is starting up`. Exact retries returned the correct `422` and no bad data was created. The release hardens this path; repeat the cold-start probe after every deployment.
2. No display-approved real-data example is ready. Keep the generated-price disclosure visible and do not claim market validation, profitability, or expected returns.
3. The final public video has not been recorded or uploaded.
4. The Devpost entry has not been submitted. Confirm the public repository, MIT license display, public video, entrant details, and all required fields before the deadline.
5. Short usability sessions with people who inspect trading strategies have not been completed. Report them only if they actually happen.
6. Production QA accounts and cases remain in the database because the product has no safe deletion endpoint. They are isolated by account and contain no sensitive market data.

## Recommended order

1. Confirm that production health is `ok`, its `buildId` matches public `main`, and a cold-start request survives the database wake-up path.
2. Rehearse the [video script](./hackathon-demo.md) once with the clean case.
3. Create a fresh unconfirmed recording case so the human strategy confirmation can be shown live.
4. Record and upload a public video shorter than three minutes with audio.
5. Paste and verify the [Devpost submission copy](./devpost-submission.md).
6. Run the public link, repository, license, and video checks from a signed-out browser.

The [official rules](https://webmcp.devpost.com/rules) list WebMCP leverage, execution, potential impact, and creativity and ambition as the judging criteria.
