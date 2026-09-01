<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { parseDecisionFields, type DecisionFields, type EvidenceReference } from "@strategy-court/schemas";
import { useCourtStore } from "@/stores/court";
import { investigationGuidance } from "@/services/investigationGuidance";
import FormSelect from "@/components/forms/FormSelect.vue";
import ContextPreview from "@/components/ui/ContextPreview.vue";
import { revealFinding } from "@/services/workspaceNavigation";

const store = useCourtStore();
const editing = ref(false);
const validationError = ref("");
const draftId = ref<string | null>(null);
const predecessorId = ref<string | null>(null);
let requestId = crypto.randomUUID();
const fields = reactive<DecisionFields>({outcome:"needs_more_evidence",rationale:"",evidenceRefs:[],uncertainties:"",revisitCriteria:""});
const guidance = computed(() => investigationGuidance(store.recordedDecision,store.result?.summaryLabel));
const labels = {rejected:"Close this investigation",needs_more_evidence:"Gather more evidence",ready_for_replay:"Continue to replay"};
const canReplay = computed(() => store.eligibleReplayVersions.some(item=>item.id===store.activeVersion?.id));
const outcomeOptions = computed(()=>Object.entries(labels).map(([value,label])=>({value,label,disabled:value==="ready_for_replay" && !canReplay.value})));
const citations = computed(() => [
  ...(store.result?.verdicts ?? []).map(item=>({kind:"verdict" as const,id:item.id,label:item.category})),
  ...(store.result?.failures ?? []).map(item=>({kind:"failure" as const,id:item.id,label:item.title})),
  ...(store.result?.trades ?? []).filter(item=>item.id===store.selectedTrade?.id || fields.evidenceRefs.some(ref=>ref.kind==="trade" && ref.id===item.id))
    .map(item=>({kind:"trade" as const,id:item.id!,label:`${item.symbol}: ${item.entryDate} to ${item.exitDate}`})),
]);
const cited = (reference: EvidenceReference) => fields.evidenceRefs.some(item=>item.kind===reference.kind && item.id===reference.id);
function citationLabel(reference: EvidenceReference) {
  const trade = reference.kind === "trade" ? store.result?.trades.find(item => item.id === reference.id) : null;
  const label = trade ? `${trade.symbol}: ${trade.entryDate} to ${trade.exitDate}`
    : citations.value.find(item => item.kind === reference.kind && item.id === reference.id)?.label ?? reference.id;
  return `${label} · ${reference.kind}`;
}
function citationPreview(reference: EvidenceReference) {
  const context = [{ label: "Version", value: String(store.activeVersion?.versionNumber ?? "Not recorded") }, { label: "Run", value: store.latestRun?.id.slice(0,8) ?? "Not recorded" }];
  if (reference.kind === "verdict") {
    const verdict = store.result?.verdicts.find(item => item.id === reference.id);
    return { description: verdict?.finding, facts: [...context, { label:"Measure", value:verdict?.measure ?? "Not reported" }, { label:"Threshold", value:verdict?.threshold ?? "Not reported" }] };
  }
  if (reference.kind === "failure") {
    const failure = store.result?.failures.find(item => item.id === reference.id);
    return { description: failure?.title, facts: [...context, { label:"Period", value:failure?.period ?? "Not reported" }, { label:"Regime", value:failure?.regime ?? "Not reported" }] };
  }
  const trade = store.result?.trades.find(item => item.id === reference.id);
  return { description: trade ? `${trade.symbol}: ${trade.entryDate} to ${trade.exitDate}` : "Recorded trade", facts: [...context, { label:"Net profit", value:trade ? `$${trade.netProfit.toFixed(2)}` : "Not reported" }, { label:"Exit reason", value:trade?.exitReason ?? "Not reported" }] };
}
function toggleCitation(reference: EvidenceReference) {
  fields.evidenceRefs = cited(reference) ? fields.evidenceRefs.filter(item=>item.kind!==reference.kind || item.id!==reference.id)
    : [...fields.evidenceRefs,{kind:reference.kind,id:reference.id}];
}
function begin() {
  const source = store.decisionDraft ?? store.recordedDecision;
  draftId.value = store.decisionDraft?.id ?? null;
  predecessorId.value = store.recordedDecision?.id ?? null;
  requestId = crypto.randomUUID();
  Object.assign(fields, source ? {outcome:source.outcome,rationale:source.rationale,evidenceRefs:source.evidenceRefs.map(ref=>({kind:ref.kind,id:ref.id})),uncertainties:source.uncertainties,revisitCriteria:source.revisitCriteria}
    : {outcome:"needs_more_evidence",rationale:"",evidenceRefs:[],uncertainties:"",revisitCriteria:""});
  validationError.value=""; editing.value=true;
}
watch(() => store.latestRun?.id,()=>{editing.value=false;draftId.value=null;validationError.value="";},{flush:"sync"});
watch(() => store.decisionDraft?.id,id=>{if(id && !editing.value) begin();},{immediate:true});
async function save(confirm: boolean) {
  validationError.value="";
  let checked: DecisionFields;
  try { checked = parseDecisionFields({...fields,evidenceRefs:fields.evidenceRefs.map(ref=>({...ref}))}); }
  catch(error) {
    validationError.value=error instanceof Error ? error.message : "Review the decision fields.";
    await nextTick();
    const target = !fields.rationale.trim() ? "decision-rationale" : !fields.evidenceRefs.length ? "decision-citations" : !fields.uncertainties.trim() ? "decision-uncertainties" : "decision-revisit";
    document.getElementById(target)?.focus();
    return;
  }
  if (!draftId.value || !confirm) {
    const draft = await store.proposeDecision(checked,requestId);
    if (!draft) return;
    draftId.value=draft.id;
    requestId=crypto.randomUUID();
  }
  if (confirm && draftId.value && await store.confirmDecision(draftId.value,checked,predecessorId.value)) editing.value=false;
}
async function inspect(reference: EvidenceReference) {
  if (reference.kind === "verdict") {
    store.activeTab="court";
    await nextTick();
    revealFinding(reference.id);
    return;
  }
  try {await store.selectEvidence(store.latestRun?.id ?? "",{kind:reference.kind,id:reference.id});} catch { /* Inspector owns retry. */ }
}
</script>

<template>
  <section class="investigation-decision" aria-labelledby="decision-heading">
    <header class="decision-heading">
      <div><h3 id="decision-heading" tabindex="-1">{{ guidance.title }}</h3><p>{{ guidance.detail }}</p></div>
      <button v-if="!editing" type="button" class="button button--secondary" @click="begin">{{ store.recordedDecision ? "Revisit decision" : "Record decision" }}</button>
    </header>
    <div v-if="store.recordedDecision && !editing" class="recorded-decision">
      <p>{{ store.recordedDecision.rationale }}</p>
      <div class="citation-links"><button v-for="reference in store.recordedDecision.evidenceRefs" :key="`${reference.kind}:${reference.id}`" type="button" @click="inspect(reference)">{{ citationLabel(reference) }}</button></div>
      <dl><dt>Remaining uncertainty</dt><dd>{{ store.recordedDecision.uncertainties }}</dd><dt>Revisit when</dt><dd>{{ store.recordedDecision.revisitCriteria }}</dd></dl>
      <small>Confirmed {{ new Date(store.recordedDecision.confirmedAt!).toLocaleString() }}. This decision describes the displayed run.</small>
      <button class="button button--secondary" type="button" @click="store.activeTab='audit'">Activity and report</button>
      <button v-if="store.recordedDecision.outcome === 'ready_for_replay'" class="button button--secondary" type="button" @click="store.activeTab='probation'">Review replay</button>
    </div>
    <form v-if="editing" class="decision-form" @submit.prevent="save(true)">
      <p v-if="store.decisionDraft?.source === 'agent'" class="draft-note" role="status">Your agent proposed this draft. Review the interpretation and citations before confirming.</p>
      <label for="decision-outcome">Investigation outcome<FormSelect id="decision-outcome" v-model="fields.outcome" :options="outcomeOptions" aria-label="Investigation outcome" /></label>
      <label>Why this conclusion?<textarea id="decision-rationale" :aria-invalid="Boolean(validationError && !fields.rationale.trim())" aria-describedby="decision-validation" v-model="fields.rationale" rows="3" maxlength="2000" required /></label>
      <fieldset id="decision-citations" tabindex="-1"><legend>Supporting evidence, choose one to five</legend><div class="citation-options"><div v-for="reference in citations" :key="`${reference.kind}:${reference.id}`" class="citation-choice"><label><input type="checkbox" :checked="cited(reference)" :disabled="!cited(reference) && fields.evidenceRefs.length>=5" @change="toggleCitation(reference)"><span>{{ reference.label }}</span><small>{{ reference.kind }}</small></label><ContextPreview :title="reference.label" v-bind="citationPreview(reference)" action-label="Inspect evidence" @inspect="inspect(reference)" /></div></div></fieldset>
      <label>What remains uncertain?<textarea id="decision-uncertainties" :aria-invalid="Boolean(validationError && !fields.uncertainties.trim())" aria-describedby="decision-validation" v-model="fields.uncertainties" rows="2" maxlength="2000" placeholder="State the evidence limits, or explicitly write None identified." required /></label>
      <label>What would justify revisiting this?<textarea id="decision-revisit" :aria-invalid="Boolean(validationError && !fields.revisitCriteria.trim())" aria-describedby="decision-validation" v-model="fields.revisitCriteria" rows="2" maxlength="2000" required /></label>
      <p class="sharing-note">Confirmation adds this decision to the report, including any existing share link. It does not place orders or start replay.</p>
      <p v-if="validationError || store.decisionError" id="decision-validation" class="decision-error" role="alert">{{ validationError || store.decisionError }}</p>
      <div class="decision-actions"><button class="button" type="submit" :disabled="store.decisionSaving">{{ store.decisionSaving ? "Saving…" : "Confirm decision" }}</button><button class="button button--secondary" type="button" :disabled="store.decisionSaving" @click="save(false)">Save private draft</button><button class="button button--secondary" type="button" :disabled="store.decisionSaving" @click="editing=false">Close editor</button></div>
    </form>
    <details v-if="store.runDecisions.filter(item=>item.state==='confirmed').length>1" class="decision-history"><summary>Earlier decisions remain in the record</summary><ol><li v-for="decision in store.runDecisions.filter(item=>item.state==='confirmed')" :key="decision.id"><strong>{{ labels[decision.outcome] }}</strong><p>{{ decision.rationale }}</p><p>Remaining uncertainty: {{ decision.uncertainties }}</p><p>Revisit when: {{ decision.revisitCriteria }}</p><div class="citation-links"><button v-for="reference in decision.evidenceRefs" :key="`${reference.kind}:${reference.id}`" type="button" @click="inspect(reference)">{{ citationLabel(reference) }}</button></div><small>{{ decision.confirmedAt }}</small></li></ol></details>
  </section>
</template>

<style scoped>
.investigation-decision{margin:24px 0;padding:24px 0;border-top:1px solid var(--line-control,#333);border-bottom:1px solid var(--line-control,#333)}
.decision-heading{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.decision-heading h3{margin:0 0 8px;font-size:19px}.decision-heading p{max-width:740px;margin:0;color:var(--text-secondary,#aaa);font-size:13px;line-height:1.65}
.decision-form{display:grid;gap:18px;max-width:820px;margin-top:24px}.decision-form>label{display:grid;gap:8px;font-size:13px}.decision-form select,.decision-form textarea{width:100%;padding:10px 12px;border:1px solid var(--line-control,#444);border-radius:7px;background:var(--surface-control,#181818);color:var(--text-primary,#eee);font:inherit;line-height:1.6}.decision-form textarea{resize:vertical}.decision-form :focus-visible{outline:2px solid #eee;outline-offset:3px}.decision-form fieldset{border:0;padding:0;margin:0}.decision-form legend{margin-bottom:10px;font-size:13px}.citation-options{display:grid;gap:10px}.citation-choice{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:640px}.citation-options label{display:flex;align-items:center;gap:9px;font-size:13px}.citation-options small{color:var(--text-muted,#999)}.decision-actions,.citation-links{display:flex;flex-wrap:wrap;gap:10px}.draft-note,.sharing-note,.recorded-decision small{color:var(--text-muted,#aaa);font-size:12px;line-height:1.6}.decision-error{color:#d7d7db}.recorded-decision{display:grid;gap:14px;margin-top:18px;font-size:14px;line-height:1.6}.recorded-decision p{margin:0}.recorded-decision dl{margin:0}.recorded-decision dt{font-weight:600}.recorded-decision dd{margin:3px 0 12px;color:var(--text-secondary,#bbb)}.recorded-decision>.button{justify-self:start}.citation-links button{border:0;border-bottom:1px solid #777;background:none;color:inherit;font:inherit;cursor:pointer;text-align:left}.decision-history{margin-top:16px;font-size:13px}.decision-history summary{cursor:pointer}.decision-history li{padding:8px 0}.decision-history p{margin:5px 0}@media(max-width:700px){.decision-heading{display:grid;gap:15px}.decision-heading>.button{justify-self:start}.decision-actions{align-items:stretch;flex-direction:column}}
</style>
