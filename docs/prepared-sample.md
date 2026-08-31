# Prepare the saved market-data sample

The landing page's **Open sample** creates an account-owned case and an unconfirmed strategy draft from a server-owned manifest. Court runs use its pinned Alpaca snapshot after the person confirms the rules. No downloaded prices belong in the repository.

## Operator prerequisites

- Run the current migrations against the target PostgreSQL database.
- Configure `DATABASE_URL`, `ALPACA_API_KEY`, `ALPACA_API_SECRET` and the intended `ALPACA_FEED` in a trusted operator environment.
- Confirm that the data agreement permits this deployment's judge access, charts and exported evidence. Set `SAMPLE_DATA_DISPLAY_APPROVED=true` only after that review. This flag records operator acknowledgement; it cannot determine account rights.

From the source checkout with Bun and workspace dependencies installed:

```bash
bun run db:migrate
bun run sample:prepare
```

To prepare the separate 2025 replay history in the same operation:

```bash
bun run sample:prepare --with-replay
```

Choose the optional replay preparation on the first run. The command refuses to replace an existing `rsi-pullback` manifest. It fetches validated Alpaca history for AAPL, MSFT, NVDA, QQQ and SPY, using the existing RSI pullback strategy and the fixed 2020-01-02 through 2024-12-31 Court range. It prints the provider, feed, hash, bar count and engine version, never credentials or price rows. Preparation stores data only; it does not confirm a user's strategy or create a preferred verdict.

The runtime image need not contain this operator script. Run it from a trusted source checkout connected to the target database. Keep provider credentials and the database URL out of command history, logs and screenshots.

## Verify before judging

1. Sign in with a fresh test account and choose **Open sample**. The rules must remain unconfirmed.
2. Confirm the rules and run **Saved Alpaca history**. Check provider, feed, adjustment, historical range and retrieval time in the evidence/report.
3. Repeat with provider requests unavailable. The saved sample must still execute against the same snapshot hash and engine version. Numerical findings must match for identical rules and settings.
4. Inspect the actual findings. Keep weak or inconclusive results. Confirm a cited decision and verify it in the report after reload.
5. Test replay only if the result is eligible. Default sample replay requires the separately pinned snapshot and the prepared 2025 end date. An unavailable holdout fails explicitly. It never appears among Court bars before replay.

`saved_sample` validates the case's sample identity, exact symbols and dates, stored hash, recomputed content hash, provider/feed/adjustment, coverage and engine version. Missing or incompatible data fails before queueing. `prefer_cache` also matches provenance and cannot satisfy a real-data request with generated prices. Replay preserves the Court feed and rejects incompatible provenance.

A fresh Alpaca fetch is a separate choice and need not reproduce the prepared sample. Engine upgrades require a deliberate new preparation and review; do not overwrite the judging manifest automatically. Downloaded rows stay in PostgreSQL and are excluded from source control.

## Current validation limits

Local implementation was verified on August 31, 2026 with database tests and an authenticated browser workflow using explicitly synthetic data. Local Alpaca credentials were absent, so no genuine Alpaca sample was prepared or evaluated during that verification. Provider display/export permission and the final deployed HTTPS walkthrough remain operator checks. Adapter tests with test-only data exercise pinning and outage behavior; they are not real market evidence.
