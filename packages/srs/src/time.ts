import type { StudyDayOptions } from "./types";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timezone, formatter);
  }
  return formatter;
}

function localParts(instant: Date, timezone: string) {
  const parts = Object.fromEntries(
    formatterFor(timezone)
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
  };
}

function calendarDay(year: number, month: number, day: number, delta: number): string {
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;
}

export function assertIanaTimezone(timezone: string): string {
  try {
    formatterFor(timezone).format(new Date(0));
    return timezone;
  } catch {
    throw new Error(`Invalid IANA time zone: ${timezone}`);
  }
}

export function studyDayFor(instantInput: Date | string, options: StudyDayOptions): string {
  const instant = instantInput instanceof Date ? instantInput : new Date(instantInput);
  if (Number.isNaN(instant.getTime())) throw new Error("Study-day instant must be a valid date.");
  const timezone = assertIanaTimezone(options.timezone);
  if (
    !Number.isInteger(options.studyDayStartMinutes) ||
    options.studyDayStartMinutes < 0 ||
    options.studyDayStartMinutes > 1_439
  ) {
    throw new Error("Study-day start must be an integer from 0 through 1439.");
  }

  const parts = localParts(instant, timezone);
  const localMinute = parts.hour * 60 + parts.minute;
  return calendarDay(
    parts.year,
    parts.month,
    parts.day,
    localMinute < options.studyDayStartMinutes ? -1 : 0,
  );
}

export function nextStudyDayBoundary(instantInput: Date | string, options: StudyDayOptions): Date {
  const instant = instantInput instanceof Date ? new Date(instantInput) : new Date(instantInput);
  const currentStudyDay = studyDayFor(instant, options);
  let lower = instant.getTime() + 1;
  let upper = instant.getTime() + 48 * 60 * 60 * 1_000;

  while (upper - lower > 1_000) {
    const middle = Math.floor((lower + upper) / 2);
    if (studyDayFor(new Date(middle), options) === currentStudyDay) lower = middle + 1;
    else upper = middle;
  }

  return new Date(Math.floor(upper / 1_000) * 1_000);
}

export function studyDayBoundaryFor(studyDay: string, options: StudyDayOptions): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(studyDay)) throw new Error("Study day must use YYYY-MM-DD.");
  const anchor = new Date(`${studyDay}T00:00:00.000Z`);
  if (Number.isNaN(anchor.getTime()) || anchor.toISOString().slice(0, 10) !== studyDay)
    throw new Error("Study day must be a real calendar date.");
  let lower = anchor.getTime() - 48 * 60 * 60 * 1_000;
  let upper = anchor.getTime() + 48 * 60 * 60 * 1_000;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (studyDayFor(new Date(middle), options) < studyDay) lower = middle + 1;
    else upper = middle;
  }
  if (studyDayFor(new Date(lower), options) !== studyDay)
    throw new Error("Study-day boundary could not be resolved.");
  return new Date(lower);
}

export function formatInterval(seconds: number): string {
  const bounded = Math.max(0, Math.round(seconds));
  if (bounded < 60) return `${bounded}s`;
  if (bounded < 3_600) return `${Math.round(bounded / 60)}m`;
  if (bounded < 86_400) return `${Math.round(bounded / 3_600)}h`;
  if (bounded < 2_592_000) return `${Math.round(bounded / 86_400)}d`;
  if (bounded < 31_536_000) return `${Math.round(bounded / 2_592_000)}mo`;
  return `${(bounded / 31_536_000).toFixed(1)}y`;
}
