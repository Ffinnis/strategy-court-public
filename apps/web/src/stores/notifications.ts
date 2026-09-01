import { defineStore } from "pinia";
import { ref } from "vue";

export const useNotifications = defineStore("notifications", () => {
  const items = ref<Array<{ id: number; message: string; expires: number }>>(
    [],
  );
  let sequence = 0;
  function push(message: string) {
    const existing = items.value.find((item) => item.message === message);
    if (existing) {
      existing.expires = Date.now() + 6000;
      return;
    }
    items.value = [
      ...items.value,
      { id: ++sequence, message, expires: Date.now() + 6000 },
    ].slice(-3);
  }
  function dismiss(id: number) {
    items.value = items.value.filter((item) => item.id !== id);
  }
  function clear() {
    items.value = [];
  }
  return { items, push, dismiss, clear };
});
