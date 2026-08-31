<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesMarker, Time } from "lightweight-charts";
import { ArrowDown, ArrowUp, CandlestickChart, CircleAlert } from "lucide-vue-next";
import FormSelect from "@/components/forms/FormSelect.vue";
import type { MarketEvidence, MarketEvidenceBar, Trade } from "@/types";
import { buildMarketChartSeries, MARKET_TONES } from "@/charts/marketChartData";

const props = withDefaults(defineProps<{
  evidence: MarketEvidence;
  trades?: Trade[];
  loading?: boolean;
  error?: string;
  focus?: { symbol?: string; start: string; end: string; tradeId?: string; revision: number } | null;
}>(), { trades: () => [], loading: false, error: "" });
const emit = defineEmits<{ "select-trade": [id: string] }>();

const chartId = useId();
const chartContainer = ref<HTMLElement | null>(null);
const selectedSymbol = ref("");
const viewMode = ref<"candles" | "line">("candles");
const activeBar = ref<MarketEvidenceBar | null>(null);
const symbols = computed(() => Object.entries(props.evidence)
  .filter(([, bars]) => bars.length > 0)
  .map(([symbol]) => symbol)
  .sort());
const symbolOptions = computed(() => symbols.value.map((symbol) => ({ value: symbol, label: symbol })));

watch(symbols, (next) => {
  if (!next.includes(selectedSymbol.value)) selectedSymbol.value = next[0] ?? "";
}, { immediate: true });

const bars = computed(() => props.evidence[selectedSymbol.value] ?? []);
const seriesData = computed(() => buildMarketChartSeries(bars.value, props.trades, selectedSymbol.value));
const barByDate = computed(() => new Map(seriesData.value.bars.map((bar) => [bar.date.slice(0, 10), bar])));
const selectedTrades = computed(() => props.trades.filter((trade) => trade.symbol === selectedSymbol.value));
const displayBar = computed(() => activeBar.value ?? seriesData.value.bars.at(-1) ?? null);
const isReady = computed(() => !props.loading && !props.error && symbols.value.length > 0);
const adjusted = computed(() => seriesData.value.bars.some((bar) => bar.adjusted));
const rangeLabel = computed(() => {
  const first = seriesData.value.bars[0]?.date;
  const last = seriesData.value.bars.at(-1)?.date;
  return first && last ? `${first} to ${last}` : "No range";
});

const formatPrice = (value: number) => `$${value.toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;
const formatVolume = (value: number) => Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
const formatDate = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
};
const timeKey = (time: Time | undefined): string => {
  if (typeof time === "string") return time.slice(0, 10);
  if (typeof time === "number") return new Date(time * 1_000).toISOString().slice(0, 10);
  return time ? `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}` : "";
};

let chart: IChartApi | null = null;
let candleSeries: ISeriesApi<"Candlestick"> | null = null;
let closeSeries: ISeriesApi<"Area"> | null = null;
let volumeSeries: ISeriesApi<"Histogram"> | null = null;
let updateMarkers: ((markers: SeriesMarker<Time>[]) => void) | null = null;

function applyViewMode(): void {
  candleSeries?.applyOptions({ visible: viewMode.value === "candles" });
  closeSeries?.applyOptions({ visible: viewMode.value === "line" });
}

function showRecent(): void {
  if (!chart) return;
  activeBar.value = seriesData.value.bars.at(-1) ?? null;
  const count = seriesData.value.candles.length;
  if (count <= 252) chart.timeScale().fitContent();
  else chart.timeScale().setVisibleLogicalRange({ from: count - 252, to: count + 8 });
}

function showAll(): void {
  activeBar.value = seriesData.value.bars.at(-1) ?? null;
  chart?.timeScale().fitContent();
}

function focusEvidence(): boolean {
  const focus = props.focus;
  if (!focus || !chart || (focus.symbol && focus.symbol !== selectedSymbol.value)) return false;
  const dates = seriesData.value.bars.map(bar => bar.date);
  const from = dates.findIndex(date => date >= focus.start);
  const last = dates.reduce((found,date,index) => date <= focus.end ? index : found,-1);
  if (from < 0 || last < from) return false;
  activeBar.value = seriesData.value.bars[last] ?? null;
  chart.timeScale().setVisibleLogicalRange({ from: Math.max(-1,from - 5), to: Math.min(dates.length,last + 5) });
  return true;
}

function syncChart(refit = true): void {
  if (!chart || !candleSeries || !closeSeries || !volumeSeries || !updateMarkers) return;
  const data = seriesData.value;
  candleSeries.setData(data.candles);
  closeSeries.setData(data.closes);
  volumeSeries.setData(data.volume);
  updateMarkers(data.markers.map(marker => props.focus?.tradeId && String(marker.id).startsWith(`${props.focus.tradeId}-`)
    ? { ...marker, color: "#d5b77b", size: 1.7 } : marker));
  if (refit) activeBar.value = data.bars.at(-1) ?? null;
  applyViewMode();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const panes = chart?.panes() ?? [];
      panes[0]?.setStretchFactor(4);
      panes[1]?.setStretchFactor(1);
      if (!focusEvidence() && refit) showRecent();
    });
  });
}

function onCrosshairMove(param: MouseEventParams<Time>): void {
  const bar = barByDate.value.get(timeKey(param.time));
  if (bar) activeBar.value = bar;
}

function destroyChart(): void {
  chart?.remove();
  chart = null;
  candleSeries = null;
  closeSeries = null;
  volumeSeries = null;
  updateMarkers = null;
}

async function initializeChart(): Promise<void> {
  if (chart || !isReady.value) return;
  await nextTick();
  if (!chartContainer.value || chart) return;

  chart = createChart(chartContainer.value, {
    autoSize: true,
    height: 520,
    layout: {
      background: { type: ColorType.Solid, color: "#0d0d0d" },
      textColor: "#737373",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: 11,
      attributionLogo: true,
      panes: {
        separatorColor: "rgba(255,255,255,.08)",
        separatorHoverColor: "rgba(255,255,255,.18)",
        enableResize: true,
      },
    },
    grid: {
      vertLines: { color: "rgba(255,255,255,.045)" },
      horzLines: { color: "rgba(255,255,255,.065)" },
    },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: { color: "#686868", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#292929" },
      horzLine: { color: "#686868", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#292929" },
    },
    rightPriceScale: {
      borderColor: "rgba(255,255,255,.10)",
      scaleMargins: { top: .08, bottom: .08 },
    },
    timeScale: {
      borderColor: "rgba(255,255,255,.10)",
      rightOffset: 8,
      barSpacing: 6,
      minBarSpacing: 1,
      timeVisible: false,
      secondsVisible: false,
    },
    localization: {
      dateFormat: "MMM dd, yyyy",
      priceFormatter: formatPrice,
    },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  });

  candleSeries = chart.addSeries(CandlestickSeries, {
    upColor: MARKET_TONES.up,
    downColor: MARKET_TONES.down,
    borderVisible: true,
    borderUpColor: MARKET_TONES.up,
    borderDownColor: MARKET_TONES.down,
    wickUpColor: MARKET_TONES.up,
    wickDownColor: MARKET_TONES.down,
    priceLineColor: "#777",
    priceLineStyle: LineStyle.Dotted,
    lastValueVisible: true,
  });
  closeSeries = chart.addSeries(AreaSeries, {
    lineColor: "#f3f3f3",
    lineWidth: 2,
    topColor: "rgba(238,238,238,.22)",
    bottomColor: "rgba(238,238,238,.015)",
    priceLineColor: "#777",
    priceLineStyle: LineStyle.Dotted,
    lastValueVisible: true,
    visible: false,
  });
  volumeSeries = chart.addSeries(HistogramSeries, {
    priceScaleId: "",
    priceFormat: { type: "custom", minMove: 1, formatter: formatVolume },
    priceLineVisible: false,
    lastValueVisible: false,
  }, 1);
  const candleMarkers = createSeriesMarkers(candleSeries, [], { autoScale: true });
  const lineMarkers = createSeriesMarkers(closeSeries, [], { autoScale: true });
  updateMarkers = (markers) => {
    candleMarkers.setMarkers(markers);
    lineMarkers.setMarkers(markers);
  };
  chart.subscribeCrosshairMove(onCrosshairMove);
  chart.subscribeClick(param => {
    const marker = String(param.hoveredObjectId ?? "");
    const trade = props.trades.find(item => marker === `${item.id}-entry` || marker === `${item.id}-exit`);
    if (trade?.id) emit("select-trade", trade.id);
  });
  chart.subscribeDblClick(showRecent);
  syncChart();
}

watch(isReady, (ready) => {
  if (ready) void initializeChart();
  else destroyChart();
});
watch(seriesData, () => {
  if (chart) syncChart();
  else if (isReady.value) void initializeChart();
});
watch(viewMode, applyViewMode);
watch(() => props.focus, async focus => {
  if (focus?.symbol && symbols.value.includes(focus.symbol)) selectedSymbol.value = focus.symbol;
  await nextTick();
  syncChart(false);
}, { immediate: true });
onMounted(() => void initializeChart());
onBeforeUnmount(destroyChart);
</script>

<template>
  <figure class="market-chart" :aria-labelledby="`${chartId}-title`">
    <figcaption class="market-chart__header">
      <div class="instrument">
        <div class="instrument__title">
          <h2 :id="`${chartId}-title`">{{ selectedSymbol || "Price evidence" }}</h2>
          <span class="chart-badge">Daily</span>
          <span v-if="adjusted" class="chart-badge">Adjusted</span>
        </div>
        <div v-if="displayBar" class="quote-strip" aria-live="polite">
          <span class="quote-date">{{ formatDate(displayBar.date) }}</span>
          <span><i>O</i>{{ formatPrice(displayBar.open) }}</span>
          <span><i>H</i>{{ formatPrice(displayBar.high) }}</span>
          <span><i>L</i>{{ formatPrice(displayBar.low) }}</span>
          <span><i>C</i>{{ formatPrice(displayBar.close) }}</span>
          <span><i>V</i>{{ formatVolume(displayBar.volume) }}</span>
          <span v-if="displayBar.regime" class="regime-badge">{{ displayBar.regime }}</span>
        </div>
      </div>

      <div v-if="symbols.length" class="chart-toolbar">
        <div v-if="symbols.length > 1" class="symbol-control">
          <label class="sr-only" :for="`${chartId}-symbol-select`">Symbol</label>
          <FormSelect
            :id="`${chartId}-symbol-select`"
            v-model="selectedSymbol"
            class="symbol-select"
            :options="symbolOptions"
            aria-label="Symbol"
          />
        </div>
        <div class="view-switch" role="group" aria-label="Chart type">
          <button type="button" :aria-pressed="viewMode === 'candles'" @click="viewMode = 'candles'">Candles</button>
          <button type="button" :aria-pressed="viewMode === 'line'" @click="viewMode = 'line'">Line</button>
        </div>
        <button class="range-button" type="button" @click="showRecent">1 year</button>
        <button class="range-button" type="button" @click="showAll">All</button>
      </div>
    </figcaption>

    <div v-if="loading" class="chart-state" role="status">
      <span class="state-pulse" aria-hidden="true" />
      <strong>Loading market evidence</strong>
    </div>
    <div v-else-if="error" class="chart-state chart-state--error" role="alert">
      <CircleAlert :size="20" aria-hidden="true" />
      <strong>Price evidence is unavailable</strong>
      <p>{{ error }}</p>
    </div>
    <div v-else-if="!symbols.length" class="chart-state">
      <CandlestickChart :size="22" aria-hidden="true" />
      <strong>No market bars attached</strong>
      <p>The run did not return adjusted daily bars.</p>
    </div>

    <template v-else>
      <div class="chart-surface">
        <div
          ref="chartContainer"
          class="chart-canvas"
          role="img"
          tabindex="0"
          :aria-label="`${selectedSymbol} adjusted daily candlestick chart from ${rangeLabel}. Drag to pan and scroll to zoom. Recorded fills are listed below.`"
        />
      </div>
      <footer class="chart-footer">
        <div class="fill-key" aria-label="Fill markers">
          <span><ArrowUp :size="13" aria-hidden="true" />Entry</span>
          <span><ArrowDown :size="13" aria-hidden="true" />Exit</span>
        </div>
        <span>{{ rangeLabel }} · {{ seriesData.bars.length.toLocaleString() }} bars · {{ selectedTrades.length }} trades</span>
        <span class="interaction-hint">Drag to pan · scroll to zoom · double-click to reset</span>
      </footer>
    </template>
  </figure>
</template>

<style scoped lang="scss">
.market-chart{position:relative;isolation:isolate;margin:0;overflow:visible;border:1px solid rgba(255,255,255,.13);border-radius:16px;background:#0d0d0d;box-shadow:inset 0 1px 0 rgba(255,255,255,.055),0 22px 64px rgba(0,0,0,.5)}
.market-chart__header{display:flex;min-height:88px;align-items:center;justify-content:space-between;gap:28px;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.085);border-radius:15px 15px 0 0;background:#121212}.instrument{display:grid;min-width:0;gap:10px}.instrument__title{display:flex;align-items:center;gap:8px}.market-chart h2{margin:0;color:#f4f4f4;font-size:20px;font-weight:620;letter-spacing:-.035em}.chart-badge,.regime-badge{display:inline-flex;min-height:23px;align-items:center;padding:0 8px;border:1px solid #343434;border-radius:999px;color:#929292;background:#181818;font-size:9px;font-weight:550;white-space:nowrap}.regime-badge{color:#bbb}.quote-strip{display:flex;max-width:min(720px,60vw);align-items:center;gap:8px 14px;overflow-x:auto;color:#c7c7c7;font-size:10px;scrollbar-width:none}.quote-strip::-webkit-scrollbar{display:none}.quote-strip span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.quote-strip i{color:#626262;font-style:normal}.quote-date{color:#777!important}
.chart-toolbar{display:flex;align-items:center;gap:7px;white-space:nowrap}.symbol-control{flex:0 0 82px;width:82px}.symbol-select :deep(.form-select__trigger),.view-switch,.range-button{height:34px;min-height:34px;border:1px solid #303030;border-radius:9px;color:#b8b8b8;background:#171717;font:560 10px Inter,ui-sans-serif,system-ui,sans-serif;box-shadow:inset 0 1px rgba(255,255,255,.04),0 7px 18px rgba(0,0,0,.22)}.symbol-select :deep(.form-select__trigger){padding:0 9px 0 10px}.symbol-select :deep(.form-select__value){font-size:10px;font-weight:560}.symbol-select :deep(.form-select__listbox){right:0;left:auto;min-width:110px}.symbol-select :deep(.form-select__option){min-height:34px;font-size:11px}.view-switch{display:flex;overflow:hidden}.view-switch button,.range-button{border:0;color:#777;background:transparent;font:inherit;cursor:pointer}.view-switch button{padding:0 10px;border-right:1px solid #303030}.view-switch button:last-child{border-right:0}.view-switch button[aria-pressed="true"]{color:#111;background:#ededed}.range-button{padding:0 10px;border:1px solid #303030}.range-button:hover,.range-button:focus-visible,.symbol-select :deep(.form-select__trigger:hover:not(:disabled)){color:#eee;border-color:#555;background:#1b1b1b}.view-switch button:focus-visible,.range-button:focus-visible,.symbol-select :deep(.form-select__trigger:focus-visible){position:relative;z-index:1;outline:2px solid #fff;outline-offset:2px}
.chart-state{display:grid;min-height:520px;place-items:center;align-content:center;gap:10px;padding:30px;color:#707070;text-align:center}.chart-state strong{color:#dedede;font-size:16px}.chart-state p{max-width:430px;margin:0;font-size:11px;line-height:1.6}.chart-state--error svg{color:#b9b9b9}.state-pulse{width:18px;height:18px;border:2px solid #333;border-top-color:#eee;border-radius:50%;animation:spin 900ms linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.chart-surface{position:relative;background:#0d0d0d}.chart-canvas{width:100%;height:520px;outline:0}.chart-canvas:focus-visible{box-shadow:inset 0 0 0 2px #e5e5e5}.chart-footer{display:grid;min-height:54px;grid-template-columns:auto 1fr auto;align-items:center;gap:20px;padding:0 20px;border-top:1px solid rgba(255,255,255,.085);border-radius:0 0 15px 15px;color:#707070;background:#111;font-size:9px}.fill-key{display:flex;align-items:center;gap:13px}.fill-key span{display:inline-flex;align-items:center;gap:5px;color:#929292}.fill-key span:first-child svg{color:#eee}.fill-key span:last-child svg{color:#888}.interaction-hint{text-align:right;white-space:nowrap}.sr-only{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;padding:0;border:0;clip:rect(0,0,0,0);white-space:nowrap}
@media(max-width:900px){.market-chart__header{align-items:flex-start;flex-direction:column}.quote-strip{max-width:calc(100vw - 84px)}.chart-toolbar{width:100%;flex-wrap:wrap;padding-bottom:2px}.chart-footer{grid-template-columns:1fr auto}.interaction-hint{display:none}}
@media(max-width:620px){.market-chart{border-radius:16px}.market-chart__header{min-height:auto;padding:16px;border-radius:15px 15px 0 0}.chart-canvas{height:430px}.chart-state{min-height:430px}.chart-footer{grid-template-columns:1fr;gap:8px;padding:13px 16px;border-radius:0 0 15px 15px}.fill-key{order:2}.chart-footer>span{white-space:normal}}
</style>
