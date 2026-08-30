# Header and brand references

Inspected in the browser on 2026-08-30. The references informed the header's composition and disclosure behavior. No third-party brand asset was copied.

## Highframe by Hamza A.

[CollectUI header gallery](https://collectui.com/designs/header-navigation-ui-design-inspiration), item “Website exploration for b2b client” by [Hamza A.](https://collectui.com/designers/HamzaInstantly). [Original post](https://x.com/HamzaInstantly/status/2030756114157998111).

Visible: a compact brand at the left, a single row of plain navigation, one action at the right, and a thin divider separating navigation from the product content. The expanded product navigation occupies one continuous plane.

Applied: one flat horizontal header, distinct brand/navigation/action groups, consistent page gutters, one creation action, and a continuous mobile navigation panel. The primary content stays close to the header. Did not copy the green branding, serif headline, illustrations, customer logos or unrelated product menu.

## Navigation menu by tom

[CollectUI navigation gallery](https://collectui.com/designs/navigation-ui-design-inspiration), item “navigation menu with some animations” by [tom](https://collectui.com/designers/tomm_ui). [Original post](https://x.com/tomm_ui/status/2058210377478082853).

Visible: an unboxed row of navigation labels, a restrained local hover treatment, and an anchored disclosure with a shadow. The menu is distinct from the surrounding page without enclosing every navigation label in its own permanent card.

Applied: quiet link treatments, a single anchored account disclosure, and a single mobile navigation disclosure. Menus close on Escape, outside interaction and navigation. Did not copy the nested promotional tile, animated movement or hosting-product copy.

## Design contract

- The brand identifies the product; navigation orients the user; “New strategy” is the main action.
- Keep one monochrome header. No status micro-label, ornamental card, oversized megamenu or all-caps copy.
- Mobile navigation must expose the same destinations rather than merely hide desktop links.
- Header and workspace sticky tabs share one height token, including at tablet widths.
- Preserve authentication, protected-route redirects, WebMCP lifetime, sign-out recovery and the skip link.
- The logo is a new imagegen concept, manually redrawn as two SVG paths. The deployed asset contains no raster image, filter, font or remote dependency.

## Logo files

- `apps/web/public/brand/strategy-court-mark.svg`: transparent white mark for the header.
- `apps/web/public/favicon.svg`: the same paths on a dark favicon background.
- `docs/reference-ui/strategy-court-logo-concept.png`: generated concept, retained for reference only.
- [Generation prompt](strategy-court-logo-prompt.md): exact built-in imagegen prompt and production changes.

## Verification

- Checked signed-out and signed-in headers, the authentication page, strategy creation, indicator navigation and a draft case in the browser.
- Inspected 320px, 390px, 800px and 1280px layouts. No horizontal overflow in the inspected states.
- Mobile navigation and account disclosures are mutually exclusive; Escape restores trigger focus, outside interaction dismisses them, and navigation closes them.
- Expanding the viewport while the mobile trigger is focused moves focus to the visible brand link, with the menu both open and closed.
- At 800px, a scrolled case keeps the header at 0px and workspace tabs at 64px. Desktop uses the shared 72px offset. Header disclosures render above the tabs.
- Sign-out success/failure paths were code-reviewed, not executed, to preserve the existing account session. Native Tab traversal could not be conclusively exercised through the in-app browser automation; the disclosures use ordinary links and buttons without a focus trap.
- `bun run check`: 130 tests pass, all typechecks and production builds pass. `git diff --check` passes.
