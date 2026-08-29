# Product completion audit

Status as of 2026-08-28 after the completion pass.

## Verdict

The locked MVP, launch workflow, and P1 product-completeness items in `prd.md` are implemented. Strategy Court is a deterministic historical simulation and falsification system. It is not a prediction model, does not promise future returns, and does not submit broker orders.

The earlier findings in this document are resolved. The implementation keeps the deliberately small stack: Bun, Vue, Vite, Pinia, PostgreSQL, Better Auth, the pure domain package, shared schemas, and frozen market fixtures.

## Completed scope

- All 30 built-in indicators execute through one validated registry, including multi-line component selection, golden coverage, aligned warm-up values, and prefix-invariance checks.
- Safe owner-scoped custom indicators compile into immutable executable strategy trees. Nested formulas, typed defaults, cycles, prohibited behavior, and boolean root conditions are covered.
- Court runs preserve exact snapshots, validate market coverage, reject invalid or future ranges, localize adverse periods, test every numerical parameter, and expose skipped or rejected signal reasons.
- Historical replay uses a separately reserved later snapshot. It shows current signals, simulated positions, cumulative trades, expectancy, drawdown, warnings, and historical-versus-observed trade comparisons.
- Latest-completed-bar monitoring is separate from replay, persists evaluations, and is available through visible controls. WebMCP monitoring status remains read-only and is registered only during probation.
- Opaque report and indicator links support issuance, rotation, revocation, anonymous read-only access, private indicator import, and JSON/CSV export. Raw tokens are never stored.
- The sample path uses the real API and frozen provider. No Court, variant, or replay result is fabricated in the browser.
- The owner workspace exposes adjusted candles with fills, equity and drawdown, full verdict thresholds, all baseline/holdout/stress metrics, parameter trials, data warnings, trades, signal diagnostics, versions, and audit actors.
- Price evidence uses TradingView Lightweight Charts with interactive daily candles, a line view, volume, exact historical fill markers, crosshair inspection, zoom, pan, and responsive range controls.
- Better Auth and PostgreSQL are the only active persistence/auth path. The SQLite importer and local database artifacts were removed.
- WebMCP schemas are closed and state-dependent, use the same store/API actions as visible controls, preserve user-only confirmation, and return current state plus changed identifiers.

## Scope boundary

The PRD explicitly excludes broker execution, intraday data, shorting, leverage, billing/paywall enforcement, public marketplaces, automated optimization, and return forecasting. Those are not incomplete MVP items.

## Operational browser gate

Automated schema, service, UI-integrity, type, test, build, and production smoke checks can run locally. Live Chrome inspection requires the ChatGPT browser extension/native host to be connected through Codex Settings → Computer use. That host integration is external to this repository and remains the only manual environment step.

## Verification record

- `bun run check` passes every workspace typecheck and production build.
- The final automated run passes 102 tests with 1,179 assertions and no failures.
- The production API starts and stops cleanly, `/api/health` reports a healthy empty queue, unauthenticated session lookup returns the expected null session without an IP-resolution warning, and both `/` and `/new` return the built single-page application with HTTP 200.
- Static release checks find no browser-generated Court/replay demo results, no active SQLite runtime/import path, and no uppercase CSS transform in the web source.

## Product language

Call the output a historical simulation, robustness verdict, or current rule state. Never call it a prediction or a guarantee of future profitability.
