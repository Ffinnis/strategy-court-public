# Transitions.dev and Rare UI reference inventory

Research date: 2026-08-26

Sources: [Transitions.dev](https://transitions.dev/) and [Rare UI](https://www.rareui.com/). Screenshots are in [`docs/reference-ui/transitions-rare/`](./transitions-rare/).

## What is worth borrowing

Transitions.dev keeps the product chrome quiet and lets each interaction demo explain itself. The useful pattern is a compact header, a short heading, a horizontal filter row, and a dense card grid. Each card has one live state, a plain title, a one-line description, and a copy action. Detail pages use a left index and three tabs: Preview, CSS, React.

Rare UI uses the same basic discipline on component pages. A persistent component index sits beside one large demo. The documentation follows in a fixed order: purpose, dependencies, interaction, props, install command, usage, source. The home and index pages use large preview tiles, but the component itself remains the focus.

For this project, take the component proportions and state handling. Do not take the orange accents, gradient demos, oversized marketing type, or ornamental physics effects. The requested UI should stay black, white, and gray.

## Transitions.dev inventory

### Structure and controls

- Header: wordmark, three primary links, command search, one paid action, GitHub count, overflow menu.
- Hero: one direct heading, two-sentence maximum description, primary and secondary action.
- Filters: semantic tablist with All, Essential, AI Agents, Effects, Texts, Pro. A separate menu handles sort order.
- Gallery: one live prototype per article. The title and description sit below the demo. Copy is an icon action, not a large CTA.
- Detail page: collapsible documentation index, previous and next controls, title, one-line description, Preview/CSS/React tabs, then one large isolated demo.
- Search: command dialog with a text field, Escape hint, and listbox results.

### All listed transition components

| Group | Components |
| --- | --- |
| Layout and navigation | Card resize, Menu dropdown, Modal open/close, Panel reveal, Gooey plus menu, Page side-by-side, Card stack hover, Tabs sliding, Dropdown menu morph, Accordion, Banner stacking |
| Status and feedback | Notification badge, Success check, Error state shake, Skeleton loader and reveal, Toast open/close, Checkbox check, Spinner to check morph, Toggle, Thinking states, Matrix dot loader, Image generation placeholder |
| Text and numbers | Number pop-in, Text states swap, Input clear with dissolve, Texts reveal, Shimmer text, Organic shimmer, Spinning counter, Pro gradient text, Reasoning stream, Streaming text |
| Buttons and direct manipulation | Icon swap, Avatar group hover, Drag and drop with physics, Tooltip open/close, 3D tilt, Like button, Learn more hover, Get Pro button |
| Decorative or destructive | Confetti burst, Image open tilt, Delete with smoky dissolve |

### Patterns to reuse

Sliding tabs use a real `tablist`. A separate pill sits behind the buttons. Measure the active tab and animate only `transform` and `width`.

```css
.tabs { position: relative; display: inline-flex; padding: 3px; }
.tabs__pill {
  position: absolute;
  inset-block: 3px;
  transform: translateX(var(--tab-x));
  width: var(--tab-width);
  transition: transform 250ms cubic-bezier(.22,1,.36,1), width 250ms cubic-bezier(.22,1,.36,1);
}
```

Skeletons stack the placeholder and content in the same grid area. This avoids a layout jump. On reveal, cross-fade opacity and reduce a very small blur. Pulse the placeholder children, not the wrapper, so the reveal can control wrapper opacity.

```css
.swap > * { grid-area: 1 / 1; }
.swap__content { opacity: 0; filter: blur(2px); }
.swap[data-ready="true"] .swap__skeleton { opacity: 0; filter: blur(2px); }
.swap[data-ready="true"] .swap__content { opacity: 1; filter: none; }
```

Toast motion is asymmetric. Opening lasts about 350ms, closing about 250ms. The useful part is a small 16px rise and 0.97 scale, not a large bounce.

```css
.toast { opacity: 0; transform: translateY(16px) scale(.97); transition: 250ms cubic-bezier(.22,1,.36,1); }
.toast[data-open="true"] { opacity: 1; transform: none; transition-duration: 350ms; }
```

Validation keeps border width constant and changes only color. An error message owns its own opacity and visibility. The optional shake should stay within 6px and run once.

Card resize works because the outer element owns the size transition while inner states cross-fade. It does not animate `height: auto` blindly. Measure the target or use a layout animation library.

Every pattern has a `prefers-reduced-motion` fallback. Keep that rule.

## Rare UI inventory

### Structure and controls

- Header: wordmark, Home, Components, GitHub count, theme toggle. On mobile, links collapse behind one menu button.
- Home: direct headline, short description, copyable install command, Quick Start link, then a preview grid.
- Component index: grouped sections with counts. Cards play previews on hover, but their titles remain ordinary links.
- Detail page: component sidebar, install, description, source and theme actions in a compact top bar. The main column starts with a live demo and then documents the component.
- Props: simple three-column data table. Code and enum values use inline code styling.
- Install: package-manager tabs, one command, one copy button.
- Mobile: the global navigation becomes one menu button, the component sidebar closes behind a trigger, and cards become one column.

### All listed components

| Category | Components | Useful behavior |
| --- | --- | --- |
| Display | Folder component, Code Block, Gravity Letters, GitHub activity, Step player | Hierarchical reveal, readable code, progress playback, activity data |
| AI kit | Fluid Orb, Grid Reveal | Processing placeholder and generated-output reveal |
| Navigation | Bounce sidebar, Proximity Sidebar, Scroll Progress | Active item tracking and long-document progress |
| Inputs | Duration Picker, OTP Input | Constrained numeric entry, paste and autofill, success and error states |
| Feedback | Emoji reaction, Notification bell | Lightweight reaction and unread-count feedback |

### Patterns to reuse

The component page shell is a good fit for a strategy workspace: a narrow index, one clear content column, and a utility row for copy, install, or source actions. Do not place every control in a card.

Duration Picker has a compact read state and an expanded edit state. It focuses the first field on edit, clamps invalid input, calls `onChange` while typing, and reserves `onConfirm` for save. That split is useful for numeric strategy parameters.

OTP Input is a complete form-state reference. It supports controlled and uncontrolled values, paste, mobile autofill, arrow keys, Backspace, disabled, success, error, and `onComplete`. The accessible version exposes one textbox per slot with position labels.

```tsx
<OtpInput
  length={6}
  status={status}
  onChange={() => setStatus("idle")}
  onComplete={verifyCode}
/>
```

Bounce Sidebar accepts headings and selectable rows in one item list. Its active marker skips headings and moves by measured row position. For a restrained monochrome UI, replace the bouncing dot with a 2px white rail or a quiet gray pill.

Notification Bell treats zero as absence, caps large counts, and supports both count and dot variants. It exposes the unread total through a status label. The number change rolls inside a fixed badge so the layout does not move.

Code Block separates content from framing. `showFrame`, `showHeader`, line numbers, highlighted lines, filename, and copy action are independent. Use that idea for evidence snippets: content should remain readable even when all decoration is removed.

## Component contract for the monochrome rebuild

- Font: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Palette: page `#0a0a0a`, raised surface `#111111`, hover `#171717`, border `#262626`, main text `#fafafa`, muted text `#a1a1aa`.
- Radius: 8px for fields and buttons, 12px for main panels, full radius only for tabs, badges, and avatars.
- Border: 1px. Never stack two bordered wrappers unless one is an input inside a larger panel.
- Button heights: 36px compact, 40px default. Primary is white with black text. Secondary is transparent with a gray border.
- Motion: 160 to 250ms for direct controls, 300 to 400ms for content reveal. Use `cubic-bezier(.22,1,.36,1)`. Animate opacity and transforms first.
- Focus: 2px visible ring with 2px offset. Do not rely on color alone.
- States: every data component needs loading, empty, populated, and error. Use the same footprint for skeleton and content when possible.
- Responsive: collapse side navigation behind a trigger below 768px. Let filter tabs scroll horizontally. Change grids to one column without shrinking interactive targets below 40px.

## Screenshot index

### Transitions.dev

- `transitions-home.png`: full gallery and page structure
- `transitions-home-mobile.png`: mobile header, filters, and single-column prototypes
- `transitions-card-resize.png`: detail shell and resize preview
- `transitions-tabs-sliding.png`: measured pill tabs
- `transitions-skeleton-loader-and-reveal.png`: loading to content swap
- `transitions-error-state-shake.png`: validation feedback
- `transitions-toast-open-close.png`: transient feedback

### Rare UI

- `rareui-home.png`: home hero, install command, preview grid
- `rareui-components.png`: grouped component index
- `rareui-components-mobile.png`: collapsed navigation and mobile index
- `rareui-duration-picker.png`: constrained numeric input
- `rareui-otpinput.png`: complete input states
- `rareui-notificationbell.png`: badge state and controls
- `rareui-bouncesidebar.png`: active navigation marker
- `rareui-codeblock.png`: framed data and copy action
