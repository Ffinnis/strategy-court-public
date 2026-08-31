<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ArrowRight, LockKeyhole, ShieldAlert, TriangleAlert } from "lucide-vue-next";
import FormSelect from "@/components/forms/FormSelect.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import { useCourtStore } from "@/stores/court";
import { indicatorPeriodTargets, withIndicatorPeriod } from "@/services/strategyVariantControls";
import type { ComparisonVersion } from "@/types";

type FixedChangeKey = "maxHoldingDays" | "stopLossPercent" | "takeProfitPercent" | "commissionBpsPerSide" | "slippageBpsPerSide";
type RuleScope = "entry" | "exit";
type SummaryMetric = "netReturnPercent" | "profitFactor" | "maximumDrawdownPercent" | "tradeCount";

interface ChangeConfig {
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  integer?: boolean;
}

const fixedChangeConfigs: Record<FixedChangeKey, ChangeConfig> = {
  maxHoldingDays: { label: "Maximum holding period", min: 1, max: 2520, step: 1, unit: "days", integer: true },
  stopLossPercent: { label: "Stop loss", min: 0.01, max: 100, step: 0.01, unit: "%" },
  takeProfitPercent: { label: "Take profit", min: 0.01, max: 100, step: 0.01, unit: "%" },
  commissionBpsPerSide: { label: "Commission per side", min: 0, max: 1000, step: 0.1, unit: "bps" },
  slippageBpsPerSide: { label: "Slippage per side", min: 0, max: 1000, step: 0.1, unit: "bps" },
};

const summaryMetrics: Array<{ key: SummaryMetric; label: string }> = [
  { key: "netReturnPercent", label: "Net return" },
  { key: "profitFactor", label: "Profit factor" },
  { key: "maximumDrawdownPercent", label: "Max drawdown" },
  { key: "tradeCount", label: "Completed trades" },
];

const store = useCourtStore();
const selected = ref("");
const selectedChange = ref("");
const candidateValue = ref<string | number>("");
const hypothesis = ref("");
const nameOverride = ref("");
const weaknessOverride = ref("");
const rationaleOverride = ref("");
const draftError = ref("");

const hasCompletedCourtRecord = computed(() => Boolean(store.variantParentResult));
const rows = computed(() => store.comparison?.versions ?? []);
const baselineRow = computed(() => rows.value.find((item) => item.versionId === store.variantParentVersion?.id));
const variantRows = computed(() => rows.value.filter((item) => item.parentVersionId === baselineRow.value?.versionId));
const selectedRow = computed(() => variantRows.value.find((item) => item.versionId === selected.value) ?? variantRows.value[0]);
const selectedVersion = computed(() => store.currentCase?.versions.find((item) => item.id === selectedRow.value?.versionId));
const baselineDefinition = computed(() => store.variantParentVersion?.definition);

const changeConfigs = computed<Record<string, ChangeConfig>>(() => {
  const configs: Record<string, ChangeConfig> = {};
  const definition = baselineDefinition.value;
  if (definition) {
    for (const scope of ["entry", "exit"] as const) {
      const targets = indicatorPeriodTargets(definition[scope]);
      const totals = new Map<string, number>();
      targets.forEach((target) => totals.set(target.indicator, (totals.get(target.indicator) ?? 0) + 1));
      const seen = new Map<string, number>();
      targets.forEach((target) => {
        const occurrence = (seen.get(target.indicator) ?? 0) + 1;
        seen.set(target.indicator, occurrence);
        const suffix = (totals.get(target.indicator) ?? 0) > 1 ? ` ${occurrence}` : "";
        configs[`${scope}IndicatorPeriod:${target.index}`] = {
          label: `${scope === "entry" ? "Entry" : "Exit"} · ${target.label} period${suffix}`,
          min: target.min,
          max: target.max,
          step: 1,
          unit: "bars",
          integer: true,
        };
      });
    }
  }
  Object.assign(configs, fixedChangeConfigs);
  return configs;
});
const changeOptions = computed(() => Object.entries(changeConfigs.value).map(([value, config]) => ({ value, label: config.label })));
const selectedConfig = computed(() => changeConfigs.value[selectedChange.value] ?? fixedChangeConfigs.maxHoldingDays);
const numericCandidate = computed(() => {
  const raw = String(candidateValue.value).trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
});
const mainIssue = computed(() => (
  store.variantParentResult?.verdicts.find((item) => item.status === "Fail")
  ?? store.variantParentResult?.verdicts.find((item) => item.status === "Warning" || item.status === "Inconclusive")
));
const remainingSlots = computed(() => Math.max(0, 3 - store.variants.length));
const comparisonState = computed(() => store.comparisonLoading
  ? "Refreshing comparison"
  : rows.value.length
    ? `${rows.value.length} versions in the record`
    : "Comparison unavailable");
const probationReason = computed(() => store.probationCandidate
  ? `Version ${store.probationCandidate.versionNumber} has an eligible completed result.`
  : "No version has an eligible completed Court result.");
const variantOptions = computed(() => variantRows.value.map((row, index) => {
  const version = store.currentCase?.versions.find((item) => item.id === row.versionId);
  return { value: row.versionId, label: `Version ${version?.versionNumber ?? index + 2} · ${row.name}` };
}));

function runFor(id: string) {
  return store.currentCase?.runs.find((item) => item.versionId === id);
}

function currentValue(key: string): number | undefined {
  const definition = baselineDefinition.value;
  if (!definition) return undefined;
  if (key === "slippageBpsPerSide" || key === "commissionBpsPerSide") return definition.costs[key];
  if (key === "maxHoldingDays" || key === "stopLossPercent" || key === "takeProfitPercent") return definition.risk[key];
  const match = /^(entry|exit)IndicatorPeriod:(\d+)$/.exec(key);
  if (!match) return undefined;
  return indicatorPeriodTargets(definition[match[1] as RuleScope]).find((target) => target.index === Number(match[2]))?.period;
}

function formatSetting(value: number | undefined, config = selectedConfig.value): string {
  if (value === undefined) return "Not set";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${config.unit}`;
}

function buildPatch(key: string, value: number): Record<string, unknown> {
  if (key === "slippageBpsPerSide" || key === "commissionBpsPerSide") return { costs: { [key]: value } };
  if (key === "maxHoldingDays" || key === "stopLossPercent" || key === "takeProfitPercent") return { risk: { [key]: value } };
  const match = /^(entry|exit)IndicatorPeriod:(\d+)$/.exec(key);
  const definition = baselineDefinition.value;
  if (!match || !definition) return {};
  const scope = match[1] as RuleScope;
  return { [scope]: withIndicatorPeriod(definition[scope], Number(match[2]), value) };
}

const patch = computed(() => numericCandidate.value == null ? null : buildPatch(selectedChange.value, numericCandidate.value));
const patchPreview = computed(() => patch.value ? JSON.stringify(patch.value, null, 2) : "Enter a value to preview the rule change.");
const defaultName = computed(() => {
  const value = numericCandidate.value;
  return value == null ? selectedConfig.value.label : `${selectedConfig.value.label}: ${formatSetting(value)}`;
});
const defaultWeakness = computed(() => mainIssue.value?.category ?? "Court result");
const defaultRationale = computed(() => (
  `This test changes only ${selectedConfig.value.label.toLowerCase()} so its effect can be compared with the locked baseline.`
));

function metric(row: ComparisonVersion | undefined, key: SummaryMetric): string {
  if (!row) return "Pending";
  const value = key === "tradeCount" ? row.tradeCount : row.metrics?.[key];
  if (typeof value !== "number") return value == null ? "Pending" : String(value);
  if (key === "netReturnPercent") return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
  if (key === "maximumDrawdownPercent") return `${value.toFixed(1)}%`;
  if (key === "profitFactor") return value.toFixed(2);
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function verdictStatus(row: ComparisonVersion, category: string) {
  const verdict = row.verdicts.find((item) => String(item.category ?? item.title ?? "") === category);
  return String(verdict?.status ?? verdict?.verdict ?? "—");
}

const categories = computed(() => [...new Set(rows.value.flatMap((row) => (
  row.verdicts.map((item) => String(item.category ?? item.title ?? "")).filter(Boolean)
)))]);

function validateDraft(): string | null {
  const value = numericCandidate.value;
  const config = selectedConfig.value;
  if (value == null) return "Enter a value for the change.";
  if (value < config.min || value > config.max) return `Use a value from ${config.min} to ${config.max} ${config.unit}.`;
  if (config.integer && !Number.isInteger(value)) return `${config.label} must be a whole number.`;
  if (currentValue(selectedChange.value) === value) return "Choose a value that differs from the current strategy.";
  if (!hypothesis.value.trim()) return "Describe what you expect this change to improve.";
  return null;
}

function resetBuilder() {
  candidateValue.value = "";
  hypothesis.value = "";
  nameOverride.value = "";
  weaknessOverride.value = "";
  rationaleOverride.value = "";
}

async function submitVariant() {
  draftError.value = "";
  store.clearError();
  const validationError = validateDraft();
  if (validationError) {
    draftError.value = validationError;
    return;
  }
  const structuredPatch = patch.value;
  if (!structuredPatch) return;
  const created = await store.createVariants([{
    name: nameOverride.value.trim() || defaultName.value,
    hypothesis: hypothesis.value.trim(),
    rationale: rationaleOverride.value.trim() || defaultRationale.value,
    expectedWeaknessAddressed: weaknessOverride.value.trim() || defaultWeakness.value,
    patch: structuredPatch,
  }]);
  if (!created.length) {
    draftError.value = store.error ?? "The variant could not be run.";
    return;
  }
  selected.value = created.at(-1) ?? selected.value;
  resetBuilder();
}

watch(selectedChange, () => {
  candidateValue.value = "";
  draftError.value = "";
});
watch(changeOptions, (options) => {
  if (!options.some((option) => option.value === selectedChange.value)) selectedChange.value = options[0]?.value ?? "maxHoldingDays";
}, { immediate: true });
watch(variantRows, (next) => {
  if (!next.some((item) => item.versionId === selected.value)) selected.value = next[0]?.versionId ?? "";
}, { immediate: true });
onMounted(() => {
  if (store.variants.length) void store.loadComparison();
});
</script>

<template>
  <div v-if="!hasCompletedCourtRecord" class="card empty-state">
    <div>
      <span class="empty-state__icon"><LockKeyhole :size="20" /></span>
      <h3>Variants need a completed Court record</h3>
      <p>Run the confirmed strategy before changing a rule. The original result remains visible beside every attempt.</p>
      <button class="button button--secondary" @click="store.activeTab = 'court'">Open Court <ArrowRight :size="15" /></button>
    </div>
  </div>

  <div v-else class="variant-workspace">
    <section v-if="remainingSlots" class="variant-composer" aria-labelledby="variant-builder-title">
      <header class="composer-heading">
        <div>
          <span class="pill"><span class="pill__dot" />{{ remainingSlots }} {{ remainingSlots === 1 ? "attempt" : "attempts" }} left</span>
          <h2 id="variant-builder-title">Try one change</h2>
          <p>Keep every other rule locked so the result is easy to read.</p>
        </div>
      </header>

      <form class="composer-form" @submit.prevent="submitVariant">
        <div class="change-grid">
          <label class="field" for="variant-change">
            <span>Change</span>
            <FormSelect
              id="variant-change"
              v-model="selectedChange"
              :options="changeOptions"
              aria-label="Strategy setting to change"
            />
          </label>
          <label class="field" for="variant-value">
            <span>New value</span>
            <div class="value-control">
              <input
                id="variant-value"
                v-model="candidateValue"
                class="input"
                type="number"
                inputmode="decimal"
                :min="selectedConfig.min"
                :max="selectedConfig.max"
                :step="selectedConfig.step"
                :placeholder="String(currentValue(selectedChange) ?? selectedConfig.min)"
                aria-describedby="variant-current-value"
              />
              <span aria-hidden="true">{{ selectedConfig.unit }}</span>
            </div>
            <small id="variant-current-value">Current: {{ formatSetting(currentValue(selectedChange)) }}</small>
          </label>
        </div>

        <label class="field expected-field" for="variant-hypothesis">
          <span>Expected outcome</span>
          <textarea
            id="variant-hypothesis"
            v-model="hypothesis"
            class="input"
            maxlength="500"
            placeholder="For example: reduce the longest losing trades without materially lowering return."
          />
        </label>

        <details class="advanced-fields">
          <summary>Advanced</summary>
          <div class="advanced-grid">
            <label class="field" for="variant-name">
              <span>Variant name <small>Optional</small></span>
              <input id="variant-name" v-model="nameOverride" class="input" maxlength="120" :placeholder="defaultName" />
            </label>
            <label class="field" for="variant-weakness">
              <span>Weakness addressed <small>Optional</small></span>
              <input id="variant-weakness" v-model="weaknessOverride" class="input" maxlength="240" :placeholder="defaultWeakness" />
            </label>
            <label class="field advanced-rationale" for="variant-rationale">
              <span>Rationale <small>Optional</small></span>
              <textarea id="variant-rationale" v-model="rationaleOverride" class="input" maxlength="1000" :placeholder="defaultRationale" />
            </label>
            <div class="patch-preview">
              <span>Rule change</span>
              <pre><code>{{ patchPreview }}</code></pre>
            </div>
          </div>
        </details>

        <div class="composer-actions">
          <p v-if="draftError || store.error" role="alert">{{ draftError || store.error }}</p>
          <button class="button" type="submit" :disabled="store.mutating">
            {{ store.mutating ? "Running Court…" : "Run variant" }} <ArrowRight :size="15" />
          </button>
        </div>
      </form>
    </section>

    <section v-if="store.variants.length === 0" class="variant-intro">
      <ShieldAlert :size="18" />
      <p>Each attempt stays in the investigation record, including failed runs.</p>
    </section>

    <section v-else class="variant-results" aria-labelledby="variant-results-title">
      <header class="results-heading">
        <div>
          <p class="eyebrow">{{ comparisonState }}</p>
          <h2 id="variant-results-title">Baseline vs selected variant</h2>
        </div>
        <button
          class="button button--secondary"
          type="button"
          :disabled="store.mutating || !store.probationCandidate"
          :title="probationReason"
          @click="store.startReplay(store.probationCandidate?.id)"
        >
          Start probation <ArrowRight :size="15" />
        </button>
      </header>

      <div v-if="selectedRow" class="selection-row">
        <label class="field" for="variant-result-select">
          <span>Variant</span>
          <FormSelect
            id="variant-result-select"
            v-model="selected"
            :options="variantOptions"
            aria-label="Variant to compare with the baseline"
          />
        </label>
        <div class="selection-context">
          <StatusBadge :status="runFor(selectedRow.versionId)?.status === 'failed' ? 'Fail' : selectedRow.summaryLabel ?? (runFor(selectedRow.versionId)?.status ?? 'Pending')" />
          <span v-if="selectedRow.evaluationInformed"><TriangleAlert :size="13" /> Evaluation-informed</span>
        </div>
      </div>

      <div v-if="selectedRow" class="selected-summary">
        <div class="selected-summary__copy">
          <h3>{{ selectedRow.name }}</h3>
          <p>{{ selectedVersion?.hypothesis || "No expected outcome was recorded." }}</p>
        </div>
        <div class="summary-table-wrap">
          <table aria-label="Baseline and selected variant metrics">
            <thead><tr><th>Measure</th><th>Baseline</th><th>Variant</th></tr></thead>
            <tbody>
              <tr v-for="item in summaryMetrics" :key="item.key">
                <th>{{ item.label }}</th>
                <td>{{ metric(baselineRow, item.key) }}</td>
                <td>{{ metric(selectedRow, item.key) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <details class="analysis-details">
        <summary>
          <span>Full comparison</span>
          <small>All metrics and Court verdicts</small>
        </summary>
        <div v-if="rows.length" class="comparison-table-wrap">
          <table>
            <thead><tr><th>Evidence</th><th v-for="row in rows" :key="row.versionId"><span class="version-head">{{ row.name }}<small>{{ row.summaryLabel ?? runFor(row.versionId)?.status ?? "Pending" }}</small></span></th></tr></thead>
            <tbody>
              <tr><th>Net return</th><td v-for="row in rows" :key="row.versionId">{{ metric(row, "netReturnPercent") }}</td></tr>
              <tr><th>Profit factor</th><td v-for="row in rows" :key="row.versionId">{{ metric(row, "profitFactor") }}</td></tr>
              <tr><th>Max drawdown</th><td v-for="row in rows" :key="row.versionId">{{ metric(row, "maximumDrawdownPercent") }}</td></tr>
              <tr><th>Completed trades</th><td v-for="row in rows" :key="row.versionId">{{ metric(row, "tradeCount") }}</td></tr>
              <tr v-for="category in categories" :key="category"><th>{{ category }}</th><td v-for="row in rows" :key="row.versionId">{{ verdictStatus(row, category) }}</td></tr>
            </tbody>
          </table>
        </div>
        <div v-else class="mini-empty">{{ store.comparisonLoading ? "Loading comparison…" : "The API has not returned a comparison yet." }}</div>
      </details>

      <details v-if="selectedRow" class="analysis-details">
        <summary>
          <span>Exact rule changes</span>
          <small>{{ selectedRow.diffs.length }} {{ selectedRow.diffs.length === 1 ? "change" : "changes" }}</small>
        </summary>
        <div v-if="selectedRow.diffs.length" class="diff-lines">
          <div v-for="diff in selectedRow.diffs" :key="diff.path" class="diff-line">
            <code>{{ diff.path }}</code>
            <span>{{ JSON.stringify(diff.before) }}</span>
            <strong>{{ JSON.stringify(diff.after) }}</strong>
          </div>
        </div>
        <div v-else class="mini-empty">No structured difference was returned.</div>
      </details>

      <p v-if="remainingSlots === 0" class="budget-note"><ShieldAlert :size="14" /> All three attempts are preserved in the record.</p>
    </section>
  </div>
</template>

<style scoped lang="scss">
.variant-workspace{display:grid;width:100%;gap:52px}.variant-composer{width:100%;max-width:none}.composer-heading h2,.results-heading h2{margin:13px 0 0;font-size:34px;letter-spacing:-.045em}.composer-heading p{margin:9px 0 0;color:#8d8d92;font-size:13px}.composer-form{display:grid;gap:22px;margin-top:28px;padding:26px 0;border-top:1px solid rgba(255,255,255,.085);border-bottom:1px solid rgba(255,255,255,.085)}.change-grid{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:14px}.field{display:grid;align-content:start;gap:8px;min-width:0}.field>span,.patch-preview>span{color:#bebec3;font-size:12px;font-weight:600}.field>span small{margin-left:5px;color:#6f6f75;font-size:10px;font-weight:500}.field>small{color:#75757a;font-size:10px}.value-control{position:relative}.value-control .input{width:100%;padding-right:58px}.value-control>span{position:absolute;top:50%;right:14px;color:#77777d;font-size:11px;pointer-events:none;transform:translateY(-50%)}.expected-field textarea{min-height:88px;resize:vertical}.advanced-fields{border-top:1px solid rgba(255,255,255,.065)}.advanced-fields summary,.analysis-details summary{cursor:pointer;list-style-position:outside}.advanced-fields summary{width:max-content;padding-top:17px;color:#9d9da2;font-size:12px;font-weight:600}.advanced-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.advanced-rationale,.patch-preview{grid-column:1/-1}.advanced-rationale textarea{min-height:74px;resize:vertical}.patch-preview{display:grid;gap:8px}.patch-preview pre{min-height:76px;margin:0;padding:14px;border:1px solid #2b2b2d;border-radius:10px;color:#a9a9ae;background:#101011;box-shadow:inset 0 1px 0 rgba(255,255,255,.025);font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}.composer-actions{display:flex;min-height:46px;align-items:center;justify-content:flex-end;gap:18px}.composer-actions p{margin:0;color:#c7a5a0;font-size:11px}.variant-intro{display:flex;align-items:center;gap:10px;padding:18px 0;border-top:1px solid rgba(255,255,255,.075);color:#888;font-size:12px}.variant-intro p{margin:0}.variant-results{display:grid;gap:24px;padding-top:34px;border-top:1px solid rgba(255,255,255,.085)}.results-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}.results-heading h2{font-size:28px}.selection-row{display:flex;align-items:end;justify-content:space-between;gap:18px}.selection-row>.field{width:min(100%,430px)}.selection-context{display:flex;align-items:center;gap:12px;padding-bottom:5px}.selection-context>span{display:flex;align-items:center;gap:6px;color:#85858b;font-size:10px}.selected-summary{display:grid;grid-template-columns:minmax(220px,.55fr) minmax(420px,1fr);gap:42px;padding:24px 0;border-top:1px solid rgba(255,255,255,.07);border-bottom:1px solid rgba(255,255,255,.07)}.selected-summary__copy h3{margin:0;font-size:18px}.selected-summary__copy p{margin:8px 0 0;color:#88888e;font-size:12px;line-height:1.55}.summary-table-wrap,.comparison-table-wrap{min-width:0;overflow-x:auto}.summary-table-wrap table,.comparison-table-wrap table{width:100%;border-collapse:collapse}.summary-table-wrap th,.summary-table-wrap td,.comparison-table-wrap th,.comparison-table-wrap td{padding:11px 12px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;text-align:left}.summary-table-wrap thead th,.comparison-table-wrap thead th{padding-top:0;border-top:0;color:#737378;font-size:10px;font-weight:600}.summary-table-wrap tbody th,.comparison-table-wrap tbody th{color:#929298;font-weight:500}.summary-table-wrap td:last-child{color:#f0f0f2;font-weight:650}.analysis-details{border-top:1px solid rgba(255,255,255,.075)}.analysis-details summary{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:17px 2px;color:#d1d1d4;font-size:13px;font-weight:650}.analysis-details summary small{color:#74747a;font-size:10px;font-weight:500}.comparison-table-wrap{padding:5px 0 14px}.comparison-table-wrap table{min-width:760px}.version-head{display:grid;gap:4px;color:#b8b8bc}.version-head small{color:#6f6f74;font-size:9px}.diff-lines{padding-bottom:14px}.diff-line{display:grid;grid-template-columns:minmax(130px,.6fr) 1fr 1fr;gap:14px;padding:10px 2px;border-top:1px solid rgba(255,255,255,.055);color:#85858b;font:10px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}.diff-line code{color:#d4d4d7}.diff-line strong{color:#efeff1}.mini-empty{padding:22px 0;color:#77777c;font-size:11px}.budget-note{display:flex;align-items:center;gap:8px;margin:0;color:#7f7f84;font-size:11px}
@media(max-width:800px){.variant-workspace{gap:38px}.change-grid,.advanced-grid,.selected-summary{grid-template-columns:1fr}.selected-summary{gap:22px}.results-heading,.selection-row{align-items:stretch;flex-direction:column}.selection-row>.field{width:100%}.selection-context{padding:0}.composer-actions{align-items:stretch;flex-direction:column}.composer-actions .button{width:100%}.diff-line{grid-template-columns:1fr}}
</style>
