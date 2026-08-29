# Strategy Court — Product Requirements Document

**Version:** 0.1
**Date:** August 26, 2026
**Product stage:** WebMCP Challenge MVP
**Delivery window:** 7 days
**Team:** One developer
**Primary stack:** Vue 3, TypeScript, Vite, Bun, PostgreSQL, Better Auth
**Tagline:** **Put your strategy on trial before you put money behind it.**

---

## 1. Executive summary

Strategy Court is an adversarial strategy-validation product for active discretionary traders who have trading ideas but cannot or do not want to build a quantitative testing system themselves.

A trader describes a US-stock strategy in natural language. A compatible browser agent converts that description into a strict, inspectable strategy definition through WebMCP. The trader confirms the interpretation before any test runs.

Strategy Court then performs a deterministic historical backtest and actively searches for reasons the strategy may fail:

* Weak out-of-sample performance
* Dependence on one exact parameter value
* Sensitivity to fees and slippage
* Dependence on one market regime
* Excessive concentration in a small number of lucky trades
* Unacceptable drawdowns
* Insufficient evidence

The product does not promise that a strategy will make money. It is designed to reject invalid or fragile strategies before traders risk capital.

The core product statement is:

> **Strategy Court systematically searches for the reasons a retail trading strategy will fail, allowing traders to reject fragile strategies before risking capital instead of trusting one attractive historical equity curve.**

---

## 2. Product thesis

Most retail backtesting workflows are optimized around producing a performance chart.

Strategy Court is optimized around answering a harder question:

> **What evidence suggests this apparent edge is not real, not durable, or not executable?**

The product is not:

* A trading-signal generator
* A brokerage
* An autonomous trading bot
* A guaranteed-profit system
* A generic financial chatbot
* A clone of TradingView
* A strategy marketplace in the MVP

The product is a structured falsification environment.

Backtesting can be useful, but it does not predict future performance or perfectly reproduce actual trading conditions. Strategy Court must communicate that limitation throughout the interface rather than presenting historical results as expected future returns. ([FINRA][1])

The product must never claim that AI can predict sudden market changes or guarantee profitable strategies. Regulators specifically warn against products that market automated or AI-based trading systems with unreasonable or guaranteed return claims. ([CFTC][2])

---

## 3. Target customer

### 3.1 Primary persona

**Active discretionary trader without a mature quantitative workflow**

This customer:

* Uses TradingView or personal spreadsheets and scripts
* Understands basic technical indicators
* Has strategy ideas from personal observation, social media, YouTube, Discord, ChatGPT, Claude, or other traders
* May understand what RSI, moving averages, stop-losses, and drawdowns are
* Does not want to build and maintain a complete backtesting framework
* Is considering allocating real money to an unproven strategy
* Is willing to pay to avoid deploying capital into a fragile setup

This customer is not a total investing beginner and is not a professional quantitative researcher.

### 3.2 Trigger event

The primary product-entry moment is:

> The trader has received or generated a trading strategy using ChatGPT, Claude, another agent, or an online source and wants to know whether it survives serious testing before using real money.

Examples:

* “ChatGPT gave me an RSI strategy. Is it actually robust?”
* “This strategy looks profitable in TradingView, but I do not trust the chart.”
* “My strategy worked historically but is losing in paper trading.”
* “I am about to allocate $5,000 and want to test how easily the strategy breaks.”
* “Does the strategy work outside the specific ticker and period where I discovered it?”

### 3.3 Existing alternatives

The customer currently uses some combination of:

* TradingView Strategy Tester
* Pine Script
* ChatGPT or Claude
* Personal spreadsheets
* Python notebooks
* Community indicators
* Manual parameter changes
* Visual inspection of charts

The existing workflow is fragmented. The trader must define rules, translate them into code, choose assumptions, run tests, compare results, and determine which weaknesses matter.

### 3.4 Primary job to be done

> When I have a trading strategy that appears profitable, help me systematically search for evidence that it is fragile or misleading so I can reject it, revise it, or move it into paper-trading probation before risking capital.

---

## 4. Product goals

### 4.1 Primary goal

Prevent traders from deploying real money into strategies that fail basic robustness, execution, concentration, or evidence-quality tests.

### 4.2 Secondary goals

* Reduce strategy-validation work from hours of manual experimentation to one guided investigation
* Convert vague natural-language ideas into reproducible rules
* Make every assumption and strategy change visible
* Allow an external agent to run an adaptive investigation through WebMCP
* Give traders constructive next steps after a strategy fails
* Create a foundation for recurring strategy monitoring

### 4.3 Challenge goal

Demonstrate a product that becomes materially more useful when a person and an external browser agent work together.

The agent must do more than press a “Run backtest” button. It must:

1. Read the current strategy and existing evidence
2. Identify the weakest part of the case
3. Select an appropriate investigation
4. Inspect suspicious periods or regimes
5. Create up to three controlled strategy variants
6. Run the variants through the same tests
7. Present every result, including failed variants
8. Explain what remains unproven

WebMCP permits a page to register structured tools that an external agent can invoke. Tool callbacks may be asynchronous, can update the visible interface, and can delegate heavier work to application infrastructure. ([Web Machine Learning][3])

---

## 5. Non-goals for the one-week MVP

The MVP will not include:

* Live brokerage connections
* Real-money order execution
* Brokerage account imports
* Short selling
* Leverage or margin
* Options
* Crypto
* Forex
* Intraday candles
* Tick-level execution modelling
* Limit-order simulation
* Arbitrary Pine Script execution
* Arbitrary JavaScript or TypeScript execution
* A public searchable indicator marketplace
* A public strategy marketplace
* Social feeds
* Copy trading
* Automated strategy optimization
* Unlimited parameter search
* Tax calculations
* Authentication
* Billing
* Team collaboration
* Mobile-native applications
* Claims that a strategy is safe or guaranteed profitable

---

## 6. Locked MVP scope

### 6.1 Market

* US stocks and ETFs
* Daily candles only
* Adjusted OHLCV data
* Historical testing
* Latest completed daily-bar evaluation
* Historical replay probation

### 6.2 Initial symbol universe

Users may select one to five instruments from this curated universe:

**Stocks**

* AAPL
* MSFT
* NVDA
* AMZN
* GOOGL
* META
* TSLA
* AMD
* NFLX
* JPM
* XOM
* WMT
* COST
* JNJ
* KO

**ETFs**

* SPY
* QQQ
* IWM
* DIA
* XLK

The universe is intentionally curated. Supporting arbitrary US symbols would introduce broader corporate-action, data-quality, symbol-history, delisting, and survivorship-bias requirements that are outside the seven-day scope.

### 6.3 Data source

The MVP will use Alpaca’s historical stock-bars API through the Bun backend.

Alpaca’s endpoint supports retrieving bars for multiple symbols and supports daily aggregations. Requests must handle pagination because multi-symbol results may span multiple pages. ([Alpaca US][4])

Historical data requests must use the provider’s corporate-action adjustment option and store the actual request parameters in the run metadata. Alpaca documents corporate-action adjustment support through the `adjustment` parameter. ([Alpaca US][5])

### 6.4 Trading model

The backtest engine will enforce the following rules:

* Long-only
* No leverage
* No short selling
* No portfolio rebalancing
* One open position per symbol
* Signals calculated using a fully completed daily candle
* Entries executed at the following trading day’s open
* Exits executed at the following trading day’s open unless a stop-loss or take-profit model explicitly requires another documented assumption
* Market-order simulation only
* Equal starting capital allocated to each selected symbol
* Each symbol tested as an independent strategy instance
* Aggregate portfolio curve created by equally weighting the selected symbol instances
* Configurable stop-loss
* Configurable take-profit
* Configurable maximum holding period
* No position pyramiding

The original strategy definition and all execution assumptions must be shown before the user confirms a Court run.

---

## 7. Core user journey

### Step 1: Create a Court case

The user starts a new case and enters:

* Strategy name
* Natural-language strategy description
* One to five symbols
* Historical date range
* Initial capital
* Optional risk preferences
* Optional fee and slippage assumptions

Example:

> Buy AAPL, MSFT, NVDA, QQQ, or SPY when RSI 14 is below 35 and price is above the 200-day EMA. Exit when RSI is above 60, the position loses 5%, gains 10%, or has been open for 20 trading days.

### Step 2: Agent creates a structured draft

The browser agent calls `create_strategy_draft`.

The tool accepts a strict strategy schema. It does not accept raw executable code.

The interface displays the interpretation in two forms:

1. Human-readable rules
2. Structured strategy definition

The user can inspect:

* Symbols
* Indicators
* Periods
* Comparisons
* Entry conditions
* Exit conditions
* Position model
* Stop-loss
* Take-profit
* Maximum holding period
* Signal timing
* Order timing

### Step 3: User confirms the interpretation

No backtest may run until the user confirms the strategy definition.

Confirmation creates immutable **Strategy Version 1**.

Any later modification creates a new strategy version.

### Step 4: Run the Court

The user or agent starts the Court.

The application runs:

1. Baseline historical backtest
2. Out-of-sample validation
3. Parameter-sensitivity testing
4. Cost and slippage stress
5. Market-regime analysis
6. Trade-concentration analysis
7. Risk-profile analysis

### Step 5: Review separate verdicts

The user receives separate findings for:

* Evidence sufficiency
* Out-of-sample robustness
* Parameter stability
* Execution resilience
* Regime stability
* Profit concentration
* Risk profile

Every category receives one of:

* Pass
* Warning
* Fail
* Inconclusive

The interface also provides a top-level summary label.

### Step 6: Agent investigates the weakness

The agent reads the result through `get_case_context` and chooses a relevant next action.

Examples:

* Inspect the 2022 drawdown
* Compare performance above and below SPY’s 200-day moving average
* Identify the five trades responsible for most profit
* Determine which parameter is unstable
* Examine why doubled costs remove the edge

### Step 7: Agent creates controlled variants

The agent may autonomously create and test up to three variants per investigation.

For example:

* Add a market-trend filter
* Add an ATR volatility filter
* Reduce the maximum holding period

All variants must remain visible, including failed variants.

The agent may not show only the best result.

### Step 8: Compare versions

The comparison screen shows:

* Exact rule changes
* Rationale
* Baseline metrics
* Court-category changes
* Trade-count changes
* Drawdown changes
* Cost sensitivity
* Regime performance
* Whether the variant used information from the evaluation period

### Step 9: Start replay probation

A strategy that is not invalid may be moved into historical replay probation.

The replay initially hides a future period and reveals it one completed bar at a time.

The interface displays:

* Current signal state
* Simulated open positions
* New completed trades
* Current drawdown
* Rolling expectancy
* Difference from historical expectations
* Regime changes
* New warnings

The challenge MVP will also evaluate the latest available completed daily bar, but it will not claim that a short live-observation period statistically proves strategy decay.

---

## 8. Strategy-definition model

### 8.1 Strategy schema

Every strategy must compile into a deterministic structure similar to:

```ts
interface StrategyDefinition {
  name: string;
  universe: string[];
  timeframe: "1d";
  direction: "long";
  entry: ConditionNode;
  exit: ConditionNode;
  execution: {
    signalAt: "close";
    executeAt: "next_open";
    orderType: "market";
  };
  risk: {
    stopLossPercent?: number;
    takeProfitPercent?: number;
    maxHoldingDays?: number;
  };
  costs: {
    commissionBpsPerSide: number;
    slippageBpsPerSide: number;
  };
}
```

### 8.2 Condition model

Supported logical operators:

* `all`
* `any`
* `not`

Supported comparisons:

* Greater than
* Greater than or equal
* Less than
* Less than or equal
* Equal
* Crosses above
* Crosses below

Supported price sources:

* Open
* High
* Low
* Close
* Volume
* HL2
* HLC3
* OHLC4

### 8.3 Rule limits

A strategy may contain:

* Up to five entry conditions
* Up to three exit conditions
* Up to ten numerical parameters
* Maximum condition-tree depth of twelve
* Maximum 100 nodes in the complete strategy AST

These limits protect execution time and prevent an agent from creating unnecessarily complex strategies.

---

## 9. Indicator system

### 9.1 Product direction

TradingView exposes hundreds of built-in variables and functions, while its ecosystem contains a very large community-script catalog. Full TradingView or Pine Script compatibility is therefore not a realistic one-week requirement. ([TradingView][6])

The MVP objective is:

> Provide a familiar catalog of commonly used technical indicators through an extensible registry, then allow safe custom composition through WebMCP.

### 9.2 MVP built-in indicator catalog

The MVP must ship with these 30 indicators:

**Moving averages and trend**

1. Simple Moving Average
2. Exponential Moving Average
3. Weighted Moving Average
4. Running Moving Average / Smoothed Moving Average
5. Hull Moving Average
6. Volume-Weighted Moving Average
7. Double Exponential Moving Average
8. Triple Exponential Moving Average

**Momentum**

1. Relative Strength Index
2. Stochastic Oscillator
3. Stochastic RSI
4. MACD
5. Commodity Channel Index
6. Rate of Change
7. Momentum
8. Williams %R
9. ADX and Directional Movement
10. Aroon

**Volatility and channels**

 1. Average True Range
 2. Bollinger Bands
 3. Keltner Channels
 4. Donchian Channels
 5. Standard Deviation
 6. Historical Volatility
 7. Supertrend
 8. Parabolic SAR

**Volume and money flow**

 1. On-Balance Volume
 2. Money Flow Index
 3. Chaikin Money Flow
 4. Accumulation/Distribution

The indicator engine must also expose reusable primitives:

* Highest value over N bars
* Lowest value over N bars
* Previous value / lag
* Percentage change
* Rolling sum
* Rolling average
* Crossover
* Crossunder
* Arithmetic operations
* Absolute value
* Minimum
* Maximum

### 9.3 Custom indicators

The MVP supports safe custom indicators created through WebMCP.

A custom indicator is a structured formula, not arbitrary code.

Example:

```json
{
  "name": "Oversold Volume Confirmation",
  "outputType": "boolean",
  "formula": {
    "all": [
      {
        "left": {
          "indicator": "rsi",
          "parameters": {
            "period": 14,
            "source": "close"
          }
        },
        "operator": "lt",
        "right": {
          "constant": 30
        }
      },
      {
        "left": {
          "source": "volume"
        },
        "operator": "gt",
        "right": {
          "indicator": "sma",
          "parameters": {
            "period": 20,
            "source": "volume"
          }
        }
      }
    ]
  }
}
```

Custom indicators may be:

* Saved
* Versioned
* Exported as JSON
* Imported
* Shared through a read-only link
* Used in a strategy definition

The MVP does not include a searchable public marketplace.

### 9.4 Custom-indicator safety requirements

The custom-indicator runtime must prohibit:

* Arbitrary JavaScript
* Arbitrary TypeScript
* Arbitrary Pine Script
* Dynamic evaluation
* Network access
* File access
* Loops
* Recursion
* User-defined executable functions
* Future-bar references
* Negative lag values

Every custom indicator must declare:

* Name
* Description
* Inputs
* Default input values
* Output type
* Formula AST
* Version
* Creator type: human or agent
* Creation timestamp

---

## 10. Backtesting engine requirements

### 10.1 Determinism

The same combination of:

* Strategy version
* Data snapshot
* Date range
* Symbol universe
* Initial capital
* Cost assumptions
* Court profile
* Engine version

must produce the same trades and metrics.

Every Court run receives a reproducibility identifier calculated from these inputs.

### 10.2 No-look-ahead requirement

Indicators for trading day `T` may use only data available at or before the completed close of day `T`.

A normal signal generated from day `T` executes at the open of the next available trading day.

The engine must reject:

* Negative lags
* References to future bars
* Same-close fills for signals dependent on that close
* Strategy definitions that cannot be executed without future information

### 10.3 Missing data

The engine must:

* Preserve actual trading dates
* Avoid manufacturing candles for non-trading days
* Skip signals when required indicator values are unavailable
* Record missing bars
* Record insufficient warm-up periods
* Display the number of ignored bars

### 10.4 Position simulation

For each symbol:

1. Allocate equal starting capital
2. Evaluate entry conditions at each completed close
3. Enter at the next available open
4. Hold at most one position
5. Evaluate exit conditions
6. Apply the documented exit model
7. Deduct slippage and commissions
8. Store the completed trade
9. Update the symbol equity curve

### 10.5 Required metrics

The baseline report must calculate:

* Initial capital
* Final equity
* Net return
* Annualized return
* Number of trades
* Winning trades
* Losing trades
* Win rate
* Average winning trade
* Average losing trade
* Expectancy per trade
* Profit factor
* Maximum drawdown
* Maximum drawdown duration
* Recovery time
* Average holding period
* Longest holding period
* Best trade
* Worst trade
* Best five trades’ contribution
* Best 10% of trades’ contribution
* Total estimated costs
* Benchmark return
* Exposure percentage
* Consecutive losses

Every metric must be inspectable down to individual trades.

---

## 11. Court tests and default thresholds

### 11.1 Development and evaluation split

Default split:

* First 70% of the selected historical period: development period
* Final 30%: untouched evaluation period

The split is based on chronological order, not random sampling.

Once evaluation results have been viewed, the evaluation period becomes locked for that case.

### 11.2 Evidence sufficiency

**Pass**

* At least 30 completed out-of-sample trades

**Inconclusive**

* Fewer than 30 completed out-of-sample trades

A low trade count must not become a failure merely because the strategy is selective. It means there is insufficient evidence for a strong robustness conclusion.

### 11.3 Out-of-sample robustness

Only evaluated when evidence sufficiency passes.

**Pass**

* Out-of-sample net profit is positive
* Out-of-sample expectancy is positive
* Out-of-sample profit factor is at least 1.10

**Warning**

* Net profit and expectancy are positive
* Profit factor is between 1.00 and 1.10

**Fail**

* Net profit is zero or negative
* Expectancy is zero or negative
* Profit factor is below 1.00

### 11.4 Parameter sensitivity

Each relevant numerical parameter is tested independently at:

* Minus 20%
* Minus 10%
* Original value
* Plus 10%
* Plus 20%

The MVP uses one-parameter-at-a-time testing rather than a full Cartesian parameter search.

This prevents thousands of combinations and reduces optimization pressure.

**Pass**

* At least 60% of neighbouring configurations remain profitable after costs

**Warning**

* Between 40% and 59% remain profitable

**Fail**

* Fewer than 40% remain profitable
* Only the original parameter value produces a positive result

**Inconclusive**

* The strategy contains no meaningfully variable numerical parameters

### 11.5 Cost and slippage stress

Default assumptions:

* Commission: 0 basis points per side
* Slippage: 5 basis points per side

Stress assumptions:

* Double all configured transaction-cost assumptions

**Pass**

* Out-of-sample net profit remains positive
* Net profit falls by no more than 50%

**Warning**

* Net profit remains positive
* Net profit falls by more than 50%

**Fail**

* Out-of-sample net profit becomes zero or negative

### 11.6 Market-regime analysis

SPY is used as the market-regime benchmark.

Trend state:

* Positive trend: SPY close is above its 200-day moving average
* Negative trend: SPY close is below its 200-day moving average

Volatility state:

* High volatility: SPY 20-day realized volatility is above its trailing 252-day median
* Low volatility: SPY 20-day realized volatility is at or below its trailing 252-day median

This creates four regimes:

1. Positive trend, low volatility
2. Positive trend, high volatility
3. Negative trend, low volatility
4. Negative trend, high volatility

A regime is considered observed only when it contains at least ten completed trades.

**Pass**

* At least three regimes are observed
* At least 75% of observed regimes have positive expectancy

**Warning**

* Only two regimes are observed
* Or between 50% and 74% of observed regimes have positive expectancy

**Fail**

* Fewer than 50% of observed regimes have positive expectancy
* Or almost all net profit comes from one regime while the strategy loses materially in the others

**Inconclusive**

* Fewer than two regimes contain sufficient trades

### 11.7 Trade-concentration analysis

**Pass**

* Best trade contributes no more than 20% of total net profit
* Best five trades contribute no more than 50%

**Warning**

* Best trade contributes between 20% and 35%
* Or best five trades contribute between 50% and 75%

**Fail**

* Best trade contributes more than 35%
* Or best five trades contribute more than 75%

**Inconclusive**

* Total net profit is not positive
* Or there are too few profitable trades for meaningful concentration analysis

### 11.8 Risk profile

The default Court profile is **Balanced**.

**Pass**

* Maximum drawdown is no more than 25%
* Maximum recovery period is no more than 252 trading days

**Warning**

* Maximum drawdown is between 25% and 35%
* Or recovery requires between 252 and 504 trading days

**Fail**

* Maximum drawdown exceeds 35%
* Or recovery requires more than 504 trading days
* Or the strategy never recovers before the end of the test

The interface may later support Conservative and Aggressive profiles, but the challenge MVP needs only the Balanced profile fully implemented.

---

## 12. Verdict model

### 12.1 Category verdicts

Each Court category receives:

* Pass
* Warning
* Fail
* Inconclusive

No numerical robustness score will be shown.

A number such as “82/100” would suggest precision that the tests cannot justify.

### 12.2 Top-level labels

**Invalid**

Used when:

* Strategy schema is invalid
* Required data is unavailable
* Look-ahead bias is detected
* Execution assumptions cannot be simulated
* A custom indicator attempts to use prohibited behavior

**Fragile**

Used when:

* Any material Court category fails

**Inconclusive**

Used when:

* No material category fails
* At least one critical category lacks sufficient evidence

**Paper-trading candidate**

Used when:

* Out-of-sample robustness passes
* No material category fails
* Remaining categories are Pass or Warning
* Evidence sufficiency passes

**Survived current tests**

Used when:

* Every critical Court category passes
* Evidence sufficiency passes
* No unresolved data-quality warning exists

The interface must always append:

> Historical tests cannot establish that a strategy will remain profitable in future market conditions.

---

## 13. Strategy variants and evidence integrity

### 13.1 Agent variant permissions

An agent may create and test up to three variants during one investigation.

The agent may:

* Add a filter
* Remove a condition
* Change indicator parameters
* Change stop-loss
* Change take-profit
* Change maximum holding period
* Change position sizing within supported limits
* Replace one indicator with another supported indicator

### 13.2 Mandatory integrity rules

1. The original strategy version is immutable.
2. Every modification creates a new version.
3. Failed versions remain visible.
4. The evaluation period cannot be changed after results are viewed.
5. The agent cannot remove individual losing trades.
6. The agent cannot exclude an unfavourable symbol or period without explicit user approval.
7. Every optimization attempt is recorded.
8. Reports display the number of variants attempted.
9. A strategy optimized against the evaluation period cannot be described as out-of-sample validated.
10. Every metric displays its data range, assumptions, costs, and execution model.
11. The agent must present all variants it tested, not only the best variant.
12. The original result remains accessible during every comparison.
13. The application must distinguish user decisions from agent decisions.
14. The agent cannot declare that a strategy will be profitable.
15. The agent cannot submit live trades.

### 13.3 Evaluation contamination

When an agent modifies a strategy after viewing evaluation-period results, the new version must be labeled:

> **Evaluation-informed variant**

That variant may still be tested and compared, but its evaluation-period performance is not independent evidence.

Replay probation is the next available holdout test.

---

## 14. Replay probation and monitoring

### 14.1 Historical replay

A Court case may reserve a historical probation period that remains hidden during the original Court run.

Example:

* Court period: January 1, 2015–December 31, 2023
* Replay probation: January 1, 2024–latest cached date

The replay advances one completed daily bar at a time or in user-selected batches.

### 14.2 Replay information

The interface shows:

* Current replay date
* Current market regime
* Signal status for each symbol
* Simulated open positions
* Completed probation trades
* Probation return
* Probation expectancy
* Probation drawdown
* Expected versus observed trade frequency
* Expected versus observed win rate
* Expected versus observed average trade
* Warnings when performance leaves historical ranges

### 14.3 Latest-bar monitoring

The application may fetch the latest completed daily bar and evaluate:

* Whether an entry signal is active
* Whether an exit signal is active
* Whether monitoring metrics have changed
* Whether a saved strategy has entered a new market regime

The MVP does not execute orders or connect to broker accounts.

### 14.4 Retention role

Monitoring is the main recurring-subscription feature.

Historical Court testing creates initial value. Monitoring creates a reason to return each week and continue paying.

---

## 15. WebMCP requirements

### 15.1 WebMCP’s role

The web application owns:

* Market data
* Indicator calculations
* Backtesting
* Court tests
* Version history
* Reproducibility
* UI state
* Deterministic verdicts

The external agent owns:

* Natural-language interpretation
* Investigation planning
* Selection of the next useful test
* Failure explanation
* Controlled variant hypotheses
* Comparison narrative

The agent must use narrow product tools rather than interact with raw database or exchange APIs.

### 15.2 Required tools

#### `get_case_context`

Returns:

* Current strategy version
* Symbols
* Court profile
* Existing runs
* Category verdicts
* Open warnings
* Variant history
* Replay status

Read-only.

#### `list_indicator_catalog`

Returns:

* Built-in indicators
* Required parameters
* Allowed sources
* Output types
* Available custom indicators

Read-only.

#### `create_strategy_draft`

Creates an unconfirmed structured strategy draft.

Required inputs:

* Case ID
* Strategy name
* Universe
* Entry condition tree
* Exit condition tree
* Risk settings
* Cost assumptions
* Plain-language interpretation

The tool must not confirm the strategy.

#### `create_custom_indicator`

Creates a safe custom-indicator draft.

The tool validates:

* AST shape
* Allowed operations
* Node count
* Tree depth
* Lag direction
* Output type
* Indicator dependencies

#### `run_court`

Runs the complete Court against a confirmed strategy version.

Required inputs:

* Case ID
* Strategy version ID
* Date range
* Court profile
* Data snapshot policy

Returns:

* Run ID
* Run state
* Progress
* Data snapshot ID

#### `inspect_failure_period`

Returns evidence for a selected failure:

* Relevant date range
* Symbols
* Trades
* Market regime
* Equity changes
* Indicator values
* Costs
* Explanation inputs

Read-only.

#### `create_strategy_variants`

Creates and runs up to three controlled variants.

Each variant must contain:

* Name
* Hypothesis
* Rationale
* Structured patch
* Expected weakness addressed

The tool rejects more than three variants.

#### `compare_strategy_versions`

Returns:

* Exact rule diffs
* Metric comparison
* Category-verdict comparison
* Trade-count comparison
* Evaluation-contamination labels
* Data and assumption differences

Read-only.

#### `start_replay_probation`

Creates a probation session from a selected strategy version and reserved date range.

#### `advance_replay`

Advances the replay by:

* One bar
* Five bars
* Twenty bars
* To the next signal
* To the next completed trade

#### `get_monitoring_status`

Returns:

* Latest evaluated bar
* Active signals
* Current simulated positions
* Current regime
* Drift warnings
* Probation metrics

Read-only.

#### `export_case_report`

Returns a complete machine-readable and human-readable report manifest.

### 15.3 Tool schema requirements

Every WebMCP tool must:

* Use a narrow JSON Schema
* Set `additionalProperties` to `false`
* Define minimum and maximum values
* Use enums wherever possible
* Describe side effects
* Return changed IDs
* Return the current application state
* Return actionable validation errors
* Never return secrets
* Never expose Alpaca credentials
* Never accept arbitrary executable code

### 15.4 Progressive tool availability

Tool availability should reflect the case state.

Before strategy confirmation:

* `get_case_context`
* `list_indicator_catalog`
* `create_strategy_draft`
* `create_custom_indicator`

After confirmation:

* `run_court`

After Court completion:

* `inspect_failure_period`
* `create_strategy_variants`
* `compare_strategy_versions`
* `start_replay_probation`
* `export_case_report`

During probation:

* `advance_replay`
* `get_monitoring_status`

### 15.5 Manual fallback

The application must remain usable when WebMCP is unavailable.

Every WebMCP action must call the same domain service used by a corresponding visible UI action.

No tool handler should directly manipulate DOM elements as its primary business logic.

---

## 16. Interface requirements

### 16.1 Main routes

**`/` — Landing and demo entry**

* Product promise
* Example failure report
* “Try sample strategy”
* “Create Court case”

**`/case/:caseId` — Court workspace**

Tabs:

* Strategy
* Court
* Evidence
* Variants
* Probation
* Audit

**`/indicator/:indicatorId` — Shared indicator**

* Indicator definition
* Inputs
* Version
* Formula preview
* Import button

**`/report/:reportId` — Shared Court report**

* Read-only report
* Strategy definition
* Verdicts
* Assumptions
* Trades
* Version history

### 16.2 Court workspace layout

**Left panel: Strategy**

* Human-readable rules
* Structured definition
* Symbols
* Costs
* Execution assumptions
* Version selector

**Center panel: Evidence**

* Equity curve
* Drawdown chart
* Trade markers
* Regime visualization
* Court-category results
* Failure-period inspector

**Right panel: Investigation**

* Agent activity
* Test history
* Variant hypotheses
* Warnings
* Pending user decisions
* Audit timeline

### 16.3 Persistent summary header

The top of the case must always show:

* Current strategy version
* Top-level Court label
* Number of passing categories
* Number of warnings
* Number of failures
* Number of inconclusive categories
* Number of attempted variants
* Whether evaluation data has been viewed
* Whether the current variant is evaluation-informed

Example:

> **Fragile · 3 Pass · 2 Fail · 1 Warning · 1 Inconclusive · 3 variants tested**

---

## 17. Transparency requirements

The user must be able to inspect:

* Exact strategy rules
* Exact indicator parameters
* Generated structured definition
* Every strategy version
* Every agent-created variant
* Data provider
* Data date range
* Data-adjustment setting
* Data snapshot identifier
* Missing-data warnings
* Initial capital
* Fee assumptions
* Slippage assumptions
* Signal timing
* Fill timing
* Every completed trade
* Every rejected or skipped signal
* Every Court threshold
* Every parameter variant
* Every regime definition
* Every agent action
* Every user approval
* Every exportable result
* Engine version

The product must not rely on an unexplained robustness score.

---

## 18. Technical architecture

### 18.1 Frontend

* Vue 3
* TypeScript
* Vite
* Pinia
* SCSS
* Charting library for candles, equity, and drawdown
* Runtime WebMCP feature detection
* Manual fallback actions

### 18.2 Backend

* Bun
* TypeScript
* `Bun.serve`
* Native `fetch`
* PostgreSQL through `pg`
* Better Auth with email/password and optional Google OAuth
* REST endpoints
* Sequential Court jobs
* Cached Alpaca responses
* Deterministic engine package

Bun directly supports TypeScript execution and includes a server runtime, package manager, build tooling, and test runner. ([Bun][7])

PostgreSQL stores authenticated, owner-scoped product data while immutable market snapshots remain a shared cache.

### 18.3 Repository structure

```text
apps/
  web/
    src/
      components/
      pages/
      stores/
      webmcp/
      charts/
  api/
    src/
      routes/
      services/
      jobs/

packages/
  domain/
    strategy/
    indicators/
    backtest/
    court/
    replay/
    audit/

  schemas/
    strategy.schema.ts
    indicator.schema.ts
    webmcp.schema.ts

  fixtures/
    market-data/
    expected-results/
```

### 18.4 Backend endpoints

```text
GET    /api/indicators
POST   /api/indicators
GET    /api/indicators/:id

POST   /api/cases
GET    /api/cases/:id

POST   /api/cases/:id/strategy-drafts
POST   /api/cases/:id/strategy-versions/:versionId/confirm

POST   /api/cases/:id/court-runs
GET    /api/court-runs/:runId

GET    /api/court-runs/:runId/failures/:failureId
POST   /api/cases/:id/variants
GET    /api/cases/:id/comparison

POST   /api/cases/:id/replay
POST   /api/replay/:replayId/advance
GET    /api/replay/:replayId/status

GET    /api/reports/:reportId
```

### 18.5 Persistence entities

**CourtCase**

* ID
* Name
* Status
* Created timestamp
* Active strategy version
* Selected profile

**StrategyVersion**

* ID
* Case ID
* Parent version ID
* Strategy definition
* Human-readable interpretation
* Creation source
* Confirmation status
* Evaluation-informed flag

**IndicatorDefinition**

* ID
* Name
* Version
* Formula AST
* Inputs
* Output type
* Sharing state

**DataSnapshot**

* ID
* Provider
* Symbols
* Date range
* Adjustment mode
* Fetch timestamp
* Content hash

**CourtRun**

* ID
* Strategy version
* Data snapshot
* Cost model
* Court profile
* Engine version
* Status
* Summary label

**CourtTestResult**

* Test type
* Status
* Metrics
* Thresholds
* Evidence references

**Trade**

* Symbol
* Entry date
* Entry price
* Exit date
* Exit price
* Quantity
* Gross profit
* Costs
* Net profit
* Entry reason
* Exit reason
* Market regime

**ReplaySession**

* Strategy version
* Hidden date range
* Current replay date
* Current positions
* Current metrics

**AuditEvent**

* Actor
* Action
* Entity
* Before state
* After state
* Timestamp

---

## 19. Non-functional requirements

### 19.1 Correctness

* Indicator implementations require deterministic unit tests.
* Order simulation requires fixture-based tests.
* Look-ahead prevention requires explicit tests.
* Cost deductions require exact numeric tests.
* Court thresholds require boundary tests.
* Strategy versioning requires immutability tests.

### 19.2 Performance

Target on cached data:

* Baseline five-symbol backtest: under two seconds
* Full Court with parameter sensitivity: under fifteen seconds
* UI remains responsive during Court execution
* Progress is displayed for operations longer than one second

Initial data retrieval may take longer and must show progress.

### 19.3 Reliability

* Court runs must survive page refreshes.
* A failed job must return a specific error.
* Partial results must not be presented as completed results.
* Data-provider failures must not silently use stale or incomplete data.
* Cached data must record its retrieval timestamp.

### 19.4 Security

* Alpaca credentials remain server-side.
* Custom indicators never execute arbitrary code.
* Shared reports are read-only.
* Inputs are validated on both frontend and backend.
* Tool requests are validated again on the server.
* No live-trading credentials are accepted.

---

## 20. Product analytics and success criteria

### 20.1 Challenge success

The challenge MVP succeeds when a reviewer can:

1. Describe a strategy in natural language
2. Watch an external agent create a valid structured draft
3. Confirm the interpretation
4. Run the Court
5. See a profitable-looking baseline challenged by hostile tests
6. Ask the agent to investigate a weakness
7. Watch the agent create three controlled variants
8. See all variant results
9. Move the strongest surviving version into replay probation
10. Inspect a complete audit trail

### 20.2 MVP product metrics

These are hypotheses, not validated benchmarks.

**Activation**

* User confirms a strategy and completes the first Court run

**Time to value**

* Median time from case creation to first verdict below five minutes

**Evidence quality**

* 100% of completed reports show date range, costs, execution assumptions, data source, and individual trades

**Integrity**

* 100% of strategy modifications create a version
* 0 silent deletions of failed variants
* Identical run inputs produce identical outputs

**Engagement**

* Percentage of completed cases that start an investigation
* Percentage that compare at least one variant
* Percentage that enter replay probation
* Seven-day return rate for monitored strategies

---

## 21. Monetization hypothesis

Payment is not part of the challenge MVP.

### Free

* Three Court cases
* Built-in indicators
* Limited saved history
* One replay probation
* Read-only report sharing

### Pro — $29 per month

* Up to 50 Court runs per month
* Up to ten monitored strategies
* Custom indicators
* Full trade exports
* Strategy-version comparisons
* Replay probation
* Latest-bar monitoring
* Shareable reports
* Longer historical ranges

### Future Creator plan — $79 per month

* Public validation reports
* Branded reports
* Strategy revision histories
* Shareable custom-indicator libraries
* Higher limits

The willingness-to-pay assumption remains unvalidated. The challenge version is intended to demonstrate the workflow before billing is built.

---

## 22. One-week implementation plan

### Day 1 — Domain and data

* Create repository and application shells
* Define strategy AST
* Define indicator registry
* Implement Alpaca client
* Add pagination
* Add adjusted-data requests
* Add PostgreSQL persistence and snapshot cache
* Freeze the curated symbol universe
* Create data fixtures

### Day 2 — Indicators and baseline backtest

* Implement or integrate the 30-indicator registry
* Add indicator golden tests
* Implement entry and exit evaluation
* Implement next-open execution
* Implement position simulation
* Implement costs
* Generate trade list and equity curve

### Day 3 — Court engine

* Implement chronological 70/30 split
* Implement evidence sufficiency
* Implement out-of-sample test
* Implement one-at-a-time sensitivity
* Implement cost stress
* Implement regime analysis
* Implement concentration analysis
* Implement risk-profile verdict
* Implement summary-label logic

### Day 4 — Core interface

* Build case creation
* Build strategy confirmation
* Build Court workspace
* Add equity and drawdown charts
* Add category cards
* Add trade table
* Add failure-period inspector
* Add audit timeline

### Day 5 — WebMCP

* Register state-dependent tools
* Implement structured draft creation
* Implement custom-indicator creation
* Implement Court-run tool
* Implement failure inspection
* Implement controlled variants
* Implement comparison
* Ensure tool results update the visible interface

### Day 6 — Replay and sharing

* Implement historical replay
* Add latest-completed-bar evaluation
* Add monitoring status
* Add report export
* Add custom-indicator sharing
* Create deterministic sample case

### Day 7 — Hardening and demo

* Test complete user journey
* Fix schema and execution bugs
* Validate no-look-ahead behavior
* Verify all variants remain visible
* Add error states
* Improve loading states
* Deploy frontend and backend
* Record challenge demonstration
* Finish README and architecture explanation

---

## 23. Priority order

### P0 — Required for submission

* Natural-language strategy intake through WebMCP
* Strict structured strategy draft
* Mandatory user confirmation
* Curated stocks and ETFs
* Daily adjusted data
* Deterministic long-only backtest
* Five hostile Court tests
* Separate verdicts
* Top-level summary label
* Complete assumptions and trade transparency
* Agent-created controlled variants
* Immutable version history
* Historical replay probation
* Audit log
* Manual fallback

### P1 — Implement after P0 is stable

* All 30 built-in indicators
* Shareable custom indicators
* Latest-bar monitoring
* Shareable Court reports
* Export to JSON and CSV
* Additional charts

### P2 — Explicitly cut when schedule slips

* Polished landing page
* Multiple Court profiles
* Advanced report styling
* Indicator descriptions
* Animated replay controls
* Complex chart annotations

Correctness, determinism, and WebMCP workflow must not be sacrificed to preserve visual polish or indicator count.

---

## 24. Demo scenario

The demonstration should use a frozen, real historical-data snapshot and a strategy selected before recording.

Suggested strategy:

> Buy the selected stock when RSI 14 falls below 35 while the close remains above EMA 200. Exit when RSI rises above 60, the position gains 10%, loses 5%, or remains open for 20 trading days.

Suggested symbols:

* AAPL
* MSFT
* NVDA
* QQQ
* SPY

Desired narrative:

1. The baseline historical curve looks attractive.
2. Strategy Court finds that out-of-sample expectancy is weak or negative.
3. The five best trades account for an excessive share of total profit.
4. The agent inspects the weakest market period.
5. The agent proposes three variants:

   * Stronger market-trend filter
   * ATR volatility filter
   * Shorter maximum holding period
6. One variant improves stability.
7. That variant produces too few independent out-of-sample trades.
8. The final verdict is:

   * **Inconclusive**
   * **Eligible for replay probation**
   * **Not supported for live deployment**
9. Replay probation begins and reveals whether the improved behavior persists.

The demo must not end with a miraculous annual-return claim.

---

## 25. Principal risks

### Indicator scope becomes the product

**Risk:** Attempting to replicate most of TradingView consumes the entire week.

**Mitigation:** Ship a registry with 30 common indicators. Treat broad Pine compatibility as a future product track.

### Incorrect backtesting logic

**Risk:** A polished interface produces misleading results.

**Mitigation:** Prioritize fixtures, deterministic tests, next-open execution, visible assumptions, and trade-level inspection.

### Natural-language ambiguity

**Risk:** The agent misinterprets the user’s strategy.

**Mitigation:** Structured schema and mandatory confirmation before testing.

### Agent-driven overfitting

**Risk:** The agent repeatedly changes the strategy until one version looks good.

**Mitigation:** Three-variant limit, immutable history, locked evaluation period, contamination labels, and display of all attempted variants.

### Weak recurring value

**Risk:** Users test one strategy and cancel.

**Mitigation:** Replay probation, latest-bar evaluation, monitoring, and saved strategy histories.

### Misleading financial marketing

**Risk:** Historical results are presented as a prediction.

**Mitigation:** No guaranteed-return language, no live-order execution, persistent limitations, full assumptions, and no “safe strategy” verdict.

### Data-provider constraints

**Risk:** Rate limits or incomplete data interrupt the demo.

**Mitigation:** Cache data, freeze the demo snapshot, store pagination state, and provide deterministic local fixtures.

---

## 26. Launch acceptance criteria

The MVP is ready for the challenge when all of the following are true:

* [ ] A compatible browser agent can discover Strategy Court’s WebMCP tools.
* [ ] The agent can convert a natural-language idea into a valid strategy draft.
* [ ] The user must confirm the draft before testing.
* [ ] The strategy runs against one to five curated US stocks or ETFs.
* [ ] Signals use completed daily bars.
* [ ] Normal entries execute at the next available open.
* [ ] Costs are deducted and displayed.
* [ ] The complete trade list is inspectable.
* [ ] The Court runs all required tests.
* [ ] Every category produces Pass, Warning, Fail, or Inconclusive.
* [ ] The summary label follows the documented deterministic rules.
* [ ] The original strategy cannot be overwritten.
* [ ] Every variant receives a new version.
* [ ] The agent can create no more than three variants in one investigation.
* [ ] Failed variants remain visible.
* [ ] Evaluation-informed variants are labeled.
* [ ] The agent can inspect a failure period.
* [ ] The user can compare strategy versions.
* [ ] The user can start and advance replay probation.
* [ ] The audit log distinguishes user and agent actions.
* [ ] Reports display data source, dates, costs, execution model, and engine version.
* [ ] No tool accepts arbitrary executable code.
* [ ] No API credential is exposed in the browser.
* [ ] The application remains usable without WebMCP.
* [ ] The sample demonstration produces an honest non-miraculous conclusion.

---

## 27. Final product definition

> **Strategy Court is an adversarial testing platform for active discretionary traders. It converts natural-language US-stock strategies into transparent, deterministic rules; searches for evidence of overfitting, execution fragility, regime dependence, and lucky-trade concentration; and moves surviving strategies into monitored paper-trading probation before the trader risks capital.**

The website provides the trusted quantitative engine.

The external agent provides the adaptive investigation.

The trader retains control over the strategy definition and the decision to proceed.

[1]: https://www.finra.org/investors/insights/smart-beta-what-you-need-know "www.finra.org"
[2]: https://www.cftc.gov/LearnAndProtect/AdvisoriesAndArticles/AITradingBots.html "Customer Advisory: AI Won’t Turn Trading Bots into Money Machines | CFTC"
[3]: https://webmachinelearning.github.io/webmcp "WebMCP"
[4]: https://docs.alpaca.markets/us/reference/stockbars "Historical bars"
[5]: https://docs.alpaca.markets/us/docs/broker-api-faq "Broker API FAQs"
[6]: https://www.tradingview.com/pine-script-docs/language/built-ins/ "Language / Built-ins"
[7]: https://bun.sh/docs "Welcome to Bun | Bun Docs"
[8]: https://bun.sh/docs/runtime/sqlite?utm_source=chatgpt.com "SQLite | Bun Docs"
