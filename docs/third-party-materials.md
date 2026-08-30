# Third-party materials

This inventory separates original application code from material whose rights are held by others. It is not a grant of rights to those materials and does not establish permission to redistribute market data.

The root [MIT license](../LICENSE) applies to original Strategy Court code and documentation only. It does not relicense any third-party material listed below.

| Material | Location | Source and treatment |
| --- | --- | --- |
| Lightweight Charts | Installed frontend dependency; candle and evidence charts | TradingView, Apache-2.0. Preserve its license, copyright notice, and user-visible TradingView link. The app's Chart attribution link supplies the notice and license. |
| Historical market snapshot | `packages/fixtures/market-data/frozen-snapshot.json` | Downloaded Yahoo Finance adjusted daily bars. The generating script records the upstream endpoint. Do not describe these as Alpaca data, live data, synthetic test values, or original project code. Redistribution permission has not been established in this repository. |
| Landing chart sample | `apps/web/src/data/landingMarket.ts` | A recorded QQQ subset derived from that historical snapshot. The UI identifies it as a historical sample. The same market-data permission question applies. |
| UI research screenshots | `docs/reference-ui/` subdirectories | Third-party screens retained as research references. Markdown files record selected sources and design decisions. Do not include them under a license for original code or assume source attribution grants redistribution rights. |
| Logo concept and final SVG | `docs/reference-ui/strategy-court-logo-*`, app brand assets | The concept was generated for this project and the SVG was drawn for the app. This is separate from third-party reference screenshots. |
| Other dependencies | `bun.lock` and installed package license files | Each package retains its own license. A root application license does not replace dependency licenses. |

Before making the repository public, the owner must resolve permissions for the recorded market data and research screenshots, or replace/remove those materials from the publication, including relevant commit history. Removing files from the latest commit alone does not remove older Git copies. Do not rewrite shared history or delete the working materials without the owner's approval.

The deployed app retrieves Alpaca data using server-side credentials. Its use and display remain subject to the account's data agreement. No credentials belong in source control, screenshots, the public README, or a demo video.
