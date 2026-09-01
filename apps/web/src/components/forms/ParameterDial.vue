<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{
  modelValue: number;
  min: number;
  max: number;
  step: number;
  label: string;
  unit: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: number] }>();
const ratio = computed(() =>
  Math.min(
    1,
    Math.max(
      0,
      (props.modelValue - props.min) / Math.max(props.max - props.min, 0.01),
    ),
  ),
);
const ticks = Array.from({ length: 49 }, (_, i) => {
  const angle = ((-225 + (i * 270) / 48) * Math.PI) / 180;
  return {
    x1: 80 + Math.cos(angle) * 59,
    y1: 80 + Math.sin(angle) * 59,
    x2: 80 + Math.cos(angle) * 67,
    y2: 80 + Math.sin(angle) * 67,
  };
});
function input(event: Event) {
  emit("update:modelValue", Number((event.target as HTMLInputElement).value));
}
function key(event: KeyboardEvent) {
  if (props.disabled || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === "Home" ? props.min : event.key === "End" ? props.max : props.modelValue + (["ArrowRight", "ArrowUp"].includes(event.key) ? props.step : -props.step);
  emit("update:modelValue", Number(Math.max(props.min, Math.min(props.max, next)).toFixed(10)));
}
</script>
<template>
  <div class="parameter-dial">
    <div class="parameter-dial__face" aria-hidden="true">
      <svg viewBox="0 0 160 140">
        <line
          v-for="(tick, index) in ticks"
          :key="index"
          v-bind="tick"
          :class="{ active: index <= ratio * 48 }"
        />
      </svg>
      <div>
        <strong>{{
          modelValue.toLocaleString(undefined, { maximumFractionDigits: 2 })
        }}</strong
        ><span>{{ unit }}</span>
      </div>
    </div>
    <label
      ><span>{{ label }}</span
      ><input
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :disabled="disabled"
        :aria-valuetext="`${modelValue} ${unit}`"
        @input="input"
        @keydown="key"
    /></label>
    <div class="dial-limits">
      <span>{{ min }} {{ unit }}</span
      ><span>{{ max }} {{ unit }}</span>
    </div>
  </div>
</template>
<style scoped>
.parameter-dial {
  width: 190px;
  max-width: 100%;
  padding: 14px 18px 18px;
  border: 1px solid #323232;
  border-radius: 12px;
  background: #141414;
}
.parameter-dial__face {
  position: relative;
  width: 150px;
  height: 130px;
  margin: auto;
}
.parameter-dial__face svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.parameter-dial__face line {
  stroke: #3b3b3f;
  stroke-width: 2;
  stroke-linecap: round;
}
.parameter-dial__face line.active {
  stroke: #e7e7ea;
}
.parameter-dial__face > div {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding-top: 15px;
  gap: 3px;
}
.parameter-dial strong {
  color: #efeff1;
  font-size: 27px;
  font-weight: 550;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}
.parameter-dial span {
  color: #8c8c93;
  font-size: 10px;
}
label {
  display: grid;
  gap: 8px;
}
label > span {
  color: #bebec3 !important;
  font-size: 11px !important;
}
input {
  width: 100%;
  margin: 0;
  accent-color: #e5e5e8;
  cursor: ew-resize;
}
.dial-limits {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}
</style>
