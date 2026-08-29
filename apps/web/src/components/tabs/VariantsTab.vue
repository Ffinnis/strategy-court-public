<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ArrowRight, Check, GitCompareArrows, LockKeyhole, Plus, ShieldAlert, Trash2, TriangleAlert } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import StatusBadge from "@/components/StatusBadge.vue";
import type { ComparisonVersion } from "@/types";

const store = useCourtStore();
const selected = ref("");
const hasCompletedCourtRecord = computed(() => store.currentCase?.runs.some((run) => run.status === "completed" && run.result) ?? false);
const rows = computed(() => store.comparison?.versions ?? []);
const variantRows = computed(() => rows.value.filter((item) => item.parentVersionId));
const selectedRow = computed(() => variantRows.value.find((item) => item.versionId === selected.value) ?? variantRows.value[0]);
const selectedVersion = computed(() => store.currentCase?.versions.find((item) => item.id === selectedRow.value?.versionId));
const runFor = (id: string) => store.currentCase?.runs.find((item) => item.versionId === id);
const metric = (row: ComparisonVersion, key: string): string => {
  const value = row.metrics?.[key];
  if (typeof value !== "number") return value == null ? "Pending" : String(value);
  if (key.toLowerCase().includes("percent")) return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
const verdictStatus = (row: ComparisonVersion, category: string) => {
  const verdict = row.verdicts.find((item) => String(item.category ?? item.title ?? "") === category);
  return String(verdict?.status ?? verdict?.verdict ?? "—");
};
const categories = computed(() => [...new Set(rows.value.flatMap((row) => row.verdicts.map((item) => String(item.category ?? item.title ?? "")).filter(Boolean)))]);
const comparisonState = computed(() => store.comparisonLoading ? "Refreshing comparison" : rows.value.length ? `${rows.value.length} versions returned` : "Comparison unavailable");
const probationReason = computed(() => store.probationCandidate ? `Version ${store.probationCandidate.versionNumber} has an eligible completed result.` : "No version has an eligible completed Court result.");
interface VariantDraft { name: string; hypothesis: string; rationale: string; expectedWeaknessAddressed: string; patch: string }
const emptyDraft = (): VariantDraft => ({ name: "", hypothesis: "", rationale: "", expectedWeaknessAddressed: "", patch: "" });
const drafts = ref<VariantDraft[]>([emptyDraft()]);
const draftError = ref("");
const remainingSlots = computed(() => Math.max(0, 3 - store.variants.length));

function addDraft() {
  if (drafts.value.length < remainingSlots.value) drafts.value.push(emptyDraft());
}

function removeDraft(index: number) {
  if (drafts.value.length > 1) drafts.value.splice(index, 1);
}

async function submitDrafts() {
  draftError.value = "";
  try {
    const proposals = drafts.value.map((draft, index) => {
      if (![draft.name, draft.hypothesis, draft.rationale, draft.expectedWeaknessAddressed, draft.patch].every((value) => value.trim())) {
        throw new Error(`Complete every field for variant ${index + 1}.`);
      }
      let patch: unknown;
      try { patch = JSON.parse(draft.patch); }
      catch { throw new Error(`Variant ${index + 1} has invalid patch JSON.`); }
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error(`Variant ${index + 1} patch must be a JSON object.`);
      return {
        name: draft.name.trim(),
        hypothesis: draft.hypothesis.trim(),
        rationale: draft.rationale.trim(),
        expectedWeaknessAddressed: draft.expectedWeaknessAddressed.trim(),
        patch,
      };
    });
    const created = await store.createVariants(proposals);
    if (!created.length) throw new Error(store.error ?? "No variants were created.");
    drafts.value = remainingSlots.value > 0 ? [emptyDraft()] : [];
  } catch (issue) {
    draftError.value = issue instanceof Error ? issue.message : "Could not create the variants.";
  }
}

watch(variantRows, (next) => { if (!next.some((item) => item.versionId === selected.value)) selected.value = next[0]?.versionId ?? ""; }, { immediate: true });
onMounted(() => { if (store.variants.length) void store.loadComparison(); });
</script>

<template>
  <div v-if="!hasCompletedCourtRecord" class="card empty-state"><div><span class="empty-state__icon"><LockKeyhole :size="20" /></span><h3>Variants need a completed Court record</h3><p>Run the confirmed strategy before changing a rule. The original result remains visible beside every attempt.</p><button class="button button--secondary" @click="store.activeTab = 'court'">Open Court <ArrowRight :size="15" /></button></div></div>
  <div v-else class="variant-workspace">
    <section v-if="remainingSlots" class="variant-composer">
      <header class="composer-heading">
        <div><span class="pill"><span class="pill__dot" />{{ remainingSlots }} {{ remainingSlots === 1 ? "attempt" : "attempts" }} left</span><h2>Test a controlled change.</h2></div>
        <button v-if="drafts.length < remainingSlots" class="button button--secondary" type="button" @click="addDraft"><Plus :size="15" />Add variant</button>
      </header>
      <form class="composer-form" @submit.prevent="submitDrafts">
        <fieldset v-for="(draft,index) in drafts" :key="index" class="variant-draft">
          <legend><span>Variant {{ index + 1 }}</span><button v-if="drafts.length > 1" type="button" aria-label="Remove variant" @click="removeDraft(index)"><Trash2 :size="14" /></button></legend>
          <div class="draft-grid">
            <label><span>Name</span><input v-model="draft.name" class="input" maxlength="120" placeholder="Short descriptive name" /></label>
            <label><span>Weakness addressed</span><input v-model="draft.expectedWeaknessAddressed" class="input" maxlength="240" placeholder="Court finding or risk" /></label>
            <label><span>Hypothesis</span><input v-model="draft.hypothesis" class="input" maxlength="500" placeholder="What should improve" /></label>
            <label><span>Rationale</span><input v-model="draft.rationale" class="input" maxlength="1000" placeholder="Why this isolated change is useful" /></label>
            <label class="patch-field"><span>Structured patch</span><textarea v-model="draft.patch" class="input" maxlength="12000" spellcheck="false" placeholder='{"risk":{"maxHoldingDays":12}}' /><small>Accepted keys: name, entry, exit, risk, and costs. The server rejects no-op or invalid strategy changes.</small></label>
          </div>
        </fieldset>
        <div class="composer-actions"><p v-if="draftError || store.error" role="alert">{{ draftError || store.error }}</p><button class="button" type="submit" :disabled="store.mutating || !drafts.length">{{ store.mutating ? "Running the same Court tests" : `Create and run ${drafts.length === 1 ? "variant" : "variants"}` }} <ArrowRight :size="15" /></button></div>
      </form>
    </section>

    <section v-if="store.variants.length === 0" class="variant-intro"><ShieldAlert :size="18" /><p>Every attempt creates an immutable evaluation-informed version. Failed runs stay in the record.</p></section>

    <div v-else class="variant-stack">
    <section class="comparison-lead card"><div><p class="eyebrow">{{ comparisonState }}</p><h2>Comparison reflects the latest API records.</h2><p>{{ probationReason }}</p></div><button class="button" type="button" :disabled="store.mutating || !store.probationCandidate" :title="probationReason" @click="store.startReplay(store.probationCandidate?.id)">{{ store.probationCandidate ? `Move Version ${store.probationCandidate.versionNumber} to probation` : "No eligible probation version" }} <ArrowRight :size="15" /></button></section>
    <section class="variant-cards">
      <button v-for="(row,index) in variantRows" :key="row.versionId" class="variant-card card" :class="{ 'variant-card--selected': selectedRow?.versionId === row.versionId }" type="button" @click="selected = row.versionId">
        <div class="variant-card__top"><span class="variant-letter">{{ index + 1 }}</span><StatusBadge :status="runFor(row.versionId)?.status === 'failed' ? 'Fail' : row.summaryLabel ?? (runFor(row.versionId)?.status ?? 'Pending')" /></div>
        <h3>{{ row.name }}</h3><p>{{ store.currentCase?.versions.find((item) => item.id === row.versionId)?.hypothesis || "No hypothesis returned." }}</p>
        <div class="variant-stats"><span><small>Return</small><strong>{{ metric(row, "netReturnPercent") }}</strong></span><span><small>Drawdown</small><strong>{{ metric(row, "maximumDrawdownPercent") }}</strong></span><span><small>Trades</small><strong>{{ row.tradeCount ?? "Pending" }}</strong></span></div>
        <span v-if="row.evaluationInformed" class="evaluation-label"><TriangleAlert :size="11" /> Evaluation-informed</span>
      </button>
    </section>
    <section class="card comparison-table-card">
      <div class="card__header"><div><h3 class="card__title">Version comparison</h3><p class="card__description">Metrics, verdicts, and pending states are returned by the comparison and run APIs.</p></div><GitCompareArrows :size="17" class="subtle" /></div>
      <div v-if="rows.length" class="comparison-table-wrap"><table><thead><tr><th>Evidence</th><th v-for="row in rows" :key="row.versionId"><span class="version-head">{{ row.name }}<small>{{ row.summaryLabel ?? runFor(row.versionId)?.status ?? "Pending" }}</small></span></th></tr></thead><tbody>
        <tr><th>Net return</th><td v-for="row in rows" :key="row.versionId">{{ metric(row, "netReturnPercent") }}</td></tr>
        <tr><th>Profit factor</th><td v-for="row in rows" :key="row.versionId">{{ metric(row, "profitFactor") }}</td></tr>
        <tr><th>Max drawdown</th><td v-for="row in rows" :key="row.versionId">{{ metric(row, "maximumDrawdownPercent") }}</td></tr>
        <tr><th>Completed trades</th><td v-for="row in rows" :key="row.versionId">{{ row.tradeCount ?? "Pending" }}</td></tr>
        <tr v-for="category in categories" :key="category"><th>{{ category }}</th><td v-for="row in rows" :key="row.versionId">{{ verdictStatus(row, category) }}</td></tr>
      </tbody></table></div><div v-else class="mini-empty">{{ store.comparisonLoading ? "Loading comparison…" : "The API has not returned a comparison yet." }}</div>
    </section>
    <section v-if="selectedRow" class="selected-diff card"><div class="card__header"><div><h3 class="card__title">Exact rule diff · {{ selectedRow.name }}</h3><p class="card__description">{{ selectedVersion?.rationale || "No rationale returned." }}</p></div></div><div v-if="selectedRow.diffs.length" class="diff-lines"><div v-for="diff in selectedRow.diffs" :key="diff.path" class="diff-line"><code>{{ diff.path }}</code><span>before: {{ JSON.stringify(diff.before) }}</span><strong>after: {{ JSON.stringify(diff.after) }}</strong></div></div><div v-else class="mini-empty">No structured diff was returned.</div><div class="integrity-strip"><Check :size="14" /><span>Returned attempts remain visible</span><ShieldAlert :size="14" /><span>Evaluation-informed status preserved</span></div></section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.variants-empty{display:grid;min-height:500px;place-items:center}.hypothesis-brief{max-width:720px;padding:40px}.hypothesis-brief__icon{display:grid;width:51px;height:51px;margin-bottom:23px;place-items:center;border:1px solid #3d4432;border-radius:14px;color:#e4e4e7;background:#151912}.hypothesis-brief h2{margin:0;font-size:27px}.hypothesis-brief>p{color:#929895;line-height:1.6}.contamination-note{display:flex;gap:10px;margin:22px 0;padding:13px;border:1px solid rgba(255,255,255,.06);border-radius:9px;color:#a1a1aa;background:rgba(255,255,255,.06);font-size:10px}.variant-stack{display:grid;gap:14px}.comparison-lead{display:flex;align-items:center;justify-content:space-between;gap:25px;padding:25px}.comparison-lead h2{margin:0;font-size:22px}.comparison-lead p:not(.eyebrow){margin:8px 0 0;color:#8b918e;font-size:11px}.variant-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.variant-card{padding:17px;text-align:left;cursor:pointer}.variant-card--selected{border-color:#556139;background:#141713}.variant-card__top{display:flex;align-items:center;justify-content:space-between}.variant-letter{display:grid;width:28px;height:28px;place-items:center;border:1px solid #363b39;border-radius:8px;color:#e4e4e7;font:10px "IBM Plex Mono",monospace}.variant-card h3{margin:15px 0 6px;font-size:13px}.variant-card>p{min-height:35px;margin:0;color:#7e8481;font-size:10px}.variant-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin-top:15px;border:1px solid #282c2d;border-radius:8px;background:#282c2d}.variant-stats span{display:grid;gap:4px;padding:9px;background:#0f1112}.variant-stats small{color:#686e6b;font-size:7px}.variant-stats strong{font:500 10px "IBM Plex Mono",monospace}.evaluation-label{display:flex;align-items:center;gap:5px;margin-top:11px;color:#a1a1aa;font-size:8px}.comparison-table-card{min-width:0}.comparison-table-wrap{overflow-x:auto}.comparison-table-wrap table{width:100%;min-width:760px;border-collapse:collapse}.comparison-table-wrap th,.comparison-table-wrap td{padding:12px 14px;border-top:1px solid #232627;text-align:left;font-size:10px}.comparison-table-wrap thead th{border-top:0;color:#747a77}.version-head{display:grid;gap:4px;color:#aeb3b0}.version-head small{color:#686e6b}.selected-diff{overflow:hidden}.diff-lines{padding:12px;background:#0c0e0f}.diff-line{display:grid;grid-template-columns:minmax(120px,.5fr) 1fr 1fr;gap:12px;padding:8px;color:#8f9592;font:9px/1.5 "IBM Plex Mono",monospace}.diff-line code{color:#e4e4e7}.diff-line strong{color:#d4d4d8}.integrity-strip{display:flex;gap:8px 18px;padding:12px 16px;border-top:1px solid #252829;color:#777d7a;font-size:9px}.mini-empty{padding:28px;color:#747a77;font-size:11px;text-align:center}
.variant-workspace{display:grid;gap:46px}.variant-composer{display:grid;gap:24px}.composer-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.composer-heading h2{margin:14px 0 0;font-size:34px;letter-spacing:-.045em}.composer-form{display:grid;gap:18px}.variant-draft{min-width:0;margin:0;padding:24px;border:1px solid rgba(255,255,255,.085);border-radius:18px;background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.018));box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 22px 58px rgba(0,0,0,.22)}.variant-draft legend{display:flex;width:100%;align-items:center;justify-content:space-between;padding:0 0 15px;color:#ddd;font-size:13px;font-weight:620}.variant-draft legend button{display:grid;width:30px;height:30px;place-items:center;border:0;border-radius:8px;color:#777;background:#191919;cursor:pointer}.variant-draft legend button:hover{color:#eee}.draft-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.draft-grid label{display:grid;gap:7px}.draft-grid label>span{color:#b8b8bd;font-size:11px}.patch-field{grid-column:1/-1}.patch-field textarea{min-height:112px;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}.patch-field small{color:#69696f;font-size:9px;line-height:1.5}.composer-actions{display:flex;align-items:center;justify-content:flex-end;gap:20px}.composer-actions p{margin:0;color:#c4c4c8;font-size:11px}.variant-intro{display:flex;align-items:center;gap:10px;padding:18px 0;border-top:1px solid rgba(255,255,255,.075);color:#888;font-size:12px}.variant-intro p{margin:0}
@media(max-width:900px){.variant-cards{grid-template-columns:1fr}.comparison-lead{align-items:flex-start;flex-direction:column}}@media(max-width:560px){.hypothesis-brief,.comparison-lead{padding:20px}.diff-line{grid-template-columns:1fr}}
@media(max-width:720px){.draft-grid{grid-template-columns:1fr}.patch-field{grid-column:auto}.composer-heading,.composer-actions{align-items:stretch;flex-direction:column}.composer-actions .button{width:100%}}
/* Clean workspace hierarchy */
.hypothesis-brief{padding:50px;border:1px solid rgba(255,255,255,.08);border-radius:24px;background:radial-gradient(circle at 20% 0,rgba(255,255,255,.06),transparent 45%),rgba(255,255,255,.022)}.hypothesis-brief__icon{border:0;background:rgba(255,255,255,.075)}.hypothesis-brief h2{font-size:34px;letter-spacing:-.045em}.hypothesis-brief>p{font-size:14px}.contamination-note{border:0;border-radius:12px;background:rgba(255,255,255,.06);font-size:12px}.variant-stack{gap:34px}.comparison-lead{padding:0 0 28px;border-bottom:1px solid rgba(255,255,255,.08)}.comparison-lead h2{font-size:27px}.comparison-lead p:not(.eyebrow){font-size:13px}.variant-cards{gap:12px}.variant-card{padding:20px;border-radius:17px;background:rgba(255,255,255,.028)}.variant-card--selected{box-shadow:inset 0 0 0 1px rgba(255,255,255,.32);background:rgba(255,255,255,.045)}.variant-letter{border:0;border-radius:9px;background:rgba(255,255,255,.07)}.variant-card h3{font-size:16px}.variant-card>p{font-size:12px;line-height:1.55}.variant-stats{gap:0;border:0;background:transparent}.variant-stats span{padding:10px 8px;border-left:1px solid rgba(255,255,255,.06);background:transparent}.variant-stats span:first-child{padding-left:0;border-left:0}.variant-stats small{font-size:9px}.variant-stats strong{font-size:12px}.evaluation-label{font-size:10px}.comparison-table-card,.selected-diff{border-top:1px solid rgba(255,255,255,.09)}.comparison-table-wrap th,.comparison-table-wrap td{padding:14px 12px;border-color:rgba(255,255,255,.06);font-size:12px}.diff-lines{padding:13px 0;background:transparent}.diff-line{padding:10px 0;font-size:10px}.integrity-strip{padding-inline:0;border-color:rgba(255,255,255,.06);font-size:11px}
</style>
