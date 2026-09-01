<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ start: string; end: string; split: string }>();
const offset = computed(() => {
  const start = Date.parse(props.start),
    end = Date.parse(props.end),
    split = Date.parse(props.split);
  return Number.isFinite(start + end + split) &&
    end > start &&
    split >= start &&
    split <= end
    ? ((split - start) / (end - start)) * 100
    : null;
});
</script>
<template>
  <section
    v-if="offset !== null"
    class="evaluation-window"
    aria-label="Test periods"
  >
    <div class="evaluation-window__row">
      <span>Baseline</span><i aria-hidden="true" /><small
        >{{ start }} → {{ end }}</small
      >
    </div>
    <div class="evaluation-window__row">
      <span>Evaluation</span
      ><i aria-hidden="true"
        ><b :style="{ left: `${offset}%`, width: `${100 - offset}%` }" /></i
      ><small>{{ split }} → {{ end }}</small>
    </div>
    <p>
      The baseline covers the full window. Evaluation retests unchanged rules on
      the final segment. No reserved replay history is revealed here.
    </p>
  </section>
</template>
<style scoped>
.evaluation-window {
  display: grid;
  gap: 15px;
  padding: 18px 0;
}
.evaluation-window__row {
  display: grid;
  grid-template-columns: 90px 1fr 190px;
  align-items: center;
  gap: 18px;
  color: #a8a8b0;
  font-size: 11px;
}
.evaluation-window i {
  position: relative;
  height: 4px;
  background: #77777d;
  border-radius: 2px;
}
.evaluation-window__row:nth-child(2) i {
  background: #222;
}
.evaluation-window b {
  position: absolute;
  top: 0;
  height: 4px;
  border-radius: 2px;
  background: #dedee1;
}
.evaluation-window small {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.evaluation-window p {
  margin: 0;
  color: #83838b;
  font-size: 11px;
  line-height: 1.6;
}
@media (max-width: 720px) {
  .evaluation-window__row {
    grid-template-columns: 80px 1fr;
    gap: 10px;
  }
  .evaluation-window small {
    grid-column: 2;
  }
}
</style>
