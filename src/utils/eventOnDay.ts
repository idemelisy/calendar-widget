import type { CalendarEvent } from "../types";

export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDayLocal(d: Date): Date {
  const x = startOfDayLocal(d);
  x.setDate(x.getDate() + 1);
  return x;
}

/** Inclusive local calendar start/end for an event. */
export function eventCalendarBounds(event: CalendarEvent): { start: Date; end: Date } {
  if (event.allDay) {
    const start = startOfDayLocal(new Date(`${event.start.slice(0, 10)}T12:00:00`));
    const end = startOfDayLocal(new Date(`${event.end.slice(0, 10)}T12:00:00`));
    return { start, end };
  }
  const start = new Date(event.start);
  const end = new Date(event.end);
  return { start: startOfDayLocal(start), end: startOfDayLocal(end) };
}

/** Whether `event` should appear on the given calendar day (local). */
export function eventOccursOnCalendarDay(event: CalendarEvent, day: Date): boolean {
  const dayStart = startOfDayLocal(day);
  const dayEnd = endOfDayLocal(day);

  if (event.allDay) {
    const startStr = event.start.slice(0, 10);
    const endStr = event.end.slice(0, 10);
    const dStr = ymdLocal(day);
    return dStr >= startStr && dStr <= endStr;
  }

  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);
  return eventStart < dayEnd && eventEnd > dayStart;
}

/** True when the event covers more than one calendar day. */
export function eventSpansMultipleDays(event: CalendarEvent): boolean {
  const { start, end } = eventCalendarBounds(event);
  return ymdLocal(start) !== ymdLocal(end);
}
