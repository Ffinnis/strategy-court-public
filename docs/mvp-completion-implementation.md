# MVP completion implementation

Implementation status: complete. The only remaining manual environment step is connecting the ChatGPT Chrome extension for live browser inspection.

## 1. Goal and requirements

- Complete the deterministic Strategy Court MVP and its P1 product-completeness items in `prd.md`.
- Preserve completed-close signals, next-open fills, immutable versions, deterministic runs, and owner isolation.
- Execute all 30 built-in indicators and safe custom indicators without arbitrary code or future data.
- Add real latest-bar evaluation, honest missing-data diagnostics, localized failure evidence, and complete sharing lifecycles.
- Replace fabricated offline results with the same backend workflow used by normal cases.
- Show adjusted candles, actual entry and exit markers, regimes, and all required loading, empty, error, and recovery states.
- Keep historical results framed as falsification evidence, never as a prediction or live-trading recommendation.

Non-goals remain broker execution, intraday data, shorting, leverage, billing, public marketplaces, automated optimization, and performance forecasts.

## 2. Proposed solution summary

- Use one shared indicator contract and one domain execution registry for the complete catalog and multi-line component selection.
- Resolve custom indicators into a validated, immutable executable strategy form before a version is saved.
- Derive market completeness from the SPY session calendar and persist missing-session metadata with snapshots.
- Add domain-owned failure windows and latest-bar evaluation so API, visible controls, and WebMCP use identical results.
- Persist monitoring evaluations and hashed share tokens in PostgreSQL; expose token-only read routes and owner-only lifecycle controls.
- Keep the current Bun, Vue, Pinia, PostgreSQL, and pure-domain stack; add no framework, ORM, queue service, or client data engine.
- Remove the local fake result path. Frozen sample data remains available through the backend provider.
- Add one candlestick evidence view while retaining the existing equity and drawdown view.
- Prove the launch journey with domain, API, WebMCP, frontend integrity, performance, and runtime checks.

## 3. Assumptions

- “Full project” means the locked MVP, launch criteria, and P1 items in `prd.md`; its explicit non-goals and P2 polish are not release blockers.
- Better Auth remains because it is already implemented and required by the later user request, even though the original one-week PRD listed authentication as a non-goal.
- Multi-line indicators require an explicit component in their parameter contract; stable defaults are allowed for backward compatibility.
- The latest completed bar is the newest adjusted daily bar returned by the configured provider, not an intraday or broker signal.
- Public sharing is unlisted and token-gated. Entity IDs alone never grant public access.

## 4. Confirmed current touchpoints

- Strategy and runtime contracts: `packages/schemas/src/strategy.ts`, `packages/schemas/src/validation.ts`, `packages/schemas/src/contracts.ts`.
- Indicator and simulation engine: `packages/domain/src/indicators.ts`, `packages/domain/src/conditions.ts`, `packages/domain/src/backtest.ts`, `packages/domain/src/court.ts`, `packages/domain/src/replay.ts`.
- Market and product services: `apps/api/src/providers/market.ts`, `apps/api/src/services/catalog.ts`, `apps/api/src/services/indicator.ts`, `apps/api/src/services/court.ts`.
- Persistence and HTTP contracts: `apps/api/src/store.ts`, `apps/api/src/app.ts`, `apps/api/src/migrations/001_postgres.sql`.
- Product state and agent tools: `apps/web/src/stores/court.ts`, `apps/web/src/webmcp/useWebMcp.ts`.
- Evidence and shared views: `apps/web/src/components/tabs/EvidenceTab.vue`, `apps/web/src/components/tabs/ProbationTab.vue`, `apps/web/src/charts`, `apps/web/src/pages/SharedReportPage.vue`, `apps/web/src/pages/SharedIndicatorPage.vue`.
- The completion audit confirms the indicator, monitoring, sharing, and honest-sample gaps have been closed.

## 5. Target behavior

- Every catalog entry advertises its real parameters, sources, components, and output type, and every advertised configuration reaches the same executor.
- Custom formulas remain bounded ASTs. Draft creation substitutes declared inputs and recursively resolves dependencies; saved strategy versions contain no mutable lookup or executable user code.
- A run records missing sessions, ignored bars, warm-up bars, rejected signals, snapshot provenance, and enough market evidence to inspect every trade.
- Invalid strategy, data, look-ahead, execution, or prohibited custom-formula inputs produce an inspectable `Invalid` outcome or a specific validation error before queue execution; partial jobs never look completed.
- Failure inspection opens the narrow adverse window selected by the relevant test, with its trades, bars, regimes, costs, equity change, and indicator inputs.
- Monitoring fetches fresh adjusted daily data, evaluates the latest completed bar, compares it with the last evaluation, persists the result, and never executes an order.
- Share owners can create, rotate, and revoke links. Anonymous readers need a valid opaque token. Imported indicators become private copies owned by the importer.
- The sample path either completes through the API or reports that the API is unavailable; it never invents Court, variant, or replay results.

## 6. API and contract changes

- Expand indicator expressions with indicator-specific parameters and explicit components for multi-line outputs.
- Add an immutable custom-indicator reference or resolved formula branch to the strategy AST and its strict JSON schema.
- Add market-evidence and typed failure-period fields to completed Court reports.
- Add owner-authenticated monitoring refresh/status contracts returning evaluated date, snapshot metadata, per-symbol signals, positions, regimes, changes, and warnings.
- Add owner-authenticated share create/rotate/revoke routes and anonymous token read routes for reports and indicators.
- Add indicator JSON export and authenticated shared-indicator import.
- Return `changedIds`, current product state, and actionable validation details from mutating WebMCP tools.
- Validate Court date ranges, profiles, snapshot policies, replay ranges, and monitoring targets again on the server.

## 7. Persistence and data model

- Store snapshot missing-session metadata with the immutable snapshot payload.
- Add monitoring evaluations keyed by case and strategy version, with snapshot ID, evaluated date, result JSON, and timestamps.
- Add share links with entity type, entity ID, owner ID, SHA-256 token hash, state, creation, rotation, revocation, and optional expiry timestamps.
- Index active token hashes uniquely and index owner/entity lifecycle reads.
- Keep raw share tokens out of PostgreSQL, API logs, and authenticated entity payloads.
- Preserve existing cases and runs; migrations are additive and idempotent.

## 8. Service and domain logic

- Indicator output length always equals input bar length; unavailable warm-up values are `null`; prefix results cannot change when future bars are appended.
- SPY defines expected sessions. Missing symbol sessions are recorded; unusable leading or trailing coverage is rejected rather than silently filled.
- Latest-bar evaluation uses completed bars only and the same condition evaluator as Court and replay.
- Share rotation revokes the previous token atomically. Revocation and import are idempotent where repeating the same request is safe.
- All strategy modifications create versions, all attempted variants remain visible, and evaluation-informed status remains sticky.

## 9. Migration and compatibility strategy

1. Add idempotent PostgreSQL tables and indexes without changing current rows.
2. Keep existing private reports and indicators private until an owner creates a share token.
3. Preserve existing built-in IDs and current strategy payloads through parameter defaults.
4. Reject legacy unknown indicator IDs explicitly instead of returning null series.
5. Remove browser-generated offline results after the backend frozen-sample path is verified.

Rollback is code-only for new routes and UI. Additive tables may remain unused without affecting existing Court data.

## 10. Test strategy

- Indicator completeness, formula-family golden vectors, component selection, invalid parameters, aligned output, and prefix invariance.
- Custom numeric, boolean, nested, defaulted, cyclic, prohibited, and unknown dependency cases through API-to-Court execution.
- Missing-session detection, boundary coverage rejection, no-look-ahead, exact costs, deterministic reruns, adverse-window localization, and invalid outcomes.
- Monitoring with no prior evaluation, unchanged state, new signal, exit signal, regime change, provider failure, and owner isolation.
- Share token entropy/hashing, anonymous reads, rotation, revocation, expiry, cross-owner isolation, read-only behavior, report completeness, export, and import.
- WebMCP progressive registration plus execution parity with visible actions and strict response contracts.
- Frontend loading, empty, partial, failed, retry, completed, chart marker, shared-link, and API-unavailable sample states.
- Cached five-symbol baseline and full Court performance targets, full typecheck/test/build, and a runtime launch journey.

## 11. Risks and open questions

- Technical-indicator conventions vary. Mitigation: document formulas and explicit component defaults, then freeze them with golden vectors.
- Daily-session completeness cannot infer exchange halts from price data alone. Mitigation: use SPY as the curated-market calendar and disclose per-symbol gaps.
- Latest provider data may be delayed. Mitigation: return the provider timestamp and label the result “latest completed bar.”
- Public reports may expose user-authored descriptions. Mitigation: sharing is explicit, unlisted, revocable, and read-only.
- Visual browser QA remains dependent on a working Chrome control connection; automated UI integrity and production builds remain required regardless.
