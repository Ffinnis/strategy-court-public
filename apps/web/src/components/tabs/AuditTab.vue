<script setup lang="ts">
import { computed, ref } from "vue";
import { Bot, FileJson2, Fingerprint, Scale, Table2, UserRound } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import { apiDownload, saveDownload } from "@/services/api";
import OwnerShareControls from "@/components/OwnerShareControls.vue";

const store = useCourtStore();
const events = computed(() => [...(store.currentCase?.audit ?? [])].reverse());
const actorIcon = { user: UserRound, agent: Bot, system: Scale };
const actorLabel = { user: "User", agent: "Agent", system: "System" } as const;
const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const reportRunId = computed(() => (
  store.latestRun?.status === "completed"
    ? store.latestRun.id
    : store.currentCase?.runs.find((run) => run.status === "completed")?.id ?? ""
));
const exporting = ref<"json" | "csv" | null>(null);

async function downloadReport(format: "json" | "csv") {
  if (!store.currentCase || !reportRunId.value || exporting.value) return;
  exporting.value = format;
  store.error = null;
  try {
    const slug = store.currentCase.name.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase() || "court-case";
    const file = await apiDownload(
      `/api/reports/${encodeURIComponent(reportRunId.value)}/export?format=${format}`,
      `${slug}-${format === "csv" ? "trades.csv" : "report.json"}`,
    );
    saveDownload(file);
  } catch (issue) {
    store.error = issue instanceof Error ? issue.message : "Could not export the Court report.";
  } finally {
    exporting.value = null;
  }
}
</script>

<template>
  <div class="audit-stack">
    <section class="audit-lead card"><div><p class="eyebrow">Immutable investigation record</p><h2>Every decision has an actor.</h2><p>User approvals, agent hypotheses, system tests, failed variants, and replay steps remain attributable.</p></div><div class="audit-actions"><button class="button button--secondary" type="button" :disabled="!reportRunId || Boolean(exporting)" @click="downloadReport('json')"><FileJson2 :size="15" />{{ exporting === "json" ? "Preparing JSON" : "JSON report" }}</button><button class="button button--secondary" type="button" :disabled="!reportRunId || Boolean(exporting)" @click="downloadReport('csv')"><Table2 :size="15" />{{ exporting === "csv" ? "Preparing CSV" : "Trade CSV" }}</button></div></section>
    <div class="audit-layout">
      <section class="card timeline-card">
        <div class="card__header"><div><h3 class="card__title">Case timeline</h3><p class="card__description">Newest event first · {{ events.length }} recorded events</p></div></div>
        <ol class="timeline"><li v-for="event in events" :key="event.id" :class="`timeline-item--${event.actor}`"><span class="timeline-icon"><component :is="actorIcon[event.actor]" :size="14" /></span><div><div class="timeline-meta"><span class="actor-pill">{{ actorLabel[event.actor] }}</span><time :datetime="event.createdAt">{{ formatDate(event.createdAt) }}</time></div><h3>{{ event.action }}</h3><p>{{ event.detail }}</p><span class="event-id mono">{{ event.id }}</span></div></li></ol>
      </section>
      <aside class="audit-facts">
        <OwnerShareControls v-if="reportRunId" entity-type="report" :entity-id="reportRunId" resource-name="this Court report" />
        <section class="card"><div class="card__header"><div><h3 class="card__title">Reproducibility</h3></div><Fingerprint :size="17" class="subtle" /></div><dl><div><dt>Engine</dt><dd>{{ store.result?.engineVersion ?? "Not run" }}</dd></div><div><dt>Input hash</dt><dd class="mono">{{ store.result?.reproducibilityId ?? "Pending" }}</dd></div><div><dt>Snapshot</dt><dd>{{ store.result?.assumptions.Provider ?? "API run snapshot" }}</dd></div><div><dt>Versions</dt><dd>{{ store.currentCase?.versions.length }}</dd></div><div><dt>Variant attempts</dt><dd>{{ store.variants.length }} of 3</dd></div></dl></section>
        <section class="actor-key card"><h3>Actor key</h3><div><span class="key-icon key-icon--user"><UserRound :size="13" /></span><p><strong>User</strong><small>Approval or manual control</small></p></div><div><span class="key-icon key-icon--agent"><Bot :size="13" /></span><p><strong>Agent</strong><small>Interpretation or hypothesis</small></p></div><div><span class="key-icon key-icon--system"><Scale :size="13" /></span><p><strong>System</strong><small>Validation or deterministic test</small></p></div></section>
      </aside>
    </div>
  </div>
</template>

<style scoped lang="scss">
.audit-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}.audit-actions .button{white-space:nowrap}
.audit-stack{display:grid;gap:14px}.audit-lead{display:flex;align-items:center;justify-content:space-between;gap:25px;padding:25px}.audit-lead h2{margin:0;font-size:22px;letter-spacing:-.035em}.audit-lead p:not(.eyebrow){margin:8px 0 0;color:#858b88;font-size:11px}.audit-layout{display:grid;grid-template-columns:minmax(0,1fr) 290px;align-items:start;gap:14px}.timeline{margin:0;padding:8px 24px 20px;list-style:none}.timeline li{position:relative;display:grid;grid-template-columns:34px 1fr;gap:13px;padding:17px 0}.timeline li:not(:last-child)::after{position:absolute;top:51px;bottom:-1px;left:16px;width:1px;content:"";background:#292d2e}.timeline-icon{position:relative;z-index:1;display:grid;width:33px;height:33px;place-items:center;border:1px solid #303536;border-radius:9px;color:#8e9491;background:#151718}.timeline-item--user .timeline-icon{color:#d4d4d8;border-color:rgba(255,255,255,.06);background:rgba(255,255,255,.06)}.timeline-item--agent .timeline-icon{color:#e4e4e7;border-color:rgba(255,255,255,.06);background:rgba(255,255,255,.06)}.timeline-item--system .timeline-icon{color:#aeb3b0}.timeline-meta{display:flex;align-items:center;gap:8px;margin-bottom:7px}.actor-pill{padding:4px 7px;border:1px solid #2d3132;border-radius:5px;color:#9a9a9a;background:rgba(255,255,255,.025);font:600 9px Inter,ui-sans-serif,system-ui,sans-serif;letter-spacing:0;text-transform:none}.timeline-meta time{color:#666c69;font:8px "IBM Plex Mono",monospace}.timeline h3{margin:0 0 5px;font-size:12px}.timeline p{margin:0;color:#858b88;font-size:10px;line-height:1.5}.event-id{display:block;margin-top:8px;color:#4f5552;font-size:7px}.audit-facts{display:grid;gap:14px}.audit-facts dl{margin:0;padding:6px 17px 14px}.audit-facts dl div{display:grid;gap:4px;padding:11px 0;border-bottom:1px solid #232627}.audit-facts dl div:last-child{border:0}.audit-facts dt{color:#686e6b;font-size:8px}.audit-facts dd{overflow-wrap:anywhere;margin:0;color:#aeb3b0;font-size:10px}.actor-key{padding:18px}.actor-key>h3{margin:0 0 14px;font-size:11px}.actor-key>div{display:flex;align-items:center;gap:10px;padding:9px 0}.key-icon{display:grid;width:28px;height:28px;place-items:center;border:1px solid #303536;border-radius:8px}.key-icon--user{color:#d4d4d8}.key-icon--agent{color:#e4e4e7}.key-icon--system{color:#adb2af}.actor-key p{display:grid;gap:2px;margin:0}.actor-key strong{font-size:10px}.actor-key small{color:#6e7471;font-size:8px}
@media(max-width:850px){.audit-layout{grid-template-columns:1fr}.audit-facts{grid-template-columns:1fr 1fr}.audit-lead{align-items:flex-start;flex-direction:column}}
@media(max-width:560px){.audit-facts{grid-template-columns:1fr}.timeline{padding-inline:15px}.audit-lead{padding:19px}}
/* Clean workspace hierarchy */
.audit-lead .eyebrow{display:inline-flex;width:max-content;padding:4px 7px;border:1px solid rgba(255,255,255,.09);border-radius:2px;color:#969696;background:rgba(255,255,255,.025);font:600 10px Inter,ui-sans-serif,system-ui,sans-serif;letter-spacing:0;text-transform:none}
.audit-stack{gap:36px}.audit-lead{padding:0 0 28px;border-bottom:1px solid rgba(255,255,255,.08)}.audit-lead h2{font-size:29px}.audit-lead p:not(.eyebrow){font-size:13px}.audit-layout{grid-template-columns:minmax(0,1fr) 300px;gap:56px}.timeline{padding:0}.timeline li{grid-template-columns:38px 1fr;gap:15px;padding:19px 0}.timeline li:not(:last-child)::after{left:18px;background:rgba(255,255,255,.08)}.timeline-icon{width:36px;height:36px;border:0;border-radius:11px;background:rgba(255,255,255,.055)}.timeline-meta{margin-bottom:8px}.actor-pill{border:0;border-radius:999px;background:rgba(255,255,255,.055);font-size:9px}.timeline-meta time{font-size:9px}.timeline h3{font-size:14px}.timeline p{font-size:12px;line-height:1.6}.event-id{font-size:9px}.audit-facts{gap:28px;padding-left:25px;border-left:1px solid rgba(255,255,255,.08)}.audit-facts>.card{border-bottom:1px solid rgba(255,255,255,.07)}.audit-facts dl{padding-inline:0}.audit-facts dt{font-size:10px}.audit-facts dd{font-size:12px}.actor-key{padding:0 0 20px}.actor-key>h3{font-size:13px}.key-icon{border:0;background:rgba(255,255,255,.05)}.actor-key strong{font-size:12px}.actor-key small{font-size:10px}
@media(max-width:850px){.audit-facts{padding-top:24px;padding-left:0;border-top:1px solid rgba(255,255,255,.08);border-left:0}}
</style>
