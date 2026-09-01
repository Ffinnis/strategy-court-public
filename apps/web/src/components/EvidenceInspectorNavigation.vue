<script setup lang="ts">
import { ChevronLeft, ChevronRight, Link } from "lucide-vue-next";
defineProps<{ index: number; count: number; error: string }>();
defineEmits<{ move: [offset: number]; copy: [] }>();
</script>
<template>
  <div class="inspector-navigation">
    <button
      type="button"
      aria-label="Previous evidence"
      :disabled="index <= 0"
      @click="$emit('move', -1)"
    >
      <ChevronLeft :size="16" /></button
    ><span>{{ index < 0 ? "Outside filter" : `${index + 1} of ${count}` }}</span
    ><button
      type="button"
      aria-label="Next evidence"
      :disabled="index < 0 || index >= count - 1"
      @click="$emit('move', 1)"
    >
      <ChevronRight :size="16" /></button
    ><button class="copy-evidence-link" type="button" @click="$emit('copy')">
      <Link :size="13" />Private link
    </button>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.inspector-navigation {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-bottom: 1px solid #303030;
  color: #94949a;
  font-size: 11px;
}
.inspector-navigation button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 32px;
  min-height: 32px;
  border: 1px solid #333;
  border-radius: 6px;
  background: #191919;
  color: #ccc;
  font-size: 11px;
  cursor: pointer;
}
.inspector-navigation button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.copy-evidence-link {
  margin-left: auto;
  padding-inline: 9px;
}
.inspector-navigation p {
  width: 100%;
  margin: 3px 0;
  color: #ccc;
  font-size: 11px;
}
</style>
