<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowRight, Check, ChevronDown, CircleAlert, CircleDashed, Database, LoaderCircle, LockKeyhole, Play, RefreshCw, Scale } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import CourtResultChart from "@/charts/CourtResultChart.vue";
import InvestigationDecision from "@/components/InvestigationDecision.vue";
import type { DataSnapshotPolicy } from "@strategy-court/schemas";

const store = useCourtStore();
const dataPolicy = ref<DataSnapshotPolicy>(store.currentCase?.sampleId ? "saved_sample" : "refresh");
const stages = [
  "Baseline simulation",
  "Untouched evaluation",
  "Parameter sensitivity",
  "Cost stress",
  "Market regimes",
  "Profit concentration",
  "Risk and verdicts",
];
const stageIndex = computed(() => Math.min(stages.length - 1, Math.floor((store.latestRun?.progress ?? 0) / (100 / stages.length))));
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
      label: "Verdict",
      value: store.result?.summaryLabel ?? "Not reported",
      detail: `${failedCount.value} failed · ${warningCount.value} warning${warningCount.value === 1 ? "" : "s"}`,
      tone: "neutral",
    },
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
const detailLabel = (value: string) => value.replaceAll(/([a-z])([A-Z])/g, "$1 $2").replaceAll(/[._-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
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
    <section class="stage-list" aria-label="Court stages">
      <div v-for="(stage,index) in stages" :key="stage" class="stage-row" :class="{ 'stage-row--done': index < stageIndex, 'stage-row--active': index === stageIndex }">
        <span class="stage-row__icon"><Check v-if="index < stageIndex" :size="13" /><LoaderCircle v-else-if="index === stageIndex" :size="13" /><CircleDashed v-else :size="13" /></span>
        <span>{{ stage }}</span>
        <small>{{ index < stageIndex ? "Complete" : index === stageIndex ? "Running" : "Queued" }}</small>
      </div>
    </section>
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
        <div class="data-policy" aria-label="Market data source">
          <button v-if="store.currentCase?.sampleId" type="button" :aria-pressed="dataPolicy === 'saved_sample'" :class="{ active: dataPolicy === 'saved_sample' }" @click="dataPolicy = 'saved_sample'">
            <Database :size="14" /> Saved Alpaca history
          </button>
          <button type="button" :aria-pressed="dataPolicy === 'frozen'" :class="{ active: dataPolicy === 'frozen' }" @click="dataPolicy = 'frozen'">
            <Database :size="14" /> Synthetic demo
          </button>
          <button type="button" :aria-pressed="dataPolicy === 'refresh'" :class="{ active: dataPolicy === 'refresh' }" @click="dataPolicy = 'refresh'">
            <RefreshCw :size="14" /> Refresh from Alpaca
          </button>
        </div>
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
        <div class="data-policy" aria-label="Market data source">
          <button v-if="store.currentCase?.sampleId" type="button" :aria-pressed="dataPolicy === 'saved_sample'" :class="{ active: dataPolicy === 'saved_sample' }" @click="dataPolicy = 'saved_sample'">
            <Database :size="14" /> Saved Alpaca history
          </button>
          <button type="button" :aria-pressed="dataPolicy === 'frozen'" :class="{ active: dataPolicy === 'frozen' }" @click="dataPolicy = 'frozen'">
            <Database :size="14" /> Synthetic demo
          </button>
          <button type="button" :aria-pressed="dataPolicy === 'refresh'" :class="{ active: dataPolicy === 'refresh' }" @click="dataPolicy = 'refresh'">
            <RefreshCw :size="14" /> Refresh from Alpaca
          </button>
        </div>
        <button class="button" type="button" :disabled="store.mutating" @click="store.runCourt(dataPolicy)"><Play :size="15" fill="currentColor" />{{ failedRun ? "Retry Court run" : "Run Court" }}</button>
      </div>
      <small class="run-ready__meta">{{ dataPolicy === "frozen" ? "Generated prices, not market evidence" : dataPolicy === "saved_sample" ? "Saved Alpaca history" : "Fresh Alpaca request" }} · {{ store.currentCase?.startDate }} — {{ store.currentCase?.endDate }}</small>
    </section>
  </div>

  <div v-else class="court-results">
    <header class="result-command">
      <div class="result-command__state">
        <span class="result-command__mark"><Check :size="14" /></span>
        <div>
          <p class="status-label">Court complete</p>
          <h2>{{ store.result?.summaryLabel }}</h2>
        </div>
      </div>
      <p v-if="primaryFinding" class="result-command__finding">{{ primaryFinding.finding }}</p>
      <div class="result-command__action">
        <span>{{ store.result?.verdicts.length ?? 0 }} tests · {{ failedCount }} failed<span v-if="warningCount"> · {{ warningCount }} warning{{ warningCount === 1 ? "" : "s" }}</span></span>
        <button class="button" type="button" @click="store.activeTab = 'evidence'">Evidence <ArrowRight :size="15" /></button>
      </div>
    </header>

    <dl class="kpi-strip" aria-label="Court result summary">
      <div v-for="metric in resultKpis" :key="metric.label" class="kpi" :data-tone="metric.tone">
        <dt>{{ metric.label }}</dt>
        <dd>{{ metric.value }}</dd>
        <small>{{ metric.detail }}</small>
      </div>
    </dl>

    <p v-if="store.result?.data?.provider" class="run-ready__meta">
      {{ store.result.data.provider }} · {{ store.result.data.feed }} · Adjustment: {{ store.result.data.adjustment }} · Retrieved {{ store.result.data.fetchedAt }}
    </p>
    <InvestigationDecision />

    <CourtResultChart
      :equity-points="store.result?.equityCurve ?? []"
      :drawdown-points="store.result?.drawdownCurve ?? []"
      :title="chartTitle"
      :description="hasBenchmark ? 'Strategy equity and the normalized SPY benchmark, with synchronized drawdown.' : 'Strategy equity with synchronized drawdown. A benchmark path was not returned.'"
    />

    <div class="result-foot">
      <span>{{ runCaption }}</span>
      <span class="mono">{{ store.result?.reproducibilityId?.slice(0, 16) }}</span>
    </div>

    <section class="test-ledger" aria-labelledby="test-ledger-title">
      <header class="test-ledger__title">
        <div><p class="status-label">Test findings</p><h2 id="test-ledger-title">Evidence by test</h2></div>
        <span>{{ store.result?.verdicts.length ?? 0 }} completed</span>
      </header>
      <div class="test-ledger__columns" aria-hidden="true"><span>Result</span><span>Test and finding</span><span>Observed</span><span>Threshold</span></div>
      <div class="test-ledger__body">
        <article v-for="verdict in store.result?.verdicts" :id="`verdict-${verdict.id}`" :key="verdict.id" class="test-row" tabindex="-1">
          <span class="subtle-badge test-row__status" :data-status="verdict.status">{{ verdict.status }}</span>
          <div class="test-row__finding"><h3>{{ verdict.category }}</h3><p>{{ verdict.finding }}</p></div>
          <span class="test-row__measure">{{ verdict.measure }}</span>
          <span class="test-row__threshold">{{ verdict.threshold }}</span>
        </article>
      </div>
    </section>

    <details class="run-details">
      <summary><span>Run details</span><span>Metrics, trials, warnings</span><ChevronDown :size="15" /></summary>
      <div class="run-details__body">
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
.progress-label strong { font-family: ui-monospace,SFMono-Regular,Menlo,monospace; }
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
.run-ready__meta { grid-column: 1 / -1; color: #626262; font-size: 10px; }
.court-results { display: grid; gap: 0; }
.result-command {
  display: grid;
  grid-template-columns: auto minmax(240px,1fr) auto;
  align-items: center;
  gap: 24px;
  padding: 0 0 18px;
}
.subtle-badge { display: inline-flex; min-height: 25px; align-items: center; justify-self: start; padding: 0 9px; border: 1px solid #2d2d2d; border-radius: 999px; color: #858585; background: #161616; font: 500 10px Inter,ui-sans-serif,system-ui,sans-serif; letter-spacing: 0; text-transform: none; }
.result-command__state { display: flex; align-items: center; gap: 12px; white-space: nowrap; }
.result-command__mark { display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid #333; border-radius: 10px; color: #e7e7e7; background: #171717; }
.result-command h2 { margin: 0; color: #f1f1f1; font-size: 20px; line-height: 1; letter-spacing: -.03em; }
.result-command__finding { max-width: 680px; margin: 0; color: #8e8e8e; font-size: 11px; line-height: 1.5; }
.result-command__action { display: flex; align-items: center; gap: 15px; }
.result-command__action > span { color: #686868; font-size: 10px; white-space: nowrap; }
.kpi-strip {
  display: grid;
  grid-template-columns: repeat(4,minmax(0,1fr));
  margin: 0;
  border-top: 1px solid #2b2b2b;
  border-bottom: 1px solid #2b2b2b;
}
.kpi { min-width: 0; padding: 17px 20px 16px 0; }
.kpi + .kpi { padding-left: 20px; border-left: 1px solid #262626; }
.kpi dt { color: #6d6d6d; font-size: 10px; }
.kpi dd { margin: 8px 0 5px; overflow: hidden; color: #ededed; font: 590 22px/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing: -.045em; text-overflow: ellipsis; white-space: nowrap; }
.kpi small { color: #5f5f5f; font-size: 9px; line-height: 1.4; }
.kpi[data-tone="positive"] dd { color: #77c69a; }
.kpi[data-tone="negative"] dd { color: #df8585; }
.court-results :deep(.court-result-chart) { margin-top: 16px; border-radius: 14px; box-shadow: none; }
.court-results :deep(.chart-header) { min-height: 68px; padding: 14px 18px; }
.result-foot {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 11px 2px 38px;
  color: #606060;
  font-size: 9px;
}
.test-ledger { border-top: 1px solid #2b2b2b; }
.test-ledger__title {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 0 17px;
}
.test-ledger__title h2 { margin: 0; color: #e8e8e8; font-size: 18px; letter-spacing: -.025em; }
.test-ledger__title > span { color: #6a6a6a; font-size: 10px; }
.test-ledger__columns,
.test-row {
  display: grid;
  grid-template-columns: 82px minmax(260px,1.25fr) minmax(150px,.65fr) minmax(210px,.85fr);
  gap: 20px;
}
.test-ledger__columns { padding: 9px 0; border-top: 1px solid #242424; border-bottom: 1px solid #242424; color: #565656; font-size: 9px; }
.test-ledger__body { border-bottom: 1px solid #252525; }
.test-row { align-items: start; padding: 15px 0; border-bottom: 1px solid #202020; }
.test-row:last-child { border-bottom: 0; }
.test-row__status { color: #9b9b9b; }
.test-row__status[data-status="Fail"] { color: #eee; border-color: #4b4b4b; background: #202020; }
.test-row h3 { margin: 0 0 5px; color: #ddd; font-size: 12px; }
.test-row p { margin: 0; color: #7d7d7d; font-size: 11px; line-height: 1.5; }
.test-row__measure,.test-row__threshold { color: #8b8b8b; font: 9px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; overflow-wrap: anywhere; }
.test-row__threshold { color: #686868; }
.run-details { margin-top: 18px; border-top: 1px solid #252525; border-bottom: 1px solid #252525; }
.run-details>summary { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 13px; padding: 19px 4px; color: #aaa; font-size: 11px; list-style: none; cursor: pointer; }
.run-details>summary::-webkit-details-marker { display: none; }.run-details>summary span:nth-child(2) { color: #666; font-size: 9px; }.run-details>summary svg { transition: transform 150ms ease; }.run-details[open]>summary svg { transform: rotate(180deg); }
.run-details__body { display: grid; gap: 34px; padding: 28px 4px 38px; border-top: 1px solid #222; }
.data-warning-list { display: grid; }.data-warning-list h3,.metric-detail-grid h3,.parameter-detail h3 { margin: 0 0 12px; color: #d4d4d4; font-size: 12px; }.data-warning-list p { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 10px 0; border-bottom: 1px solid #202020; color: #999; font-size: 10px; line-height: 1.5; }
.metric-detail-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 24px; }.metric-detail-grid section { min-width: 0; }.metric-detail-grid dl { margin: 0; }.metric-detail-grid dl div { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 12px; padding: 8px 0; border-bottom: 1px solid #202020; }.metric-detail-grid dt { color: #666; font-size: 9px; }.metric-detail-grid dd { margin: 0; color: #aaa; font: 9px ui-monospace,SFMono-Regular,Menlo,monospace; text-align: right; }
.parameter-detail__heading { display: flex; align-items: center; justify-content: space-between; }.parameter-detail__heading span { color: #666; font-size: 9px; }.parameter-table-wrap { overflow-x: auto; }.parameter-table-wrap table { width: 100%; border-collapse: collapse; }.parameter-table-wrap th,.parameter-table-wrap td { padding: 10px 12px 10px 0; border-bottom: 1px solid #202020; color: #888; font-size: 9px; text-align: left; white-space: nowrap; }.parameter-table-wrap th { color: #5f5f5f; font-weight: 540; }.parameter-table-wrap td:first-child { color: #c4c4c4; }.parameter-table-wrap p { margin: 0; color: #666; font-size: 10px; }

@media (max-width: 900px) {
  .run-status-line { grid-template-columns: auto minmax(0,1fr); }
  .run-progress { grid-column: 1 / -1; }
  .run-ready { grid-template-columns: 1fr; }
  .run-ready__controls { align-items: stretch; flex-direction: column; }
  .run-ready__controls .data-policy { width: 100%; }
  .result-command { grid-template-columns: auto minmax(0,1fr); }
  .result-command__finding { grid-column: 1 / -1; grid-row: 2; }
  .result-command__action { grid-column: 2; grid-row: 1; justify-self: end; }
  .result-command__action > span { display: none; }
  .kpi-strip { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .kpi:nth-child(3) { padding-left: 0; border-left: 0; border-top: 1px solid #262626; }
  .kpi:nth-child(4) { border-top: 1px solid #262626; }
  .test-ledger__columns { display: none; }
  .test-row { grid-template-columns: 82px minmax(0,1fr); }
  .test-row__measure,.test-row__threshold { grid-column: 2; }
  .metric-detail-grid { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .locked-state { align-items: flex-start; }
  .locked-state { flex-direction: column; }
  .locked-state .button { margin-left: 0; }
  .stage-list { grid-template-columns: 1fr; }
  .run-status-line { grid-template-columns: 1fr; }
  .run-orbit { width: 38px; height: 38px; }
  .run-progress { grid-column: 1; }
  .run-ready { padding: 24px 0; }
  .run-ready__lead { flex-direction: column; }
  .data-policy { grid-template-columns: 1fr; }
  .result-command { grid-template-columns: 1fr auto; gap: 14px; }
  .result-command__state { white-space: normal; }
  .result-command__finding { font-size: 10px; }
  .result-command__action { grid-column: 2; }
  .kpi { padding: 14px 14px 13px 0; }
  .kpi + .kpi { padding-left: 14px; }
  .kpi:nth-child(3) { padding-left: 0; }
  .kpi dd { font-size: 18px; }
  .kpi small { display: none; }
  .court-results :deep(.court-result-chart) { margin-top: 12px; border-radius: 10px; }
  .result-foot { align-items: flex-start; flex-direction: column; padding-bottom: 30px; }
  .test-row { grid-template-columns: 1fr; gap: 7px; }
  .test-row__measure,.test-row__threshold { grid-column: 1; }
}
</style>
