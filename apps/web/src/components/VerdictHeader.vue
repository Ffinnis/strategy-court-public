<script setup lang="ts">
import { computed } from "vue";
import { Bot, Database, Eye, Scale } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import FormSelect from "@/components/forms/FormSelect.vue";
import StatusBadge from "@/components/StatusBadge.vue";

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const store = useCourtStore();
const verdicts = computed(() => store.result?.verdicts ?? []);
const count = (status: string) => verdicts.value.filter((verdict) => verdict.status === status).length;
const summary = computed(() => store.result?.summaryLabel ?? (store.confirmed ? "Awaiting Court" : "Draft"));
const versionOptions = computed(() => (store.currentCase?.versions ?? []).map((version, index) => ({
  value: version.id,
  label: `Version ${version.versionNumber ?? index + 1}${version.evaluationInformed ? " · evaluation-informed" : ""}`,
})));
const activeVersionId = computed({
  get: () => store.activeVersion?.id ?? "",
  set: (id: string) => store.selectVersion(id),
});
</script>

<template>
  <section class="verdict-header" :class="{ 'verdict-header--compact': compact }" aria-label="Current Court summary">
    <div class="verdict-header__identity">
      <div v-if="!compact" class="verdict-header__icon"><Scale :size="18" /></div>
      <div class="verdict-header__name">
        <span v-if="!compact" class="verdict-header__record">{{ store.currentCase?.id.slice(0, 8) }}</span>
        <span class="verdict-header__case">{{ store.currentCase?.name }}</span>
        <div class="version-select-wrap">
          <label class="sr-only" for="version-select">Current strategy version</label>
          <FormSelect
            id="version-select"
            v-model="activeVersionId"
            class="version-select"
            :options="versionOptions"
            placeholder="No versions"
            aria-label="Current strategy version"
          />
        </div>
      </div>
    </div>

    <div class="verdict-header__result">
      <StatusBadge :status="summary" />
      <div v-if="store.courtComplete" class="verdict-counts" aria-label="Verdict counts">
        <span>{{ count("Pass") }} pass</span>
        <span>{{ count("Warning") }} warning</span>
        <span>{{ count("Fail") }} fail</span>
        <span>{{ count("Inconclusive") }} inconclusive</span>
      </div>
      <span v-else class="verdict-header__state">{{ store.confirmed ? "Ready to test" : "Confirm the rules to continue" }}</span>
    </div>

    <div class="verdict-header__facts">
      <span title="API-backed case"><Database :size="13" />API snapshot</span>
      <span><Bot :size="13" />{{ store.variants.length }}/3 variants</span>
      <span><Eye :size="13" />Evaluation {{ store.currentCase?.evaluationViewed ? "viewed" : "unseen" }}</span>
      <span><Eye :size="13" />Current version {{ store.activeVersion?.evaluationInformed ? "evaluation-informed" : "independent" }}</span>
    </div>
  </section>
</template>

<style scoped lang="scss">
.verdict-header {
  display: grid;
  width: min(1264px, calc(100% - 56px));
  min-height: 118px;
  grid-template-columns: minmax(280px, .9fr) minmax(360px, 1.2fr) auto;
  align-items: center;
  gap: 34px;
  margin: 0 auto;
  padding: 28px 0 24px;
}

.verdict-header--compact {
  width: min(1480px, calc(100% - 64px));
  min-height: 76px;
  display: grid;
  grid-template-columns: minmax(220px,.8fr) minmax(360px,1.2fr) auto;
  padding: 17px 0 10px;
}

.verdict-header__identity { display: flex; min-width: 0; align-items: center; gap: 14px; }
.verdict-header__icon {
  display: grid;
  flex: 0 0 40px;
  height: 40px;
  place-items: center;
  border: 1px solid #343434;
  border-radius: 10px;
  color: #e9e9e9;
  background: #151515;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 10px 28px rgba(0,0,0,.28);
}
.verdict-header__name { min-width: 0; }
.verdict-header__record {
  display: block;
  margin-bottom: 4px;
  color: #666;
  font: 500 9px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.verdict-header__case {
  display: block;
  overflow: hidden;
  max-width: 430px;
  color: #f5f5f5;
  font-size: 23px;
  font-weight: 580;
  line-height: 1.05;
  letter-spacing: -.035em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.verdict-header--compact .verdict-header__case { max-width: 650px; font-size: 19px; letter-spacing: -.025em; }
.version-select-wrap { width: min(280px, 100%); margin-top: 6px; color: #7c7c7c; }
.version-select :deep(.form-select__trigger) { min-height: 22px; padding: 0 3px 0 0; border: 0; border-radius: 4px; color: #8f8f8f; background: transparent; box-shadow: none; }
.version-select :deep(.form-select__trigger:hover:not(:disabled)),
.version-select :deep(.form-select__trigger:focus-visible) { color: #d2d2d2; border: 0; background: transparent; box-shadow: none; }
.version-select :deep(.form-select__trigger:focus-visible) { outline-offset: 2px; }
.version-select :deep(.form-select__value) { font-size: 10px; font-weight: 500; }
.version-select :deep(.form-select__chevron) { width: 12px; height: 12px; }
.version-select :deep(.form-select__listbox) { right: auto; left: 0; min-width: min(280px, calc(100vw - 24px)); }
.version-select :deep(.form-select__option) { font-size: 11px; }
.verdict-header__result { display: flex; align-items: center; gap: 16px; }
.verdict-counts { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.verdict-counts span, .verdict-header__state { color: #858585; font-size: 10px; white-space: nowrap; }
.verdict-counts span::before {
  display: inline-block;
  width: 4px;
  height: 4px;
  margin: 0 7px 2px 0;
  border-radius: 50%;
  content: "";
  background: #bdbdbd;
  box-shadow: 0 0 0 4px rgba(255,255,255,.03);
}
.verdict-header__facts { display: flex; align-items: flex-end; flex-direction: column; gap: 8px; padding-left: 22px; border-left: 1px solid rgba(255,255,255,.07); }
.verdict-header__facts span { display: inline-flex; align-items: center; gap: 6px; color: #707070; font-size: 9px; white-space: nowrap; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }

@media (max-width: 1050px) {
  .verdict-header, .verdict-header--compact { grid-template-columns: 1fr 1.2fr; }
  .verdict-header__facts { grid-column: 1/-1; align-items: center; flex-direction: row; flex-wrap: wrap; padding: 12px 0 0; border-top: 1px solid rgba(255,255,255,.07); border-left: 0; }
}
@media (max-width: 720px) {
  .verdict-header, .verdict-header--compact { width: 100%; min-height: 0; padding: 16px; }
  .verdict-header, .verdict-header--compact { grid-template-columns: 1fr; gap: 15px; }
  .verdict-header__result { align-items: flex-start; justify-content: space-between; }
  .verdict-header__case, .verdict-header--compact .verdict-header__case { max-width: 78vw; font-size: 18px; }
}
</style>
