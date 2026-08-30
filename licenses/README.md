# Vendored dependency notices

These dependencies omit the full license text from their npm packages. The files here preserve their upstream licenses verbatim and retain the original copyrights. They are not covered by Strategy Court's copyright notice.

| File | Applies to installed versions | Upstream source |
| --- | --- | --- |
| `fancy-canvas.txt` | fancy-canvas 2.1.0 | https://github.com/tradingview/fancy-canvas/blob/master/LICENSE |
| `better-auth-utils.txt` | @better-auth/utils 0.4.2 and 0.5.0 | https://github.com/better-auth/utils/blob/main/LICENSE |
| `vue-devtools-api.txt` | @vue/devtools-api 6.6.4 | https://github.com/vuejs/devtools-v6/blob/df6ab6bb7791a7a525a97990de73b3ea5e9a1941/LICENSE |

`bun scripts/third-party-notices.ts` prints a notice file from the installed production dependency graph. Review that output after dependency changes and update `apps/web/public/third-party-notices.txt`. `bun run notices:check` detects stale or missing notices without changing files. Build checks do not fetch license text from the network.
