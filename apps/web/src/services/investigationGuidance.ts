import type { InvestigationDecision } from "@strategy-court/schemas";

export function investigationGuidance(decision?: InvestigationDecision, summary?: string) {
  if (decision?.outcome === "rejected") return { title: "Investigation closed", detail: "The user chose to stop pursuing this version. Preserve the decision and evidence. Continue only if the user asks to revisit it." };
  if (decision?.outcome === "needs_more_evidence") return { title: "Gather the missing evidence", detail: decision.revisitCriteria };
  if (decision?.outcome === "ready_for_replay") return { title: "Ready to review replay", detail: "The user chose further historical testing. Replay remains a separate action with its existing eligibility checks." };
  return { title: "Record your conclusion", detail: summary === "Inconclusive"
    ? "Explain what the evidence cannot establish and what would answer the open question. Review a decision draft before confirming it."
    : "Inspect the findings, then decide whether to close this investigation, gather more evidence or continue to eligible replay. Test a variant only for an explicit hypothesis." };
}
