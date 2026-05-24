import type { CalendarEvent } from "../types";

/** Stable string for comparing calendar payloads without triggering redundant UI updates. */
export function calendarEventsFingerprint(events: CalendarEvent[]): string {
  return events
    .map(
      (event) =>
        `${event.id}\t${event.title}\t${event.start}\t${event.end}\t${event.color ?? ""}\t${event.allDay ? 1 : 0}\t${event.etag ?? ""}`,
    )
    .sort()
    .join("\n");
}

export function calendarEventsEqual(a: CalendarEvent[], b: CalendarEvent[]): boolean {
  return calendarEventsFingerprint(a) === calendarEventsFingerprint(b);
}
