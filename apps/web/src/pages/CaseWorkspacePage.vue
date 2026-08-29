<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Bot, ScrollText, X } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import type { WorkspaceTab } from "@/types";
import VerdictHeader from "@/components/VerdictHeader.vue";
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
const tablist = ref<HTMLElement | null>(null);

async function settleTabScroll() {
  store.clearError();

  const header = document.querySelector<HTMLElement>(".verdict-header");
  const headerBottom = header ? window.scrollY + header.getBoundingClientRect().bottom : 0;
  if (window.scrollY <= headerBottom + 24) return;

  await nextTick();
  const panel = document.getElementById(`panel-${store.activeTab}`);
  if (!panel || !tablist.value) return;

  const stickyTop = Number.parseFloat(getComputedStyle(tablist.value).top) || 0;
  const panelTop = window.scrollY + panel.getBoundingClientRect().top;
  const target = panelTop - stickyTop - tablist.value.getBoundingClientRect().height - 24;
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

onMounted(() => store.loadCase(caseId.value));
watch(caseId, (id) => store.loadCase(id));
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
      <nav
        ref="tablist"
        class="workspace-tabs"
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

      <div v-if="store.notice || store.error" class="workspace-messages" aria-live="polite">
        <div v-if="store.notice" class="workspace-message">
          <Bot :size="15" /><span>{{ store.notice }}</span><button aria-label="Dismiss notice" @click="store.notice = null"><X :size="14" /></button>
        </div>
        <div v-if="store.error" class="workspace-message workspace-message--error" role="alert">
          <ScrollText :size="15" /><span>{{ store.error }}</span><button aria-label="Dismiss error" @click="store.clearError"><X :size="14" /></button>
        </div>
      </div>

      <div class="workspace-layout">
        <section :id="`panel-${store.activeTab}`" class="workspace-content" role="tabpanel" :aria-labelledby="`tab-${store.activeTab}`">
          <component :is="activeComponent" :key="store.activeTab" />
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
.workspace-page { min-height: calc(100vh - 104px); background: var(--surface-page); }
.workspace-tabs {
  position: sticky;
  z-index: 40;
  top: 64px;
  display: flex;
  width: min(var(--workspace-shell), calc(100% - var(--workspace-gutter) - var(--workspace-gutter)));
  min-height: 44px;
  gap: 26px;
  margin: 0 auto;
  overflow-x: auto;
  padding: 4px 0 7px;
  border-bottom: 1px solid var(--line-subtle);
  background: rgba(8,8,8,.9);
  backdrop-filter: blur(18px);
  scrollbar-width: none;
}
.workspace-tabs::-webkit-scrollbar { display: none; }
.workspace-tab {
  position: relative;
  display: flex;
  min-height: 34px;
  align-items: center;
  padding: 0 2px;
  border: 0;
  color: var(--text-faint);
  background: transparent;
  font-size: 11px;
  font-weight: 540;
  letter-spacing: .01em;
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--motion-fast);
}
.workspace-tab:hover { color: var(--text-secondary); }
.workspace-tab::after {
  position: absolute;
  right: 0;
  bottom: -8px;
  left: 0;
  height: 1px;
  content: "";
  background: var(--text-primary);
  opacity: 0;
  transform: scaleX(.6);
  transition: opacity 150ms ease, transform 150ms ease;
}
.workspace-tab--active { color: var(--text-primary); }
.workspace-tab--active::after { opacity: 1; transform: scaleX(1); }
.workspace-messages {
  position: fixed;
  z-index: 90;
  top: 82px;
  right: 24px;
  display: grid;
  width: min(420px, calc(100% - 32px));
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
.workspace-message--error { border-color: rgba(166,103,103,.5); }
.workspace-message button { display: grid; flex: 0 0 auto; margin-left: auto; padding: 4px; border: 0; color: #9a9a9a; background: transparent; cursor: pointer; }
.workspace-message button:hover { color: #fff; }
.workspace-layout {
  display: grid;
  width: min(var(--workspace-shell), calc(100% - var(--workspace-gutter) - var(--workspace-gutter)));
  grid-template-columns: minmax(0,1fr);
  align-items: start;
  margin: 0 auto;
  padding: 34px 0 110px;
}
.workspace-content { min-width: 0; min-height: 560px; }
.workspace-loading { width: min(var(--workspace-shell), calc(100% - var(--workspace-gutter) - var(--workspace-gutter))); margin: 0 auto; padding: 20px 0; }
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
  .workspace-tabs { top: 60px; width: 100%; gap: 20px; padding: 7px 16px 9px; }
  .workspace-layout { width: 100%; padding: 26px 16px 78px; }
  .workspace-messages { top: 76px; right: 16px; }
}
</style>
