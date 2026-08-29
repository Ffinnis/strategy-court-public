<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Bot, ScrollText, X } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import type { WorkspaceTab } from "@/types";
import VerdictHeader from "@/components/VerdictHeader.vue";
import AgentRail from "@/components/AgentRail.vue";
import StrategyTab from "@/components/tabs/StrategyTab.vue";
import CourtTab from "@/components/tabs/CourtTab.vue";
import EvidenceTab from "@/components/tabs/EvidenceTab.vue";
import VariantsTab from "@/components/tabs/VariantsTab.vue";
import ProbationTab from "@/components/tabs/ProbationTab.vue";
import AuditTab from "@/components/tabs/AuditTab.vue";

const route = useRoute();
const store = useCourtStore();
const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "strategy", label: "Strategy" },
  { id: "court", label: "Court" },
  { id: "evidence", label: "Evidence" },
  { id: "variants", label: "Variants" },
  { id: "probation", label: "Probation" },
  { id: "audit", label: "Audit" },
];
const activeComponent = computed(() => ({
  strategy: StrategyTab,
  court: CourtTab,
  evidence: EvidenceTab,
  variants: VariantsTab,
  probation: ProbationTab,
  audit: AuditTab,
})[store.activeTab]);
const caseId = computed(() => String(route.params.caseId));
const focusedResult = computed(() => store.courtComplete && (store.activeTab === "court" || store.activeTab === "evidence"));
const tablist = ref<HTMLElement | null>(null);

function moveTab(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const current = tabs.findIndex((tab) => tab.id === store.activeTab);
  const next = event.key === "Home"
    ? 0
    : event.key === "End"
      ? tabs.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  store.activeTab = tabs[next]!.id;
  nextTick(() => tablist.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus());
}

onMounted(() => store.loadCase(caseId.value));
watch(caseId, (id) => store.loadCase(id));
</script>

<template>
  <div class="workspace-page">
    <template v-if="store.loading">
      <div class="workspace-loading">
        <div class="skeleton skeleton--header" />
        <div class="skeleton skeleton--tabs" />
        <div class="loading-grid"><div class="skeleton skeleton--main" /><div class="skeleton skeleton--rail" /></div>
      </div>
    </template>

    <template v-else-if="store.currentCase">
      <VerdictHeader :compact="focusedResult" />
      <nav
        ref="tablist"
        class="workspace-tabs"
        :class="{ 'workspace-tabs--focused': focusedResult }"
        aria-label="Court workspace sections"
        role="tablist"
        @keydown="moveTab"
      >
        <button
          v-for="tab in tabs"
          :id="`tab-${tab.id}`"
          :key="tab.id"
          class="workspace-tab"
          :class="{ 'workspace-tab--active': store.activeTab === tab.id }"
          type="button"
          role="tab"
          :tabindex="store.activeTab === tab.id ? 0 : -1"
          :aria-selected="store.activeTab === tab.id"
          :aria-controls="`panel-${tab.id}`"
          @click="store.activeTab = tab.id"
        >{{ tab.label }}</button>
      </nav>

      <div v-if="store.notice" class="workspace-notice">
        <Bot :size="14" /><span>{{ store.notice }}</span><button aria-label="Dismiss notice" @click="store.notice = null"><X :size="14" /></button>
      </div>
      <div v-if="store.error" class="workspace-error" role="alert">
        <ScrollText :size="14" /><span>{{ store.error }}</span><button aria-label="Dismiss error" @click="store.clearError"><X :size="14" /></button>
      </div>

      <div class="workspace-layout" :class="{ 'workspace-layout--focused': focusedResult }">
        <section :id="`panel-${store.activeTab}`" class="workspace-content" role="tabpanel" :aria-labelledby="`tab-${store.activeTab}`">
          <Transition name="tab-fade" mode="out-in"><component :is="activeComponent" :key="store.activeTab" /></Transition>
        </section>
        <AgentRail v-if="!focusedResult" />
      </div>
    </template>

    <div v-else class="workspace-missing">
      <span class="empty-state__icon"><ScrollText :size="20" /></span>
      <h1>Case could not be opened</h1>
      <p>{{ store.error ?? "The case does not exist or the API is unavailable." }}</p>
      <RouterLink class="button" to="/new">Open a new case</RouterLink>
    </div>
  </div>
</template>

<style scoped lang="scss">
.workspace-page { min-height: calc(100vh - 104px); background: transparent; }
.workspace-tabs {
  position: sticky;
  z-index: 40;
  top: 64px;
  display: flex;
  width: min(1264px, calc(100% - 56px));
  gap: 22px;
  margin: 0 auto;
  overflow-x: auto;
  padding: 7px 0 9px;
  border-bottom: 1px solid rgba(255,255,255,.065);
  background: rgba(8,8,8,.84);
  backdrop-filter: blur(18px);
  scrollbar-width: none;
}
.workspace-tabs--focused { width: min(1480px, calc(100% - 64px)); }
.workspace-tabs::-webkit-scrollbar { display: none; }
.workspace-tab {
  position: relative;
  display: flex;
  min-height: 34px;
  align-items: center;
  padding: 0 2px;
  border: 0;
  color: #666;
  background: transparent;
  font-size: 11px;
  font-weight: 540;
  letter-spacing: .01em;
  white-space: nowrap;
  cursor: pointer;
  transition: color 150ms ease;
}
.workspace-tab:hover { color: #cfcfcf; }
.workspace-tab::after {
  position: absolute;
  right: 0;
  bottom: -10px;
  left: 0;
  height: 1px;
  content: "";
  background: #fff;
  opacity: 0;
  transform: scaleX(.6);
  transition: opacity 150ms ease, transform 150ms ease;
}
.workspace-tab--active { color: #fff; }
.workspace-tab--active::after { opacity: 1; transform: scaleX(1); box-shadow: 0 0 18px rgba(255,255,255,.24); }
.workspace-notice, .workspace-error {
  display: flex;
  width: min(1264px, calc(100% - 56px));
  align-items: center;
  gap: 9px;
  margin: 18px auto -10px;
  padding: 11px 13px;
  border: 1px solid #2b2b2b;
  color: #d0d0d0;
  background: #141414;
  font-size: 11px;
  box-shadow: 0 18px 50px rgba(0,0,0,.28);
}
.workspace-notice button, .workspace-error button { display: grid; margin-left: auto; padding: 3px; border: 0; color: inherit; background: transparent; cursor: pointer; }
.workspace-layout {
  display: grid;
  width: min(1264px, calc(100% - 56px));
  grid-template-columns: minmax(0,1fr) 276px;
  align-items: start;
  gap: 58px;
  margin: 0 auto;
  padding: 46px 0 110px;
}
.workspace-layout--focused {
  width: min(1480px, calc(100% - 64px));
  grid-template-columns: minmax(0,1fr);
  padding-top: 52px;
}
.workspace-content { min-width: 0; animation: workspace-in 260ms cubic-bezier(.2,.8,.2,1); }
@keyframes workspace-in { from { opacity: 0; transform: translateY(7px); } }
.tab-fade-enter-active, .tab-fade-leave-active { transition: opacity 130ms ease, transform 130ms ease; }
.tab-fade-enter-from { opacity: 0; transform: translateY(3px); }
.tab-fade-leave-to { opacity: 0; }
.workspace-loading { width: min(1320px, calc(100% - 56px)); margin: 0 auto; padding: 26px 0; }
.skeleton--header { height: 104px; margin-bottom: 16px; }
.skeleton--tabs { height: 46px; margin-bottom: 36px; }
.loading-grid { display: grid; grid-template-columns: 1fr 276px; gap: 44px; }
.skeleton--main { height: 520px; }
.skeleton--rail { height: 390px; }
.workspace-missing { display: flex; min-height: 620px; align-items: center; flex-direction: column; justify-content: center; padding: 30px; text-align: center; }
.workspace-missing h1 { margin: 0 0 8px; font-size: 28px; font-weight: 600; letter-spacing: -.035em; }
.workspace-missing p { margin: 0 0 22px; color: #949494; font-size: 13px; }

@media (max-width: 1000px) {
  .workspace-layout { grid-template-columns: 1fr; gap: 48px; }
  .workspace-layout :deep(.agent-rail) { grid-template-columns: repeat(2,minmax(0,1fr)); padding-top: 18px; padding-left: 0; border-top: 1px solid #272727; border-left: 0; }
  .loading-grid { grid-template-columns: 1fr; }
  .skeleton--rail { display: none; }
}
@media (max-width: 720px) {
  .workspace-tabs, .workspace-tabs--focused { top: 60px; width: 100%; gap: 20px; padding: 7px 16px 9px; }
  .workspace-layout, .workspace-layout--focused { width: 100%; padding: 32px 16px 78px; }
  .workspace-notice, .workspace-error { width: calc(100% - 32px); }
}
@media (max-width: 560px) {
  .workspace-layout :deep(.agent-rail) { grid-template-columns: 1fr; }
}
</style>
