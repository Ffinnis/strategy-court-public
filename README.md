# Strategy Court

Strategy Court puts a daily-stock trading strategy through adversarial historical tests before the user considers risking capital. It turns a natural-language idea into inspectable rules, requires confirmation, runs deterministic tests, keeps every attempted variant, and moves unresolved ideas into replay probation.

This repository implements the WebMCP Challenge MVP described in [`prd.md`](./prd.md). Historical results are evidence about a model and a data set. They do not predict future returns.

**Live app:** [strategy-court-production.up.railway.app](https://strategy-court-production.up.railway.app/)

Start with the [reviewer test guide](./docs/reviewer-testing.md) for account setup, the WebMCP workflow, and an offline fallback.

## Run locally

Requirements:

- Bun 1.3 or newer
- PostgreSQL 14 or newer
- Docker with Compose, unless PostgreSQL already runs locally
- A browser with JavaScript enabled
- Alpaca market-data credentials for the default refreshed-data mode, or an explicit Synthetic demo selection for offline software testing

```bash
bun install --frozen-lockfile
cp .env.example .env
docker compose up -d --wait postgres
bun run db:migrate
bun run check
bun run dev
```

If PostgreSQL already runs locally, skip the Docker command and set `DATABASE_URL` in `.env` to its database and login. Tests create and remove isolated schemas in that database. Set `TEST_DATABASE_URL` only when tests should use a different database.

The web app runs on `http://localhost:5173`. The API runs on `http://localhost:8787` by default.

### Enable WebMCP in Chrome

For testing in Chrome 149 or newer:

1. Open `chrome://flags/#enable-webmcp-testing` and enable **WebMCP for testing**.
2. Open `chrome://flags/#devtools-webmcp-support` and enable **DevTools WebMCP support**.
3. Relaunch Chrome, open the live app or `http://localhost:5173`, and sign in.
4. Open DevTools, then use the WebMCP view in the Application panel to inspect and execute a registered tool. The [Chrome WebMCP guide](https://developer.chrome.com/docs/ai/webmcp) also links the Model Context Tool Inspector extension for an agent-style test.

The first reviewer check is `get_case_context`. Run it with `{}` and confirm that its returned `currentState.caseId` and `currentState.activeVersionId` match the visible workspace. Tools become progressively available as the case advances. The [hackathon resources](https://webmcp.devpost.com/resources) also support testing the deployed site in ChatGPT's in-app browser without these flags.

Verify the runtime in DevTools:

```js
typeof document.modelContext?.registerTool // "function"
```

Create an account in the app before opening a case. Better Auth owns sessions and account records; every case, run, replay, audit trail, and custom indicator is scoped to that account. Email and password work without another provider.

Google sign-in is optional. Create a Google OAuth web client, set its authorized redirect URI to `${BETTER_AUTH_URL}/api/auth/callback/google`, fill `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and set `VITE_GOOGLE_AUTH_ENABLED=true`. Generate a production secret with `openssl rand -base64 32`; the API rejects the placeholder secret when `NODE_ENV=production`.

The default data policy is **Refresh from Alpaca** and requires `ALPACA_API_KEY` and `ALPACA_API_SECRET` in `.env`. The default historical feed is `sip`, covering all US exchanges. Alpaca permits historical SIP requests on its free plan when the requested end time is at least 15 minutes old ([Alpaca FAQ](https://docs.alpaca.markets/us/v1.4.2/docs/market-data-faq)). Set `ALPACA_FEED=iex` only if you specifically need that exchange; its available history may not cover the sample's January 2020 start. Incomplete coverage is rejected, never silently filled with fixture data.

For testing without credentials, explicitly choose **Synthetic demo**, or pass `dataSnapshotPolicy: "frozen"` through WebMCP. The API keeps this policy name for compatibility. These bundled prices are generated from a fixed seed, not downloaded or calibrated from market data. AAPL, MSFT, NVDA, QQQ, and SPY are example symbol labels, not actual prices for those securities. Sessions are fictional weekdays from 2020 through 2025, not an exchange calendar. Use 2020 through 2024 for Court software testing and reserve 2025 for replay. Synthetic results are not investment evidence. The landing chart uses the same labeled synthetic data. Run `bun run fixtures:generate` to regenerate the snapshot, chart preview, and golden result without network access. Builds check the snapshot and preview for drift.

## Demo path

1. Sign in, open the landing page, and choose **Open sample**.
2. Review the structured RSI pullback rules and execution assumptions.
3. Confirm the visible strategy interpretation. Draft creation saves a version; confirmation locks it for execution and remains a user action.
4. Choose the data policy, run the Court, and inspect the seven separate verdicts, assumptions, trades, equity, and drawdown.
5. Open a weak result, then create up to three controlled variants.
6. Compare every attempt, including failed variants.
7. If a version is Surviving or Inconclusive, start replay probation and advance the hidden period. Fragile versions remain ineligible by design.
8. Open Audit to verify user, agent, and system actions.

When the browser implements the current WebMCP draft, the case page registers tools through `document.modelContext`. The support indicator shows whether registration is active. Every action remains available through visible controls when WebMCP is absent.

## Commands

```bash
bun run dev          # API and web development servers
bun run dev:api      # API only
bun run dev:web      # web only
bun run db:migrate
bun run typecheck
bun test
bun run build
bun run check        # typecheck, tests, and production builds
bun run start        # serve the production build on API_PORT or PORT
```

For a production run, set `NODE_ENV=production`, replace every local URL and secret in `.env`, run `bun run build`, then run `bun run start`. The API serves `apps/web/dist` with client-route fallback, so the web app and session cookies stay on one origin. A deployment platform may set `PORT`; local runs use `API_PORT`. When a reverse proxy sits in front of Bun, set `AUTH_TRUSTED_PROXIES` to the proxy's exact IP addresses or CIDR ranges so Better Auth can safely resolve the canonical client-IP chain. Leave it empty when Bun is directly reachable.

## Deploy to Railway

The production image contains one Bun service that serves both the API and the built Vue app. PostgreSQL is the only separate service.

1. Push the repository to GitHub, create an empty Railway project, and add a PostgreSQL database.
2. Add a service from the GitHub repository. Railway detects the root `Dockerfile` automatically.
3. Generate a public domain for the app service.
4. Add these app-service variables, replacing `strategy-court.up.railway.app` with the generated or custom domain:

```dotenv
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
BETTER_AUTH_URL=https://strategy-court.up.railway.app
BETTER_AUTH_SECRET=replace-with-output-from-openssl-rand-base64-32
CORS_ORIGINS=https://strategy-court.up.railway.app
ENABLE_GOOGLE_LOGIN=false
AUTH_TRUSTED_PROXIES=
```

Generate the auth secret once with `openssl rand -base64 32` and keep it stable across deployments. Use Railway's database-variable reference instead of copying its public connection string. Leave `VITE_API_BASE_URL` unset so the browser uses the same origin for the app, API, and session cookie.

In the app service settings, set the health-check path to `/api/health`, keep one replica, leave Serverless disabled, and use the default **On failure** restart policy. Court work currently uses an in-process queue, so deploy only when no Court run is active. Database and Better Auth migrations run before the server starts.

Railway's current free plan requires Serverless to stay enabled. On that plan, expect a cold start for the app and database after inactivity; disabling sleep requires a paid plan. The live demo currently uses the free plan. Wait for the health endpoint to become ready before a judging session, and keep the case open while its Court run completes.

Email and password login work without more configuration. To enable Google login, set `ENABLE_GOOGLE_LOGIN=true`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`, then register `https://your-domain/api/auth/callback/google` as the Google OAuth redirect URI. The Docker build maps the public boolean to `VITE_GOOGLE_AUTH_ENABLED`; OAuth secrets remain runtime variables.

Set `ALPACA_API_KEY` and `ALPACA_API_SECRET` for the default Alpaca data policy. Credentials stay on the server. Each Alpaca page has a 15-second deadline; the complete snapshot has a 60-second deadline. A timeout produces an actionable run error and releases the queue. Synthetic demo data requires an explicit selection and never replaces a failed refresh silently.

The [hackathon's supported testing setup](https://webmcp.devpost.com/resources) is ChatGPT's in-app browser or Chrome with the WebMCP testing flag, including for the deployed app. To enable experimental WebMCP for visitors using Chrome without that flag, enroll the final HTTPS domain in the [WebMCP origin trial](https://developer.chrome.com/docs/ai/webmcp) and add the issued token to `apps/web/index.html` before rebuilding.

## Repository map

```text
apps/
  api/       Bun REST server, Better Auth, PostgreSQL persistence, jobs, market providers
  web/       Vue application, product UI, WebMCP registration
packages/
  schemas/   shared strategy and market contracts with runtime validation
  domain/    indicators, backtest, Court, variants, replay, hashing
  fixtures/  synthetic test data, generator, and sample definitions
docs/
  research.md
  implementation-plan.md
```

The API owns every mutation. Manual controls and WebMCP tools call the same endpoints. The domain package contains deterministic calculations and has no browser or database dependency.

## Data and execution rules

- Curated US stocks and ETFs, daily bars, long-only, no leverage.
- Signals use a completed close and normal orders fill at the next available open.
- Fractional shares use each symbol's equal capital sleeve.
- Slippage and commissions apply to both sides.
- A gap through a stop or take threshold fills at the open. An intraday touch fills at the threshold. If both touch in the same bar, the stop wins.
- Open positions at the end of a range are marked to the last close and do not count as completed trades.
- Fixture runs store a snapshot hash and reproducibility ID.

See [`docs/implementation-plan.md`](./docs/implementation-plan.md) for the full set of frozen assumptions, contracts, test gates, and scope decisions.

## WebMCP tools

The frontend progressively registers the PRD tools as the case advances:

- Signed in: `get_case_context`, `list_indicator_catalog`, `read_tool_result`, `create_strategy_draft`, `create_custom_indicator`
- Confirmed version: `run_court`, `get_monitoring_status`, `refresh_monitoring`
- Valid completed Court run: `inspect_failure_period`, `create_strategy_variants`, `compare_strategy_versions`, `start_replay_probation`, `export_case_report`
- Replay active: `advance_replay`

`get_monitoring_status` reads saved evidence. `refresh_monitoring` explicitly fetches and evaluates a completed bar; it does not place orders or advance a replay. Replay eligibility is checked again by the server.

`get_case_context` returns a compact summary by default. Request `detail: "strategy"` for the active version's exact rules without trade and price history, or `detail: "full"` for all case evidence. `list_indicator_catalog` returns ten summaries per page; pass `ids` (up to three) for exact parameter definitions before constructing a strategy. Large results return a `resultId`: call `read_tool_result` with the returned `nextOffset`, concatenate `jsonText` chunks, then parse the combined JSON. Handles expire after five minutes, on case/session changes, or when the bounded browser cache evicts an older result. Repeat the original read-only request if a handle expires. Normal responses are capped at 8,000 serialized characters, including their state envelope.

Schemas reject extra fields and executable code. The API validates requests again and never returns provider credentials. Case content is untrusted data, not instructions to an agent. Tools use the signed-in browser session and cannot access another account's cases.

## Publication and attribution

Original Strategy Court code, documentation, and generated synthetic fixtures are licensed under [MIT](./LICENSE). Third-party dependencies and bundled skills retain their own licenses.

See [third-party materials](./docs/third-party-materials.md) for notices and data provenance. Downloaded price snapshots and copied design screenshots are excluded from the public source and its history. Chart attribution and dependency licenses are available from the app footer.

Before submitting, verify that GitHub displays the chosen open-source license and that the repository is public. Follow the [official submission rules](https://webmcp.devpost.com/rules) and [current FAQ](https://webmcp.devpost.com/resources). Leave the submitted code and live app unchanged after the deadline until winners are announced; use a separate copy for later development.
