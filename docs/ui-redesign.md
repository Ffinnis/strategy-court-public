# UI contract

The interface is monochrome and uses the native system sans-serif stack. There are no theme colors, display fonts, decorative labels, gradients, glows, stamps, paper metaphors, or promotional microcopy.

## Reference structure

- beUI and shadcn: compact navigation, centered hierarchy, plain primary and secondary actions.
- Transitions.dev: restrained pill controls and evenly spaced component surfaces.
- Beautiful UI: quiet side rail, dense operational panels, low-contrast borders.
- Rare UI: one large focal surface rather than many competing cards.

## Rules

- Backgrounds: `#090909`, `#111111`, `#171717`.
- Text: white and neutral gray only.
- Font: `Inter, ui-sans-serif, system-ui`; no remote font import.
- Radius: 7–10px for controls and surfaces, pills only for compact filters or status.
- Copy names the task directly. No decorative courtroom language.
- One primary action per view. Secondary actions are outlined or quiet.
- Status remains legible through text, icons, fill, and borders—not color.
- Loading, empty, error, disabled, and narrow-screen states must remain usable.

## Component decisions

The source inventories are in [`reference-ui/beautiful-beui.md`](reference-ui/beautiful-beui.md), [`reference-ui/transitions-rare.md`](reference-ui/transitions-rare.md), and [`reference-ui/shadcn.md`](reference-ui/shadcn.md), with 38 local screenshots beside them.

| App surface | Reference pattern |
| --- | --- |
| Main navigation | shadcn compact shell |
| Workspace navigation | shadcn line tabs; no boxed tab strip |
| Intake form | shadcn FieldSet → FieldGroup → Field order |
| Test progress | Beautiful UI task rows with stable state icons |
| Evidence | Beautiful UI records table and shadcn data table toolbar |
| Agent context | Beautiful UI quiet side rail |
| Detail inspection | shadcn right sheet; bottom drawer on narrow screens |
| Loading | Transitions.dev same-footprint skeleton/content reveal |
| Validation | Rare UI/Transitions one-shot restrained shake only on failed submit |

The app does not import showcase gradients, colored chrome, marketing badges, bouncing decoration, or glow effects from the references.
