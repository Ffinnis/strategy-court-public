# Devpost submission copy

This text is ready to paste after replacing the video link placeholder. Keep the generated-data limitation in both the description and video.

## Submission fields

- Project name: `Strategy Court`
- Tagline: `A shared human-agent investigation for stress-testing trading rules before committing capital.`
- Live app: <https://strategy-court-production.up.railway.app/>
- Source: <https://github.com/Ffinnis/strategy-court-public>
- Video: `<PUBLIC_YOUTUBE_URL>`
- License: MIT

## Inspiration

AI can generate trading ideas quickly, but it can also make a weak backtest sound convincing. A strategy may depend on a handful of trades, one market regime, or assumptions that disappear under small changes.

We built Strategy Court to turn that uncertainty into an inspectable decision process. The goal is not to predict which strategy will win. It is to help a person and an agent examine why a strategy might fail before more time or capital is committed.

## What it does

Strategy Court is an adversarial research workspace for people testing rule-based trading strategies.

A user defines explicit entry, exit, sizing, execution, and cost assumptions, then confirms the strategy before testing begins. The Court runs seven deterministic robustness checks covering evidence sufficiency, out-of-sample behavior, parameters, execution costs, regimes, profit concentration, and risk.

Through WebMCP, an agent can read the exact case and strategy state, run the Court against a confirmed version, inspect failed tests and trades, create controlled variants, follow evidence selected by the person, draft a cited decision, inspect monitoring and replay state, and export a report.

The person and agent work on the same visible investigation. When the agent selects a failure period, the application opens that evidence. When the person selects a different trade, the agent reads the new selection and its actor through WebMCP.

The final boundary remains human-controlled. The agent may propose a private decision draft, but it cannot confirm the strategy, confirm the decision, or place an order. Rejection is a complete outcome.

The submitted demo uses generated daily prices to demonstrate the workflow. It does not represent real market performance or investment evidence.

## How we built it

The frontend is built with Vue and TypeScript. It registers 19 progressively available WebMCP tool definitions through `document.modelContext`, using strict JSON schemas, tool annotations, bounded responses, and paged result handles for large evidence sets.

A Bun API owns every mutation and validates the same contracts used by the interface and WebMCP layer. Better Auth and PostgreSQL isolate and persist cases, jobs, and reports by account. Large temporary WebMCP results stay in a bounded browser cache scoped to the signed-in account and active case.

The deterministic testing engine lives in shared domain packages. Each run records its strategy version, data snapshot, engine version, snapshot hash, and reproducibility identifier. The interface, agent, API, and exported report therefore refer to the same evidence.

The normal interface remains fully usable without an agent. WebMCP extends the product instead of replacing its controls.

## Challenges

The hardest problem was deciding where automation should stop. Strategy testing benefits from fast, structured agent work, but strategy confirmation and final judgment require deliberate human authority.

We also had to keep four representations synchronized: visible UI state, WebMCP tool schemas, API validation, and persisted records. A mismatch could make the agent reason about a different case than the person sees.

Large investigations required another boundary. Returning the complete record in every tool response would waste context and make citations hard to follow, so responses are summarized, paged, scoped to the account and active case, and addressable through temporary handles.

Finally, data provenance had to remain explicit. The demo never silently substitutes generated prices for real provider data.

## Accomplishments

Strategy Court is a complete investigation workflow rather than an isolated tool demonstration. The deployed application supports case creation, strategy confirmation, deterministic Court runs, evidence inspection, shared human-agent selection, cited decision drafting, human confirmation, replay probation, monitoring, and persistent reports.

WebMCP drives real product state. It does not operate a parallel demo path. The same case, selected evidence, decision status, and report remain visible after reload.

Agent proposals stay private until a person edits and confirms them, and no tool can place a trade.

## What we learned

Agent-native interfaces need shared state more than they need more chat. A useful tool response is compact, current, and connected to something the person can inspect. A useful human action is one the agent can observe without guessing.

A failed test or rejected strategy can be a successful product outcome. A credible research tool should help users stop weak ideas, not reward every workflow with approval.

Explicit limits also increase trust. Generated data, provider failures, expired result handles, and unconfirmed decisions must be visible states rather than hidden implementation details.

## What's next

Next we want to run short usability sessions focused on whether people can understand failures and citations without guidance. We also want to add a display-approved real-data example with clearly documented permissions, strengthen background-job recovery and monitoring, and test more assets and timeframes.

We will expand the strategy language only when the investigation remains understandable. More capability should not weaken provenance, reproducibility, or human control.

## How the entry maps to the judging criteria

- WebMCP leverage: WebMCP creates and opens cases, reads exact state, runs evaluations, changes visible evidence selection, observes human selection, drafts cited decisions, and exports paged reports. Tool availability follows the visible case state.
- Execution: the production app, API, PostgreSQL persistence, authentication, deterministic engine, and report path were tested together. The interface also works without WebMCP.
- Potential impact: the product helps researchers identify fragile trading ideas before spending more time or risking capital. It makes rejection useful and inspectable.
- Creativity and ambition: the agent and person share one investigation rather than exchanging detached chat messages, while confirmation authority remains explicitly human.

## Pre-submit checklist

- Replace the video link placeholder.
- Open the live app, repository, license, and video while signed out.
- Confirm the production health endpoint is `ok` and its `buildId` matches the current public `main` commit.
- Confirm the video is public, has audio, and is shorter than three minutes.
- Confirm the repository is public and GitHub recognizes the MIT license.
- Keep the generated-price limitation in the written entry and spoken demo.
- Do not claim user validation, market performance, profitability, or a completed real-data example unless those facts become true before submission.
- Recheck entrant identity, residence, age, team membership, and other eligibility fields against the [official rules](https://webmcp.devpost.com/rules).

## Judge testing instructions

1. Open the live app and create an account with any unused email address and a password of at least eight characters. Email verification is not required.
2. Open the WebMCP agent and call `create_case`, or create the same setup in the interface.
3. Call `list_indicator_catalog`, then draft exact rules with `create_strategy_draft`.
4. Call `get_case_context` and confirm that its case and version IDs match the visible workspace and that the strategy is unconfirmed.
5. Review and confirm the rules in the interface. There is no agent confirmation tool.
6. Call `run_court` with `dataSnapshotPolicy: frozen`. No market-data credential is needed, and the generated-price limitation remains visible throughout the result.
7. Inspect a returned failure, select another trade in the interface, and call context again to observe `actor: user`.
8. Ask the agent to propose a cited decision. Edit and confirm it in the interface, then reload to verify persistence.

No disposable shared account is required, and judges should not reuse credentials supplied by another person.
