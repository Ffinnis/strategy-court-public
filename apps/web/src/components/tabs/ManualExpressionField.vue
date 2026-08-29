<script setup lang="ts">
import FormSelect from "@/components/forms/FormSelect.vue";

type ExpressionKind = "" | "source" | "indicator" | "constant";

interface ManualExpression {
  kind: ExpressionKind;
  source: string;
  indicator: string;
  period: number | null;
  constant: number | null;
}

defineProps<{ id: string; label: string }>();
const model = defineModel<ManualExpression>({ required: true });

const kindOptions = [
  { value: "", label: "Choose input" },
  { value: "source", label: "Market value" },
  { value: "indicator", label: "Indicator" },
  { value: "constant", label: "Number" },
];
const sourceOptions = [
  { value: "", label: "Choose market value" },
  { value: "close", label: "Close" },
  { value: "open", label: "Open" },
  { value: "high", label: "High" },
  { value: "low", label: "Low" },
  { value: "hl2", label: "High-low midpoint" },
  { value: "hlc3", label: "Typical price" },
  { value: "ohlc4", label: "Average price" },
  { value: "volume", label: "Volume" },
];
const indicatorOptions = [
  { value: "", label: "Choose indicator" },
  { value: "sma", label: "Simple moving average" },
  { value: "ema", label: "Exponential moving average" },
  { value: "rsi", label: "RSI" },
  { value: "atr", label: "ATR" },
  { value: "realized_volatility", label: "Realized volatility" },
  { value: "highest", label: "Highest value" },
  { value: "lowest", label: "Lowest value" },
  { value: "rolling_average", label: "Rolling average" },
];

function setKind(value: string) {
  model.value.kind = value as ExpressionKind;
}
</script>

<template>
  <div class="expression-field">
    <label :for="`${id}-kind`">{{ label }}</label>
    <div class="expression-inputs">
      <FormSelect
        :id="`${id}-kind`"
        :model-value="model.kind"
        :options="kindOptions"
        @update:model-value="setKind"
      />

      <FormSelect
        v-if="model.kind === 'source'"
        :id="`${id}-source`"
        v-model="model.source"
        :options="sourceOptions"
        :aria-label="`${label} market value`"
      />

      <template v-else-if="model.kind === 'indicator'">
        <FormSelect
          :id="`${id}-indicator`"
          v-model="model.indicator"
          :options="indicatorOptions"
          :aria-label="`${label} indicator`"
        />
        <input
          :id="`${id}-period`"
          v-model.number="model.period"
          class="input period-input"
          type="number"
          min="1"
          max="2520"
          step="1"
          placeholder="Period"
          :aria-label="`${label} indicator period`"
        />
      </template>

      <input
        v-else-if="model.kind === 'constant'"
        :id="`${id}-constant`"
        v-model.number="model.constant"
        class="input"
        type="number"
        step="any"
        placeholder="Value"
        :aria-label="`${label} number`"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.expression-field{display:grid;min-width:0;gap:8px}.expression-field>label{color:#a1a1aa;font-size:11px;font-weight:550}.expression-inputs{display:grid;grid-template-columns:minmax(130px,.8fr) minmax(150px,1.2fr) 90px;gap:7px}.expression-inputs>:only-child{grid-column:1/-1}.period-input{min-width:0}@media(max-width:720px){.expression-inputs{grid-template-columns:1fr 1fr}.expression-inputs>:first-child{grid-column:1/-1}}@media(max-width:430px){.expression-inputs{grid-template-columns:1fr}.expression-inputs>:first-child{grid-column:auto}}
</style>
