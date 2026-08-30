# Third-party materials and data provenance

The root [MIT license](../LICENSE) covers original Strategy Court code, documentation, and generated synthetic test data. It does not relicense third-party dependencies or grant rights to market data fetched by a deployment.

| Material | Location | Source and treatment |
| --- | --- | --- |
| Lightweight Charts | Installed frontend dependency; candle and evidence charts | TradingView, Apache-2.0. Preserve its license, copyright notice, and user-visible TradingView link. The app's Chart attribution link supplies the notice and license. |
| Synthetic fixtures | `packages/fixtures/market-data/synthetic-snapshot.json` | Original fixed-seed generator in `packages/fixtures/src/synthetic-market.ts`. No external prices or calibration data. Symbol names are example labels; dates are fictional weekday sessions, not an exchange calendar. MIT. |
| Landing chart sample | `apps/web/src/data/syntheticLandingMarket.ts` | Generated from the synthetic snapshot. Visible and accessible copy identifies it as a demo, not actual QQQ prices or investment evidence. MIT. |
| Design research | `docs/reference-ui/*.md` | Original observations and links to the source websites. Copied screenshots are excluded from public Git history. A source link alone is not a redistribution license. |
| UI design skills | `.agents/skills/anti-ui-slop/`, `.agents/skills/ui-design/` | Bundled Apache-2.0 licenses, copyright notices, and modification records remain alongside the files. UI Radar has no bundled license and is excluded from the public source; a local installation can be retained privately. |
| Logo concept and final SVG | `docs/reference-ui/strategy-court-logo-*`, app brand assets | The concept was generated for this project and the SVG was drawn for the app. This is separate from third-party reference screenshots. |
| Other dependencies | `bun.lock`, `licenses/`, and `apps/web/public/third-party-notices.txt` | The installed production dependency graph supplies the copyright and permission notices shipped with both the website and Docker image. `bun run notices:check` rejects stale notices during a build. Missing npm license texts are vendored from their upstream repositories, with sources recorded in `licenses/README.md`. |

The earlier Yahoo price snapshot, its derived landing data and golden result, its download script, and the copied research screenshots were removed from the published history with the owner's approval. The owner retains a private backup. Do not merge an old clone into the public repository, because doing so can restore removed files.

Real backtests continue to request Alpaca data with server-side credentials. Results and exports retain provider metadata. The source release does not bundle Alpaca prices, credentials, database contents, or previously saved user results. Deployments remain subject to their Alpaca account's data agreement. Never commit credentials or assume this code license permits redistributing provider data.
