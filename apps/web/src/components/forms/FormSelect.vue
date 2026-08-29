<script setup lang="ts">
import { Check, ChevronDown } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

type AriaInvalid = boolean | "true" | "false" | "grammar" | "spelling";

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<{
  id: string;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  ariaDescribedby?: string;
  ariaInvalid?: AriaInvalid;
}>(), {
  placeholder: "Select an option",
  disabled: false,
});

const model = defineModel<string>({ required: true });
const root = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const listbox = ref<HTMLElement>();
const isOpen = ref(false);
const dropUp = ref(false);
const menuMaxHeight = ref(304);
const activeIndex = ref(-1);

defineExpose({
  focus: () => trigger.value?.focus(),
});
let typeaheadBuffer = "";
let typeaheadResetTimer: number | undefined;

const listboxId = computed(() => `${props.id}-listbox`);
const selectedIndex = computed(() => props.options.findIndex((option) => option.value === model.value));
const selectedOption = computed(() => props.options[selectedIndex.value]);
const activeOptionId = computed(() => (
  isOpen.value && activeIndex.value >= 0 ? `${props.id}-option-${activeIndex.value}` : undefined
));

function enabledIndexes() {
  return props.options.reduce<number[]>((indexes, option, index) => {
    if (!option.disabled) indexes.push(index);
    return indexes;
  }, []);
}

function updatePlacement() {
  if (!trigger.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const gap = 15;
  const below = window.innerHeight - rect.bottom - gap;
  const above = rect.top - gap;
  const desiredHeight = Math.min(304, Math.max(props.options.length, 1) * 38 + 12);
  dropUp.value = below < desiredHeight && above > below;
  const availableSpace = Math.max(0, dropUp.value ? above : below);
  menuMaxHeight.value = availableSpace > 0
    ? Math.max(48, Math.min(304, availableSpace))
    : 0;
}

function scrollActiveIntoView() {
  void nextTick(() => {
    listbox.value
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex.value}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });
}

function setActive(index: number) {
  activeIndex.value = index;
  scrollActiveIntoView();
}

function clearTypeahead() {
  typeaheadBuffer = "";
  if (typeaheadResetTimer !== undefined) window.clearTimeout(typeaheadResetTimer);
  typeaheadResetTimer = undefined;
}

function findTypeaheadMatch(query: string) {
  const indexes = enabledIndexes();
  if (!indexes.length) return -1;
  const currentIndex = activeIndex.value >= 0 ? activeIndex.value : selectedIndex.value;
  const currentPosition = indexes.indexOf(currentIndex);
  const orderedIndexes = currentPosition >= 0
    ? [...indexes.slice(currentPosition + 1), ...indexes.slice(0, currentPosition + 1)]
    : indexes;
  return orderedIndexes.find((index) => (
    props.options[index]?.label.trimStart().toLocaleLowerCase().startsWith(query)
  )) ?? -1;
}

function handleTypeahead(key: string) {
  const character = key.toLocaleLowerCase();
  typeaheadBuffer += character;
  const repeatedCharacter = [...typeaheadBuffer].every((value) => value === character);
  let match = findTypeaheadMatch(repeatedCharacter ? character : typeaheadBuffer);

  if (match < 0 && typeaheadBuffer.length > 1) {
    typeaheadBuffer = character;
    match = findTypeaheadMatch(character);
  }

  if (typeaheadResetTimer !== undefined) window.clearTimeout(typeaheadResetTimer);
  typeaheadResetTimer = window.setTimeout(() => {
    typeaheadBuffer = "";
    typeaheadResetTimer = undefined;
  }, 650);

  if (match < 0) return;
  if (!isOpen.value) openMenu();
  setActive(match);
}

function openMenu(fallback: "first" | "last" = "first") {
  if (props.disabled || isOpen.value) return;
  const indexes = enabledIndexes();
  const selected = selectedIndex.value;
  updatePlacement();
  isOpen.value = true;
  setActive(
    selected >= 0 && !props.options[selected]?.disabled
      ? selected
      : (fallback === "last" ? indexes.at(-1) : indexes[0]) ?? -1,
  );
}

function closeMenu(returnFocus = false) {
  if (!isOpen.value) return;
  isOpen.value = false;
  dropUp.value = false;
  activeIndex.value = -1;
  clearTypeahead();
  if (returnFocus) void nextTick(() => trigger.value?.focus());
}

function toggleMenu() {
  if (isOpen.value) closeMenu();
  else openMenu();
}

function moveActive(direction: 1 | -1) {
  const indexes = enabledIndexes();
  if (!indexes.length) return;
  const current = indexes.indexOf(activeIndex.value);
  const next = current < 0
    ? (direction === 1 ? 0 : indexes.length - 1)
    : Math.min(Math.max(current + direction, 0), indexes.length - 1);
  setActive(indexes[next] ?? -1);
}

function selectOption(index: number) {
  const option = props.options[index];
  if (!option || option.disabled) return;
  model.value = option.value;
  closeMenu(true);
}

function handleKeydown(event: KeyboardEvent) {
  if (props.disabled) return;
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      if (isOpen.value) moveActive(1);
      else openMenu();
      break;
    case "ArrowUp":
      event.preventDefault();
      if (isOpen.value) moveActive(-1);
      else openMenu("last");
      break;
    case "Home": {
      event.preventDefault();
      if (!isOpen.value) openMenu();
      const first = enabledIndexes()[0];
      if (first !== undefined) setActive(first);
      break;
    }
    case "End": {
      event.preventDefault();
      if (!isOpen.value) openMenu("last");
      const last = enabledIndexes().at(-1);
      if (last !== undefined) setActive(last);
      break;
    }
    case "Enter":
    case " ":
      event.preventDefault();
      if (isOpen.value) selectOption(activeIndex.value);
      else openMenu();
      break;
    case "Escape":
      if (isOpen.value) {
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
      }
      break;
    case "Tab":
      closeMenu();
      break;
    default:
      if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        handleTypeahead(event.key);
      }
  }
}

function handleOutsidePointerDown(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) closeMenu();
}

function handleResize() {
  if (isOpen.value) updatePlacement();
}

watch(() => props.disabled, (disabled) => {
  if (disabled) closeMenu();
});

watch(() => props.options, () => {
  if (!isOpen.value) return;
  updatePlacement();
  const selected = selectedIndex.value;
  const first = enabledIndexes()[0] ?? -1;
  setActive(selected >= 0 && !props.options[selected]?.disabled ? selected : first);
}, { deep: true });

onMounted(() => {
  document.addEventListener("pointerdown", handleOutsidePointerDown);
  window.addEventListener("resize", handleResize);
  window.addEventListener("scroll", handleResize, true);
});

onBeforeUnmount(() => {
  clearTypeahead();
  document.removeEventListener("pointerdown", handleOutsidePointerDown);
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("scroll", handleResize, true);
});
</script>

<template>
  <div
    ref="root"
    class="form-select"
    :class="{ 'form-select--open': isOpen, 'drop-up': dropUp }"
  >
    <button
      :id="id"
      ref="trigger"
      class="form-select__trigger"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      aria-autocomplete="none"
      :aria-expanded="isOpen"
      :aria-controls="listboxId"
      :aria-activedescendant="activeOptionId"
      :aria-label="ariaLabel"
      :aria-describedby="ariaDescribedby"
      :aria-invalid="ariaInvalid"
      :disabled="disabled"
      @click="toggleMenu"
      @keydown="handleKeydown"
    >
      <span class="form-select__value" :class="{ 'form-select__value--placeholder': !selectedOption }">
        {{ selectedOption?.label ?? placeholder }}
      </span>
      <ChevronDown class="form-select__chevron" :size="16" :stroke-width="1.8" aria-hidden="true" />
    </button>

    <div
      v-if="isOpen"
      :id="listboxId"
      ref="listbox"
      class="form-select__listbox"
      role="listbox"
      :aria-label="ariaLabel ?? placeholder"
      :style="{ maxHeight: `${menuMaxHeight}px` }"
    >
      <div
        v-for="(option, index) in options"
        :id="`${id}-option-${index}`"
        :key="option.value"
        class="form-select__option"
        :class="{
          'form-select__option--active': activeIndex === index,
          'form-select__option--selected': model === option.value,
          'form-select__option--disabled': option.disabled,
        }"
        role="option"
        :aria-selected="model === option.value"
        :aria-disabled="option.disabled || undefined"
        :data-option-index="index"
        @mousedown.prevent
        @pointermove="!option.disabled && (activeIndex = index)"
        @click="selectOption(index)"
      >
        <span>{{ option.label }}</span>
        <Check v-if="model === option.value" :size="15" :stroke-width="2" aria-hidden="true" />
      </div>

      <div v-if="!options.length" class="form-select__empty" role="option" aria-disabled="true">
        No options available
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-select {
  position: relative;
  display: inline-block;
  width: 100%;
  min-width: 0;
  color-scheme: dark;
}

.form-select--open {
  z-index: 60;
}

.form-select__trigger {
  display: flex;
  width: 100%;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 13px 0 14px;
  border: 1px solid #353535;
  border-radius: 10px;
  outline: 0;
  color: #f1f1f1;
  background: #161616;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .04),
    0 2px 4px rgba(0, 0, 0, .25),
    0 12px 36px rgba(0, 0, 0, .12);
  font: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  transition: border-color 170ms ease, background 170ms ease, box-shadow 200ms ease;
}

.form-select__trigger:hover:not(:disabled) {
  border-color: #4a4a4a;
  background: #191919;
}

.form-select__trigger:focus-visible {
  border-color: #797979;
  outline: 2px solid #f5f5f5;
  outline-offset: 3px;
  background: #1a1a1a;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .055),
    0 0 0 4px rgba(255, 255, 255, .055),
    0 18px 50px rgba(0, 0, 0, .3);
}

.form-select__trigger:is([aria-invalid="true"], [aria-invalid="grammar"], [aria-invalid="spelling"]) {
  border-color: #737373;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), 0 0 0 4px rgba(255, 255, 255, .045);
}

.form-select__trigger:disabled {
  border-color: #2b2b2b;
  color: #6f6f6f;
  background: #111;
  box-shadow: none;
  cursor: not-allowed;
}

.form-select__value {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 520;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form-select__value--placeholder {
  color: #8a8a8a;
}

.form-select__chevron {
  flex: 0 0 auto;
  color: #747474;
  transition: color 150ms ease, transform 170ms ease;
}

.form-select__trigger:hover:not(:disabled) .form-select__chevron,
.form-select__trigger:focus-visible .form-select__chevron {
  color: #e5e5e5;
}

.form-select--open .form-select__chevron {
  color: #e5e5e5;
  transform: rotate(180deg);
}

.form-select__trigger:disabled .form-select__chevron {
  color: #424242;
}

.form-select__listbox {
  position: absolute;
  z-index: 1;
  top: calc(100% + 7px);
  right: 0;
  left: 0;
  min-width: min(220px, calc(100vw - 24px));
  padding: 6px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid #3b3b3b;
  border-radius: 12px;
  background: #101010;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .055),
    0 4px 12px rgba(0, 0, 0, .5),
    0 28px 80px rgba(0, 0, 0, .72);
  scrollbar-color: #4a4a4a transparent;
  scrollbar-width: thin;
}

.form-select.drop-up .form-select__listbox {
  top: auto;
  bottom: calc(100% + 7px);
}

.form-select__option,
.form-select__empty {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  color: #c8c8c8;
  font-size: 13px;
  line-height: 1.2;
}

.form-select__option {
  cursor: pointer;
}

.form-select__option--active {
  color: #f4f4f4;
  background: #242424;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .035);
}

.form-select__option--selected {
  color: #fff;
  font-weight: 600;
}

.form-select__option--disabled {
  color: #5e5e5e;
  background: transparent;
  box-shadow: none;
  cursor: not-allowed;
}

.form-select__option svg {
  flex: 0 0 auto;
}

.form-select__empty {
  justify-content: flex-start;
  color: #696969;
}

@media (max-width: 420px) {
  .form-select__option,
  .form-select__empty {
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .form-select__trigger,
  .form-select__chevron {
    transition: none;
  }
}
</style>
