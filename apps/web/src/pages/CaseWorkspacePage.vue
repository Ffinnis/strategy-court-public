<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { FileSearch, GitCompareArrows, History, ListChecks, RotateCcw, Scale, ScrollText, X } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import type { WorkspaceTab } from "@/types";
import { workspaceTabs as tabs } from "@/services/workspaceNavigation";
import WorkspaceCommands from "@/components/WorkspaceCommands.vue";
import { useMovingIndicator } from "@/composables/useMovingIndicator";
import { useNotifications } from "@/stores/notifications";
import VerdictHeader from "@/components/VerdictHeader.vue";
import StrategyTab from "@/components/tabs/StrategyTab.vue";
import CourtTab from "@/components/tabs/CourtTab.vue";
import EvidenceTab from "@/components/tabs/EvidenceTab.vue";
import VariantsTab from "@/components/tabs/VariantsTab.vue";
import ProbationTab from "@/components/tabs/ProbationTab.vue";
import AuditTab from "@/components/tabs/AuditTab.vue";

const route = useRoute();
const store = useCourtStore();
const activeComponent = computed(() => ({
  strategy: StrategyTab,
  court: CourtTab,
  evidence: EvidenceTab,
  variants: VariantsTab,
  probation: ProbationTab,
  audit: AuditTab,
})[store.activeTab]);
const caseId = computed(() => String(route.params.caseId));
const tablist = ref<HTMLElement | null>(null);
const indicator = useMovingIndicator(tablist, () => store.activeTab);
const tabIcons = {
  court: Scale,
  evidence: FileSearch,
  variants: GitCompareArrows,
  strategy: ListChecks,
  probation: RotateCcw,
  audit: History,
};
const notifications = useNotifications();
watch(() => store.notice, (message) => { if (message) { notifications.push(message); store.notice = null; } }, { immediate: true });

async function settleTabScroll() {
  store.clearError();

  const header = document.querySelector<HTMLElement>(".verdict-header");
  const headerBottom = header ? window.scrollY + header.getBoundingClientRect().bottom : 0;
  if (window.scrollY <= headerBottom + 24) return;

  await nextTick();
  const panel = document.getElementById(`panel-${store.activeTab}`);
  if (!panel || !tablist.value) return;

  const navigation = tablist.value.closest<HTMLElement>(".workspace-navigation") ?? tablist.value;
  const stickyTop = Number.parseFloat(getComputedStyle(navigation).top) || 0;
  const panelTop = window.scrollY + panel.getBoundingClientRect().top;
  const target = panelTop - stickyTop - navigation.getBoundingClientRect().height - 24;
  window.scrollTo({ top: Math.max(0, target), behavior: "auto" });
}

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

async function openCase() {
  await store.loadCase(caseId.value);
  const tab = typeof route.query.tab === "string" ? route.query.tab : "";
  if (typeof route.query.version === "string") store.selectVersion(route.query.version);
  store.activeTab = tabs.some(item => item.id === tab) ? tab as WorkspaceTab : store.confirmed ? "court" : "strategy";
  if (typeof route.query.evidence === "string" && (route.query.kind === "trade" || route.query.kind === "failure")) {
    if (!store.latestRun || route.query.run !== store.latestRun.id) { store.error = "This private link refers to a different run. Select its version or inspect the current result."; return; }
    try { await store.selectEvidence(store.latestRun.id,{kind:route.query.kind,id:route.query.evidence}); } catch { /* Inspector displays retry. */ }
  }
}
onMounted(openCase);
watch(caseId, openCase);
watch(() => store.activeTab, settleTabScroll);
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
      <VerdictHeader />
      <div class="workspace-navigation">
        <div class="workspace-navigation__controls">
          <nav
            ref="tablist"
            class="workspace-tabs"
            aria-label="Court workspace sections"
            role="tablist"
            @keydown="moveTab"
          >
            <span class="workspace-tab-indicator" :style="indicator" aria-hidden="true" />
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
            >
              <component :is="tabIcons[tab.id]" :size="14" aria-hidden="true" />
              <span>{{ tab.label }}</span>
            </button>
          </nav>
          <WorkspaceCommands />
        </div>
      </div>

      <div v-if="store.error" class="workspace-messages">
        <div v-if="store.error" class="workspace-message workspace-message--error" role="alert">
          <ScrollText :size="15" /><span>{{ store.error }}</span><button aria-label="Dismiss error" @click="store.clearError"><X :size="14" /></button>
        </div>
      </div>

      <div class="workspace-layout">
        <section :id="`panel-${store.activeTab}`" class="workspace-content" role="tabpanel" :aria-labelledby="`tab-${store.activeTab}`">
          <button v-if="store.running && store.activeTab !== 'court'" class="active-run-link" @click="store.activeTab = 'court'">Court is running · {{ store.latestRun?.stage?.replaceAll('_', ' ') }} · Open progress</button>
          <Transition name="workspace-panel" mode="out-in">
            <KeepAlive :key="caseId" :max="6"><component :is="activeComponent" :key="`${caseId}:${store.activeVersion?.id}:${store.activeTab}`" /></KeepAlive>
          </Transition>
        </section>
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
.workspace-page { --case-frame: 1120px; min-height: calc(100vh - 104px); background: var(--surface-page); }
.workspace-navigation {
  position: sticky;
  z-index: 40;
  top: var(--app-header-height);
  width: min(var(--case-frame), calc(100% - var(--workspace-gutter) * 2));
  margin: 0 auto;
  padding: 10px 0;
  background: var(--surface-page);
}
.workspace-navigation__controls {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 9px;
}
.active-run-link { width:100%;margin-bottom:24px;padding:12px 0;border:0;border-bottom:1px solid #333;background:transparent;color:#bbb;text-align:left;font-size:12px;cursor:pointer; }
.workspace-tabs {
  position: relative;
  z-index: 40;
  display: flex;
  min-width: 0;
  min-height: 45px;
  flex: 0 1 auto;
  gap: 7px;
  overflow-x: auto;
  padding: 1px 0 9px;
  scrollbar-width: none;
}
.workspace-tabs::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 0;
  height: 1px;
  content: "";
  background: #292929;
}
.workspace-tabs::-webkit-scrollbar { display: none; }
.workspace-tab-indicator {
  position: absolute;
  z-index: 2;
  bottom: 0;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: #f1f1f1;
  pointer-events: none;
  transition: transform 180ms var(--ease-out), width 180ms var(--ease-out), opacity 120ms ease;
}
.workspace-tab {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 36px;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid #2c2c2c;
  border-radius: 8px;
  color: var(--text-faint);
  background: linear-gradient(180deg, #1b1b1b, #151515);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.035), inset 0 -1px 0 rgba(0,0,0,.5), 0 1px 2px rgba(0,0,0,.35);
  font-size: 11.5px;
  font-weight: 540;
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--motion-fast), border-color var(--motion-fast), background var(--motion-fast), box-shadow var(--motion-fast), transform var(--motion-fast);
}
.workspace-tab svg { color: #6f6f74; transition: color var(--motion-fast); }
.workspace-tab:hover {
  border-color: #383838;
  color: var(--text-secondary);
  background: linear-gradient(180deg, #202020, #181818);
  transform: translateY(-1px);
}
.workspace-tab--active {
  border-color: #3a3a3a;
  color: var(--text-primary);
  background: linear-gradient(180deg, #262626, #1c1c1c);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.07), inset 0 -1px 0 rgba(0,0,0,.55), 0 3px 8px rgba(0,0,0,.34);
  transform: translateY(-1px);
}
.workspace-tab--active svg { color: #e5e5e5; }
.workspace-tab:focus-visible { outline: 2px solid #d4d4d8; outline-offset: 2px; }
.workspace-navigation__controls :deep(.command-trigger) {
  min-width: 38px;
  min-height: 36px;
  justify-content: center;
  padding: 0;
  border: 1px solid #2c2c2c;
  border-radius: 8px;
  background: linear-gradient(180deg, #1b1b1b, #151515);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.035), 0 1px 2px rgba(0,0,0,.35);
}
.workspace-navigation__controls :deep(.command-trigger span),
.workspace-navigation__controls :deep(.command-trigger kbd) { display: none; }
.workspace-navigation__controls :deep(.command-trigger:hover) { border-color:#383838;background:linear-gradient(180deg,#202020,#181818); }
.workspace-messages {
  position: relative;
  z-index: 30;
  margin:16px auto;
  display: grid;
  width:min(var(--case-frame),calc(100% - var(--workspace-gutter)*2));
  gap: 8px;
  pointer-events: none;
}
.workspace-message {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 13px;
  border: 1px solid rgba(255,255,255,.11);
  border-radius: 10px;
  color: #d8d8d8;
  background: rgba(20,20,20,.94);
  font-size: 12px;
  line-height: 1.45;
  box-shadow: 0 18px 55px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.035);
  backdrop-filter: blur(16px);
  pointer-events: auto;
}
.workspace-message--error { border-color:#626262; box-shadow:none; }
.workspace-message button { display: grid; flex: 0 0 auto; margin-left: auto; padding: 4px; border: 0; color: #9a9a9a; background: transparent; cursor: pointer; }
.workspace-message button:hover { color: #fff; }
.workspace-layout {
  display: grid;
  width: min(var(--case-frame), calc(100% - var(--workspace-gutter) * 2));
  grid-template-columns: minmax(0,1fr);
  align-items: start;
  margin: 0 auto;
  padding: 34px 0 110px;
}
.workspace-content { width: 100%; min-width: 0; min-height: 560px; }
.workspace-loading { width: min(var(--case-frame), calc(100% - var(--workspace-gutter) * 2)); margin: 0 auto; padding: 20px 0; }
.skeleton--header { height: 104px; margin-bottom: 16px; }
.skeleton--tabs { height: 46px; margin-bottom: 36px; }
.loading-grid { display: grid; grid-template-columns: 1fr; }
.skeleton--main { height: 520px; }
.skeleton--rail { display: none; }
.workspace-missing { display: flex; min-height: 620px; align-items: center; flex-direction: column; justify-content: center; padding: 30px; text-align: center; }
.workspace-missing h1 { margin: 0 0 8px; font-size: 28px; font-weight: 600; letter-spacing: -.035em; }
.workspace-missing p { margin: 0 0 22px; color: #949494; font-size: 13px; }

@media (max-width: 1000px) {
  .loading-grid { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .workspace-navigation { width:calc(100% - 32px);padding:8px 0; }
  .workspace-navigation__controls { display:flex;width:100%; }
  .workspace-tabs { flex:1; }
  .workspace-tab { padding:0 12px; }
  .workspace-navigation__controls :deep(.command-trigger) { flex:0 0 38px; }
  .workspace-layout { width: 100%; padding: 26px 16px 78px; }
  .workspace-messages { top: calc(var(--app-header-height) + 16px); right: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .workspace-tab-indicator, .workspace-tab { transition: none; }
}
</style>
