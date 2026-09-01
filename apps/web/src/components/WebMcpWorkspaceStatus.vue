<script setup lang="ts">
import { computed } from "vue";
import { Bot, ChevronRight } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";

const store = useCourtStore();
const emit = defineEmits<{ open: [] }>();
const latestAction = computed(() => (store.currentCase?.audit ?? []).filter(event => event.actor === "agent").at(-1));
const label = computed(() => ({
  unsupported: "WebMCP tools unavailable",
  registering: "Connecting WebMCP tools",
  ready: "WebMCP tools ready",
  partial: "Some WebMCP tools ready",
  failed: "WebMCP tools need attention",
})[store.webMcpStatus]);
const detail = computed(() => {
  const ready = store.registeredToolNames.length;
  const expected = store.webMcpExpectedToolNames.length;
  if (store.webMcpStatus === "ready") return `${ready} available`;
  if (store.webMcpStatus === "registering" || store.webMcpStatus === "partial") return `${ready} of ${expected} available`;
  return "Manual controls active";
});
const mobileLabel = computed(() => ({
  unsupported: "WebMCP unavailable",
  registering: "WebMCP connecting",
  ready: `WebMCP · ${store.registeredToolNames.length} tools`,
  partial: `WebMCP · ${store.registeredToolNames.length}/${store.webMcpExpectedToolNames.length} tools`,
  failed: "WebMCP attention",
})[store.webMcpStatus]);
</script>

<template>
  <button
    class="workspace-agent-status"
    type="button"
    :data-webmcp-status="store.webMcpStatus"
    :aria-label="`${label}. ${detail}. Open agent activity.`"
    @click="emit('open')"
  >
    <span class="workspace-agent-status__mark" :class="`workspace-agent-status__mark--${store.webMcpStatus}`"><Bot :size="13" /></span>
    <span class="workspace-agent-status__copy">
      <strong>{{ label }} <i>·</i> {{ detail }}</strong>
      <small>{{ latestAction ? `Latest recorded change: ${latestAction.action}` : "No agent change recorded yet" }}</small>
    </span>
    <span class="workspace-agent-status__mobile">{{ mobileLabel }}</span>
    <ChevronRight :size="13" aria-hidden="true" />
  </button>
</template>

<style scoped>
.workspace-agent-status{display:grid;min-width:246px;max-width:310px;min-height:45px;grid-template-columns:26px minmax(0,1fr) 13px;align-items:center;gap:8px;margin-left:auto;padding:4px 0 8px 12px;border:0;border-left:1px solid #292929;color:#aaa;background:transparent;text-align:left;cursor:pointer}
.workspace-agent-status:hover strong{color:#fff}.workspace-agent-status:hover>svg{transform:translateX(2px)}.workspace-agent-status:focus-visible{outline:2px solid #d4d4d8;outline-offset:3px;border-radius:7px}
.workspace-agent-status__mark{position:relative;display:grid;width:25px;height:25px;place-items:center;border:1px solid #343439;border-radius:7px;color:#85858c;background:#171717}.workspace-agent-status__mark--ready{color:#e3e3e6}.workspace-agent-status__mark--ready::after{position:absolute;top:-2px;right:-2px;width:5px;height:5px;border:2px solid var(--surface-page);border-radius:50%;content:"";background:#d8d8dc}.workspace-agent-status__copy{display:grid;min-width:0;gap:4px}.workspace-agent-status strong,.workspace-agent-status small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.workspace-agent-status strong{color:#c3c3c8;font-size:10.5px;font-weight:560}.workspace-agent-status strong i{color:#5f5f66;font-style:normal}.workspace-agent-status small{color:#7d7d86;font-size:9px}.workspace-agent-status__mobile{display:none;color:#c3c3c8;font-size:9.5px;font-weight:560;white-space:nowrap}.workspace-agent-status__mobile i{color:#5f5f66;font-style:normal}.workspace-agent-status>svg{color:#65656c;transition:transform 150ms ease}
@media(max-width:980px){.workspace-agent-status{min-width:168px;max-width:190px}.workspace-agent-status small{display:none}}
@media(max-width:720px){.workspace-agent-status{min-width:128px;max-width:128px;grid-template-columns:16px minmax(0,1fr);gap:5px;padding:4px 6px 8px}.workspace-agent-status__mark{display:grid;width:16px;height:16px;border-radius:5px}.workspace-agent-status__mark>svg{width:10px;height:10px}.workspace-agent-status__copy,.workspace-agent-status>svg{display:none}.workspace-agent-status__mobile{display:block;overflow:hidden;text-overflow:ellipsis;text-align:left}.workspace-agent-status__mark--unsupported{color:#777}.workspace-agent-status__mark--registering,.workspace-agent-status__mark--partial{color:#bdbdc4}.workspace-agent-status__mark--failed{color:#c9a09c}}
</style>
