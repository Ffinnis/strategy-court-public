<script setup lang="ts">
import { computed, nextTick, ref, toRaw } from "vue";
import { Pencil, X, ArrowRight } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import {
  indicatorPeriodTargets,
  withIndicatorPeriod,
} from "@/services/strategyVariantControls";
import RevealPanel from "@/components/ui/RevealPanel.vue";
const store = useCourtStore();
type Setting = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  scope?: "entry" | "exit";
  index?: number;
};
const settings = computed<Setting[]>(() => {
  const definition = store.activeVersion?.definition;
  if (!definition) return [];
  const items: Setting[] = [];
  for (const scope of ["entry", "exit"] as const)
    for (const target of indicatorPeriodTargets(definition[scope]))
      items.push({
        id: `${scope}:${target.index}`,
        label: `${scope === "entry" ? "Entry" : "Exit"} · ${target.label} period`,
        value: target.period,
        min: target.min,
        max: target.max,
        step: 1,
        unit: "bars",
        scope,
        index: target.index,
      });
  for (const [id, label, unit, max] of [
    ["stopLossPercent", "Stop loss", "%", 100],
    ["takeProfitPercent", "Take profit", "%", 100],
    ["maxHoldingDays", "Maximum holding period", "days", 2520],
  ] as const) {
    const value = definition.risk[id];
    if (typeof value === "number")
      items.push({
        id,
        label,
        unit,
        value,
        min: unit === "days" ? 1 : 0.01,
        max,
        step: unit === "days" ? 1 : 0.01,
      });
  }
  return items;
});
const editing = ref<string | null>(null);
const candidate = ref<string | number>("");
const error = ref("");
async function cancel(setting: Setting) {
  editing.value = null;
  error.value = "";
  await nextTick();
  document.getElementById(`draft-toggle-${setting.id}`)?.focus();
}
async function edit(setting: Setting) {
  editing.value = setting.id;
  candidate.value = setting.value;
  error.value = "";
  await nextTick();
  document.getElementById(`draft-setting-${setting.id}`)?.focus();
}
async function save(setting: Setting) {
  const value = Number(candidate.value);
  if (
    String(candidate.value).trim() === "" ||
    !Number.isFinite(value) ||
    value < setting.min ||
    value > setting.max ||
    (setting.step === 1 && !Number.isInteger(value))
  ) {
    error.value = `Use ${setting.min} to ${setting.max} ${setting.unit}${setting.step === 1 ? ", in whole numbers" : ""}.`;
    return;
  }
  if (!store.activeVersion || store.confirmed || store.mutating) return;
  if (value === setting.value) {
    editing.value = null;
    return;
  }
  const definition = structuredClone(toRaw(store.activeVersion.definition));
  if (setting.scope)
    definition[setting.scope] = withIndicatorPeriod(
      definition[setting.scope],
      setting.index!,
      value,
    );
  else Object.assign(definition.risk, { [setting.id]: value });
  await store.createDraft(
    definition,
    `${store.activeVersion.interpretation}\nUpdated ${setting.label}: ${setting.value} → ${value} ${setting.unit}.`,
    "user",
  );
  if (store.error) error.value = store.error;
  else editing.value = null;
}
</script>
<template>
  <details v-if="!store.confirmed && settings.length" class="draft-adjustments">
    <summary>Adjust a numeric rule <Pencil :size="13" /></summary>
    <header>
      <h3>Adjust the draft</h3>
      <p>
        Each saved change creates a new review version. Confirmed rules stay
        immutable.
      </p>
    </header>
    <div v-for="setting in settings" :key="setting.id" class="draft-setting">
      <button
        :id="`draft-toggle-${setting.id}`"
        class="draft-setting__summary"
        type="button"
        :aria-expanded="editing === setting.id"
        @click="editing === setting.id ? (editing = null) : edit(setting)"
      >
        <span>{{ setting.label }}</span
        ><strong>{{ setting.value }} {{ setting.unit }}</strong
        ><Pencil :size="13" /></button
      ><RevealPanel :open="editing === setting.id"
        ><form
          @submit.prevent="save(setting)"
          @keydown.esc.prevent="cancel(setting)"
        >
          <label :for="`draft-setting-${setting.id}`"
            >New value
            <input
              :id="`draft-setting-${setting.id}`"
              v-model="candidate"
              class="input"
              type="number"
              :min="setting.min"
              :max="setting.max"
              :step="setting.step"
              :aria-invalid="Boolean(error)" /></label
          ><span
            >{{ setting.value }} <ArrowRight :size="12" /> {{ candidate }}
            {{ setting.unit }}</span
          ><button
            class="button button--secondary button--small"
            :disabled="store.mutating"
          >
            Save review version</button
          ><button
            type="button"
            class="button button--quiet"
            aria-label="Cancel this edit"
            @click="cancel(setting)"
          >
            <X :size="14" />
          </button>
          <p v-if="error" role="alert">{{ error }}</p>
        </form></RevealPanel
      >
    </div>
  </details>
</template>
<style scoped>
.draft-adjustments > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  color: #bdbdc4;
  font-size: 12px;
  cursor: pointer;
  list-style: none;
}
.draft-adjustments > header {
  margin-top: 22px;
}
.draft-adjustments {
  padding: 16px 0;
  border-block: 1px solid #303030;
}
h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 550;
}
header p {
  margin: 8px 0 20px;
  color: #8f8f96;
  font-size: 12px;
  line-height: 1.6;
}
.draft-setting {
  border-top: 1px solid #282828;
}
.draft-setting__summary {
  display: flex;
  width: 100%;
  min-height: 52px;
  align-items: center;
  gap: 15px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #9d9da4;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.draft-setting__summary > span {
  flex: 1;
}
.draft-setting__summary strong {
  color: #d3d3d8;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
form {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: 16px;
  padding: 5px 0 20px;
}
form label {
  display: grid;
  gap: 8px;
  color: #aaa;
  font-size: 11px;
}
form .input {
  width: 130px;
  min-height: 36px;
}
form > span {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  font-size: 12px;
  color: #b5b5ba;
}
form p {
  width: 100%;
  margin: 0;
  color: #ccc;
  font-size: 12px;
}
</style>
