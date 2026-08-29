<script setup lang="ts">
import { computed, ref } from "vue";
import type { CurvePoint } from "@/types";

const props = withDefaults(defineProps<{
  points: CurvePoint[];
  title: string;
  description: string;
  mode?: "money" | "percent";
  benchmark?: boolean;
  height?: number;
}>(), { mode: "money", benchmark: false, height: 230 });

const width = 900;
const padding = { left: 58, right: 18, top: 18, bottom: 34 };
const hoverIndex = ref<number | null>(null);
const values = computed(() => props.points.flatMap((point) => props.benchmark && point.benchmark !== undefined ? [point.value, point.benchmark] : [point.value]));
const min = computed(() => Math.min(...values.value, 0));
const max = computed(() => Math.max(...values.value, 1));
const span = computed(() => Math.max(max.value - min.value, 1));
const plotWidth = computed(() => width - padding.left - padding.right);
const plotHeight = computed(() => props.height - padding.top - padding.bottom);
const x = (index: number) => padding.left + (index / Math.max(props.points.length - 1, 1)) * plotWidth.value;
const y = (value: number) => padding.top + (1 - (value - min.value) / span.value) * plotHeight.value;
const path = computed(() => props.points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" "));
const benchmarkPath = computed(() => props.points.filter((point) => point.benchmark !== undefined).map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(point.benchmark ?? 0).toFixed(1)}`).join(" "));
const area = computed(() => path.value ? `${path.value} L${x(props.points.length - 1)} ${padding.top + plotHeight.value} L${x(0)} ${padding.top + plotHeight.value} Z` : "");
const ticks = computed(() => [0, .25, .5, .75, 1].map((ratio) => ({ value: max.value - span.value * ratio, y: padding.top + plotHeight.value * ratio })));
const hovered = computed(() => hoverIndex.value === null ? null : props.points[hoverIndex.value]);
const format = (value: number) => props.mode === "money" ? `$${Math.round(value).toLocaleString()}` : `${value.toFixed(1)}%`;
const onMove = (event: MouseEvent) => {
  const svg = event.currentTarget as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  const relative = Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * width - padding.left) / plotWidth.value));
  hoverIndex.value = Math.round(relative * Math.max(props.points.length - 1, 0));
};
</script>

<template>
  <div class="evidence-chart">
    <svg :viewBox="`0 0 ${width} ${height}`" role="img" :aria-labelledby="`${title.replaceAll(' ','-')}-title ${title.replaceAll(' ','-')}-desc`" preserveAspectRatio="none" @mousemove="onMove" @mouseleave="hoverIndex = null">
      <title :id="`${title.replaceAll(' ','-')}-title`">{{ title }}</title>
      <desc :id="`${title.replaceAll(' ','-')}-desc`">{{ description }}</desc>
      <defs><linearGradient :id="`fill-${mode}`" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f4f5" stop-opacity=".12"/><stop offset="1" stop-color="#f4f4f5" stop-opacity="0"/></linearGradient></defs>
      <g v-for="tick in ticks" :key="tick.y"><line :x1="padding.left" :x2="width-padding.right" :y1="tick.y" :y2="tick.y" class="grid-line"/><text x="4" :y="tick.y+4" class="axis-label">{{ format(tick.value) }}</text></g>
      <path v-if="mode === 'money'" :d="area" :fill="`url(#fill-${mode})`" />
      <path v-if="benchmark && benchmarkPath" :d="benchmarkPath" class="benchmark-line" />
      <path :d="path" class="primary-line" />
      <g v-if="hovered && hoverIndex !== null">
        <line :x1="x(hoverIndex)" :x2="x(hoverIndex)" :y1="padding.top" :y2="padding.top+plotHeight" class="hover-line"/>
        <circle :cx="x(hoverIndex)" :cy="y(hovered.value)" r="4" class="hover-point" />
      </g>
      <text :x="padding.left" :y="height-7" class="axis-label">{{ points[0]?.date }}</text>
      <text :x="width-padding.right" :y="height-7" text-anchor="end" class="axis-label">{{ points.at(-1)?.date }}</text>
    </svg>
    <div v-if="hovered" class="chart-tooltip"><span>{{ hovered.date }}</span><strong>{{ format(hovered.value) }}</strong><small v-if="benchmark && hovered.benchmark">Benchmark {{ format(hovered.benchmark) }}</small></div>
  </div>
</template>

<style scoped lang="scss">
.evidence-chart{position:relative;width:100%;min-width:0}.evidence-chart svg{display:block;width:100%;height:auto;min-height:180px;overflow:visible}.grid-line{stroke:#302c27;stroke-width:1;vector-effect:non-scaling-stroke}.axis-label{fill:#777168;font:10px "IBM Plex Mono",monospace}.primary-line{fill:none;stroke:#f4f4f5;stroke-width:2;vector-effect:non-scaling-stroke}.benchmark-line{fill:none;stroke:#736d64;stroke-width:1.25;stroke-dasharray:5 5;vector-effect:non-scaling-stroke}.hover-line{stroke:#655f57;stroke-width:1;stroke-dasharray:3 4;vector-effect:non-scaling-stroke}.hover-point{fill:#f4f4f5;stroke:#090909;stroke-width:2;vector-effect:non-scaling-stroke}.chart-tooltip{position:absolute;top:8px;right:12px;display:grid;min-width:128px;gap:3px;padding:9px 11px;border:1px solid #303036;border-radius:2px;background:rgba(20,18,16,.96);font-size:10px;pointer-events:none}.chart-tooltip span,.chart-tooltip small{color:#8e877e}.chart-tooltip strong{font:500 13px "IBM Plex Mono",monospace}
</style>
