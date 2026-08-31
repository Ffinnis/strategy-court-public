<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ArrowRight, ChevronRight, CircleAlert, Database, ExternalLink, Filter, Search, X } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import FormSelect from "@/components/forms/FormSelect.vue";
import type { FailureEvidence, Trade } from "@/types";
import { trappedFocusTarget } from "@/services/focusTrap";

const CandlestickEvidenceChart = defineAsyncComponent(() => import("@/charts/CandlestickEvidenceChart.vue"));

const store = useCourtStore();
const selectedFailure = computed(() => store.selectedFailure);
const selectedTrade = computed(() => store.selectedTrade);
const dialog = ref<HTMLElement | null>(null);
const failureRetryButton = ref<HTMLButtonElement | null>(null);
const failureDetailLoading = computed(() => store.evidenceSelection?.status === "loading");
const failureInspectionFailed = computed(() => store.evidenceSelection?.status === "error");
let previousFocus: HTMLElement | null = null;

const tradeFilter = ref("All");
const signalStatusFilter = ref("All");
const signalSymbolFilter = ref("All");
const signalPage = ref(1);
const signalPageSize = 100;
const visibleTrades = computed(() => tradeFilter.value === "All" ? store.result?.trades ?? [] : (store.result?.trades ?? []).filter((trade) => trade.symbol === tradeFilter.value));
const symbols = computed(() => ["All", ...new Set((store.result?.trades ?? []).map((trade) => trade.symbol))]);
const signalSymbols = computed(() => ["All", ...new Set((store.result?.signalDiagnostics ?? []).map((event) => event.symbol))]);
const tradeFilterOptions = computed(() => symbols.value.map((symbol) => ({ value: symbol, label: symbol })));
const signalStatusOptions = ["All", "Skipped", "Rejected"].map((status) => ({ value: status, label: status }));
const signalSymbolOptions = computed(() => signalSymbols.value.map((symbol) => ({ value: symbol, label: symbol })));
const filteredSignals = computed(() => (store.result?.signalDiagnostics ?? []).filter((event) =>
  (signalStatusFilter.value === "All" || event.status === signalStatusFilter.value.toLowerCase())
  && (signalSymbolFilter.value === "All" || event.symbol === signalSymbolFilter.value)));
const signalPageCount = computed(() => Math.max(1, Math.ceil(filteredSignals.value.length / signalPageSize)));
const visibleSignals = computed(() => filteredSignals.value.slice((signalPage.value - 1) * signalPageSize, signalPage.value * signalPageSize));
const displayFailures = computed(() => {
  const runId = store.latestRun?.id;
  return (store.result?.failures ?? []).map((failure) => runId ? store.failureEvidenceCache[`${runId}:${failure.id}`] ?? failure : failure);
});
const formatMoney = (value: number) => `${value >= 0 ? "+" : "−"}$${Math.abs(value).toFixed(2)}`;
const formatQuantity = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const isReported = (value: string | undefined) => Boolean(value && value.trim().toLowerCase() !== "not reported");
const assumption = (key: string) => Object.entries(store.result?.assumptions ?? {}).find(([label]) => label.toLowerCase().includes(key.toLowerCase()))?.[1] ?? "Not reported";
const label = (value: string) => value.replaceAll(/[._-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
const failureCosts = computed(() => Object.entries(selectedFailure.value?.costs ?? {}).map(([key, value]) => ({ label: label(key), value: typeof value !== "number" ? String(value) : key.toLowerCase().includes("bps") ? `${value.toLocaleString()} bps per side` : key.toLowerCase().includes("cost") ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : value.toLocaleString(undefined, { maximumFractionDigits: 4 }) })));
const indicatorInputs = computed(() => Array.isArray(selectedFailure.value?.indicatorEvidence?.inputs) ? selectedFailure.value.indicatorEvidence.inputs : []);
const indicatorSeries = computed(() => Array.isArray(selectedFailure.value?.indicatorEvidence?.values) ? selectedFailure.value.indicatorEvidence.values : []);
const describeIndicator = (value: unknown) => { const item = value && typeof value === "object" ? value as Record<string, unknown> : {}; return `${String(item.indicator ?? "Indicator")} ${JSON.stringify(item.parameters ?? {})}`; };
const describeSeries = (value: unknown) => { const item = value && typeof value === "object" ? value as Record<string, unknown> : {}; const values = Array.isArray(item.values) ? item.values : []; const latest = [...values].reverse().find((point) => point && typeof point === "object" && (point as Record<string, unknown>).value != null) as Record<string, unknown> | undefined; return `${String(item.symbol ?? "All symbols")} · ${String(item.indicator ?? "indicator")} · ${values.length} period points${latest ? ` · latest ${String(latest.value)}` : ""}`; };
const fillPlot = computed(() => {
  const trade = selectedTrade.value;
  if (!trade) return null;
  const low = Math.min(trade.entryPrice, trade.exitPrice);
  const high = Math.max(trade.entryPrice, trade.exitPrice);
  const padding = Math.max((high - low) * 0.35, high * 0.015, 1);
  const domainLow = low - padding;
  const domainHigh = high + padding;
  const y = (price: number) => 28 + ((domainHigh - price) / (domainHigh - domainLow)) * 88;
  return { entryY: y(trade.entryPrice), exitY: y(trade.exitPrice) };
});
async function loadFailureDetails() {
  await store.enrichFailures();
}
async function chooseEvidence(kind: "failure" | "trade", id: string, event?: Event) {
  if (event?.currentTarget instanceof HTMLElement) previousFocus = event.currentTarget;
  try { await store.selectEvidence(store.latestRun?.id ?? "", { kind, id }); }
  catch { /* The selected inspector displays the error and retry control. */ }
}
async function openFailure(failure: FailureEvidence, event: Event) { await chooseEvidence("failure", failure.id, event); }
async function openTrade(trade: Trade, event?: Event) { if (trade.id) await chooseEvidence("trade", trade.id, event); }
async function openChartTrade(id: string) {
  const trade = store.result?.trades.find(item => item.id === id);
  if (trade) await openTrade(trade);
}
async function retrySelectedFailure() {
  if (selectedFailure.value) await chooseEvidence("failure", selectedFailure.value.id);
}
function closeDialog() {
  store.clearEvidenceSelection();
  nextTick(() => (previousFocus?.isConnected ? previousFocus : document.querySelector<HTMLElement>('[aria-controls="panel-evidence"]'))?.focus());
}
watch(() => store.evidenceSelection?.revision, async (revision) => {
  if (revision === undefined) return;
  await nextTick();
  dialog.value?.focus();
}, { immediate: true });
function handleDialogKey(event: KeyboardEvent) {
  if (!selectedFailure.value && !selectedTrade.value) return;
  if (event.key === "Escape") { event.preventDefault(); closeDialog(); return; }
  if (event.key !== "Tab" || !dialog.value) return;
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((item) => !item.hasAttribute("disabled"));
  if (!focusable.length) return;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const target = trappedFocusTarget(active, dialog.value, focusable, event.shiftKey);
  if (target) { event.preventDefault(); target.focus(); }
}
window.addEventListener("keydown", handleDialogKey);
onBeforeUnmount(() => window.removeEventListener("keydown", handleDialogKey));
watch(() => `${store.latestRun?.id ?? ""}:${(store.result?.failures ?? []).map((failure) => failure.id).join(",")}`, () => { void loadFailureDetails(); }, { immediate: true });
watch([signalStatusFilter, signalSymbolFilter], () => { signalPage.value = 1; });
</script>

<template>
  <div class="evidence-tab-root">
    <section v-if="!store.courtComplete || store.courtInvalid" class="evidence-empty">
      <Database :size="20" aria-hidden="true" />
      <h3>{{ store.courtInvalid ? "No historical result" : "No admitted evidence" }}</h3>
      <p>{{ store.courtInvalid ? "The run was invalid, so no metrics, trades or charts were produced." : "Complete the Court run first." }}</p>
      <button class="button button--secondary" @click="store.activeTab = 'court'">{{ store.courtInvalid ? "Review and retry" : "Open Court" }} <ArrowRight :size="15" /></button>
    </section>

    <div v-else class="evidence-stack">
      <CandlestickEvidenceChart
        :focus="store.evidenceFocus"
        @select-trade="openChartTrade"
        :evidence="store.result?.marketEvidence ?? {}"
        :trades="store.result?.trades ?? []"
        :error="store.latestRun?.error ?? ''"
      />

      <section class="trades-section" aria-labelledby="trades-heading">
        <header class="section-heading section-heading--flat">
          <div>
            <p class="eyebrow">Ledger</p>
            <h2 id="trades-heading">Completed trades</h2>
          </div>
          <div class="table-filter">
            <Filter :size="13" aria-hidden="true" />
            <label class="sr-only" for="trade-filter">Filter trades by symbol</label>
            <FormSelect
              id="trade-filter"
              v-model="tradeFilter"
              class="trade-filter-select"
              :options="tradeFilterOptions"
              aria-label="Filter trades by symbol"
            />
          </div>
        </header>

        <div class="trade-table-wrap">
          <table>
            <caption class="sr-only">Completed trades recorded by this Court run</caption>
            <colgroup>
              <col class="trade-column--trade" />
              <col class="trade-column--period" />
              <col class="trade-column--price" />
              <col class="trade-column--price" />
              <col class="trade-column--pnl" />
              <col class="trade-column--reason" />
              <col class="trade-column--view" />
            </colgroup>
            <thead><tr><th>Trade</th><th>Period</th><th>Entry</th><th>Exit</th><th>P&amp;L</th><th>Reason</th><th>View</th></tr></thead>
            <tbody>
              <tr v-for="trade in visibleTrades" :key="trade.id">
                <td><div class="trade-identity"><strong class="symbol">{{ trade.symbol }}</strong><small>{{ formatQuantity(trade.quantity) }} shares</small></div></td>
                <td><span class="mono trade-period">{{ trade.entryDate }} <span aria-hidden="true">→</span> {{ trade.exitDate }}</span></td>
                <td><span class="mono trade-price">${{ trade.entryPrice.toFixed(2) }}</span></td>
                <td><span class="mono trade-price">${{ trade.exitPrice.toFixed(2) }}</span></td>
                <td><span class="mono trade-pnl" :class="trade.netProfit >= 0 ? 'trade-pnl--positive' : 'trade-pnl--negative'">{{ formatMoney(trade.netProfit) }}</span></td>
                <td><span class="trade-reason" :title="trade.exitReason">{{ trade.exitReason }}</span></td>
                <td><button class="inspect-button" type="button" :aria-label="`Inspect ${trade.symbol} trade from ${trade.entryDate}`" @click="openTrade(trade, $event)"><Search :size="14" /></button></td>
              </tr>
            </tbody>
          </table>
          <p v-if="!visibleTrades.length" class="empty-line">No trades match this symbol.</p>
        </div>
      </section>

      <section class="failure-surface" aria-labelledby="failure-heading">
        <header class="section-heading">
          <div>
            <p class="eyebrow">Risk review</p>
            <h2 id="failure-heading">Stress periods</h2>
          </div>
          <span class="failure-count">{{ displayFailures.length }} {{ displayFailures.length === 1 ? "period" : "periods" }}</span>
        </header>

        <div v-if="store.failureLoading || store.failureEvidenceError" class="enrichment-state" role="status">
          <template v-if="store.failureLoading">
            <span class="enrichment-state__pulse" aria-hidden="true" />
            <span>Updating period details…</span>
          </template>
          <template v-else>
            <CircleAlert :size="14" aria-hidden="true" />
            <span>Some period details are unavailable.</span>
            <button type="button" :title="store.failureEvidenceError ?? undefined" @click="loadFailureDetails">Try again</button>
          </template>
        </div>
        <div v-if="displayFailures.length" class="failure-list">
          <button
            v-for="(failure, index) in displayFailures"
            :key="failure.id"
            class="failure-row"
            type="button"
            @click="openFailure(failure, $event)"
          >
            <span class="failure-row__index">{{ String(index + 1).padStart(2, "0") }}</span>
            <span class="failure-row__body">
              <strong>{{ failure.title }}</strong>
              <small>
                <span>{{ failure.period }}</span>
                <template v-if="isReported(failure.regime)"><i /><span>{{ failure.regime }}</span></template>
              </small>
            </span>
            <span class="failure-row__change" :class="{ 'failure-row__change--missing': !isReported(failure.equityChange) }">{{ isReported(failure.equityChange) ? failure.equityChange : "—" }}</span>
            <ChevronRight :size="16" aria-hidden="true" />
          </button>
        </div>
        <p v-else class="empty-line">No failure periods were returned.</p>
      </section>

      <details class="assumptions signal-ledger">
        <summary><span>Skipped and rejected signals</span><small>{{ store.result?.signalDiagnostics.length ?? 0 }} inspectable events</small></summary>
        <div class="signal-controls">
          <div class="signal-control">
            <label for="signal-status-filter">Status</label>
            <FormSelect id="signal-status-filter" v-model="signalStatusFilter" class="signal-select" :options="signalStatusOptions" aria-label="Signal status" />
          </div>
          <div class="signal-control">
            <label for="signal-symbol-filter">Symbol</label>
            <FormSelect id="signal-symbol-filter" v-model="signalSymbolFilter" class="signal-select" :options="signalSymbolOptions" aria-label="Signal symbol" />
          </div>
        </div>
        <div class="trade-table-wrap signal-table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Symbol</th><th>Signal</th><th>Status</th><th>Reason</th></tr></thead>
            <tbody><tr v-for="(event,index) in visibleSignals" :key="`${event.date}:${event.symbol}:${event.signal}:${event.status}:${index}`"><td class="mono">{{ event.date }}</td><td><strong class="symbol">{{ event.symbol }}</strong></td><td>{{ event.signal }}</td><td>{{ event.status }}</td><td>{{ event.reason }}</td></tr></tbody>
          </table>
          <p v-if="!visibleSignals.length" class="empty-line">No signal events match these filters.</p>
        </div>
        <nav v-if="signalPageCount > 1" class="signal-pagination" aria-label="Signal ledger pages"><button type="button" :disabled="signalPage === 1" @click="signalPage -= 1">Previous</button><span>Page {{ signalPage }} of {{ signalPageCount }}</span><button type="button" :disabled="signalPage === signalPageCount" @click="signalPage += 1">Next</button></nav>
      </details>

      <details class="assumptions">
        <summary><span>Run assumptions</span><small>Engine, costs, provenance</small></summary>
        <dl>
          <div v-for="(value,key) in store.result?.assumptions" :key="key"><dt>{{ key }}</dt><dd>{{ value }}</dd></div>
          <div><dt>Engine</dt><dd class="mono">{{ store.result?.engineVersion }}</dd></div>
          <div><dt>Reproducibility ID</dt><dd class="mono">{{ store.result?.reproducibilityId }}</dd></div>
        </dl>
      </details>
    </div>

  <Teleport to="body">
    <div v-if="selectedFailure" class="drawer-backdrop" @click.self="closeDialog">
      <aside ref="dialog" class="evidence-drawer" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="failure-title">
        <div class="drawer-header"><div><p v-if="store.evidenceSelection?.actor === 'agent'" role="status">Selected by agent</p><p class="eyebrow">Stress period</p><h2 id="failure-title">{{ selectedFailure.title }}</h2></div><button class="drawer-close" type="button" aria-label="Close evidence inspector" @click="closeDialog"><X :size="18" /></button></div>
        <div class="drawer-body">
          <div class="drawer-period"><span>{{ selectedFailure.period }}</span><strong class="negative">{{ selectedFailure.equityChange }}</strong></div><p class="drawer-summary">{{ selectedFailure.summary }}</p>
          <div
            v-if="failureDetailLoading || failureInspectionFailed"
            class="drawer-evidence-status"
            :class="{ 'drawer-evidence-status--error': failureInspectionFailed && !failureDetailLoading }"
            :role="failureInspectionFailed && !failureDetailLoading ? 'alert' : 'status'"
          >
            <CircleAlert v-if="failureInspectionFailed" :size="14" aria-hidden="true" />
            <span>{{ failureDetailLoading ? (failureInspectionFailed ? "Trying again…" : "Loading complete period details…") : store.evidenceSelection?.error ?? "Complete period details could not be loaded." }}</span>
            <button
              v-if="failureInspectionFailed"
              ref="failureRetryButton"
              type="button"
              :disabled="failureDetailLoading"
              @click="retrySelectedFailure"
            >{{ failureDetailLoading ? "Trying again…" : "Try again" }}</button>
          </div>
          <div class="evidence-label">Observed inputs</div><dl class="input-list"><div v-for="input in selectedFailure.inputs" :key="input.label"><dt>{{ input.label }}</dt><dd>{{ input.value }}</dd></div></dl>
          <template v-if="failureCosts.length"><div class="evidence-label">Returned execution costs</div><dl class="input-list"><div v-for="cost in failureCosts" :key="cost.label"><dt>{{ cost.label }}</dt><dd>{{ cost.value }}</dd></div></dl></template>
          <template v-if="indicatorInputs.length || indicatorSeries.length"><div class="evidence-label">Returned indicator evidence</div><dl class="input-list"><div v-for="(input,index) in indicatorInputs" :key="`input-${index}`"><dt>Declared indicator</dt><dd>{{ describeIndicator(input) }}</dd></div><div v-for="(series,index) in indicatorSeries" :key="`series-${index}`"><dt>Observed series</dt><dd>{{ describeSeries(series) }}</dd></div></dl></template>
          <div class="evidence-label">Market context</div><div class="context-grid"><div><span>Regime</span><strong>{{ selectedFailure.regime }}</strong></div><div><span>Symbols involved</span><strong>{{ selectedFailure.symbols.join(" · ") || "None in returned period" }}</strong></div><div><span>Execution</span><strong>{{ assumption("execution") }}</strong></div><div><span>Period bars returned</span><strong>{{ selectedFailure.marketBars?.length ?? 0 }}</strong></div></div><div class="drawer-callout"><CircleAlert :size="15" /><span>Historical evidence, not a forecast.</span></div>
        </div>
        <div class="drawer-footer"><button class="button button--secondary" @click="closeDialog">Close</button><button class="button" @click="closeDialog(); store.activeTab = 'court'">Review investigation decision <ExternalLink :size="14" /></button></div>
      </aside>
    </div>

    <div v-if="selectedTrade" class="drawer-backdrop" @click.self="closeDialog">
      <aside ref="dialog" class="evidence-drawer evidence-drawer--trade" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="trade-title">
        <div class="drawer-header"><div><p v-if="store.evidenceSelection?.actor === 'agent'" role="status">Selected by agent</p><p class="eyebrow">Recorded trade</p><h2 id="trade-title" class="trade-ticker">{{ selectedTrade.symbol }}</h2></div><button class="drawer-close" type="button" aria-label="Close trade inspector" @click="closeDialog"><X :size="18" /></button></div>
        <div class="drawer-body">
          <div class="trade-result">
            <span>Net profit</span>
            <strong :class="selectedTrade.netProfit >= 0 ? 'positive' : 'negative'">{{ formatMoney(selectedTrade.netProfit) }}</strong>
          </div>

          <figure v-if="fillPlot" class="fill-plot">
            <svg viewBox="0 0 360 196" role="img" aria-labelledby="fill-chart-title fill-chart-description">
              <title id="fill-chart-title">{{ selectedTrade.symbol }} recorded fills</title>
              <desc id="fill-chart-description">Entry at {{ selectedTrade.entryPrice.toFixed(2) }} on {{ selectedTrade.entryDate }}, exit at {{ selectedTrade.exitPrice.toFixed(2) }} on {{ selectedTrade.exitDate }}.</desc>
              <line v-for="y in [36, 72, 108]" :key="y" x1="38" :y1="y" x2="322" :y2="y" class="fill-plot__guide" />
              <line x1="48" :y1="fillPlot.entryY" x2="312" :y2="fillPlot.exitY" class="fill-plot__connector" />
              <circle cx="48" :cy="fillPlot.entryY" r="5" class="fill-plot__point fill-plot__point--entry" />
              <circle cx="312" :cy="fillPlot.exitY" r="5" class="fill-plot__point" />
              <text x="48" :y="fillPlot.entryY - 11" text-anchor="start" class="fill-plot__price">${{ selectedTrade.entryPrice.toFixed(2) }}</text>
              <text x="312" :y="fillPlot.exitY - 11" text-anchor="end" class="fill-plot__price">${{ selectedTrade.exitPrice.toFixed(2) }}</text>
              <text x="48" y="151" text-anchor="start" class="fill-plot__label">Entry</text>
              <text x="312" y="151" text-anchor="end" class="fill-plot__label">Exit</text>
              <text x="48" y="173" text-anchor="start" class="fill-plot__date">{{ selectedTrade.entryDate }}</text>
              <text x="312" y="173" text-anchor="end" class="fill-plot__date">{{ selectedTrade.exitDate }}</text>
            </svg>
            <figcaption>Recorded fills. Inspect the symbol’s daily bars in price evidence.</figcaption>
          </figure>

          <dl class="input-list trade-facts"><div><dt>Position</dt><dd>{{ formatQuantity(selectedTrade.quantity) }} shares</dd></div><div><dt>Costs deducted</dt><dd>${{ selectedTrade.costs.toFixed(2) }}</dd></div><div><dt>Exit reason</dt><dd>{{ selectedTrade.exitReason }}</dd></div><div><dt>Entry regime</dt><dd>{{ selectedTrade.regime }}</dd></div></dl>
        </div>
        <div class="drawer-footer"><button class="button button--secondary button--wide" @click="closeDialog">Done</button></div>
      </aside>
    </div>
  </Teleport>
  </div>
</template>

<style scoped lang="scss">
.evidence-tab-root {
  min-width: 0;
}

.evidence-stack {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 48px;
  padding: 12px 0 48px;
}

.evidence-empty {
  display: grid;
  min-height: 360px;
  place-items: center;
  align-content: center;
  gap: 12px;
  color: #777;
  text-align: center;
}

.evidence-empty h3,
.evidence-empty p {
  margin: 0;
}

.evidence-empty h3 {
  color: #ededed;
  font-size: 24px;
  letter-spacing: -.035em;
}

.evidence-empty p {
  margin-bottom: 8px;
  font-size: 12px;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 0 0 18px;
  color: #e7e7e7;
}

.section-heading--flat {
  padding: 0 0 20px;
}

.section-heading h2 {
  margin: 5px 0 0;
  color: #f3f3f3;
  font-size: clamp(23px, 2.4vw, 31px);
  font-weight: 560;
  line-height: 1;
  letter-spacing: -.045em;
}

.eyebrow {
  display: inline-flex;
  width: max-content;
  margin: 0;
  padding: 4px 7px;
  border: 1px solid rgba(255, 255, 255, .09);
  border-radius: 2px;
  color: #969696;
  background: rgba(255, 255, 255, .025);
  font: 600 10px Inter, ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0;
  text-transform: none;
}

.failure-surface {
  border-block: 1px solid rgba(255, 255, 255, .1);
  padding-block: 24px 4px;
}

.failure-list {
  border-top: 1px solid rgba(255, 255, 255, .075);
}

.failure-row {
  display: grid;
  width: 100%;
  grid-template-columns: 38px minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 18px;
  padding: 18px 2px;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, .065);
  color: #777;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}

.failure-row:last-child {
  border-bottom: 0;
}

.failure-row:hover,
.failure-row:focus-visible {
  color: #f0f0f0;
  background: #171717;
  outline: 0;
}

.failure-row:focus-visible {
  box-shadow: inset 0 0 0 1px #f1f1f1;
}

.failure-row__index {
  color: #595959;
  font: 600 10px Inter, ui-sans-serif, system-ui, sans-serif;
}

.failure-row__body {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.failure-row__body strong {
  overflow: hidden;
  color: #dedede;
  font-size: 14px;
  font-weight: 530;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.failure-row__body small {
  display: flex;
  align-items: center;
  gap: 9px;
  overflow: hidden;
  color: #777;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.failure-row__body i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #4b4b4b;
}

.failure-row__change {
  color: #e8e8e8;
  font: 500 12px "IBM Plex Mono", monospace;
}

.failure-row__change--missing {
  color: #5e5e5e;
}

.failure-count {
  padding-top: 5px;
  color: #707070;
  font-size: 11px;
}

.enrichment-state {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 10px 2px;
  border-top: 1px solid rgba(255, 255, 255, .07);
  color: #8d8d8d;
  background: rgba(255, 255, 255, .018);
  font-size: 11px;
}

.enrichment-state button {
  margin-left: 2px;
  padding: 0;
  border: 0;
  color: #d6d6d6;
  background: transparent;
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.enrichment-state button:hover,
.enrichment-state button:focus-visible {
  color: #fff;
}

.enrichment-state__pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #aaa;
}

.empty-line {
  margin: 0;
  padding: 24px 2px;
  color: #858585;
  font-size: 11px;
}

.trades-section {
  min-width: 0;
}

.table-filter {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #777;
}

.trade-filter-select {
  width: 86px;
}

.trade-filter-select :deep(.form-select__trigger) {
  min-height: 30px;
  padding: 0 5px;
  border: 0;
  border-bottom: 1px solid #3a3a3a;
  border-radius: 0;
  color: #c5c5c5;
  background: transparent;
  box-shadow: none;
  font-size: 11px;
}

.trade-filter-select :deep(.form-select__trigger:hover:not(:disabled)),
.trade-filter-select :deep(.form-select__trigger:focus-visible) {
  border-color: #ededed;
  background: transparent;
  box-shadow: none;
}

.trade-filter-select :deep(.form-select__trigger:focus-visible) { outline-offset: 2px; }
.trade-filter-select :deep(.form-select__value) { font-size: 11px; }
.trade-filter-select :deep(.form-select__listbox) { right: 0; left: auto; min-width: 110px; }
.trade-filter-select :deep(.form-select__option) { min-height: 34px; font-size: 11px; }

.trade-table-wrap {
  overflow-x: auto;
  border-top: 1px solid rgba(255, 255, 255, .11);
  scrollbar-color: #333 transparent;
}

.trade-table-wrap table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
  white-space: nowrap;
}

.trade-column--trade { width: 15%; }
.trade-column--period { width: 23%; }
.trade-column--price { width: 11%; }
.trade-column--pnl { width: 13%; }
.trade-column--reason { width: 20%; }
.trade-column--view { width: 64px; }

.trade-table-wrap th {
  position: sticky;
  z-index: 1;
  top: 0;
  padding: 13px 14px;
  color: #838383;
  background: #080808;
  font: 600 10px Inter, ui-sans-serif, system-ui, sans-serif;
  text-align: left;
  text-transform: none;
  letter-spacing: 0;
}

.trade-table-wrap th:first-child,
.trade-table-wrap td:first-child {
  padding-left: 0;
}

.trade-table-wrap th:last-child,
.trade-table-wrap td:last-child {
  padding-right: 0;
}

.trade-table-wrap td {
  padding: 15px 14px;
  border-top: 1px solid rgba(255, 255, 255, .065);
  color: #b8b8b8;
  vertical-align: middle;
}

.trade-table-wrap tbody tr {
  transition: background 140ms ease;
}

.trade-table-wrap tbody tr:hover {
  background: rgba(255, 255, 255, .025);
}

.trade-identity {
  display: grid;
  gap: 5px;
}

.trade-identity small {
  color: #777;
  font-size: 10px;
}

.trade-period,
.trade-price,
.trade-pnl {
  color: #c1c1c1;
  font-size: 11px;
}

.trade-pnl {
  font-weight: 600;
}

.trade-pnl--positive {
  color: #87b99a;
}

.trade-pnl--negative {
  color: #cf8e87;
}

.trade-reason {
  display: block;
  overflow: hidden;
  color: #b0b0b0;
  text-overflow: ellipsis;
}

.symbol {
  color: #eeeeee;
  font-family: "IBM Plex Mono", monospace;
  font-size: 12px;
}

.inspect-button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid #333;
  border-radius: 8px;
  color: #b8b8b8;
  background: #111;
  cursor: pointer;
}

.inspect-button:hover,
.inspect-button:focus-visible {
  border-color: #e5e5e5;
  color: #fff;
  outline: 0;
}

.assumptions {
  border-top: 1px solid rgba(255, 255, 255, .1);
  color: #aaa;
}

.assumptions summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 0;
  color: #d6d6d6;
  cursor: pointer;
  list-style: none;
}

.assumptions summary::-webkit-details-marker {
  display: none;
}

.assumptions summary::before {
  content: "+";
  order: 3;
  color: #777;
  font: 500 17px Inter, ui-sans-serif, system-ui, sans-serif;
}

.assumptions[open] summary::before {
  content: "−";
}

.assumptions summary span {
  font-size: 13px;
}

.assumptions summary small {
  margin-left: auto;
  color: #606060;
  font-size: 10px;
}

.assumptions dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 42px;
  margin: 0;
  padding: 0 0 24px;
}

.assumptions dl div {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, .055);
  font-size: 10px;
}

.signal-controls{display:flex;flex-wrap:wrap;gap:12px;padding:2px 0 18px}.signal-control{display:flex;align-items:center;gap:8px}.signal-control label{color:#686868;font-size:10px}.signal-select{width:110px}.signal-select :deep(.form-select__trigger){min-height:32px;padding:0 8px;border:1px solid #303030;border-radius:8px;color:#ccc;background:#151515;box-shadow:none}.signal-select :deep(.form-select__trigger:hover:not(:disabled)),.signal-select :deep(.form-select__trigger:focus-visible){border-color:#555;background:#181818;box-shadow:none}.signal-select :deep(.form-select__value){font-size:10px}.signal-select :deep(.form-select__listbox){min-width:110px}.signal-select :deep(.form-select__option){min-height:34px;font-size:11px}.signal-pagination{display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:14px 0 22px;color:#777;font-size:10px}.signal-pagination button{min-height:30px;padding:0 10px;border:1px solid #303030;border-radius:8px;color:#bbb;background:#151515;cursor:pointer}.signal-pagination button:disabled{opacity:.35;cursor:default}

.assumptions dt {
  color: #626262;
}

.assumptions dd {
  margin: 0;
  color: #aaa;
  text-align: right;
  overflow-wrap: anywhere;
}

.sr-only {
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.drawer-backdrop {
  position: fixed;
  z-index: 150;
  inset: 0;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, .7);
  backdrop-filter: blur(4px);
}

.evidence-drawer {
  display: flex;
  width: min(560px, 100%);
  height: 100%;
  flex-direction: column;
  border-left: 1px solid rgba(255, 255, 255, .12);
  background: #101010;
  box-shadow: -42px 0 120px rgba(0, 0, 0, .72);
  animation: drawer-in 180ms ease-out;
}

@keyframes drawer-in {
  from { transform: translateX(32px); opacity: .4; }
}

.evidence-drawer--trade {
  width: min(480px, 100%);
}

.drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 15px;
  padding: 27px 28px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, .08);
}

.drawer-header h2 {
  margin: 6px 0 0;
  color: #f1f1f1;
  font-size: 27px;
  font-weight: 540;
  line-height: 1.12;
  letter-spacing: -.045em;
}

.drawer-close {
  display: grid;
  flex: 0 0 34px;
  height: 34px;
  place-items: center;
  border: 1px solid #333;
  border-radius: 2px;
  color: #999;
  background: transparent;
  cursor: pointer;
}

.drawer-close:hover,
.drawer-close:focus-visible {
  border-color: #eee;
  color: #fff;
  outline: 0;
}

.drawer-body {
  flex: 1;
  overflow: auto;
  padding: 28px;
}

.drawer-period {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
  border-block: 1px solid rgba(255, 255, 255, .09);
  font: 10px "IBM Plex Mono", monospace;
}

.drawer-summary {
  margin: 22px 0;
  color: #aaa;
  font-size: 13px;
  line-height: 1.65;
}

.drawer-evidence-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  border-block: 1px solid rgba(255, 255, 255, .08);
  color: #8d8d8d;
  font-size: 11px;
  line-height: 1.45;
}

.drawer-evidence-status--error {
  color: #b9b9b9;
}

.drawer-evidence-status button {
  flex: 0 0 auto;
  margin-left: auto;
  padding: 0;
  border: 0;
  color: #e3e3e3;
  background: transparent;
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.drawer-evidence-status button:hover,
.drawer-evidence-status button:focus-visible {
  color: #fff;
}

.drawer-evidence-status button:disabled {
  color: #777;
  cursor: wait;
}

.evidence-label {
  margin: 28px 0 9px;
  color: #858585;
  font: 600 10px Inter, ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0;
  text-transform: none;
}

.input-list {
  margin: 0;
  padding: 0;
  border-top: 1px solid rgba(255, 255, 255, .085);
}

.input-list div {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 13px 0;
  border-bottom: 1px solid rgba(255, 255, 255, .065);
  font-size: 11px;
}

.input-list dt {
  color: #737373;
}

.input-list dd {
  margin: 0;
  color: #c4c4c4;
  text-align: right;
}

.context-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  overflow: hidden;
  border: 1px solid #292929;
  background: #292929;
}

.context-grid div {
  display: grid;
  gap: 6px;
  padding: 15px;
  background: #141414;
}

.context-grid span {
  color: #666;
  font-size: 9px;
}

.context-grid strong {
  color: #b8b8b8;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.45;
}

.drawer-callout {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 22px;
  color: #777;
  font-size: 10px;
  line-height: 1.5;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 28px;
  border-top: 1px solid rgba(255, 255, 255, .08);
}

.trade-result {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.trade-result span {
  color: #777;
  font-size: 10px;
}

.trade-result strong {
  font: 500 26px "IBM Plex Mono", monospace;
  letter-spacing: -.04em;
}

.fill-plot {
  margin: 0 0 30px;
  border: 1px solid rgba(255, 255, 255, .11);
  background: #0b0b0b;
  box-shadow: 0 24px 60px rgba(0, 0, 0, .5);
}

.fill-plot svg {
  display: block;
  width: 100%;
  height: auto;
}

.fill-plot__guide {
  stroke: #222;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.fill-plot__connector {
  stroke: #bbb;
  stroke-width: 1.5;
  stroke-dasharray: 5 5;
  vector-effect: non-scaling-stroke;
}

.fill-plot__point {
  fill: #f0f0f0;
  stroke: #0b0b0b;
  stroke-width: 3;
  vector-effect: non-scaling-stroke;
}

.fill-plot__point--entry {
  fill: #888;
}

.fill-plot__price,
.fill-plot__date {
  font-family: "IBM Plex Mono", monospace;
}

.fill-plot__price {
  fill: #dedede;
  font-size: 10px;
}

.fill-plot__label {
  fill: #656565;
  font: 600 9px Inter, ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0;
}

.trade-ticker {
  font-family: "IBM Plex Mono", monospace;
}

.fill-plot__date {
  fill: #a2a2a2;
  font-size: 9px;
}

.fill-plot figcaption {
  padding: 0 18px 16px;
  color: #616161;
  font-size: 9px;
  line-height: 1.5;
}

.trade-facts {
  margin-top: 6px;
}

@media (max-width: 760px) {
  .evidence-stack {
    gap: 40px;
    padding-top: 0;
  }

  .failure-row {
    grid-template-columns: 26px minmax(0, 1fr) auto;
    gap: 12px;
    padding: 17px 2px;
  }

  .failure-row > svg {
    display: none;
  }

  .section-heading {
    padding: 0 0 17px;
  }

  .section-heading--flat {
    padding: 0 0 18px;
  }

  .assumptions dl {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .failure-row__change {
    display: none;
  }

  .failure-row {
    grid-template-columns: 22px minmax(0, 1fr);
  }

  .section-heading h2 {
    font-size: 27px;
  }

  .section-heading--flat {
    align-items: flex-end;
  }

  .assumptions summary small {
    display: none;
  }

  .context-grid {
    grid-template-columns: 1fr;
  }

  .drawer-body,
  .drawer-header {
    padding-inline: 20px;
  }

  .drawer-footer {
    display: grid;
    padding-inline: 20px;
  }
}
</style>
