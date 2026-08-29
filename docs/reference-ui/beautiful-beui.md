# Beautiful UI and BeUI reference inventory

Captured on 2026-08-26. This note records visible component structure and interaction behavior from [Beautiful UI](https://www.beautifului.dev/) and [BeUI](https://beui.dev/). It does not reproduce either site's source. The small patterns below are clean-room implementation sketches for this product.

## What to borrow

Beautiful UI is the better reference for the product workspace. It treats AI output as ordinary application data: compact task rows, quiet progress, disclosures, evidence tables, and a prompt bar that stays subordinate to the result. BeUI is useful for motion and control behavior. Its layouts are clean, but the chrome rims and animated marketing effects should not enter this monochrome build.

Shared visual rules worth keeping:

- System sans-serif type, with normal sentence case.
- Near-black page, one slightly lighter panel level, and hairline borders.
- Controls use 8 to 12 pixel radii. Large content panels use 12 to 16 pixels.
- Most separation comes from spacing and 1 pixel borders, not shadow.
- Active state is a lighter fill or a white underline. No colored theme is needed.
- Body copy stays gray. White is reserved for titles, values, and the current action.
- Motion explains a state change. It should not decorate static content.

## Beautiful UI component index

The single-page index contains 20 components:

1. Loading State
2. Thinking
3. Streaming Text
4. Approval Card
5. Tool Chips
6. Task Rows
7. Chat
8. Prompt Bar
9. Recommendation Card
10. Context Cards
11. Diff Table
12. Records Table
13. Filter Table
14. Sidebar Nav
15. Search
16. Flowchart
17. Insight Cards
18. Code Block
19. Fine-tune Card
20. Selection Actions

### Components to use directly as product references

| Product need | Reference | Structure to reuse |
| --- | --- | --- |
| Loading | Loading State | Small inline mark, short verb, elapsed time. Keep it inside the panel that is waiting. |
| Agent reasoning | Thinking | One disclosure row followed by a thin vertical timeline of completed steps. Default to collapsed after completion. |
| Generated analysis | Streaming Text | Stable text column, inline source markers, then actions and follow-up prompts below the answer. |
| Human decision | Approval Card | Direct question, selectable rows, optional custom input, progress count, back/next controls, one final action. |
| Tool activity | Tool Chips | Collapsible summary count, then compact operation rows with result metadata and file diffs. |
| Test execution | Task Rows | Rounded horizontal rows with status mark, task label, right-aligned metadata, and disclosure chevron. |
| Agent rail | Chat | Tab strip at top, message transcript in the middle, composer fixed at the bottom. |
| Prompt/action bar | Prompt Bar | One low, wide composer. Attachment action on the left, send action on the right, secondary selectors inside the same border. |
| Recommended next step | Recommendation Card | One sentence, supporting facts, confidence text, secondary alternatives, then reject/accept actions. |
| Evidence snippets | Context Cards | Retrieved excerpt, source type, filename, and size. Do not add a decorative title if the excerpt is self-explanatory. |
| Proposed changes | Diff Table | Dense table, changed-row tint, short change summary, one apply action. In monochrome, use fill density and strike-through instead of red/green. |
| Evidence ledger | Records Table | Sticky header, compact rows, muted metadata, tags inside cells, horizontal overflow when necessary. |
| Result filters | Filter Table | Status filters above the table with count beside each label. The current filter uses a light fill. |
| Workspace navigation | Sidebar Nav | Persistent narrow rail, grouped destinations, quiet selected row, one primary creation action. |
| Global lookup | Search | Compact trigger expands to a search surface. Show keyboard hint only when it is real. |
| Causal explanation | Flowchart | Bordered nodes, restrained connectors, explicit direction. Avoid decorative graph backgrounds. |
| Summary metrics | Insight Cards | Small set of cards with a value, a plain label, and one supporting sentence. |
| Technical evidence | Code Block | File header, line numbers when useful, copy action, horizontal scroll, no fake terminal chrome. |
| Parameter review | Fine-tune Card | Parameter rows with current value and control. Keep explanation beside the affected value. |
| Bulk actions | Selection Actions | Contextual bar appears only when rows are selected and reports the exact selection count. |

## BeUI component index

### AI agents, 17 components

Message Bubble, Message, Message Scroller, Prompt Input, Todo List, Code Block, Approval Card, File Diff, Tool Result, Streaming Response, Image Generation, Tool Approval, Citations, Agent Activity, Agent Loading States, AI Sidebar, and Chat App.

### Motion components, 40 components

Button, Expandable Control, File Tree, Tilt Card, Animated CTA Buttons, Marquee, Tabs, Switch, Input, Select, Combobox, Checkbox, Radio Group, Bottom Sheet, Pull to Refresh, Shared Layout Background, Bounce Sidebar, Animated Sidebar, Preview Rail, Dock, Tooltip, Animated Context Menu, Popover, Morphing Modal, Center Morph Modal, Text Animation, Number Animation, Animated Badge, Action Swap, Animated Toast Stack, Theme Toggle, Bouncy Accordion, Drawer, Scroll Animation, Range Slider, Wheel Picker, Table, Shader Background, Cylinder Carousel, and Loader.

### Blocks, 22 components

Infinite Masonry, Notification Stack, Project Folder, Fixtures, Availability Scheduler, Multi-chain Swap, Dynamic Island, Command Palette, Morphing Search, Expandable Action Bar, Overflow Actions, Expandable Tabs, Morphing Tabs, Swipeable List, File Upload, Prediction Market, Wallet Card, OTP Input, Sign Up Form, Bloom Menu, Feedback Widget, and 404 / Not Found.

### BeUI patterns that fit this product

| Product need | Reference | Behavior to reuse |
| --- | --- | --- |
| Workspace tabs | Tabs | Support underline and quiet segment variants. Animate only the active indicator with a short spring. |
| Agent prompt | Prompt Input | Auto-growing text area, optional action and model controls below, send becomes stop while work is active. Keep the composer outside the scrolling transcript. |
| Execution plan | Todo List | Collapsible heading with completed count, durable task rows, status mark, optional progress. Collapse automatically only after completion. |
| Agent chronology | Agent Activity | One ordered stream for searches, tool calls, and completed work. Do not expose raw hidden reasoning. |
| Agent side panel | AI Sidebar | Tree or grouped resources on the left, selected content on the right, collapse rail at the edge. For this product, simplify it to tests and evidence groups. |
| Compact utilities | Expandable Action Bar | Icon actions share one compact container and reveal labels on hover or focus. Preserve accessible names when collapsed. |
| Status feedback | Animated Toast Stack | Stack new notices without moving page content. Morph status in place and allow dismissal. Use for saved/exported/failed, not routine navigation. |
| Form controls | Input, Select, Combobox, Checkbox, Radio Group | One neutral border, visible focus ring, direct label above the control, error text below. Avoid floating labels. |
| Tables | Table | Keep the header steady and animate only row insertion, removal, or sort movement. |
| Narrow viewport | Drawer or Bottom Sheet | Move the agent rail into a modal side panel instead of squeezing it beside the primary result. |

## Clean-room structural patterns

These are intentionally small. They capture hierarchy, not site code.

### Neutral button

```html
<button class="button button--primary">Run tests</button>
<button class="button">Cancel</button>
```

```css
.button { height: 36px; padding: 0 14px; border: 1px solid #2a2a2a; border-radius: 9px; background: #171717; color: #ededed; }
.button--primary { background: #ededed; border-color: #ededed; color: #111; }
.button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
```

### Underline tabs

```html
<div class="tabs" role="tablist">
  <button role="tab" aria-selected="true">Evidence</button>
  <button role="tab">Variants</button>
</div>
```

```css
.tabs { display: flex; gap: 22px; border-bottom: 1px solid #262626; }
.tabs button { padding: 12px 0 10px; border: 0; border-bottom: 2px solid transparent; background: none; color: #888; }
.tabs [aria-selected="true"] { border-bottom-color: #f5f5f5; color: #f5f5f5; }
```

### Agent task row

```html
<button class="task-row" aria-expanded="false">
  <span class="task-state" aria-hidden="true"></span>
  <span class="task-name">Walk-forward test</span>
  <span class="task-meta">Running</span>
  <span aria-hidden="true">⌄</span>
</button>
```

```css
.task-row { display: grid; grid-template-columns: 18px 1fr auto 14px; gap: 10px; align-items: center; width: 100%; min-height: 44px; padding: 0 14px; border: 1px solid #2a2a2a; border-radius: 12px; background: #191919; color: #eee; text-align: left; }
.task-meta { color: #8c8c8c; font-size: 13px; }
.task-state { width: 10px; height: 10px; border: 1px solid currentColor; border-radius: 50%; }
```

### Prompt bar

```html
<form class="prompt-bar">
  <button type="button" aria-label="Add context">+</button>
  <textarea aria-label="Message" rows="1" placeholder="Ask about this result"></textarea>
  <button type="submit" aria-label="Send">↑</button>
</form>
```

```css
.prompt-bar { display: grid; grid-template-columns: 32px 1fr 32px; gap: 8px; align-items: end; padding: 8px; border: 1px solid #303030; border-radius: 12px; background: #181818; }
.prompt-bar textarea { min-height: 32px; max-height: 160px; resize: none; border: 0; outline: 0; background: transparent; color: #f2f2f2; font: inherit; }
```

### Evidence table

```html
<div class="table-wrap">
  <table>
    <thead><tr><th>Test</th><th>Result</th><th>Finding</th></tr></thead>
    <tbody><tr><td>Monte Carlo</td><td>Failed</td><td>Drawdown exceeded 18%</td></tr></tbody>
  </table>
</div>
```

```css
.table-wrap { overflow: auto; border: 1px solid #282828; border-radius: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 11px 14px; border-bottom: 1px solid #242424; text-align: left; }
th { color: #888; font-weight: 500; }
tbody tr:hover { background: #181818; }
```

### Agent rail

```css
.workspace { display: grid; grid-template-columns: minmax(0, 1fr) 320px; min-height: 0; }
.agent-rail { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; border-left: 1px solid #262626; background: #121212; }
@media (max-width: 900px) { .workspace { grid-template-columns: 1fr; } .agent-rail { position: fixed; inset: 0 0 0 auto; width: min(92vw, 360px); } }
```

## Product-specific recommendation

Use Beautiful UI's Task Rows for the seven test states, Records Table for evidence, and Prompt Bar for the agent rail. Use BeUI's underline Tabs and Todo List state transitions. The visual contract should remain stricter than either source: only black, white, and neutral gray; no gradients; no chrome rims; no colored status fills; no serif display face; no marketing badge above the intake title.

## Captures

- `beautiful-beui/beautifului-overview.png`
- `beautiful-beui/beautifului-task-rows.png`
- `beautiful-beui/beautifului-prompt-bar.png`
- `beautiful-beui/beautifului-diff-table.png`
- `beautiful-beui/beautifului-records-table.png`
- `beautiful-beui/beui-home.png`
- `beautiful-beui/beui-tabs.png`
- `beautiful-beui/beui-expandable-action-bar.png`
- `beautiful-beui/beui-agents.png`
- `beautiful-beui/beui-prompt-input.png`
- `beautiful-beui/beui-todo-list.png`
- `beautiful-beui/beui-ai-sidebar.png`
