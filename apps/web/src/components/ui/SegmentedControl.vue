<script setup lang="ts">
import { nextTick, ref } from "vue";
import { useMovingIndicator } from "@/composables/useMovingIndicator";
const props = defineProps<{
  modelValue: string;
  label: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const root = ref<HTMLElement | null>(null);
const indicator = useMovingIndicator(root, () => props.modelValue);
async function move(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const enabled = props.options.filter((option) => !option.disabled);
  if (!enabled.length) return;
  const current = enabled.findIndex(
    (option) => option.value === props.modelValue,
  );
  const index =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? enabled.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) %
          enabled.length;
  emit("update:modelValue", enabled[index]!.value);
  await nextTick();
  root.value?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
}
</script>
<template>
  <div
    ref="root"
    class="segmented-control"
    role="radiogroup"
    :aria-label="label"
    @keydown="move"
  >
    <span
      class="segmented-control__thumb"
      :style="indicator"
      aria-hidden="true"
    />
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.value"
      :tabindex="modelValue === option.value ? 0 : -1"
      :disabled="option.disabled"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
<style scoped>
.segmented-control {
  position: relative;
  display: inline-flex;
  max-width: 100%;
  align-items: stretch;
  gap: 2px;
  padding: 4px;
  border: 1px solid #292929;
  border-radius: 10px;
  background: #101010;
  box-shadow: inset 0 2px 4px #0005;
  isolation: isolate;
}
.segmented-control__thumb {
  position: absolute;
  z-index: -1;
  left: 0;
  top: 4px;
  bottom: 4px;
  border-radius: 6px;
  background: #e8e8e8;
  box-shadow: 0 1px 4px #0007;
  transition:
    transform var(--duration-control) var(--ease-out),
    width var(--duration-control) var(--ease-out);
}
button {
  flex: 1;
  min-height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 6px;
  color: #929296;
  background: transparent;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  transition: color var(--duration-control);
}
button[aria-checked="true"] {
  color: #141414;
}
button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
@media (max-width: 480px) {
  button {
    padding-inline: 10px;
    font-size: 11px;
  }
}
</style>
