# Motion and UI details

The previously revised visual references are now approved. This pass adds six candidates that extend their attention to proportion, spacing, surface detail, and controlled color. These new candidates are recommendations, not an assumption of further user approval.

Open `index.html` through the local research server for the original videos. The board has pause, restart, a time input, and a full-frame option. The videos require internet access. Twelve saved screenshots show the original CollectUI pages and enlarged detail presentations.

## The six picks

| Reference | Visual or animated detail | Strategy Court application | Recommendation |
| --- | --- | --- | --- |
| [Tactile tabs, Marcel](https://collectui.com/designs/tabs-ui-design-inspiration/38080c55-3c72-426c-bfe2-5d690d24a4fc) | Fine edge shading, a stronger active label, and an indicator moving along a shared baseline | Court, Evidence, Trades, and Audit navigation in `apps/web/src/pages/CaseWorkspacePage.vue` | Use first. Keep a solid indicator and omit the source halo |
| [Expanding list, Jeet](https://collectui.com/designs/list-items-ui-design-inspiration/8b22f858-287f-4796-915b-42c69b8963f3) | Animated panel height, an inset mode switch with a moving white thumb, and a compact contextual action | Additional test results, parameters, or non-critical details within an inspector | Use first. Keep severe findings visible and give icon switches accessible labels |
| [Notification stack, Benji Taylor](https://collectui.com/designs/notification-ui-design-inspiration/2efe178b-f7dc-4e01-bef0-12fd41a31909) | New notifications settle in front while older ones recede in scale and contrast | Export complete, link copied, parameters saved, background run complete | Use first. Keep errors in a persistent record and cap the visible stack |
| [Button-to-menu transformation, Lorenzo Cabra](https://collectui.com/designs/dropdown-ui-design-inspiration/f6ea1705-2356-410a-b075-89cef5384d21) | A black pill expands into its own menu through one continuous boundary | A secondary Create action for a new case, import, or duplicated setup | Prototype. Reduce the source overshoot and preserve immediate activation |
| [Tick dial, Lorenzo Cabra](https://collectui.com/designs/range-slider-ui-design-inspiration/9db4fdea-16a2-465c-9637-90b8ee6e65fd) | A radial field of fine ticks surrounds one exact value; its active arc responds to changes | One bounded advanced setting such as test coverage or resampling budget | Prototype. Pair it with numeric entry and a keyboard-friendly linear alternative |
| [Pixel ripple button, Raul](https://collectui.com/designs/button-ui-design-inspiration/5582e784-9066-4c33-9af4-8bf144ca9e14) | A localized wave passes through small cells beneath a stable label | First-run onboarding or a replay action | Optional accent. Keep it monochrome or within one existing accent, with no continuous glow |

## Proposed motion specification

These numbers are starting points for our implementation. They were not measured from the source videos. Test them in the actual application and adjust using real interaction feedback.

| Interaction | Starting behavior | Timing to test | Required fallback |
| --- | --- | --- | --- |
| Tab selection | Move one shared indicator; update active text without scaling it | 160 to 200 ms, decelerating, no bounce | Instant selection with reduced motion |
| Inset mode switch | Move the selected thumb; swap the associated content without moving the surrounding page | 140 to 180 ms | Text or an accessible name identifies each mode |
| List disclosure | Animate the disclosure region; preserve the first visible row and focus | 200 to 260 ms for size, 100 to 140 ms for content opacity | Immediate reveal; no hidden severe findings |
| Toast arrival | Translate about 8 px and fade in; move older notifications into a shallow stack | 220 to 280 ms; at most a small settle | Static toast, polite announcement, persistent activity entry |
| Button-to-menu | Expand the trigger boundary and reveal the menu inside it | 220 to 280 ms; low overshoot | Immediate menu with normal keyboard behavior |
| Dial adjustment | Follow the pointer immediately; snap to the chosen step on release | Immediate drag; 100 to 160 ms settle if needed | Numeric input, keyboard steps, explicit minimum and maximum |
| Pixel response | A short local wave contained under the label | About 250 to 350 ms, then stop | Ordinary hover or pressed fill |
| Button press | Briefly reduce the shadow and translate the control by no more than 1 px | 70 to 100 ms down, 100 to 140 ms return | No motion; unchanged hit target |
| Inspector expansion | Animate from the selected row or anchor and keep the selected evidence visible | 180 to 240 ms | Immediate opening with focus management |
| Completion mark | Replace the busy mark with a check after confirmed completion | 140 to 180 ms | Static check plus explicit completion text |

The last three rows are our proposed supporting details, not additional CollectUI source discoveries. They should help the selected patterns feel consistent across the app.

## Where the polish should come from

Start with the workspace navigation, notification behavior, and a single run inspector. Their repeated use makes them better first investments than a decorative effect on a rarely visited screen.

Keep the existing primary sans-serif and sentence case. Use tabular numerals for values. Give buttons a precise edge and a clear pressed state. Keep borders fine, optical alignments consistent, and the active state legible without relying on motion. An independent inspector may have a softly separated frame; ordinary sections and table rows do not need extra cards.

The more expressive menu, dial, and ripple belong on a few deliberate controls. They should not become the default treatment for every button, filter, or number. The references' gradients, halos, background dot patterns, social avatars, uppercase labels, and monospaced decorative text are not part of the proposed app design.

## Interaction requirements

- Activation must not wait for animation to finish. Rapid changes should interrupt and continue from the current visual state.
- Preserve focus on open, close, expansion, and removal. Keyboard use must reach the same actions as pointer use.
- Respect `prefers-reduced-motion`. Show the same final information immediately; do not hide state changes.
- Keep financial values, chart geometry, and test outcomes accurate. Decorative motion must never imply a result the system has not confirmed.
- Do not animate every table row, keep a permanent shimmer running, or use falling digits on live financial values.
- Make notification errors persistent. Pause dismissal during hover or focus, and announce routine updates without stealing focus.
- Prefer opacity and transforms for movement. Where an expansion needs size changes, keep them local. Profile the pixel effect before reuse across multiple controls.
- Keep sound off by default. The menu source mentions sound, but this research verified its visual behavior only.

## Research and validation

The sources were inspected in the in-app Browser, then presented as original videos in the local board. The screenshots ending in `-source.jpg` capture CollectUI. The screenshots ending in `-detail.jpg` capture the enlarged presentation with application notes. No source artwork was recreated or retouched. Detail view intentionally enlarges the central component; Full frame shows the entire video.

All six videos loaded and could be paused and seeked through the visible controls. Their durations and inspected timestamps are in `verification.json`. Desktop checks at 1280 by 720 found no horizontal overflow. This is not an accessibility or mobile audit of the source concepts, and the recordings do not prove how their underlying implementations behave.

The screened-out examples included a cursor-tracking tooltip demo with weak presentation, glow-heavy loading treatments, a generic marketing tab transition, and a receipt animation whose media did not load. They are not included in the shortlist.

No application code was modified. The work is ready to inform a focused UI implementation pass.
