# Strategy Court

Strategy Court puts a daily-stock trading strategy through adversarial historical tests before the user considers risking capital. It turns a natural-language idea into inspectable rules, requires confirmation, runs deterministic tests, keeps every attempted variant, and moves unresolved ideas into replay probation.

This repository implements the WebMCP Challenge MVP described in [`prd.md`](./prd.md). Historical results are evidence about a model and a data set. They do not predict future returns.

## Run locally

Requirements:

- Bun 1.3 or newer
- PostgreSQL 14 or newer
- Docker with Compose, unless PostgreSQL already runs locally
- A browser with JavaScript enabled
- Optional Alpaca market-data credentials for refreshed data

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

For local testing in Chrome 149 or newer:

1. Open `chrome://flags/#enable-webmcp-testing` and enable **WebMCP for testing**.
2. Open `chrome://flags/#devtools-webmcp-support` and enable **DevTools WebMCP support**.
3. Relaunch Chrome, open `http://localhost:5173`, and sign in.
4. Open DevTools, then use the WebMCP view in the Application panel to inspect and execute a registered tool. The [Chrome WebMCP guide](https://developer.chrome.com/docs/ai/webmcp) also links the Model Context Tool Inspector extension for an agent-style test.

The first reviewer check is `get_case_context`. Run it with `{}` and confirm that its returned `caseId` and `state` match the visible workspace. Tools become progressively available as the case advances.

Verify the runtime in DevTools:

```js
typeof document.modelContext?.registerTool // "function"
await document.modelContext.getTools()     // currently registered tools
```

Create an account in the app before opening a case. Better Auth owns sessions and account records; every case, run, replay, audit trail, and custom indicator is scoped to that account. Email and password work without another provider.

Google sign-in is optional. Create a Google OAuth web client, set its authorized redirect URI to `${BETTER_AUTH_URL}/api/auth/callback/google`, fill `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and set `VITE_GOOGLE_AUTH_ENABLED=true`. Generate a production secret with `openssl rand -base64 32`; the API rejects the placeholder secret when `NODE_ENV=production`.

The sample flow uses a frozen adjusted market snapshot covering 2020 through 2025 and does not need market-data credentials. The Court range ends in 2024; 2025 is reserved for replay probation when a version is eligible. To enable the visible **Refresh from Alpaca** option, fill `ALPACA_API_KEY` and `ALPACA_API_SECRET` in `.env`. The default Alpaca feed is `iex`.

## Demo path

1. Open the landing page and choose **Try sample strategy**.
2. Review the structured RSI pullback rules and execution assumptions.
3. Confirm the strategy. Confirmation creates immutable strategy version 1.
4. Run the Court and inspect the seven separate verdicts, assumptions, trades, equity, and drawdown.
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

Email and password login work without more configuration. To enable Google login, set `ENABLE_GOOGLE_LOGIN=true`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`, then register `https://your-domain/api/auth/callback/google` as the Google OAuth redirect URI. The Docker build maps the public boolean to `VITE_GOOGLE_AUTH_ENABLED`; OAuth secrets remain runtime variables.

Alpaca refresh remains optional. Set `ALPACA_API_KEY` and `ALPACA_API_SECRET` only when the deployment should fetch live market data.

For WebMCP on the deployed origin, enroll the final HTTPS domain in Chrome's WebMCP origin trial and add the issued token to `apps/web/index.html` before rebuilding. Local Chrome flags apply only to local development.

## Repository map

```text
apps/
  api/       Bun REST server, Better Auth, PostgreSQL persistence, jobs, market providers
  web/       Vue application, product UI, WebMCP registration
packages/
  schemas/   shared strategy and market contracts with runtime validation
  domain/    indicators, backtest, Court, variants, replay, hashing
  fixtures/  frozen market data and sample definitions
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

- Initial: `get_case_context`, `list_indicator_catalog`, `create_strategy_draft`, `create_custom_indicator`
- Confirmed: `run_court`
- Court complete: `inspect_failure_period`, `create_strategy_variants`, `compare_strategy_versions`, `start_replay_probation`, `export_case_report`
- Replay active: `advance_replay`, `get_monitoring_status`

Schemas reject extra fields and executable code. The API validates requests again and never returns provider credentials.
