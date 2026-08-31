# One investigation, one defensible decision

Recording plan prepared August 31, 2026. This is a script and test protocol, not a completed video or evidence of user validation.

The product claim: Strategy Court helps people decide whether a trading rule deserves further investigation. An agent can draft and investigate; the person confirms the rules and the conclusion. A rejected idea is a useful result.

## Choose the evidence before recording

Use the prepared `rsi-pullback` sample described in [prepared-sample.md](./prepared-sample.md). Keep the existing rules, symbols, dates and costs. Do not search for a more flattering result.

- Entry: RSI 14 below 35 while price is above EMA 200.
- Exit: RSI above 60, a 5% stop, a 10% take profit, or 20 trading days held.
- AAPL, MSFT, NVDA, QQQ and SPY. Daily, long only, next-open execution.
- Court history: January 2, 2020 through December 31, 2024. Starting capital $10,000, zero commission and five basis points slippage per side.
- Prepare the separate 2025 history if replay is needed. Keep it out of the Court evidence.

Real-data recording is blocked until the operator supplies provider access and confirms permission to show and export that evidence. The local synthetic QA cases are suitable for rehearsing interactions only. Do not describe their returns as actual security performance.

Before recording, capture the case, version and run IDs, provider, feed, adjustment, snapshot hash, engine version and actual verdict. Choose one returned failure or trade and record its exact ID. Leave these values blank until the run exists. If the run is Invalid, explain the reason and stop the investigation; do not narrate missing results.

## The 2:40 recording

Keep the product and agent interaction visible. Use a real walkthrough with cuts for waiting, labeled when time is skipped. Do not create a scripted UI that impersonates tool execution. The [official rules](https://webmcp.devpost.com/rules) require a functioning demo with audio, under three minutes, publicly available on YouTube.

| Time | What the viewer sees | Spoken copy |
| --- | --- | --- |
| 0:00–0:15 | The investigation and its exact rules | "A backtest can look convincing while depending on a few trades. Strategy Court helps you inspect that weakness before deciding whether an idea deserves more work." |
| 0:15–0:35 | Open sample, then the person reviews and confirms its unconfirmed rules | "This investigation uses a saved market-data snapshot. I review the entry, exit, costs and dates before confirming the rules. The agent cannot confirm them for me." |
| 0:35–1:00 | Agent reads context and runs Court. Show the saved-data label and real returned verdict | "The agent reads the same case I have open and runs its confirmed rules through seven tests. The snapshot and engine version make this result reproducible." |
| 1:00–1:35 | Agent selects one actual failure or trade. The visible inspector and chart focus change together | "I ask why this finding matters. The agent selects the exact evidence in my workspace, so I can check its explanation against the trades, dates and costs." |
| 1:35–1:55 | Person selects a different trade; agent reads the updated selection | "I can steer the investigation myself. The agent sees my selection and continues from the same evidence, rather than guessing what I am looking at." |
| 1:55–2:25 | Agent proposes a cited decision. Person edits uncertainty or revisit criteria and confirms | "The agent proposes a conclusion with citations and limitations. I edit and confirm it. We keep a rejection if the evidence does not support further work." |
| 2:25–2:40 | Reload the report and open its citation | "The report preserves the confirmed decision and its evidence. WebMCP connects the agent's investigation to actions I can see, inspect and approve. Strategy Court does not place trades." |

If the prepared run supports further investigation, replace the rejection sentence with the actual uncertainty and a reason to gather more evidence. Do not claim a profitable future. Replay is optional and should appear only if the real result is eligible; it is unnecessary for this story.

Do not spend the main recording on every indicator, all seven explanations, variant tuning, account setup or infrastructure. A controlled variant can be a separate supporting clip. All attempts stay in the record.

## Agent prompts for rehearsal

After the person opens and confirms the sample:

> Read the active case and its confirmed rules. Run Court using its saved sample. Use the returned IDs and keep the actual result. Do not change the rules or search for a better verdict.

After Court completes:

> Inspect one specific finding that most limits confidence in this strategy. Select its failure or trade in the visible workspace. Explain the returned evidence and its uncertainty. Do not invent missing prices or results.

After the person selects another trade:

> Read my current selection. Explain how this evidence affects the investigation. Propose a decision with exact references, uncertainty and conditions for revisiting it. Leave confirmation to me. Do not create more variants.

A separate creation clip can use `create_case` and `create_strategy_draft`. The main recording uses a prepared sample to keep the evidence and running time predictable.

## Submission description draft

Strategy Court is for people who write rule-based trading ideas and need to understand their weaknesses before pursuing them. It tests explicit daily, long-only rules, then links findings to trades, market periods, execution assumptions and costs. Its output is an inspectable investigation record, not a trade recommendation.

WebMCP lets a browser agent work inside the same investigation as the person. The agent can create case setup, read the indicator catalog, draft exact rules, run approved tests and select evidence in the visible chart. The person can change the selection, edit a proposed conclusion and confirm it. The agent sees those changes in context. Confirmed decisions preserve their run and citations; private drafts stay out of public reports.

The Vue application registers tools through `document.modelContext`. Tools use bounded schemas, state-dependent availability, explicit actor attribution and paginated evidence. The API validates requests and persists immutable strategy versions, deterministic results and confirmed decisions. Case creation supports safe retries. A pinned sample checks its data provenance, hash and engine version before running. Missing real data produces an explicit error.

Before submitting this draft, add the verified deployment, public source and final video links. Describe real-data preparation as completed only after the deployed sample and its report have been checked.

## Five-minute user sessions

Ask three people who already inspect backtests or write trading rules to try the deployed build. This is a small usability pilot, not evidence that the strategies work. Invitations have not been sent and no feedback has been collected.

Give each participant the same task: "Investigate this rule, find a reason to trust or question the result, and record what you would do next." Avoid directing them to a particular verdict.

Observe whether they can:

1. Identify the exact rules and explain what their confirmation approves.
2. Distinguish actual saved history from synthetic software data.
3. Follow a finding to a trade or failure period without coaching.
4. Notice when the agent changes the visible selection, then steer it themselves.
5. Record a cited decision and explain what evidence would change their mind.

Record time to first evidence, task completion, unprompted mistakes and how often help was needed. Ask: "What did you conclude? Which evidence changed your mind? What would you normally use instead? What here was confusing or unnecessary?"

| Participant | First evidence time | Completed without help | Data source understood | Decision supported by citation | Confusion or exact feedback |
| --- | --- | --- | --- | --- | --- |
| 1 | Not tested | Not tested | Not tested | Not tested | |
| 2 | Not tested | Not tested | Not tested | Not tested | |
| 3 | Not tested | Not tested | Not tested | Not tested | |

Fix any case where a participant mistakes generated prices for real evidence or thinks the agent can approve a strategy. With three sessions, report observations and counts, not broad claims about adoption or market impact.
