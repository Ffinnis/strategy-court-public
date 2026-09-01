<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Bot, ChevronDown, FileJson2, Fingerprint, Link2, Scale, Table2, UserRound } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import { apiDownload, saveDownload } from "@/services/api";
import FormSelect from "@/components/forms/FormSelect.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import { useNotifications } from "@/stores/notifications";
import type { AuditEvent } from "@/types";
import AgentActivity from "@/components/AgentActivity.vue";
import InvestigationChecklist from "@/components/InvestigationChecklist.vue";
import OwnerShareControls from "@/components/OwnerShareControls.vue";

const store = useCourtStore();
const actor = ref("all");
const eventType = ref("all");
const versionFilter = ref("all");
const page = ref(1);
const allEvents = computed(() => [...(store.currentCase?.audit ?? [])].reverse());
const typeOptions = computed(() => [{value:"all",label:"All event types"}, ...Array.from(new Set(allEvents.value.map(item=>item.entityType).filter(Boolean))).map(type=>({value:type!,label:type!.replaceAll("_"," ")}))]);
const versionOptions = computed(() => [{value:"all",label:"All versions"},...(store.currentCase?.versions ?? []).map(version=>({value:version.id,label:`Version ${version.versionNumber}`}))]);
function eventVersion(event: AuditEvent) { return event.entityType === "strategy_version" ? event.entityId : event.entityType === "court_run" ? store.currentCase?.runs.find(run=>run.id===event.entityId)?.versionId : undefined; }
const events = computed(() => allEvents.value.filter(event=>(actor.value === "all" || actor.value === event.actor) && (eventType.value === "all" || eventType.value === event.entityType) && (versionFilter.value === "all" || versionFilter.value === eventVersion(event))));
const pages = computed(() => Math.max(1,Math.ceil(events.value.length/30)));
const pageEvents = computed(() => events.value.slice((page.value-1)*30,page.value*30));
watch([actor,eventType,versionFilter],()=>{page.value=1;});
function openRecord(event: AuditEvent) { const version = eventVersion(event); if(version) store.selectVersion(version); store.activeTab=event.entityType === "strategy_version" ? "strategy" : event.entityType === "replay" ? "probation" : "court"; }
const notifications = useNotifications();
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
    notifications.push(`${format === "csv" ? "Trade CSV" : "Court report"} downloaded.`);
  } catch (issue) {
    store.error = issue instanceof Error ? issue.message : "Could not export the Court report.";
  } finally {
    exporting.value = null;
  }
}
</script>

<template>
  <div class="audit-stack">
    <section class="audit-lead" aria-labelledby="audit-title">
      <div class="audit-intro">
        <h2 id="audit-title">Case activity</h2>
        <p>Approvals, agent changes, tests, and replay steps remain attributable.</p>
      </div>
      <div class="audit-actions">
        <button class="button button--secondary" type="button" :disabled="!reportRunId || Boolean(exporting)" @click="downloadReport('json')">
          <FileJson2 :size="15" />{{ exporting === "json" ? "Preparing JSON" : "JSON report" }}
        </button>
        <button class="button button--secondary" type="button" :disabled="!reportRunId || Boolean(exporting)" @click="downloadReport('csv')">
          <Table2 :size="15" />{{ exporting === "csv" ? "Preparing CSV" : "Trade CSV" }}
        </button>
      </div>

      <details v-if="reportRunId" class="audit-disclosure share-disclosure">
        <summary><Link2 :size="15" /><span>Share report</span><ChevronDown :size="14" class="summary-chevron" /></summary>
        <OwnerShareControls entity-type="report" :entity-id="reportRunId" resource-name="this Court report" />
      </details>
    </section>

    <section class="timeline-section" aria-labelledby="timeline-title">
      <header class="timeline-heading">
        <h3 id="timeline-title">Case timeline</h3>
        <p>Newest event first · {{ events.length }} of {{ allEvents.length }} recorded events</p>
      </header>
      <div class="audit-filters"><SegmentedControl v-model="actor" label="Activity actor" :options="[{value:'all',label:'Everyone'},{value:'user',label:'You'},{value:'agent',label:'Agent'},{value:'system',label:'System'}]" /><FormSelect id="audit-event-type" v-model="eventType" :options="typeOptions" aria-label="Event type" /><FormSelect id="audit-version" v-model="versionFilter" :options="versionOptions" aria-label="Audit version" /></div>
      <div class="audit-table-wrap"><table class="audit-table"><thead><tr><th>Actor</th><th>Event</th><th>Version</th><th>Recorded</th></tr></thead><tbody><tr v-for="event in pageEvents" :key="event.id"><td><span class="audit-actor"><component :is="actorIcon[event.actor]" :size="14" />{{ actorLabel[event.actor] }}</span></td><td><details><summary>{{ event.action }}</summary><div class="audit-event-detail"><p>{{ event.detail }}</p><button v-if="eventVersion(event) || event.entityType === 'replay'" type="button" @click="openRecord(event)">Open related record</button><dl><dt>Event ID</dt><dd>{{ event.id }}</dd><dt v-if="event.entityId">Record ID</dt><dd v-if="event.entityId">{{ event.entityId }}</dd></dl><details v-if="event.before || event.after"><summary>Recorded change</summary><pre>{{ JSON.stringify({before:event.before,after:event.after},null,2) }}</pre></details></div></details></td><td>{{ eventVersion(event) ? `v${store.currentCase?.versions.find(version=>version.id===eventVersion(event))?.versionNumber ?? '—'}` : 'Case' }}</td><td><time :datetime="event.createdAt" :title="event.createdAt">{{ formatDate(event.createdAt) }}</time></td></tr></tbody></table></div>
      <p v-if="!events.length" class="audit-empty">{{ allEvents.length ? 'No activity matches these filters.' : 'No activity has been recorded yet.' }}</p>
      <nav class="audit-pagination" aria-label="Audit pages"><button class="button button--quiet" :disabled="page === 1" @click="page--">Previous</button><span>{{ events.length }} events · Page {{ page }} of {{ pages }}</span><button class="button button--quiet" :disabled="page >= pages" @click="page++">Next</button></nav>
    </section>
    <div class="activity-utilities">
    <details class="audit-disclosure proof-disclosure">
      <summary><Fingerprint :size="15" /><span>Technical proof</span><small>Engine, snapshot, and input hash</small><ChevronDown :size="14" class="summary-chevron" /></summary>
      <dl class="proof-grid">
        <div><dt>Engine</dt><dd>{{ store.result?.engineVersion ?? "Not run" }}</dd></div>
        <div><dt>Snapshot</dt><dd>{{ store.result?.assumptions.Provider ?? "API run snapshot" }}</dd></div>
        <div><dt>Versions</dt><dd>{{ store.currentCase?.versions.length }}</dd></div>
        <div><dt>Variant attempts</dt><dd>{{ store.variants.length }} of 3</dd></div>
        <div class="proof-hash"><dt>Input hash</dt><dd class="mono">{{ store.result?.reproducibilityId ?? "Pending" }}</dd></div>
      </dl>
    </details>

      <AgentActivity />
      <details class="audit-disclosure"><summary><span>Investigation progress</span><ChevronDown :size="14" class="summary-chevron" /></summary><InvestigationChecklist /></details>
    </div>
  </div>
</template>

<style scoped lang="scss">
.audit-filters{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin:20px 0;}.audit-filters>.form-select{width:190px;}.audit-table-wrap{max-height:650px;overflow:auto;}.audit-table{width:100%;min-width:680px;border-collapse:collapse;font-size:12px;}.audit-table th{position:sticky;top:0;background:#141414;z-index:1;text-align:left;font-size:10px;font-weight:500;color:#939399;}.audit-table th,.audit-table td{padding:16px 14px;border-bottom:1px solid #292929;vertical-align:top;}.audit-table td{color:#a2a2a9;}.audit-table td:nth-child(2){width:50%;color:#d3d3d9;}.audit-table time{white-space:nowrap;font-size:11px;}.audit-table summary{cursor:pointer;}.audit-actor{display:flex;gap:8px;align-items:center;white-space:nowrap;}.audit-event-detail{padding:12px 0 0;color:#92929a;line-height:1.7;}.audit-event-detail p{margin:0 0 10px;}.audit-event-detail button{padding:0;border:0;border-bottom:1px solid #6b6b70;background:transparent;color:#ddd;font-size:11px;cursor:pointer;}.audit-event-detail dl{font-size:10px;}.audit-event-detail dd{margin:0 0 8px;overflow-wrap:anywhere;}.audit-event-detail pre{max-width:450px;max-height:280px;overflow:auto;font-size:10px;}.audit-pagination{display:flex;justify-content:space-between;align-items:center;margin-top:14px;color:#87878f;font-size:11px;}.audit-empty{color:#999;font-size:13px;padding:22px 0;}

.audit-stack{display:grid;width:100%;gap:0;color:#e8e8e5}
.audit-lead{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:24px;padding-bottom:28px;border-bottom:1px solid rgba(255,255,255,.09)}
.audit-intro{max-width:700px}.audit-lead .eyebrow{display:inline-flex;width:max-content;margin:0 0 11px;padding:5px 8px;border:1px solid rgba(255,255,255,.1);border-radius:999px;color:#969696;background:rgba(255,255,255,.025);font-size:10px;font-weight:600}.audit-lead h2{margin:0;font-size:26px;letter-spacing:-.04em}.audit-lead p:not(.eyebrow){margin:7px 0 0;color:#858b88;font-size:12px;line-height:1.55}
.audit-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}.audit-actions .button{white-space:nowrap}
.audit-disclosure{border-bottom:1px solid rgba(255,255,255,.09)}.audit-disclosure>summary{display:flex;min-height:52px;align-items:center;gap:9px;color:#bcbcb8;font-size:12px;font-weight:600;list-style:none;cursor:pointer}.audit-disclosure>summary::-webkit-details-marker{display:none}.audit-disclosure>summary:focus-visible{outline:1px solid #777;outline-offset:4px}.audit-disclosure>summary small{margin-left:6px;color:#696965;font-size:10px;font-weight:450}.summary-chevron{margin-left:auto;color:#73736f;transition:transform .16s ease}.audit-disclosure[open] .summary-chevron{transform:rotate(180deg)}
.share-disclosure{grid-column:1/-1;border-bottom:0}.share-disclosure>summary{width:max-content;min-height:38px;margin-top:-2px;padding:0 11px;border:1px solid rgba(255,255,255,.11);border-radius:9px;background:rgba(255,255,255,.035)}.share-disclosure>summary .summary-chevron{margin-left:4px}.share-disclosure :deep(.owner-share){margin-top:16px}
.proof-disclosure{margin-bottom:32px}.proof-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin:0;padding:0 0 20px}.proof-grid>div{display:grid;gap:5px;padding:9px 18px 9px 0}.proof-grid dt{color:#696965;font-size:10px}.proof-grid dd{overflow-wrap:anywhere;margin:0;color:#b6b6b2;font-size:12px}.proof-grid .proof-hash{grid-column:1/-1;padding-top:15px;border-top:1px solid rgba(255,255,255,.055)}
.timeline-section{width:min(100%,980px)}.timeline-heading{display:flex;align-items:end;justify-content:space-between;gap:20px;padding-bottom:13px;border-bottom:1px solid rgba(255,255,255,.08)}.timeline-heading h3{margin:0;font-size:16px}.timeline-heading p{margin:0;color:#70706c;font-size:10px}.timeline{margin:0;padding:0;list-style:none}.timeline li{position:relative;display:grid;grid-template-columns:38px 1fr;gap:15px;padding:18px 0}.timeline li:not(:last-child)::after{position:absolute;top:54px;bottom:-1px;left:18px;width:1px;content:"";background:rgba(255,255,255,.08)}.timeline-icon{position:relative;z-index:1;display:grid;width:36px;height:36px;place-items:center;border:1px solid rgba(255,255,255,.055);border-radius:50%;color:#aeb3b0;background:#0e0e0e}.timeline-item--user .timeline-icon,.timeline-item--agent .timeline-icon{color:#e0e0dd}.timeline-meta{display:flex;align-items:center;gap:8px;margin-bottom:7px}.actor-pill{padding:4px 7px;border-radius:999px;color:#9a9a9a;background:rgba(255,255,255,.055);font-size:9px;font-weight:600}.timeline-meta time{color:#666c69;font:9px "IBM Plex Mono",monospace}.timeline h3{margin:0 0 4px;font-size:14px}.timeline p{margin:0;color:#858b88;font-size:11px;line-height:1.55}.event-proof{margin-top:7px}.event-proof summary{width:max-content;color:#5f5f5b;font-size:9px;list-style:none;cursor:pointer}.event-proof summary::-webkit-details-marker{display:none}.event-proof summary::after{margin-left:5px;content:"+"}.event-proof[open] summary::after{content:"−"}.event-proof summary:focus-visible{outline:1px solid #777;outline-offset:3px}.event-id{display:block;margin-top:6px;color:#555b58;font-size:9px}
@media(max-width:760px){.audit-lead{grid-template-columns:1fr}.audit-actions{justify-content:flex-start}.proof-grid{grid-template-columns:1fr 1fr}}
@media(max-width:520px){.proof-grid{grid-template-columns:1fr}.proof-grid .proof-hash{grid-column:auto}.audit-disclosure>summary small{display:none}.timeline li{grid-template-columns:34px 1fr;gap:11px}.timeline-icon{width:32px;height:32px}.timeline li:not(:last-child)::after{top:51px;left:16px}}
@media(prefers-reduced-motion:reduce){.summary-chevron{transition:none}}
.activity-utilities { margin-top: 32px; }.activity-utilities .proof-disclosure { margin-bottom: 18px; }.timeline-section { width: 100%; margin-top: 28px; }
.audit-stack { width: 100%; margin-inline: auto; }
</style>
