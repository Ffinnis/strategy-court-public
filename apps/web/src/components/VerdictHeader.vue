<script setup lang="ts">
import { computed } from "vue";
import { Bot, CalendarRange, ChevronDown, Eye, SlidersHorizontal, WandSparkles } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import FormSelect from "@/components/forms/FormSelect.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const store = useCourtStore();
const verdicts = computed(() => store.result?.verdicts ?? []);
const count = (status: string) => verdicts.value.filter((verdict) => verdict.status === status).length;
const summary = computed(() => store.result?.summaryLabel ?? (store.confirmed ? "Awaiting Court" : "Draft"));
const symbols = computed(() => store.currentCase?.symbols ?? []);
const versionOptions = computed(() => (store.currentCase?.versions ?? []).map((version, index) => ({
  value: version.id,
  label: `Version ${version.versionNumber ?? index + 1}${version.evaluationInformed ? " · evaluation-informed" : ""}`,
})));
const activeVersionId = computed({
  get: () => store.activeVersion?.id ?? "",
  set: (id: string) => store.selectVersion(id),
});
const agentToolsLabel = computed(() => {
  if (store.webMcpStatus === "ready") return `${store.registeredToolNames.length} agent tools`;
  if (store.webMcpStatus === "registering") return "Connecting agent tools";
  if (store.webMcpStatus === "partial") return `${store.registeredToolNames.length} agent tools ready`;
  return "Manual controls";
});

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value?: string) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value || "Not set";
  const [, year, month, day] = match;
  return dateFormatter.format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
}
</script>

<template>
  <section class="verdict-header" aria-label="Current Court summary">
    <div class="verdict-header__identity">
      <div class="verdict-header__instrument" :aria-label="`Universe: ${symbols.join(', ') || 'not set'}`">
        <strong v-for="symbol in symbols" :key="symbol">{{ symbol }}</strong>
        <span>Daily</span>
      </div>
      <h1 class="verdict-header__case">{{ store.currentCase?.name }}</h1>
    </div>

    <div class="verdict-header__window">
      <CalendarRange :size="15" aria-hidden="true" />
      <span>{{ formatDate(store.currentCase?.startDate) }}</span>
      <span class="verdict-header__range-separator" aria-hidden="true">—</span>
      <span>{{ formatDate(store.currentCase?.endDate) }}</span>
    </div>

    <div class="verdict-header__controls">
      <div class="version-select-wrap">
        <label class="sr-only" for="version-select">Current strategy version</label>
        <FormSelect
          id="version-select"
          v-model="activeVersionId"
          class="version-select"
          :options="versionOptions"
          :disabled="versionOptions.length === 0"
          placeholder="No versions"
          aria-label="Current strategy version"
        />
      </div>

      <div class="verdict-header__result">
        <StatusBadge :status="summary" />
      </div>

      <details class="case-inspector">
        <summary>
          <SlidersHorizontal :size="14" aria-hidden="true" />
          <span>Details</span>
          <ChevronDown class="case-inspector__chevron" :size="14" aria-hidden="true" />
        </summary>
        <div class="case-inspector__popover">
          <div class="case-inspector__heading">
            <div>
              <span>Case record</span>
              <strong>{{ store.currentCase?.id.slice(0, 8) }}</strong>
            </div>
            <StatusBadge :status="summary" />
          </div>

          <div v-if="store.courtComplete" class="verdict-counts" aria-label="Verdict counts">
            <div><span>Pass</span><strong>{{ count("Pass") }}</strong></div>
            <div><span>Warning</span><strong>{{ count("Warning") }}</strong></div>
            <div><span>Fail</span><strong>{{ count("Fail") }}</strong></div>
            <div><span>Inconclusive</span><strong>{{ count("Inconclusive") }}</strong></div>
          </div>
          <p v-else class="case-inspector__state">
            {{ store.confirmed ? "Ready to test" : "Confirm the rules to continue" }}
          </p>

          <div class="verdict-header__facts" :data-webmcp-status="store.webMcpStatus">
            <span><Eye :size="14" />Current version {{ store.activeVersion?.evaluationInformed ? "evaluation-informed" : "independent" }}</span>
            <span><Bot :size="14" />{{ store.variants.length }}/3 variants · Evaluation {{ store.currentCase?.evaluationViewed ? "viewed" : "unseen" }}</span>
            <span><WandSparkles :size="13" />{{ agentToolsLabel }}</span>
          </div>
        </div>
      </details>
    </div>
  </section>
</template>

<style scoped lang="scss">
.verdict-header {
  position: relative;
  z-index: 45;
  display: grid;
  width: min(var(--workspace-shell), calc(100% - var(--workspace-gutter) - var(--workspace-gutter)));
  min-height: 98px;
  grid-template-columns: minmax(260px, 1fr) auto;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 7px clamp(24px, 3vw, 52px);
  margin: 0 auto;
  padding: 17px 0 16px;
}

.verdict-header__identity {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
}

.verdict-header__instrument {
  display: flex;
  max-width: 330px;
  align-items: center;
  gap: 7px;
  overflow: hidden;
  white-space: nowrap;
}

.verdict-header__instrument strong {
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 680;
  letter-spacing: -.025em;
}

.verdict-header__instrument strong + strong::before {
  margin-right: 7px;
  color: var(--text-faint);
  content: "/";
  font-weight: 450;
}

.verdict-header__instrument span {
  flex: 0 0 auto;
  margin-left: 2px;
  color: var(--text-muted);
  font-size: 10px;
}

.verdict-header__case {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 520;
  letter-spacing: -.012em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.verdict-header__window {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
  grid-row: 2;
}

.verdict-header__window svg { color: var(--text-faint); }
.verdict-header__range-separator { color: var(--text-faint); }

.verdict-header__controls {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  grid-row: 1 / span 2;
  grid-column: 2;
}

.version-select-wrap {
  position: relative;
  z-index: 65;
  width: 196px;
  color: var(--text-muted);
}

.version-select :deep(.form-select__trigger) {
  min-height: 34px;
  padding: 0 9px 0 11px;
  border-color: var(--line-control);
  border-radius: 8px;
  color: var(--text-secondary);
  background: var(--surface-control);
  box-shadow: none;
}

.version-select :deep(.form-select__trigger:hover:not(:disabled)),
.version-select :deep(.form-select__trigger:focus-visible) {
  border-color: var(--line-control-strong);
  color: var(--text-primary);
  background: var(--surface-control-hover);
  box-shadow: none;
}

.version-select :deep(.form-select__value) { font-size: 11px; font-weight: 540; }
.version-select :deep(.form-select__chevron) { width: 13px; height: 13px; }
.version-select :deep(.form-select__listbox) { right: 0; left: auto; width: 280px; }
.version-select :deep(.form-select__option) { font-size: 11px; }

.verdict-header__result { display: flex; align-items: center; }

.case-inspector { position: relative; }
.case-inspector > summary {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 11px;
  list-style: none;
  cursor: pointer;
  transition: color var(--motion-fast), border-color var(--motion-fast), background var(--motion-fast);
}

.case-inspector > summary::-webkit-details-marker { display: none; }
.case-inspector > summary:hover,
.case-inspector[open] > summary { border-color: var(--line-control); color: var(--text-primary); background: var(--surface-control); }
.case-inspector__chevron { transition: transform var(--motion-fast); }
.case-inspector[open] .case-inspector__chevron { transform: rotate(180deg); }

.case-inspector__popover {
  position: absolute;
  z-index: 80;
  top: calc(100% + 10px);
  right: 0;
  width: min(390px, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--line-control);
  border-radius: var(--radius-overlay);
  background: var(--surface-overlay);
  box-shadow: var(--shadow-overlay);
  backdrop-filter: blur(18px);
}

.case-inspector__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 13px;
  border-bottom: 1px solid var(--line-subtle);
}

.case-inspector__heading > div { display: grid; gap: 4px; }
.case-inspector__heading span { color: var(--text-muted); font-size: 10px; }
.case-inspector__heading strong {
  color: var(--text-secondary);
  font: 520 11px ui-monospace, SFMono-Regular, Menlo, monospace;
}

.verdict-counts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 14px 0;
  border-bottom: 1px solid var(--line-subtle);
}

.verdict-counts div { display: grid; gap: 5px; padding: 0 10px; border-left: 1px solid var(--line-subtle); }
.verdict-counts div:first-child { padding-left: 0; border-left: 0; }
.verdict-counts div:last-child { padding-right: 0; }
.verdict-counts span { overflow: hidden; color: var(--text-faint); font-size: 9px; text-overflow: ellipsis; }
.verdict-counts strong { color: var(--text-secondary); font-size: 15px; font-weight: 620; }

.case-inspector__state {
  margin: 0;
  padding: 14px 0;
  border-bottom: 1px solid var(--line-subtle);
  color: var(--text-muted);
  font-size: 11px;
}

.verdict-header__facts { display: grid; gap: 9px; padding-top: 13px; }
.verdict-header__facts span { display: inline-flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 10px; line-height: 1.4; }
.verdict-header__facts svg { flex: 0 0 auto; color: var(--text-faint); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }

@media (max-width: 1080px) {
  .verdict-header { grid-template-columns: minmax(240px, 1fr) auto; gap: 7px 28px; padding-block: 16px; }
}

@media (max-width: 760px) {
  .verdict-header {
    width: calc(100% - 32px);
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 15px 0;
  }
  .verdict-header__identity { grid-template-columns: 1fr; gap: 4px; }
  .verdict-header__instrument { max-width: 100%; }
  .verdict-header__case { font-size: 11px; }
  .verdict-header__window { grid-row: auto; }
  .verdict-header__controls { grid-row: auto; grid-column: auto; justify-content: flex-start; }
  .version-select-wrap { width: min(196px, 48vw); }
}

@media (max-width: 480px) {
  .verdict-header__controls { width: 100%; flex-wrap: wrap; }
  .version-select-wrap { width: 100%; }
  .case-inspector { margin-left: auto; }
  .case-inspector__popover { right: -1px; }
}
</style>
