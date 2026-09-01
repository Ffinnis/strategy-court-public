# Strategy Court design reference guide

> The revised references were approved on September 1, 2026. See [the approval record](approved-direction.md) and [six additional motion and UI references](motion/README.md).

> Visual direction revised after user feedback: see [the three-reference visual brief](round-2/README.md) and [the enlarged animation board](round-2/index.html). This original inventory remains functional research; its visual shortlist is superseded.

Make every finding inspectable. Strategy Court should let someone move from a weakness to its chart interval, trades, assumptions, and recorded decision without losing context.

24 selected references · 62 concrete applications · 13 motion specifications · 58 browser screenshots

[Open the visual guide](index.html)

## Scope and evidence

Browser research on 31 August 2026. Surveyed the first result pages of 24 relevant Collect UI categories and closely inspected 24 individual designs. This is a curated sweep, not an exhaustive review of the whole site. The live landing page and repository informed the application notes. Authenticated workflows were inspected in source code, not exercised in this session.

Static references establish composition, not usability. Several references are autoplay videos; the saved images include selected frames. Proposed timings below are design recommendations, not measurements of those clips. A browser asset export for one video failed, so the guide links to the original motion references rather than claiming to include offline video. Source artwork belongs to its creators and is included here for internal reference, not as licensed application assets.

## What the repository already tells us

- The existing product already has a three-step intake, line tabs with keyboard navigation, an evidence inspector with focus restoration, agent selection attribution, comparison tables, rule diffs, a decision record, and reduced-motion CSS. Keep these foundations.
- Court finding rows currently display result, finding, observed measure, and threshold, while the header Evidence action changes tabs. Direct finding-to-evidence navigation is the clearest next interaction to investigate.
- Court derives the active stage from percentage progress using equal seventh-sized buckets. An explicit stage-state contract would make the visual checklist easier to trust.
- Some Court and shared style rules use 9 to 11 px metadata, and main.scss contains successive override layers for cards, shadows, and motion. A focused typography pass and token cleanup would make future refinement more predictable.
- The variant summary already has Baseline and Variant columns, with full comparison and rule changes below. Improve that existing structure with meaningful differences and context instead of replacing it with a leaderboard.

## The design contract to keep

- Preserve the monochrome palette, primary system sans-serif typeface, sentence case, and flat layout. No uppercase micro-labels or decorative monospace. Tickers, IDs, code, and established acronyms retain their proper form.
- Use a 4 px spacing rhythm, 8 to 10 px control radii, and dividers for related data. A card must represent an independent object or interaction. Reserve depth for temporary overlays.
- Start review at 14 px primary body text and 12 px secondary labels; do not make critical evidence 9 px. Use tabular numerals for comparisons. These are proposed targets, not a claim that every current screen uses tiny text.
- Statuses need text and distinct icons. Keep measured values, unknown values, invalid runs, and unavailable evidence visibly different. Never infer financial reliability from visual polish.
- Keep focus rings visible, ordinary controls comfortably operable by touch, and important explanations available without hover. Preserve 200% text zoom and reduced motion.

## Implementation order

| Pass | Priority | Work | Acceptance |
| --- | --- | --- | --- |
| 1. Reading and trust | P0 | Readable text, distinct error and empty states, honest run stages, stable mobile hierarchy. | Users can explain the verdict and recover from a failure without guessing. |
| 2. Evidence continuity | P0 then P1 | Finding-to-inspector links, synchronized chart selection, baseline differences, usable history. | A user can cite the exact evidence behind a recorded decision and return to it. |
| 3. Input and feedback | P1 | Draft editing, date ranges, resume state, applied filters, bounded notices. | Edits do not lose work or change a confirmed strategy silently. |
| 4. Motion and shortcuts | P2 | Shared motion tokens, contextual previews, command menu; case rail only if a library is built. | Every effect survives keyboard use, interruption, and reduced motion. |

Effort labels on references are relative implementation scope. They are not delivery estimates. P0 means foundational polish in this guide, not a production incident severity.

## Selected references and applications

### 01. Keep evidence and its inspector together

Evidence · P0 · Refine existing inspector · Medium effort

[Collect UI reference](https://collectui.com/designs/table-ui-design-inspiration/b4e496d5-52bb-4710-8167-fc21779ad5a9) · DejvDesign · @dejvdesign

![Keep evidence and its inspector together](screenshots/01-linked-inspector.png)

Observed: A sensor table stays visible behind a detail sheet containing a chart, measurements, and recent activity.

1. At wide widths, offer a docked inspector beside the chart and ledger. Keep the selected row, filters, and scroll position visible. Use the existing overlay on constrained widths.
2. Make a finding open its exact failure interval or trade. Update the chart highlight, row selection, and inspector heading together. Preserve the existing Selected by agent attribution.
3. Add previous and next evidence controls that respect the filtered result set. Closing the inspector returns focus to its opening row.
4. Add a run-scoped selection link for returning to evidence. Resolve case access before selection and never create a public report merely because someone copies a link.

Leave out: Do not copy the scenic background, nested metric cards, or sensor branding. The sheet is an independent inspector; its contents can use dividers.

Implementation touchpoints: [EvidenceTab.vue](../../apps/web/src/components/tabs/EvidenceTab.vue), [CandlestickEvidenceChart.vue](../../apps/web/src/charts/CandlestickEvidenceChart.vue), [evidence.ts](../../apps/web/src/stores/evidence.ts), [router.ts](../../apps/web/src/router.ts).

### 02. Give the Court result a stronger reading order

Court · P0 · Refine existing result header · Small effort

[Collect UI reference](https://collectui.com/designs/dashboard-ui-design-inspiration/fdd764a7-d587-4b4b-a007-36579499d9cf) · Alexander Avdeev · @privetavdey

![Give the Court result a stronger reading order](screenshots/02-dark-dashboard.png)

Observed: The dark operations dashboard places summary measures above a compact run ledger, with quiet navigation.

5. Keep the verdict and primary weakness first, then the most relevant action. Court already has this structure; strengthen its type hierarchy instead of adding another dashboard.
6. Keep a flat metric strip with aligned values, units, and short explanations. Use tabular numerals and consistent precision. Raise tiny explanatory text before adding decoration.
7. Separate execution status from strategy assessment. Run complete, strategy failed, and insufficient evidence must remain distinct in text and icons.

Leave out: Do not adopt the grid of cards, decorative sparklines, colored status dots alone, or a large return figure that overwhelms the weakness.

Implementation touchpoints: [CourtTab.vue](../../apps/web/src/components/tabs/CourtTab.vue), [VerdictHeader.vue](../../apps/web/src/components/VerdictHeader.vue), [StatusBadge.vue](../../apps/web/src/components/StatusBadge.vue), [main.scss](../../apps/web/src/styles/main.scss).

### 03. Make long records scannable

Audit · P1 · Refine tables and history · Medium effort

[Collect UI reference](https://collectui.com/designs/table-ui-design-inspiration/438c1b31-7d4c-45f3-b247-6a192b45ab21) · Osha · @Osha_Lion

![Make long records scannable](screenshots/03-dense-ledger.png)

Observed: An audit log aligns activity, author, and timestamp beneath a small filter toolbar and above explicit pagination.

8. Offer a compact Audit table for long histories with event, actor, version, and time columns. Keep a disclosure for the rationale and technical proof.
9. Give Evidence tables sticky headers and a stable identity column. Right-align quantities and currency, and retain units in column labels.
10. Use explicit result counts and pagination wherever lists are bounded. The existing signals pagination should not be the only list that explains its visible range.

Leave out: Do not shrink rows to fit the whole record. Aim for 40 to 44 px rows with readable 13 to 14 px primary text, then test with real long values.

Implementation touchpoints: [AuditTab.vue](../../apps/web/src/components/tabs/AuditTab.vue), [EvidenceTab.vue](../../apps/web/src/components/tabs/EvidenceTab.vue).

### 04. Treat the chart and its controls as one instrument

Evidence · P1 · Refine existing charts · Medium effort

[Collect UI reference](https://collectui.com/designs/analytics-chart-ui-design-inspiration/658b5520-2f10-4829-b102-74ecf728dc2e) · Omer Erdogan · @omererdgan

![Treat the chart and its controls as one instrument](screenshots/04-chart-hierarchy.png)

Observed: The analytics page keeps scope, date granularity, comparison, and a value tooltip close to the main chart.

11. Unify the active symbol, date range, strategy version, and comparison state in one chart toolbar. Label whether a control changes the view or changes test inputs.
12. Keep crosshair values immediate, with a keyboard equivalent and a textual selected-point summary. Selection should also identify the related trade or failure.
13. Keep provider, adjustment policy, retrieval time, and synthetic-data status near the result. Put full snapshot hashes behind Technical proof, while preserving chart attribution.

Leave out: Do not import the marketing tutorial cards or imply that a chart range selection reruns the model. Avoid animated chart values that pass through false intermediate numbers.

Implementation touchpoints: [CourtResultChart.vue](../../apps/web/src/charts/CourtResultChart.vue), [CandlestickEvidenceChart.vue](../../apps/web/src/charts/CandlestickEvidenceChart.vue), [EvidenceTab.vue](../../apps/web/src/components/tabs/EvidenceTab.vue).

### 05. Help people resume the investigation

Strategy · P1 · Refine wizard; add resumability · Medium effort

[Collect UI reference](https://collectui.com/designs/onboarding-ui-design-inspiration/d5f1be77-77ca-4006-8c8a-f4415237d044) · Maxim Kuznetsov · @disarto_max

![Help people resume the investigation](screenshots/05-onboarding-checklist.png)

Observed: A compact onboarding checklist has completed, current, and remaining steps, with a collapsed summary.

14. Keep the existing three-step intake. Add a private resumable draft with a clear Saved locally or Saved to account status. Never store account secrets alongside draft inputs.
15. Use a small investigation checklist for Rules confirmed, Court completed, Evidence reviewed, and Decision recorded. Record explicit user actions; opening a tab does not prove review.

Leave out: No mandatory product tour, completion confetti, or pressure to reach replay. Closing an investigation is a valid destination.

Implementation touchpoints: [CaseIntakePage.vue](../../apps/web/src/pages/CaseIntakePage.vue), [VerdictHeader.vue](../../apps/web/src/components/VerdictHeader.vue), [InvestigationDecision.vue](../../apps/web/src/components/InvestigationDecision.vue).

### 06. Edit draft rules where they are read

Strategy · P1 · Add draft-only inline editing · Large effort

[Collect UI reference](https://collectui.com/designs/form-ui-design-inspiration/991cad56-1ceb-49c7-b5f1-733946f1e3a2) · Ali Grids · @AliGrids

![Edit draft rules where they are read](screenshots/06-inline-edit.png)

Observed: The clip turns a table row into labeled inputs with Cancel and Done, while surrounding rows remain in place.

16. Let a draft rule row expand into the existing safe expression controls. Keep the sentence visible beside its period, comparison, and threshold fields.
17. After editing, show exactly what changed, such as SMA period 120 to 100. Existing confirmed rules stay immutable; revisions go through review and confirmation.
18. Reserve the expanded row height, retain focus, and preserve unsaved input on a recoverable error. Escape cancels only the current edit and restores the row.

Leave out: Do not blur the surrounding ledger as heavily as the reference. Never make a confirmed rule directly editable or quietly spend a variant attempt.

Implementation touchpoints: [StrategyTab.vue](../../apps/web/src/components/tabs/StrategyTab.vue), [ManualExpressionField.vue](../../apps/web/src/components/tabs/ManualExpressionField.vue), [VariantsTab.vue](../../apps/web/src/components/tabs/VariantsTab.vue).

### 07. Make the historical range explicit

Strategy · P1 · Refine existing date controls · Medium effort

[Collect UI reference](https://collectui.com/designs/date-picker-ui-design-inspiration/c3203ffb-02aa-446a-b848-069de037e13e) · Maxim Kuznetsov · @disarto_max

![Make the historical range explicit](screenshots/07-date-controls.png)

Observed: A dark date-range selector combines presets, typed start and end values, adjacent calendars, and Apply and Cancel.

19. Wrap the existing date inputs in a single range interaction. Use adjacent months on desktop and one month on mobile; keep direct typing and keyboard navigation.
20. Keep 1, 3, and 5 year presets anchored to the chosen end date. Show the resulting exact dates before applying; do not replace backtest presets with Today or Yesterday.
21. Show training, evaluation, and holdout boundaries in a small labeled strip wherever those splits exist. A view-only calendar must not unlock unseen evaluation history.

Leave out: Do not copy the decorative dotted backdrop, purple glow, or oversized radius. Date validity and market-data coverage need separate explanations.

Implementation touchpoints: [FormDatePicker.vue](../../apps/web/src/components/forms/FormDatePicker.vue), [calendar.ts](../../apps/web/src/components/forms/calendar.ts), [CaseIntakePage.vue](../../apps/web/src/pages/CaseIntakePage.vue), [ProbationTab.vue](../../apps/web/src/components/tabs/ProbationTab.vue).

### 08. Report the work the engine is actually doing

Court · P0 · Refine progress semantics · Medium effort

[Collect UI reference](https://collectui.com/designs/progress-ui-design-inspiration/02682bb0-2c49-45ae-b45e-6d1c5aed39fe) · Vas · @justvasi

![Report the work the engine is actually doing](screenshots/08-run-stages.png)

Observed: An activity list distinguishes working, queued, and completed steps, including grouped activities.

22. Drive stage completion from explicit engine state. Court currently derives the stage index by dividing percentage progress into seven equal parts; verify that contract before presenting those steps as completed.
23. Show elapsed time and the current stage. If the provider request is delayed, explain that state and its timeout without inventing an estimated finish time.
24. Keep a compact run status visible when users switch tabs. Offer navigation back to the run. Add cancellation or pause only if the server can actually stop or pause the job.

Leave out: No timer-driven fake percentage, scanning beam, multiple simultaneous spinners, or Copy code-style terminal log by default.

Implementation touchpoints: [CourtTab.vue](../../apps/web/src/components/tabs/CourtTab.vue), [CaseWorkspacePage.vue](../../apps/web/src/pages/CaseWorkspacePage.vue), [court.ts](../../apps/web/src/stores/court.ts).

### 09. Make feedback visible without covering the work

Global · P1 · Refine existing notices · Small effort

[Collect UI reference](https://collectui.com/designs/notification-ui-design-inspiration/66a9d014-21a0-4c27-87d6-3dde2590ef6e) · dmytro · @pqoqubbw

![Make feedback visible without covering the work](screenshots/09-notification-active.png)

Observed: The toast demo shows status variants, actions, stacked messages, and a deduplication control.

25. Use one brief notice for a completed reversible action, such as draft saved or citation copied. Deduplicate repeated events and keep the stack away from the primary action and inspector close button.
26. Keep validation and provider errors at the relevant section until resolved. A toast can announce the failure, but it must not be the only place the recovery action exists.

Leave out: No infinite piles of notifications, disappearing critical errors, or optimistic Saved messages before the server acknowledges a durable save.

Implementation touchpoints: [CaseWorkspacePage.vue](../../apps/web/src/pages/CaseWorkspacePage.vue), [OwnerShareControls.vue](../../apps/web/src/components/OwnerShareControls.vue), [InvestigationDecision.vue](../../apps/web/src/components/InvestigationDecision.vue).

### 10. Add a command menu after the core flows are polished

Global · P2 · New optional feature · Medium effort

[Collect UI reference](https://collectui.com/designs/command-bar-ui-design-inspiration/2c6296de-6a5c-431d-8688-958cf846276b) · Alvish 🧙‍♂️ · @alvishbaldha

![Add a command menu after the core flows are polished](screenshots/10-command-menu.png)

Observed: A command menu groups actions and shows shortcut hints while leaving the document behind it recognizable.

27. Add Cmd or Ctrl K for Go to Evidence, Find indicator, Inspect selected trade, and Jump to current run. Start with navigation and the current case rather than building global search infrastructure.
28. Reflect state in the results. Explain why a command is unavailable and take users to the prerequisite. Confirmation and public-sharing actions still require their normal review UI.

Leave out: Do not hide basic navigation in the command menu or let Enter bypass the strategy confirmation boundary.

Implementation touchpoints: [AppHeader.vue](../../apps/web/src/components/AppHeader.vue), [CaseWorkspacePage.vue](../../apps/web/src/pages/CaseWorkspacePage.vue), [router.ts](../../apps/web/src/router.ts).

### 11. Let the history explain why a decision changed

Audit · P1 · Refine existing timeline · Medium effort

[Collect UI reference](https://collectui.com/designs/search-ui-design-inspiration/a5613716-d836-4d11-921f-75282c024536) · ørllar · @HAFEEZOLAMIDE1

![Let the history explain why a decision changed](screenshots/11-activity-history.png)

Observed: A timeline combines concise activity lines with expanded contextual details and links.

29. Show a concise event sentence with human or agent attribution, affected version, and timestamp. Expand the recorded rationale, uncertainty, and citations only when needed.
30. Add filters for actor, version, and event type. Link confirmation and decision events back to the exact rules or evidence, without exposing private draft text in shared reports.

Leave out: Do not turn Audit into a chat transcript or animate old history when the user changes a filter.

Implementation touchpoints: [AuditTab.vue](../../apps/web/src/components/tabs/AuditTab.vue), [InvestigationDecision.vue](../../apps/web/src/components/InvestigationDecision.vue), [SharedReportPage.vue](../../apps/web/src/pages/SharedReportPage.vue).

### 12. Keep filters readable after the menu closes

Evidence · P1 · Refine filters and persist view state · Medium effort

[Collect UI reference](https://collectui.com/designs/filter-products-ui-design-inspiration/6d269a28-172f-4690-908d-8ad7cce38b58) · benja · @benjaminakar

![Keep filters readable after the menu closes](screenshots/12-filter-pills.png)

Observed: Applied filter pills expose field, operator, and selected values, with a popover for editing one filter.

31. Add compact applied filters for symbol, trade outcome, signal status, and date range. Show the result count beside them and keep Clear filters visible.
32. Use plain text such as Symbol is SPY and Outcome is Loss. Preserve exact data values and use sentence case for labels.
33. Preserve filter and sort state when switching tabs or closing an inspector. When there are no matches, explain the active constraints rather than suggesting the run produced no evidence.

Leave out: Do not expose a generic query builder if the available filters fit one small menu. Avoid nesting a filter card inside a table card.

Implementation touchpoints: [EvidenceTab.vue](../../apps/web/src/components/tabs/EvidenceTab.vue), [evidence.ts](../../apps/web/src/stores/evidence.ts), [IndicatorCatalogPage.vue](../../apps/web/src/pages/IndicatorCatalogPage.vue).

### 13. Give every empty state a truthful next step

Global · P0 · Refine existing empty states · Small effort

[Collect UI reference](https://collectui.com/designs/empty-states-ui-design-inspiration/88241e94-cf94-45b6-a175-02c319d13c4b) · Zedsy · @zedsxyz

![Give every empty state a truthful next step](screenshots/13-empty-state.png)

Observed: A simple empty view pairs a specific explanation with one direct action.

34. Distinguish No run yet, No trades generated, No filter matches, Invalid run, and Evidence unavailable. These require different messages and actions.
35. Route the action to the missing prerequisite. Examples include Review rules, Open Court, Clear filters, and Retry evidence. Keep the user in the same case.
36. Treat a recorded rejection as a completed investigation. Show the rationale and revisit criteria, with no sad illustration or invitation to keep optimizing until something passes.

Leave out: Do not copy the file-cabinet illustration or use No data for every failure. Existing indicator filter recovery is a useful baseline to extend.

Implementation touchpoints: [EvidenceTab.vue](../../apps/web/src/components/tabs/EvidenceTab.vue), [VariantsTab.vue](../../apps/web/src/components/tabs/VariantsTab.vue), [ProbationTab.vue](../../apps/web/src/components/tabs/ProbationTab.vue), [InvestigationDecision.vue](../../apps/web/src/components/InvestigationDecision.vue).

### 14. Make errors part of the form layout

Strategy · P0 · Refine existing validation · Small effort

[Collect UI reference](https://collectui.com/designs/error-state-ui-design-inspiration/098f4527-a05b-4ea7-b0ae-e18a0610a156) · Aaron · @aaronmahlke

![Make errors part of the form layout](screenshots/14-validation-later.png)

Observed: The login clip adds an error message immediately above the same form without replacing its fields.

37. Keep values after a failed submit and focus the first invalid field. Intake already does much of this; use the same behavior in custom indicator, variant, and decision forms.
38. Explain the constraint next to the field, for example End date must follow start date. Use a summary for request-wide failures and an explicit retry action.
39. Reserve space for common validation messages so the primary button does not move out from under the pointer. Combine text and an icon; keep the monochrome palette.

Leave out: Do not reproduce the red glow, shake the whole form, erase user input, or treat invalid data as a successful result with zero values.

Implementation touchpoints: [CaseIntakePage.vue](../../apps/web/src/pages/CaseIntakePage.vue), [IndicatorCatalogPage.vue](../../apps/web/src/pages/IndicatorCatalogPage.vue), [VariantsTab.vue](../../apps/web/src/components/tabs/VariantsTab.vue), [InvestigationDecision.vue](../../apps/web/src/components/InvestigationDecision.vue).

### 15. Make version context available before switching

Audit · P1 · Extend existing version selector · Medium effort

[Collect UI reference](https://collectui.com/designs/tooltip-popover-ui-design-inspiration/d891a47f-858d-41f4-8a83-6c8d3b5d036c) · Kevin · @kvnkld

![Make version context available before switching](screenshots/15-version-history.png)

Observed: A version-history popover contains a version number, timestamp, change summary, Compare, and Details.

40. Extend the version selector with the recorded hypothesis, confirmation state, associated run, and evaluation-informed status. Keep a concise current version label in the header.
41. Offer Compare with baseline and Exact rule changes from that context, reusing the current comparison and diff data.
42. Keep all attempted variants in creation order and show the three-attempt limit. A failed or invalid attempt remains part of the record.

Leave out: Do not copy the large decorative timeline or imply that selecting an earlier version restores unseen evaluation data.

Implementation touchpoints: [VerdictHeader.vue](../../apps/web/src/components/VerdictHeader.vue), [VariantsTab.vue](../../apps/web/src/components/tabs/VariantsTab.vue), [AuditTab.vue](../../apps/web/src/components/tabs/AuditTab.vue).

### 16. Animate the selected tab, not the whole workspace

Global · P2 · Refine existing tab transition · Small effort

[Collect UI reference](https://collectui.com/designs/tabs-ui-design-inspiration/1859d1a8-7cda-4d8b-9755-fcd8a605dceb) · Swami · @SwamiMalode

![Animate the selected tab, not the whole workspace](screenshots/16-tab-motion.png)

Observed: The clip moves and reshapes a selected navigation highlight between adjacent items.

43. Borrow the continuity of one moving marker. Keep Strategy Court's line tabs and animate the underline for about 160 ms, with no gooey deformation or bright fill.
44. Preserve the current keyboard tab model, active selection, and sensible scroll position. Content should appear immediately; do not slide an entire evidence table across the screen.

Leave out: No bouncy text, expanding tab widths, or motion that delays keyboard navigation. Reduced motion uses an immediate state change.

Implementation touchpoints: [CaseWorkspacePage.vue](../../apps/web/src/pages/CaseWorkspacePage.vue).

### 17. Make a variant comparison answer a question

Variants · P0 · Refine existing comparison · Medium effort

[Collect UI reference](https://collectui.com/designs/accordion-ui-design-inspiration/1f0bdcc2-9127-42ee-b3eb-69b4c212d890) · Jeet · @jeetnirnejak

![Make a variant comparison answer a question](screenshots/17-comparison-disclosure.png)

Observed: A compact comparison list expands one entry into metric details while preserving the other entries.

45. Keep Baseline and Variant visible and add a signed Difference column to the existing summary table. Label percentage points versus percent change and avoid a universal higher-is-better treatment.
46. Expand a measure to show its calculation, observation period, and related verdict. Use paired bars only where a shared scale is meaningful; the exact values remain primary.
47. Keep the hypothesis and exact rule change beside the result. Preserve all attempts and the existing full comparison; do not turn the interface into a best-return leaderboard.

Leave out: No composite confidence score, rainbow series, animated ranking, or green winner treatment based on return alone.

Implementation touchpoints: [VariantsTab.vue](../../apps/web/src/components/tabs/VariantsTab.vue), [strategyVariantControls.ts](../../apps/web/src/services/strategyVariantControls.ts).

### 18. Tie each finding to a visible piece of evidence

Court · P1 · Extend finding links · Medium effort

[Collect UI reference](https://collectui.com/designs/modal-ui-design-inspiration/93db8ae4-d2e4-40a1-a4c7-30c33dd41182) · Jeet · @jeetnirnejak

![Tie each finding to a visible piece of evidence](screenshots/18-finding-summary.png)

Observed: The scanner demo highlights parts of the input and lists the items it flagged.

48. Give each Court finding an Inspect evidence action that selects its recorded trade or failure interval. The existing ledger displays findings, measures, and thresholds; make that chain navigable.
49. Highlight the relevant rule operand, interval, or cost assumption after selection. Explain the observed fact and its implication using returned evidence, not invented causal claims.

Leave out: Reject the scanner beam, staged reveal of already-computed results, and arbitrary risk score. Only borrow the connection between a finding and its source.

Implementation touchpoints: [CourtTab.vue](../../apps/web/src/components/tabs/CourtTab.vue), [EvidenceTab.vue](../../apps/web/src/components/tabs/EvidenceTab.vue), [InvestigationDecision.vue](../../apps/web/src/components/InvestigationDecision.vue).

### 19. Show what the agent did and what needs the user

Court · P1 · Refine agent context · Medium effort

[Collect UI reference](https://collectui.com/designs/ai-flow-ui-design-inspiration/08262e9b-5da3-4c42-b0a8-c58fe845c3bb) · Jeet · @jeetnirnejak

![Show what the agent did and what needs the user](screenshots/19-agent-progress.png)

Observed: The agent clip presents named tasks, an active operation, a completed count, and an associated artifact.

50. Use a compact activity disclosure for actual WebMCP operations, their results, and selected evidence. Show tool facts rather than fabricated thoughts, tokens, or cost estimates.
51. Separate Agent connected, Draft ready, Waiting for your confirmation, and Engine running. Make the required human approval explicit beside the reviewed rules.

Leave out: Do not add an agent marketplace, always-visible chat rail, pause button without support, or a second progress system competing with the engine status.

Implementation touchpoints: [AgentRail.vue](../../apps/web/src/components/AgentRail.vue), [VerdictHeader.vue](../../apps/web/src/components/VerdictHeader.vue), [useWebMcp.ts](../../apps/web/src/webmcp/useWebMcp.ts), [CaseWorkspacePage.vue](../../apps/web/src/pages/CaseWorkspacePage.vue).

### 20. Use navigation density only when the product needs it

Global · P2 · Future library navigation · Medium effort

[Collect UI reference](https://collectui.com/designs/sidebar-ui-design-inspiration/f569254c-09b0-45b2-a33c-9a42bbd9a635) · Aabis · @aabis_nasir

![Use navigation density only when the product needs it](screenshots/20-sidebar-density.png)

Observed: The sidebar study compares expanded and collapsed navigation with grouped destinations and account controls at the bottom.

52. If a multi-case library is added, give it a compact case rail with active case, recent investigations, and a clear collapse control. Keep the existing six workspace tabs for sections within a case.
53. Use consistent icon sizes, text baselines, active fills, and keyboard focus. A collapsed rail needs accessible names and focus-triggered labels.

Leave out: Do not add a permanent sidebar solely because the reference looks polished. Avoid icon-only navigation for the primary investigation steps.

Implementation touchpoints: [AppHeader.vue](../../apps/web/src/components/AppHeader.vue), [CaseWorkspacePage.vue](../../apps/web/src/pages/CaseWorkspacePage.vue), [router.ts](../../apps/web/src/router.ts).

### 21. Recompose mobile screens around the next decision

Global · P0 · Refine responsive behavior · Medium effort

[Collect UI reference](https://collectui.com/designs/responsive-ui-design-inspiration/430b29ae-33e5-4e14-880c-ecd15a936fd1) · Elaya · @elayadesigns

![Recompose mobile screens around the next decision](screenshots/21-responsive-hierarchy.png)

Observed: The paired layouts preserve headline, explanation, actions, and product preview while moving them into a single mobile column.

54. On a narrow Court screen, keep verdict, primary weakness, and next action above metrics and charts. Preserve reading order; do not merely shrink the desktop layout.
55. Use a full-height evidence sheet when its content is long. Keep the title and close control visible, respect safe areas, and return focus and scroll to the selected row.
56. Keep data tables horizontally scrollable with a pinned identity column where practical. Preserve labels and units instead of hiding important columns or turning every cell into a card.

Leave out: No permanently tiny controls, hover-only information, or fixed action bar that covers the last row. Test 390 px width and 200% text zoom.

Implementation touchpoints: [CaseWorkspacePage.vue](../../apps/web/src/pages/CaseWorkspacePage.vue), [CourtTab.vue](../../apps/web/src/components/tabs/CourtTab.vue), [EvidenceTab.vue](../../apps/web/src/components/tabs/EvidenceTab.vue), [VariantsTab.vue](../../apps/web/src/components/tabs/VariantsTab.vue).

### 22. Show the product's distinctive job on the landing page

Landing · P1 · Refine existing preview · Medium effort

[Collect UI reference](https://collectui.com/designs/landing-page-ui-design-inspiration/0ef8a13d-6007-4c9b-8b9c-1df82de79dd2) · Iva Buzuk · @ivabuzuk

![Show the product's distinctive job on the landing page](screenshots/22-product-led-landing.png)

Observed: The landing composition uses a short headline, modest explanation, clear actions, and one dominant product view.

57. Keep the current strong headline and restrained composition. Evolve the preview to show a rule, a weakness, and the evidence behind it so visitors understand the investigation, not only the price chart.
58. Offer a small read-only sample walkthrough with selectable findings and clear data provenance. Keep synthetic illustration visibly separate from saved historical results and avoid invented performance claims.

Leave out: Do not copy the retail photography, decorative backdrop, marketing statistics, or a stack of feature cards. The existing landing chart already provides a good focal area.

Implementation touchpoints: [LandingPage.vue](../../apps/web/src/pages/LandingPage.vue), [LandingMarketPreview.vue](../../apps/web/src/components/LandingMarketPreview.vue).

### 23. Preview definitions without losing the current context

Evidence · P2 · New contextual previews · Medium effort

[Collect UI reference](https://collectui.com/designs/hover-state-ui-design-inspiration/f7b95081-aef3-4750-bb98-a00e64122d28) · daniel petho · @nonzeroexitcode

![Preview definitions without losing the current context](screenshots/23-context-preview.png)

Observed: A history entry reveals a nearby preview with author, time, change information, and a link to the full record.

59. Give indicator names and evidence citations a small preview with definition, parameters, source version, and Open details. Make it available on focus and click as well as hover.
60. Keep the preview open while the pointer moves from its trigger into its contents. Use a short hover delay and allow Escape to dismiss; touch users get the same information through a tap.

Leave out: Do not hide important warnings in tooltips or make nested hover menus the only way to inspect evidence.

Implementation touchpoints: [IndicatorCatalogPage.vue](../../apps/web/src/pages/IndicatorCatalogPage.vue), [StrategyTab.vue](../../apps/web/src/components/tabs/StrategyTab.vue), [InvestigationDecision.vue](../../apps/web/src/components/InvestigationDecision.vue).

### 24. Choose one motion language for the whole product

Global · P2 · Consolidate existing motion · Medium effort

[Collect UI reference](https://collectui.com/designs/ui-interaction-ui-design-inspiration/ed7bf928-7a9c-4725-946d-ccb0df09718a) · Emil Kowalski · @emilkowalski

![Choose one motion language for the whole product](screenshots/24-interaction-detail.png)

Observed: The course preview demonstrates several UI transitions, including a feedback form and a mobile sheet. It is a montage, not a measured timing specification.

61. Replace scattered timings with a small set of motion tokens. Use position changes for spatial relationships and opacity for appearance. Do not animate values that readers may interpret as actual results.
62. Use the same enter, dismiss, focus-return, and reduced-motion behavior across evidence sheets, popovers, and review dialogs. Interrupted motion must start from its current visual position.

Leave out: No page-wide blur, springy table rows, mandatory intro sequence, or decorative animation during a consequential confirmation.

Implementation touchpoints: [main.scss](../../apps/web/src/styles/main.scss), [EvidenceTab.vue](../../apps/web/src/components/tabs/EvidenceTab.vue), [FormSelect.vue](../../apps/web/src/components/forms/FormSelect.vue), [FormDatePicker.vue](../../apps/web/src/components/forms/FormDatePicker.vue).

## Motion specification

These timings are proposed starting points. Use a restrained ease-out curve such as cubic-bezier(.2,.8,.2,1) for appearing elements. Start with CSS and Vue transitions already available in the app. A new animation dependency is not required for this pass.

| Interaction | Duration | Behavior | Reduced motion |
| --- | --- | --- | --- |
| Button press | 80 to 100 ms | Translate at most 1 px; keep the hit area fixed. | Immediate pressed state. |
| Row hover and focus | 100 to 140 ms | Change background or border. Rows and columns remain anchored. | Immediate highlight. |
| Workspace tab marker | 160 ms | Move a single underline; no content slide. | Immediate selection. |
| Popover | 140 to 180 ms | Opacity and at most 4 px displacement from the trigger. | Immediate open and close. |
| Inspector open | 200 to 240 ms | Docked detail reveals beside the ledger; mobile sheet enters from its edge. | Immediate layout update. |
| Inspector close | 140 to 180 ms | Dismiss quickly and return focus to the originating row. | Immediate dismiss and focus return. |
| Inline rule editor | 180 to 220 ms | Expand only the edited row. Measure the real content height. | Immediate expansion. |
| Notice | 140 to 180 ms | Short fade with at most 6 px movement. No overshoot. | Immediate notice. |
| Skeleton to result | 100 to 140 ms | Preserve the content footprint. Do not flash a skeleton for already-cached data. | Immediate replacement. |
| Stage completion | 120 to 180 ms | Change one state icon after an engine event. Keep its label anchored. | Immediate state icon. |
| Chart inspection | Immediate | Update crosshair, values, selected interval, and accessible text together. | Same behavior. |
| Comparison values | Immediate | Replace exact values without a count-up. A brief cell highlight may show what changed. | Exact values with no highlight animation. |
| Recorded decision | Immediate after acknowledgement | Show the saved record and timestamp. Do not celebrate a profitable backtest. | Same behavior. |

Do not wait for an animation before registering input, fetching evidence, or displaying a confirmed result. Avoid layout animation across large tables and pause nonessential animation in hidden views.

## Required state coverage

| Workflow | States to verify | Invariant |
| --- | --- | --- |
| Intake and rule review | Untouched, invalid field, submitting, request failed, draft saved, confirmed | Values survive failures; confirmation cannot be bypassed. |
| Court run | Queued, active stage, provider delayed, request failed, invalid result, complete | Execution failure is different from a strategy weakness. |
| Evidence | Not run, no trades, no filter matches, loading details, detail failure, selected | Each has a specific explanation and recoverable action. |
| Variant comparison | No eligible run, draft, running, invalid attempt, complete, limit reached | All attempts stay visible and the baseline never changes silently. |
| Replay and monitoring | Ineligible, ready, running, no new bars, stale check, provider failure | Replay eligibility and last completed-bar date stay explicit. |
| Agent context | Unsupported, disconnected, connected, draft ready, approval required | Connection status never implies approval or engine execution. |
| Decision record | No draft, private draft, validation error, saving, confirmed, superseded | Only confirmed history is eligible for shared output. |
| Shared report | Loading, available, revoked, unavailable, download failed | Never reveal private drafts or imply a link is active before acknowledgement. |

## Finish gate

- Inspect complete flows at desktop width and 390 px width, with keyboard only, 200% text zoom, and reduced motion.
- Verify long strategy names, long error messages, empty lists, many history events, unavailable provider data, and stale selections.
- Open evidence from a finding, change a filter, switch tabs, close the inspector, and use Back. The run and selection must remain coherent.
- Confirm that historical values do not animate through fabricated numbers and that provider errors never become zero-valued results.
- Confirm that drafts stay private, rejected investigations are valid outcomes, and neither shortcuts nor motion bypass confirmation.
- Consolidate style ownership after each workflow pass instead of appending another global override block.

## Research inventory

Category screenshots are a record of the sweep, not an endorsement of every design on those pages.

- [Dashboard](https://collectui.com/designs/dashboard-ui-design-inspiration) · [gallery screenshot](screenshots/category-dashboard.png)
- [Table](https://collectui.com/designs/table-ui-design-inspiration) · [gallery screenshot](screenshots/category-table.png)
- [Analytics Chart](https://collectui.com/designs/analytics-chart-ui-design-inspiration) · [gallery screenshot](screenshots/category-analytics-chart.png)
- [Onboarding](https://collectui.com/designs/onboarding-ui-design-inspiration) · [gallery screenshot](screenshots/category-onboarding.png)
- [Form](https://collectui.com/designs/form-ui-design-inspiration) · [gallery screenshot](screenshots/category-form.png)
- [Date Picker](https://collectui.com/designs/date-picker-ui-design-inspiration) · [gallery screenshot](screenshots/category-date-picker.png)
- [Progress](https://collectui.com/designs/progress-ui-design-inspiration) · [gallery screenshot](screenshots/category-progress.png)
- [Loading](https://collectui.com/designs/loading-ui-design-inspiration) · [gallery screenshot](screenshots/category-loading.png)
- [Notification](https://collectui.com/designs/notification-ui-design-inspiration) · [gallery screenshot](screenshots/category-notification.png)
- [Command Bar](https://collectui.com/designs/command-bar-ui-design-inspiration) · [gallery screenshot](screenshots/category-command-bar.png)
- [Search](https://collectui.com/designs/search-ui-design-inspiration) · [gallery screenshot](screenshots/category-search.png)
- [Filter Products](https://collectui.com/designs/filter-products-ui-design-inspiration) · [gallery screenshot](screenshots/category-filter-products.png)
- [Empty States](https://collectui.com/designs/empty-states-ui-design-inspiration) · [gallery screenshot](screenshots/category-empty-states.png)
- [Error State](https://collectui.com/designs/error-state-ui-design-inspiration) · [gallery screenshot](screenshots/category-error-state.png)
- [Tooltip / Popover](https://collectui.com/designs/tooltip-popover-ui-design-inspiration) · [gallery screenshot](screenshots/category-tooltip-popover.png)
- [Tabs](https://collectui.com/designs/tabs-ui-design-inspiration) · [gallery screenshot](screenshots/category-tabs.png)
- [Accordion](https://collectui.com/designs/accordion-ui-design-inspiration) · [gallery screenshot](screenshots/category-accordion.png)
- [Modal](https://collectui.com/designs/modal-ui-design-inspiration) · [gallery screenshot](screenshots/category-modal.png)
- [AI Flow](https://collectui.com/designs/ai-flow-ui-design-inspiration) · [gallery screenshot](screenshots/category-ai-flow.png)
- [Sidebar](https://collectui.com/designs/sidebar-ui-design-inspiration) · [gallery screenshot](screenshots/category-sidebar.png)
- [Responsive](https://collectui.com/designs/responsive-ui-design-inspiration) · [gallery screenshot](screenshots/category-responsive.png)
- [Landing Page](https://collectui.com/designs/landing-page-ui-design-inspiration) · [gallery screenshot](screenshots/category-landing-page.png)
- [Hover State](https://collectui.com/designs/hover-state-ui-design-inspiration) · [gallery screenshot](screenshots/category-hover-state.png)
- [UI Interaction](https://collectui.com/designs/ui-interaction-ui-design-inspiration) · [gallery screenshot](screenshots/category-ui-interaction.png)

Raw provenance is in selected.json, survey.json, and categories.json. All screenshots are original browser captures at the browser's normal viewport. No application code or deployed state was changed.
