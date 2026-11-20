export const APP_TIME_ZONE = "America/Sao_Paulo";

type CalendarParts = { year: number; month: number; day: number };

function calendarParts(date: Date, timeZone = APP_TIME_ZONE): CalendarParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

export function dateAtStartOfDay(
  year: number,
  month: number,
  day: number,
  timeZone = APP_TIME_ZONE,
): Date {
  const targetLocalAsUtc = Date.UTC(year, month - 1, day);
  let guess = targetLocalAsUtc;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const localAsUtc = Date.UTC(
      Number(parts.find((part) => part.type === "year")?.value),
      Number(parts.find((part) => part.type === "month")?.value) - 1,
      Number(parts.find((part) => part.type === "day")?.value),
      Number(parts.find((part) => part.type === "hour")?.value),
      Number(parts.find((part) => part.type === "minute")?.value),
      Number(parts.find((part) => part.type === "second")?.value),
    );
    const adjustment = targetLocalAsUtc - localAsUtc;
    guess += adjustment;
    if (adjustment === 0) break;
  }

  return new Date(guess);
}

export function startOfAppDay(date: Date): Date {
  const parts = calendarParts(date);
  return dateAtStartOfDay(parts.year, parts.month, parts.day);
}

export function startOfNextAppDay(date: Date): Date {
  const parts = calendarParts(date);
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return dateAtStartOfDay(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export function startOfAppMonth(date: Date): Date {
  const parts = calendarParts(date);
  return dateAtStartOfDay(parts.year, parts.month, 1);
}

export function startOfAppDate(date: Date): Date {
  return dateAtStartOfDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function startOfNextAppDate(date: Date): Date {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  return dateAtStartOfDay(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}
