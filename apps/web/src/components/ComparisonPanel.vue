<script setup lang="ts">
import { ref } from "vue";
import { ChevronDown } from "lucide-vue-next";
import type { ComparisonVersion } from "@/types";
import { metricDifference, numericMetric } from "@/services/resultPresentation";
import RevealPanel from "@/components/ui/RevealPanel.vue";
const props = defineProps<{
  baseline?: ComparisonVersion;
  variant: ComparisonVersion;
  period?: string;
  baselineLabel?: string;
  variantLabel?: string;
}>();
const expanded = ref<string | null>(null);
const metrics = [
  {
    key: "netReturnPercent",
    label: "Net return",
    detail:
      "Change in portfolio value after configured costs. The difference is in percentage points, not relative percent.",
  },
  {
    key: "maximumDrawdownPercent",
    label: "Max drawdown",
    detail:
      "Largest peak-to-trough loss over the full test window. A smaller drawdown is preferable; the difference alone is not a verdict.",
  },
  {
    key: "profitFactor",
    label: "Profit factor",
    detail:
      "Gross profits divided by gross losses. Undefined values stay unavailable rather than being treated as zero.",
  },
  {
    key: "tradeCount",
    label: "Completed trades",
    detail:
      "Count of closed positions. More trades do not automatically establish robust performance.",
  },
];
function value(row: ComparisonVersion | undefined, key: string) {
  const n = numericMetric(row, key);
  if (n === null) return "Not available";
  return `${key === "netReturnPercent" && n > 0 ? "+" : ""}${n.toLocaleString(undefined, { minimumFractionDigits: key === "tradeCount" ? 0 : key === "profitFactor" ? 2 : 1, maximumFractionDigits: 2 })}${key.endsWith("Percent") ? "%" : ""}`;
}
function bar(row: ComparisonVersion | undefined, key: string) {
  const a = numericMetric(props.baseline, key),
    b = numericMetric(props.variant, key),
    n = numericMetric(row, key);
  if (n === null || a === null || b === null) return null;
  const maximum = Math.max(Math.abs(a), Math.abs(b), 0.01);
  return {
    width: `${(Math.abs(n) / maximum) * 50}%`,
    left: n < 0 ? `${50 - (Math.abs(n) / maximum) * 50}%` : "50%",
  };
}
</script>
<template>
  <section
    class="comparison-panel"
    aria-label="Baseline and selected variant metrics"
  >
    <div class="comparison-panel__head">
      <span>Measure</span><span>{{ baselineLabel || "Baseline" }}</span><span>{{ variantLabel || "Variant" }}</span
      ><span>Difference</span>
    </div>
    <div v-for="item in metrics" :key="item.key" class="comparison-metric">
      <button
        type="button"
        class="comparison-metric__summary"
        :aria-expanded="expanded === item.key"
        :aria-controls="`comparison-${item.key}`"
        @click="expanded = expanded === item.key ? null : item.key"
      >
        <span
          ><ChevronDown
            :size="13"
            :class="{ rotated: expanded === item.key }"
          />{{ item.label }}</span
        ><span class="comparison-value"><small>{{ baselineLabel || 'Baseline' }}</small>{{ value(baseline, item.key) }}</span
        ><strong class="comparison-value"><small>{{ variantLabel || 'Variant' }}</small>{{ value(variant, item.key) }}</strong
        ><span class="comparison-value comparison-difference"><small>Difference</small>{{
          metricDifference(
            numericMetric(baseline, item.key),
            numericMetric(variant, item.key),
            item.key,
          )
        }}</span>
      </button>
      <RevealPanel :id="`comparison-${item.key}`" :open="expanded === item.key"
        ><div class="comparison-explanation">
          <div class="paired-bars" aria-hidden="true">
            <div>
              <span>Baseline</span
              ><i
                ><b
                  v-if="bar(baseline, item.key)"
                  :style="bar(baseline, item.key)!"
              /></i>
            </div>
            <div>
              <span>Variant</span
              ><i
                ><b
                  v-if="bar(variant, item.key)"
                  :style="bar(variant, item.key)!"
              /></i>
            </div>
          </div>
          <p>
            {{ item.detail }}<small v-if="period">Period: {{ period }}</small>
          </p>
        </div></RevealPanel
      >
    </div>
  </section>
</template>
<style scoped>
.comparison-panel {
  min-width: 0;
  padding: 0;
  border-block: 1px solid #303030;
}
.comparison-panel__head,
.comparison-metric__summary {
  display: grid;
  grid-template-columns: minmax(140px, 1.3fr) repeat(3, minmax(100px, 1fr));
  align-items: center;
  gap: 16px;
}
.comparison-panel__head {
  padding: 14px 0;
  color: #8a8a90;
  font-size: 10px;
}
.comparison-panel__head > span:not(:first-child) {
  text-align: right;
}
.comparison-metric {
  border-top: 1px solid #303030;
}
.comparison-metric__summary {
  width: 100%;
  min-height: 60px;
  padding: 12px 0;
  border: 0;
  background: transparent;
  color: #adadb3;
  font-size: 14px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.comparison-metric__summary > span:first-child {
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  color: #ceced2;
}
.comparison-metric__summary strong {
  color: #f3f3f4;
  font-weight: 600;
}
.comparison-metric__summary svg {
  transition: transform var(--duration-control);
}
.rotated {
  transform: rotate(180deg);
}
.comparison-value small { display: none; }
.comparison-difference {
  color: #c9c9ce;
}
.comparison-explanation {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  padding: 0 0 20px;
}
.comparison-explanation p {
  margin: 0;
  color: #a1a1a7;
  font-size: 11px;
  line-height: 1.6;
}
.comparison-explanation small {
  display: block;
  margin-top: 8px;
  color: #77777f;
}
.paired-bars {
  display: grid;
  align-content: center;
  gap: 12px;
}
.paired-bars > div {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 10px;
  align-items: center;
  font-size: 10px;
  color: #8b8b91;
}
.paired-bars i {
  position: relative;
  height: 5px;
  background: #252525;
}
.paired-bars i::after {
  position: absolute;
  left: 50%;
  top: -3px;
  bottom: -3px;
  width: 1px;
  background: #727272;
  content: "";
}
.paired-bars b {
  position: absolute;
  top: 0;
  height: 5px;
  border-radius: 1px;
  background: #757579;
}
.paired-bars > div:last-child b {
  background: #ededee;
}
@media (max-width: 720px) {
  .comparison-panel__head { display: none; }
  .comparison-metric:first-of-type { border-top: 0; }
  .comparison-metric__summary { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px 10px; padding: 18px 0; font-size: 14px; text-align: left; }
  .comparison-metric__summary > span:first-child { grid-column: 1 / -1; font-size: 13px; }
  .comparison-value small { display: block; margin-bottom: 8px; color: #8d8d99; font-size: 10px; font-weight: 450; }
  .comparison-explanation { grid-template-columns: 1fr; gap: 16px; padding: 0 0 22px; }
}
</style>
