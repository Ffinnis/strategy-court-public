<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowRight, Check, ChevronDown, CircleAlert, CircleDashed, Database, LoaderCircle, LockKeyhole, Play, RefreshCw, Scale } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import CourtResultChart from "@/charts/CourtResultChart.vue";

const store = useCourtStore();
const dataPolicy = ref<"frozen" | "refresh">("refresh");
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
    <section class="run-hero">
      <div class="run-orbit"><LoaderCircle :size="31" /></div>
      <p class="eyebrow">Court in session</p>
      <h2>{{ store.latestRun?.stage || "Run in progress" }}</h2>
      <div class="progress-track" role="progressbar" :aria-valuenow="store.latestRun?.progress" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${store.latestRun?.progress ?? 0}%` }" /></div>
      <div class="progress-label"><span>Sequential run</span><strong>{{ store.latestRun?.progress ?? 0 }}%</strong></div>
    </section>
    <section class="stage-list">
      <div v-for="(stage,index) in stages" :key="stage" class="stage-row" :class="{ 'stage-row--done': index < stageIndex, 'stage-row--active': index === stageIndex }">
        <span class="stage-row__icon"><Check v-if="index < stageIndex" :size="13" /><LoaderCircle v-else-if="index === stageIndex" :size="13" /><CircleDashed v-else :size="13" /></span>
        <span>{{ stage }}</span>
        <small>{{ index < stageIndex ? "Complete" : index === stageIndex ? "Running" : "Queued" }}</small>
      </div>
    </section>
  </div>

  <div v-else-if="store.courtInvalid" class="court-ready">
    <section class="run-ready run-ready--invalid">
      <div class="run-ready__icon"><CircleAlert :size="25" /></div>
      <p class="eyebrow">Court result</p>
      <h2>This run is invalid.</h2>
      <p role="alert">{{ invalidReason }}</p>
      <div class="data-policy" aria-label="Market data source">
        <button type="button" :aria-pressed="dataPolicy === 'frozen'" :class="{ active: dataPolicy === 'frozen' }" @click="dataPolicy = 'frozen'">
          <Database :size="14" /> Frozen snapshot
        </button>
        <button type="button" :aria-pressed="dataPolicy === 'refresh'" :class="{ active: dataPolicy === 'refresh' }" @click="dataPolicy = 'refresh'">
          <RefreshCw :size="14" /> Refresh from Alpaca
        </button>
      </div>
      <button class="button" type="button" :disabled="store.mutating" @click="store.runCourt(dataPolicy)"><RefreshCw :size="15" />Retry Court run</button>
      <small>No metrics or verdicts were manufactured for this run.</small>
    </section>
  </div>

  <div v-else-if="!store.courtComplete" class="court-ready">
    <section class="run-ready">
      <div class="run-ready__icon"><Scale :size="25" /></div>
      <p class="eyebrow">{{ failedRun ? "Run unavailable" : "Strategy confirmed" }}</p>
      <h2>{{ failedRun ? "The run did not return a usable result." : "Test the rules." }}</h2>
      <p v-if="failedRun" role="alert">{{ store.latestRun?.error || "The API reported that the run failed." }}</p>
      <p v-else>Seven tests. One reproducible result.</p>
      <div class="data-policy" aria-label="Market data source">
        <button type="button" :aria-pressed="dataPolicy === 'frozen'" :class="{ active: dataPolicy === 'frozen' }" @click="dataPolicy = 'frozen'">
          <Database :size="14" /> Frozen snapshot
        </button>
        <button type="button" :aria-pressed="dataPolicy === 'refresh'" :class="{ active: dataPolicy === 'refresh' }" @click="dataPolicy = 'refresh'">
          <RefreshCw :size="14" /> Refresh from Alpaca
        </button>
      </div>
      <button class="button" type="button" :disabled="store.mutating" @click="store.runCourt(dataPolicy)"><Play :size="15" fill="currentColor" />{{ failedRun ? "Retry Court run" : "Run Court" }}</button>
      <small>{{ dataPolicy === "frozen" ? "Frozen historical data" : "Fresh Alpaca request" }} · {{ store.currentCase?.startDate }} — {{ store.currentCase?.endDate }}</small>
    </section>
  </div>

  <div v-else class="court-results">
    <header class="result-focus">
      <div class="result-focus__copy">
        <p class="subtle-badge result-kicker">Court result · {{ store.result?.verdicts.length ?? 0 }} tests</p>
        <h1>{{ store.result?.summaryLabel }}</h1>
        <p v-if="primaryFinding">{{ primaryFinding.finding }}</p>
      </div>
      <div class="result-focus__action">
        <span class="subtle-badge result-status">{{ failedCount }} failed<span v-if="warningCount"> · {{ warningCount }} warning</span></span>
        <button class="button" type="button" @click="store.activeTab = 'evidence'">Evidence <ArrowRight :size="15" /></button>
      </div>
    </header>

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

    <details class="test-ledger">
      <summary>
        <span>All tests</span>
        <span class="subtle-badge ledger-status">{{ failedCount }} failed · {{ warningCount }} warning</span>
        <ChevronDown :size="15" />
      </summary>
      <div class="test-ledger__body">
        <article v-for="verdict in store.result?.verdicts" :key="verdict.id" class="test-row">
          <span class="subtle-badge test-row__status" :data-status="verdict.status">{{ verdict.status }}</span>
          <div><h3>{{ verdict.category }}</h3><p>{{ verdict.finding }}</p><small class="test-threshold">Threshold · {{ verdict.threshold }}</small></div>
          <span class="mono">{{ verdict.measure }}</span>
        </article>
      </div>
    </details>

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
.court-running { display: grid; grid-template-columns: 1.2fr .8fr; gap: 42px; }
.run-hero, .run-ready {
  display: flex;
  min-height: 440px;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  padding: 48px;
  text-align: center;
}
.run-hero {
  border: 1px solid #303030;
  border-radius: 22px;
  background: #141414;
}
.run-orbit, .run-ready__icon {
  display: grid;
  width: 58px;
  height: 58px;
  margin-bottom: 22px;
  place-items: center;
  border: 1px solid #333;
  border-radius: 50%;
  color: #e5e5e5;
  background: #171717;
}
.run-orbit svg, .stage-row--active svg { animation: spin 1.2s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.run-hero h2, .run-ready h2 { margin: 0; color: #f5f5f5; font-size: 32px; letter-spacing: -.04em; }
.run-ready > p:not(.eyebrow) { margin: 10px 0 24px; color: #8e8e8e; font-size: 13px; }
.data-policy { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; width: min(430px,100%); margin: 0 0 18px; padding: 4px; border: 1px solid #2f2f2f; border-radius: 13px; background: #101010; box-shadow: inset 0 1px 2px rgba(0,0,0,.5), 0 16px 38px rgba(0,0,0,.24); }
.data-policy button { display: flex; min-height: 42px; align-items: center; justify-content: center; gap: 8px; padding: 0 12px; border: 0; border-radius: 9px; color: #777; background: transparent; font-size: 11px; cursor: pointer; }
.data-policy button:hover { color: #d2d2d2; }
.data-policy button.active { color: #f0f0f0; background: #202020; box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 7px 20px rgba(0,0,0,.35); }
.progress-track { width: min(520px,100%); height: 4px; margin-top: 28px; overflow: hidden; background: #292929; }
.progress-track span { display: block; height: 100%; background: #f3f3f3; }
.progress-label { display: flex; width: min(520px,100%); justify-content: space-between; margin-top: 9px; color: #737373; font-size: 10px; }
.progress-label strong { font-family: ui-monospace,SFMono-Regular,Menlo,monospace; }
.stage-list { padding: 14px 0; }
.stage-row { display: grid; grid-template-columns: 25px 1fr auto; align-items: center; gap: 10px; padding: 15px 0; border-bottom: 1px solid #242424; color: #666; font-size: 12px; }
.stage-row__icon { display: grid; width: 23px; height: 23px; place-items: center; border: 1px solid #303030; border-radius: 7px; }
.stage-row--done { color: #a0a0a0; }
.stage-row--active { color: #eee; }
.court-ready { display: grid; min-height: 540px; place-items: center; }
.run-ready {
  width: min(760px,100%);
  border: 1px solid #303030;
  border-radius: 22px;
  background: #141414;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 30px 90px rgba(0,0,0,.36);
}
.run-ready--invalid { border-color: #3a3a3a; background: #121212; }
.run-ready--invalid > p:not(.eyebrow) { max-width: 560px; line-height: 1.6; }
.run-ready > small { margin-top: 13px; color: #666; font: 9px ui-monospace,SFMono-Regular,Menlo,monospace; }
.court-results { display: grid; gap: 0; }
.result-focus {
  display: grid;
  grid-template-columns: minmax(0,1fr) auto;
  align-items: end;
  gap: 56px;
  padding: 8px 4px 46px;
}
.subtle-badge { display: inline-flex; min-height: 25px; align-items: center; justify-self: start; padding: 0 9px; border: 1px solid #2d2d2d; border-radius: 999px; color: #858585; background: #161616; font: 500 10px Inter,ui-sans-serif,system-ui,sans-serif; letter-spacing: 0; text-transform: none; }
.result-kicker { margin: 0 0 12px!important; color: #8b8b8b!important; }
.result-focus h1 { margin: 0; color: #fff; font-size: clamp(50px,7.4vw,104px); font-weight: 560; line-height: .88; letter-spacing: -.075em; }
.result-focus__copy > p:last-child { max-width: 680px; margin: 24px 0 0; color: #aaa; font-size: 15px; line-height: 1.6; }
.result-focus__action { display: flex; align-items: flex-end; flex-direction: column; gap: 14px; padding-bottom: 4px; }
.result-focus__action > span { color: #858585; }
.result-foot {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 4px 54px;
  color: #606060;
  font-size: 9px;
}
.test-ledger { border-top: 1px solid #252525; border-bottom: 1px solid #252525; }
.test-ledger summary {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 13px;
  padding: 19px 4px;
  color: #aaa;
  font-size: 11px;
  list-style: none;
  cursor: pointer;
}
.test-ledger summary::-webkit-details-marker { display: none; }
.test-ledger summary span:nth-child(2) { color: #777; }
.test-ledger summary svg { transition: transform 150ms ease; }
.test-ledger[open] summary svg { transform: rotate(180deg); }
.test-ledger__body { border-top: 1px solid #222; }
.test-row { display: grid; grid-template-columns: 88px minmax(0,1fr) minmax(160px,auto); gap: 24px; padding: 18px 4px; border-bottom: 1px solid #202020; }
.test-row:last-child { border-bottom: 0; }
.test-row__status { color: #9b9b9b; }
.test-row__status[data-status="Fail"] { color: #eee; border-color: #4b4b4b; background: #202020; }
.test-row h3 { margin: 0 0 5px; color: #ddd; font-size: 12px; }
.test-row p { margin: 0; color: #7d7d7d; font-size: 11px; line-height: 1.5; }
.test-threshold { display: block; margin-top: 8px; color: #5f5f5f; font-size: 9px; line-height: 1.5; }
.test-row > .mono { align-self: start; color: #8b8b8b; font-size: 9px; text-align: right; }
.run-details { margin-top: 18px; border-top: 1px solid #252525; border-bottom: 1px solid #252525; }
.run-details>summary { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 13px; padding: 19px 4px; color: #aaa; font-size: 11px; list-style: none; cursor: pointer; }
.run-details>summary::-webkit-details-marker { display: none; }.run-details>summary span:nth-child(2) { color: #666; font-size: 9px; }.run-details>summary svg { transition: transform 150ms ease; }.run-details[open]>summary svg { transform: rotate(180deg); }
.run-details__body { display: grid; gap: 34px; padding: 28px 4px 38px; border-top: 1px solid #222; }
.data-warning-list { display: grid; gap: 7px; }.data-warning-list h3,.metric-detail-grid h3,.parameter-detail h3 { margin: 0 0 12px; color: #d4d4d4; font-size: 12px; }.data-warning-list p { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 10px 12px; border-radius: 9px; color: #999; background: #151515; font-size: 10px; line-height: 1.5; }
.metric-detail-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 24px; }.metric-detail-grid section { min-width: 0; }.metric-detail-grid dl { margin: 0; }.metric-detail-grid dl div { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 12px; padding: 8px 0; border-bottom: 1px solid #202020; }.metric-detail-grid dt { color: #666; font-size: 9px; }.metric-detail-grid dd { margin: 0; color: #aaa; font: 9px ui-monospace,SFMono-Regular,Menlo,monospace; text-align: right; }
.parameter-detail__heading { display: flex; align-items: center; justify-content: space-between; }.parameter-detail__heading span { color: #666; font-size: 9px; }.parameter-table-wrap { overflow-x: auto; }.parameter-table-wrap table { width: 100%; border-collapse: collapse; }.parameter-table-wrap th,.parameter-table-wrap td { padding: 10px 12px 10px 0; border-bottom: 1px solid #202020; color: #888; font-size: 9px; text-align: left; white-space: nowrap; }.parameter-table-wrap th { color: #5f5f5f; font-weight: 540; }.parameter-table-wrap td:first-child { color: #c4c4c4; }.parameter-table-wrap p { margin: 0; color: #666; font-size: 10px; }

@media (max-width: 900px) {
  .court-running { grid-template-columns: 1fr; }
  .result-focus { gap: 32px; }
  .test-row { grid-template-columns: 90px minmax(0,1fr); }
  .test-row > .mono { grid-column: 2; text-align: left; }
  .metric-detail-grid { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .locked-state, .result-focus { align-items: flex-start; grid-template-columns: 1fr; }
  .locked-state { flex-direction: column; }
  .locked-state .button { margin-left: 0; }
  .result-focus { gap: 28px; padding-bottom: 36px; }
  .result-focus h1 { font-size: clamp(48px,17vw,76px); }
  .result-focus__copy > p:last-child { margin-top: 19px; font-size: 13px; }
  .result-focus__action { align-items: flex-start; }
  .run-ready, .run-hero { min-height: 420px; padding: 34px 22px; }
  .result-foot { align-items: flex-start; flex-direction: column; padding-bottom: 42px; }
  .test-row { grid-template-columns: 1fr; gap: 7px; }
  .test-row > .mono { grid-column: 1; text-align: left; }
}
</style>
