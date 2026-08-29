<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { Braces, Check, ChevronRight, RefreshCw, Search, SlidersHorizontal } from "lucide-vue-next";
import { apiRequest, unwrap } from "@/services/api";
import FormSelect from "@/components/forms/FormSelect.vue";
import OwnerShareControls from "@/components/OwnerShareControls.vue";

type CatalogFilter = "all" | "ready" | "planned" | "custom";
type FormulaKind = "threshold" | "scaled";

interface CatalogIndicator {
  id: string;
  name: string;
  category?: string;
  description?: string;
  available?: boolean;
  custom?: boolean;
  version?: number;
  outputType?: string;
  requiredParameters?: string[];
  allowedSources?: string[];
  parameters?: Array<{
    name: string;
    label: string;
    type: "integer" | "number" | "source" | "component";
    required: boolean;
    default: number | string;
    min?: number;
    max?: number;
    options?: string[];
  }>;
  dependencies?: string[];
  sharingState?: string;
}

const comparisonOptions = [
  { value: "gt", label: "Greater than" },
  { value: "gte", label: "Greater than or equal" },
  { value: "lt", label: "Less than" },
  { value: "lte", label: "Less than or equal" },
  { value: "eq", label: "Equal to" },
  { value: "crosses_above", label: "Crosses above" },
  { value: "crosses_below", label: "Crosses below" },
];
const sharingOptions = [
  { value: "private", label: "Private" },
  { value: "unlisted", label: "Unlisted link" },
];

const indicators = ref<CatalogIndicator[]>([]);
const loading = ref(true);
const loadError = ref("");
const query = ref("");
const filter = ref<CatalogFilter>("all");
const creating = ref(false);
const createError = ref("");
const created = ref<CatalogIndicator | null>(null);

const form = reactive({
  name: "",
  description: "",
  formulaKind: "threshold" as FormulaKind,
  baseIndicator: "rsi",
  comparison: "lt",
  threshold: 30,
  scale: 1,
  sharingState: "private",
});
const parameterValues = reactive<Record<string, number | string>>({});

const readyBuiltIns = computed(() => indicators.value.filter((item) => item.available && !item.custom));
const baseIndicatorOptions = computed(() => readyBuiltIns.value.map((item) => ({ value: item.id, label: item.name })));
const customCount = computed(() => indicators.value.filter((item) => item.custom).length);
const plannedCount = computed(() => indicators.value.filter((item) => !item.available && !item.custom).length);
const baseIndicator = computed(() => readyBuiltIns.value.find((item) => item.id === form.baseIndicator));
const activeParameters = computed(() => baseIndicator.value?.parameters ?? []);

const visibleIndicators = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return indicators.value
    .filter((item) => {
      if (filter.value === "ready" && (!item.available || item.custom)) return false;
      if (filter.value === "planned" && (item.available || item.custom)) return false;
      if (filter.value === "custom" && !item.custom) return false;
      return !needle || `${item.name} ${item.id} ${item.category ?? ""}`.toLowerCase().includes(needle);
    })
    .sort((left, right) => Number(Boolean(right.custom)) - Number(Boolean(left.custom)) || left.name.localeCompare(right.name));
});

const definition = computed(() => {
  const parameters = Object.fromEntries(activeParameters.value.map((parameter) => [
    parameter.name,
    parameterValues[parameter.name] ?? parameter.default,
  ]));
  const base = { indicator: form.baseIndicator, parameters };

  if (form.formulaKind === "threshold") {
    return {
      name: form.name.trim(),
      description: form.description.trim(),
      inputs: [{
        name: "threshold",
        type: "number",
        default: form.threshold,
        min: -1_000_000_000_000,
        max: 1_000_000_000_000,
        description: "Comparison threshold",
      }],
      dependencies: [form.baseIndicator],
      outputType: "boolean",
      sharingState: form.sharingState,
      formula: { left: base, operator: form.comparison, right: { input: "threshold" } },
    };
  }

  return {
    name: form.name.trim(),
    description: form.description.trim(),
    inputs: [{
      name: "scale",
      type: "number",
      default: form.scale,
      min: -1_000_000,
      max: 1_000_000,
      description: "Multiplier applied to the source series",
    }],
    dependencies: [form.baseIndicator],
    outputType: "number",
    sharingState: form.sharingState,
    formula: { operation: "multiply", left: base, right: { input: "scale" } },
  };
});

const formValid = computed(() => (
  form.name.trim().length > 0
  && form.description.trim().length > 0
  && activeParameters.value.every((parameter) => {
    const value = parameterValues[parameter.name] ?? parameter.default;
    if (parameter.type === "integer" || parameter.type === "number") {
      return typeof value === "number"
        && Number.isFinite(value)
        && (parameter.type !== "integer" || Number.isInteger(value))
        && (parameter.min === undefined || value >= parameter.min)
        && (parameter.max === undefined || value <= parameter.max);
    }
    return typeof value === "string" && Boolean(parameter.options?.includes(value));
  })
  && (form.baseIndicator !== "macd" || Number(parameterValues.fastPeriod) < Number(parameterValues.slowPeriod))
  && (form.baseIndicator !== "parabolic_sar" || Number(parameterValues.acceleration) <= Number(parameterValues.maximum))
  && (form.formulaKind === "threshold" ? Number.isFinite(form.threshold) : Number.isFinite(form.scale))
  && Boolean(baseIndicator.value)
));

function syncParameterValues(): void {
  for (const key of Object.keys(parameterValues)) delete parameterValues[key];
  for (const parameter of activeParameters.value) parameterValues[parameter.name] = parameter.default;
}

function parameterSelectOptions(options?: string[]) {
  return (options ?? []).map((value) => ({ value, label: value }));
}

function categoryLabel(value?: string): string {
  if (!value) return "Custom";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusLabel(indicator: CatalogIndicator): string {
  if (indicator.custom) return "Custom";
  return indicator.available ? "Ready" : "Planned";
}

async function loadIndicators(announce = false): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    indicators.value = unwrap<CatalogIndicator[]>(await apiRequest("/api/indicators"), "indicators");
    if (!readyBuiltIns.value.some((item) => item.id === form.baseIndicator)) {
      form.baseIndicator = readyBuiltIns.value[0]?.id ?? "";
    }
    syncParameterValues();
  } catch (issue) {
    loadError.value = issue instanceof Error ? issue.message : "The indicator catalog could not be loaded.";
  } finally {
    loading.value = false;
  }
  if (announce) created.value = null;
}

async function createIndicator(): Promise<void> {
  if (!formValid.value || creating.value) return;
  creating.value = true;
  createError.value = "";
  created.value = null;
  try {
    const response = await apiRequest("/api/indicators", {
      method: "POST",
      body: JSON.stringify(definition.value),
    });
    created.value = unwrap<CatalogIndicator>(response, "indicator");
    await loadIndicators();
  } catch (issue) {
    createError.value = issue instanceof Error ? issue.message : "The indicator could not be created.";
  } finally {
    creating.value = false;
  }
}

function resetDraft(): void {
  form.name = "";
  form.description = "";
  form.formulaKind = "threshold";
  form.baseIndicator = readyBuiltIns.value.find((item) => item.id === "rsi")?.id ?? readyBuiltIns.value[0]?.id ?? "";
  syncParameterValues();
  form.comparison = "lt";
  form.threshold = 30;
  form.scale = 1;
  form.sharingState = "private";
  createError.value = "";
  created.value = null;
}

watch(() => form.baseIndicator, syncParameterValues);
onMounted(() => loadIndicators());
</script>

<template>
  <main class="indicator-page">
    <header class="page-heading">
      <span class="context-badge"><Braces :size="13" aria-hidden="true" /> Manual indicator tools</span>
      <h1>Indicators</h1>
      <p>Inspect the deterministic catalog or compose a safe formula tree without executable code.</p>
    </header>

    <section class="catalog-summary" aria-label="Indicator catalog summary">
      <div><strong>{{ readyBuiltIns.length }}</strong><span>Ready</span></div>
      <div><strong>{{ plannedCount }}</strong><span>Planned</span></div>
      <div><strong>{{ customCount }}</strong><span>Custom</span></div>
    </section>

    <div class="indicator-layout">
      <section class="catalog-panel" aria-labelledby="catalog-title">
        <div class="section-heading">
          <div><h2 id="catalog-title">Catalog</h2><p>Only ready indicators can be used by the current Court engine.</p></div>
          <button class="icon-button" type="button" :disabled="loading" aria-label="Refresh indicator catalog" @click="loadIndicators(true)">
            <RefreshCw :size="15" :class="{ spinning: loading }" aria-hidden="true" />
          </button>
        </div>

        <div class="catalog-controls">
          <label class="search-control">
            <Search :size="14" aria-hidden="true" />
            <span class="sr-only">Search indicators</span>
            <input v-model="query" type="search" placeholder="Search by name or ID" />
          </label>
          <div class="filter-tabs" aria-label="Filter indicators">
            <button v-for="item in ([['all','All'],['ready','Ready'],['planned','Planned'],['custom','Custom']] as const)" :key="item[0]" type="button" :class="{ active: filter === item[0] }" :aria-pressed="filter === item[0]" @click="filter = item[0]">{{ item[1] }}</button>
          </div>
        </div>

        <div v-if="loadError" class="inline-state" role="alert">
          <span>{{ loadError }}</span>
          <button class="button button--secondary button--small" type="button" @click="loadIndicators()">Retry</button>
        </div>

        <div v-else-if="loading" class="catalog-list" aria-label="Loading indicator catalog">
          <div v-for="index in 7" :key="index" class="catalog-skeleton skeleton" />
        </div>

        <div v-else-if="!visibleIndicators.length" class="inline-state">
          <span>No indicators match this filter.</span>
          <button class="button button--quiet button--small" type="button" @click="query = ''; filter = 'all'">Clear filters</button>
        </div>

        <div v-else class="catalog-list">
          <RouterLink v-for="indicator in visibleIndicators" :key="indicator.id" class="catalog-row" :to="`/indicator/${encodeURIComponent(indicator.id)}`">
            <span class="indicator-mark"><SlidersHorizontal :size="14" aria-hidden="true" /></span>
            <span class="indicator-copy">
              <span class="indicator-title"><strong>{{ indicator.name }}</strong><span class="status-badge" :class="`status-badge--${statusLabel(indicator).toLowerCase()}`">{{ statusLabel(indicator) }}</span></span>
              <span>{{ indicator.id }} · {{ categoryLabel(indicator.category) }} · {{ indicator.outputType ?? "number" }}</span>
            </span>
            <ChevronRight :size="15" aria-hidden="true" />
          </RouterLink>
        </div>
      </section>

      <section class="builder-panel" aria-labelledby="builder-title">
        <div class="section-heading">
          <div><span class="step-badge">Safe formula</span><h2 id="builder-title">Create a custom indicator</h2></div>
        </div>

        <form class="builder-form" @submit.prevent="createIndicator">
          <div class="field-grid">
            <label class="field"><span>Name</span><input v-model="form.name" class="input" maxlength="120" required placeholder="RSI threshold signal" /></label>
            <label class="field">
              <span>Sharing</span>
              <FormSelect id="indicator-sharing" v-model="form.sharingState" :options="sharingOptions" aria-label="Sharing" />
            </label>
          </div>
          <label class="field"><span>Description</span><textarea v-model="form.description" class="input" maxlength="2000" required placeholder="What the indicator measures and when it should be used." /></label>

          <fieldset class="formula-choice">
            <legend>Formula</legend>
            <label :class="{ selected: form.formulaKind === 'threshold' }"><input v-model="form.formulaKind" type="radio" value="threshold" /><span><strong>Threshold signal</strong><small>Compare one indicator with a configurable level.</small></span></label>
            <label :class="{ selected: form.formulaKind === 'scaled' }"><input v-model="form.formulaKind" type="radio" value="scaled" /><span><strong>Scaled series</strong><small>Multiply one indicator by a configurable value.</small></span></label>
          </fieldset>

          <label class="field">
            <span>Base indicator</span>
            <FormSelect id="indicator-base" v-model="form.baseIndicator" :options="baseIndicatorOptions" aria-label="Base indicator" />
          </label>
          <div v-if="activeParameters.length" class="parameter-grid">
            <label v-for="parameter in activeParameters" :key="parameter.name" class="field">
              <span>{{ parameter.label }}</span>
              <input
                v-if="parameter.type === 'integer' || parameter.type === 'number'"
                v-model.number="parameterValues[parameter.name]"
                class="input"
                type="number"
                :step="parameter.type === 'integer' ? 1 : 'any'"
                :min="parameter.min"
                :max="parameter.max"
                required
              />
              <FormSelect
                v-else
                :id="`indicator-parameter-${parameter.name}`"
                :model-value="String(parameterValues[parameter.name] ?? parameter.default)"
                :options="parameterSelectOptions(parameter.options)"
                :aria-label="parameter.label"
                @update:model-value="parameterValues[parameter.name] = $event"
              />
            </label>
          </div>
          <p v-else class="parameter-note">This indicator has no configurable parameters.</p>

          <div v-if="form.formulaKind === 'threshold'" class="field-grid">
            <label class="field">
              <span>Comparison</span>
              <FormSelect id="indicator-comparison" v-model="form.comparison" :options="comparisonOptions" aria-label="Comparison" />
            </label>
            <label class="field"><span>Threshold default</span><input v-model.number="form.threshold" class="input" type="number" step="any" required /></label>
          </div>
          <label v-else class="field"><span>Scale default</span><input v-model.number="form.scale" class="input" type="number" step="any" required /></label>

          <details class="definition-preview">
            <summary>Structured definition</summary>
            <pre>{{ JSON.stringify(definition, null, 2) }}</pre>
          </details>

          <div v-if="createError" class="inline-state inline-state--error" role="alert">{{ createError }}</div>
          <div v-if="created" class="success-state" role="status">
            <span class="success-mark"><Check :size="14" aria-hidden="true" /></span>
            <span><strong>{{ created.name }}</strong> was created as version {{ created.version ?? 1 }}.</span>
            <RouterLink class="button button--secondary button--small" :to="`/indicator/${encodeURIComponent(created.id)}`">View definition</RouterLink>
          </div>
          <OwnerShareControls v-if="created?.sharingState === 'unlisted'" entity-type="indicator" :entity-id="created.id" resource-name="this indicator" />

          <div class="form-actions">
            <button v-if="created" class="button button--quiet" type="button" @click="resetDraft">Create another</button>
            <button class="button" type="submit" :disabled="!formValid || creating || loading">
              <Braces :size="15" aria-hidden="true" />{{ creating ? "Creating…" : "Create indicator" }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </main>
</template>

<style scoped lang="scss">
.indicator-page{width:min(1320px,calc(100% - 56px));min-height:calc(100vh - 104px);margin:0 auto;padding:72px 0 120px}.page-heading{max-width:720px}.context-badge,.step-badge,.status-badge{display:inline-flex;align-items:center;gap:6px;border:1px solid #333;border-radius:999px;color:#b8b8b8;background:#171717;box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 8px 24px rgba(0,0,0,.22);font-size:10px;font-weight:560}.context-badge{min-height:28px;padding:0 10px}.page-heading h1{margin:20px 0 10px;font-size:clamp(48px,6vw,74px);font-weight:650;line-height:.96;letter-spacing:-.055em}.page-heading p{max-width:610px;margin:0;color:#8b8b91;font-size:15px;line-height:1.6}.catalog-summary{display:grid;grid-template-columns:repeat(3,minmax(0,150px));gap:0;margin:52px 0 64px;border-top:1px solid rgba(255,255,255,.07);border-bottom:1px solid rgba(255,255,255,.07)}.catalog-summary div{display:grid;gap:5px;padding:17px 22px;border-left:1px solid rgba(255,255,255,.07)}.catalog-summary div:first-child{border-left:0}.catalog-summary strong{font-size:22px;letter-spacing:-.04em}.catalog-summary span{color:#6f6f75;font-size:10px}.indicator-layout{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(420px,.95fr);align-items:start;gap:80px}.section-heading{display:flex;min-height:54px;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid rgba(255,255,255,.075)}.section-heading h2{margin:0;font-size:20px;font-weight:620;letter-spacing:-.025em}.section-heading p{margin:6px 0 0;color:#707076;font-size:11px;line-height:1.5}.step-badge{min-height:24px;margin-bottom:11px;padding:0 8px}.icon-button{display:grid;width:34px;height:34px;place-items:center;border:1px solid #303030;border-radius:9px;color:#aaa;background:#161616;box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 7px 20px rgba(0,0,0,.2);cursor:pointer}.icon-button:disabled{opacity:.45}.spinning{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.catalog-controls{display:grid;gap:12px;margin-bottom:18px}.search-control{display:flex;min-height:44px;align-items:center;gap:9px;padding:0 12px;border:1px solid #303030;border-radius:10px;color:#666;background:#151515;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 10px 30px rgba(0,0,0,.16)}.search-control:focus-within{border-color:#666;box-shadow:0 0 0 4px rgba(255,255,255,.045),0 16px 40px rgba(0,0,0,.25)}.search-control input{width:100%;border:0;outline:0;color:#eee;background:transparent;font-size:12px}.search-control input::placeholder{color:#555}.filter-tabs{display:flex;gap:5px;overflow-x:auto}.filter-tabs button{min-height:30px;padding:0 10px;border:0;border-radius:8px;color:#777;background:transparent;font-size:10px;cursor:pointer}.filter-tabs button:hover,.filter-tabs button.active{color:#eee;background:#1a1a1a;box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}.catalog-list{display:grid}.catalog-row{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:12px;min-height:70px;padding:10px 4px;border-bottom:1px solid rgba(255,255,255,.06);transition:padding 160ms ease,background 160ms ease,transform 160ms ease}.catalog-row:first-child{border-top:1px solid rgba(255,255,255,.06)}.catalog-row:hover{padding-inline:12px;border-radius:11px;background:rgba(255,255,255,.026);transform:translateX(2px)}.indicator-mark{display:grid;width:30px;height:30px;place-items:center;border-radius:9px;color:#aaa;background:#191919;box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 8px 22px rgba(0,0,0,.2)}.indicator-copy{display:grid;min-width:0;gap:6px;color:#666;font-size:10px}.indicator-title{display:flex;align-items:center;gap:8px}.indicator-title strong{overflow:hidden;color:#ddd;font-size:12px;font-weight:560;text-overflow:ellipsis;white-space:nowrap}.status-badge{min-height:21px;padding:0 7px;border-color:#2d2d2d;background:#151515;box-shadow:none;font-size:9px}.status-badge--planned{color:#686868}.status-badge--custom{color:#e2e2e2;border-color:#454545;background:#1d1d1d}.catalog-row>svg{color:#555}.catalog-skeleton{height:61px;margin-bottom:1px;border-radius:0}.inline-state{display:flex;min-height:90px;align-items:center;justify-content:space-between;gap:16px;padding:16px;border-radius:11px;color:#999;background:#151515;font-size:11px;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 14px 36px rgba(0,0,0,.18)}.inline-state--error{min-height:auto;color:#ddd}.builder-panel{position:sticky;top:94px;padding:28px;border:1px solid #2e2e2e;border-radius:18px;background:#131313;box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 2px 4px rgba(0,0,0,.28),0 34px 90px rgba(0,0,0,.35)}.builder-form{display:grid;gap:18px}.field-grid{display:grid;grid-template-columns:1fr .68fr;gap:12px}.field-grid--three{grid-template-columns:1.35fr .55fr .8fr}.parameter-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.parameter-note{margin:0;color:#777;font-size:10px}.field>span{color:#cfcfcf;font-size:11px}.field textarea{min-height:86px}.formula-choice{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0;padding:0;border:0}.formula-choice legend{margin-bottom:8px;color:#cfcfcf;font-size:11px}.formula-choice label{display:flex;min-height:74px;align-items:flex-start;gap:10px;padding:13px;border:1px solid #2d2d2d;border-radius:11px;background:#151515;cursor:pointer}.formula-choice label.selected{border-color:#5a5a5a;background:#1a1a1a;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 10px 28px rgba(0,0,0,.2)}.formula-choice input{margin:3px 0 0;accent-color:#fff}.formula-choice span{display:grid;gap:5px}.formula-choice strong{font-size:11px;font-weight:560}.formula-choice small{color:#73737a;font-size:9px;line-height:1.45}.definition-preview{border-top:1px solid rgba(255,255,255,.07);border-bottom:1px solid rgba(255,255,255,.07)}.definition-preview summary{padding:12px 0;color:#8f8f95;font-size:10px;cursor:pointer}.definition-preview pre{max-height:260px;overflow:auto;margin:0 0 14px;padding:14px;border-radius:10px;color:#b7b7bc;background:#0d0d0d;font:10px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}.success-state{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:10px;padding:12px;border-radius:11px;color:#a9a9af;background:#181818;font-size:10px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}.success-state strong{color:#eee}.success-mark{display:grid;width:26px;height:26px;place-items:center;border-radius:8px;color:#111;background:#eee}.form-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:2px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
@media(max-width:1000px){.indicator-layout{grid-template-columns:1fr;gap:60px}.builder-panel{position:static}.catalog-panel{max-width:none}}
@media(max-width:680px){.indicator-page{width:100%;padding:52px 16px 90px}.page-heading h1{font-size:50px}.catalog-summary{grid-template-columns:repeat(3,1fr);margin:38px 0 52px}.catalog-summary div{padding:14px}.indicator-layout{gap:48px}.builder-panel{margin-inline:-4px;padding:20px;border-radius:15px}.field-grid,.field-grid--three,.parameter-grid,.formula-choice{grid-template-columns:1fr}.success-state{grid-template-columns:28px 1fr}.success-state .button{grid-column:1/-1}.form-actions{display:grid}.form-actions .button{width:100%}}
@media(prefers-reduced-motion:reduce){.spinning{animation:none}}
</style>
