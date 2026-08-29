export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface CalendarDay {
  date: CalendarDate;
  value: string;
  inMonth: boolean;
  disabled: boolean;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function utcTimestamp(date: CalendarDate) {
  const value = new Date(0);
  value.setUTCFullYear(date.year, date.month - 1, date.day);
  value.setUTCHours(0, 0, 0, 0);
  return value.getTime();
}

function fromUtcTimestamp(value: number): CalendarDate {
  const date = new Date(value);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function parseCalendarDate(value: string | undefined): CalendarDate | null {
  if (!value) return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;

  const parsed = fromUtcTimestamp(utcTimestamp({ year, month, day }));
  return parsed.year === year && parsed.month === month && parsed.day === day ? parsed : null;
}

export function formatCalendarDate(date: CalendarDate) {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function formatCalendarDisplayDate(date: CalendarDate) {
  return `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${String(date.year).padStart(4, "0")}`;
}

export function compareCalendarDates(left: CalendarDate, right: CalendarDate) {
  return utcTimestamp(left) - utcTimestamp(right);
}

export function isSameCalendarDate(left: CalendarDate | null, right: CalendarDate | null) {
  return Boolean(left && right && compareCalendarDates(left, right) === 0);
}

export function daysInCalendarMonth(year: number, month: number) {
  return fromUtcTimestamp(utcTimestamp({ year, month: month + 1, day: 0 })).day;
}

export function moveCalendarDay(date: CalendarDate, amount: number) {
  const moved = fromUtcTimestamp(utcTimestamp(date) + amount * 86_400_000);
  if (moved.year < 1) return { year: 1, month: 1, day: 1 };
  if (moved.year > 9999) return { year: 9999, month: 12, day: 31 };
  return moved;
}

export function moveCalendarMonth(date: CalendarDate, amount: number) {
  const monthIndex = Math.min(9999 * 12 + 11, Math.max(12, date.year * 12 + date.month - 1 + amount));
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12 + 1;
  return { year, month, day: Math.min(date.day, daysInCalendarMonth(year, month)) };
}

export function calendarWeekday(date: CalendarDate) {
  return (new Date(utcTimestamp(date)).getUTCDay() + 6) % 7;
}

export function clampCalendarDate(date: CalendarDate, min: CalendarDate | null, max: CalendarDate | null) {
  if (min && compareCalendarDates(date, min) < 0) return min;
  if (max && compareCalendarDates(date, max) > 0) return max;
  return date;
}

export function isCalendarDateDisabled(date: CalendarDate, min: CalendarDate | null, max: CalendarDate | null) {
  return Boolean(
    (min && compareCalendarDates(date, min) < 0)
    || (max && compareCalendarDates(date, max) > 0),
  );
}

export function getCalendarMonthGrid(view: CalendarDate, min: CalendarDate | null = null, max: CalendarDate | null = null) {
  const first = { year: view.year, month: view.month, day: 1 };
  const gridStart = moveCalendarDay(first, -calendarWeekday(first));

  return Array.from({ length: 42 }, (_, index): CalendarDay => {
    const date = moveCalendarDay(gridStart, index);
    return {
      date,
      value: formatCalendarDate(date),
      inMonth: date.year === view.year && date.month === view.month,
      disabled: isCalendarDateDisabled(date, min, max),
    };
  });
}
