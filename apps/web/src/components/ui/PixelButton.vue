<script setup lang="ts">
import { ref } from "vue";
defineProps<{ disabled?: boolean }>();
const wave = ref(0);
</script>
<template>
  <button
    class="button pixel-button"
    type="button"
    :disabled="disabled"
    @pointerenter="wave++"
    @focus="wave++"
    @click="wave++"
  >
    <span :key="wave" class="pixel-wave" aria-hidden="true"
      ><i
        v-for="cell in 36"
        :key="cell"
        :style="{
          '--delay': `${((cell - 1) % 12) * 12 + Math.floor((cell - 1) / 12) * 14}ms`,
        }" /></span
    ><span class="pixel-button__label"><slot /></span>
  </button>
</template>
<style scoped>
.pixel-button {
  position: relative;
  overflow: hidden;
  isolation: isolate;
}
.pixel-button__label {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.pixel-wave {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 2px;
  pointer-events: none;
}
.pixel-wave i {
  background: #656565;
  opacity: 0;
  animation: pixel-reveal 180ms var(--delay) ease-out both;
}
@keyframes pixel-reveal {
  0%,
  100% {
    opacity: 0;
  }
  40% {
    opacity: 0.26;
  }
}
</style>
