# Historical Strategy Court research notes

This document preserves early architecture research and is not the current stack contract. The active application uses PostgreSQL and Better Auth; see `README.md` and `docs/product-audit-2026-08-28.md`.

## Product constraints

- The repository started with only `prd.md`. There is no existing application, package manifest, test suite, or Git history.
- The P0 path is case creation, structured draft, explicit confirmation, deterministic Court run, failure inspection, three visible variants, comparison, replay probation, and actor-aware audit.
- Correctness beats breadth. The PRD places the full 30-indicator catalog and sharing in P1 even though an earlier section calls the catalog mandatory.
- A frozen local data set must support the complete demo without Alpaca credentials. The API can use Alpaca when credentials are present, but remote data cannot be a demo dependency.
- The application must stay usable without WebMCP. Browser tools and visible controls call the same API and domain services.

## Interface research

The reference products converge on a dark, restrained visual language: near-black page, charcoal panels, thin borders, bright type, muted labels, compact pills, and careful spacing. Strategy Court will use status color only for evidence: green for Pass, amber for Warning, red for Fail, and gray for Inconclusive.

Patterns worth using:

- [Beautiful UI](https://www.beautifului.dev/): approval card for strategy confirmation, task rows for Court progress, tool chips for WebMCP activity, insight cards for verdicts, and a diff table for variant comparison.
- [beUI](https://beui.dev/): spring-backed tabs, expandable controls, drawers, tooltips, and height-preserving panel transitions.
- [Transitions.dev](https://transitions.dev/): skeleton-to-content reveals, spinner-to-check completion, quick number changes, and smooth card resizing.
- [Rare UI](https://www.rareui.com/): one memorable interaction per view. Its decorative glow, tilt, and particle effects do not fit an adversarial financial product.
- [shadcn/ui](https://ui.shadcn.com/): accessible primitive shapes, dashboard composition, tables, badges, dialogs, and chart framing. The implementation will translate the patterns into Vue instead of pulling React components into the project.

Motion will explain state changes, not decorate static content. Every transition will honor `prefers-reduced-motion`.

## Technical research

- The current [WebMCP draft](https://webmachinelearning.github.io/webmcp/) exposes `document.modelContext` in secure contexts. Tools register through `document.modelContext.registerTool()` with a name, description, JSON Schema, async execute callback, and optional annotations.
- Tool registration is dynamic. An `AbortController` can unregister a tool, which fits the PRD's progressive availability rules.
- The API is still a Community Group draft. The frontend needs feature detection, TypeScript declarations, visible support status, and a no-WebMCP fallback.
- WebMCP callbacks return serializable values. Server-side validation remains mandatory because the browser schema is descriptive, not an authorization boundary.
- Bun supplies the server, test runner, and SQLite driver required by the PRD. Shared packages keep the same strategy types and deterministic calculations on both sides of the API boundary.

## Decisions made for the MVP

- Use a Bun workspace with `apps/web`, `apps/api`, and shared packages under `packages`.
- Ship a fixture-backed sample case first. Add an Alpaca adapter with pagination and adjustment metadata behind environment variables.
- Implement all seven verdict categories. The five hostile test families are out-of-sample, parameter sensitivity, cost stress, regime analysis, and concentration. Evidence sufficiency and risk remain separate verdicts.
- Keep charts dependency-light. Render the core equity and drawdown charts as accessible SVG so the demo does not depend on a large chart runtime.
- Use SQLite for cases, versions, runs, replay sessions, and audit events. Market fixture data stays in versioned JSON.
- Treat all amounts as USD numbers rounded at API boundaries. Internal calculations keep full JavaScript number precision.
