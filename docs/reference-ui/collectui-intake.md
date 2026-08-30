# Strategy creation form

References inspected in the browser on 2026-08-30. The redesign applies to the three-step `/new` case setup flow. It does not change the trading engine or turn prose into executable rules.

## Selected references

### Ownership details by Timothy M.

[CollectUI reference](https://collectui.com/designs/form-ui-design-inspiration/a26881b6-e5d8-4a22-8c09-e9eb23237ef4), [original post](https://x.com/timothymaarv/status/2064643967208026411).

Observed: a narrow vertical progress rail at the left, a restrained section heading, and a focused form column with labels adjacent to the fields. The current step is clear without a large hero occupying the page.

Applied: a compact desktop step rail, consistent form width, smaller headings above the fields, and one reading direction through the form. Did not copy the identity-verification cards, owner avatars, green brand palette or nested containers.

### Add sensor, connection process by DejvDesign

[CollectUI reference](https://collectui.com/designs/form-ui-design-inspiration/cd08289f-9303-4caa-a689-17becd4c8289), [original post](https://x.com/dejvdesign/status/2060388844491460848).

Observed: a three-step creation form with a compact horizontal progress indicator, ordinary individually outlined inputs, and a separated footer containing Back and Continue. The heading does not compete with the form.

Applied: horizontal progress on mobile, individually focused fields, one primary action after the fields, and a quieter Back action. Did not copy the modal overlay, sensor choices, artwork or dashboard behind it.

## Design decisions

- Keep the workflow recognisable: Strategy, Test data, Review.
- Remove the outer form card, duplicate back link, large left heading, repeated step labels and repeated instruction table.
- Use spacing and thin dividers between sections. Shadows belong to controls and popovers, not a large enclosing box.
- Keep the rules example behind an optional disclosure. Opening it does not modify the user's input.
- Reuse the custom symbol select, ticker chips and date picker.
- Show the actual written rules on Review, with edit links and readable dates.
- Explain that creating a case does not start a test or confirm a strategy.
- Keep one content column on mobile and stack date controls when necessary.
- Keep movement out of step transitions. Focus the new heading or the first invalid field.

## Form behavior

Enter advances steps one and two; only the review can create a case. Pending submission disables edits and navigation, and a failed request keeps the form values for retry. Per-field validation now covers the existing UI limits, finite numbers, actual calendar dates and the curated symbol set. API limits and trading semantics are unchanged.

## Verification

- Inspected the first step at 320px, 800px and 1280px, and the data/review steps at 390px and 1280px. No horizontal overflow in those states.
- Checked required-field errors and first-invalid-field focus, the custom symbol list, adding/removing a ticker, the three-/five-year presets, and the custom calendar opening above the date trigger on mobile.
- Invalid capital and commission remained on Review with individual errors. Returning to Strategy preserved the written rules, symbols, dates and execution values.
- Opening the example disclosure left the empty name and rules unchanged.
- Created one local case named `UI QA intake redesign`, ID `dd2110df-5a91-43f3-8ef0-97442738007b`. The workspace preserved the original brief, QQQ and the chosen dates, with no strategy version and no Court run.
- Creation/navigation failure handling was code-reviewed. A saved case ID is retained so retrying a failed navigation does not send another creation request.
- Final `bun run check`: 141 tests pass, 4,438 assertions, all typechecks and production builds pass. `git diff --check` passes.
