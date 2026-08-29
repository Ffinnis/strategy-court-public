<script setup lang="ts">
import { computed } from "vue";
import { Bot, Check, ChevronRight, CircleAlert, Cpu, Radio, Sparkles, UserRound, WandSparkles } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";

const store = useCourtStore();
const latestEvents = computed(() => (store.currentCase?.audit ?? []).slice(-3).reverse());
const toolStage = computed(() => store.replay ? "Probation tools available" : store.courtComplete ? "Investigation tools available" : store.confirmed ? "Court tool available" : "Draft tools available");
const issue = computed(() => store.result?.verdicts.find((item) => item.status === "Fail") ?? store.result?.verdicts.find((item) => item.status === "Warning" || item.status === "Inconclusive"));
const evidenceVerdict = computed(() => store.result?.verdicts.find((item) => item.category.toLowerCase().includes("evidence")));
const evaluationTrades = computed(() => {
  const value = store.result?.outOfSampleMetrics?.numberOfTrades;
  return typeof value === "number" ? value : null;
});
const webMcpLabel = computed(() => ({
  unsupported: "WebMCP unavailable",
  registering: "Registering tools",
  ready: "WebMCP ready",
  partial: "Some tools unavailable",
  failed: "Tool registration failed",
})[store.webMcpStatus]);
const webMcpDetail = computed(() => {
  const ready = store.registeredToolNames.length;
  const expected = store.webMcpExpectedToolNames.length;
  if (store.webMcpStatus === "unsupported") return "Manual controls are active in this browser.";
  if (store.webMcpStatus === "registering") return `${ready} of ${expected} tools ready`;
  if (store.webMcpStatus === "ready") return toolStage.value;
  if (store.webMcpStatus === "partial") return `${ready} of ${expected} tools ready`;
  return store.webMcpErrors[0]?.message ?? "Reload the page to retry registration.";
});
</script>

<template>
  <aside class="agent-rail" aria-label="Case tools and activity">
    <section
      class="rail-card webmcp-card"
      role="status"
      aria-live="polite"
      :data-webmcp-status="store.webMcpStatus"
      :data-webmcp-tools="store.registeredToolNames.join(',')"
    >
      <div class="rail-title"><span class="rail-icon"><WandSparkles :size="14" /></span><div><strong>Agent tools</strong><small>Browser capability</small></div><span class="connection-dot" :class="{ 'connection-dot--on': store.webMcpStatus === 'ready', 'connection-dot--warn': store.webMcpStatus === 'partial' || store.webMcpStatus === 'failed' }" /></div>
      <div class="support-state"><strong>{{ webMcpLabel }}</strong><span>{{ webMcpDetail }}</span></div>
      <div v-if="store.registeredToolNames.length" class="tool-count"><Cpu :size="12" /><span>{{ store.registeredToolNames.length }} tools registered</span></div>
      <details v-if="store.webMcpStatus !== 'ready'" class="webmcp-details">
        <summary>{{ store.webMcpStatus === 'unsupported' ? "Chrome setup" : "Registration details" }}</summary>
        <code v-if="store.webMcpStatus === 'unsupported'">chrome://flags/#enable-webmcp-testing</code>
        <ul v-else><li v-for="failure in store.webMcpErrors" :key="failure.toolName"><code>{{ failure.toolName }}</code><span>{{ failure.message }}</span></li></ul>
      </details>
    </section>

    <section v-if="!store.confirmed && store.activeVersion" class="rail-card decision-card"><span class="rail-kicker"><CircleAlert :size="12" /> Next step</span><h3>Confirm the rules</h3><p>Testing is disabled until you confirm the interpretation.</p><button class="rail-action" @click="store.activeTab = 'strategy'">Review rules <ChevronRight :size="13" /></button></section>
    <section v-else-if="store.courtComplete && store.variants.length === 0" class="rail-card decision-card"><span class="rail-kicker"><Sparkles :size="12" /> Main issue</span><h3>{{ issue?.category ?? "No material issue returned" }}</h3><p>{{ issue?.finding ?? "Every returned verdict passed its threshold." }}</p><button v-if="issue" class="rail-action" @click="store.activeTab = 'variants'">Test a variant <ChevronRight :size="13" /></button></section>
    <section v-else-if="store.replay" class="rail-card decision-card"><span class="rail-kicker"><Radio :size="12" /> Probation active</span><h3>{{ store.replay.currentDate }}</h3><p>Only revealed completed bars contribute to the record.</p><button class="rail-action" @click="store.activeTab = 'probation'">Open replay <ChevronRight :size="13" /></button></section>
    <section v-else-if="store.variants.length" class="rail-card decision-card"><span class="rail-kicker"><Radio :size="12" /> Replay eligibility</span><h3>{{ store.probationCandidate ? `Version ${store.probationCandidate.versionNumber} is eligible` : "No eligible version" }}</h3><p>{{ store.probationCandidate ? "This completed result can move to replay." : "No completed version currently meets the replay rule." }}</p><button class="rail-action" @click="store.activeTab = 'probation'">Review probation <ChevronRight :size="13" /></button></section>

    <section class="rail-card activity-card">
      <div class="rail-section-heading"><strong>Recent activity</strong><button @click="store.activeTab = 'audit'">View all</button></div>
      <div v-if="latestEvents.length" class="activity-list"><div v-for="event in latestEvents" :key="event.id"><span class="activity-actor" :class="`activity-actor--${event.actor}`"><Bot v-if="event.actor === 'agent'" :size="11" /><UserRound v-else-if="event.actor === 'user'" :size="11" /><Check v-else :size="11" /></span><p><strong>{{ event.action }}</strong><small>{{ event.actor }} · {{ new Date(event.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }}</small></p></div></div><p v-else class="rail-empty">No recorded actions yet.</p>
    </section>

    <section v-if="evidenceVerdict" class="rail-card warning-card"><span class="rail-kicker"><CircleAlert :size="12" /> Evidence limit</span><h3>{{ evaluationTrades == null ? evidenceVerdict.measure : `${evaluationTrades} evaluation trades` }}</h3><p>{{ evidenceVerdict.finding }} Threshold: {{ evidenceVerdict.threshold }}</p></section>
  </aside>
</template>

<style scoped lang="scss">
.agent-rail{display:grid;align-content:start;gap:0;padding-left:26px;border-left:1px solid #27272a}.rail-card{padding:20px 0;border-bottom:1px solid #27272a}.rail-card:first-child{padding-top:0}.rail-card:last-child{border-bottom:0}.rail-title{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px}.rail-icon{display:grid;width:30px;height:30px;place-items:center;border:1px solid #51483d;border-radius:2px;color:#d4d4d8}.rail-title div{display:grid;gap:2px}.rail-title strong{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:16px;font-weight:500}.rail-title small{color:#716b62;font-size:9px}.connection-dot{width:5px;height:5px;background:#625d56}.connection-dot--on{background:#d4d4d8}.support-state{display:grid;gap:5px;padding:14px 0 1px}.support-state strong{font-size:11px}.support-state span{color:#8e877e;font-size:11px;line-height:1.55}.tool-count{display:flex;align-items:center;gap:7px;margin-top:10px;color:#9d968b;font-size:9px}.rail-kicker{display:flex;width:max-content;align-items:center;gap:6px;padding:4px 7px;border:1px solid rgba(255,255,255,.08);border-radius:2px;color:#d4d4d8;background:rgba(255,255,255,.025);font:600 10px Inter,ui-sans-serif,system-ui,sans-serif;letter-spacing:0;text-transform:none}.warning-card .rail-kicker{color:#a1a1aa}.decision-card h3,.warning-card h3{margin:12px 0 6px;font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:19px;font-weight:500;line-height:1.12}.decision-card p,.warning-card p{margin:0;color:#8e877e;font-size:11px;line-height:1.6}.rail-action{display:flex;align-items:center;gap:5px;margin-top:12px;padding:0;border:0;color:#d8d1c7;background:transparent;font-size:11px;font-weight:600;cursor:pointer}.rail-action:hover{color:#f4f4f5}.rail-section-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.rail-section-heading strong{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:16px;font-weight:500}.rail-section-heading button{padding:0;border:0;color:#817a71;background:transparent;font-size:9px;cursor:pointer}.activity-list>div{display:grid;grid-template-columns:25px 1fr;gap:9px;padding:10px 0}.activity-actor{display:grid;width:24px;height:24px;place-items:center;border:1px solid #3d3831;border-radius:2px;color:#aaa298}.activity-actor--agent{color:#d4d4d8;border-color:#744238}.activity-actor--user{color:#a1a1aa;border-color:#3d5267}.activity-list p{display:grid;gap:3px;min-width:0;margin:0}.activity-list strong{overflow:hidden;color:#bbb4aa;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.activity-list small{color:#68625a;font-size:8px}.rail-empty{color:#777168;font-size:10px}
.rail-icon,.activity-actor{border-color:#3f3f46;border-radius:7px;color:#d4d4d8;background:#171717}.activity-actor--agent,.activity-actor--user{color:#d4d4d8;border-color:#3f3f46}.rail-title small,.activity-list small{color:#71717a}.rail-kicker{color:#a1a1aa;font:600 10px Inter,ui-sans-serif,system-ui,sans-serif;letter-spacing:0;text-transform:none}.rail-action:hover{color:#fff}.connection-dot{border-radius:50%;background:#52525b}.connection-dot--on{background:#e4e4e7}
.agent-rail{gap:0;padding-left:32px;border-left-color:rgba(255,255,255,.07)}.rail-card{padding:24px 0;border-bottom-color:rgba(255,255,255,.065)}.rail-icon,.activity-actor{border:0;border-radius:10px;background:#191919;box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 8px 24px rgba(0,0,0,.2)}.rail-title strong,.rail-section-heading strong{font-weight:600}.decision-card h3,.warning-card h3{font-size:21px;letter-spacing:-.025em}.rail-action{transition:color 150ms ease,transform 150ms ease}.rail-action:hover{transform:translateX(3px)}.activity-list>div{padding:12px 0;transition:transform 160ms ease}.activity-list>div:hover{transform:translateX(3px)}.connection-dot--on{box-shadow:0 0 0 5px rgba(255,255,255,.04),0 0 16px rgba(255,255,255,.18)}
.connection-dot--warn{background:#999}.webmcp-details{margin-top:12px;color:#777;font-size:9px}.webmcp-details summary{width:max-content;cursor:pointer}.webmcp-details code{display:block;margin-top:8px;color:#aaa;font:9px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.webmcp-details ul{display:grid;gap:8px;margin:8px 0 0;padding:0;list-style:none}.webmcp-details li{display:grid;gap:3px}.webmcp-details li code{margin:0;color:#bbb}.webmcp-details li span{line-height:1.45}
</style>
