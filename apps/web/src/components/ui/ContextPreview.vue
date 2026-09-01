<script setup lang="ts">
import { onBeforeUnmount, ref, useId } from "vue";
import { Info } from "lucide-vue-next";
const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    facts: Array<{ label: string; value: string }>;
    to?: string;
    actionLabel?: string;
  }>(),
  { actionLabel: "Open full definition" },
);
const emit = defineEmits<{ inspect: [] }>();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const id = useId();
const below = ref(false);
let timer: ReturnType<typeof setTimeout>;
function position() {
  below.value = (root.value?.getBoundingClientRect().top ?? 400) < 340;
}
function toggle() {
  clearTimeout(timer);
  position();
  open.value = !open.value;
}
function enter() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    position();
    open.value = true;
  }, 180);
}
function leave() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!root.value?.contains(document.activeElement)) open.value = false;
  }, 150);
}
function blur(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) {
    clearTimeout(timer);
    open.value = false;
  }
}
function escape() {
  trigger.value?.focus();
  clearTimeout(timer);
  open.value = false;
}
onBeforeUnmount(() => clearTimeout(timer));
</script>
<template>
  <div
    ref="root"
    class="context-preview"
    @mouseenter="enter"
    @mouseleave="leave"
    @focusout="blur"
    @keydown.esc.stop.prevent="escape"
  >
    <button
      ref="trigger"
      type="button"
      :aria-label="`Preview ${props.title}`"
      :aria-expanded="open"
      :aria-controls="id"
      @click="toggle"
      @focus="enter"
    >
      <Info :size="15" /></button
    ><Transition name="preview"
      ><section
        v-if="open"
        :id="id"
        class="context-preview__panel"
        :class="{ below }"
        :aria-label="title"
      >
        <strong>{{ title }}</strong>
        <p v-if="description">{{ description }}</p>
        <dl>
          <div v-for="fact in facts" :key="fact.label">
            <dt>{{ fact.label }}</dt>
            <dd>{{ fact.value }}</dd>
          </div>
        </dl>
        <RouterLink v-if="to" :to="to" @click="open = false"
          >{{ actionLabel }} →</RouterLink
        ><button
          v-else
          class="preview-action"
          type="button"
          @click="
            open = false;
            emit('inspect');
          "
        >
          {{ actionLabel }} →
        </button>
      </section></Transition
    >
  </div>
</template>
<style scoped>
.context-preview {
  position: relative;
}
.context-preview > button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #777780;
  cursor: pointer;
}
.context-preview > button:hover,
.context-preview > button[aria-expanded="true"] {
  color: #ddd;
  background: #222;
}
.context-preview__panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 70;
  width: min(340px, calc(100vw - 50px));
  max-height: 400px;
  overflow: auto;
  padding: 20px;
  border: 1px solid #3b3b3b;
  border-radius: 12px;
  color: #bbb;
  background: #1b1b1b;
  box-shadow: var(--shadow-overlay);
}
.context-preview__panel > strong {
  color: #eee;
  font-size: 14px;
  font-weight: 550;
}
.context-preview__panel p {
  color: #aaa;
  font-size: 12px;
  line-height: 1.65;
}
.context-preview__panel dl {
  display: grid;
  gap: 10px;
  margin: 16px 0;
}
.context-preview__panel dl > div {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 14px;
  font-size: 11px;
  line-height: 1.5;
}
.context-preview__panel dt {
  color: #888;
}
.context-preview__panel dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.context-preview__panel a,
.preview-action {
  color: #ddd;
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.context-preview__panel.below {
  bottom: auto;
  top: calc(100% + 8px);
}
.preview-action {
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  cursor: pointer;
}
.preview-enter-active,
.preview-leave-active {
  transition:
    opacity 120ms,
    transform 180ms var(--ease-out);
}
.preview-enter-from,
.preview-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
