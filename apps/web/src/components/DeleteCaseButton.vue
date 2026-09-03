<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { Trash2 } from "lucide-vue-next";
import { apiRequest } from "@/services/api";
import { useCourtStore } from "@/stores/court";
import { useNotifications } from "@/stores/notifications";

const store = useCourtStore();
const router = useRouter();
const notifications = useNotifications();
const deleting = ref(false);

async function deleteCase() {
  const courtCase = store.currentCase;
  if (!courtCase || deleting.value || store.mutating || store.running) return;
  if (!window.confirm(`Delete "${courtCase.name}"? Its strategy versions, results and case history will be permanently deleted. This cannot be undone.`)) return;
  deleting.value = true;
  store.mutating = true;
  store.clearError();
  try {
    await apiRequest(`/api/cases/${encodeURIComponent(courtCase.id)}`, { method: "DELETE" });
    if (store.currentCase?.id === courtCase.id) {
      store.clearCaseSession();
      notifications.push("Case deleted.");
      await router.replace("/new");
    }
  } catch (issue) {
    if (store.currentCase?.id === courtCase.id) store.error = issue instanceof Error ? issue.message : "Could not delete this case. Try again.";
  } finally {
    deleting.value = false;
    if (store.currentCase?.id === courtCase.id) store.mutating = false;
  }
}
</script>

<template>
  <button
    class="delete-case"
    type="button"
    :disabled="deleting || store.mutating || store.running"
    :title="store.running ? 'Wait for Court to finish before deleting this case.' : undefined"
    @click="deleteCase"
  >
    <Trash2 :size="14" aria-hidden="true" />
    {{ deleting ? "Deleting…" : "Delete case" }}
  </button>
</template>

<style scoped>
.delete-case { display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 16px; padding: 12px 0 0; border: 0; border-top: 1px solid var(--line-subtle); color: #f0a4a4; background: transparent; font: inherit; font-size: 12px; cursor: pointer; }
.delete-case:hover:enabled { color: #ffc2c2; }
.delete-case:disabled { opacity: .5; cursor: not-allowed; }
.delete-case:focus-visible { outline: 2px solid currentColor; outline-offset: 4px; }
</style>
