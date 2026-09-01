# Release readiness, August 31, 2026

The four independently reproduced defects are fixed and verified locally. The current production release does not yet include these fixes or the shared-evidence, decision-record and prepared-sample additions. This document separates local verification from deployment evidence.

## Completed

| Check | Evidence |
| --- | --- |
| Agent variant creation | The store removes `structuredPatch` after translating it to the API's `patch`. A regression exercises the registered WebMCP handler against the server's strict validator. The actual browser created and evaluated a variant successfully. |
| Failed case creation preserves work | A conflicting retry returned the expected error while keeping the case, version, selected risk evidence and visible inspector. Tests also preserve costs, monitoring history and selected version after network failure. |
| Closed case-creation input | Unexpected fields and malformed retry IDs are rejected before API calls. The browser rejected `unexpected: true` without replacing the case. Identical valid retries returned the original case ID. |
| Ordinary percentages | Manual stop and take-profit fields use 0.01 precision. Browser submissions completed at 3% stop and 10% take profit; 5% and 3.25% also passed native validity. |
| Full verification | `bun run check`: 170 tests, zero failures, 4,781 assertions across 32 files. Type checks and production build passed. `git diff --check` passed. |
| Public source | GitHub reported `Ffinnis/strategy-court-public` public, default branch `main`, license `MIT`. The verified changes were committed and pushed as `df7dcdbd14a8adc5f09128b6f04067fbdb21281b`, Add shared investigations and reproducible samples. |
| Current deployment | API health returned `status: ok`, `queueDepth: 0`, engine `strategy-court-domain/0.1.0`. GitHub's successful deployment record points to commit `84aeee6acc7116e31dd149ae501c4ddfe168a021`, created August 30 at 19:11 UTC. |
| Current live account entry | A fresh Release QA account successfully signed up on the HTTPS origin, reached `/new`, and read an empty active-case context through WebMCP. No browser warnings or errors were captured in that smoke check. |

The live account check is partial: its tool list still lacks `create_case`. It does not certify the new workflow in production. No deployment, public video upload, contest submission or user outreach was performed in this follow-up.

## Production deployment attempt, August 31

The user authorized deploying the pushed commit and repeating production acceptance. Railway CLI 5.45.10 authenticated through the existing local login. The target was verified as project `16b4b4e1-3b87-4faa-a03f-5d91a9079a7b`, service `8d9a0b0b-32cb-4227-a34b-d2c9263c55a3` named `strategy-court`, environment `de81129c-6682-4dc2-b7fa-088143a8e6c7` named `production`. Its connected repository was `Ffinnis/strategy-court-public`.

Immediately before the attempt, `/api/health` returned `ok` with queue depth 0. The new migration adds columns, an index and tables without dropping existing data. The authenticated `serviceInstanceDeployV2` request specified commit `df7dcdbd14a8adc5f09128b6f04067fbdb21281b` explicitly and changed no service configuration.

Railway rejected the request because free-tier deployments to `europe-west4-drams3a` are unavailable during 08:00–20:00 Europe/Amsterdam. The API returned trace ID `4747512181657177780`. No deployment ID was returned. At the 14:53 UTC recheck, the latest and active deployment was still `f8f4a6eb-7f7b-4900-8bb9-b79f109372f6`, created August 30, with status `SUCCESS`; production health remained `ok`, queue depth 0.

The next permitted window begins August 31 at 18:00 UTC, which is September 1 at 01:00 Asia/Novosibirsk. This is the provider's stated window, not a guarantee of deployment availability. No plan upgrade, region move, database change or automatic retry was performed or scheduled.

After an accepted deployment, verify the deployment SHA and served assets before resuming the existing task **Test production workflow with a fresh account**, ID `01a05841-f169-70b0-9152-82958e48cde9`. Its earlier [production report](./production-workflow-test-report.md) remains the evidence for the old build. Retest the new intake, shared evidence, variant percentage controls, cited decisions and report privacy, and specifically check the reported export-version mismatch. Do not count another run against the old build as acceptance of this commit.

## Local browser records

### Repeat acceptance pass after the fix review

On August 31, the requested retest reran `bun run check`: 170 tests passed, zero failed, 4,781 assertions, with type checks and the production build passing. No application code changed during this retest.

A new browser case, `d0f40049-4aed-4730-876c-d5f4b8c2aad1`, completed the following path with actual WebMCP calls and visible UI controls:

- Rejected an unexpected intake field without replacing the open case, then created a valid case. Retrying the same setup returned the same ID.
- Read the SMA catalog and drafted exact SMA20 rules. `run_court` was unavailable before confirmation, no confirmation tool was exposed, and Court explained that approval was required. The tester used the visible confirmation control as the QA operator.
- Version `37dbed04-9f8f-486d-a4a7-0e57645daac0` completed synthetic run `667a1fd1-d23e-487b-b23f-760981ebc79c`. All seven verdicts were returned. The actual result was Fragile.
- Selected the risk failure and a trade through WebMCP. A foreign trade ID was rejected without changing the previous selection. A conflicting case-creation retry preserved the selected risk evidence and open inspector.
- Selected a trade manually and verified that agent context reported `actor: user` with the same trade ID and chart dates.
- Created and evaluated agent variant `0023e084-e020-4003-9e16-f001e6ed6be0`, then submitted and completed a manual 3% stop-loss variant. Both attempts remained visible in comparison.
- Proposed a cited decision, edited its uncertainty through the UI, saved the private draft, and reloaded. The edit persisted. An anonymous report request returned zero decisions and did not expose the draft text.
- Confirmed decision `06c93ffa-afc2-4079-b93a-a02828016c6d` through the UI. After reload, the report contained exactly one confirmed rejection, the human edit and three citations. Private case, run and unconfirmed draft IDs remained absent. The failure citation navigated to `#failure-risk_profile`.
- Verified that the agent's next-action guidance preserves the closed investigation instead of proposing more tuning.
- Opened the unprepared saved sample. The app showed an explicit error, offered synthetic testing separately, and created no fallback case.

The checked case and report emitted no captured console warnings or errors. Desktop inspector layout was visually checked. The browser ignored a requested 390 px viewport and continued reporting 1280 × 720, so this pass does not establish fresh phone-layout coverage. The override was reset afterward; earlier phone checks remain documented in the independent report.

Production health still returned `ok` with no queued jobs, but its newly fetched tool list still lacked `create_case`. Real Alpaca credentials and sample-display approval remained absent locally. Real-data execution, the new deployed workflow, successful browser replay and current-bar monitoring remain outside this acceptance result. No verdict or market record was altered to unlock those paths.

### Earlier fix verification

These use explicitly synthetic software data. They establish behavior, not actual market performance.

- Existing case: `e6868184-ff7d-403d-876c-f600f13ff329`.
- Baseline version: `dda8eff4-7cac-40f9-a4c8-dc8eaf584658`; run `d800e1ca-3b98-461c-9064-7c86494cfe3b`.
- Agent-created hold-cap variant: `131a4cd5-dd92-4999-80e3-28838ab3dca1`.
- Two manual variants exercised 3% stop and 10% take profit. The case now has three attempts, with all findings retained. The original confirmed rejection was preserved.
- Retry test case: `768a4b3e-8ffd-44cf-bee0-935f571ec14c`. Identical retries reused this ID. A conflicting retry while the older case's risk inspector was open left that investigation intact.

The earlier independent findings remain in [agent-workflow-test-report.md](./agent-workflow-test-report.md). The follow-up fixes those four findings; it does not retroactively change the original test results.

## Remaining release gates

1. **Approve and prepare real history.** Local `ALPACA_API_KEY`, `ALPACA_API_SECRET` and `SAMPLE_DATA_DISPLAY_APPROVED` were absent. Configure provider access in the trusted operator environment, confirm rights for judge access and exported evidence, and follow [prepared-sample.md](./prepared-sample.md). Do not copy raw prices or secrets into Git. No real sample was fetched in this follow-up.
2. **Deploy the verified build.** Commit `df7dcdb` is pushed. The exact-commit deployment request was rejected by Railway's free-tier peak-hours restriction, as recorded above. Retry in the permitted window with no queued Court jobs, retain the current service settings, and verify startup migrations and the served build. CLI authentication is available; no new token is needed. Real-data preparation remains a separate gate.
3. **Verify that exact deployment.** From a fresh account, discover `create_case`, create and retry a case, draft rules, and confirm through the UI. Open the prepared sample, confirm its rules, run `saved_sample`, inspect both human and agent evidence selections, confirm a cited decision, and reload the report. Verify public report privacy. Run one bounded variant if needed, retaining every result.
4. **Check saved-data independence.** Repeat the same prepared run while provider requests are unavailable in a controlled test environment. Compare its snapshot hash, engine version, numerical metrics and verdicts. Do not disable credentials or networking in production just to test this. Existing isolated tests cover the behavior; the real prepared sample still needs verification.
5. **Record and test the story.** Use [hackathon-demo.md](./hackathon-demo.md). Record the actual result, then collect observations from the short user sessions. Do not claim completed video production, real-data validation or user impact before those steps happen.

For deployment acceptance, also check `/api/health`, `/`, `/auth`, `/new`, a case URL, chart assets and anonymous report links on the final HTTPS origin. Keep provider failures explicit and test replay only if the actual result is eligible.

The [official rules](https://webmcp.devpost.com/rules) list equally weighted WebMCP leverage, execution, potential impact, and creativity/ambition, with WebMCP first for ties. These fixes most directly improve the first two. Real evidence and observed user sessions are still needed to strengthen the impact argument. Eligibility and third-party rights remain operator checks.
