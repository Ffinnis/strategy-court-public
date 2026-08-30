<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { LANDING_MARKET_DATA } from "@/data/syntheticLandingMarket";

const period = ref<"6m" | "1y">("1y");
const activeIndex = ref<number | null>(null);
const keyboardAnnouncement = ref("");
const bars = computed(() => period.value === "6m"
  ? LANDING_MARKET_DATA.filter((bar) => bar[0] >= "2024-07-01")
  : LANDING_MARKET_DATA);
const current = computed(() => bars.value[activeIndex.value ?? bars.value.length - 1]!);
const periodReturn = computed(() => (bars.value.at(-1)![4] / bars.value[0]![4] - 1) * 100);
const plot = ref<HTMLElement | null>(null);
const width = ref(1000);
const height = ref(360);
let resizeObserver: ResizeObserver | undefined;
onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return;
    width.value = entry.contentRect.width;
    height.value = entry.contentRect.height;
  });
  if (plot.value) resizeObserver.observe(plot.value);
});
onBeforeUnmount(() => resizeObserver?.disconnect());
const plotRight = computed(() => width.value - 58);
const plotTop = 18;
const plotBottom = computed(() => height.value - 36);
const extent = computed(() => {
  const low = Math.min(...bars.value.flatMap((bar) => [bar[3], bar[6]]));
  const high = Math.max(...bars.value.map((bar) => bar[2]));
  const padding = (high - low) * 0.09;
  return { low: low - padding, high: high + padding };
});
const x = (index: number) => 6 + (index + 0.5) / bars.value.length * (plotRight.value - 12);
const y = (price: number) => plotBottom.value - (price - extent.value.low) / (extent.value.high - extent.value.low) * (plotBottom.value - plotTop);
const candleWidth = computed(() => Math.max(0.7, (plotRight.value - 12) / bars.value.length * 0.65));
const averagePath = computed(() => bars.value.map((bar, index) => `${index ? "L" : "M"}${x(index)},${y(bar[6])}`).join(" "));
const levels = computed(() => Array.from({ length: 5 }, (_, index) => extent.value.low + (extent.value.high - extent.value.low) * index / 4));
const monthLabels = computed(() => bars.value.flatMap((bar, index) => {
  const firstOfMonth = index === 0 || bar[0].slice(0, 7) !== bars.value[index - 1]![0].slice(0, 7);
  const visibleMonth = period.value === "6m" || Number(bar[0].slice(5, 7)) % 2 === 1;
  return firstOfMonth && visibleMonth ? [{ x: x(index), label: new Date(`${bar[0]}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) }] : [];
}));
const formatPrice = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const formatDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function changePeriod(value: "6m" | "1y") {
  period.value = value;
  activeIndex.value = null;
}
function inspect(event: PointerEvent) {
  if (event.pointerType === "touch") return;
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const chartX = event.clientX - bounds.left;
  activeIndex.value = Math.max(0, Math.min(bars.value.length - 1, Math.round((chartX - 6) / (plotRight.value - 12) * bars.value.length - 0.5)));
}
function step(direction: number) {
  selectBar(Math.max(0, Math.min(bars.value.length - 1, (activeIndex.value ?? bars.value.length - 1) + direction)));
}
function selectBar(index: number) {
  activeIndex.value = index;
  const bar = bars.value[index]!;
  keyboardAnnouncement.value = `${formatDate(bar[0])}. Close ${formatPrice(bar[4])}. 120-day moving average ${formatPrice(bar[6])}.`;
}
</script>

<template>
  <div class="market-preview">
    <div class="market-preview__toolbar">
      <div class="market-preview__quote">
        <strong>{{ formatPrice(bars.at(-1)![4]) }}</strong>
        <span>{{ periodReturn >= 0 ? "+" : "" }}{{ periodReturn.toFixed(2) }}% <span class="market-preview__period">price change</span></span>
      </div>
      <div class="market-preview__ranges" aria-label="Chart time range">
        <button type="button" :aria-pressed="period === '6m'" @click="changePeriod('6m')">6 months</button>
        <button type="button" :aria-pressed="period === '1y'" @click="changePeriod('1y')">1 year</button>
      </div>
    </div>

    <div class="market-preview__readout" aria-label="Synthetic price details">
      <time :datetime="current[0]">{{ formatDate(current[0]) }}</time>
      <span><abbr title="Open">O</abbr> {{ current[1].toFixed(2) }}</span>
      <span><abbr title="High">H</abbr> {{ current[2].toFixed(2) }}</span>
      <span><abbr title="Low">L</abbr> {{ current[3].toFixed(2) }}</span>
      <span><abbr title="Close">C</abbr> {{ current[4].toFixed(2) }}</span>
    </div>

    <div
      ref="plot"
      class="market-preview__plot"
      tabindex="0"
      role="group"
      aria-label="Synthetic QQQ example, not actual market prices. Use left and right arrow keys to inspect generated prices."
      @pointermove="inspect"
      @pointerleave="activeIndex = null"
      @keydown.left.prevent="step(-1)"
      @keydown.right.prevent="step(1)"
      @keydown.home.prevent="selectBar(0)"
      @keydown.end.prevent="selectBar(bars.length - 1)"
      @blur="activeIndex = null"
    >
      <svg :viewBox="`0 0 ${width} ${height}`" role="img" aria-label="Synthetic candlesticks and the 120-day simple moving average in 2024">
        <g v-for="level in levels" :key="level" class="market-preview__grid">
          <line x1="0" :x2="plotRight" :y1="y(level)" :y2="y(level)" />
          <text :x="plotRight + 10" :y="y(level) + 4">${{ level.toFixed(0) }}</text>
        </g>
        <g v-for="(bar, index) in bars" :key="bar[0]" :class="bar[4] >= bar[1] ? 'candle candle--up' : 'candle candle--down'">
          <line :x1="x(index)" :x2="x(index)" :y1="y(bar[2])" :y2="y(bar[3])" />
          <rect :x="x(index) - candleWidth / 2" :y="Math.min(y(bar[1]), y(bar[4]))" :width="candleWidth" :height="Math.max(1, Math.abs(y(bar[1]) - y(bar[4])))" />
        </g>
        <path class="market-preview__average" :d="averagePath" />
        <g v-if="activeIndex !== null" class="market-preview__crosshair">
          <line :x1="x(activeIndex)" :x2="x(activeIndex)" :y1="plotTop" :y2="plotBottom" />
          <circle :cx="x(activeIndex)" :cy="y(current[4])" r="3.5" />
        </g>
        <g class="market-preview__months"><text v-for="month in monthLabels" :key="month.label" :x="month.x" :y="height - 8">{{ month.label }}</text></g>
      </svg>
    </div>
    <span class="market-preview__announcement" role="status" aria-live="polite" aria-atomic="true">{{ keyboardAnnouncement }}</span>
    <div class="market-preview__legend">
      <span><i class="market-preview__key market-preview__key--price" />Daily price</span>
      <span><i class="market-preview__key" />SMA 120 <strong>{{ formatPrice(current[6]) }}</strong></span>
      <span class="market-preview__hint">Hover to inspect</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.market-preview { min-width: 0; padding: 28px 28px 20px; }
.market-preview__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.market-preview__quote { display: flex; align-items: baseline; flex-wrap: wrap; gap: 12px; font-variant-numeric: tabular-nums; }
.market-preview__quote > strong { font-size: 30px; font-weight: 600; letter-spacing: -.045em; }
.market-preview__quote > span { color: #87ae98; font-size: 12px; }
.market-preview__period { margin-left: 3px; color: var(--text-muted); }
.market-preview__ranges { display: flex; gap: 3px; flex-shrink: 0; }
.market-preview__ranges button { min-height: 34px; padding: 0 11px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--text-muted); font-size: 12px; cursor: pointer; }
.market-preview__ranges button:hover { color: var(--text-primary); }
.market-preview__ranges button[aria-pressed="true"] { border-color: var(--line-control); background: #202020; color: var(--text-primary); }
.market-preview__readout { display: flex; min-height: 18px; flex-wrap: wrap; gap: 14px; margin: 12px 0 21px; color: #b8b8bc; font-size: 11px; font-variant-numeric: tabular-nums; }
.market-preview__readout time { min-width: 83px; color: var(--text-muted); }
.market-preview__readout abbr { margin-right: 4px; color: #76767d; text-decoration: none; }
.market-preview__plot { width: 100%; height: 320px; border-radius: 3px; }
.market-preview__plot svg { display: block; width: 100%; height: 100%; overflow: visible; }
.market-preview__grid line { stroke: rgba(255,255,255,.07); stroke-width: 1; vector-effect: non-scaling-stroke; }
.market-preview__grid text,.market-preview__months text { fill: #88888f; font-size: 11px; font-family: inherit; }
.candle line { stroke: currentColor; stroke-width: 1; vector-effect: non-scaling-stroke; }
.candle rect { fill: currentColor; }
.candle--up { color: #8aaf99; }
.candle--down { color: #b37575; }
.market-preview__average { fill: none; stroke: #e0ddd4; stroke-width: 1.7; vector-effect: non-scaling-stroke; }
.market-preview__crosshair line { stroke: #5f5f64; stroke-dasharray: 3 4; stroke-width: 1; vector-effect: non-scaling-stroke; }
.market-preview__crosshair circle { fill: #f1f1f1; stroke: #101010; stroke-width: 2; vector-effect: non-scaling-stroke; }
.market-preview__legend { display: flex; align-items: center; flex-wrap: wrap; gap: 20px; margin-top: 17px; color: #97979e; font-size: 11px; }
.market-preview__legend > span { display: inline-flex; align-items: center; gap: 7px; }
.market-preview__legend strong { color: #c7c7cb; font-weight: 500; font-variant-numeric: tabular-nums; }
.market-preview__key { display: inline-block; width: 14px; height: 2px; background: #e0ddd4; }
.market-preview__key--price { width: 5px; height: 10px; background: #8aaf99; box-shadow: 7px 2px 0 #b37575; margin-right: 7px; }
.market-preview__hint { margin-left: auto; color: #75757b; }
.market-preview__announcement { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
@media (max-width: 760px) {
  .market-preview { padding: 22px 18px 18px; }
  .market-preview__plot { height: 300px; }
  .market-preview__quote > strong { font-size: 27px; }
  .market-preview__quote { gap: 8px; }
  .market-preview__quote > span { font-size: 11px; }
  .market-preview__ranges button { padding: 0 8px; font-size: 11px; }
  .market-preview__hint { display: none; }
}
@media (max-width: 440px) {
  .market-preview__toolbar { align-items: flex-start; gap: 10px; }
  .market-preview__quote { display: grid; gap: 5px; }
  .market-preview__readout { gap: 10px; font-size: 10px; }
  .market-preview__readout span:nth-last-child(2) { display: none; }
  .market-preview__plot { height: 260px; }
  .market-preview__legend { gap: 14px; }
}
</style>
