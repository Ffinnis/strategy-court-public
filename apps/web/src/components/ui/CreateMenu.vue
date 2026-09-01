<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { ArrowUpRight, Plus, FileText, FlaskConical } from "lucide-vue-next";
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const open = ref(false);
async function toggle() {
  open.value = !open.value;
  if (open.value) {
    await nextTick();
    root.value?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }
}
function close(restore = false) {
  open.value = false;
  if (restore) trigger.value?.focus();
}
function outside(event: PointerEvent | FocusEvent) {
  if (!root.value?.contains(event.target as Node)) close();
}
function keys(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close(true);
  }
  if (
    !open.value ||
    !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
  )
    return;
  event.preventDefault();
  const items = Array.from(
    root.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
  );
  const index = items.indexOf(document.activeElement as HTMLElement);
  items[
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
          items.length
  ]?.focus();
}
onMounted(() => {
  document.addEventListener("pointerdown", outside);
  document.addEventListener("focusin", outside);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside);
  document.removeEventListener("focusin", outside);
});
</script>
<template>
  <div
    ref="root"
    class="create-menu"
    :class="{ 'create-menu--open': open }"
    @keydown="keys"
  >
    <div class="create-menu__surface" aria-hidden="true" />
    <button
      ref="trigger"
      class="create-menu__trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <Plus :size="15" :class="{ rotated: open }" /> Create
    </button>
    <Transition name="create-options"
      ><div
        v-if="open"
        class="create-menu__options"
        role="menu"
        aria-label="Create an investigation"
      >
        <RouterLink role="menuitem" to="/new" @click="close()"
          ><FileText :size="16" /><span
            >New strategy<small>Start with your own rules</small></span
          ><ArrowUpRight :size="14"
        /></RouterLink>
        <RouterLink role="menuitem" to="/?sample=1" @click="close()"
          ><FlaskConical :size="16" /><span
            >Sample investigation<small
              >Explore saved market history</small
            ></span
          ><ArrowUpRight :size="14"
        /></RouterLink></div
    ></Transition>
  </div>
</template>
<style scoped>
.create-menu {
  position: relative;
  z-index: 2;
  width: 104px;
  height: 38px;
}
.create-menu__surface {
  position: absolute;
  right: 0;
  top: 0;
  width: 104px;
  height: 38px;
  border: 1px solid #3b3b3b;
  border-radius: 19px;
  background: #1b1b1b;
  box-shadow: inset 0 1px #ffffff0b;
  transition:
    width var(--duration-overlay) var(--ease-out),
    height var(--duration-overlay) var(--ease-out),
    border-radius var(--duration-overlay);
}
.create-menu--open .create-menu__surface {
  width: 294px;
  height: 186px;
  border-radius: 14px;
  box-shadow: var(--shadow-overlay);
}
.create-menu__trigger {
  position: relative;
  display: flex;
  width: 100%;
  height: 38px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 19px;
  background: transparent;
  color: #e4e4e6;
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
}
.create-menu__trigger svg {
  transition: transform var(--duration-overlay) var(--ease-out);
}
.rotated {
  transform: rotate(45deg);
}
.create-menu__options {
  position: absolute;
  top: 46px;
  right: 0;
  width: 294px;
  padding: 5px 8px;
}
.create-menu__options a {
  display: flex;
  min-height: 60px;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: 8px;
  color: #d8d8da;
  font-size: 13px;
}
.create-menu__options a:hover {
  background: #2a2a2a;
}
.create-menu__options span {
  flex: 1;
  display: grid;
  gap: 4px;
}
.create-menu__options small {
  color: #8b8b90;
  font-size: 11px;
}
.create-options-enter-active,
.create-options-leave-active {
  transition:
    opacity 120ms,
    transform var(--duration-overlay) var(--ease-out);
}
.create-options-enter-from,
.create-options-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}
</style>
