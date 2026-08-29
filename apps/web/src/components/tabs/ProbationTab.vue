<script setup lang="ts">
import { computed, watch } from "vue";
import {
  Activity, CalendarClock, CheckCircle2, ChevronRight, CircleAlert, Clock3,
  FastForward, LockKeyhole, Play, Radio, RefreshCw, StepForward,
} from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import type { MonitoringChange } from "@/types";

const store = useCourtStore();
const controls = [
  { label: "+1 bar", value: "one_bar" as const, icon: StepForward },
  { label: "+5 bars", value: "five_bars" as const, icon: FastForward },
  { label: "+20 bars", value: "twenty_bars" as const, icon: FastForward },
  { label: "Next signal", value: "next_signal" as const, icon: Radio },
  { label: "Next trade", value: "next_trade" as const, icon: CheckCircle2 },
];

const formatDate = (value?: string | null) => value
  ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  : "Not checked";
const formatTimestamp = (value?: string | null) => value
  ? new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  : "No snapshot yet";
const money = (value: number) => `${value < 0 ? "−" : "+"}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const changeLabel = (change: MonitoringChange) => {
  if (change.type === "entry_signal_activated") return `${change.symbol} entry activated`;
  if (change.type === "exit_signal_activated") return `${change.symbol} exit activated`;
  if (change.type === "regime_changed") return "Market regime changed";
  return `${String(change.metric ?? "Metric").replaceAll(/([A-Z])/g, " $1").toLowerCase()} changed`;
};
const monitoringTitle = computed(() => formatDate(store.monitoringStatus?.evaluatedDate));
const newReplayTradeIds = computed(() => new Set(store.replay?.newTrades.map((trade) => trade.id) ?? []));

watch(() => store.monitoringCandidate?.id, (versionId) => {
  if (versionId) void store.loadMonitoringStatus(versionId, { refresh: false });
}, { immediate: true });
</script>

<template>
  <div class="probation-page">
    <section v-if="store.monitoringCandidate" class="monitoring-surface">
      <header class="monitoring-heading">
        <div>
          <span class="status-badge"><Activity :size="13" /> Latest completed bar</span>
          <h2>{{ monitoringTitle }}</h2>
          <p v-if="store.monitoringStatus?.status === 'evaluated'">
            {{ store.monitoringStatus.currentRegime }} regime · Snapshot {{ formatTimestamp(store.monitoringStatus.snapshotFetchedAt) }}
          </p>
          <p v-else>No completed-bar evaluation has been saved for this version.</p>
        </div>
        <button
          class="button monitoring-action"
          type="button"
          :disabled="store.monitoringLoading"
          @click="store.loadMonitoringStatus(store.monitoringCandidate?.id, { refresh: true })"
        >
          <RefreshCw :size="15" :class="{ spinning: store.monitoringLoading && store.monitoringOperation === 'refresh' }" />
          {{ store.monitoringLoading && store.monitoringOperation === "refresh" ? "Checking latest bar" : "Check latest completed bar" }}
        </button>
      </header>

      <div v-if="store.monitoringError" class="monitoring-error" role="alert">
        <CircleAlert :size="16" />
        <span>{{ store.monitoringError }}</span>
        <button type="button" @click="store.loadMonitoringStatus(store.monitoringCandidate?.id, { refresh: false })">Retry</button>
      </div>

      <template v-if="store.monitoringStatus?.status === 'evaluated'">
        <div class="signal-board">
          <article v-for="signal in store.monitoringStatus.signals" :key="signal.symbol" class="signal-row">
            <div class="symbol-mark">{{ signal.symbol }}</div>
            <div class="signal-price">
              <strong>${{ signal.close.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}</strong>
              <span>{{ signal.completedBarDate }}</span>
            </div>
            <div class="rule-state">
              <span :class="{ active: signal.entry === true }">Entry {{ signal.entry === true ? "active" : signal.entry === false ? "clear" : "warming up" }}</span>
              <span :class="{ active: signal.exit === true }">Exit {{ signal.exit === true ? "active" : signal.exit === false ? "clear" : "warming up" }}</span>
            </div>
          </article>
        </div>

        <div v-if="store.monitoringStatus.metricCards.length" class="monitoring-metrics">
          <div v-for="metric in store.monitoringStatus.metricCards" :key="metric.label">
            <span>{{ metric.label }}</span>
            <strong :class="metric.tone">{{ metric.value }}</strong>
            <small>{{ metric.change }}</small>
          </div>
        </div>

        <div class="monitoring-detail-grid">
          <section>
            <div class="section-heading">
              <div><h3>Simulated positions</h3><p>Marked at the evaluated close.</p></div>
              <span class="count-badge">{{ store.monitoringStatus.positions.length }} open</span>
            </div>
            <div v-if="store.monitoringStatus.positions.length" class="monitoring-list">
              <div v-for="position in store.monitoringStatus.positions" :key="position.symbol">
                <strong>{{ position.symbol }}</strong>
                <span>Opened {{ position.entryDate }} · {{ position.barsHeld }} bars</span>
                <em :class="position.unrealizedProfit >= 0 ? 'positive' : 'negative'">{{ money(position.unrealizedProfit) }}</em>
              </div>
            </div>
            <p v-else class="quiet-state">No simulated positions are open.</p>
          </section>

          <section>
            <div class="section-heading">
              <div><h3>Changes since the last check</h3><p>Only newly activated states appear here.</p></div>
              <span class="count-badge">{{ store.monitoringStatus.changes.length }}</span>
            </div>
            <div v-if="store.monitoringStatus.changes.length" class="monitoring-list change-list">
              <div v-for="(change, index) in store.monitoringStatus.changes" :key="`${change.type}-${change.symbol}-${index}`">
                <strong>{{ changeLabel(change) }}</strong>
                <span>{{ String(change.before ?? "None") }} → {{ String(change.after ?? "None") }}</span>
              </div>
            </div>
            <p v-else class="quiet-state">No state changed since the previous evaluation.</p>
          </section>
        </div>

        <div v-if="store.monitoringStatus.warnings.length" class="warning-stack">
          <div v-for="warning in store.monitoringStatus.warnings" :key="warning"><CircleAlert :size="14" /><span>{{ warning }}</span></div>
        </div>
      </template>

      <div v-else-if="store.monitoringLoading" class="monitoring-placeholder" aria-live="polite">
        <RefreshCw :size="18" class="spinning" /> Loading the saved monitoring state…
      </div>
      <div v-else class="monitoring-placeholder">
        <Clock3 :size="18" /> Check the latest completed bar to establish the first monitoring state.
      </div>

      <footer v-if="store.monitoringLastSuccessAt" class="last-check">Last successful request {{ formatTimestamp(store.monitoringLastSuccessAt) }}</footer>
    </section>

    <section v-else class="monitoring-locked">
      <LockKeyhole :size="18" />
      <div><h3>Monitoring unlocks after confirmation</h3><p>Confirm the strategy version first.</p></div>
    </section>

    <div class="replay-divider"><span>Historical replay</span><i /></div>

    <div v-if="!store.replay && store.eligibleReplayVersions.length === 0" class="replay-locked">
      <LockKeyhole :size="18" />
      <div><h3>No version is eligible for replay</h3><p>Complete a surviving or inconclusive Court run.</p></div>
    </div>
    <div v-else-if="!store.replay" class="replay-empty">
      <section class="replay-brief">
        <div class="replay-brief__icon"><CalendarClock :size="24" /></div>
        <span class="status-badge">Hidden-period evidence</span>
        <h2>Reserve the untouched holdout.</h2>
        <p>Reveal it one completed bar at a time without changing the selected strategy.</p>
        <div class="replay-range">
          <div><span>Court evidence ends</span><strong>{{ store.currentCase?.endDate }}</strong></div>
          <ChevronRight :size="15" />
          <div><span>Hidden period</span><strong>Next available bar to snapshot end</strong></div>
        </div>
        <button class="button" type="button" :disabled="store.mutating || !store.probationCandidate" @click="store.startReplay(store.probationCandidate?.id)">
          <Play :size="15" fill="currentColor" />
          {{ store.mutating ? "Reserving period" : `Start version ${store.probationCandidate?.versionNumber} replay` }}
        </button>
      </section>
    </div>
    <div v-else class="replay-stack">
      <section class="replay-header">
        <div><span class="status-badge"><i /> Active replay</span><h2>{{ formatDate(store.replay.currentDate) }}</h2><p>{{ store.replay.regime }} regime</p></div>
        <div class="replay-progress"><span>{{ store.replay.startDate }}</span><div role="progressbar" :aria-valuenow="store.replay.progress" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: `${store.replay.progress}%` }" /></div><span>{{ store.replay.endDate }}</span></div>
      </section>
      <div class="monitoring-metrics"><div v-for="metric in store.replay.metrics" :key="metric.label"><span>{{ metric.label }}</span><strong :class="metric.tone">{{ metric.value }}</strong><small>Through {{ store.replay.currentDate }}</small></div></div>
      <section class="replay-comparison" aria-labelledby="replay-comparison-title">
        <div class="section-heading"><div><h3 id="replay-comparison-title">Historical versus observed</h3><p>Normalized to the revealed probation bars.</p></div></div>
        <div class="comparison-grid">
          <article v-for="item in store.replay.comparisons" :key="item.label">
            <span>{{ item.label }}</span>
            <div><small>Historical</small><strong>{{ item.historical }}</strong></div>
            <div><small>Observed</small><strong>{{ item.observed }}</strong></div>
          </article>
        </div>
      </section>
      <section class="replay-controls"><div><h3>Reveal more evidence</h3><p>Every symbol advances to the same completed bar.</p></div><div class="control-buttons"><button v-for="control in controls" :key="control.value" class="button button--secondary button--small" type="button" :disabled="store.mutating || store.replay.status === 'completed'" @click="store.advanceReplay(control.value)"><component :is="control.icon" :size="13" />{{ control.label }}</button></div></section>
      <div class="monitoring-detail-grid replay-detail-grid">
        <section><div class="section-heading"><div><h3>Signal state</h3><p>Revealed bars only.</p></div><Radio :size="16" /></div><div class="monitoring-list"><div v-for="signal in store.replay.signals" :key="signal.symbol"><strong>{{ signal.symbol }}</strong><span>{{ signal.detail }}</span><em>{{ signal.state }}</em></div></div></section>
        <section><div class="section-heading"><div><h3>Simulated positions</h3><p>No brokerage orders.</p></div><span class="count-badge">{{ store.replay.positions.length }} open</span></div><div v-if="store.replay.positions.length" class="monitoring-list"><div v-for="position in store.replay.positions" :key="position.symbol"><strong>{{ position.symbol }}</strong><span>Opened {{ position.opened }}</span><em class="positive">{{ position.pnl }}</em></div></div><p v-else class="quiet-state">No simulated positions are open.</p></section>
      </div>
      <section class="replay-trades" aria-labelledby="replay-trades-title">
        <div class="section-heading"><div><h3 id="replay-trades-title">Completed probation trades</h3><p>Every fill revealed in the reserved period.</p></div><span class="count-badge">{{ store.replay.trades.length }}</span></div>
        <div v-if="store.replay.trades.length" class="replay-trade-list">
          <article v-for="trade in store.replay.trades" :key="trade.id">
            <strong>{{ trade.symbol }}</strong>
            <span>{{ trade.entryDate }} → {{ trade.exitDate }}</span>
            <span>{{ trade.exitReason }}</span>
            <em :class="trade.netProfit >= 0 ? 'positive' : 'negative'">{{ money(trade.netProfit) }}</em>
            <small v-if="newReplayTradeIds.has(trade.id)">New this step</small>
          </article>
        </div>
        <p v-else class="quiet-state">No probation trade has closed yet.</p>
      </section>
      <div v-if="store.replay.warnings.length" class="warning-stack"><div v-for="warning in store.replay.warnings" :key="warning"><CircleAlert :size="14" /><span>{{ warning }}</span></div></div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.probation-page{display:grid;gap:48px;color:#e8e8e5}.monitoring-surface{position:relative;padding:34px;overflow:hidden;border:1px solid rgba(255,255,255,.09);border-radius:26px;background:radial-gradient(circle at 88% 0,rgba(255,255,255,.09),transparent 31%),linear-gradient(145deg,#151515,#0c0c0c 62%);box-shadow:0 30px 90px rgba(0,0,0,.52),inset 0 1px 0 rgba(255,255,255,.06)}.monitoring-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:28px}.monitoring-heading h2,.replay-header h2,.replay-brief h2{margin:12px 0 5px;font-size:32px;letter-spacing:-.045em}.monitoring-heading p,.replay-header p,.replay-brief p{margin:0;color:#94948f;font-size:13px;line-height:1.6}.status-badge,.count-badge{display:inline-flex;width:max-content;align-items:center;gap:7px;padding:6px 9px;border:1px solid rgba(255,255,255,.1);border-radius:999px;color:#c8c8c4;background:rgba(255,255,255,.055);font-size:11px;font-weight:600}.status-badge i{width:6px;height:6px;border-radius:50%;background:#f0f0ec;box-shadow:0 0 0 4px rgba(255,255,255,.08)}.monitoring-action{min-width:210px;justify-content:center;box-shadow:0 12px 35px rgba(0,0,0,.38)}.spinning{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.monitoring-error,.monitoring-locked,.replay-locked{display:flex;align-items:center;gap:12px;margin-top:22px;padding:14px 16px;border:1px solid rgba(255,255,255,.09);border-radius:14px;color:#d4c5c2;background:rgba(255,255,255,.055);font-size:12px}.monitoring-error button{margin-left:auto;border:0;color:#f1f1ed;background:transparent;font:inherit;text-decoration:underline;cursor:pointer}.signal-board{display:grid;grid-template-columns:repeat(auto-fit,minmax(255px,1fr));gap:10px;margin-top:30px}.signal-row{display:grid;grid-template-columns:48px 1fr auto;align-items:center;gap:12px;padding:15px;border:1px solid rgba(255,255,255,.075);border-radius:16px;background:rgba(255,255,255,.035);box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 12px 28px rgba(0,0,0,.2)}.symbol-mark{display:grid;width:42px;height:42px;place-items:center;border-radius:13px;color:#111;background:#ededeb;font-size:11px;font-weight:750}.signal-price{display:grid;gap:3px}.signal-price strong{font-size:15px}.signal-price span{color:#777773;font-size:10px}.rule-state{display:grid;justify-items:end;gap:5px}.rule-state span{padding:4px 7px;border-radius:999px;color:#777773;background:rgba(255,255,255,.035);font-size:9px}.rule-state span.active{color:#f4f4f0;background:rgba(255,255,255,.12);box-shadow:0 0 20px rgba(255,255,255,.08)}.monitoring-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:1px;margin-top:24px;overflow:hidden;border:1px solid rgba(255,255,255,.075);border-radius:16px;background:rgba(255,255,255,.07)}.monitoring-metrics>div{display:grid;gap:5px;padding:16px;background:#111}.monitoring-metrics span{color:#858580;font-size:10px}.monitoring-metrics strong{font-size:18px;letter-spacing:-.03em}.monitoring-metrics small{color:#62625f;font-size:9px}.monitoring-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:42px;margin-top:32px}.monitoring-detail-grid>section{min-width:0}.section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding-bottom:13px;border-bottom:1px solid rgba(255,255,255,.08)}.section-heading h3,.replay-controls h3,.monitoring-locked h3,.replay-locked h3{margin:0 0 4px;font-size:14px}.section-heading p,.replay-controls p,.monitoring-locked p,.replay-locked p{margin:0;color:#777773;font-size:10px}.count-badge{padding:5px 8px;font-size:9px}.monitoring-list>div{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.055)}.monitoring-list>div:last-child{border:0}.monitoring-list strong{font-size:11px}.monitoring-list span{overflow:hidden;color:#777773;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.monitoring-list em{color:#b8b8b3;font-size:10px;font-style:normal}.quiet-state{margin:0;padding:28px 0;color:#686864;font-size:11px}.warning-stack{display:grid;gap:7px;margin-top:22px}.warning-stack>div{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:11px;color:#aaa29a;background:rgba(255,255,255,.045);font-size:10px;line-height:1.45}.warning-stack svg{flex:0 0 auto;margin-top:1px}.monitoring-placeholder{display:flex;align-items:center;justify-content:center;gap:10px;min-height:150px;margin-top:28px;border:1px dashed rgba(255,255,255,.11);border-radius:18px;color:#81817d;font-size:12px}.last-check{margin-top:18px;color:#656561;font-size:9px}.monitoring-locked,.replay-locked{margin:0;padding:22px;border-radius:18px;background:rgba(255,255,255,.028);box-shadow:0 18px 50px rgba(0,0,0,.2)}.replay-divider{display:flex;align-items:center;gap:14px}.replay-divider span{color:#8a8a85;font-size:12px;font-weight:650}.replay-divider i{height:1px;flex:1;background:rgba(255,255,255,.08)}.replay-empty{display:grid;place-items:center}.replay-brief{display:flex;width:min(100%,720px);align-items:center;flex-direction:column;padding:46px;border:1px solid rgba(255,255,255,.08);border-radius:26px;text-align:center;background:radial-gradient(circle at 50% 0,rgba(255,255,255,.075),transparent 47%),rgba(255,255,255,.025);box-shadow:0 28px 80px rgba(0,0,0,.35)}.replay-brief__icon{display:grid;width:54px;height:54px;margin-bottom:18px;place-items:center;border-radius:16px;background:rgba(255,255,255,.08)}.replay-brief p{max-width:520px}.replay-range{display:flex;align-items:center;gap:14px;margin:23px 0;padding:14px 17px;border-radius:14px;background:rgba(255,255,255,.045)}.replay-range>div{display:grid;gap:4px}.replay-range span{color:#71716d;font-size:9px}.replay-range strong{font-size:11px}.replay-stack{display:grid;gap:28px}.replay-header{display:flex;align-items:center;justify-content:space-between;gap:24px}.replay-progress{display:grid;width:min(420px,48%);grid-template-columns:auto 1fr auto;align-items:center;gap:10px;color:#6e6e6a;font-size:9px}.replay-progress>div{height:5px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.08)}.replay-progress>div i{display:block;height:100%;border-radius:inherit;background:#efefeb;box-shadow:0 0 20px rgba(255,255,255,.24)}.replay-comparison{display:grid;gap:14px}.comparison-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;overflow:hidden;border:1px solid rgba(255,255,255,.075);border-radius:16px;background:rgba(255,255,255,.07)}.comparison-grid article{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:16px;background:#111}.comparison-grid article>span{grid-column:1/-1;color:#8d8d88;font-size:10px}.comparison-grid article>div{display:grid;gap:4px}.comparison-grid small{color:#5f5f5b;font-size:8px}.comparison-grid strong{font-size:12px}.replay-controls{display:flex;align-items:center;justify-content:space-between;gap:22px;padding:19px 0;border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08)}.control-buttons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px}.replay-detail-grid{margin-top:0}.replay-trades{display:grid;gap:10px}.replay-trade-list{display:grid}.replay-trade-list article{display:grid;grid-template-columns:70px 1.2fr 1fr auto auto;align-items:center;gap:14px;min-height:48px;border-bottom:1px solid rgba(255,255,255,.065);color:#777;font-size:10px}.replay-trade-list article strong{color:#ddd;font-size:11px}.replay-trade-list article em{font-style:normal}.replay-trade-list article small{padding:4px 7px;border-radius:999px;color:#d8d8d4;background:rgba(255,255,255,.08);font-size:8px}.positive{color:#e8e8e4!important}.negative{color:#bca8a5!important}
@media(max-width:900px){.monitoring-heading,.replay-header,.replay-controls{align-items:flex-start;flex-direction:column}.monitoring-action{width:100%}.monitoring-metrics{grid-template-columns:1fr 1fr}.monitoring-detail-grid{grid-template-columns:1fr;gap:28px}.replay-progress{width:100%}.control-buttons{justify-content:flex-start}.replay-trade-list article{grid-template-columns:70px 1fr auto}.replay-trade-list article span:nth-of-type(2){display:none}.replay-trade-list article small{grid-column:3}}
@media(max-width:560px){.monitoring-surface{padding:23px 18px;border-radius:20px}.monitoring-heading h2,.replay-header h2,.replay-brief h2{font-size:27px}.signal-row{grid-template-columns:44px 1fr}.rule-state{grid-column:1/-1;grid-template-columns:1fr 1fr;justify-items:stretch}.rule-state span{text-align:center}.monitoring-metrics{grid-template-columns:1fr}.monitoring-detail-grid{gap:24px}.replay-brief{padding:32px 20px}.replay-range{align-items:stretch;flex-direction:column}.replay-range svg{align-self:center;transform:rotate(90deg)}.comparison-grid{grid-template-columns:1fr}.control-buttons{display:grid;width:100%;grid-template-columns:1fr 1fr}.control-buttons button{width:100%}.replay-trade-list article{grid-template-columns:54px 1fr auto;gap:8px}}
</style>
