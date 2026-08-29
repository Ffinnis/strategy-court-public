<script setup lang="ts">
import { X } from "lucide-vue-next";

withDefaults(defineProps<{
  label: string;
  removable?: boolean;
}>(), {
  removable: true,
});

defineEmits<{
  remove: [];
}>();
</script>

<template>
  <span class="form-chip">
    <span>{{ label }}</span>
    <button v-if="removable" type="button" :aria-label="`Remove ${label}`" @click="$emit('remove')">
      <X :size="12" :stroke-width="2" aria-hidden="true" />
    </button>
  </span>
</template>

<style scoped>
.form-chip {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 5px;
  padding-inline: 11px;
  border: 1px solid #3a3a3a;
  border-radius: 999px;
  color: #ededed;
  background: linear-gradient(180deg, #1d1d1d, #171717);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 7px 18px rgba(0,0,0,.24);
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
}

.form-chip:has(button) {
  padding-right: 8px;
}

.form-chip button {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  color: #858585;
  background: transparent;
  cursor: pointer;
  transition: color 140ms ease, background 140ms ease;
}

.form-chip button:hover {
  color: #fff;
  background: #303030;
}

.form-chip button:focus-visible {
  outline-offset: 1px;
}
</style>
