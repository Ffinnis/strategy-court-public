# shadcn/ui reference notes

Source: [ui.shadcn.com](https://ui.shadcn.com/), inspected 2026-08-26. The current site exposes Base UI, React Aria, and Radix variants. These notes describe the shared visual and structural patterns, not React-specific implementation details.

## What to borrow

shadcn works here because it is quiet. Layout comes from spacing, one-pixel borders, and type hierarchy. Components rarely need a shadow or a decorative label.

- Use a system sans-serif stack and normal sentence case.
- Keep the palette neutral: page, panel, subtle panel, border, primary text, muted text.
- Use `1px` borders and roughly `8px` radii. Pills belong to badges and compact segmented controls, not every container.
- Keep controls about `36px` high by default. Icon controls are square.
- Put one filled primary action next to outline or ghost secondary actions.
- Use the same component anatomy in every state. Loading, empty, error, and disabled states should not shift the page.
- Prefer one composed work area over a grid of unrelated cards.

## Screenshot set

| Capture | What it shows |
| --- | --- |
| [button.png](./shadcn/button.png) | Default button and icon button inside a bordered demo frame |
| [field.png](./shadcn/field.png) | Label, input, description, grouped fields, and fieldset hierarchy |
| [tabs.png](./shadcn/tabs.png) | Compact segmented tabs above one content panel |
| [data-table.png](./shadcn/data-table.png) | Toolbar, selection, rows, row actions, selection count, and pagination |
| [empty.png](./shadcn/empty.png) | Centered empty state with one primary and one secondary action |
| [skeleton.png](./shadcn/skeleton.png) | Shape-matched loading placeholders |
| [sheet.png](./shadcn/sheet.png) | Sheet trigger in context |
| [sheet-open.png](./shadcn/sheet-open.png) | Right sheet with overlay, heading, form, footer action, and close control |
| [command.png](./shadcn/command.png) | Command component documentation and grouped list composition |
| [command-open.png](./shadcn/command-open.png) | Command dialog with search, selected row, disabled row, and shortcuts |
| [blocks.png](./shadcn/blocks.png) | Dashboard block shell and preview toolbar |

## Component inventory

### Page shell

The docs shell uses a top navigation, left section navigation, centered content column, and right in-page index. The dashboard block uses `SidebarProvider > AppSidebar + SidebarInset`, then a short site header and one vertical content flow.

For this app:

- Desktop: fixed-width navigation rail, `1px` divider, flexible main column, optional inspector rail.
- Tablet: collapse the navigation to icons and keep the inspector hidden until opened.
- Mobile: replace both rails with sheets. Keep the page title and current action in the top bar.
- Main content uses `max-width`, but tables and charts may fill the available work area.

### Buttons

Variants visible on the reference page: default, outline, secondary, ghost, destructive, link, icon, rounded, spinner, button group, and link-as-button. Sizes include extra small and small.

Use this Vue shape:

```vue
<button
  class="ui-button"
  :class="[`ui-button--${variant}`, `ui-button--${size}`]"
  :disabled="disabled || loading"
>
  <Spinner v-if="loading" aria-hidden="true" />
  <slot />
</button>
```

Keep the label stable while loading. Disabled buttons retain the same border and dimensions, with lower contrast and no pointer events.

### Fields and forms

The current Field component is deliberately composable:

```text
FieldSet
├── FieldLegend
├── FieldDescription
└── FieldGroup
    └── Field
        ├── FieldLabel
        ├── control
        ├── FieldDescription
        └── FieldError
```

Vue markup should preserve that order:

```vue
<fieldset class="field-set">
  <legend>Execution rules</legend>
  <p class="field-set__description">Rules used for every test.</p>

  <div class="field-group">
    <div class="field" :data-invalid="Boolean(error)">
      <label :for="id">Entry condition</label>
      <input :id="id" v-model="value" :aria-describedby="`${id}-help ${id}-error`" />
      <p :id="`${id}-help`">Use a measurable condition.</p>
      <p v-if="error" :id="`${id}-error`" role="alert">{{ error }}</p>
    </div>
  </div>
</fieldset>
```

Do not use placeholder text as the label. Error text sits where help text already lives, so validation does not create a new floating alert.

### Tabs

The reference has compact segmented tabs, a line variant, vertical tabs, icons, and disabled triggers. The anatomy is `Tabs > TabsList > TabsTrigger + TabsContent`.

```vue
<div class="tabs">
  <div class="tabs__list" role="tablist" aria-label="Case sections">
    <button
      v-for="tab in tabs"
      :id="`${tab.id}-tab`"
      role="tab"
      :aria-selected="active === tab.id"
      :aria-controls="`${tab.id}-panel`"
      :disabled="tab.disabled"
      @click="active = tab.id"
    >{{ tab.label }}</button>
  </div>
  <section :id="`${active}-panel`" role="tabpanel" :aria-labelledby="`${active}-tab`">
    <slot :name="active" />
  </section>
</div>
```

Use the line variant for the top-level workspace. Use the compact segmented variant inside a panel. On narrow screens, let the tab list scroll horizontally instead of wrapping labels.

### Cards and items

A card is a semantic group, not the default wrapper for every section. Its parts are header, title, description, optional action, content, and footer. Use Item for compact rows such as recent runs or evidence sources.

```vue
<section class="card">
  <header class="card__header">
    <div><h2>Robustness tests</h2><p>Seven checks run against this version.</p></div>
    <Button variant="outline">Run again</Button>
  </header>
  <div class="card__content"><slot /></div>
</section>
```

Avoid nested cards. Use separators or spacing inside a card.

### Tables

The data-table example combines a filter input, a column-visibility menu, row selection, sortable headers, row actions, selected-row count, and pagination. Status remains text in a normal cell. The table does not turn every value into a badge.

```vue
<div class="table-shell">
  <div class="table-toolbar">
    <Input v-model="query" placeholder="Filter tests..." />
    <Button variant="outline">Columns</Button>
  </div>
  <div class="table-scroll">
    <table>
      <thead>...</thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" :data-state="selected.has(row.id) ? 'selected' : undefined">
          ...
        </tr>
      </tbody>
    </table>
  </div>
  <footer class="table-footer">...</footer>
</div>
```

Keep headers sticky only when the body scrolls. On mobile, preserve columns in a horizontal scroll area or switch to a purpose-built row layout. Do not squeeze a six-column desktop table into stacked label-value cards automatically.

### Alerts and badges

Alerts use icon, title, and description. Use them for a page-level condition that needs attention, not routine field validation. Badges are short status tokens. They have default, secondary, outline, destructive, and link-like variants.

For a monochrome product, distinguish test states by icon, copy, border weight, and fill level. Do not reintroduce a rainbow status system.

### Empty, error, disabled, and loading states

The Empty component has media, title, description, and content. The example centers the group inside the same bordered region used for populated content. It presents one filled action, one outline action, then a quiet text link.

```vue
<div class="empty" role="status">
  <div class="empty__icon" aria-hidden="true"><FolderIcon /></div>
  <h2>No evidence yet</h2>
  <p>Run the case to generate evidence.</p>
  <div class="empty__actions"><Button>Run case</Button></div>
</div>
```

- Loading: use skeletons that match the final title, row, chart, or form shape.
- Empty: explain what is absent and provide the next valid action.
- Error: keep the failed content region in place, add a short reason and retry action.
- Disabled: retain the control and explain prerequisites nearby. Do not hide unavailable workflow steps.

### Sheet and drawer

The Sheet anatomy is trigger, content, header, title, description, and footer. It supports top, right, bottom, and left sides. The open state uses a dim overlay and keeps the close button in the top corner.

Use a right sheet for desktop inspector or case details. Use a bottom drawer for short mobile actions. Do not place a multi-step form in a short drawer.

```vue
<Teleport to="body">
  <div v-if="open" class="overlay" @click.self="open = false">
    <aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <header><h2 id="sheet-title">Test details</h2><p>Inputs and result for this run.</p></header>
      <div class="sheet__body"><slot /></div>
      <footer><Button variant="outline" @click="open = false">Close</Button></footer>
    </aside>
  </div>
</Teleport>
```

Trap focus, close on Escape, restore focus to the trigger, and prevent background scroll.

### Command and prompt areas

Command composition is input, list, empty message, groups, items, separators, and optional keyboard shortcuts. The open example has a selected row and a disabled row. It works for navigation or choosing an action, not for a free-form assistant chat.

For the agent composer, borrow Input Group instead: textarea, leading attachment control, trailing send button, and an inline status line. Keep the composer attached to the activity rail and avoid a large decorative prompt card.

```vue
<form class="composer" @submit.prevent="send">
  <textarea v-model="prompt" aria-label="Message agent" rows="3" />
  <footer>
    <span class="composer__status">{{ status }}</span>
    <Button type="submit" size="icon" :disabled="!prompt.trim()" aria-label="Send"><ArrowUp /></Button>
  </footer>
</form>
```

### Dashboard block

`dashboard-01` is a useful composition reference. Its page order is sidebar, header, metric section, one full-width chart region, then a data table. Spacing changes from `16px` to `24px` at medium widths, while horizontal padding changes from `16px` to `24px` on large screens.

The main lesson is restraint. The shell supplies hierarchy. Individual widgets do not need louder borders, larger headings, or different radii.

## CSS baseline

```css
:root {
  --page: #090909;
  --panel: #0f0f0f;
  --panel-subtle: #151515;
  --border: #292929;
  --text: #fafafa;
  --muted: #a1a1aa;
  --radius: 8px;
}

.ui-button,
input,
textarea,
select {
  min-height: 36px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font: inherit;
}

:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
```

This is a starting point, not a theme layer. Reuse the same tokens across the shell, forms, tables, tabs, and overlays.
