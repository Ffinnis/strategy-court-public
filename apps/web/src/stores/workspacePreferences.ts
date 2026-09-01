import { defineStore } from "pinia";
import { ref } from "vue";

export const useWorkspacePreferences = defineStore(
  "workspace-preferences",
  () => {
    const reviewedRuns = ref<string[]>([]);
    function markReviewed(runId: string, reviewed: boolean) {
      reviewedRuns.value = reviewed
        ? [...new Set([...reviewedRuns.value, runId])]
        : reviewedRuns.value.filter((id) => id !== runId);
    }
    return { reviewedRuns, markReviewed };
  },
);
