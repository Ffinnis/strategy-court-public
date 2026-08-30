<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Braces, Check, ChevronDown, Clock3, LockKeyhole, Shield } from "lucide-vue-next";
import FormSelect from "@/components/forms/FormSelect.vue";
import { useCourtStore } from "@/stores/court";
import ManualExpressionField from "./ManualExpressionField.vue";
import type { ConditionNode, StrategyDefinition, ValueExpression } from "@/types";

type ExpressionKind = "" | "source" | "indicator" | "constant";
type Operator = "" | NonNullable<ConditionNode["operator"]>;
interface ManualExpression { kind: ExpressionKind; source: string; indicator: string; period: number | null; constant: number | null }
interface ManualRule { left: ManualExpression; operator: Operator; right: ManualExpression }
interface RuleRow {
  id: string;
  depth: number;
  kind: "group" | "comparison";
  join?: "if" | "and" | "either" | "or";
  logic?: "all" | "any" | "not";
  label?: string;
  left?: string;
  comparison?: string;
  right?: string;
}

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

const comparisonLabels: Record<string, string> = {
  gt: "is above",
  gte: "is at or above",
  lt: "is below",
  lte: "is at or below",
  eq: "equals",
  crosses_above: "crosses above",
  crosses_below: "crosses below",
};
const sourceLabels: Record<string, string> = {
  open: "Open price",
  high: "High price",
  low: "Low price",
  close: "Close price",
  volume: "Volume",
  hl2: "High-low midpoint",
  hlc3: "Typical price",
  ohlc4: "OHLC average",
};
const indicatorLabels: Record<string, string> = {
  sma: "SMA",
  ema: "EMA",
  wma: "WMA",
  rma: "RMA",
  hma: "HMA",
  vwma: "VWMA",
  dema: "DEMA",
  tema: "TEMA",
  rsi: "RSI",
  macd: "MACD",
  cci: "CCI",
  roc: "Rate of change",
  adx: "ADX",
  atr: "ATR",
  obv: "OBV",
  mfi: "MFI",
  percentage_change: "Percentage change",
};
const parameterLabels: Record<string, string> = {
  atrPeriod: "ATR period",
  fastPeriod: "fast",
  slowPeriod: "slow",
  signalPeriod: "signal",
  smoothK: "K smoothing",
  smoothD: "D smoothing",
  standardDeviations: "standard deviations",
};
const arithmeticLabels: Record<string, string> = {
  add: "plus",
  subtract: "minus",
  multiply: "multiplied by",
  divide: "divided by",
  min: "minimum of",
  max: "maximum of",
};

function titleFromId(value: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) return `Custom indicator ${value.slice(0, 8)}`;
  const words = value.replaceAll("_", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function describeExpression(value?: ValueExpression): string {
  if (!value) return "Unreported value";
  if (typeof value.constant === "number") return value.constant.toLocaleString();
  if (value.source) return sourceLabels[value.source] ?? titleFromId(value.source);
  if (value.indicator) {
    const name = indicatorLabels[value.indicator] ?? titleFromId(value.indicator);
    const parameters = value.parameters ?? {};
    const period = typeof parameters.period === "number" ? parameters.period : undefined;
    const source = typeof parameters.source === "string" ? sourceLabels[parameters.source]?.toLowerCase() ?? titleFromId(parameters.source).toLowerCase() : undefined;
    const remaining = Object.entries(parameters)
      .filter(([key]) => key !== "period" && key !== "source")
      .map(([key, parameter]) => `${parameterLabels[key] ?? titleFromId(key).toLowerCase()} ${String(parameter).replaceAll("_", " ")}`);
    if (period !== undefined && (value.indicator === "percentage_change" || value.indicator === "roc")) {
      return `${period}-day ${name.toLowerCase()}${source ? ` in ${source}` : ""}`;
    }
    const periodLabel = period === undefined ? name : `${name}(${period})`;
    return [periodLabel, source ? `of ${source}` : "", remaining.length ? `· ${remaining.join(", ")}` : ""].filter(Boolean).join(" ");
  }
  if (value.lag) return `${describeExpression(value.lag.value)}, ${value.lag.bars} bars earlier`;
  if (value.absolute) return `Absolute value of ${describeExpression(value.absolute)}`;
  if (value.operation && value.left && value.right) {
    return `${describeExpression(value.left)} ${arithmeticLabels[value.operation] ?? value.operation} ${describeExpression(value.right)}`;
  }
  return "Unreported value";
}

function describeComparisonExpression(value: ValueExpression | undefined, counterpart: ValueExpression | undefined): string {
  if (typeof value?.constant === "number" && (counterpart?.indicator === "percentage_change" || counterpart?.indicator === "roc")) {
    return `${value.constant.toLocaleString()}%`;
  }
  return describeExpression(value);
}

function conditionRows(
  value: ConditionNode | undefined,
  id: string,
  depth = 0,
  join?: RuleRow["join"],
): RuleRow[] {
  if (!value) return [];
  if (Array.isArray(value.all)) {
    return [
      { id, depth, kind: "group", join, logic: "all", label: "Every condition below must be true" },
      ...value.all.flatMap((condition, index) => conditionRows(condition, `${id}-all-${index}`, depth + 1, index === 0 ? "if" : "and")),
    ];
  }
  if (Array.isArray(value.any)) {
    return [
      { id, depth, kind: "group", join, logic: "any", label: "At least one condition below must be true" },
      ...value.any.flatMap((condition, index) => conditionRows(condition, `${id}-any-${index}`, depth + 1, index === 0 ? "either" : "or")),
    ];
  }
  if (value.not) {
    return [
      { id, depth, kind: "group", join, logic: "not", label: "The condition below must be false" },
      ...conditionRows(value.not, `${id}-not`, depth + 1),
    ];
  }
  return [{
    id,
    depth,
    kind: "comparison",
    join,
    left: describeComparisonExpression(value.left, value.right),
    comparison: comparisonLabels[String(value.operator)] ?? "compares with",
    right: describeComparisonExpression(value.right, value.left),
  }];
}

const entryRows = computed(() => conditionRows(store.activeVersion?.definition.entry, "entry"));
const exitRows = computed(() => conditionRows(store.activeVersion?.definition.exit, "exit"));

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
    <section class="strategy-overview" aria-labelledby="strategy-interpretation-title">
      <header class="strategy-overview__header">
        <div class="strategy-overview__copy">
          <span class="eyebrow">{{ store.confirmed ? `Immutable version ${versionNumber}` : "Your approval is required" }}</span>
          <h2 id="strategy-interpretation-title">{{ store.confirmed ? "Strategy interpretation confirmed" : "Confirm what the engine will test" }}</h2>
          <p>{{ store.activeVersion.interpretation }}</p>
        </div>
        <span class="pill" :class="store.confirmed ? 'pill--pass' : 'pill--warning'"><span class="pill__dot" />{{ store.confirmed ? "Confirmed" : "Draft" }}</span>
      </header>

      <div class="rule-ledger" aria-label="Trading rules">
        <section v-for="group in [{ id: 'entry', label: 'Entry', description: 'Open a position when', rows: entryRows, count: entryCount }, { id: 'exit', label: 'Exit', description: 'Close the position when', rows: exitRows, count: exitCount }]" :key="group.id" class="rule-section">
          <header class="rule-section__header">
            <div><h3>{{ group.label }}</h3><p>{{ group.description }}</p></div>
            <span>{{ group.count }} {{ group.count === 1 ? "condition" : "conditions" }}</span>
          </header>
          <div class="condition-tree" role="list">
            <div
              v-for="row in group.rows"
              :key="row.id"
              class="condition-row"
              :class="`condition-row--${row.kind}`"
              :style="{ paddingInlineStart: `${Math.min(row.depth, 4) * 20}px` }"
              role="listitem"
            >
              <div class="condition-row__prefix" aria-hidden="true">
                <span v-if="row.join" class="condition-join">{{ row.join }}</span>
                <span v-if="row.logic" class="condition-logic">{{ row.logic }}</span>
              </div>
              <p v-if="row.kind === 'group'">{{ row.label }}</p>
              <p v-else class="condition-comparison"><strong>{{ row.left }}</strong><span>{{ row.comparison }}</span><strong>{{ row.right }}</strong></p>
            </div>
          </div>
        </section>
      </div>

      <div v-if="!store.confirmed" class="approval-actions">
        <div><LockKeyhole :size="15" /><span>Confirmation locks this version for testing. Later changes create a new version.</span></div>
        <button class="button" type="button" :disabled="store.mutating" @click="store.confirmStrategy()"><Check :size="16" />{{ store.mutating ? "Confirming" : "Confirm this interpretation" }}</button>
      </div>
    </section>

    <div class="strategy-detail-grid">
      <section class="strategy-detail">
        <header class="strategy-detail__header"><div><h3>Execution and risk</h3><p>These assumptions are part of the reproducible result.</p></div><Shield :size="17" class="subtle" /></header>
        <dl class="detail-list">
          <div><dt>Universe</dt><dd>{{ store.activeVersion.definition.universe.join(" · ") }}</dd></div>
          <div><dt>Direction</dt><dd>{{ store.activeVersion.definition.direction }}</dd></div>
          <div><dt>Signal timing</dt><dd>{{ store.activeVersion.definition.execution.signalAt === "close" ? "Daily close" : store.activeVersion.definition.execution.signalAt }}</dd></div>
          <div><dt>Normal fill</dt><dd>{{ store.activeVersion.definition.execution.executeAt === "next_open" ? "Next open" : store.activeVersion.definition.execution.executeAt }} · {{ store.activeVersion.definition.execution.orderType }}</dd></div>
          <div><dt>Position sizing</dt><dd>Equal starting capital per symbol · one open position per symbol</dd></div>
          <div><dt>Risk fills</dt><dd>Gap beyond a threshold fills at the open · intraday touch fills at the threshold</dd></div>
          <div><dt>Same-bar risk priority</dt><dd>Stop loss before take profit</dd></div>
          <div><dt>Starting capital</dt><dd>${{ store.currentCase?.initialCapital.toLocaleString() }}</dd></div>
          <div><dt>Transaction costs</dt><dd>{{ store.activeVersion.definition.costs.commissionBpsPerSide }} bps commission · {{ store.activeVersion.definition.costs.slippageBpsPerSide }} bps slippage per side</dd></div>
        </dl>
      </section>

      <section class="structured-definition">
        <button class="definition-toggle" type="button" :aria-expanded="showJson" @click="showJson = !showJson"><span><Braces :size="16" /><span><strong>Structured definition</strong><small>Strict JSON used by the engine</small></span></span><ChevronDown :size="16" :class="{ rotated: showJson }" /></button>
        <div v-if="showJson" class="definition-json"><pre>{{ definitionJson }}</pre></div>
        <div v-else class="definition-summary">
          <div><span>{{ entryCount }}</span> entry conditions</div><div><span>{{ exitCount }}</span> exit conditions</div><div><span>{{ Object.keys(store.activeVersion.definition.risk).length }}</span> risk controls</div><div><Clock3 :size="14" /> Next-open fills</div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.manual-draft{display:grid;gap:28px}.manual-draft__header{max-width:720px}.manual-draft__header h2{margin:0;font-size:34px;letter-spacing:-.045em}.manual-draft__header>p:last-child{margin:10px 0 0;color:#8f8f89;font-size:14px;line-height:1.6}.case-brief{display:grid;grid-template-columns:120px 1fr;gap:24px;padding:18px 20px;border:1px solid rgba(255,255,255,.075);border-radius:14px;background:#141414;box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 18px 48px rgba(0,0,0,.2)}.case-brief>span{color:#777;font-size:11px;font-weight:600}.case-brief p{margin:0;color:#c7c7c2;font-size:13px;line-height:1.65}.rule-builder{display:grid;gap:0;border-top:1px solid rgba(255,255,255,.085)}.manual-rule{min-width:0;margin:0;padding:24px 0;border:0;border-bottom:1px solid rgba(255,255,255,.075)}.manual-rule legend{display:flex;align-items:baseline;gap:10px;padding:0}.manual-rule legend span{font-size:16px;font-weight:650}.manual-rule legend small{color:#777;font-size:11px}.manual-rule__grid{display:grid;grid-template-columns:minmax(0,1fr) 190px minmax(0,1fr);align-items:end;gap:12px;margin-top:18px}.operator-field{display:grid;gap:8px}.operator-field label,.risk-fields label{color:#a1a1aa;font-size:11px;font-weight:550}.risk-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;padding:24px 0;border:0;border-bottom:1px solid rgba(255,255,255,.075)}.risk-fields legend{grid-column:1/-1;margin-bottom:4px;padding:0;font-size:14px;font-weight:650}.risk-fields label{display:grid;gap:8px}.manual-draft__footer{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-top:20px}.manual-draft__footer>div{display:grid;gap:4px}.manual-draft__footer strong{font-size:12px}.manual-draft__footer span,.manual-limit{color:#777;font-size:10px}.manual-error{margin:2px 0 0;color:#e4e4e7;font-size:12px}.manual-limit{margin:0}@media(max-width:980px){.manual-rule__grid{grid-template-columns:1fr}.operator-field{max-width:none}.risk-fields{grid-template-columns:1fr 1fr}.risk-fields label:last-child{grid-column:1/-1}}@media(max-width:620px){.case-brief{grid-template-columns:1fr;gap:8px}.risk-fields{grid-template-columns:1fr}.risk-fields label:last-child{grid-column:auto}.manual-draft__footer{align-items:stretch;flex-direction:column}.manual-draft__footer .button{width:100%}}
.strategy-stack{display:block}.strategy-overview{border-top:1px solid rgba(255,255,255,.1)}.strategy-overview__header{display:flex;align-items:flex-start;justify-content:space-between;gap:32px;padding:32px 0 28px}.strategy-overview__copy{max-width:820px}.strategy-overview__copy .eyebrow{margin-bottom:8px}.strategy-overview__copy h2{margin:0;font-size:28px;letter-spacing:-.04em}.strategy-overview__copy p{max-width:760px;margin:10px 0 0;color:#a0a09a;font-size:14px;line-height:1.65}.strategy-overview__header>.pill{flex:none;margin-top:1px}.rule-ledger{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid rgba(255,255,255,.085)}.rule-section{min-width:0;padding:28px 32px 30px}.rule-section:first-child{padding-left:0}.rule-section+ .rule-section{padding-right:0;border-left:1px solid rgba(255,255,255,.075)}.rule-section__header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.rule-section__header h3{margin:0;font-size:17px;letter-spacing:-.02em}.rule-section__header p{margin:5px 0 0;color:#7f7f79;font-size:12px}.rule-section__header>span{color:#74746f;font-size:11px}.condition-tree{display:grid;margin-top:23px;border-top:1px solid rgba(255,255,255,.065)}.condition-row{display:grid;grid-template-columns:72px minmax(0,1fr);align-items:center;gap:10px;min-height:44px;padding-block:9px;border-bottom:1px solid rgba(255,255,255,.055)}.condition-row__prefix{display:flex;align-items:center;gap:6px;min-width:0}.condition-join{color:#777772;font-size:11px}.condition-logic{display:inline-flex;min-height:23px;align-items:center;padding:0 7px;border:1px solid #343434;border-radius:7px;color:#c2c2bd;background:#161616;font-size:11px;font-weight:600}.condition-row p{min-width:0;margin:0;color:#a2a29d;font-size:13px;line-height:1.55}.condition-row--group p{color:#8c8c86}.condition-comparison{display:flex;flex-wrap:wrap;gap:4px 6px}.condition-comparison strong{color:#e4e4e1;font-weight:600}.condition-comparison span{color:#888883}.approval-actions{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:20px 0;border-top:1px solid rgba(255,255,255,.085)}.approval-actions>div{display:flex;align-items:center;gap:8px;color:#85857f;font-size:12px}.strategy-detail-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr);border-top:1px solid rgba(255,255,255,.1);border-bottom:1px solid rgba(255,255,255,.1)}.strategy-detail,.structured-definition{min-width:0;padding:30px 32px 32px}.strategy-detail{padding-left:0}.structured-definition{padding-right:0;border-left:1px solid rgba(255,255,255,.075)}.strategy-detail__header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.strategy-detail__header h3{margin:0;font-size:17px;letter-spacing:-.02em}.strategy-detail__header p{margin:5px 0 0;color:#7f7f79;font-size:12px;line-height:1.5}.detail-list{margin:19px 0 0}.detail-list div{display:grid;grid-template-columns:140px minmax(0,1fr);gap:20px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.055);font-size:12px}.detail-list div:last-child{border:0}.detail-list dt{color:#74746f}.detail-list dd{margin:0;color:#c2c2bd;font-weight:500;line-height:1.5}.definition-toggle{display:flex;width:100%;min-height:48px;align-items:center;justify-content:space-between;padding:0;border:0;color:#daddda;background:transparent;cursor:pointer}.definition-toggle>span{display:flex;align-items:center;gap:11px;text-align:left}.definition-toggle>span>svg{color:#d4d4d1}.definition-toggle strong,.definition-toggle small{display:block}.definition-toggle strong{font-size:14px}.definition-toggle small{margin-top:4px;color:#74746f;font-size:11px;font-weight:400}.definition-toggle>svg{color:#74746f;transition:transform 160ms ease}.definition-toggle>svg.rotated{transform:rotate(180deg)}.definition-json{max-height:400px;overflow:auto;margin-top:18px;border-top:1px solid rgba(255,255,255,.065);background:#0d0d0d}.definition-json pre{margin:0;padding:17px 0;color:#a1a1aa;font:11px/1.65 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;white-space:pre-wrap}.definition-summary{display:grid;grid-template-columns:1fr 1fr;margin-top:18px;border-top:1px solid rgba(255,255,255,.065)}.definition-summary div{display:flex;align-items:center;gap:7px;padding:13px 0;color:#82827c;font-size:11px}.definition-summary div:nth-child(even){padding-left:18px;border-left:1px solid rgba(255,255,255,.055)}.definition-summary span{color:#e4e4e1;font-size:12px;font-weight:650}
@media(max-width:900px){.rule-ledger,.strategy-detail-grid{grid-template-columns:1fr}.rule-section{padding-inline:0}.rule-section+ .rule-section{border-top:1px solid rgba(255,255,255,.075);border-left:0}.strategy-detail,.structured-definition{padding-inline:0}.structured-definition{border-top:1px solid rgba(255,255,255,.075);border-left:0}.approval-actions{align-items:flex-start;flex-direction:column}.detail-list div{grid-template-columns:1fr;gap:4px}}
@media(max-width:520px){.strategy-overview__header{align-items:flex-start;flex-direction:column;gap:18px;padding-block:25px}.strategy-overview__copy h2{font-size:24px}.rule-section__header{align-items:flex-end}.condition-row{grid-template-columns:60px minmax(0,1fr)}.approval-actions .button{width:100%}.definition-summary{grid-template-columns:1fr}.definition-summary div:nth-child(even){padding-left:0;border-left:0}.definition-summary div+div{border-top:1px solid rgba(255,255,255,.045)}}
</style>
