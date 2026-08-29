<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Braces, Check, ChevronDown, Clock3, FileCheck2, LockKeyhole, Shield } from "lucide-vue-next";
import FormSelect from "@/components/forms/FormSelect.vue";
import { useCourtStore } from "@/stores/court";
import ManualExpressionField from "./ManualExpressionField.vue";
import type { ConditionNode, StrategyDefinition, ValueExpression } from "@/types";

type ExpressionKind = "" | "source" | "indicator" | "constant";
type Operator = "" | NonNullable<ConditionNode["operator"]>;
interface ManualExpression { kind: ExpressionKind; source: string; indicator: string; period: number | null; constant: number | null }
interface ManualRule { left: ManualExpression; operator: Operator; right: ManualExpression }

const expression = (): ManualExpression => ({ kind: "", source: "", indicator: "", period: null, constant: null });
const rule = (): ManualRule => ({ left: expression(), operator: "", right: expression() });

const store = useCourtStore();
const showJson = ref(false);
const manualError = ref("");
const manual = reactive({
  entry: rule(),
  exit: rule(),
  stopLossPercent: null as number | null,
  takeProfitPercent: null as number | null,
  maxHoldingDays: null as number | null,
});
const operatorOptions: Array<{ value: Operator; label: string }> = [
  { value: "", label: "Choose comparison" },
  { value: "gt", label: "is above" },
  { value: "gte", label: "is at or above" },
  { value: "lt", label: "is below" },
  { value: "lte", label: "is at or below" },
  { value: "eq", label: "equals" },
  { value: "crosses_above", label: "crosses above" },
  { value: "crosses_below", label: "crosses below" },
];
const versionNumber = computed(() => store.activeVersion?.versionNumber ?? ((store.currentCase?.versions.findIndex((item) => item.id === store.activeVersion?.id) ?? 0) + 1));
const definitionJson = computed(() => JSON.stringify(store.activeVersion?.definition, null, 2));
const entryJson = computed(() => JSON.stringify(store.activeVersion?.definition.entry, null, 2));
const exitJson = computed(() => JSON.stringify(store.activeVersion?.definition.exit, null, 2));
const countLeaves = (value: unknown): number => {
  if (!value || typeof value !== "object") return 0;
  const node = value as Record<string, unknown>;
  if (Array.isArray(node.all)) return node.all.reduce((sum, item) => sum + countLeaves(item), 0);
  if (Array.isArray(node.any)) return node.any.reduce((sum, item) => sum + countLeaves(item), 0);
  if (node.not) return countLeaves(node.not);
  return node.left && node.operator && node.right ? 1 : 0;
};
const entryCount = computed(() => countLeaves(store.activeVersion?.definition.entry));
const exitCount = computed(() => countLeaves(store.activeVersion?.definition.exit));

function toExpression(value: ManualExpression): ValueExpression | null {
  if (value.kind === "source" && value.source) return { source: value.source };
  if (value.kind === "constant" && typeof value.constant === "number" && Number.isFinite(value.constant)) return { constant: value.constant };
  if (value.kind === "indicator" && value.indicator && Number.isInteger(value.period) && Number(value.period) >= 1 && Number(value.period) <= 2520) {
    return { indicator: value.indicator, parameters: value.indicator === "atr" ? { period: Number(value.period) } : { period: Number(value.period), source: "close" } };
  }
  return null;
}

function toCondition(value: ManualRule): ConditionNode | null {
  const left = toExpression(value.left);
  const right = toExpression(value.right);
  return left && right && value.operator ? { left, operator: value.operator, right } : null;
}

function setOperator(ruleValue: ManualRule, value: string) {
  ruleValue.operator = value as Operator;
}

function optionalPercent(value: number | null, label: string): number | undefined {
  if (value === null || value === undefined || value === 0) return undefined;
  if (!Number.isFinite(value) || value <= 0 || value > 100) throw new Error(`${label} must be between 0 and 100%.`);
  return value;
}

async function createManualDraft() {
  manualError.value = "";
  const entry = toCondition(manual.entry);
  const exit = toCondition(manual.exit);
  if (!entry || !exit) {
    manualError.value = "Complete both sides and the comparison for entry and exit.";
    return;
  }
  try {
    const maxHoldingDays = manual.maxHoldingDays === null || manual.maxHoldingDays === 0 ? undefined : manual.maxHoldingDays;
    if (maxHoldingDays !== undefined && (!Number.isInteger(maxHoldingDays) || maxHoldingDays < 1 || maxHoldingDays > 2520)) throw new Error("Maximum holding time must be between 1 and 2,520 days.");
    const definition: StrategyDefinition = {
      name: store.currentCase?.name ?? "Manual strategy",
      universe: [...(store.currentCase?.symbols ?? [])],
      timeframe: "1d",
      direction: "long",
      entry,
      exit,
      execution: { signalAt: "close", executeAt: "next_open", orderType: "market" },
      risk: {
        stopLossPercent: optionalPercent(manual.stopLossPercent, "Stop loss"),
        takeProfitPercent: optionalPercent(manual.takeProfitPercent, "Take profit"),
        maxHoldingDays,
      },
      costs: { ...store.caseCosts },
    };
    await store.createDraft(definition, store.currentCase?.description ?? "", "user");
  } catch (issue) {
    manualError.value = issue instanceof Error ? issue.message : "The manual rules are invalid.";
  }
}
</script>

<template>
  <section v-if="!store.activeVersion" class="manual-draft">
    <header class="manual-draft__header">
      <p class="eyebrow">Manual rule setup</p>
      <h2>Structure the rules.</h2>
      <p>Nothing is inferred. Set one entry comparison and one exit comparison for the engine to review.</p>
    </header>

    <div class="case-brief">
      <span>Original brief</span>
      <p>{{ store.currentCase?.description }}</p>
    </div>

    <form class="rule-builder" @submit.prevent="createManualDraft">
      <fieldset v-for="item in [{ id: 'entry', label: 'Entry', value: manual.entry }, { id: 'exit', label: 'Exit', value: manual.exit }]" :key="item.id" class="manual-rule">
        <legend><span>{{ item.label }}</span><small>{{ item.label === "Entry" ? "Open the position when" : "Close the position when" }}</small></legend>
        <div class="manual-rule__grid">
          <ManualExpressionField v-model="item.value.left" :id="`${item.id}-left`" label="Left side" />
          <div class="operator-field">
            <label :for="`${item.id}-operator`">Comparison</label>
            <FormSelect
              :id="`${item.id}-operator`"
              :model-value="item.value.operator"
              :options="operatorOptions"
              @update:model-value="setOperator(item.value, $event)"
            />
          </div>
          <ManualExpressionField v-model="item.value.right" :id="`${item.id}-right`" label="Right side" />
        </div>
      </fieldset>

      <fieldset class="risk-fields">
        <legend>Optional risk limits</legend>
        <label>Stop loss, %<input v-model.number="manual.stopLossPercent" class="input" type="number" min="0.01" max="100" step="0.01" placeholder="None" /></label>
        <label>Take profit, %<input v-model.number="manual.takeProfitPercent" class="input" type="number" min="0.01" max="100" step="0.01" placeholder="None" /></label>
        <label>Maximum holding days<input v-model.number="manual.maxHoldingDays" class="input" type="number" min="1" max="2520" step="1" placeholder="None" /></label>
      </fieldset>

      <div class="manual-draft__footer">
        <div><strong>Fixed execution</strong><span>Daily close signals · next-open market fills · long only · gap risk exits fill at the open</span></div>
        <button class="button" type="submit" :disabled="store.mutating"><Braces :size="15" />{{ store.mutating ? "Creating review draft" : "Create review draft" }}</button>
      </div>
      <p v-if="manualError || store.error" class="manual-error" role="alert">{{ manualError || store.error }}</p>
    </form>

    <p class="manual-limit">Compound entry or exit logic requires a WebMCP-capable browser.</p>
  </section>

  <div v-else class="strategy-stack">
    <section class="approval-card card" :class="{ 'approval-card--confirmed': store.confirmed }">
      <div class="approval-card__top">
        <div class="approval-card__icon"><FileCheck2 :size="21" /></div>
        <div class="approval-card__copy">
          <span class="eyebrow">{{ store.confirmed ? `Immutable version ${versionNumber}` : "Your approval is required" }}</span>
          <h2>{{ store.confirmed ? "Strategy interpretation confirmed" : "Confirm what the engine will test" }}</h2>
          <p>{{ store.activeVersion.interpretation }}</p>
        </div>
        <span class="pill" :class="store.confirmed ? 'pill--pass' : 'pill--warning'"><span class="pill__dot" />{{ store.confirmed ? "Confirmed" : "Draft" }}</span>
      </div>

      <div class="rule-groups"><div class="rule-group rule-group--entry"><span class="rule-group__label"><span class="rule-dot" /> Entry condition tree</span><pre>{{ entryJson }}</pre></div><div class="rule-group rule-group--exit"><span class="rule-group__label"><span class="rule-dot" /> Exit condition tree</span><pre>{{ exitJson }}</pre></div></div>

      <div v-if="!store.confirmed" class="approval-actions">
        <div><LockKeyhole :size="15" /><span>Confirmation creates immutable version 1. Later changes create a new version.</span></div>
        <button class="button" type="button" :disabled="store.mutating" @click="store.confirmStrategy()"><Check :size="16" />{{ store.mutating ? "Confirming" : "Confirm this interpretation" }}</button>
      </div>
    </section>

    <div class="strategy-detail-grid">
      <section class="card">
        <div class="card__header"><div><h3 class="card__title">Execution and risk</h3><p class="card__description">These assumptions are part of the reproducible result.</p></div><Shield :size="17" class="subtle" /></div>
        <div class="detail-list">
          <div><span>Universe</span><strong>{{ store.activeVersion.definition.universe.join(" · ") }}</strong></div>
          <div><span>Direction</span><strong>{{ store.activeVersion.definition.direction }}</strong></div>
          <div><span>Signal timing</span><strong>{{ store.activeVersion.definition.execution.signalAt }}</strong></div>
          <div><span>Normal fill</span><strong>{{ store.activeVersion.definition.execution.executeAt }} · {{ store.activeVersion.definition.execution.orderType }}</strong></div>
          <div><span>Position sizing</span><strong>Equal starting capital per symbol · one open position per symbol</strong></div>
          <div><span>Risk fills</span><strong>Gap beyond a threshold fills at the open · intraday touch fills at the threshold</strong></div>
          <div><span>Same-bar risk priority</span><strong>Stop loss before take profit</strong></div>
          <div><span>Starting capital</span><strong>${{ store.currentCase?.initialCapital.toLocaleString() }}</strong></div>
          <div><span>Transaction costs</span><strong>{{ store.activeVersion.definition.costs.commissionBpsPerSide }} bps commission · {{ store.activeVersion.definition.costs.slippageBpsPerSide }} bps slippage per side</strong></div>
        </div>
      </section>

      <section class="card">
        <button class="definition-toggle" type="button" :aria-expanded="showJson" @click="showJson = !showJson"><span><Braces :size="16" /><span><strong>Structured definition</strong><small>Strict JSON used by the engine</small></span></span><ChevronDown :size="16" :class="{ rotated: showJson }" /></button>
        <div v-if="showJson" class="definition-json"><pre>{{ definitionJson }}</pre></div>
        <div v-else class="definition-summary">
          <div><span>{{ entryCount }}</span> entry conditions</div><div><span>{{ exitCount }}</span> exit conditions</div><div><span>{{ Object.keys(store.activeVersion.definition.risk).length }}</span> risk controls</div><div><Clock3 :size="14" /> {{ store.activeVersion.definition.execution.executeAt }}</div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.manual-draft{display:grid;gap:28px}.manual-draft__header{max-width:720px}.manual-draft__header h2{margin:0;font-size:34px;letter-spacing:-.045em}.manual-draft__header>p:last-child{margin:10px 0 0;color:#8f8f89;font-size:14px;line-height:1.6}.case-brief{display:grid;grid-template-columns:120px 1fr;gap:24px;padding:18px 20px;border:1px solid rgba(255,255,255,.075);border-radius:14px;background:#141414;box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 18px 48px rgba(0,0,0,.2)}.case-brief>span{color:#777;font-size:11px;font-weight:600}.case-brief p{margin:0;color:#c7c7c2;font-size:13px;line-height:1.65}.rule-builder{display:grid;gap:0;border-top:1px solid rgba(255,255,255,.085)}.manual-rule{min-width:0;margin:0;padding:24px 0;border:0;border-bottom:1px solid rgba(255,255,255,.075)}.manual-rule legend{display:flex;align-items:baseline;gap:10px;padding:0}.manual-rule legend span{font-size:16px;font-weight:650}.manual-rule legend small{color:#777;font-size:11px}.manual-rule__grid{display:grid;grid-template-columns:minmax(0,1fr) 190px minmax(0,1fr);align-items:end;gap:12px;margin-top:18px}.operator-field{display:grid;gap:8px}.operator-field label,.risk-fields label{color:#a1a1aa;font-size:11px;font-weight:550}.risk-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;padding:24px 0;border:0;border-bottom:1px solid rgba(255,255,255,.075)}.risk-fields legend{grid-column:1/-1;margin-bottom:4px;padding:0;font-size:14px;font-weight:650}.risk-fields label{display:grid;gap:8px}.manual-draft__footer{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-top:20px}.manual-draft__footer>div{display:grid;gap:4px}.manual-draft__footer strong{font-size:12px}.manual-draft__footer span,.manual-limit{color:#777;font-size:10px}.manual-error{margin:2px 0 0;color:#e4e4e7;font-size:12px}.manual-limit{margin:0}@media(max-width:980px){.manual-rule__grid{grid-template-columns:1fr}.operator-field{max-width:none}.risk-fields{grid-template-columns:1fr 1fr}.risk-fields label:last-child{grid-column:1/-1}}@media(max-width:620px){.case-brief{grid-template-columns:1fr;gap:8px}.risk-fields{grid-template-columns:1fr}.risk-fields label:last-child{grid-column:auto}.manual-draft__footer{align-items:stretch;flex-direction:column}.manual-draft__footer .button{width:100%}}
.strategy-stack{display:grid;gap:14px}.approval-card{overflow:hidden;border-color:#3b3527;background:linear-gradient(145deg,rgba(255,255,255,.06),#111315 45%)}.approval-card--confirmed{border-color:#2c3730;background:linear-gradient(145deg,rgba(255,255,255,.06),#111315 45%)}.approval-card__top{display:grid;grid-template-columns:auto 1fr auto;gap:15px;padding:24px;border-bottom:1px solid #292b29}.approval-card__icon{display:grid;width:42px;height:42px;place-items:center;border:1px solid rgba(255,255,255,.06);border-radius:11px;color:#a1a1aa;background:rgba(255,255,255,.06)}.approval-card--confirmed .approval-card__icon{color:#d4d4d8;border-color:rgba(255,255,255,.06);background:rgba(255,255,255,.06)}.approval-card__copy .eyebrow{margin-bottom:7px}.approval-card__copy h2{margin:0 0 8px;font-size:21px;letter-spacing:-.03em}.approval-card__copy p{max-width:720px;margin:0;color:#9aa09d;font-size:13px;line-height:1.6}.rule-groups{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#252829}.rule-group{padding:22px 24px;background:#111315}.rule-group__label{display:flex;align-items:center;gap:7px;margin-bottom:15px;color:#aeb3b0;font-size:11px;font-weight:600}.rule-dot{width:6px;height:6px;border-radius:50%;background:#d4d4d8}.rule-group--exit .rule-dot{background:#a1a1aa}.rule{display:grid;grid-template-columns:21px 1fr;gap:8px;align-items:start;margin-top:9px}.rule>span{display:grid;height:20px;place-items:center;border:1px solid #303536;border-radius:6px;color:#737976;font:8px "IBM Plex Mono",monospace}.rule p{margin:1px 0;color:#a4aaa7;font-size:11px;line-height:1.55}.rule strong{color:#e0e3e0;font-weight:600}.approval-actions{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:17px 24px;background:#0e1011}.approval-actions>div{display:flex;align-items:center;gap:8px;color:#777d7a;font-size:10px}.strategy-detail-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:14px}.detail-list{padding:5px 20px}.detail-list div{display:grid;grid-template-columns:140px 1fr;gap:20px;padding:13px 2px;border-bottom:1px solid #232627;font-size:11px}.detail-list div:last-child{border:0}.detail-list span{color:#737976}.detail-list strong{color:#bdc2bf;font-weight:500}.definition-toggle{display:flex;width:100%;min-height:76px;align-items:center;justify-content:space-between;padding:18px 20px;border:0;color:#daddda;background:transparent;cursor:pointer}.definition-toggle>span{display:flex;align-items:center;gap:11px;text-align:left}.definition-toggle>span>svg{color:#e4e4e7}.definition-toggle strong,.definition-toggle small{display:block}.definition-toggle strong{font-size:12px}.definition-toggle small{margin-top:4px;color:#747a77;font-size:10px}.definition-toggle>svg{color:#747a77;transition:transform 160ms ease}.definition-toggle>svg.rotated{transform:rotate(180deg)}.definition-json{max-height:400px;overflow:auto;border-top:1px solid #242729;background:#0c0e0f}.definition-json pre{margin:0;padding:19px;color:#a1a1aa;font:10px/1.65 "IBM Plex Mono",monospace;white-space:pre-wrap}.definition-summary{display:grid;grid-template-columns:1fr 1fr;gap:1px;border-top:1px solid #242729;background:#242729}.definition-summary div{display:flex;align-items:center;gap:7px;padding:15px 18px;color:#828885;background:#111315;font-size:10px}.definition-summary span{color:#e4e4e7;font:12px "IBM Plex Mono",monospace}
.rule-group pre{max-height:230px;overflow:auto;margin:0;color:#a1a1aa;font:9px/1.55 "IBM Plex Mono",monospace;white-space:pre-wrap}
@media(max-width:900px){.strategy-detail-grid{grid-template-columns:1fr}.rule-groups{grid-template-columns:1fr}.approval-card__top{grid-template-columns:auto 1fr}.approval-card__top>.pill{grid-column:2}.approval-actions{align-items:flex-start;flex-direction:column}.detail-list div{grid-template-columns:1fr;gap:4px}}
@media(max-width:520px){.approval-card__top{grid-template-columns:1fr}.approval-card__top>.pill{grid-column:1;justify-self:start}.approval-card__icon{display:none}.rule-group{padding:18px}.approval-actions{padding:17px}.definition-summary{grid-template-columns:1fr}}
/* Clean workspace hierarchy */
.strategy-stack{gap:38px}.approval-card{overflow:hidden;padding:0;border:1px solid rgba(255,255,255,.08);border-radius:22px;background:linear-gradient(145deg,rgba(255,255,255,.06),rgba(255,255,255,.022) 48%)}.approval-card--confirmed{border-color:rgba(255,255,255,.06);background:linear-gradient(145deg,rgba(255,255,255,.06),rgba(255,255,255,.02) 48%)}.approval-card__top{gap:17px;padding:30px 30px 25px;border-bottom:0}.approval-card__top>.pill{align-self:start}.approval-card__icon{border:0;border-radius:13px}.approval-card__copy h2{font-size:26px}.approval-card__copy p{color:#a0a09a;font-size:14px}.rule-groups{gap:30px;padding:0 30px 24px;background:transparent}.rule-group{padding:22px 0 0;border-top:1px solid rgba(255,255,255,.075);background:transparent}.rule-group__label{font-size:13px}.rule>span{border:0;background:rgba(255,255,255,.055)}.rule p{color:#aaa9a3;font-size:13px}.approval-actions{padding:18px 30px;border-top:1px solid rgba(255,255,255,.065);background:transparent}.approval-actions>div{font-size:12px}.strategy-detail-grid{gap:46px}.strategy-detail-grid>.card{border-top:1px solid rgba(255,255,255,.09)}.detail-list{padding:4px 0}.detail-list div{padding:14px 0;border-color:rgba(255,255,255,.06);font-size:13px}.definition-toggle{padding-inline:0}.definition-toggle strong{font-size:14px}.definition-toggle small{font-size:11px}.definition-json{border-top-color:rgba(255,255,255,.06);border-radius:12px;background:#111}.definition-json pre{font-size:11px}.definition-summary{gap:0;border-top:1px solid rgba(255,255,255,.06);background:transparent}.definition-summary div{padding-inline:0;background:transparent;font-size:12px}.definition-summary div+div{padding-left:20px;border-left:1px solid rgba(255,255,255,.06)}.rule-group pre{font-size:11px}
@media(max-width:900px){.strategy-detail-grid{gap:28px}.rule-groups{gap:0}.definition-summary div+div{padding-left:0;border-left:0}}@media(max-width:520px){.approval-card__top,.rule-groups,.approval-actions{padding-inline:20px}}
</style>
