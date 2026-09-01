<script setup lang="ts">
import { computed } from "vue";
import { Check, Circle } from "lucide-vue-next";
import { useCourtStore } from "@/stores/court";
import { useWorkspacePreferences } from "@/stores/workspacePreferences";
defineProps<{ compact?: boolean }>();
const store = useCourtStore();
const preferences = useWorkspacePreferences();
const reviewed = computed(() =>
  Boolean(
    store.latestRun && preferences.reviewedRuns.includes(store.latestRun.id),
  ),
);
</script>
<template>
  <nav class="investigation-checklist" :class="{ 'investigation-checklist--compact': compact }" aria-label="Investigation checklist">
    <button v-if="!compact" @click="store.activeTab = 'strategy'">
      <Check v-if="store.confirmed" :size="13" /><Circle
        v-else
        :size="11"
      />Rules confirmed</button
    ><button v-if="!compact" @click="store.activeTab = 'court'">
      <Check v-if="store.courtComplete" :size="13" /><Circle
        v-else
        :size="11"
      />Court complete</button
    ><label
      title="Your explicit review marker for this session. Opening a tab does not mark the evidence reviewed."
      ><input
        type="checkbox"
        :checked="reviewed"
        :disabled="!store.courtComplete"
        @change="
          store.latestRun &&
          preferences.markReviewed(
            store.latestRun.id,
            ($event.target as HTMLInputElement).checked,
          )
        "
      />Evidence reviewed <small v-if="!compact">This session</small></label
    ><button v-if="!compact" @click="store.activeTab = 'court'">
      <Check v-if="store.recordedDecision" :size="13" /><Circle
        v-else
        :size="11"
      />Decision recorded
    </button>
  </nav>
</template>
<style scoped>
.investigation-checklist {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 26px;
  padding: 18px 0;
  border-block: 1px solid #292929;
}
.investigation-checklist button,
.investigation-checklist label {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 7px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #a7a7ae;
  font-size: 11px;
  cursor: pointer;
}
.investigation-checklist button:hover {
  color: #fff;
}
.investigation-checklist input {
  margin: 0;
  accent-color: #eee;
}
.investigation-checklist small {
  color: #6c6c73;
  font-size: 9px;
}
.investigation-checklist svg {
  color: #d9d9de;
}
@media (max-width: 720px) {
  .investigation-checklist {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .investigation-checklist label {
    flex-wrap: wrap;
  }
  .investigation-checklist small {
    display: none;
  }
}
.investigation-checklist--compact { display: flex; border: 0; padding: 0; }
.investigation-checklist--compact label { min-height: 40px; white-space: nowrap; }
</style>
