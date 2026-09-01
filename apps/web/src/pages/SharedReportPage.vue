<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { ArrowLeft, Download, FileText, RefreshCw } from "lucide-vue-next";
import { apiDownload, apiRequest, saveDownload, unwrap } from "@/services/api";
import { normalizeSharedReport, type SharedReportView } from "@/data/shared";
import ParameterMatrix from "@/components/ParameterMatrix.vue";
import CourtResultChart from "@/charts/CourtResultChart.vue";
import { useNotifications } from "@/stores/notifications";
import type { CurvePoint } from "@/types";
import StatusBadge from "@/components/StatusBadge.vue";
import type { EvidenceReference } from "@strategy-court/schemas";

const notifications = useNotifications();
const route = useRoute();
const report = ref<SharedReportView | null>(null);
const loading = ref(true);
const error = ref("");
const downloadFormat = ref<"json" | "csv" | null>(null);
const downloadError = ref("");
const token = computed(() => String(route.params.token ?? ""));
const definition = computed(() => report.value?.strategyDefinition ?? {});
const execution = computed(() => definition.value.execution && typeof definition.value.execution === "object" ? definition.value.execution as Record<string, unknown> : {});
const costs = computed(() => definition.value.costs && typeof definition.value.costs === "object" ? definition.value.costs as Record<string, unknown> : {});
const risk = computed(() => definition.value.risk && typeof definition.value.risk === "object" ? definition.value.risk as Record<string, unknown> : {});
const decisionLabels = {rejected:"Investigation closed",needs_more_evidence:"More evidence needed",ready_for_replay:"Ready for further replay"};
function citationLabel(reference: EvidenceReference) {
  const evidence = reference.kind === "verdict" ? report.value?.verdicts.find(item => item.id === reference.id)?.category
    : reference.kind === "failure" ? report.value?.failures.find(item => item.id === reference.id)?.title
    : report.value?.trades.find(item => item.id === reference.id);
  const label = typeof evidence === "string" ? evidence : evidence ? `${evidence.symbol}: ${evidence.entryDate} to ${evidence.exitDate}` : reference.id;
  return `${label} · ${reference.kind}`;
}

const operatorLabel: Record<string, string> = {
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  eq: "equals",
  crosses_above: "crosses above",
  crosses_below: "crosses below",
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function describeValue(value: unknown): string {
  const item = object(value);
  if (typeof item.constant === "number") return String(item.constant);
  if (typeof item.source === "string") return item.source;
  if (typeof item.indicator === "string") {
    const parameters = Object.entries(object(item.parameters)).map(([key, parameter]) => `${key} ${String(parameter)}`).join(", ");
    return parameters ? `${item.indicator} (${parameters})` : item.indicator;
  }
  if (item.lag) {
    const lag = object(item.lag);
    return `${describeValue(lag.value)} lagged ${String(lag.bars ?? 0)} bars`;
  }
  return "unreported value";
}
function describeCondition(value: unknown): string {
  const condition = object(value);
  if (Array.isArray(condition.all)) return condition.all.map(describeCondition).map((item) => `(${item})`).join(" and ");
  if (Array.isArray(condition.any)) return condition.any.map(describeCondition).map((item) => `(${item})`).join(" or ");
  if (condition.not) return `not (${describeCondition(condition.not)})`;
  return `${describeValue(condition.left)} ${operatorLabel[String(condition.operator)] ?? String(condition.operator ?? "compares with")} ${describeValue(condition.right)}`;
}
const trials = computed(() => (Array.isArray(report.value?.raw.parameterTrials) ? report.value!.raw.parameterTrials : []) as Array<Record<string,unknown>>);
function curve(key:string):CurvePoint[] { const raw=report.value?.raw[key]; if(!Array.isArray(raw))return [];return raw.flatMap(value=>{const point=object(value);const number=point.value ?? point.equity;return typeof point.date === "string" && typeof number === "number" && Number.isFinite(number) ? [{date:point.date,value:key === "drawdownCurve" ? -Math.abs(number) : number,benchmark:typeof point.benchmark === "number" ? point.benchmark : undefined}] : [];}); }
const entryRule = computed(() => describeCondition(definition.value.entry));
const exitRule = computed(() => describeCondition(definition.value.exit));
const formatMoney = (value: number) => value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const formatDate = (value: string) => {
  if (!value) return "Not reported";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
};

async function loadReport() {
  loading.value = true;
  error.value = "";
  try {
    const payload = await apiRequest<unknown>(`/api/shared/reports/${encodeURIComponent(token.value)}`);
    report.value = normalizeSharedReport(unwrap(payload, "report"));
  } catch (issue) {
    report.value = null;
    error.value = issue instanceof Error ? issue.message : "This report could not be loaded.";
  } finally {
    loading.value = false;
  }
}

async function download(format: "json" | "csv") {
  if (!report.value || downloadFormat.value) return;
  downloadFormat.value = format;
  downloadError.value = "";
  try {
    const slug = report.value.name.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase() || "court-report";
    const file = await apiDownload(
      `/api/shared/reports/${encodeURIComponent(token.value)}/export?format=${format}`,
      `${slug}-${format === "csv" ? "trades.csv" : "record.json"}`,
    );
    saveDownload(file);
    notifications.push(`${format === "csv" ? "Trade CSV" : "Court record"} downloaded.`);
  } catch (issue) {
    downloadError.value = issue instanceof Error ? issue.message : "The report could not be downloaded.";
  } finally {
    downloadFormat.value = null;
  }
}

onMounted(loadReport);
</script>

<template>
  <div class="shared-report">
    <div class="report-shell">
      <RouterLink class="back-link" to="/"><ArrowLeft :size="14" />Strategy Court</RouterLink>

      <section v-if="loading" class="page-state" role="status">
        <span class="loading-ring" aria-hidden="true" />
        <h1>Opening the Court record</h1>
        <p>Loading the shared strategy, evidence and verdicts.</p>
      </section>

      <section v-else-if="error" class="page-state page-state--error">
        <FileText :size="24" aria-hidden="true" />
        <StatusBadge status="Unavailable" />
        <h1>This report is not available</h1>
        <p role="alert">{{ error }}</p>
        <button class="report-button" type="button" @click="loadReport"><RefreshCw :size="15" />Try again</button>
      </section>

      <template v-else-if="report">
        <header class="report-hero">
          <div class="report-hero__copy">
            <div class="hero-status"><StatusBadge :status="report.summary" /><span>Read-only Court report</span></div>
            <h1>{{ report.name }}</h1>
            <p>{{ report.description }}</p>
            <div class="symbol-row"><span v-for="symbol in report.symbols" :key="symbol">{{ symbol }}</span></div>
          </div>
          <div class="report-actions">
            <button class="report-button report-button--secondary" type="button" :disabled="Boolean(downloadFormat)" @click="download('json')"><Download :size="15" />{{ downloadFormat === "json" ? "Preparing JSON" : "JSON record" }}</button>
            <button class="report-button report-button--secondary" type="button" :disabled="Boolean(downloadFormat)" @click="download('csv')"><Download :size="15" />{{ downloadFormat === "csv" ? "Preparing CSV" : "Trade CSV" }}</button>
            <p v-if="downloadError" role="alert">{{ downloadError }}</p>
          </div>
        </header>

        <section v-if="report.decisions.length" class="report-section">
          <header><h2>Investigation decision</h2><span>Confirmed {{ formatDate(report.decisions[0]!.confirmedAt) }}</span></header>
          <h3>{{ decisionLabels[report.decisions[0]!.outcome] }}</h3>
          <p>{{ report.decisions[0]!.rationale }}</p>
          <ul><li v-for="reference in report.decisions[0]!.evidenceRefs" :key="`${reference.kind}:${reference.id}`"><a :href="`#${reference.kind}-${reference.id}`">{{ citationLabel(reference) }}</a></li></ul>
          <dl><dt>Remaining uncertainty</dt><dd>{{ report.decisions[0]!.uncertainties }}</dd><dt>Revisit when</dt><dd>{{ report.decisions[0]!.revisitCriteria }}</dd></dl>
          <details v-if="report.decisions.length>1"><summary>Earlier confirmed decisions</summary><div v-for="(decision,index) in report.decisions.slice(1)" :key="index"><h3>{{ decisionLabels[decision.outcome] }}</h3><p>{{ decision.rationale }}</p><p>Remaining uncertainty: {{ decision.uncertainties }}</p><p>Revisit when: {{ decision.revisitCriteria }}</p><ul><li v-for="reference in decision.evidenceRefs" :key="`${reference.kind}:${reference.id}`"><a :href="`#${reference.kind}-${reference.id}`">{{ citationLabel(reference) }}</a></li></ul><small>{{ formatDate(decision.confirmedAt) }}</small></div></details>
          <small>This shared record reflects the latest confirmed decision for this run.</small>
        </section>
        <section v-if="report.failures.length" class="report-section">
          <header><h2>Failure evidence</h2></header>
          <div v-for="failure in report.failures" :id="`failure-${failure.id}`" :key="failure.id"><h3>{{ failure.title }}</h3><p>{{ failure.summary }}</p></div>
        </section>

        <section class="metric-grid" aria-label="Court metrics">
          <article v-for="metric in report.metrics" :key="metric.label">
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
          </article>
        </section>

        <CourtResultChart v-if="curve('equityCurve').length" :equity-points="curve('equityCurve')" :drawdown-points="curve('drawdownCurve')" title="Recorded performance" />
        <ParameterMatrix v-if="trials.length" :trials="trials" />
        <section class="report-section strategy-section">
          <header><div><span class="section-badge">Strategy</span><h2>Rules that were tested</h2></div><span>Version {{ report.strategyVersion }}{{ report.evaluationInformed ? " · evaluation-informed" : "" }}</span></header>
          <p class="interpretation">{{ report.interpretation }}</p>
          <div class="rule-grid">
            <article><span>Entry</span><p>{{ entryRule }}</p></article>
            <article><span>Exit</span><p>{{ exitRule }}</p></article>
          </div>
          <dl class="strategy-facts">
            <div><dt>Direction</dt><dd>{{ definition.direction ?? "Not reported" }}</dd></div>
            <div><dt>Timeframe</dt><dd>{{ definition.timeframe ?? "Not reported" }}</dd></div>
            <div><dt>Signal</dt><dd>{{ execution.signalAt ?? "Not reported" }}</dd></div>
            <div><dt>Fill</dt><dd>{{ execution.executeAt ?? "Not reported" }}</dd></div>
            <div><dt>Commission</dt><dd>{{ costs.commissionBpsPerSide ?? "Not reported" }} bps per side</dd></div>
            <div><dt>Slippage</dt><dd>{{ costs.slippageBpsPerSide ?? "Not reported" }} bps per side</dd></div>
            <div><dt>Stop loss</dt><dd>{{ risk.stopLossPercent ?? "None" }}{{ risk.stopLossPercent !== undefined ? "%" : "" }}</dd></div>
            <div><dt>Take profit</dt><dd>{{ risk.takeProfitPercent ?? "None" }}{{ risk.takeProfitPercent !== undefined ? "%" : "" }}</dd></div>
          </dl>
        </section>

        <section class="report-section verdict-section">
          <header><div><span class="section-badge">Court</span><h2>Deterministic findings</h2></div><span>{{ report.verdicts.length }} tests</span></header>
          <div class="verdict-list">
            <article v-for="verdict in report.verdicts" :id="`verdict-${verdict.id}`" :key="verdict.id">
              <StatusBadge :status="verdict.status" />
              <div><h3>{{ verdict.category }}</h3><p>{{ verdict.finding }}</p></div>
              <dl><div><dt>Observed</dt><dd>{{ verdict.measure }}</dd></div><div><dt>Threshold</dt><dd>{{ verdict.threshold }}</dd></div></dl>
            </article>
            <p v-if="!report.verdicts.length" class="empty-copy">No verdicts were included in this record.</p>
          </div>
        </section>

        <section class="two-column">
          <article class="report-section fact-panel">
            <header><div><span class="section-badge">Data</span><h2>Snapshot provenance</h2></div></header>
            <dl><div v-for="item in report.data" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div></dl>
          </article>
          <article class="report-section fact-panel">
            <header><div><span class="section-badge">Run</span><h2>Execution assumptions</h2></div></header>
            <dl><div v-for="item in report.assumptions" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div></dl>
          </article>
        </section>

        <section class="report-section trades-section">
          <header><div><span class="section-badge">Ledger</span><h2>Completed trades</h2></div><span>{{ report.trades.length }} recorded</span></header>
          <div class="table-scroll">
            <table>
              <thead><tr><th>Symbol</th><th>Entry</th><th>Exit</th><th>Fills</th><th>Costs</th><th>Net</th><th>Reason</th></tr></thead>
              <tbody><tr v-for="trade in report.trades" :id="`trade-${trade.id}`" :key="trade.id"><td><strong>{{ trade.symbol }}</strong></td><td>{{ formatDate(trade.entryDate) }}</td><td>{{ formatDate(trade.exitDate) }}</td><td>{{ formatMoney(trade.entryPrice) }} → {{ formatMoney(trade.exitPrice) }}</td><td>{{ formatMoney(trade.costs) }}</td><td :class="trade.netProfit >= 0 ? 'positive' : 'negative'">{{ trade.netProfit >= 0 ? "+" : "−" }}{{ formatMoney(Math.abs(trade.netProfit)) }}</td><td>{{ trade.exitReason }}</td></tr></tbody>
            </table>
            <p v-if="!report.trades.length" class="empty-copy">No completed trades were returned.</p>
          </div>
        </section>

        <section class="report-section history-section">
          <header><div><span class="section-badge">History</span><h2>Strategy versions</h2></div><span>{{ report.versions.length }} immutable versions</span></header>
          <ol>
            <li v-for="version in report.versions" :key="version.version">
              <span class="version-number">{{ version.version }}</span>
              <div><strong>Version {{ version.version }}</strong><p>{{ version.interpretation }}</p><small>{{ version.source }} · {{ version.confirmed ? "confirmed" : "draft" }}{{ version.evaluationInformed ? " · evaluation-informed" : "" }} · {{ formatDate(version.createdAt) }}</small></div>
            </li>
          </ol>
        </section>

        <footer class="report-footer">
          <p>{{ report.limitation }}</p>
          <dl><div><dt>Engine</dt><dd>{{ report.engineVersion }}</dd></div><div><dt>Reproducibility ID</dt><dd>{{ report.reproducibilityId }}</dd></div></dl>
        </footer>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.table-scroll { max-height:560px;overflow:auto; }
.table-scroll th { position:sticky;top:0;z-index:2;background:#141414; }
.table-scroll th:first-child,.table-scroll td:first-child { position:sticky;left:0;background:#111;z-index:1; }
.report-section [id],tr[id] { scroll-margin-top:30px; }

.report-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;justify-items:stretch}.report-actions>p{grid-column:1/-1;max-width:310px;margin:2px 0 0;color:#aaa;font-size:10px;line-height:1.45}.report-button:disabled{opacity:.55;cursor:default}
.shared-report{min-height:100vh;color:#d8d8d8;background:#090909}.report-shell{width:min(1180px,calc(100% - 48px));margin:0 auto;padding:36px 0 96px}.back-link{display:inline-flex;align-items:center;gap:8px;margin-bottom:54px;color:#777;font-size:11px;text-decoration:none}.back-link:hover,.back-link:focus-visible{color:#eee}.page-state{display:grid;min-height:62vh;place-items:center;align-content:center;gap:12px;text-align:center}.page-state h1{margin:8px 0 0;color:#f4f4f4;font-size:clamp(32px,5vw,58px);letter-spacing:-.055em}.page-state p{max-width:480px;margin:0 0 12px;color:#777;font-size:13px}.loading-ring{width:25px;height:25px;border:2px solid #303030;border-top-color:#f1f1f1;border-radius:50%;animation:spin 900ms linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.report-button{display:inline-flex;min-height:42px;align-items:center;justify-content:center;gap:9px;padding:0 16px;border:1px solid #e8e8e8;border-radius:4px;color:#080808;background:#ececec;font:600 11px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer;box-shadow:0 14px 32px rgba(0,0,0,.42)}.report-button--secondary{border-color:#343434;color:#ddd;background:#171717;box-shadow:0 18px 42px rgba(0,0,0,.38),inset 0 1px rgba(255,255,255,.04)}.report-button:hover,.report-button:focus-visible{filter:brightness(1.12);outline:2px solid #fff;outline-offset:2px}.report-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:50px;padding:0 0 62px;border-bottom:1px solid rgba(255,255,255,.1)}.hero-status{display:flex;align-items:center;gap:13px;margin-bottom:20px;color:#6f6f6f;font-size:10px}.report-hero h1{max-width:900px;margin:0;color:#f7f7f7;font-size:clamp(48px,7vw,90px);font-weight:570;line-height:.94;letter-spacing:-.07em}.report-hero__copy>p{max-width:720px;margin:23px 0 0;color:#929292;font-size:14px;line-height:1.65}.symbol-row{display:flex;flex-wrap:wrap;gap:7px;margin-top:26px}.symbol-row span,.section-badge{display:inline-flex;min-height:25px;align-items:center;padding:0 9px;border:1px solid #2e2e2e;border-radius:999px;color:#a4a4a4;background:#151515;font:550 10px Inter,ui-sans-serif,system-ui,sans-serif}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid rgba(255,255,255,.1)}.metric-grid article{display:grid;min-height:132px;align-content:center;gap:13px;padding:24px;border-right:1px solid rgba(255,255,255,.08)}.metric-grid article:last-child{border-right:0}.metric-grid span{color:#707070;font-size:10px}.metric-grid strong{color:#f1f1f1;font-size:24px;font-weight:560;letter-spacing:-.04em}.report-section{margin-top:72px}.report-section>header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:25px}.report-section>header>div{display:grid;gap:11px}.report-section h2{margin:0;color:#efefef;font-size:clamp(27px,3.6vw,45px);font-weight:550;letter-spacing:-.055em}.report-section>header>span{color:#666;font-size:10px}.interpretation{max-width:820px;margin:0 0 28px;color:#a7a7a7;font-size:15px;line-height:1.7}.rule-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;padding:1px;background:#292929;box-shadow:0 34px 84px rgba(0,0,0,.46)}.rule-grid article{min-height:164px;padding:27px;background:#111}.rule-grid span{color:#6c6c6c;font-size:10px}.rule-grid p{margin:35px 0 0;color:#e4e4e4;font-size:15px;line-height:1.65}.strategy-facts{display:grid;grid-template-columns:repeat(4,1fr);margin:1px 0 0;padding:0;background:#292929;gap:1px}.strategy-facts div{display:grid;gap:8px;padding:17px;background:#0f0f0f}.strategy-facts dt,.fact-panel dt,.report-footer dt{color:#626262;font-size:9px}.strategy-facts dd,.fact-panel dd,.report-footer dd{margin:0;color:#adadad;font-size:11px;overflow-wrap:anywhere}.verdict-list{border-top:1px solid rgba(255,255,255,.1)}.verdict-list article{display:grid;grid-template-columns:105px minmax(0,1fr) minmax(260px,.75fr);align-items:start;gap:28px;padding:24px 0;border-bottom:1px solid rgba(255,255,255,.075)}.verdict-list h3{margin:2px 0 7px;color:#e5e5e5;font-size:15px}.verdict-list p{margin:0;color:#858585;font-size:11px;line-height:1.55}.verdict-list dl{display:grid;gap:9px;margin:0}.verdict-list dl div{display:grid;grid-template-columns:70px 1fr;gap:10px}.verdict-list dt{color:#606060;font-size:9px}.verdict-list dd{margin:0;color:#aaa;font-size:10px}.two-column{display:grid;grid-template-columns:1fr 1fr;gap:44px}.fact-panel{padding:25px;border:1px solid #292929;background:#101010;box-shadow:0 30px 70px rgba(0,0,0,.38),inset 0 1px rgba(255,255,255,.03)}.fact-panel.report-section>header{margin-bottom:8px}.fact-panel h2{font-size:25px}.fact-panel dl{margin:0}.fact-panel dl div{display:flex;justify-content:space-between;gap:20px;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.07)}.table-scroll{overflow-x:auto;border-top:1px solid rgba(255,255,255,.1)}table{width:100%;border-collapse:collapse;white-space:nowrap}th{padding:13px 12px;color:#616161;font:600 9px Inter,ui-sans-serif,system-ui,sans-serif;text-align:left}td{padding:17px 12px;border-top:1px solid rgba(255,255,255,.07);color:#929292;font-size:10px}th:first-child,td:first-child{padding-left:0}th:last-child,td:last-child{padding-right:0}td strong{color:#eee}.positive{color:#d7d7d7}.negative{color:#8a8a8a}.empty-copy{margin:0;padding:28px 0;color:#6c6c6c;font-size:11px}.history-section ol{margin:0;padding:0;border-top:1px solid rgba(255,255,255,.1);list-style:none}.history-section li{display:grid;grid-template-columns:38px 1fr;gap:18px;padding:21px 0;border-bottom:1px solid rgba(255,255,255,.075)}.version-number{display:grid;width:32px;height:32px;place-items:center;border:1px solid #333;border-radius:50%;color:#aaa;font-size:10px}.history-section strong{color:#e4e4e4;font-size:12px}.history-section p{margin:6px 0;color:#898989;font-size:11px;line-height:1.55}.history-section small{color:#626262;font-size:9px}.report-footer{display:flex;align-items:flex-start;justify-content:space-between;gap:40px;margin-top:78px;padding-top:24px;border-top:1px solid rgba(255,255,255,.1)}.report-footer>p{max-width:550px;margin:0;color:#7a7a7a;font-size:11px;line-height:1.6}.report-footer dl{display:grid;gap:10px;margin:0}.report-footer dl div{display:grid;grid-template-columns:115px 1fr;gap:15px}.report-footer dd{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
@media(max-width:900px){.metric-grid{grid-template-columns:1fr 1fr}.metric-grid article:nth-child(2){border-right:0}.metric-grid article:nth-child(-n+2){border-bottom:1px solid rgba(255,255,255,.08)}.strategy-facts{grid-template-columns:1fr 1fr}.verdict-list article{grid-template-columns:90px 1fr}.verdict-list dl{grid-column:2}.two-column{grid-template-columns:1fr;gap:0}}
@media(max-width:650px){.report-shell{width:min(100% - 30px,1180px);padding-top:22px}.back-link{margin-bottom:38px}.report-hero{grid-template-columns:1fr;gap:28px}.report-hero .report-button{justify-self:start}.metric-grid{grid-template-columns:1fr}.metric-grid article{min-height:94px;border-right:0;border-bottom:1px solid rgba(255,255,255,.08)!important}.rule-grid{grid-template-columns:1fr}.strategy-facts{grid-template-columns:1fr 1fr}.verdict-list article{grid-template-columns:1fr;gap:14px}.verdict-list dl{grid-column:auto}.report-section>header{align-items:flex-start;flex-direction:column}.report-footer{flex-direction:column}.report-footer dl div{grid-template-columns:1fr}}
</style>
