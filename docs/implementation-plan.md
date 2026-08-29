# Historical Strategy Court implementation brief

This document records the original pre-migration plan and is superseded by `README.md`, `docs/mvp-completion-implementation.md`, and `docs/product-audit-2026-08-28.md`. The active application uses PostgreSQL and Better Auth, not SQLite.

## 1. Goal and requirements

Build a challenge-ready Strategy Court MVP from the supplied PRD. A user or browser agent turns a natural-language trading idea into a strict strategy, the user confirms it, and the product runs deterministic hostile tests before offering version comparison and historical replay probation.

Required behavior:

- Vue 3 and TypeScript frontend with manual controls for every agent action.
- Bun REST API with SQLite persistence and a deterministic shared domain package.
- One to five curated US stocks or ETFs, daily adjusted bars, long-only, next-open execution, visible costs, and inspectable trades.
- Immutable strategy versions, seven category verdicts, deterministic summary labels, a three-variant investigation limit, and evaluation-contamination labels.
- State-dependent WebMCP tools registered through `document.modelContext` when the browser supports the draft API.
- Frozen data and expected results for a credential-free sample flow.
- Persistent financial limitation copy. Historical results cannot be presented as a prediction or guarantee.

Non-goals remain those in `prd.md`: authentication, billing, brokerage connections, live orders, shorting, leverage, intraday data, Pine or arbitrary-code execution, and automated parameter optimization.

## 2. Proposed solution summary

- Root Bun workspace with shared TypeScript configuration and scripts.
- `packages/schemas`: strict strategy, condition, variant, and WebMCP contracts plus runtime validators.
- `packages/domain`: indicators, condition evaluation, deterministic backtest, Court verdicts, variants, replay, and reproducibility hashing.
- `packages/fixtures`: frozen daily bars and a sample strategy selected for an honest, non-miraculous result.
- `apps/api`: `Bun.serve`, `bun:sqlite`, JSON REST routes, sequential run service, fixture provider, optional Alpaca provider, and audit writes.
- `apps/web`: Vue Router, Pinia, SCSS tokens, landing page, case workspace, comparison and replay flows, SVG charts, and WebMCP registration.
- The API owns all mutations. WebMCP tools and manual UI controls use the same endpoints.
- Court jobs run sequentially and persist progress. A refresh reads the run instead of restarting it.

## 3. Explicit assumptions

- Position sizing supports fractional shares so each selected symbol can use its equal capital allocation. Cash and realized proceeds compound within that symbol's independent sleeve.
- If a bar opens beyond a stop or take threshold, the fill uses the open. An intraday threshold touch fills at the threshold. If both thresholds occur in one bar and the path is unknowable, the stop wins. This is the conservative rule.
- A normal rule exit still fills at the next open. Risk exits may fill on the bar where the high or low crosses the declared threshold because their assumption is explicit.
- An open position at the end of a range is marked to the last close for final equity and remains absent from completed-trade counts.
- Period parameters round to integers with a minimum of one. Percentage and multiplier parameters keep two decimals. Duplicate neighbours are removed before the sensitivity denominator is calculated.
- Verdict threshold bullets use conservative precedence. All Pass clauses must hold. Any Fail clause produces Fail. Otherwise the category is Warning unless its stated Inconclusive condition applies.
- All Court categories except evidence sufficiency are material. Evidence sufficiency and out-of-sample robustness are critical. No material failure plus insufficient evidence yields Inconclusive.
- `dataSnapshotPolicy` supports `frozen`, `prefer_cache`, and `refresh`. Fixture demo runs use `frozen`.
- Shared indicator and report routes are P1. The P0 implementation may expose local read-only report data without a public sharing lifecycle.

## 4. Confirmed current touchpoints

- `prd.md` is the only source file that existed before implementation.
- The PRD defines the target repository shape, REST route inventory, persistence entities, tool names, route map, curated universe, thresholds, sample strategy, and 24 launch checks.
- No pre-existing code or storage requires migration or compatibility support.

## 5. Target behavior

1. The landing page explains the falsification goal and opens a frozen sample case or a blank case.
2. The case form captures the name, description, symbols, range, capital, and costs.
3. A manual template or `create_strategy_draft` creates a strict unconfirmed definition.
4. Confirmation creates immutable version 1. Court controls remain unavailable before confirmation.
5. A Court run records its snapshot, engine version, input hash, progress, trades, metrics, test evidence, and verdicts.
6. Failure inspection shows the period, trades, regime, equity change, indicator inputs, and cost assumptions behind a verdict.
7. An investigation may create at most three new versions. Every result remains visible, including failures.
8. Comparison shows exact rule changes, metrics, verdict deltas, trade counts, assumptions, and evaluation-informed status.
9. A surviving or inconclusive version can start a frozen replay session and advance by supported increments.
10. The audit timeline identifies `user`, `agent`, and `system` actions.

## 6. Contracts and persistence

REST endpoints follow section 18.4 of `prd.md`. JSON errors use `{ "error": { "code", "message", "details?" } }`. Successful mutations return changed IDs and enough current state for the frontend or agent to update without guessing.

SQLite stores:

- `court_cases`: active version, status, Court profile, timestamps.
- `strategy_versions`: immutable definition JSON, interpretation, parent, source, confirmation, contamination flag.
- `court_runs`: snapshot, engine version, reproducibility ID, status, progress, summary, full result JSON.
- `replay_sessions`: reserved range, cursor, state JSON.
- `audit_events`: actor, action, entity, before and after JSON, timestamp.
- `market_snapshots`: provider metadata, adjustment, range, symbols, fetch time, hash, bars JSON.

IDs are string UUIDs. Foreign keys are enabled. Writes that create a version plus audit event use one transaction.

## 7. Domain rules most likely to fail silently

- A signal at close `T` cannot use bar `T + 1`; its normal fill is the next available open.
- Missing warm-up values skip evaluation and increment an inspectable counter.
- Costs apply on both entry and exit. Slippage worsens both sides of a long trade.
- The chronological 70/30 boundary never randomizes and locks after evaluation results are viewed.
- Sensitivity changes one parameter at a time. It never selects a best combination.
- Regimes use SPY, a 200-day SMA, 20-day realized volatility, and a trailing 252-day median.
- Variants cannot change the symbol set or date range without explicit user action.
- WebMCP schemas set `additionalProperties: false`; the API validates the same limits again.

## 8. Staged task list

### Stage A. Foundation and contracts

- Create workspaces, TypeScript configs, build and test scripts.
- Define shared schemas, curated universe, fixtures, design tokens, API error contract, and SQLite migrations.
- Gate: typecheck and schema boundary tests pass.

### Stage B. Deterministic domain

- Implement the P0 indicator subset used by the sample and variants: SMA, EMA, RSI, ATR, realized volatility, highest, lowest, lag, rolling average, crossover, and crossunder.
- Implement condition evaluation, next-open simulation, conservative risk fills, costs, metrics, reproducibility hash, and all seven Court verdicts.
- Gate: golden fixture, no-look-ahead, costs, threshold boundary, and determinism tests pass.

### Stage C. Persistent API

- Implement case, draft, confirmation, run, failure, variant, comparison, replay, monitoring, indicator catalog, and report endpoints.
- Persist progress and audit events. Add optional Alpaca pagination without making it a demo requirement.
- Gate: API integration flow passes from case creation through replay advance.

### Stage D. Product interface

- Build landing, case intake, persistent summary header, six workspace tabs, confirmation card, Court progress, evidence charts, failure inspector, variant diff, replay controls, and audit timeline.
- Add responsive layout, keyboard focus, loading and error states, reduced-motion behavior, and persistent limitation copy.
- Gate: production build passes and the complete manual path works at desktop and narrow widths.

### Stage E. WebMCP

- Register the 12 PRD tools against the API with feature detection and abort-based progressive availability.
- Expose support state in the UI and keep all manual actions working when unsupported.
- Gate: a browser-side harness can discover tools, rejects invalid arguments, and observes visible state changes after execution.

### Stage F. Independent verification and polish

- Run a domain correctness review, API and persistence review, and UI accessibility and visual review with separate agents.
- Fix all high-severity findings, run the full test and build suite, and capture final screenshots at representative sizes.
- Finish the README with setup, fixture mode, Alpaca variables, architecture, assumptions, and demo script.

## 9. Test strategy

- Unit: schema limits, indicator goldens, warm-up behavior, conditions, risk fills, costs, metrics, each verdict boundary, summary precedence, hashes, and replay increments.
- Integration: create, draft, reject pre-confirmation run, confirm, run, inspect, create three variants, reject a fourth, compare, start replay, advance, reload state, and inspect audit.
- Browser: manual sample path, WebMCP feature detection, progressive tool set, visible state updates, keyboard navigation, and reduced motion.
- Final checks: `bun test`, typecheck, frontend production build, API smoke flow, and responsive screenshots.

## 10. Risks and mitigations

- Indicator breadth can consume the schedule. Ship the tested P0 subset and expose the remaining catalog entries as unavailable until implemented.
- Real market data can make the demo flaky. Default to the frozen snapshot and make refresh explicit.
- WebMCP may not exist in the reviewer's browser. Show support status and keep the complete manual flow.
- Financial charts can look more certain than the evidence. Keep separate categorical verdicts, show assumptions beside metrics, and repeat the historical-results limitation.
- A polished UI can hide bad arithmetic. Domain gates block later stages until deterministic fixture tests pass.
