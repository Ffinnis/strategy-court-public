# Landing composition references

Inspected in the browser on 2026-08-30. These are layout references, not copied brand assets.

## Financial SaaS landing by Sajibur Rahman Sagor

[CollectUI landing page gallery](https://collectui.com/designs/landing-page-ui-design-inspiration), item “SaaS Landing Page Design” by [Sajibur Rahman Sagor](https://collectui.com/designers/sajiburdesign). [Original post](https://x.com/sajiburdesign/status/2092467535275057218).

The screen puts the headline and action on one side, a financial product preview on the other, and a much larger product view below. Later sections pair short explanations with concrete product states.

Applied: asymmetric hero, one main action, a wide working market preview directly below, and flat walkthrough sections. Reduced the top whitespace so the chart enters the first screen sooner. Kept the product's own monochrome palette rather than the reference's green branding, illustrations, invented social proof, or payment metrics.

## Trading dashboard by rico

[CollectUI crypto gallery](https://collectui.com/designs/crypto-ui-design-inspiration), item “still one of the best crypto designs we have had so far” by [rico](https://collectui.com/designers/_heyrico). [Original post](https://x.com/_heyrico/status/2061485682330366272).

The screen groups a quote, compact period controls, a chart and an adjacent data column in a continuous workspace. Secondary details appear in a popover instead of a grid of permanent cards.

Applied: quote and period controls share a toolbar, the chart is the dominant object, example rules sit in an adjacent column, and source/freshness information stays visible. Used restrained green/red only for market meaning. Did not copy the monospaced uppercase labels, wallet actions or decorative background.

## Rejected direction

The Sentinel crypto hero by Ayda Oz in the same gallery uses a glowing central emblem above three promotional cards. That composition would push the chart down and recreate the card overload the user rejected, so it was not adopted.

## Data and interaction constraints

- The preview now contains original synthetic OHLC values with SMA120 calculated using pre-year warmup. It is labeled Synthetic demo and is not actual QQQ data. Real backtests use Alpaca by default.
- No fabricated Court verdict, trade count, strategy return, or profit claim appears on the landing.
- The example price chart supports 6-month and 1-year ranges, pointer inspection, keyboard inspection and an accessible readout.
- “Create strategy” keeps the authenticated intake flow. “Open sample” retains the server-backed sample workflow and a retryable error state.
- At narrow widths, the chart and example rules stack; the seven tests use disclosures, and the three workflow steps become a vertical list.
