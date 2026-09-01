<script setup lang="ts">
import { computed, ref, useId } from "vue";
import type { CurvePoint } from "@/types";

const props = withDefaults(defineProps<{
  equityPoints: CurvePoint[];
  drawdownPoints: CurvePoint[];
  title?: string;
  description?: string;
  drawdownThreshold?: number;
}>(), {
  title: "Court result",
  description: "Strategy equity and benchmark above a synchronized drawdown chart.",
});

interface ChartPoint extends CurvePoint { time: number }

const width = 1000;
const height = 478;
const plotLeft = 72;
const plotRight = 968;
const plotWidth = plotRight - plotLeft;
const equityTop = 34;
const equityBottom = 282;
const drawdownTop = 334;
const drawdownBottom = 420;
const activeTime = ref<number | null>(null);
const chartId = `court-chart-${useId().replace(/[^a-z0-9-]/gi, "")}`;

const parsedTimes = computed(() => [...props.equityPoints, ...props.drawdownPoints]
  .map((point) => Date.parse(point.date))
  .filter(Number.isFinite));
const timeDomain = computed(() => {
  if (parsedTimes.value.length > 1) return { start: Math.min(...parsedTimes.value), end: Math.max(...parsedTimes.value) };
  const pointCount = Math.max(props.equityPoints.length, props.drawdownPoints.length, 2);
  return { start: parsedTimes.value[0] ?? 0, end: (parsedTimes.value[0] ?? 0) + pointCount - 1 };
});
const normalize = (points: CurvePoint[]): ChartPoint[] => points.map((point, index) => {
  const parsed = Date.parse(point.date);
  const ratio = index / Math.max(points.length - 1, 1);
  return {
    ...point,
    time: Number.isFinite(parsed)
      ? parsed
      : timeDomain.value.start + ratio * (timeDomain.value.end - timeDomain.value.start),
  };
}).sort((a, b) => a.time - b.time);
const equitySeries = computed(() => normalize(props.equityPoints));
const drawdownSeries = computed(() => normalize(props.drawdownPoints));
const domainSpan = computed(() => Math.max(timeDomain.value.end - timeDomain.value.start, 1));
const x = (time: number) => plotLeft + ((time - timeDomain.value.start) / domainSpan.value) * plotWidth;

const paddedDomain = (values: number[]) => {
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 1;
  const span = Math.max(maximum - minimum, Math.abs(maximum) * .04, 1);
  return { minimum: minimum - span * .1, maximum: maximum + span * .1 };
};
const equityDomain = computed(() => paddedDomain(equitySeries.value.flatMap((point) =>
  point.benchmark === undefined ? [point.value] : [point.value, point.benchmark])));
const drawdownDomain = computed(() => {
  const values = drawdownSeries.value.map((point) => point.value);
  const minimum = Math.min(0, ...(props.drawdownThreshold ? [-props.drawdownThreshold] : []), ...values);
  const maximum = Math.max(0, ...values);
  const span = Math.max(maximum - minimum, 1);
  return { minimum: minimum - span * .08, maximum: maximum > 0 ? maximum + span * .08 : 0 };
});
const projectY = (value: number, domain: { minimum: number; maximum: number }, top: number, bottom: number) =>
  top + (1 - (value - domain.minimum) / Math.max(domain.maximum - domain.minimum, 1)) * (bottom - top);
const equityY = (value: number) => projectY(value, equityDomain.value, equityTop, equityBottom);
const drawdownY = (value: number) => projectY(value, drawdownDomain.value, drawdownTop, drawdownBottom);

const makePath = (points: ChartPoint[], valueOf: (point: ChartPoint) => number | undefined, y: (value: number) => number) => {
  let segmentOpen = false;
  return points.flatMap((point) => {
    const value = valueOf(point);
    if (value === undefined || !Number.isFinite(value)) {
      segmentOpen = false;
      return [];
    }
    const command = segmentOpen ? "L" : "M";
    segmentOpen = true;
    return `${command}${x(point.time).toFixed(1)} ${y(value).toFixed(1)}`;
  }).join(" ");
};
const equityPath = computed(() => makePath(equitySeries.value, (point) => point.value, equityY));
const benchmarkPath = computed(() => makePath(equitySeries.value, (point) => point.benchmark, equityY));
const drawdownPath = computed(() => makePath(drawdownSeries.value, (point) => point.value, drawdownY));
const drawdownArea = computed(() => {
  const first = drawdownSeries.value[0];
  const last = drawdownSeries.value.at(-1);
  if (!first || !last || !drawdownPath.value) return "";
  const baseline = drawdownY(0).toFixed(1);
  return `M${x(first.time).toFixed(1)} ${baseline} ${drawdownPath.value.replace(/^M/, "L")} L${x(last.time).toFixed(1)} ${baseline} Z`;
});

const equityTicks = computed(() => Array.from({ length: 5 }, (_, index) => {
  const ratio = index / 4;
  const value = equityDomain.value.maximum - ratio * (equityDomain.value.maximum - equityDomain.value.minimum);
  return { value, y: equityTop + ratio * (equityBottom - equityTop) };
}));
const drawdownTicks = computed(() => Array.from({ length: 3 }, (_, index) => {
  const ratio = index / 2;
  const value = drawdownDomain.value.maximum - ratio * (drawdownDomain.value.maximum - drawdownDomain.value.minimum);
  return { value, y: drawdownTop + ratio * (drawdownBottom - drawdownTop) };
}));
const yearTicks = computed(() => {
  if (!parsedTimes.value.length) return [];
  const firstYear = new Date(timeDomain.value.start).getUTCFullYear();
  const lastYear = new Date(timeDomain.value.end).getUTCFullYear();
  const count = Math.min(Math.max(lastYear - firstYear + 1, 2), 5);
  return Array.from({ length: count }, (_, index) => {
    const ratio = index / Math.max(count - 1, 1);
    const year = Math.round(firstYear + (lastYear - firstYear) * ratio);
    return { label: String(year), time: timeDomain.value.start + domainSpan.value * ratio };
  }).filter((tick, index, ticks) => index === 0 || tick.label !== ticks[index - 1]?.label);
});

const changeMarkers = computed(() => equitySeries.value.slice(1).map((point, index) => ({
  time: point.time,
  movement: Math.abs(point.value - (equitySeries.value[index]?.value ?? point.value)),
})).sort((a, b) => b.movement - a.movement).slice(0, 10).sort((a, b) => a.time - b.time));
const hasBenchmark = computed(() => equitySeries.value.some((point) => point.benchmark !== undefined));
const endEquity = computed(() => equitySeries.value.at(-1) ?? null);
const endDrawdown = computed(() => drawdownSeries.value.at(-1) ?? null);
const netPercent = computed(() => {
  const first = equitySeries.value[0]?.value;
  const last = equitySeries.value.at(-1)?.value;
  return first && last !== undefined ? ((last - first) / Math.abs(first)) * 100 : null;
});
const percent = (value: number) => `${value > .004 ? "+" : value < -.004 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;
const netLabel = computed(() => netPercent.value === null ? "" : percent(netPercent.value));
const endingDrawdownLabel = computed(() => endDrawdown.value
  ? `${percent(endDrawdown.value.value)} / ${endDrawdown.value.value < -.004 ? "still open" : "recovered"}`
  : "");
const equityValues = computed(() => equitySeries.value.flatMap((point) => point.benchmark === undefined
  ? [point.value]
  : [point.value, point.benchmark]));
const moneyScale = computed(() => Math.max(0, ...equityValues.value.map(Math.abs)) >= 1000);
const formatEquity = (value: number, compact = false) => {
  if (!moneyScale.value) return value.toLocaleString("en-US", { maximumFractionDigits: compact ? 1 : 2 });
  const sign = value < 0 ? "−" : "";
  const absolute = Math.abs(value);
  if (compact && absolute >= 1_000_000) return `${sign}$${(absolute / 1_000_000).toFixed(1)}m`;
  if (compact && absolute >= 1_000) return `${sign}$${(absolute / 1_000).toFixed(1)}k`;
  return `${sign}$${Math.round(absolute).toLocaleString("en-US")}`;
};

const timeline = computed(() => [...new Set([...equitySeries.value, ...drawdownSeries.value].map((point) => point.time))].sort((a, b) => a - b));
const nearest = (points: ChartPoint[], time: number | null) => time === null || !points.length
  ? null
  : points.reduce((best, point) => Math.abs(point.time - time) < Math.abs(best.time - time) ? point : best);
const hoveredEquity = computed(() => nearest(equitySeries.value, activeTime.value));
const hoveredDrawdown = computed(() => nearest(drawdownSeries.value, activeTime.value));
const activeX = computed(() => activeTime.value === null ? null : x(activeTime.value));
const tooltipWidth = 188;
const tooltipHeight = computed(() => hoveredEquity.value?.benchmark === undefined ? 76 : 96);
const tooltipX = computed(() => activeX.value === null
  ? plotLeft
  : activeX.value + tooltipWidth + 18 < plotRight ? activeX.value + 14 : activeX.value - tooltipWidth - 14);
const dateFormatter = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });
const activeDate = computed(() => {
  const point = hoveredEquity.value ?? hoveredDrawdown.value;
  if (!point) return "";
  const parsed = Date.parse(point.date);
  return Number.isFinite(parsed) ? dateFormatter.format(parsed) : point.date;
});
const hoverSummary = computed(() => hoveredEquity.value && hoveredDrawdown.value
  ? `${activeDate.value}. Equity ${formatEquity(hoveredEquity.value.value)}. Drawdown ${percent(hoveredDrawdown.value.value)}.`
  : "");
const boxX = (pointX: number, boxWidth: number) => pointX + boxWidth + 10 <= plotRight
  ? pointX + 8
  : pointX - boxWidth - 8;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

const onMove = (event: PointerEvent) => {
  if (!timeline.value.length) return;
  const svg = event.currentTarget as SVGSVGElement;
  const bounds = svg.getBoundingClientRect();
  const svgX = ((event.clientX - bounds.left) / bounds.width) * width;
  const ratio = clamp((svgX - plotLeft) / plotWidth, 0, 1);
  const target = timeDomain.value.start + ratio * domainSpan.value;
  activeTime.value = timeline.value.reduce((best, time) => Math.abs(time - target) < Math.abs(best - target) ? time : best);
};
const onKeydown = (event: KeyboardEvent) => {
  if (!timeline.value.length || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const current = activeTime.value === null
    ? timeline.value.length - 1
    : timeline.value.reduce((best, time, index) => Math.abs(time - activeTime.value!) < Math.abs(timeline.value[best]! - activeTime.value!) ? index : best, 0);
  const next = event.key === "Home" ? 0
    : event.key === "End" ? timeline.value.length - 1
      : clamp(current + (event.key === "ArrowLeft" ? -1 : 1), 0, timeline.value.length - 1);
  activeTime.value = timeline.value[next] ?? null;
};
</script>

<template>
  <figure class="court-result-chart">
    <figcaption class="chart-header">
      <div class="chart-title">
        <h3>{{ title }}</h3>
        <div class="chart-legend" aria-label="Series legend">
          <span><i class="legend-line legend-line--solid" />Strategy</span>
          <span v-if="hasBenchmark"><i class="legend-line legend-line--dashed" />Benchmark</span>
        </div>
      </div>
      <div v-if="netLabel" class="net-result"><span>Net</span><strong>{{ netLabel }}</strong></div>
    </figcaption>

    <div class="chart-viewport">
      <svg
        :viewBox="`0 0 ${width} ${height}`"
        role="img"
        tabindex="0"
        focusable="true"
        :aria-labelledby="`${chartId}-title ${chartId}-desc`"
        @pointermove="onMove"
        @pointerleave="activeTime = null"
        @focus="activeTime ??= timeline.at(-1) ?? null"
        @blur="activeTime = null"
        @keydown="onKeydown"
      >
        <title :id="`${chartId}-title`">{{ title }}</title>
        <desc :id="`${chartId}-desc`">{{ description }} Use the left and right arrow keys to inspect aligned values.</desc>

        <defs v-if="drawdownThreshold"><pattern :id="`${chartId}-hatch`" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="6" stroke="#a3a3a9" stroke-width="1" /></pattern><clipPath :id="`${chartId}-breach`"><rect :x="plotLeft" :y="drawdownY(-drawdownThreshold)" :width="plotWidth" :height="Math.max(0,drawdownBottom-drawdownY(-drawdownThreshold))" /></clipPath></defs>
        <g v-for="tick in yearTicks" :key="tick.label">
          <line :x1="x(tick.time)" :x2="x(tick.time)" :y1="equityTop" :y2="drawdownBottom" class="year-grid" />
          <text :x="x(tick.time)" y="454" :text-anchor="tick.time === timeDomain.start ? 'start' : tick.time === timeDomain.end ? 'end' : 'middle'" class="year-label">{{ tick.label }}</text>
        </g>

        <g v-for="tick in equityTicks" :key="`equity-${tick.y}`">
          <line :x1="plotLeft" :x2="plotRight" :y1="tick.y" :y2="tick.y" class="grid-line" />
          <text :x="plotLeft - 12" :y="tick.y + 4" text-anchor="end" class="axis-label">{{ formatEquity(tick.value, true) }}</text>
        </g>
        <text :x="plotLeft" y="20" class="pane-label">Equity</text>

        <path v-if="benchmarkPath" :d="benchmarkPath" class="benchmark-path" />
        <path v-if="equityPath" :d="equityPath" class="equity-path" />
        <g aria-hidden="true">
          <line v-for="marker in changeMarkers" :key="marker.time" :x1="x(marker.time)" :x2="x(marker.time)" :y1="equityBottom + 6" :y2="equityBottom + 13" class="change-tick" />
        </g>

        <g v-for="tick in drawdownTicks" :key="`drawdown-${tick.y}`">
          <line :x1="plotLeft" :x2="plotRight" :y1="tick.y" :y2="tick.y" class="grid-line" />
          <text :x="plotLeft - 12" :y="tick.y + 4" text-anchor="end" class="axis-label">{{ percent(tick.value) }}</text>
        </g>
        <text :x="plotLeft" :y="drawdownTop - 14" class="pane-label">Drawdown</text>
        <path v-if="drawdownArea" :d="drawdownArea" class="drawdown-area" />
        <path v-if="drawdownPath" :d="drawdownPath" class="drawdown-path" />
        <g v-if="drawdownThreshold"><path :d="drawdownArea" :fill="`url(#${chartId}-hatch)`" :clip-path="`url(#${chartId}-breach)`" opacity=".65" /><line :x1="plotLeft" :x2="plotRight" :y1="drawdownY(-drawdownThreshold)" :y2="drawdownY(-drawdownThreshold)" stroke="#9c9ca2" stroke-width="1" stroke-dasharray="4 5" vector-effect="non-scaling-stroke" /><circle :cx="plotRight" :cy="drawdownY(-drawdownThreshold)" r="4" fill="#dedee1" /><text :x="plotRight-9" :y="drawdownY(-drawdownThreshold)-8" text-anchor="end" class="threshold-label">{{ drawdownThreshold }}% drawdown boundary</text></g>

        <g v-if="endEquity && netLabel" class="end-label" :transform="`translate(${boxX(x(endEquity.time), 70)} ${clamp(equityY(endEquity.value) - 13, equityTop, equityBottom - 26)})`">
          <rect width="70" height="26" rx="5" />
          <text x="35" y="17" text-anchor="middle">{{ netLabel }}</text>
        </g>
        <g v-if="endDrawdown && endingDrawdownLabel" class="drawdown-end-label" :transform="`translate(${boxX(x(endDrawdown.time), 152)} ${clamp(drawdownY(endDrawdown.value) - 13, drawdownTop, drawdownBottom - 26)})`">
          <rect width="152" height="26" rx="5" />
          <text x="76" y="17" text-anchor="middle">{{ endingDrawdownLabel }}</text>
        </g>

        <g v-if="activeX !== null" class="hover-layer" aria-hidden="true">
          <line :x1="activeX" :x2="activeX" :y1="equityTop" :y2="drawdownBottom" class="crosshair" />
          <circle v-if="hoveredEquity" :cx="activeX" :cy="equityY(hoveredEquity.value)" r="4" class="hover-dot" />
          <circle v-if="hoveredDrawdown" :cx="activeX" :cy="drawdownY(hoveredDrawdown.value)" r="4" class="hover-dot" />
          <g :transform="`translate(${tooltipX} ${equityTop + 12})`" class="svg-tooltip">
            <rect :width="tooltipWidth" :height="tooltipHeight" rx="8" />
            <text x="13" y="20" class="tooltip-date">{{ activeDate }}</text>
            <text x="13" y="42" class="tooltip-key">Equity</text>
            <text :x="tooltipWidth - 13" y="42" text-anchor="end" class="tooltip-value">{{ hoveredEquity ? formatEquity(hoveredEquity.value) : "—" }}</text>
            <template v-if="hoveredEquity?.benchmark !== undefined">
              <text x="13" y="62" class="tooltip-key">Benchmark</text>
              <text :x="tooltipWidth - 13" y="62" text-anchor="end" class="tooltip-value tooltip-value--muted">{{ formatEquity(hoveredEquity.benchmark) }}</text>
            </template>
            <text x="13" :y="hoveredEquity?.benchmark === undefined ? 62 : 82" class="tooltip-key">Drawdown</text>
            <text :x="tooltipWidth - 13" :y="hoveredEquity?.benchmark === undefined ? 62 : 82" text-anchor="end" class="tooltip-value">{{ hoveredDrawdown ? percent(hoveredDrawdown.value) : "—" }}</text>
          </g>
        </g>
      </svg>
    </div>
    <p v-if="drawdownThreshold" class="threshold-note">Hatching marks drawdown beyond {{ drawdownThreshold }}%. The risk verdict also considers recovery time; this line is not the entire test.</p>
    <p class="sr-only" aria-live="polite">{{ hoverSummary }}</p>
  </figure>
</template>

<style scoped lang="scss">
.threshold-label{fill:#b6b6bd;font:10px Inter,ui-sans-serif,system-ui,sans-serif;}
.threshold-note{margin:0;padding:12px 24px;border-top:1px solid #272727;color:#96969d;font-size:10px;line-height:1.6;}

.court-result-chart{position:relative;isolation:isolate;margin:0;overflow:hidden;border:1px solid #2b2b2b;border-radius:12px;background:#111;box-shadow:inset 0 1px 0 rgba(255,255,255,.045)}
.chart-header{display:flex;min-height:82px;align-items:center;justify-content:space-between;gap:24px;padding:18px 24px;border-bottom:1px solid #252525;background:#131313}.chart-title{display:flex;min-width:0;align-items:center;gap:22px}.chart-title h3{margin:0;color:#f5f5f5;font-size:16px;font-weight:600;letter-spacing:-.02em}.chart-legend{display:flex;align-items:center;gap:15px;color:#7d7d7d;font-size:10px}.chart-legend span{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}.legend-line{display:block;width:21px;height:0;border-top:2px solid #f5f5f5}.legend-line--dashed{border-top:1px dashed #888}.net-result{display:flex;align-items:baseline;gap:9px;white-space:nowrap}.net-result span{color:#858585;font:500 11px Inter,ui-sans-serif,system-ui,sans-serif}.net-result strong{color:#fff;font:600 22px Inter,ui-sans-serif,system-ui,sans-serif;letter-spacing:-.05em}.chart-viewport{overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-color:#3a3a3a transparent;scrollbar-width:thin}.chart-viewport svg{display:block;width:100%;min-width:680px;height:auto;background:#0e0e0e;cursor:crosshair;outline:none}.chart-viewport svg:focus-visible{box-shadow:inset 0 0 0 2px #d8d8d8}.grid-line,.year-grid,.equity-path,.benchmark-path,.drawdown-path,.change-tick,.crosshair{vector-effect:non-scaling-stroke}.grid-line{stroke:#282828;stroke-width:1}.year-grid{stroke:#1f1f1f;stroke-width:1}.axis-label,.year-label{fill:#999;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.axis-label{font-size:10px}.year-label{font-size:11px}.pane-label{fill:#969696;font:550 11px Inter,ui-sans-serif,system-ui,sans-serif}.equity-path{fill:none;stroke:#f7f7f7;stroke-width:2.25;stroke-linecap:round;stroke-linejoin:round}.benchmark-path{fill:none;stroke:#858585;stroke-width:1.4;stroke-dasharray:6 6;stroke-linecap:round;stroke-linejoin:round}.change-tick{stroke:#5c5c5c;stroke-width:1}.drawdown-area{fill:#1c1c1c}.drawdown-path{fill:none;stroke:#bdbdbd;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round}.end-label rect{fill:#f4f4f4}.end-label text{fill:#090909;font:650 11px Inter,ui-sans-serif,system-ui,sans-serif}.drawdown-end-label rect{fill:#252525;stroke:#4b4b4b;stroke-width:1;vector-effect:non-scaling-stroke}.drawdown-end-label text{fill:#d8d8d8;font:550 10px Inter,ui-sans-serif,system-ui,sans-serif}.hover-layer{pointer-events:none}.crosshair{stroke:#727272;stroke-width:1;stroke-dasharray:3 4}.hover-dot{fill:#f6f6f6;stroke:#0d0d0d;stroke-width:2;vector-effect:non-scaling-stroke}.svg-tooltip rect{fill:#090909;stroke:#444;stroke-width:1;vector-effect:non-scaling-stroke;filter:drop-shadow(0 10px 12px rgba(0,0,0,.55))}.svg-tooltip text{font-family:Inter,ui-sans-serif,system-ui,sans-serif}.tooltip-date{fill:#a3a3a3;font-size:10px}.tooltip-key{fill:#707070;font:500 9px Inter,ui-sans-serif,system-ui,sans-serif}.tooltip-value{fill:#f0f0f0;font-size:10px;font-weight:600}.tooltip-value--muted{fill:#aaa}.sr-only{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;padding:0;border:0;clip:rect(0,0,0,0);white-space:nowrap}
@media(max-width:700px){.chart-header{align-items:flex-start;padding:16px 18px}.chart-title{align-items:flex-start;flex-direction:column;gap:9px}.net-result strong{font-size:19px}}
</style>
