# Strategy Court video script

Target length: 2 minutes 50 seconds. The recording must be public, include audio, and stay under the hackathon's three-minute limit.

## Recording setup

- Record the production app at <https://strategy-court-production.up.railway.app/>.
- Put Strategy Court and the WebMCP agent side by side. Keep browser zoom at 100% and use a 1440 px or wider recording canvas.
- Create a fresh case with the same SPY/SMA 20 rules below, draft the strategy, and stop before confirmation. This lets the recording show the human-only confirmation boundary.
- Keep the `Generated prices` disclosure visible when the Court result appears.
- Use the actual IDs and findings returned during recording. Do not paste IDs from another account.
- Cut waiting time after starting Court, but show a short `Run completed` transition. Do not simulate tool calls or results.
- Hide email addresses, passwords, tokens, cookies, and provider credentials.
- Preserve access to the QA account that owns case `43613d27-4f8c-4ef0-94b1-049103ba7e54`. That clean case is a fallback for the post-run evidence and decision sequence only. It cannot show the unconfirmed-strategy transition because its rules are already confirmed.

### Recording strategy

- Name: `SPY SMA 20 trend investigation`
- Symbol: `SPY`
- Range: `2020-01-02` through `2024-12-31`
- Initial capital: `$10,000`
- Commission: `0` basis points per side
- Slippage: `5` basis points per side
- Entry: daily SPY close is above SMA 20 of close
- Exit: daily SPY close is below SMA 20 of close
- Direction: long only
- Signal: completed close
- Fill: next open, market order
- Data policy: frozen generated demo prices

## The 2:50 cut

| Time | Screen and action | Spoken copy |
| --- | --- | --- |
| 0:00–0:14 | Split view. Show the case and the agent. Keep the generated-price disclosure visible. | "A promising backtest can depend on a few trades. Strategy Court helps a person and an agent find that weakness before more capital or effort is committed. This demo uses generated prices, not market evidence." |
| 0:14–0:29 | Show the exact rules. Call `get_case_context` with `detail: strategy` and point to the version and `confirmed: false`. | "I ask for the current strategy. WebMCP returns the exact version, rules, and confirmation state from the case on screen. The agent does not infer application state from pixels." |
| 0:29–0:43 | Review entry, exit, costs, and execution in the interface. Click the confirmation control. Show that `run_court` becomes available. | "Before testing starts, I confirm the rules myself. There is no agent tool for this step. Strategy confirmation remains a human decision." |
| 0:43–1:01 | Call `run_court` with the confirmed version and frozen policy. Cut the wait. Show `Fragile` and the seven-test overview. | "Now the agent runs the Court against this exact version and frozen snapshot. Seven robustness tests examine evidence, execution, parameters, regimes, concentration, and risk. The inputs and engine version make the run reproducible." |
| 1:01–1:23 | Read context, use the returned `profit_concentration` failure ID, then call `inspect_failure_period`. Show Evidence opening and the chart focusing. | "The result is not a generic score. The agent opens one specific failure: the best five trades contribute more than all completed-trade net profit. The same evidence appears in the interface." |
| 1:23–1:50 | Add a short `Human changes the evidence` cut. Close the failure inspector, open Trades page 2, and select `trade-65`, September 29 to November 22, 2023, `+$3,552.38`. Call context again and highlight `actor: user`. | "I select the largest contributing trade myself. It produced $3,552.38. The agent reads that human selection, including who selected it, without screen scraping or a second copy of the case." |
| 1:50–2:10 | Call `propose_case_decision` with `profit_concentration` and `trade-65`. Show the private draft and citation links. | "The failure and its largest trade now support one conclusion. The agent drafts a cited rejection with uncertainty and a condition for revisiting it. The proposal is still private and unconfirmed." |
| 2:10–2:33 | In the interface, replace the vague revisit condition with the exact sentence shown below, then confirm. | "I make the revisit condition specific, then confirm the conclusion myself. The agent performs structured research, while the person owns the judgment. Strategy Court does not place orders." |
| 2:33–2:44 | Open Activity, reload the case, and show the persisted confirmed decision and its two citations. | "The confirmed decision survives reload, and both citations remain connected to the evidence." |
| 2:44–2:50 | End on the confirmed decision beside the WebMCP status. | "WebMCP makes this a shared investigation. The agent does the structured work, and the person keeps the decision." |

## Calls to prepare

Read the strategy:

```json
{
  "detail": "strategy"
}
```

Run the Court after human confirmation:

```json
{
  "caseId": "<CASE_ID>",
  "strategyVersionId": "<VERSION_ID>",
  "startDate": "2020-01-02",
  "endDate": "2024-12-31",
  "courtProfile": "balanced",
  "dataSnapshotPolicy": "frozen"
}
```

Read the completed investigation:

```json
{}
```

Inspect the returned concentration failure:

```json
{
  "runId": "<RUN_ID>",
  "failureId": "profit_concentration"
}
```

After the person selects the top contributing trade, call `get_case_context` again with `{}`. Confirm that it returns `trade-65` with `actor: user`, then use that ID in the draft:

```json
{
  "caseId": "<CASE_ID>",
  "runId": "<RUN_ID>",
  "requestId": "video-decision-20260902-a",
  "fields": {
    "outcome": "rejected",
    "rationale": "Reject further work on this version because the largest trade, trade-65, produced $3,552.38 and the best five trades exceed all completed-trade net profit, so the aggregate return is not broadly supported.",
    "evidenceRefs": [
      {
        "kind": "failure",
        "id": "profit_concentration"
      },
      {
        "kind": "trade",
        "id": "trade-65"
      }
    ],
    "uncertainties": "Generated prices validate the investigation workflow, not behavior on real market data.",
    "revisitCriteria": "Revisit after a display-approved real-data run."
  }
}
```

If the recorded run returns a different finding, change the narration and rationale to match it. Never force the result to fit this script.

During the human edit, replace the draft's revisit condition with: `Revisit only if a display-approved real-data run has enough completed trades, shows a broader profit distribution, and keeps drawdown and recovery within the accepted limits.`

## Final edit checklist

- Total duration is below 3:00.
- Voice is clear and music, if any, does not cover it.
- The first 15 seconds state the problem and the generated-data limitation.
- At least three real WebMCP calls and their returned state are legible.
- Human strategy confirmation and human decision confirmation are both visible.
- The video shows the two-way selection handoff.
- No credential, email, or session value is visible.
- Music, fonts, logos, screenshots, and other visible assets are owned, licensed, or permitted for submission.
- Captions use sentence case and match the spoken claims.
- The YouTube link works while signed out and is not age-restricted.
