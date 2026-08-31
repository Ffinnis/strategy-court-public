import { computed, ref, watch } from "vue";
import type { CourtResult, FailureEvidence } from "@/types";
import type { ApiActor } from "@/services/api";

export type EvidenceTarget = { kind: "failure" | "trade"; id: string };
interface Scope { caseId: string; versionId: string; runId: string }
export interface EvidenceSelection extends Scope, EvidenceTarget {
  actor: ApiActor;
  revision: number;
  status: "loading" | "ready" | "error";
  error: string | null;
}

export function useEvidenceSelection(options: {
  scope: () => Scope | null;
  result: () => CourtResult | undefined;
  failure: (runId: string, id: string) => FailureEvidence | undefined;
  inspect: (runId: string, id: string, actor: ApiActor, signal?: AbortSignal) => Promise<FailureEvidence | null>;
  open: () => void;
}) {
  const evidenceSelection = ref<EvidenceSelection | null>(null);
  let revision = 0;
  const scopeKey = () => JSON.stringify(options.scope());
  const clearEvidenceSelection = () => { revision++; evidenceSelection.value = null; };
  watch(scopeKey, clearEvidenceSelection, { flush: "sync" });
  const selectedTrade = computed(() => evidenceSelection.value?.kind === "trade"
    ? options.result()?.trades.find(trade => trade.id === evidenceSelection.value?.id) ?? null : null);
  const selectedFailure = computed(() => evidenceSelection.value?.kind === "failure"
    ? options.failure(evidenceSelection.value.runId,evidenceSelection.value.id)
      ?? options.result()?.failures.find(failure => failure.id === evidenceSelection.value?.id) ?? null : null);
  const evidenceFocus = computed(() => {
    const trade = selectedTrade.value;
    const failure = selectedFailure.value;
    if (trade) return { symbol: trade.symbol, start: trade.entryDate, end: trade.exitDate, tradeId: trade.id, revision: evidenceSelection.value!.revision };
    if (failure?.dateRange) return { symbol: failure.symbols[0] ?? failure.trades[0]?.symbol,
      ...failure.dateRange, revision: evidenceSelection.value!.revision };
    return null;
  });
  async function selectEvidence(runId: string, target: EvidenceTarget, actor: ApiActor = "user", signal?: AbortSignal) {
    const scope = options.scope();
    const result = options.result();
    if (!scope || scope.runId !== runId || !result || result.summaryLabel.toLowerCase() === "invalid") throw new Error("Select evidence from the currently displayed completed run.");
    const items = target.kind === "failure" ? result.failures : result.trades;
    if (!items.some(item => item.id === target.id)) throw new Error("That evidence does not belong to the displayed run.");
    signal?.throwIfAborted();
    const operation = ++revision;
    const initialScope = scopeKey();
    evidenceSelection.value = { ...scope,...target,actor,revision:operation,status:target.kind === "failure" ? "loading" : "ready",error:null };
    options.open();
    if (target.kind === "failure") {
      try {
        const failure = await options.inspect(runId,target.id,actor,signal);
        if (revision !== operation || scopeKey() !== initialScope) return null;
        if (!failure) throw new Error("Could not load this period's evidence. Retry the selected finding.");
        evidenceSelection.value = { ...evidenceSelection.value!,status:"ready" };
      } catch (error) {
        if (revision !== operation || scopeKey() !== initialScope) return null;
        evidenceSelection.value = { ...evidenceSelection.value!,status:"error",error:error instanceof Error ? error.message : "Evidence unavailable." };
        throw error;
      }
    }
    return target.kind === "failure" ? selectedFailure.value : selectedTrade.value;
  }
  return { evidenceSelection, selectedTrade, selectedFailure, evidenceFocus, selectEvidence, clearEvidenceSelection };
}
