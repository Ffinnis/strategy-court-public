/** Stable within the immutable, original trade array of a Court run. */
export function tradeEvidenceId(index: number): string { return `trade-${index}`; }

export type EvidenceReference = { kind: "verdict" | "failure" | "trade"; id: string };
export type DecisionOutcome = "rejected" | "needs_more_evidence" | "ready_for_replay";
export interface DecisionFields {
  outcome: DecisionOutcome;
  rationale: string;
  evidenceRefs: EvidenceReference[];
  uncertainties: string;
  revisitCriteria: string;
}
export interface InvestigationDecision extends DecisionFields {
  id: string;
  caseId: string;
  versionId: string;
  runId: string;
  state: "draft" | "confirmed";
  source: "user" | "agent";
  createdAt: string;
  confirmedAt: string | null;
  supersedesId: string | null;
}

export const decisionFieldsSchema = {
  type: "object", additionalProperties: false,
  required: ["outcome", "rationale", "evidenceRefs", "uncertainties", "revisitCriteria"],
  properties: {
    outcome: { type: "string", enum: ["rejected", "needs_more_evidence", "ready_for_replay"] },
    rationale: { type: "string", minLength: 1, maxLength: 2000 },
    evidenceRefs: { type: "array", minItems: 1, maxItems: 5, items: {
      type: "object", additionalProperties: false, required: ["kind", "id"],
      properties: { kind: { type: "string", enum: ["verdict", "failure", "trade"] }, id: { type: "string", minLength: 1, maxLength: 200 } },
    } },
    uncertainties: { type: "string", minLength: 1, maxLength: 2000 },
    revisitCriteria: { type: "string", minLength: 1, maxLength: 2000 },
  },
} as const;

export function parseDecisionFields(value: unknown): DecisionFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Decision fields must be an object.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !Object.hasOwn(decisionFieldsSchema.properties,key))) throw new Error("Unexpected decision field.");
  if (!["rejected", "needs_more_evidence", "ready_for_replay"].includes(String(input.outcome))) throw new Error("Choose a supported investigation outcome.");
  for (const key of ["rationale", "uncertainties", "revisitCriteria"] as const) {
    if (typeof input[key] !== "string" || !input[key].trim() || input[key].length > 2000) throw new Error(`${key} must contain 1 to 2,000 characters.`);
  }
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length < 1 || input.evidenceRefs.length > 5) throw new Error("Cite one to five pieces of evidence.");
  const refs: EvidenceReference[] = input.evidenceRefs.map(ref => {
    if (!ref || typeof ref !== "object" || Array.isArray(ref) || Object.keys(ref).some(key => key !== "kind" && key !== "id")
      || !["verdict", "failure", "trade"].includes(ref.kind) || typeof ref.id !== "string" || !ref.id.trim() || ref.id.length > 200) throw new Error("Invalid evidence reference.");
    return { kind: ref.kind, id: ref.id };
  });
  if (new Set(refs.map(ref => `${ref.kind}:${ref.id}`)).size !== refs.length) throw new Error("Evidence references must be distinct.");
  return { outcome: input.outcome as DecisionOutcome, rationale: String(input.rationale).trim(), evidenceRefs: refs,
    uncertainties: String(input.uncertainties).trim(), revisitCriteria: String(input.revisitCriteria).trim() };
}

export function evidenceReferenceExists(result: Record<string, unknown>, ref: EvidenceReference): boolean {
  if (ref.kind === "trade") return Array.isArray(result.trades) && result.trades.some((_, index) => tradeEvidenceId(index) === ref.id);
  const rows = result[ref.kind === "failure" ? "failures" : "verdicts"];
  return Array.isArray(rows) && rows.some((row, index) => row && typeof row === "object"
    && String(row.id ?? row.category ?? `${ref.kind}-${index + 1}`) === ref.id);
}
