<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Check, Circle, LoaderCircle, ShieldCheck } from "lucide-vue-next";
import type { CourtRun, Verdict } from "@/types";
import { runStages, runStageIndex } from "@/services/resultPresentation";
const props = defineProps<{
  run?: CourtRun;
  verdicts?: Verdict[];
  compact?: boolean;
}>();
const emit = defineEmits<{ inspect: [verdict: Verdict] }>();
const current = computed(() => runStageIndex(props.run));
const running = computed(
  () => props.run?.status === "running" || props.run?.status === "queued",
);
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval>;
onMounted(() => {
  timer = setInterval(() => {
    if (running.value) now.value = Date.now();
  }, 1000);
});
onBeforeUnmount(() => clearInterval(timer));
const elapsed = computed(() => {
  const start = Date.parse(props.run?.createdAt ?? "");
  if (!Number.isFinite(start)) return null;
  const seconds = Math.max(0, Math.floor((now.value - start) / 1000));
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
});
</script>
<template>
  <section
    class="execution-trace"
    :class="{ 'execution-trace--compact': compact }"
    aria-label="Run execution"
  >
    <header>
      <span class="trace-root"><ShieldCheck :size="16" /> Confirmed rules</span
      ><span
        >{{ running ? "Sequential execution" : "Recorded result"
        }}<template v-if="running && elapsed">
          · {{ elapsed }} elapsed</template
        ></span
      >
    </header>
    <ol class="execution-path">
      <li
        v-for="(stage, index) in runStages"
        :key="stage.id"
        :class="{
          complete: current > index || run?.status === 'completed',
          active: current === index && running,
        }"
      >
        <span class="execution-node"
          ><Check
            v-if="current > index || run?.status === 'completed'"
            :size="14" /><LoaderCircle
            v-else-if="current === index && running"
            :size="14" /><Circle v-else :size="9"
        /></span>
        <div>
          <strong>{{ stage.label }}</strong
          ><small v-if="!compact">{{ stage.detail }}</small>
        </div>
      </li>
    </ol>
    <p v-if="running && current < 0" role="status">
      {{ run?.stage || "Waiting for the server to report a stage." }}
    </p>
    <p v-if="running && run?.stage === 'market_data'">
      The provider may take a moment. You can keep exploring; the run continues.
    </p>
    <div v-if="verdicts?.length && !compact" class="verdict-fanout">
      <svg viewBox="0 0 1000 64" preserveAspectRatio="none" aria-hidden="true">
        <path
          v-for="(_, index) in verdicts"
          :key="index"
          :d="`M500 0 C500 32 ${((index + 0.5) * 1000) / verdicts.length} 22 ${((index + 0.5) * 1000) / verdicts.length} 64`"
        />
      </svg>
      <div :style="{ '--checks': verdicts.length }">
        <button
          v-for="(verdict, index) in verdicts"
          :key="verdict.id"
          type="button"
          @click="emit('inspect', verdict)"
        >
          <span class="fanout-node" :data-status="verdict.status">{{
            String(index + 1).padStart(2, "0")
          }}</span
          ><strong>{{ verdict.category }}</strong
          ><small>{{ verdict.status }}</small>
        </button>
      </div>
    </div>
  </section>
</template>
<style scoped>
.execution-trace {
  padding: 24px 0;
  border-block: 1px solid var(--line-subtle);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  color: #85858a;
  font-size: 11px;
}
.trace-root {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #d7d7da;
}
.execution-path {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  list-style: none;
  margin: 28px 0 0;
  padding: 0;
  gap: 20px;
}
.execution-path li {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 11px;
  color: #6b6b70;
}
.execution-path li:not(:last-child)::after {
  position: absolute;
  top: 14px;
  left: 38px;
  right: -10px;
  height: 1px;
  background: #2d2d2d;
  content: "";
  z-index: 0;
}
.execution-node {
  display: grid;
  position: relative;
  z-index: 1;
  flex: 0 0 29px;
  width: 29px;
  height: 29px;
  place-items: center;
  border: 1px solid #333;
  border-radius: 9px;
  background: #111;
}
.execution-path li > div {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 8px;
  padding: 7px 10px 0 0;
  background: var(--surface-page);
}
.execution-path strong {
  font-size: 12px;
  font-weight: 550;
}
.execution-path small {
  max-width: 180px;
  color: #808086;
  font-size: 10px;
  line-height: 1.5;
}
.execution-path .complete,
.execution-path .active {
  color: #d8d8da;
}
.complete .execution-node {
  border-color: #626262;
  background: #222;
}
.active .execution-node {
  border-color: #aaa;
  color: #fff;
}
.active svg {
  animation: trace-spin 1.2s linear infinite;
}
@keyframes trace-spin {
  to {
    transform: rotate(360deg);
  }
}
.execution-trace > p {
  color: #909095;
  font-size: 12px;
  line-height: 1.6;
}
.verdict-fanout svg {
  display: block;
  width: 100%;
  height: 56px;
}
.verdict-fanout path {
  fill: none;
  stroke: #393939;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.verdict-fanout > div {
  display: grid;
  grid-template-columns: repeat(var(--checks), minmax(0, 1fr));
  gap: 12px;
}
.verdict-fanout button {
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 9px;
  padding: 0 5px 5px;
  border: 0;
  background: transparent;
  color: #999;
  font-size: 11px;
  cursor: pointer;
}
.verdict-fanout button:hover .fanout-node {
  transform: translateY(-2px);
  border-color: #aaa;
}
.fanout-node {
  display: grid;
  width: 35px;
  height: 35px;
  place-items: center;
  border: 1px solid #454545;
  border-radius: 10px;
  color: #bdbdbf;
  background: #151515;
  transition:
    transform var(--duration-control),
    border-color var(--duration-control);
}
.fanout-node[data-status="Fail"] {
  border-color: #bcbcbc;
  background: #e1e1e1;
  color: #111;
}
.fanout-node[data-status="Warning"] {
  border-style: dashed;
  border-color: #777;
}
.verdict-fanout strong {
  color: #bebec2;
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  line-height: 1.5;
}
.verdict-fanout small {
  font-size: 10px;
  color: #8f8f94;
}
.execution-trace--compact {
  padding: 14px 0;
}
.execution-trace--compact header {
  display: none;
}
.execution-trace--compact .execution-path {
  margin: 0;
}
@media (max-width: 720px) {
  .execution-path {
    grid-template-columns: 1fr 1fr;
    row-gap: 22px;
  }
  .execution-path li:nth-child(2)::after {
    display: none;
  }
  .verdict-fanout {
    margin-top: 26px;
    border-top: 1px solid #333;
    padding-top: 20px;
  }
  .verdict-fanout svg {
    display: none;
  }
  .verdict-fanout > div {
    grid-template-columns: repeat(2, 1fr);
    gap: 15px;
  }
  .verdict-fanout button {
    grid-template-columns: 35px 1fr;
    justify-items: start;
    align-items: center;
    gap: 4px 10px;
  }
  .verdict-fanout strong {
    text-align: left;
  }
  .fanout-node {
    grid-row: span 2;
  }
  .execution-trace--compact .execution-path {
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .execution-trace--compact li {
    display: grid;
    gap: 4px;
  }
  .execution-trace--compact strong {
    font-size: 9px;
  }
}
</style>
