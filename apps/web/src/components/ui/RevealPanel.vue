<script setup lang="ts">
defineProps<{ open: boolean }>();
</script>
<template>
  <div
    class="reveal-panel"
    :class="{ 'reveal-panel--open': open }"
    :inert="!open"
  >
    <div>
      <div class="reveal-panel__content"><slot /></div>
    </div>
  </div>
</template>
<style scoped>
.reveal-panel {
  display: grid;
  grid-template-rows: 0fr;
  visibility: hidden;
  transition:
    grid-template-rows var(--duration-reveal) var(--ease-out),
    visibility var(--duration-reveal);
}
.reveal-panel--open {
  grid-template-rows: 1fr;
  visibility: visible;
}
.reveal-panel > div {
  min-height: 0;
  overflow: hidden;
}
.reveal-panel__content {
  opacity: 0;
  transform: translateY(-5px);
  transition: opacity 140ms ease, transform var(--duration-reveal) var(--ease-out);
}
.reveal-panel--open .reveal-panel__content {
  opacity: 1;
  transform: none;
}
</style>
