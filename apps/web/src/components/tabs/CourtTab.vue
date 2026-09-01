<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowRight, ChevronDown, CircleAlert, LoaderCircle, LockKeyhole, Play, RefreshCw, Scale } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import EvaluationWindow from "@/components/EvaluationWindow.vue";
import ExecutionTrace from "@/components/ExecutionTrace.vue";
import ParameterMatrix from "@/components/ParameterMatrix.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import { revealFinding } from "@/services/workspaceNavigation";
import CourtResultChart from "@/charts/CourtResultChart.vue";
import InvestigationDecision from "@/components/InvestigationDecision.vue";
import type { DataSnapshotPolicy } from "@strategy-court/schemas";

const store = useCourtStore();
const dataPolicy = ref<DataSnapshotPolicy>(store.currentCase?.sampleId ? "saved_sample" : "refresh");
const dataOptions = computed(() => [
  ...(store.currentCase?.sampleId ? [{ value: "saved_sample", label: "Saved history" }] : []),
  { value: "frozen", label: "Synthetic demo" }, { value: "refresh", label: "Fresh history" },
]);
async function inspectVerdict(verdict: NonNullable<typeof store.result>["verdicts"][number]) {
  if (verdict.failureId) {
    try { await store.selectEvidence(store.latestRun!.id, { kind: "failure", id: verdict.failureId }); }
    catch { /* Inspector owns retry. */ }
  } else revealFinding(verdict.id);
}
const failedRun = computed(() => store.latestRun?.status === "failed" || Boolean(store.latestRun?.error));
const invalidReason = computed(() => typeof store.result?.invalidReason === "string"
  ? store.result.invalidReason
  : store.result?.invalidReason?.message ?? "This strategy and data snapshot could not be evaluated safely.");
const primaryFinding = computed(() => {
  const verdicts = store.result?.verdicts ?? [];
  return verdicts.find((item) => item.status === "Fail")
    ?? verdicts.find((item) => item.status === "Warning")
    ?? verdicts.find((item) => item.status === "Inconclusive")
    ?? verdicts[0];
});
const failedCount = computed(() => (store.result?.verdicts ?? []).filter((item) => item.status === "Fail").length);
const warningCount = computed(() => (store.result?.verdicts ?? []).filter((item) => item.status === "Warning").length);
const inconclusiveCount = computed(() => (store.result?.verdicts ?? []).filter(item => item.status === "Inconclusive").length);
const resultExplanation = computed(() => {
  if (primaryFinding.value?.status === "Fail") {
    const explanations: Record<string, string> = {
      "Parameter stability": "Profitability did not hold up when the rules changed slightly.",
      "Execution resilience": "The strategy did not withstand the tested trading costs.",
      "Risk profile": "Losses or recovery time failed the risk test.",
    };
    return explanations[primaryFinding.value.category] ?? primaryFinding.value.finding;
  }
  if (store.result?.summaryLabel === "Inconclusive") return "There is not enough evidence to assess this strategy reliably.";
  return primaryFinding.value?.finding ?? "Review the returned tests before drawing a conclusion.";
});
const resultMetric = (source: Record<string, unknown> | undefined, key: string) => {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};
const signedPercent = (value: number | null) => value === null
  ? "Not reported"
  : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;
const drawdownPercent = (value: number | null) => value === null ? "Not reported" : `−${Math.abs(value).toFixed(1)}%`;
const evaluationTrades = computed(() => resultMetric(store.result?.outOfSampleMetrics, "numberOfTrades"));
const resultKpis = computed(() => {
  const netReturn = resultMetric(store.result?.rawMetrics, "netReturnPercent");
  const drawdown = resultMetric(store.result?.rawMetrics, "maximumDrawdownPercent");
  const trades = resultMetric(store.result?.rawMetrics, "numberOfTrades") ?? store.result?.trades.length ?? null;
  return [
    {
      label: "Net return",
      value: signedPercent(netReturn),
      detail: "After configured costs",
      tone: netReturn === null ? "neutral" : netReturn >= 0 ? "positive" : "negative",
    },
    {
      label: "Max drawdown",
      value: drawdownPercent(drawdown),
      detail: "Peak-to-trough loss",
      tone: drawdown === null ? "neutral" : "negative",
    },
    {
      label: "Profit factor",
      value: resultMetric(store.result?.rawMetrics, "profitFactor")?.toFixed(2) ?? "Not reported",
      detail: "Gross profits / gross losses",
      tone: "neutral",
    },
    {
      label: "Completed trades",
      value: trades === null ? "Not reported" : trades.toLocaleString(),
      detail: evaluationTrades.value === null ? "Evaluation count unavailable" : `${evaluationTrades.value.toLocaleString()} in evaluation`,
      tone: "neutral",
    },
  ];
});
const hasBenchmark = computed(() => (store.result?.equityCurve ?? []).some((point) => point.benchmark !== undefined));
const chartTitle = computed(() => hasBenchmark.value ? "Strategy vs SPY" : "Strategy equity");
const runCaption = computed(() => {
  const range = store.result?.dateRange;
  return [range ? `${range.start} — ${range.end}` : "", store.result?.assumptions.Provider ?? "API snapshot"].filter(Boolean).join(" · ");
});
const detailLabel = (value: string) => value.replaceAll(/([a-z])([A-Z])/g, (_, lower: string, upper: string) => `${lower} ${upper.toLowerCase()}`).replaceAll(/[._-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
const detailValue = (value: unknown) => typeof value === "number"
  ? value.toLocaleString(undefined, { maximumFractionDigits: 4 })
  : typeof value === "boolean" ? (value ? "Yes" : "No") : value == null ? "Not available" : String(value);
const metricSections = computed(() => [
  { title: "Baseline", values: store.result?.rawMetrics ?? {} },
  { title: "Untouched evaluation", values: store.result?.outOfSampleMetrics ?? {} },
  { title: "Stressed costs", values: store.result?.stressedCostMetrics ?? {} },
]);
</script>

<template>
  <div v-if="!store.confirmed" class="locked-state">
    <LockKeyhole :size="23" />
    <div><h3>Confirm the strategy first</h3><p>The Court cannot test an unapproved interpretation.</p></div>
    <button class="button button--secondary" @click="store.activeTab = 'strategy'">Review strategy <ArrowRight :size="15" /></button>
  </div>

  <div v-else-if="store.running" class="court-running">
    <section class="run-status-line">
      <div class="run-orbit"><LoaderCircle :size="31" /></div>
      <div class="run-status-line__copy">
        <p class="status-label">Court in session</p>
        <h2>{{ store.latestRun?.stage || "Run in progress" }}</h2>
        <p>Testing the confirmed rules against the selected market history.</p>
      </div>
      <div class="run-progress">
        <div class="progress-track" role="progressbar" :aria-valuenow="store.latestRun?.progress" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${store.latestRun?.progress ?? 0}%` }" /></div>
        <div class="progress-label"><span>Sequential run</span><strong>{{ store.latestRun?.progress ?? 0 }}%</strong></div>
      </div>
    </section>
    <ExecutionTrace :run="store.latestRun" />
  </div>

  <div v-else-if="store.courtInvalid" class="court-ready">
    <section class="run-ready run-ready--invalid">
      <div class="run-ready__lead">
        <div class="run-ready__icon"><CircleAlert :size="21" /></div>
        <div>
          <p class="status-label">Court result</p>
          <h2>This run is invalid</h2>
          <p role="alert">{{ invalidReason }}</p>
        </div>
      </div>
      <div class="run-ready__controls">
        <SegmentedControl :model-value="dataPolicy" label="Market data source" :options="dataOptions" @update:model-value="dataPolicy = $event as DataSnapshotPolicy" />
        <button class="button" type="button" :disabled="store.mutating" @click="store.runCourt(dataPolicy)"><RefreshCw :size="15" />Retry Court run</button>
      </div>
      <small class="run-ready__meta">No metrics or verdicts were manufactured for this run.</small>
    </section>
  </div>

  <div v-else-if="!store.courtComplete" class="court-ready">
    <section class="run-ready">
      <div class="run-ready__lead">
        <div class="run-ready__icon"><Scale :size="21" /></div>
        <div>
          <p class="status-label">{{ failedRun ? "Run unavailable" : "Strategy confirmed" }}</p>
          <h2>{{ failedRun ? "The run did not return a usable result" : "Test the rules" }}</h2>
          <p v-if="failedRun" role="alert">{{ store.latestRun?.error || "The API reported that the run failed." }}</p>
          <p v-else>Seven tests will examine performance, costs and robustness.</p>
        </div>
      </div>
      <div class="run-ready__controls">
        <SegmentedControl :model-value="dataPolicy" label="Market data source" :options="dataOptions" @update:model-value="dataPolicy = $event as DataSnapshotPolicy" />
        <button class="button" type="button" :disabled="store.mutating" @click="store.runCourt(dataPolicy)"><Play :size="15" fill="currentColor" />{{ failedRun ? "Retry Court run" : "Run Court" }}</button>
      </div>
      <small class="run-ready__meta">{{ dataPolicy === "frozen" ? "Generated prices, not market evidence" : dataPolicy === "saved_sample" ? "Saved Alpaca history" : "Fresh Alpaca request" }} · {{ store.currentCase?.startDate }} — {{ store.currentCase?.endDate }}</small>
    </section>
  </div>

  <div v-else class="court-results">
    <header class="result-intro">
      <p class="status-label">Historical test result</p>
      <h2>{{ store.result?.summaryLabel }}</h2>
      <p class="result-intro__finding">{{ resultExplanation }}</p>
      <div class="result-intro__action">
        <button v-if="primaryFinding" class="button" type="button" @click="revealFinding(primaryFinding.id)">{{ failedCount ? 'Review a failed test' : 'Review the evidence' }} <ArrowRight :size="15" /></button>
        <span>{{ failedCount }} of {{ store.result?.verdicts.length ?? 0 }} tests failed<span v-if="inconclusiveCount"> · {{ inconclusiveCount }} inconclusive</span><span v-if="warningCount"> · {{ warningCount }} warning{{ warningCount === 1 ? '' : 's' }}</span></span>
      </div>
      <p v-if="store.result?.data?.provider === 'synthetic_demo'" class="synthetic-disclosure">Synthetic demo · Generated prices, not real market performance.</p>
    </header>

    <dl class="kpi-strip" aria-label="Court result summary">
      <div v-for="metric in resultKpis" :key="metric.label" class="kpi">
        <dt>{{ metric.label }}</dt><dd>{{ metric.value }}</dd><small>{{ metric.detail }}</small>
      </div>
    </dl>

    <section class="test-ledger" aria-labelledby="test-ledger-title">
      <header class="test-ledger__title"><h2 id="test-ledger-title">Test results</h2><span>Open a test to see the finding</span></header>
      <details v-for="verdict in store.result?.verdicts" :id="`verdict-${verdict.id}`" :key="verdict.id" class="test-row" name="court-findings" tabindex="-1">
        <summary><span>{{ verdict.category }}</span><span class="test-status" :data-status="verdict.status">{{ verdict.status }}</span><ChevronDown :size="15" /></summary>
        <div class="test-row__detail">
          <p>{{ verdict.finding }}</p>
          <dl><div><dt>Observed</dt><dd>{{ detailLabel(verdict.measure) }}</dd></div><div><dt>Threshold</dt><dd>{{ verdict.threshold }}</dd></div></dl>
          <button v-if="verdict.failureId" class="finding-action" type="button" @click="inspectVerdict(verdict)">Inspect supporting evidence <ArrowRight :size="13" /></button>
        </div>
      </details>
    </section>

    <InvestigationDecision />

    <details class="run-details">
      <summary><span>Performance over time</span><small>Equity and drawdown</small><ChevronDown :size="15" /></summary>
      <div class="run-details__body">
        <CourtResultChart :drawdown-threshold="25" :equity-points="store.result?.equityCurve ?? []" :drawdown-points="store.result?.drawdownCurve ?? []" :title="chartTitle" :description="hasBenchmark ? 'Strategy equity and the normalized SPY benchmark, with synchronized drawdown.' : 'Strategy equity with synchronized drawdown. A benchmark path was not returned.'" />
        <p class="run-caption">{{ runCaption }}</p>
      </div>
    </details>

    <details class="run-details">
      <summary><span>Parameter sensitivity</span><small>{{ store.result?.parameterTrials.length ?? 0 }} trials</small><ChevronDown :size="15" /></summary>
      <div class="run-details__body"><ParameterMatrix :trials="store.result?.parameterTrials ?? []" /></div>
    </details>

    <details class="run-details">
      <summary><span>Run details</span><small>Execution, data and full metrics</small><ChevronDown :size="15" /></summary>
      <div class="run-details__body">
        <ExecutionTrace :run="store.latestRun" :verdicts="store.result?.verdicts" @inspect="inspectVerdict" />
        <EvaluationWindow v-if="store.result?.dateRange && store.result.splitDate" :start="store.result.dateRange.start" :end="store.result.dateRange.end" :split="store.result.splitDate" />
        <p v-if="store.result?.data?.provider" class="run-caption">{{ store.result.data.provider }} · {{ store.result.data.feed }} · Adjustment: {{ store.result.data.adjustment }} · Retrieved {{ store.result.data.fetchedAt }}</p>
        <p class="run-caption">Reproducibility ID: {{ store.result?.reproducibilityId }}</p>
        <section v-if="store.result?.dataWarnings.length" class="data-warning-list" aria-labelledby="data-warning-title">
          <h3 id="data-warning-title">Data warnings</h3>
          <p v-for="warning in store.result.dataWarnings" :key="warning"><CircleAlert :size="13" />{{ warning }}</p>
        </section>
        <div class="metric-detail-grid">
          <section v-for="section in metricSections" :key="section.title">
            <h3>{{ section.title }}</h3>
            <dl><div v-for="(value,key) in section.values" :key="key"><dt>{{ detailLabel(String(key)) }}</dt><dd>{{ detailValue(value) }}</dd></div></dl>
          </section>
        </div>
        <section class="parameter-detail" aria-labelledby="parameter-detail-title">
          <div class="parameter-detail__heading"><h3 id="parameter-detail-title">Parameter trials</h3><span>{{ store.result?.parameterTrials.length ?? 0 }} tested neighbours</span></div>
          <div class="parameter-table-wrap">
            <table>
              <thead><tr><th>Parameter</th><th>Baseline</th><th>Tested</th><th>Factor</th><th>Outcome</th><th>Net profit</th></tr></thead>
              <tbody><tr v-for="(trial,index) in store.result?.parameterTrials" :key="`${String(trial.path)}:${String(trial.factor)}:${index}`"><td>{{ detailLabel(String(trial.path ?? "Parameter")) }}</td><td>{{ detailValue(trial.baseline) }}</td><td>{{ detailValue(trial.value) }}</td><td>{{ detailValue(trial.factor) }}</td><td>{{ detailLabel(String(trial.status ?? "completed")) }}</td><td>{{ detailValue(trial.netProfit) }}</td></tr></tbody>
            </table>
            <p v-if="!store.result?.parameterTrials.length">This strategy has no meaningfully variable numerical parameters.</p>
          </div>
        </section>
      </div>
    </details>
  </div>
</template>

<style scoped lang="scss">
.locked-state {
  display: flex;
  min-height: 150px;
  align-items: center;
  gap: 16px;
  padding: 30px 0;
  border-top: 1px solid rgba(255,255,255,.08);
  color: #858585;
}
.locked-state h3 { margin: 0 0 5px; color: #e8e8e8; }
.locked-state p { margin: 0; font-size: 13px; }
.locked-state .button { margin-left: auto; }
.status-label {
  margin: 0 0 5px;
  color: #777;
  font-size: 10px;
  font-weight: 560;
  letter-spacing: 0;
  text-transform: none;
}
.court-running { display: grid; gap: 28px; }
.run-status-line {
  display: grid;
  grid-template-columns: auto minmax(0,1fr) minmax(240px,.65fr);
  align-items: center;
  gap: 18px;
  padding: 24px 0;
  border-top: 1px solid #292929;
  border-bottom: 1px solid #292929;
}
.run-orbit, .run-ready__icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid #333;
  border-radius: 12px;
  color: #e5e5e5;
  background: #171717;
}
.run-orbit svg, .stage-row--active svg { animation: spin 1.2s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.run-status-line h2 { margin: 0; color: #f2f2f2; font-size: 20px; letter-spacing: -.025em; }
.run-status-line__copy > p:last-child { margin: 6px 0 0; color: #747474; font-size: 11px; line-height: 1.5; }
.run-progress { min-width: 0; }
.data-policy { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; width: min(420px,100%); padding: 3px; border: 1px solid #2c2c2c; border-radius: 11px; background: #101010; }
.data-policy button { display: flex; min-height: 42px; align-items: center; justify-content: center; gap: 8px; padding: 0 12px; border: 0; border-radius: 9px; color: #777; background: transparent; font-size: 11px; cursor: pointer; }
.data-policy button:hover { color: #d2d2d2; }
.data-policy button.active { color: #f0f0f0; background: #202020; }
.progress-track { width: 100%; height: 3px; overflow: hidden; background: #292929; }
.progress-track span { display: block; height: 100%; background: #f3f3f3; }
.progress-label { display: flex; width: 100%; justify-content: space-between; margin-top: 9px; color: #737373; font-size: 10px; }
.progress-label strong { font-family: Inter,ui-sans-serif,system-ui,sans-serif; }
.stage-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); column-gap: 34px; }
.stage-row { display: grid; grid-template-columns: 25px 1fr auto; align-items: center; gap: 10px; min-width: 0; padding: 12px 0; border-bottom: 1px solid #242424; color: #666; font-size: 11px; }
.stage-row__icon { display: grid; width: 23px; height: 23px; place-items: center; border: 1px solid #303030; border-radius: 7px; }
.stage-row--done { color: #a0a0a0; }
.stage-row--active { color: #eee; }
.court-ready { display: block; }
.run-ready {
  display: grid;
  grid-template-columns: minmax(0,1fr) auto;
  align-items: center;
  gap: 24px 42px;
  padding: 30px 0;
  border-top: 1px solid #2b2b2b;
  border-bottom: 1px solid #2b2b2b;
}
.run-ready--invalid { border-color: #393939; }
.run-ready__lead { display: flex; min-width: 0; align-items: flex-start; gap: 15px; }
.run-ready__lead h2 { margin: 0; color: #f1f1f1; font-size: 22px; letter-spacing: -.03em; }
.run-ready__lead p:not(.status-label) { max-width: 660px; margin: 7px 0 0; color: #858585; font-size: 12px; line-height: 1.55; }
.run-ready__controls { display: flex; align-items: center; gap: 10px; }
.run-ready__controls .data-policy { width: 370px; }
.run-ready__controls .button { flex: 0 0 auto; }
.run-ready__meta { grid-column: 1 / -1; color: #929292; font-size: 11px; }
.court-results { display: grid; grid-template-columns: minmax(0, 1fr); width: 100%; margin: 0 auto; }
.court-results > * { min-width: 0; }
.result-intro { padding: 4px 0 30px; }
.result-intro .status-label { margin: 0 0 12px; font-size: 12px; color: #96969e; }
.result-intro h2 { margin: 0; color: #f2f2f4; font-size: clamp(34px, 4vw, 46px); letter-spacing: -.045em; font-weight: 600; line-height: 1.12; }
.result-intro__finding { max-width: 680px; margin: 16px 0 0; font-size: 15px; line-height: 1.65; color: #b7b7bf; }
.result-intro__action { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-top: 22px; }
.result-intro__action > span { color: #8f8f98; font-size: 12px; }
.synthetic-disclosure { margin: 18px 0 0; color: #96969e; font-size: 11px; line-height: 1.5; }
.kpi-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0; padding: 24px 0; border-block: 1px solid #2b2b2b; }
.kpi { min-width: 0; padding: 0 24px; border-left: 1px solid #282828; }
.kpi:first-child { border: 0; padding-left: 0; }
.kpi dt { color: #a3a3ac; font-size: 12px; }
.kpi dd { margin: 10px 0 8px; color: #ebebef; font-size: 28px; font-weight: 550; line-height: 1; letter-spacing: -.025em; font-variant-numeric: tabular-nums; }
.kpi small { color: #84848e; font-size: 11px; line-height: 1.5; }
.test-ledger { margin-top: 28px; }
.test-ledger__title { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 0 0 14px; }
.test-ledger__title h2 { margin: 0; font-size: 16px; font-weight: 550; color: #e3e3e9; }
.test-ledger__title > span { font-size: 11px; color: #8d8d98; }
.test-row { border-top: 1px solid #252525; scroll-margin-top: 150px; }
.test-row:last-child { border-bottom: 1px solid #252525; }
.test-row > summary { display: grid; grid-template-columns: 1fr auto 16px; align-items: center; gap: 18px; min-height: 54px; padding: 12px 0; color: #cfcfd6; font-size: 13px; cursor: pointer; list-style: none; }
.test-row > summary::-webkit-details-marker, .run-details > summary::-webkit-details-marker { display: none; }
.test-row > summary:hover, .run-details > summary:hover { color: #fff; }
.test-status { display: inline-flex; align-items: center; gap: 7px; color: #9c9ca6; font-size: 11px; }
.test-status::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: #626269; }
.test-status[data-status="Fail"] { color: #e7c4ae; }
.test-status[data-status="Fail"]::before { background: #cf9e7f; }
.test-row > summary > svg, .run-details > summary > svg { color: #777780; transition: transform var(--duration-control); }
.test-row[open] > summary > svg, .run-details[open] > summary > svg { transform: rotate(180deg); }
.test-row__detail { max-width: 780px; padding: 0 0 24px; }
.test-row__detail > p { margin: 0 0 18px; color: #aaaab4; font-size: 14px; line-height: 1.65; }
.test-row__detail dl { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 0; }
.test-row__detail dt { margin-bottom: 7px; color: #82828c; font-size: 11px; }
.test-row__detail dd { margin: 0; font-size: 12px; line-height: 1.65; color: #c0c0c8; overflow-wrap: anywhere; }
.finding-action { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; margin-top: 14px; padding: 0; border: 0; background: transparent; color: #dddde4; font-size: 12px; cursor: pointer; }
.run-details { border-bottom: 1px solid #292929; }
.run-details > summary { display: grid; grid-template-columns: 1fr auto 16px; align-items: center; gap: 20px; min-height: 62px; padding: 16px 0; color: #aaaab5; font-size: 13px; list-style: none; cursor: pointer; }
.run-details > summary small { color: #83838e; font-size: 11px; }
.run-details__body { display: grid; min-width: 0; gap: 24px; padding: 8px 0 30px; }
.run-details__body > * { min-width: 0; }
.run-caption { margin: 0; color: #8c8c96; font-size: 11px; line-height: 1.65; overflow-wrap: anywhere; }
.data-warning-list h3, .metric-detail-grid h3, .parameter-detail h3 { margin: 0 0 12px; font-size: 13px; color: #d0d0d8; }
.data-warning-list p { display: flex; gap: 8px; font-size: 12px; line-height: 1.6; color: #aaaab4; }
.metric-detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
.metric-detail-grid dl { margin: 0; }
.metric-detail-grid dl div { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid #252525; font-size: 11px; }
.metric-detail-grid dt { color: #8d8d98; }.metric-detail-grid dd { margin: 0; color: #c1c1ca; }
.parameter-detail__heading { display: flex; justify-content: space-between; gap: 12px; }.parameter-detail__heading span { font-size: 11px; color: #93939d; }
.parameter-table-wrap { overflow: auto; }.parameter-table-wrap table { width: 100%; border-collapse: collapse; }.parameter-table-wrap th, .parameter-table-wrap td { padding: 12px 12px 12px 0; border-bottom: 1px solid #252525; white-space: nowrap; text-align: left; font-size: 11px; color: #b0b0bb; }.parameter-table-wrap th { font-weight: 500; color: #84848f; }.parameter-table-wrap p { color: #90909b; font-size: 12px; }
@media (max-width: 900px) {
  .run-ready { grid-template-columns: 1fr; }.run-ready__controls { align-items: stretch; flex-direction: column; }
  .run-status-line { grid-template-columns: auto 1fr; }.run-progress { grid-column: 1 / -1; }
  .metric-detail-grid { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .locked-state { align-items: flex-start; flex-direction: column; }.locked-state .button { margin-left: 0; }
  .result-intro { padding-bottom: 24px; }.result-intro__finding { font-size: 14px; }.result-intro__action { align-items: flex-start; flex-direction: column; gap: 12px; }
  .kpi-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 24px; padding: 22px 0; }.kpi { padding-inline: 18px; }.kpi:nth-child(3) { border: 0; padding-left: 0; }.kpi dd { font-size: 25px; }.kpi small { font-size: 10px; }
  .test-ledger__title > span { display: none; }.test-row > summary { gap: 12px; }.test-row__detail dl { grid-template-columns: 1fr; gap: 14px; }
  .run-details > summary { gap: 12px; }.run-details > summary small { display: none; }
}
</style>
