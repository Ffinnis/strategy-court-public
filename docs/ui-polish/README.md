# Strategy Court UI polish

**Latest revision:** [Simplified workspace](simplified/README.md). After feedback that the layout was overloaded, the workspace was reorganized around a result-first flow. The screenshots below preserve the initial polish pass; use the linked revision for the current layout.

Implemented September 1, 2026, following the request to implement the collected references. The revised visual shortlist and six motion candidates inform this pass. The rejected first shortlist is used only as a functional checklist, not as styling direction.

The app keeps its dark, sans-serif direction. Flat sections, aligned values, fine dividers, and a few independent working surfaces provide structure. Motion helps show selection and continuity. It never changes financial values or implies an unreported result.

## Approved references translated into working UI

| Source | Implementation | Deliberate adaptation |
| --- | --- | --- |
| [Jeet — comparison disclosure](https://collectui.com/designs/accordion-ui-design-inspiration/1f0bdcc2-9127-42ee-b3eb-69b4c212d890) | `ComparisonPanel.vue`: aligned baseline, variant, signed difference; expandable metric explanation and paired bars | Shared zero and scale per measure; percentage-point differences; no winner badge or composite score |
| [Sub-Agent Fanout](https://collectui.com/designs/ai-agents-ui-design-inspiration/54269511-7c19-4ab8-8f3c-24dea577456b) | `ExecutionTrace.vue`: connected engine stages and a fanout of the actual returned verdicts | The API reports queue, market data, calculation, and completion. The UI no longer invents seven completed stages from a percentage |
| [Sandbox Limits](https://collectui.com/designs/modal-ui-design-inspiration/e3f1230d-4674-4076-91ee-54599eed8080) | `CourtResultChart.vue`: labeled 25% drawdown boundary and hatching clipped to actual breaches | The line is read-only and uses true chart geometry. Recovery time remains part of the risk verdict; the line is not the whole test |
| [Life in Weeks](https://collectui.com/designs/infographic-ui-design-inspiration/0b5c413e-fb9b-4928-a620-f6c4cc66081f) | `ParameterMatrix.vue`: one mark per returned parameter trial, labeled baseline and multiplier, inspectable outcome | Profit, loss, invalid, zero, and unavailable remain distinct. No invented trials or synthetic confidence grade |
| [Marcel — tactile tabs](https://collectui.com/designs/tabs-ui-design-inspiration/38080c55-3c72-426c-bfe2-5d690d24a4fc) | Shared moving indicator on the workspace tabs | Measured positions, immediate content, keyboard arrows, no halo |
| [Jeet — expanding list](https://collectui.com/designs/list-items-ui-design-inspiration/8b22f858-287f-4796-915b-42c69b8963f3) | `SegmentedControl.vue` and `RevealPanel.vue`, used for chart modes, filters, data source, comparison, draft adjustment, and agent details | Inset white thumb and local expansion; severe findings stay visible |
| [Benji Taylor — notification stack](https://collectui.com/designs/notification-ui-design-inspiration/2efe178b-f7dc-4e01-bef0-12fd41a31909) | `ToastStack.vue`: three-message limit, deduplication, shallow stack, expansion on hover/focus | Dismissal pauses while engaged or the document is hidden. Errors remain inline with recovery actions |
| [Lorenzo Cabra — morphing menu](https://collectui.com/designs/dropdown-ui-design-inspiration/f6ea1705-2356-410a-b075-89cef5384d21) | Header Create pill expands into a keyboard-accessible menu | Only real destinations: new strategy and sample investigation. No sound, invented import flow, or overshoot |
| [Lorenzo Cabra — tick dial](https://collectui.com/designs/range-slider-ui-design-inspiration/9db4fdea-16a2-465c-9637-90b8ee6e65fd) | `ParameterDial.vue` in the variant editor | Uses the existing bounded numeric parameter; paired with exact typing and a native keyboard-accessible range control. Changing it does not run a variant |
| [Raul — pixel ripple](https://collectui.com/designs/button-ui-design-inspiration/5582e784-9066-4c33-9af4-8bf144ca9e14) | `PixelButton.vue` on the landing sample action | One contained monochrome response under a stable label. No continuous animation or decoration on financial values |

Source screenshots and videos remain in [the original research](../collectui-research/README.md), [round two](../collectui-research/round-2/README.md), and [the motion board](../collectui-research/motion/README.md). Those documents describe their research-stage state; this document records the subsequent implementation.

## Functional coverage

The numbered groups match [recommendations.json](../collectui-research/recommendations.json). Existing safety and workflow behavior was retained where it already fulfilled the recommendation.

| Group | Delivered behavior |
| --- | --- |
| 1. Linked inspector | Docked evidence at 1280px and wider; modal sheet below it. Exact trade/period selection updates the chart, heading, and row. Previous/next respects the filtered set. Close returns focus. Private links include case, version, run, kind, and evidence ID and still require access |
| 2. Result hierarchy | Verdict, primary weakness, and next action lead. A flat metric strip shows profit factor, return, drawdown, and count with units. Execution completion, invalid output, failure, and inconclusive assessment remain different states |
| 3. Long records | Compact Audit table, expandable recorded proof, sticky evidence headers/identity, bounded trade/signal/audit pages, counts and explicit navigation |
| 4. Chart instrument | Nearby symbol, range, provenance, and version context; inset Candles/Line control; keyboard bar inspection with exact OHLC announcement and a matching recorded-trade action. View controls do not rerun the engine |
| 5. Resuming work | Account-scoped local intake draft with save/restore/clear status. Investigation checklist uses actual confirmation/run/decision state; evidence review is an explicit session marker |
| 6. Draft adjustments | Inline numeric period and risk edits with bounds, before/after preview, recoverable errors, and Escape/focus return. Saving produces a new unconfirmed review version. The existing full expression editor remains available for broader rule changes |
| 7. Dates and evaluation | Atomic From/To editor with typing, adjacent desktop months, one mobile month, keyboard movement, anchored 1/3/5-year presets, and explicit apply/cancel. A proportional strip shows the actual baseline and evaluation overlap; no reserved replay history is revealed |
| 8. Real progress | Explicit engine stages and elapsed time, no invented ETA or percentage-derived test completion. Running status remains reachable from other workspace tabs. Existing provider failures retain recovery text |
| 9. Feedback | Deduplicated toast stack for completed actions; persistent validation/provider errors stay in their relevant section |
| 10. Command menu | Cmd/Ctrl K and a visible search trigger. Local section, finding, trade, and indicator navigation with arrows/Enter/Escape. No confirmation or public-sharing bypass |
| 11. Decision history | Actor, version, and event-type filtering; recorded entity links and expandable before/after proof. Confirmed decisions remain immutable; private drafts do not enter shared reports |
| 12. Filters | Symbol, profit/loss, date overlap, and text search, plus existing signal filters. Applied constraints and counts remain visible. Tab changes and inspector closure preserve the current view |
| 13. Empty states | Separate prerequisite, no-run, no-trade, no-match, invalid, and unavailable states. A rejected strategy remains a completed investigation rather than a prompt to optimize until it passes |
| 14. Validation | Intake, variant, indicator, and decision inputs retain values and focus invalid fields. Errors explain constraints and remain visible; no shaking or red glow |
| 15. Versions | Version choices show confirmation/evaluation context, recorded hypothesis and run status. Details links to exact rules and baseline comparison. All variant attempts remain in creation order under the existing three-attempt limit |
| 16. Tab motion | One measured underline with 180ms movement, roving keyboard navigation, immediate content, and reduced-motion fallback |
| 17. Comparison | Signed differences, percentage-point labels, exact values, expandable calculation/period context, paired bars, recorded hypothesis, full comparison, and exact rule changes |
| 18. Findings | Returned failure IDs open their actual evidence. Other test nodes focus the corresponding recorded finding. No invented causal explanation |
| 19. Agent context | Actual registration state, registered tools, recent agent audit events, selected evidence, and required confirmation; no fabricated thought stream or resource estimates |
| 20. Multi-case rail | Conditional research only: the app does not have a multi-case library. No speculative backend, fake recent-case list, or redundant navigation rail was added |
| 21. Responsive layout | Court reading order retained; full-height evidence sheet, visible close control, safe-area padding, focus trap, background inertness, and internally scrolling ledgers. Units and important columns remain available |
| 22. Landing walkthrough | Existing headline and samples retained. Synthetic chart includes selectable observed events, rule context, explicit generated-data labeling, inset range control, and one pixel response on Open sample |
| 23. Context previews | Indicator definition/parameter/source/version previews and decision-citation previews, available on hover, focus, and click with pointer-safe dismissal and a real detail action |
| 24. Motion consistency | Shared 90/180/240ms timings; controlled press, selection, expansion, menu, inspector, and feedback effects. Reduced motion removes animation/transition and smooth scrolling. Financial values are never tweened |

## Boundaries preserved

- No strategy evaluation formula, risk threshold, access rule, confirmation boundary, or variant limit was changed.
- No new animation runtime dependency was added. Effects use Vue transitions, CSS, SVG, and native controls.
- Public report enhancements only render fields already returned by its authorized endpoint.
- A copied evidence link is private. It does not create a public share token.
- Unsupported cancellation/pause, decorative scanning, sound, neon glows, falling digits, and speculative library navigation were intentionally omitted.

## Verification

The browser walkthrough uses an explicitly generated **synthetic software demo**, not real market-performance evidence. It confirmed version 1 and ran Court, then created one recorded variant changing the entry RSI period from 14 to 12 with an explicit UI-test hypothesis. No replay, public share, deployment, or order was initiated.

- `bun test`: 175 passing tests across 33 files, including five new tests for honest progress, metric differences, parameter trials, scoped evidence links, and notification deduplication.
- `bun run typecheck`: passed across all workspaces.
- `bun run build`: passed, including third-party notices and deterministic fixture verification. No new runtime packages were added.
- Browser checks: actual Court and variant flow; precise signed comparison; filtered previous/next; private-link action; tab state retention; keyboard chart values; command search and selection; date validation/apply/cancel; mobile focus trap/Escape/return; phone month-boundary keyboard movement; no document overflow at 1280px, and in Evidence, Court, and Variants at 390px. The Court grid explicitly constrains its tracks so the parameter table scrolls internally.
- Additional browser checks: draft save/reload/restore/clear, indicator preview dismissal and invalid-field focus, version hypothesis/run descriptions, empty audit-filter recovery, native dial keyboard steps synchronized with exact numeric input, and copy feedback outside the inert app background.
- Reduced-motion behavior was reviewed in CSS and the explicit scroll path. Browser motion-preference emulation was not available, so no emulated reduced-motion run is claimed.

## Screenshots

Captured directly from the implemented app. Desktop captures use the browser's normal 1280 × 720 viewport; phone captures use a temporary 390 × 844 test viewport. No image was retouched. The temporary viewport override was reset.

- [Court overview](screenshots/court-overview.jpg)
- [Execution and verdict map](screenshots/test-map.jpg)
- [Parameter trial matrix](screenshots/parameter-matrix.jpg)
- [Baseline comparison](screenshots/comparison.jpg)
- [Parameter dial](screenshots/variant-dial.jpg)
- [Evidence inspector](screenshots/evidence-inspector.jpg)
- [Command menu](screenshots/command-menu.jpg)
- [Atomic date range](screenshots/date-range.jpg)
- [Mobile Court summary](screenshots/mobile-court.jpg)
- [Mobile inspector](screenshots/mobile-inspector.jpg)
- [Mobile calendar](screenshots/mobile-calendar.jpg)
- [Indicator preview](screenshots/indicator-preview.jpg)
