<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Check, X } from "lucide-vue-next";
import { useNotifications } from "@/stores/notifications";
const notifications = useNotifications();
const hovered = ref(false);
const focused = ref(false);
let timer: ReturnType<typeof setInterval>;
let last = Date.now();
onMounted(() => {
  timer = setInterval(() => {
    const now = Date.now();
    if (hovered.value || focused.value || document.hidden)
      notifications.items.forEach((item) => {
        item.expires += now - last;
      });
    else
      notifications.items = notifications.items.filter(
        (item) => item.expires > now,
      );
    last = now;
  }, 250);
});
onBeforeUnmount(() => clearInterval(timer));
function focusOut(event: FocusEvent) {
  if (
    !(event.currentTarget as HTMLElement).contains(
      event.relatedTarget as Node | null,
    )
  )
    focused.value = false;
}
</script>
<template>
  <Teleport to="body">
  <div
    class="toast-stack"
    :class="{ 'toast-stack--expanded': hovered || focused }"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focusin="focused = true"
    @focusout="focusOut"
  >
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ notifications.items.at(-1)?.message }}
    </div>
    <TransitionGroup name="toast">
      <div
        v-for="(item, index) in notifications.items"
        :key="item.id"
        class="toast-item"
        :style="{
          '--depth': notifications.items.length - 1 - index,
          zIndex: index + 1,
        }"
      >
        <span class="toast-mark"><Check :size="15" /></span>
        <p>{{ item.message }}</p>
        <button
          type="button"
          aria-label="Dismiss notification"
          @click="notifications.dismiss(item.id)"
        >
          <X :size="15" />
        </button>
      </div>
    </TransitionGroup>
  </div>
  </Teleport>
</template>
<style scoped>
.toast-stack {
  position: fixed;
  z-index: 180;
  left: 24px;
  bottom: 24px;
  width: min(380px, calc(100vw - 32px));
  height: 70px;
  pointer-events: none;
}
.toast-item {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  width: 100%;
  min-height: 64px;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid #393939;
  border-radius: 12px;
  background: #1a1a1a;
  box-shadow:
    0 12px 36px #0008,
    inset 0 1px #ffffff08;
  transform: translateY(calc(var(--depth) * -9px))
    scale(calc(1 - var(--depth) * 0.035));
  transform-origin: bottom center;
  transition:
    transform var(--duration-overlay) var(--ease-out),
    opacity var(--duration-overlay);
  pointer-events: auto;
}
.toast-stack--expanded {
  height: 225px;
}
.toast-stack--expanded .toast-item {
  transform: translateY(calc(var(--depth) * -78px));
}
.toast-item p {
  flex: 1;
  margin: 0;
  color: #dedee0;
  font-size: 12px;
  line-height: 1.5;
}
.toast-mark {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 1px solid #515151;
  border-radius: 50%;
  color: #e7e7e7;
}
.toast-item button {
  display: grid;
  min-width: 32px;
  min-height: 32px;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: #999;
  cursor: pointer;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}
@media (max-width: 720px) {
  .toast-stack {
    left: 16px;
    bottom: calc(16px + env(safe-area-inset-bottom));
  }
  :global(body:has(.evidence-drawer[aria-modal="true"])) .toast-stack { bottom: calc(86px + env(safe-area-inset-bottom)); }
}
</style>
