<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-vue-next";
import {
  calendarWeekday,
  clampCalendarDate,
  compareCalendarDates,
  daysInCalendarMonth,
  formatCalendarDate,
  formatCalendarDisplayDate,
  getCalendarMonthGrid,
  isSameCalendarDate,
  moveCalendarDay,
  moveCalendarMonth,
  parseCalendarDate,
  type CalendarDate,
  type CalendarDay,
} from "./calendar";

type AriaInvalid = boolean | "true" | "false" | "grammar" | "spelling";

const props = defineProps<{
  id: string;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  ariaLabel?: string;
  ariaDescribedby?: string;
  ariaInvalid?: AriaInvalid;
}>();

const model = defineModel<string>({ required: true });
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const popover = ref<HTMLElement | null>(null);
const open = ref(false);
const dropUp = ref(false);
const popoverLeft = ref(0);
const popoverMaxHeight = ref(480);
let positionFrame = 0;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function todayDate(): CalendarDate {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

const today = ref(todayDate());
const minDate = computed(() => parseCalendarDate(props.min));
const maxDate = computed(() => {
  const parsed = parseCalendarDate(props.max);
  return parsed && minDate.value && compareCalendarDates(parsed, minDate.value) < 0 ? minDate.value : parsed;
});
const selectedDate = computed(() => parseCalendarDate(model.value));

function initialDate() {
  return clampCalendarDate(selectedDate.value ?? today.value, minDate.value, maxDate.value);
}

const activeDate = ref<CalendarDate>(initialDate());
const viewDate = ref<CalendarDate>({ ...activeDate.value, day: 1 });
const days = computed(() => getCalendarMonthGrid(viewDate.value, minDate.value, maxDate.value));
const weeks = computed(() => Array.from({ length: 6 }, (_, index) => days.value.slice(index * 7, index * 7 + 7)));
const displayValue = computed(() => selectedDate.value ? formatCalendarDisplayDate(selectedDate.value) : "Select date");
const triggerLabel = computed(() => props.ariaLabel ? `${props.ariaLabel}, ${displayValue.value}` : undefined);
const monthTitle = computed(() => `${MONTHS[viewDate.value.month - 1] ?? ""} ${viewDate.value.year}`);
const calendarId = computed(() => `${props.id}-calendar`);
const calendarTitleId = computed(() => `${props.id}-calendar-title`);

function sameMonth(left: CalendarDate, right: CalendarDate) {
  return left.year === right.year && left.month === right.month;
}

function monthEdge(date: CalendarDate, edge: "start" | "end"): CalendarDate {
  return {
    year: date.year,
    month: date.month,
    day: edge === "start" ? 1 : daysInCalendarMonth(date.year, date.month),
  };
}

const previousMonthDisabled = computed(() => {
  const target = moveCalendarMonth(monthEdge(viewDate.value, "start"), -1);
  return sameMonth(target, viewDate.value)
    || Boolean(minDate.value && compareCalendarDates(monthEdge(target, "end"), minDate.value) < 0);
});

const nextMonthDisabled = computed(() => {
  const target = moveCalendarMonth(monthEdge(viewDate.value, "start"), 1);
  return sameMonth(target, viewDate.value)
    || Boolean(maxDate.value && compareCalendarDates(monthEdge(target, "start"), maxDate.value) > 0);
});

function dayLabel(date: CalendarDate) {
  return `${WEEKDAYS[calendarWeekday(date)] ?? ""}, ${MONTHS[date.month - 1] ?? ""} ${date.day}, ${date.year}`;
}

function dayId(day: CalendarDay) {
  return `${props.id}-day-${day.value}`;
}

function syncCalendar() {
  activeDate.value = initialDate();
  viewDate.value = { ...activeDate.value, day: 1 };
}

function focusActiveDay() {
  const value = formatCalendarDate(activeDate.value);
  popover.value?.querySelector<HTMLElement>(`[data-date="${value}"]`)?.focus({ preventScroll: true });
}

function positionPopover() {
  if (!open.value || !root.value || !trigger.value || !popover.value) return;
  const rootRect = root.value.getBoundingClientRect();
  const triggerRect = trigger.value.getBoundingClientRect();
  const popoverRect = popover.value.getBoundingClientRect();
  const margin = 12;
  const gap = 8;
  const spaceBelow = Math.max(0, window.innerHeight - triggerRect.bottom - gap - margin);
  const spaceAbove = Math.max(0, triggerRect.top - gap - margin);
  const desiredHeight = Math.min(popover.value.scrollHeight, window.innerHeight - margin * 2);

  if (spaceBelow >= desiredHeight) dropUp.value = false;
  else if (spaceAbove >= desiredHeight) dropUp.value = true;
  else dropUp.value = spaceAbove > spaceBelow;

  popoverMaxHeight.value = Math.max(0, Math.min(
    desiredHeight,
    dropUp.value ? spaceAbove : spaceBelow,
  ));

  const furthestLeft = Math.max(margin, window.innerWidth - popoverRect.width - margin);
  const viewportLeft = Math.min(Math.max(triggerRect.left, margin), furthestLeft);
  popoverLeft.value = viewportLeft - rootRect.left;
}

function schedulePosition() {
  if (!open.value) return;
  cancelAnimationFrame(positionFrame);
  positionFrame = requestAnimationFrame(positionPopover);
}

async function openCalendar() {
  if (props.disabled) return;
  today.value = todayDate();
  syncCalendar();
  open.value = true;
  await nextTick();
  positionPopover();
  focusActiveDay();
}

function closeCalendar(returnFocus = false) {
  if (!open.value) return;
  open.value = false;
  if (returnFocus) nextTick(() => trigger.value?.focus({ preventScroll: true }));
}

function toggleCalendar() {
  if (open.value) closeCalendar();
  else void openCalendar();
}

function selectDay(day: CalendarDay) {
  if (day.disabled) return;
  model.value = day.value;
  activeDate.value = day.date;
  viewDate.value = { ...day.date, day: 1 };
  closeCalendar(true);
}

async function moveFocus(date: CalendarDate) {
  const next = clampCalendarDate(date, minDate.value, maxDate.value);
  activeDate.value = next;
  viewDate.value = { ...next, day: 1 };
  await nextTick();
  focusActiveDay();
}

function shiftMonth(amount: number, focusDay = false) {
  if ((amount < 0 && previousMonthDisabled.value) || (amount > 0 && nextMonthDisabled.value)) return;
  const next = clampCalendarDate(moveCalendarMonth(activeDate.value, amount), minDate.value, maxDate.value);
  activeDate.value = next;
  viewDate.value = { ...next, day: 1 };
  if (focusDay) nextTick(focusActiveDay);
  nextTick(schedulePosition);
}

function handleDayKeydown(event: KeyboardEvent, day: CalendarDay) {
  activeDate.value = day.date;
  let next: CalendarDate | null = null;

  if (event.key === "ArrowLeft") next = moveCalendarDay(day.date, -1);
  else if (event.key === "ArrowRight") next = moveCalendarDay(day.date, 1);
  else if (event.key === "ArrowUp") next = moveCalendarDay(day.date, -7);
  else if (event.key === "ArrowDown") next = moveCalendarDay(day.date, 7);
  else if (event.key === "Home") next = moveCalendarDay(day.date, -calendarWeekday(day.date));
  else if (event.key === "End") next = moveCalendarDay(day.date, 6 - calendarWeekday(day.date));
  else if (event.key === "PageUp" || event.key === "PageDown") {
    event.preventDefault();
    shiftMonth(event.key === "PageUp" ? -1 : 1, true);
    return;
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    selectDay(day);
    return;
  } else {
    return;
  }

  event.preventDefault();
  void moveFocus(next);
}

function handleOutsidePointer(event: PointerEvent) {
  if (open.value && event.target instanceof Node && !root.value?.contains(event.target)) closeCalendar();
}

function handleFocusOut(event: FocusEvent) {
  if (!open.value) return;
  const next = event.relatedTarget;
  if (next instanceof Node && !root.value?.contains(next)) closeCalendar();
  else if (!next) requestAnimationFrame(() => {
    if (open.value && !root.value?.contains(document.activeElement)) closeCalendar();
  });
}

function handleEscape(event: KeyboardEvent) {
  if (!open.value) return;
  event.preventDefault();
  event.stopPropagation();
  closeCalendar(true);
}

watch([model, minDate, maxDate], () => {
  if (!open.value) return;
  syncCalendar();
  nextTick(focusActiveDay);
});
watch(() => props.disabled, (disabled) => {
  if (disabled) closeCalendar();
});

onMounted(() => {
  document.addEventListener("pointerdown", handleOutsidePointer, true);
  window.addEventListener("resize", schedulePosition);
  window.addEventListener("scroll", schedulePosition, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleOutsidePointer, true);
  window.removeEventListener("resize", schedulePosition);
  window.removeEventListener("scroll", schedulePosition, true);
  cancelAnimationFrame(positionFrame);
});
</script>

<template>
  <span ref="root" class="form-date-picker" @focusout="handleFocusOut" @keydown.esc="handleEscape">
    <button
      :id="id"
      ref="trigger"
      class="input form-date-picker__trigger"
      type="button"
      :disabled="disabled"
      :aria-label="triggerLabel"
      :aria-describedby="ariaDescribedby"
      :aria-invalid="ariaInvalid"
      :aria-required="required || undefined"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="calendarId"
      @click="toggleCalendar"
      @keydown.down.prevent="openCalendar"
      @keydown.up.prevent="openCalendar"
    >
      <span :class="{ 'form-date-picker__placeholder': !selectedDate }">{{ displayValue }}</span>
      <Calendar class="form-date-picker__icon" :size="16" :stroke-width="1.75" aria-hidden="true" />
    </button>

    <Transition name="calendar-popover">
      <div
        v-if="open"
        :id="calendarId"
        ref="popover"
        class="form-date-picker__popover"
        :class="{ 'form-date-picker__popover--up': dropUp }"
        :style="{ left: `${popoverLeft}px`, maxHeight: `${popoverMaxHeight}px` }"
        role="dialog"
        :aria-label="ariaLabel ? `${ariaLabel} calendar` : 'Choose a date'"
      >
        <header class="calendar-header">
          <button
            type="button"
            :disabled="previousMonthDisabled"
            aria-label="Previous month"
            @click="shiftMonth(-1)"
          >
            <ChevronLeft :size="16" aria-hidden="true" />
          </button>
          <strong :id="calendarTitleId" aria-live="polite">{{ monthTitle }}</strong>
          <button
            type="button"
            :disabled="nextMonthDisabled"
            aria-label="Next month"
            @click="shiftMonth(1)"
          >
            <ChevronRight :size="16" aria-hidden="true" />
          </button>
        </header>

        <div class="calendar-weekdays" role="row">
          <span v-for="weekday in WEEKDAYS" :key="weekday" role="columnheader" :aria-label="weekday">
            {{ weekday.slice(0, 1) }}
          </span>
        </div>

        <div class="calendar-grid" role="grid" :aria-labelledby="calendarTitleId">
          <div v-for="(week, weekIndex) in weeks" :key="weekIndex" class="calendar-week" role="row">
            <span
              v-for="day in week"
              :key="day.value"
              class="calendar-cell"
              role="gridcell"
              :aria-selected="isSameCalendarDate(day.date, selectedDate)"
            >
              <button
                :id="dayId(day)"
                type="button"
                :data-date="day.value"
                :disabled="day.disabled"
                :tabindex="isSameCalendarDate(day.date, activeDate) ? 0 : -1"
                :class="{
                  'calendar-day--outside': !day.inMonth,
                  'calendar-day--selected': isSameCalendarDate(day.date, selectedDate),
                  'calendar-day--today': isSameCalendarDate(day.date, today),
                }"
                :aria-label="dayLabel(day.date)"
                :aria-current="isSameCalendarDate(day.date, today) ? 'date' : undefined"
                @focus="activeDate = day.date"
                @click="selectDay(day)"
                @keydown="handleDayKeydown($event, day)"
              >
                {{ day.date.day }}
              </button>
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </span>
</template>

<style scoped>
.form-date-picker {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
}

.form-date-picker__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: #ededed;
  text-align: left;
  cursor: pointer;
}

.form-date-picker__trigger[aria-expanded="true"] {
  border-color: #737373;
  background: #1a1a1a;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .055), 0 0 0 4px rgba(255, 255, 255, .055), 0 18px 50px rgba(0, 0, 0, .3);
}

.form-date-picker__trigger[aria-invalid="true"] {
  border-color: #737373;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), 0 0 0 4px rgba(255, 255, 255, .045);
}

.form-date-picker__trigger:disabled {
  color: #6f6f6f;
  border-color: #2b2b2b;
  background: #111;
  box-shadow: none;
  cursor: not-allowed;
}

.form-date-picker__placeholder {
  color: #707070;
}

.form-date-picker__icon {
  flex: 0 0 auto;
  color: #9a9a9a;
}

.form-date-picker__trigger:disabled .form-date-picker__icon {
  color: #454545;
}

.form-date-picker__popover {
  position: absolute;
  z-index: 200;
  top: calc(100% + 8px);
  width: min(304px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  padding: 12px;
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid #393939;
  border-radius: 14px;
  color: #ededed;
  background: #141414;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .06), 0 4px 10px rgba(0, 0, 0, .55), 0 30px 90px rgba(0, 0, 0, .82);
}

.form-date-picker__popover--up {
  top: auto;
  bottom: calc(100% + 8px);
}

.calendar-header {
  display: grid;
  grid-template-columns: 32px 1fr 32px;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.calendar-header strong {
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  letter-spacing: -.01em;
}

.calendar-header button {
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.calendar-header button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  padding: 0;
  border-radius: 8px;
  color: #a0a0a0;
}

.calendar-header button:hover:not(:disabled) {
  color: #fff;
  background: #262626;
}

.calendar-header button:disabled {
  color: #444;
  cursor: not-allowed;
}

.calendar-weekdays,
.calendar-week {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.calendar-weekdays {
  margin-bottom: 3px;
  color: #666;
  font-size: 9px;
  font-weight: 600;
  text-align: center;
}

.calendar-weekdays span {
  display: grid;
  height: 22px;
  place-items: center;
}

.calendar-grid {
  display: grid;
  gap: 2px;
}

.calendar-week {
  gap: 2px;
}

.calendar-cell {
  display: block;
  min-width: 0;
}

.calendar-week button {
  display: grid;
  width: 100%;
  min-width: 0;
  height: 32px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  color: #cfcfcf;
  background: transparent;
  font-size: 11px;
  font-weight: 520;
  cursor: pointer;
}

.calendar-week button:hover:not(:disabled):not(.calendar-day--selected) {
  color: #fff;
  background: #262626;
}

.calendar-week button:focus-visible,
.calendar-header button:focus-visible {
  position: relative;
  z-index: 1;
  outline: 2px solid #fff;
  outline-offset: 1px;
}

.calendar-week button.calendar-day--outside {
  color: #555;
}

.calendar-week button.calendar-day--today:not(.calendar-day--selected):not(:disabled) {
  color: #fff;
  box-shadow: inset 0 0 0 1px #666;
}

.calendar-week button.calendar-day--selected {
  color: #0b0b0b;
  background: #f0f0f0;
  font-weight: 700;
  box-shadow: inset 0 1px 0 #fff, 0 4px 12px rgba(0, 0, 0, .4);
}

.calendar-week button.calendar-day--selected:hover:not(:disabled) {
  color: #0b0b0b;
  background: #fff;
}

.calendar-week button:disabled {
  color: #3d3d3d;
  background: transparent;
  box-shadow: none;
  cursor: not-allowed;
}

.calendar-popover-enter-active,
.calendar-popover-leave-active {
  transition: opacity 130ms ease, transform 150ms cubic-bezier(.2, .8, .2, 1);
  transform-origin: top center;
}

.form-date-picker__popover--up.calendar-popover-enter-active,
.form-date-picker__popover--up.calendar-popover-leave-active {
  transform-origin: bottom center;
}

.calendar-popover-enter-from,
.calendar-popover-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(.985);
}

.form-date-picker__popover--up.calendar-popover-enter-from,
.form-date-picker__popover--up.calendar-popover-leave-to {
  transform: translateY(4px) scale(.985);
}

@media (max-width: 420px) {
  .form-date-picker__popover {
    padding: 10px;
    border-radius: 12px;
  }

  .calendar-week button {
    height: 34px;
  }
}
</style>
