import json
from pathlib import Path
from html import escape

ROOT = Path(__file__).parent
PROJECT = ROOT.parents[1]
raw = json.loads((ROOT / 'selected.json').read_text())
survey = json.loads((ROOT / 'survey.json').read_text())

# These are recommendations for Strategy Court, not claims about reference behavior.
notes = [
dict(id=1, title='Keep evidence and its inspector together', area='Evidence', priority='P0', scope='Refine existing inspector', effort='Medium',
 observed='A sensor table stays visible behind a detail sheet containing a chart, measurements, and recent activity.',
 ideas=[
 'At wide widths, offer a docked inspector beside the chart and ledger. Keep the selected row, filters, and scroll position visible. Use the existing overlay on constrained widths.',
 'Make a finding open its exact failure interval or trade. Update the chart highlight, row selection, and inspector heading together. Preserve the existing Selected by agent attribution.',
 'Add previous and next evidence controls that respect the filtered result set. Closing the inspector returns focus to its opening row.',
 'Add a run-scoped selection link for returning to evidence. Resolve case access before selection and never create a public report merely because someone copies a link.'
 ],
 avoid='Do not copy the scenic background, nested metric cards, or sensor branding. The sheet is an independent inspector; its contents can use dividers.',
 files=['components/tabs/EvidenceTab.vue','charts/CandlestickEvidenceChart.vue','stores/evidence.ts','router.ts']),
dict(id=2, title='Give the Court result a stronger reading order', area='Court', priority='P0', scope='Refine existing result header', effort='Small',
 observed='The dark operations dashboard places summary measures above a compact run ledger, with quiet navigation.',
 ideas=[
 'Keep the verdict and primary weakness first, then the most relevant action. Court already has this structure; strengthen its type hierarchy instead of adding another dashboard.',
 'Keep a flat metric strip with aligned values, units, and short explanations. Use tabular numerals and consistent precision. Raise tiny explanatory text before adding decoration.',
 'Separate execution status from strategy assessment. Run complete, strategy failed, and insufficient evidence must remain distinct in text and icons.'
 ],
 avoid='Do not adopt the grid of cards, decorative sparklines, colored status dots alone, or a large return figure that overwhelms the weakness.',
 files=['components/tabs/CourtTab.vue','components/VerdictHeader.vue','components/StatusBadge.vue','styles/main.scss']),
dict(id=3, title='Make long records scannable', area='Audit', priority='P1', scope='Refine tables and history', effort='Medium',
 observed='An audit log aligns activity, author, and timestamp beneath a small filter toolbar and above explicit pagination.',
 ideas=[
 'Offer a compact Audit table for long histories with event, actor, version, and time columns. Keep a disclosure for the rationale and technical proof.',
 'Give Evidence tables sticky headers and a stable identity column. Right-align quantities and currency, and retain units in column labels.',
 'Use explicit result counts and pagination wherever lists are bounded. The existing signals pagination should not be the only list that explains its visible range.'
 ],
 avoid='Do not shrink rows to fit the whole record. Aim for 40 to 44 px rows with readable 13 to 14 px primary text, then test with real long values.',
 files=['components/tabs/AuditTab.vue','components/tabs/EvidenceTab.vue']),
dict(id=4, title='Treat the chart and its controls as one instrument', area='Evidence', priority='P1', scope='Refine existing charts', effort='Medium',
 observed='The analytics page keeps scope, date granularity, comparison, and a value tooltip close to the main chart.',
 ideas=[
 'Unify the active symbol, date range, strategy version, and comparison state in one chart toolbar. Label whether a control changes the view or changes test inputs.',
 'Keep crosshair values immediate, with a keyboard equivalent and a textual selected-point summary. Selection should also identify the related trade or failure.',
 'Keep provider, adjustment policy, retrieval time, and synthetic-data status near the result. Put full snapshot hashes behind Technical proof, while preserving chart attribution.'
 ],
 avoid='Do not import the marketing tutorial cards or imply that a chart range selection reruns the model. Avoid animated chart values that pass through false intermediate numbers.',
 files=['charts/CourtResultChart.vue','charts/CandlestickEvidenceChart.vue','components/tabs/EvidenceTab.vue']),
dict(id=5, title='Help people resume the investigation', area='Strategy', priority='P1', scope='Refine wizard; add resumability', effort='Medium',
 observed='A compact onboarding checklist has completed, current, and remaining steps, with a collapsed summary.',
 ideas=[
 'Keep the existing three-step intake. Add a private resumable draft with a clear Saved locally or Saved to account status. Never store account secrets alongside draft inputs.',
 'Use a small investigation checklist for Rules confirmed, Court completed, Evidence reviewed, and Decision recorded. Record explicit user actions; opening a tab does not prove review.'
 ],
 avoid='No mandatory product tour, completion confetti, or pressure to reach replay. Closing an investigation is a valid destination.',
 files=['pages/CaseIntakePage.vue','components/VerdictHeader.vue','components/InvestigationDecision.vue']),
dict(id=6, title='Edit draft rules where they are read', area='Strategy', priority='P1', scope='Add draft-only inline editing', effort='Large',
 observed='The clip turns a table row into labeled inputs with Cancel and Done, while surrounding rows remain in place.',
 ideas=[
 'Let a draft rule row expand into the existing safe expression controls. Keep the sentence visible beside its period, comparison, and threshold fields.',
 'After editing, show exactly what changed, such as SMA period 120 to 100. Existing confirmed rules stay immutable; revisions go through review and confirmation.',
 'Reserve the expanded row height, retain focus, and preserve unsaved input on a recoverable error. Escape cancels only the current edit and restores the row.'
 ],
 avoid='Do not blur the surrounding ledger as heavily as the reference. Never make a confirmed rule directly editable or quietly spend a variant attempt.',
 files=['components/tabs/StrategyTab.vue','components/tabs/ManualExpressionField.vue','components/tabs/VariantsTab.vue']),
dict(id=7, title='Make the historical range explicit', area='Strategy', priority='P1', scope='Refine existing date controls', effort='Medium',
 observed='A dark date-range selector combines presets, typed start and end values, adjacent calendars, and Apply and Cancel.',
 ideas=[
 'Wrap the existing date inputs in a single range interaction. Use adjacent months on desktop and one month on mobile; keep direct typing and keyboard navigation.',
 'Keep 1, 3, and 5 year presets anchored to the chosen end date. Show the resulting exact dates before applying; do not replace backtest presets with Today or Yesterday.',
 'Show training, evaluation, and holdout boundaries in a small labeled strip wherever those splits exist. A view-only calendar must not unlock unseen evaluation history.'
 ],
 avoid='Do not copy the decorative dotted backdrop, purple glow, or oversized radius. Date validity and market-data coverage need separate explanations.',
 files=['components/forms/FormDatePicker.vue','components/forms/calendar.ts','pages/CaseIntakePage.vue','components/tabs/ProbationTab.vue']),
dict(id=8, title='Report the work the engine is actually doing', area='Court', priority='P0', scope='Refine progress semantics', effort='Medium',
 observed='An activity list distinguishes working, queued, and completed steps, including grouped activities.',
 ideas=[
 'Drive stage completion from explicit engine state. Court currently derives the stage index by dividing percentage progress into seven equal parts; verify that contract before presenting those steps as completed.',
 'Show elapsed time and the current stage. If the provider request is delayed, explain that state and its timeout without inventing an estimated finish time.',
 'Keep a compact run status visible when users switch tabs. Offer navigation back to the run. Add cancellation or pause only if the server can actually stop or pause the job.'
 ],
 avoid='No timer-driven fake percentage, scanning beam, multiple simultaneous spinners, or Copy code-style terminal log by default.',
 files=['components/tabs/CourtTab.vue','pages/CaseWorkspacePage.vue','stores/court.ts']),
dict(id=9, title='Make feedback visible without covering the work', area='Global', priority='P1', scope='Refine existing notices', effort='Small',
 observed='The toast demo shows status variants, actions, stacked messages, and a deduplication control.',
 ideas=[
 'Use one brief notice for a completed reversible action, such as draft saved or citation copied. Deduplicate repeated events and keep the stack away from the primary action and inspector close button.',
 'Keep validation and provider errors at the relevant section until resolved. A toast can announce the failure, but it must not be the only place the recovery action exists.'
 ],
 avoid='No infinite piles of notifications, disappearing critical errors, or optimistic Saved messages before the server acknowledges a durable save.',
 files=['pages/CaseWorkspacePage.vue','components/OwnerShareControls.vue','components/InvestigationDecision.vue']),
dict(id=10, title='Add a command menu after the core flows are polished', area='Global', priority='P2', scope='New optional feature', effort='Medium',
 observed='A command menu groups actions and shows shortcut hints while leaving the document behind it recognizable.',
 ideas=[
 'Add Cmd or Ctrl K for Go to Evidence, Find indicator, Inspect selected trade, and Jump to current run. Start with navigation and the current case rather than building global search infrastructure.',
 'Reflect state in the results. Explain why a command is unavailable and take users to the prerequisite. Confirmation and public-sharing actions still require their normal review UI.'
 ],
 avoid='Do not hide basic navigation in the command menu or let Enter bypass the strategy confirmation boundary.',
 files=['components/AppHeader.vue','pages/CaseWorkspacePage.vue','router.ts']),
dict(id=11, title='Let the history explain why a decision changed', area='Audit', priority='P1', scope='Refine existing timeline', effort='Medium',
 observed='A timeline combines concise activity lines with expanded contextual details and links.',
 ideas=[
 'Show a concise event sentence with human or agent attribution, affected version, and timestamp. Expand the recorded rationale, uncertainty, and citations only when needed.',
 'Add filters for actor, version, and event type. Link confirmation and decision events back to the exact rules or evidence, without exposing private draft text in shared reports.'
 ],
 avoid='Do not turn Audit into a chat transcript or animate old history when the user changes a filter.',
 files=['components/tabs/AuditTab.vue','components/InvestigationDecision.vue','pages/SharedReportPage.vue']),
dict(id=12, title='Keep filters readable after the menu closes', area='Evidence', priority='P1', scope='Refine filters and persist view state', effort='Medium',
 observed='Applied filter pills expose field, operator, and selected values, with a popover for editing one filter.',
 ideas=[
 'Add compact applied filters for symbol, trade outcome, signal status, and date range. Show the result count beside them and keep Clear filters visible.',
 'Use plain text such as Symbol is SPY and Outcome is Loss. Preserve exact data values and use sentence case for labels.',
 'Preserve filter and sort state when switching tabs or closing an inspector. When there are no matches, explain the active constraints rather than suggesting the run produced no evidence.'
 ],
 avoid='Do not expose a generic query builder if the available filters fit one small menu. Avoid nesting a filter card inside a table card.',
 files=['components/tabs/EvidenceTab.vue','stores/evidence.ts','pages/IndicatorCatalogPage.vue']),
dict(id=13, title='Give every empty state a truthful next step', area='Global', priority='P0', scope='Refine existing empty states', effort='Small',
 observed='A simple empty view pairs a specific explanation with one direct action.',
 ideas=[
 'Distinguish No run yet, No trades generated, No filter matches, Invalid run, and Evidence unavailable. These require different messages and actions.',
 'Route the action to the missing prerequisite. Examples include Review rules, Open Court, Clear filters, and Retry evidence. Keep the user in the same case.',
 'Treat a recorded rejection as a completed investigation. Show the rationale and revisit criteria, with no sad illustration or invitation to keep optimizing until something passes.'
 ],
 avoid='Do not copy the file-cabinet illustration or use No data for every failure. Existing indicator filter recovery is a useful baseline to extend.',
 files=['components/tabs/EvidenceTab.vue','components/tabs/VariantsTab.vue','components/tabs/ProbationTab.vue','components/InvestigationDecision.vue']),
dict(id=14, title='Make errors part of the form layout', area='Strategy', priority='P0', scope='Refine existing validation', effort='Small',
 observed='The login clip adds an error message immediately above the same form without replacing its fields.',
 ideas=[
 'Keep values after a failed submit and focus the first invalid field. Intake already does much of this; use the same behavior in custom indicator, variant, and decision forms.',
 'Explain the constraint next to the field, for example End date must follow start date. Use a summary for request-wide failures and an explicit retry action.',
 'Reserve space for common validation messages so the primary button does not move out from under the pointer. Combine text and an icon; keep the monochrome palette.'
 ],
 avoid='Do not reproduce the red glow, shake the whole form, erase user input, or treat invalid data as a successful result with zero values.',
 files=['pages/CaseIntakePage.vue','pages/IndicatorCatalogPage.vue','components/tabs/VariantsTab.vue','components/InvestigationDecision.vue']),
dict(id=15, title='Make version context available before switching', area='Audit', priority='P1', scope='Extend existing version selector', effort='Medium',
 observed='A version-history popover contains a version number, timestamp, change summary, Compare, and Details.',
 ideas=[
 'Extend the version selector with the recorded hypothesis, confirmation state, associated run, and evaluation-informed status. Keep a concise current version label in the header.',
 'Offer Compare with baseline and Exact rule changes from that context, reusing the current comparison and diff data.',
 'Keep all attempted variants in creation order and show the three-attempt limit. A failed or invalid attempt remains part of the record.'
 ],
 avoid='Do not copy the large decorative timeline or imply that selecting an earlier version restores unseen evaluation data.',
 files=['components/VerdictHeader.vue','components/tabs/VariantsTab.vue','components/tabs/AuditTab.vue']),
dict(id=16, title='Animate the selected tab, not the whole workspace', area='Global', priority='P2', scope='Refine existing tab transition', effort='Small',
 observed='The clip moves and reshapes a selected navigation highlight between adjacent items.',
 ideas=[
 'Borrow the continuity of one moving marker. Keep Strategy Court\'s line tabs and animate the underline for about 160 ms, with no gooey deformation or bright fill.',
 'Preserve the current keyboard tab model, active selection, and sensible scroll position. Content should appear immediately; do not slide an entire evidence table across the screen.'
 ],
 avoid='No bouncy text, expanding tab widths, or motion that delays keyboard navigation. Reduced motion uses an immediate state change.',
 files=['pages/CaseWorkspacePage.vue']),
dict(id=17, title='Make a variant comparison answer a question', area='Variants', priority='P0', scope='Refine existing comparison', effort='Medium',
 observed='A compact comparison list expands one entry into metric details while preserving the other entries.',
 ideas=[
 'Keep Baseline and Variant visible and add a signed Difference column to the existing summary table. Label percentage points versus percent change and avoid a universal higher-is-better treatment.',
 'Expand a measure to show its calculation, observation period, and related verdict. Use paired bars only where a shared scale is meaningful; the exact values remain primary.',
 'Keep the hypothesis and exact rule change beside the result. Preserve all attempts and the existing full comparison; do not turn the interface into a best-return leaderboard.'
 ],
 avoid='No composite confidence score, rainbow series, animated ranking, or green winner treatment based on return alone.',
 files=['components/tabs/VariantsTab.vue','services/strategyVariantControls.ts']),
dict(id=18, title='Tie each finding to a visible piece of evidence', area='Court', priority='P1', scope='Extend finding links', effort='Medium',
 observed='The scanner demo highlights parts of the input and lists the items it flagged.',
 ideas=[
 'Give each Court finding an Inspect evidence action that selects its recorded trade or failure interval. The existing ledger displays findings, measures, and thresholds; make that chain navigable.',
 'Highlight the relevant rule operand, interval, or cost assumption after selection. Explain the observed fact and its implication using returned evidence, not invented causal claims.'
 ],
 avoid='Reject the scanner beam, staged reveal of already-computed results, and arbitrary risk score. Only borrow the connection between a finding and its source.',
 files=['components/tabs/CourtTab.vue','components/tabs/EvidenceTab.vue','components/InvestigationDecision.vue']),
dict(id=19, title='Show what the agent did and what needs the user', area='Court', priority='P1', scope='Refine agent context', effort='Medium',
 observed='The agent clip presents named tasks, an active operation, a completed count, and an associated artifact.',
 ideas=[
 'Use a compact activity disclosure for actual WebMCP operations, their results, and selected evidence. Show tool facts rather than fabricated thoughts, tokens, or cost estimates.',
 'Separate Agent connected, Draft ready, Waiting for your confirmation, and Engine running. Make the required human approval explicit beside the reviewed rules.'
 ],
 avoid='Do not add an agent marketplace, always-visible chat rail, pause button without support, or a second progress system competing with the engine status.',
 files=['components/AgentRail.vue','components/VerdictHeader.vue','webmcp/useWebMcp.ts','pages/CaseWorkspacePage.vue']),
dict(id=20, title='Use navigation density only when the product needs it', area='Global', priority='P2', scope='Future library navigation', effort='Medium',
 observed='The sidebar study compares expanded and collapsed navigation with grouped destinations and account controls at the bottom.',
 ideas=[
 'If a multi-case library is added, give it a compact case rail with active case, recent investigations, and a clear collapse control. Keep the existing six workspace tabs for sections within a case.',
 'Use consistent icon sizes, text baselines, active fills, and keyboard focus. A collapsed rail needs accessible names and focus-triggered labels.'
 ],
 avoid='Do not add a permanent sidebar solely because the reference looks polished. Avoid icon-only navigation for the primary investigation steps.',
 files=['components/AppHeader.vue','pages/CaseWorkspacePage.vue','router.ts']),
dict(id=21, title='Recompose mobile screens around the next decision', area='Global', priority='P0', scope='Refine responsive behavior', effort='Medium',
 observed='The paired layouts preserve headline, explanation, actions, and product preview while moving them into a single mobile column.',
 ideas=[
 'On a narrow Court screen, keep verdict, primary weakness, and next action above metrics and charts. Preserve reading order; do not merely shrink the desktop layout.',
 'Use a full-height evidence sheet when its content is long. Keep the title and close control visible, respect safe areas, and return focus and scroll to the selected row.',
 'Keep data tables horizontally scrollable with a pinned identity column where practical. Preserve labels and units instead of hiding important columns or turning every cell into a card.'
 ],
 avoid='No permanently tiny controls, hover-only information, or fixed action bar that covers the last row. Test 390 px width and 200% text zoom.',
 files=['pages/CaseWorkspacePage.vue','components/tabs/CourtTab.vue','components/tabs/EvidenceTab.vue','components/tabs/VariantsTab.vue']),
dict(id=22, title='Show the product\'s distinctive job on the landing page', area='Landing', priority='P1', scope='Refine existing preview', effort='Medium',
 observed='The landing composition uses a short headline, modest explanation, clear actions, and one dominant product view.',
 ideas=[
 'Keep the current strong headline and restrained composition. Evolve the preview to show a rule, a weakness, and the evidence behind it so visitors understand the investigation, not only the price chart.',
 'Offer a small read-only sample walkthrough with selectable findings and clear data provenance. Keep synthetic illustration visibly separate from saved historical results and avoid invented performance claims.'
 ],
 avoid='Do not copy the retail photography, decorative backdrop, marketing statistics, or a stack of feature cards. The existing landing chart already provides a good focal area.',
 files=['pages/LandingPage.vue','components/LandingMarketPreview.vue']),
dict(id=23, title='Preview definitions without losing the current context', area='Evidence', priority='P2', scope='New contextual previews', effort='Medium',
 observed='A history entry reveals a nearby preview with author, time, change information, and a link to the full record.',
 ideas=[
 'Give indicator names and evidence citations a small preview with definition, parameters, source version, and Open details. Make it available on focus and click as well as hover.',
 'Keep the preview open while the pointer moves from its trigger into its contents. Use a short hover delay and allow Escape to dismiss; touch users get the same information through a tap.'
 ],
 avoid='Do not hide important warnings in tooltips or make nested hover menus the only way to inspect evidence.',
 files=['pages/IndicatorCatalogPage.vue','components/tabs/StrategyTab.vue','components/InvestigationDecision.vue']),
dict(id=24, title='Choose one motion language for the whole product', area='Global', priority='P2', scope='Consolidate existing motion', effort='Medium',
 observed='The course preview demonstrates several UI transitions, including a feedback form and a mobile sheet. It is a montage, not a measured timing specification.',
 ideas=[
 'Replace scattered timings with a small set of motion tokens. Use position changes for spatial relationships and opacity for appearance. Do not animate values that readers may interpret as actual results.',
 'Use the same enter, dismiss, focus-return, and reduced-motion behavior across evidence sheets, popovers, and review dialogs. Interrupted motion must start from its current visual position.'
 ],
 avoid='No page-wide blur, springy table rows, mandatory intro sequence, or decorative animation during a consequential confirmation.',
 files=['styles/main.scss','components/tabs/EvidenceTab.vue','components/forms/FormSelect.vue','components/forms/FormDatePicker.vue']),
]

motion = [
 ['Button press', '80 to 100 ms', 'Translate at most 1 px; keep the hit area fixed.', 'Immediate pressed state.'],
 ['Row hover and focus', '100 to 140 ms', 'Change background or border. Rows and columns remain anchored.', 'Immediate highlight.'],
 ['Workspace tab marker', '160 ms', 'Move a single underline; no content slide.', 'Immediate selection.'],
 ['Popover', '140 to 180 ms', 'Opacity and at most 4 px displacement from the trigger.', 'Immediate open and close.'],
 ['Inspector open', '200 to 240 ms', 'Docked detail reveals beside the ledger; mobile sheet enters from its edge.', 'Immediate layout update.'],
 ['Inspector close', '140 to 180 ms', 'Dismiss quickly and return focus to the originating row.', 'Immediate dismiss and focus return.'],
 ['Inline rule editor', '180 to 220 ms', 'Expand only the edited row. Measure the real content height.', 'Immediate expansion.'],
 ['Notice', '140 to 180 ms', 'Short fade with at most 6 px movement. No overshoot.', 'Immediate notice.'],
 ['Skeleton to result', '100 to 140 ms', 'Preserve the content footprint. Do not flash a skeleton for already-cached data.', 'Immediate replacement.'],
 ['Stage completion', '120 to 180 ms', 'Change one state icon after an engine event. Keep its label anchored.', 'Immediate state icon.'],
 ['Chart inspection', 'Immediate', 'Update crosshair, values, selected interval, and accessible text together.', 'Same behavior.'],
 ['Comparison values', 'Immediate', 'Replace exact values without a count-up. A brief cell highlight may show what changed.', 'Exact values with no highlight animation.'],
 ['Recorded decision', 'Immediate after acknowledgement', 'Show the saved record and timestamp. Do not celebrate a profitable backtest.', 'Same behavior.'],
]

states = [
 ['Intake and rule review', 'Untouched, invalid field, submitting, request failed, draft saved, confirmed', 'Values survive failures; confirmation cannot be bypassed.'],
 ['Court run', 'Queued, active stage, provider delayed, request failed, invalid result, complete', 'Execution failure is different from a strategy weakness.'],
 ['Evidence', 'Not run, no trades, no filter matches, loading details, detail failure, selected', 'Each has a specific explanation and recoverable action.'],
 ['Variant comparison', 'No eligible run, draft, running, invalid attempt, complete, limit reached', 'All attempts stay visible and the baseline never changes silently.'],
 ['Replay and monitoring', 'Ineligible, ready, running, no new bars, stale check, provider failure', 'Replay eligibility and last completed-bar date stay explicit.'],
 ['Agent context', 'Unsupported, disconnected, connected, draft ready, approval required', 'Connection status never implies approval or engine execution.'],
 ['Decision record', 'No draft, private draft, validation error, saving, confirmed, superseded', 'Only confirmed history is eligible for shared output.'],
 ['Shared report', 'Loading, available, revoked, unavailable, download failed', 'Never reveal private drafts or imply a link is active before acknowledgement.'],
]

priorities = [
 ['1. Reading and trust', 'P0', 'Readable text, distinct error and empty states, honest run stages, stable mobile hierarchy.', 'Users can explain the verdict and recover from a failure without guessing.'],
 ['2. Evidence continuity', 'P0 then P1', 'Finding-to-inspector links, synchronized chart selection, baseline differences, usable history.', 'A user can cite the exact evidence behind a recorded decision and return to it.'],
 ['3. Input and feedback', 'P1', 'Draft editing, date ranges, resume state, applied filters, bounded notices.', 'Edits do not lose work or change a confirmed strategy silently.'],
 ['4. Motion and shortcuts', 'P2', 'Shared motion tokens, contextual previews, command menu; case rail only if a library is built.', 'Every effect survives keyboard use, interruption, and reduced motion.'],
]

for n, r in zip(notes, raw):
    assert int(r['id'][:2]) == n['id']
    n['ref_id'] = r['id']
    n['url'] = r['url']
    n['screenshot'] = r['screenshot']
    n['attribution'] = r['text'].split('L (Like)\n', 1)[-1].split('\n\nView on X', 1)[0].replace('\n\n', ' · ')
    if n['id'] == 9:
        n['screenshot'] = 'screenshots/09-notification-active.png'
    if n['id'] == 14:
        n['screenshot'] = 'screenshots/14-validation-later.png'
    n['alternates'] = [f'screenshots/{p.name}' for p in sorted((ROOT / 'screenshots').glob(r['id']+'-later.png')) if f'screenshots/{p.name}' != n['screenshot']]
    n['files'] = ['apps/web/src/'+p for p in n['files']]

idea_count = sum(len(n['ideas']) for n in notes)
intro = 'Make every finding inspectable. Strategy Court should let someone move from a weakness to its chart interval, trades, assumptions, and recorded decision without losing context.'
method = 'Browser research on 31 August 2026. Surveyed the first result pages of 24 relevant Collect UI categories and closely inspected 24 individual designs. This is a curated sweep, not an exhaustive review of the whole site. The live landing page and repository informed the application notes. Authenticated workflows were inspected in source code, not exercised in this session.'
limits = 'Static references establish composition, not usability. Several references are autoplay videos; the saved images include selected frames. Proposed timings below are design recommendations, not measurements of those clips. A browser asset export for one video failed, so the guide links to the original motion references rather than claiming to include offline video. Source artwork belongs to its creators and is included here for internal reference, not as licensed application assets.'
contract = [
 'Preserve the monochrome palette, primary system sans-serif typeface, sentence case, and flat layout. No uppercase micro-labels or decorative monospace. Tickers, IDs, code, and established acronyms retain their proper form.',
 'Use a 4 px spacing rhythm, 8 to 10 px control radii, and dividers for related data. A card must represent an independent object or interaction. Reserve depth for temporary overlays.',
 'Start review at 14 px primary body text and 12 px secondary labels; do not make critical evidence 9 px. Use tabular numerals for comparisons. These are proposed targets, not a claim that every current screen uses tiny text.',
 'Statuses need text and distinct icons. Keep measured values, unknown values, invalid runs, and unavailable evidence visibly different. Never infer financial reliability from visual polish.',
 'Keep focus rings visible, ordinary controls comfortably operable by touch, and important explanations available without hover. Preserve 200% text zoom and reduced motion.',
]
findings = [
 'The existing product already has a three-step intake, line tabs with keyboard navigation, an evidence inspector with focus restoration, agent selection attribution, comparison tables, rule diffs, a decision record, and reduced-motion CSS. Keep these foundations.',
 'Court finding rows currently display result, finding, observed measure, and threshold, while the header Evidence action changes tabs. Direct finding-to-evidence navigation is the clearest next interaction to investigate.',
 'Court derives the active stage from percentage progress using equal seventh-sized buckets. An explicit stage-state contract would make the visual checklist easier to trust.',
 'Some Court and shared style rules use 9 to 11 px metadata, and main.scss contains successive override layers for cards, shadows, and motion. A focused typography pass and token cleanup would make future refinement more predictable.',
 'The variant summary already has Baseline and Variant columns, with full comparison and rule changes below. Improve that existing structure with meaningful differences and context instead of replacing it with a leaderboard.',
]

def table_md(headers, rows):
    return '\n'.join(['| '+' | '.join(headers)+' |', '| '+' | '.join(['---']*len(headers))+' |'] + ['| '+' | '.join(r)+' |' for r in rows])

md = ['# Strategy Court design reference guide', '', intro, '', f'{len(notes)} selected references · {idea_count} concrete applications · {len(motion)} motion specifications · 58 browser screenshots', '', '[Open the visual guide](index.html)', '', '## Scope and evidence', '', method, '', limits, '', '## What the repository already tells us', '']
md += ['- '+s for s in findings]
md += ['', '## The design contract to keep', ''] + ['- '+s for s in contract]
md += ['', '## Implementation order', '', table_md(['Pass','Priority','Work','Acceptance'],priorities), '', 'Effort labels on references are relative implementation scope. They are not delivery estimates. P0 means foundational polish in this guide, not a production incident severity.', '', '## Selected references and applications', '']
number=0
for n in notes:
    md += [f"### {n['id']:02d}. {n['title']}", '', f"{n['area']} · {n['priority']} · {n['scope']} · {n['effort']} effort", '', f"[Collect UI reference]({n['url']}) · {n['attribution']}", '', f"![{n['title']}]({n['screenshot']})", '', 'Observed: '+n['observed'], '']
    for idea in n['ideas']:
        number+=1
        md += [f'{number}. {idea}']
    md += ['', 'Leave out: '+n['avoid'], '', 'Implementation touchpoints: '+', '.join(f'[{Path(p).name}](../../{p})' for p in n['files'])+'.', '']
md += ['## Motion specification', '', 'These timings are proposed starting points. Use a restrained ease-out curve such as cubic-bezier(.2,.8,.2,1) for appearing elements. Start with CSS and Vue transitions already available in the app. A new animation dependency is not required for this pass.', '', table_md(['Interaction','Duration','Behavior','Reduced motion'],motion), '', 'Do not wait for an animation before registering input, fetching evidence, or displaying a confirmed result. Avoid layout animation across large tables and pause nonessential animation in hidden views.', '', '## Required state coverage', '', table_md(['Workflow','States to verify','Invariant'],states), '', '## Finish gate', '', '- Inspect complete flows at desktop width and 390 px width, with keyboard only, 200% text zoom, and reduced motion.', '- Verify long strategy names, long error messages, empty lists, many history events, unavailable provider data, and stale selections.', '- Open evidence from a finding, change a filter, switch tabs, close the inspector, and use Back. The run and selection must remain coherent.', '- Confirm that historical values do not animate through fabricated numbers and that provider errors never become zero-valued results.', '- Confirm that drafts stay private, rejected investigations are valid outcomes, and neither shortcuts nor motion bypass confirmation.', '- Consolidate style ownership after each workflow pass instead of appending another global override block.', '', '## Research inventory', '', 'Category screenshots are a record of the sweep, not an endorsement of every design on those pages.', '']
md += [f"- [{s['name']}]({s['url']}) · [gallery screenshot]({s['screenshot']})" for s in survey]
md += ['', 'Raw provenance is in selected.json, survey.json, and categories.json. All screenshots are original browser captures at the browser\'s normal viewport. No application code or deployed state was changed.', '']
(ROOT/'README.md').write_text('\n'.join(md))
(ROOT/'recommendations.json').write_text(json.dumps(notes,ensure_ascii=False,indent=2))

def list_html(items):
    return '<ul>'+''.join('<li>'+escape(x)+'</li>' for x in items)+'</ul>'
def table_html(headers,rows):
    return '<div class="table-scroll"><table><thead><tr>'+''.join('<th>'+escape(x)+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+escape(x)+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table></div>'

records=[]
number=0
for n in notes:
    ideas=[]
    for idea in n['ideas']:
        number+=1
        ideas.append(f'<li><span class="idea-number">{number:02d}</span><span>{escape(idea)}</span></li>')
    extra=''
    if n['alternates']:
        extra='<details class="frame-details"><summary>Another captured frame</summary>'+''.join(f'<a href="{escape(p)}" target="_blank"><img src="{escape(p)}" loading="lazy" alt="Another frame from {escape(n["title"])}"></a>' for p in n['alternates'])+'</details>'
    records.append(f'''<article class="reference" id="ref-{n['id']}" data-area="{n['area']}" data-priority="{n['priority']}">
      <div class="reference-visual"><a href="{n['screenshot']}" target="_blank" title="Open full-size screenshot"><img src="{n['screenshot']}" loading="lazy" width="1280" height="720" alt="Collect UI reference: {escape(n['title'])}"></a>
      <div class="source"><a href="{n['url']}" target="_blank" rel="noreferrer">Open original reference ↗</a><span>{escape(n['attribution'])}</span></div>{extra}</div>
      <div class="reference-copy"><div class="reference-meta"><span>{n['id']:02d} / {n['area']}</span><span class="priority">{n['priority']}</span><span>{n['effort']} effort</span></div>
      <h3>{escape(n['title'])}</h3><p class="scope">{escape(n['scope'])}</p><p class="observation">{escape(n['observed'])}</p><ol class="ideas">{''.join(ideas)}</ol>
      <details><summary>What to leave out and where to implement</summary><p>{escape(n['avoid'])}</p><div class="files">{''.join('<code>'+escape(p)+'</code>' for p in n['files'])}</div></details></div></article>''')

html = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Strategy Court · Collect UI reference guide</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#ededf0;background:#0b0b0c;font-synthesis:none;--line:#2c2c30;--muted:#a8a8b0;--ease:cubic-bezier(.2,.8,.2,1)}*{box-sizing:border-box}body{margin:0}a{color:inherit;text-underline-offset:4px}button,input,select{font:inherit}button,select{cursor:pointer}button:disabled{cursor:default}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #fff;outline-offset:4px}button{border:1px solid #44444a;border-radius:8px;color:#eee;background:#19191c;padding:10px 14px}button:hover{background:#29292d}button.primary{background:#eeeeef;color:#111;border-color:#eeeeef}h1,h2,h3,p{margin-top:0}p,li{line-height:1.65}h1{font-size:clamp(38px,5vw,68px);line-height:1.05;letter-spacing:-.045em;max-width:1000px;font-weight:600;margin-bottom:24px}h2{font-size:28px;line-height:1.2;letter-spacing:-.025em;font-weight:600}h3{font-size:24px;line-height:1.2;letter-spacing:-.025em;font-weight:600;margin:14px 0 8px}.shell{max-width:1500px;margin:0 auto;padding:0 40px}.topbar{height:66px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);gap:20px;font-size:14px}.topbar nav{display:flex;gap:20px}.topbar a{text-decoration:none;color:#b5b5bb}.hero{padding:74px 0 42px}.hero>p{max-width:850px;color:#b6b6bd;font-size:19px}.byline{font-size:13px;color:var(--muted);margin-bottom:22px}.counts{display:flex;flex-wrap:wrap;gap:14px 28px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:18px 0;color:#b9b9bf;font-size:14px}.counts strong{color:#f7f7f7;font-size:22px;font-weight:550;margin-right:5px}.overview{display:grid;grid-template-columns:1.3fr 1fr;gap:60px;padding:40px 0}.overview p{color:#b6b6bd}.overview li{margin-bottom:10px;color:#b6b6bd}.overview details{margin-bottom:14px}summary{cursor:pointer;color:#e1e1e5;padding:12px 0;line-height:1.4}details p,details li{font-size:14px;color:#b2b2bb}details ul{padding-left:20px}.section{padding:42px 0;border-top:1px solid var(--line);scroll-margin-top:90px}.section>p{max-width:920px;color:var(--muted)}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px;line-height:1.5}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:15px 16px 15px 0}th{font-weight:500;color:#9e9ea7}td{color:#d5d5db}td:first-child{color:#f1f1f3;min-width:150px}.filterbar{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:16px 0;background:#0b0b0c;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.filterbar label{display:flex;align-items:center;gap:8px;font-size:13px;color:#c1c1c8}.filterbar input,.filterbar select{height:40px;border:1px solid #3b3b41;border-radius:8px;background:#161619;color:#eee;padding:0 12px}.search-label{flex:1;min-width:240px}.search-label input{width:100%}.filterbar output{margin-left:auto;color:var(--muted);font-size:13px}.reference{display:grid;grid-template-columns:1.15fr 1fr;gap:38px;padding:42px 0;border-bottom:1px solid var(--line);scroll-margin-top:90px}.reference[hidden]{display:none}.reference-visual img{display:block;width:100%;height:auto;border:1px solid #303034;border-radius:8px;background:#151515}.source{display:flex;gap:16px;flex-wrap:wrap;justify-content:space-between;padding-top:12px;font-size:12px;color:#9e9ea9;line-height:1.5}.source a{color:#d0d0d6}.reference-meta{display:flex;align-items:center;gap:12px;color:#a2a2aa;font-size:12px}.priority{display:inline-block;padding:3px 7px;border:1px solid #46464d;border-radius:5px;color:#ededf0;font-weight:600}.scope{font-size:13px;color:#a2a2aa}.observation{font-size:14px;color:#92929d;border-left:2px solid #34343b;padding-left:12px;margin:18px 0}.ideas{list-style:none;padding:0;display:grid;gap:14px}.ideas li{display:flex;align-items:baseline;gap:14px;font-size:14px;color:#d4d4dc;line-height:1.6}.idea-number{font-size:12px;font-variant-numeric:tabular-nums;color:#7d7d89;flex:0 0 22px}.reference-copy details{border-top:1px solid #292930;font-size:13px;margin-top:22px}.files{display:grid;gap:6px;margin-bottom:16px}.files code{font-family:inherit;overflow-wrap:anywhere;color:#92929d;font-size:12px}.frame-details{margin-top:12px;font-size:13px}.frame-details img{margin-top:10px}.no-results{padding:50px 0;color:#bdbdc8}.gallery-list{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 30px}.gallery-list a{font-size:14px;color:#bcbcc5}.foot{padding:40px 0 70px;color:#8f8f99;font-size:13px}.foot a{color:#d7d7dd}.lab-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:22px 0 16px}.lab-toolbar label{font-size:13px;color:#bcbcc5;margin-left:auto}.lab{border-top:1px solid #41414a;border-bottom:1px solid #41414a;background:#101013}.lab-head{display:flex;justify-content:space-between;gap:12px;padding:18px 22px;border-bottom:1px solid #2b2b34;font-size:13px}.lab-grid{display:grid;grid-template-columns:minmax(0,1fr) 0fr;transition:grid-template-columns 220ms var(--ease)}.lab.selected{--selected:1}.lab.selected .lab-grid{grid-template-columns:minmax(0,1fr) minmax(240px,.48fr)}.lab-main{padding:22px;min-width:0}.lab-chart{width:100%;height:180px;display:block}.chart-band{opacity:0;transition:opacity 140ms ease}.selected .chart-band{opacity:1}.lab-row{display:grid;grid-template-columns:26px 1fr auto;gap:10px;width:100%;text-align:left;background:none;border:0;border-top:1px solid #2d2d35;border-radius:0;font-size:13px;padding:16px 8px;transition:background 120ms ease}.lab-row[aria-pressed=true]{background:#29292f}.lab-inspector{overflow:hidden;min-width:0;border-left:0;opacity:0;transition:opacity 160ms ease}.selected .lab-inspector{border-left:1px solid #33333b;opacity:1}.lab-inspector>div{padding:22px;min-width:240px}.lab-inspector h3{font-size:20px}.lab-inspector p{font-size:13px;color:#b3b3bd}.lab-inspector dl{font-size:13px}.lab-inspector dl>div{border-top:1px solid #303038;padding:12px 0}.lab-inspector dt{color:#9494a2;margin-bottom:5px}.lab-inspector dd{margin:0;color:#e8e8ec}.lab-caption{font-size:12px;color:#9999a6;margin:12px 0 0}.lab-status{padding:14px 22px;border-top:1px solid #2b2b34;color:#b7b7c1;font-size:13px;min-height:48px}.lab.selected .lab-chart polyline{stroke:#f3f3f4}.reduced *, .reduced *::after{transition:none!important;animation:none!important}.flow{display:flex;gap:0;margin:20px 0 28px;flex-wrap:wrap}.flow span{padding:10px 16px 10px 0;color:#b4b4bd;font-size:14px}.flow span:not(:last-child)::after{content:'→';margin-left:16px;color:#6e6e79}input[type=checkbox]{accent-color:#ddd;width:16px;height:16px;vertical-align:middle}#references{scroll-margin-top:20px}.current img{width:100%;height:auto;border-radius:8px;border:1px solid #333;margin-top:8px}@media(max-width:1050px){.shell{padding:0 24px}.reference{grid-template-columns:1fr;gap:24px}.reference-visual{max-width:880px}.overview{gap:30px}.gallery-list{grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){table{min-width:760px}.shell{padding:0 16px}.topbar{height:auto;padding:18px 0;flex-wrap:wrap}.topbar nav{gap:14px;font-size:12px}.hero{padding:44px 0 30px}.hero>p{font-size:17px}.overview{grid-template-columns:1fr;padding-top:28px}.reference{padding:30px 0}.filterbar{position:relative}.filterbar label{width:100%}.filterbar select{flex:1}.filterbar output{margin:0}.lab-toolbar label{margin-left:0;width:100%}.lab.selected .lab-grid{grid-template-columns:1fr}.lab-inspector{display:none}.lab.selected .lab-inspector{display:block;border-left:0;border-top:1px solid #333}.lab-head{flex-direction:column}.lab-row{grid-template-columns:20px 1fr}.lab-row>span:last-child{grid-column:2}.gallery-list{grid-template-columns:1fr}h2{font-size:25px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}}@media print{body{background:white;color:black}.shell{padding:0}.topbar,.filterbar,.lab-toolbar{display:none}.reference{break-inside:avoid;grid-template-columns:1fr 1fr}.reference[hidden]{display:grid}.reference-copy,.ideas li,td,p{color:#111!important}a{color:#111}details{display:block}.section{break-before:auto}}
</style></head><body><div class="shell"><header class="topbar"><strong>Strategy Court / Design research</strong><nav><a href="#priorities">Priorities</a><a href="#lab">Interaction sketch</a><a href="#references">References</a><a href="#motion">Motion</a></nav></header>
<main><section class="hero"><div class="byline">Collect UI research · 31 August 2026</div><h1>Make every finding<br>inspectable.</h1><p>Connect the weakness, chart interval, trade details, and recorded decision. Then polish the controls and motion around that path.</p><div class="flow"><span>Finding</span><span>Chart interval</span><span>Trade and assumptions</span><span>Recorded decision</span></div><div class="counts"><span><strong>24</strong> selected designs</span><span><strong>__IDEAS__</strong> concrete applications</span><span><strong>13</strong> motion specifications</span><span><strong>58</strong> browser screenshots</span></div></section>
<section class="overview"><div><h2>Build on the product we have</h2><p>The dark, flat interface already fits the work. Keep its restraint. Spend the next pass on evidence continuity, readable comparisons, and clear recovery from failures.</p>__FINDINGS__</div><div><details open><summary>Research scope and limitations</summary><p>__METHOD__</p><p>__LIMITS__</p></details><details><summary>The design contract to preserve</summary>__CONTRACT__</details><details class="current"><summary>Current live landing page</summary><img src="screenshots/strategy-court-current.png" alt="Current Strategy Court landing page" loading="lazy"></details><p><a href="README.md">Read the complete Markdown guide ↗</a></p></div></section>
<section class="section" id="priorities"><h2>Implementation order</h2><p>P0 means foundational polish here, not an incident severity. Effort labels describe relative scope, not promised delivery times.</p>__PRIORITIES__</section>
<section class="section" id="lab"><h2>Try the evidence interaction</h2><p>This is a proposed interaction sketch, not a screenshot of the application. All chart points and findings below are illustrative. Nothing is fetched, tested, traded, or saved.</p><div class="lab-toolbar"><button class="primary" id="inspect-cost">Inspect cost stress</button><button id="inspect-trades">Inspect sparse trades</button><button id="clear-lab">Clear selection</button><label><input id="reduce-motion" type="checkbox"> Reduce motion</label></div>
<div class="lab" id="evidence-lab"><div class="lab-head"><span>Illustrative investigation · Draft interaction</span><span>Finding selection</span></div><div class="lab-grid"><div class="lab-main"><svg class="lab-chart" viewBox="0 0 720 180" role="img" aria-label="Illustrative chart with a selected interval, not historical strategy data"><g stroke="#282830"><path d="M0 35H720M0 85H720M0 135H720"/></g><rect class="chart-band" id="chart-band" x="345" y="12" width="135" height="150" fill="rgba(255,255,255,.07)"/><polyline fill="none" stroke="#a8a8b5" stroke-width="2" points="0,140 30,125 60,130 95,102 120,116 155,96 180,104 210,74 245,82 280,63 315,80 345,57 380,83 415,116 450,101 485,93 520,70 555,79 590,53 625,58 660,32 695,38 720,25"/></svg><button class="lab-row" data-demo="cost" aria-pressed="false"><span>!</span><span>Execution resilience</span><span>Inspect cost assumptions →</span></button><button class="lab-row" data-demo="trades" aria-pressed="false"><span>?</span><span>Evidence sufficiency</span><span>Inspect trade coverage →</span></button></div><aside class="lab-inspector" aria-label="Illustrative evidence details" inert aria-hidden="true"><div><div class="reference-meta">Selected evidence</div><h3 id="lab-title">Cost assumptions</h3><p id="lab-description">The selected finding stays connected to the chart and its originating row.</p><dl><div><dt>Source</dt><dd>Illustrative data only</dd></div><div><dt>Next step</dt><dd id="lab-next">Review the cost assumptions</dd></div></dl><button id="cite-demo">Preview citation</button></div></aside></div><div class="lab-status" id="lab-status" role="status" aria-live="polite">Select a finding. The chart, row, and detail view will update together.</div></div><p class="lab-caption">Proposed motion: 220 ms panel reveal, 120 ms row highlight, immediate evidence content. Reduced motion removes movement. Real implementation must use the existing run-scoped selection store.</p></section>
<section class="section" id="references"><h2>The selected references</h2><p>Each reference separates the observed pattern from the changes proposed for Strategy Court. Open a screenshot at full size, or follow the source to view its original motion.</p><div class="filterbar"><label class="search-label">Find<input id="search" type="search" placeholder="Try inspector, error, typography…"></label><label>Workflow<select id="area"><option value="all">All workflows</option>__AREAS__</select></label><label>Priority<select id="priority"><option value="all">All priorities</option><option>P0</option><option>P1</option><option>P2</option></select></label><output id="result-count" aria-live="polite">24 references</output></div><div id="reference-list">__RECORDS__</div><p id="no-results" class="no-results" hidden>No references match these filters. <button id="reset-filters">Clear filters</button></p></section>
<section class="section" id="motion"><h2>Motion specifications</h2><p>These are proposed starting points, not measurements from the reference clips. A restrained ease-out curve and existing Vue and CSS transitions are enough for the first pass.</p>__MOTION__<p style="margin-top:20px">Do not delay input, reveal results on a timer, count through invented financial values, or animate large tables. Repeated interactions should be quiet and interruptible.</p></section>
<section class="section"><h2>The states that need equal care</h2>__STATES__</section><section class="section"><h2>Finish gate</h2><p>Review the complete workflow at desktop and 390 px width, with keyboard only, 200% text zoom, and reduced motion. Use long names, invalid inputs, absent data, provider failures, stale selections, and many history events.</p><p>A user should be able to open evidence from a finding, change a filter, switch tabs, return to the same selection, and record a cited decision. Private drafts must remain private and shortcuts must not bypass confirmation.</p><p>Consolidate the shared styling after each workflow pass. Do not append another layer of global overrides to simulate consistency.</p></section>
<section class="section"><details><summary>Browse all 24 category screenshots</summary><div class="gallery-list">__GALLERIES__</div></details></section></main><footer class="foot">Research and recommendations only. No application code or deployed state changed. Source artwork remains the property of its creators.<br><a href="selected.json">Source provenance</a> · <a href="recommendations.json">Structured recommendations</a> · <a href="README.md">Markdown guide</a></footer></div>
<script>
const search=document.querySelector('#search'),area=document.querySelector('#area'),priority=document.querySelector('#priority'),refs=[...document.querySelectorAll('.reference')];function filter(){const q=search.value.trim().toLowerCase();let count=0;for(const r of refs){const show=(!q||r.textContent.toLowerCase().includes(q))&&(area.value==='all'||r.dataset.area===area.value)&&(priority.value==='all'||r.dataset.priority===priority.value);r.hidden=!show;if(show)count++;}document.querySelector('#result-count').textContent=count+' reference'+(count===1?'':'s');document.querySelector('#no-results').hidden=!!count;}[search,area,priority].forEach(e=>e.addEventListener('input',filter));document.querySelector('#reset-filters').addEventListener('click',()=>{search.value='';area.value='all';priority.value='all';filter();search.focus();});
const lab=document.querySelector('#evidence-lab'),status=document.querySelector('#lab-status'),data={cost:{title:'Cost assumptions',description:'This selected interval is linked to the execution-resilience finding. The inspector keeps its source visible.',next:'Review the recorded fee and slippage assumptions',x:345,width:135},trades:{title:'Trade coverage',description:'The selected finding points to a sparsely sampled interval. A full result would explain the actual sample and threshold.',next:'Inspect the trades behind the sufficiency finding',x:110,width:120}};function selectEvidence(kind){const d=data[kind];lab.classList.add('selected');document.querySelector('.lab-inspector').inert=false;document.querySelector('.lab-inspector').setAttribute('aria-hidden','false');document.querySelector('#lab-title').textContent=d.title;document.querySelector('#lab-description').textContent=d.description;document.querySelector('#lab-next').textContent=d.next;document.querySelector('#chart-band').setAttribute('x',d.x);document.querySelector('#chart-band').setAttribute('width',d.width);document.querySelectorAll('[data-demo]').forEach(e=>e.setAttribute('aria-pressed',e.dataset.demo===kind));status.textContent=d.title+' selected. The chart interval, row, and inspector share one selection.';}document.querySelector('#inspect-cost').addEventListener('click',()=>selectEvidence('cost'));document.querySelector('#inspect-trades').addEventListener('click',()=>selectEvidence('trades'));document.querySelectorAll('[data-demo]').forEach(e=>e.addEventListener('click',()=>selectEvidence(e.dataset.demo)));document.querySelector('#clear-lab').addEventListener('click',()=>{lab.classList.remove('selected');document.querySelector('.lab-inspector').inert=true;document.querySelector('.lab-inspector').setAttribute('aria-hidden','true');document.querySelectorAll('[data-demo]').forEach(e=>e.setAttribute('aria-pressed','false'));status.textContent='Selection cleared. The ledger and chart stay in place.';});document.querySelector('#reduce-motion').addEventListener('change',e=>lab.classList.toggle('reduced',e.target.checked));document.querySelector('#cite-demo').addEventListener('click',()=>{status.textContent='Citation preview: '+document.querySelector('#lab-title').textContent+' · illustrative source. No decision or citation was saved.';});
</script></body></html>'''
replacements = {'__IDEAS__':str(idea_count),'__FINDINGS__':list_html(findings),'__METHOD__':escape(method),'__LIMITS__':escape(limits),'__CONTRACT__':list_html(contract),'__PRIORITIES__':table_html(['Pass','Priority','Work','Acceptance'],priorities),'__AREAS__':''.join('<option>'+a+'</option>' for a in sorted({n['area'] for n in notes})),'__RECORDS__':''.join(records),'__MOTION__':table_html(['Interaction','Duration','Behavior','Reduced motion'],motion),'__STATES__':table_html(['Workflow','States to verify','Invariant'],states),'__GALLERIES__':''.join(f'<a href="{s["screenshot"]}" target="_blank">{escape(s["name"])} ↗</a>' for s in survey)}
for a,b in replacements.items():html=html.replace(a,b)
(ROOT/'index.html').write_text(html)
print(json.dumps({'references':len(notes),'ideas':idea_count,'motion_specs':len(motion),'categories':len(survey),'screenshots':len(list((ROOT/'screenshots').glob('*.png')))}))
