<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { CalendarRange, ChevronLeft, ChevronRight, X } from "lucide-vue-next";
import {
  formatCalendarDate,
  getCalendarMonthGrid,
  moveCalendarDay,
  moveCalendarMonth,
  parseCalendarDate,
} from "./calendar";
const props = withDefaults(
  defineProps<{ start: string; end: string; max: string; title?: string }>(),
  { title: "Test window" },
);
const titleId = useId();
const emit = defineEmits<{ apply: [start: string, end: string] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const draftStart = ref("");
const draftEnd = ref("");
const choosing = ref<"start" | "end">("start");
const view = ref(
  parseCalendarDate(props.end) ?? { year: 2024, month: 1, day: 1 },
);
const valid = computed(() =>
  Boolean(
    parseCalendarDate(draftStart.value) &&
      parseCalendarDate(draftEnd.value) &&
      draftStart.value < draftEnd.value &&
      draftEnd.value <= props.max,
  ),
);
const months = computed(() =>
  [view.value, moveCalendarMonth(view.value, 1)].map((date) => ({
    date,
    title: new Date(
      `${formatCalendarDate({ ...date, day: 1 })}T00:00:00Z`,
    ).toLocaleDateString("en", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    days: getCalendarMonthGrid(date, null, parseCalendarDate(props.max)),
  })),
);
function open() {
  draftStart.value = props.start;
  draftEnd.value = props.end;
  choosing.value = "start";
  view.value = moveCalendarMonth(
    parseCalendarDate(props.end) ?? view.value,
    -1,
  );
  dialog.value?.showModal();
}
function close() {
  dialog.value?.close();
  trigger.value?.focus();
}
function apply() {
  if (!valid.value) return;
  emit("apply", draftStart.value, draftEnd.value);
  close();
}
function select(value: string) {
  if (choosing.value === "start") {
    draftStart.value = value;
    choosing.value = "end";
  } else {
    draftEnd.value = value;
    choosing.value = "start";
  }
}
function preset(years: number) {
  const end = parseCalendarDate(draftEnd.value);
  if (end)
    draftStart.value = formatCalendarDate(moveCalendarMonth(end, -years * 12));
}
async function key(event: KeyboardEvent, value: string) {
  const day = parseCalendarDate(value);
  if (!day) return;
  const offset: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  };
  if (!(event.key in offset)) return;
  event.preventDefault();
  const next = moveCalendarDay(day, offset[event.key]!);
  const formatted = formatCalendarDate(next);
  if (formatted > props.max) return;
  const visibleMonths = window.matchMedia("(max-width: 560px)").matches
    ? months.value.slice(0, 1)
    : months.value;
  if (
    !visibleMonths.some(
      (month) =>
        month.date.year === next.year && month.date.month === next.month,
    )
  )
    view.value = next;
  await nextTick();
  dialog.value
    ?.querySelector<HTMLElement>(`[data-calendar-day="${formatted}"]`)
    ?.focus();
}
</script>
<template>
  <button
    ref="trigger"
    class="button button--secondary button--small"
    type="button"
    @click="open"
  >
    <CalendarRange :size="14" />Choose date range</button
  ><Teleport to="body"
    ><dialog
      ref="dialog"
      class="date-range-dialog"
      :aria-labelledby="titleId"
      @cancel.prevent="close"
      @click="$event.target === dialog && close()"
    >
      <header>
        <div>
          <h2 :id="titleId">{{ title }}</h2>
          <p>Select a {{ choosing }} date. Changes apply together.</p>
        </div>
        <button type="button" aria-label="Close date range" @click="close">
          <X :size="18" />
        </button>
      </header>
      <div class="date-range-values">
        <label
          >From<input
            v-model="draftStart"
            type="text"
            inputmode="numeric"
            placeholder="YYYY-MM-DD"
            maxlength="10"
            @focus="choosing = 'start'" /></label
        ><span aria-hidden="true">→</span
        ><label
          >To<input
            v-model="draftEnd"
            type="text"
            inputmode="numeric"
            placeholder="YYYY-MM-DD"
            maxlength="10"
            @focus="choosing = 'end'"
        /></label>
      </div>
      <div class="date-range-presets">
        <span>Ending on your To date</span
        ><button
          v-for="year in [1, 3, 5]"
          :key="year"
          type="button"
          @click="preset(year)"
        >
          {{ year }} {{ year === 1 ? "year" : "years" }}
        </button>
      </div>
      <div class="range-month-navigation">
        <button
          type="button"
          aria-label="Previous month"
          @click="view = moveCalendarMonth(view, -1)"
        >
          <ChevronLeft :size="18" /></button
        ><button
          type="button"
          aria-label="Next month"
          :disabled="
            formatCalendarDate(moveCalendarMonth({ ...view, day: 1 }, 1)) > max
          "
          @click="view = moveCalendarMonth(view, 1)"
        >
          <ChevronRight :size="18" />
        </button>
      </div>
      <div class="range-months">
        <section
          v-for="(month, index) in months"
          :key="month.title"
          :class="{ 'second-month': index === 1 }"
          :aria-label="month.title"
        >
          <h3>{{ month.title }}</h3>
          <div class="range-weekdays" aria-hidden="true">
            <span v-for="day in ['M', 'T', 'W', 'T', 'F', 'S', 'S']">{{
              day
            }}</span>
          </div>
          <div class="range-days">
            <button
              v-for="day in month.days"
              :key="day.value"
              type="button"
              :data-calendar-day="day.inMonth ? day.value : undefined"
              :disabled="day.disabled || !day.inMonth"
              :class="{
                outside: !day.inMonth,
                selected: day.value === draftStart || day.value === draftEnd,
                between: day.value > draftStart && day.value < draftEnd,
              }"
              :aria-label="day.value"
              :aria-pressed="day.value === draftStart || day.value === draftEnd"
              @click="select(day.value)"
              @keydown="key($event, day.value)"
            >
              {{ day.date.day }}
            </button>
          </div>
        </section>
      </div>
      <footer>
        <p>
          {{ draftStart }} → {{ draftEnd
          }}<small v-if="!valid">Choose valid dates with From before To.</small>
        </p>
        <button class="button" type="button" :disabled="!valid" @click="apply">
          Apply dates
        </button>
      </footer>
    </dialog></Teleport
  >
</template>
<style scoped>
.date-range-dialog {
  width: min(680px, calc(100vw - 28px));
  max-height: 90dvh;
  padding: 24px;
  border: 1px solid #3b3b3b;
  border-radius: 14px;
  color: #e2e2e5;
  background: #161616;
  box-shadow: var(--shadow-overlay);
  animation: overlay-in var(--duration-overlay) var(--ease-out);
}
.date-range-dialog::backdrop {
  background: #0009;
  backdrop-filter: blur(5px);
}
header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
}
h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 550;
  letter-spacing: -0.03em;
}
header p {
  margin: 8px 0 0;
  color: #8e8e96;
  font-size: 12px;
}
header > button,
.range-month-navigation button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid #333;
  border-radius: 6px;
  background: #1c1c1c;
  color: #aaa;
  cursor: pointer;
}
.date-range-values {
  display: flex;
  align-items: end;
  gap: 14px;
  margin-top: 24px;
}
.date-range-values label {
  display: grid;
  flex: 1;
  gap: 7px;
  min-width: 0;
  color: #a7a7ae;
  font-size: 11px;
}
.date-range-values input {
  width: 100%;
  min-width: 0;
  height: 40px;
  padding: 7px 10px;
  border: 1px solid #424242;
  border-radius: 7px;
  background: #101010;
  color: #ddd;
  font-size: 12px;
}
.date-range-values > span {
  padding-bottom: 10px;
  color: #777;
}
.date-range-presets {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 15px;
  color: #898992;
  font-size: 10px;
}
.date-range-presets span {
  margin-right: auto;
}
.date-range-presets button {
  padding: 6px 9px;
  border: 1px solid #393939;
  border-radius: 6px;
  background: #1f1f1f;
  color: #b8b8c0;
  font-size: 10px;
  cursor: pointer;
}
.range-month-navigation {
  display: flex;
  justify-content: space-between;
  margin: 22px 0 -34px;
}
.range-months {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
}
.range-months h3 {
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  margin: 10px 0 20px;
}
.range-weekdays,
.range-days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
}
.range-weekdays span {
  padding-bottom: 9px;
  text-align: center;
  color: #85858c;
  font-size: 10px;
}
.range-days button {
  min-height: 32px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #c8c8ce;
  font-size: 11px;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.range-days button:hover:not(:disabled) {
  background: #393939;
}
.range-days button.outside {
  visibility: hidden;
}
.range-days button:disabled {
  color: #4f4f57;
  cursor: default;
}
.range-days button.between {
  background: #242424;
}
.range-days button.selected {
  background: #eee;
  color: #111;
}
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid #303030;
}
footer p {
  margin: 0;
  font-size: 11px;
  color: #a6a6af;
}
footer small {
  display: block;
  margin-top: 6px;
  color: #bdbdc4;
}
button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
@media (max-width: 560px) {
  .date-range-dialog {
    padding: 20px;
  }
  .range-months {
    grid-template-columns: 1fr;
  }
  .second-month {
    display: none;
  }
  .range-days button {
    min-height: 38px;
  }
  .date-range-presets {
    flex-wrap: wrap;
  }
  .date-range-presets > span {
    width: 100%;
  }
  footer {
    align-items: start;
    flex-direction: column;
  }
  footer .button {
    width: 100%;
  }
}
</style>
