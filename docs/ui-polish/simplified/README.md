# Simplified Strategy Court workspace

September 1, 2026. This revision addresses the feedback that the interface showed too much at once and made the investigation hard to follow.

## Design decisions

The primary task is to understand the result, inspect the evidence that matters, then record a conclusion. The default screen should not require reading execution logs or interpreting every chart.

| Area | Current behavior |
| --- | --- |
| Entry point | Confirmed strategies open on Results. Unconfirmed strategies open on Rules. Explicit section/version/evidence links still take precedence. |
| Case identity | The strategy name is the main heading. Symbols and dates are secondary. The version selector remains visible; the repeated verdict badge and universal agent strip were removed. |
| Navigation | Results, Evidence, Compare, Rules, Replay, Activity. Existing routes, access rules, and keyboard navigation are retained. |
| Results | Verdict, plain-language explanation, one review action, four key measures, and compact test rows. The primary action opens the relevant test in place. One test expands at a time. |
| Detailed analysis | Equity/drawdown, parameter sensitivity, and execution/data/full metrics are separate labeled disclosures. No returned data or capability was discarded. |
| Evidence | One view at a time: Trades, Stress periods, Chart, or Signals. Filters are optional; applied constraints and counts remain visible when the controls close. Opening a record shows its chart context. Closing restores the prior view and exact origin control. |
| Compare | Opens directly on comparison. Test a change opens a separate editor; Back to comparison preserves the draft. The dial is optional. Phone rows keep baseline, variant, and difference visible without horizontal scrolling. |
| Rules | Entry, exit, and risk limits stay visible. Execution assumptions collapse after confirmation and remain initially open before confirmation. The structured definition remains available. |
| Activity | Agent tools, technical proof, and the full investigation checklist live with the activity record. Evidence review remains an explicit session marker. |
| Decision | The conclusion and its supporting evidence remain the user's responsibility. Returning from a stress-period inspector focuses the decision section. No confirmation is automated. |

## Reference applied

Revisited [Jeet's comparison disclosure on CollectUI](https://collectui.com/designs/accordion-ui-design-inspiration/1f0bdcc2-9127-42ee-b3eb-69b4c212d890) in the in-app browser before redesigning. Its useful composition is a compact overview with one expanded explanation, clear alignment, and restrained supporting detail. This informed the test rows and comparison, rather than adding another decorative surface. The previously implemented motion controls remain, but appear within the relevant task.

The workspace navigation now follows [Marcel's tactile tabs on CollectUI](https://collectui.com/designs/tabs-ui-design-inspiration/38080c55-3c72-426c-bfe2-5d690d24a4fc): separate controls with a fine rim, icons that identify each investigation area, and one marker moving along a shared baseline. Strategy Court omits the source halo and keeps search as a distinct adjacent control. The former enclosing segmented capsule was removed, while the unified 1120px case frame remains unchanged.

The approved motion shortlist now informs a project-wide motion system: route and workspace changes use brief decelerating transitions; disclosures and comparison rows reveal their contents locally; evidence inspectors enter from their anchor edge; notifications retain the shallow stack; and major landing/catalog sections reveal once as they enter the viewport. Controls respond immediately, `prefers-reduced-motion` removes the transitions, and financial values never animate between numbers.

The popup audit covers the shared select listbox, date picker, date-range dialog, account popover, mobile navigation, create menu, command dialog, context preview, case inspector, and native disclosures. Select menus and calendars open toward their chosen placement, account and mobile menus animate from the header edge, chevrons communicate state, and all shared component instances inherit the behavior without page-specific copies.

The earlier [reference and implementation map](../README.md) records the other approved sources. This revision changes their placement and default visibility, not the financial engine.

## Validation

- `bun test`: 175 passed, 0 failed, across 33 files.
- `bun run typecheck`: passed across all workspaces.
- `bun run build`: passed, including notices and deterministic fixture checks.
- `git diff --check`: passed.
- Browser: result-first loading; main action opens and focuses the failed test; its supporting evidence opens with the chart selected; return from the inspector focuses the decision; performance chart and parameter matrix remain accessible.
- Browser: comparison and editor are mutually exclusive; editor entry/return focus works; empty submission is blocked and focuses New value; the dial starts collapsed.
- Browser: filters remain visible as applied chips when controls close; the filtered inspector uses the correct count; Escape restores the exact trade button and prior view; mobile modal background is inert and released on close; Signals can be opened independently.
- Responsive checks at 1280 px and 390 px: no document overflow in the revised results, comparison, editor, or evidence flow. Comparison values use labeled columns on phones.

All screens use the existing, explicitly labeled synthetic software demo. This pass did not create a new strategy, run, variant, public share, replay, or order. An empty variant submission was used to verify validation and did not consume an attempt. No runtime dependency, evaluation formula, risk threshold, access policy, or confirmation requirement changed.

## Screenshots

Direct browser captures, without retouching. Desktop uses the normal 1280 × 720 viewport. Phone captures use 390 × 700 at the display's native pixel density. Temporary emulation and viewport overrides were cleared afterward.

- [Results](results.jpg)
- [Expanded test](test-explanation.jpg)
- [Comparison](compare.jpg)
- [Evidence](evidence.jpg)
- [Rules](rules.jpg)
- [Phone results](mobile-results.png)
- [Phone comparison detail](mobile-compare.png)
- [Phone inspector](mobile-inspector.png)
