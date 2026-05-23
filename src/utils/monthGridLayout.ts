import type { CalendarEvent } from "../types";
import { eventCalendarBounds, eventOccursOnCalendarDay, eventSpansMultipleDays, ymdLocal } from "./eventOnDay";

export type WeekSpanSegment = {
  event: CalendarEvent;
  colStart: number;
  colSpan: number;
  lane: number;
  continuesFromPriorWeek: boolean;
  continuesIntoNextWeek: boolean;
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() > b.getTime() ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() < b.getTime() ? a : b;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function buildMonthGridDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  const mondayOffset = (first.getDay() + 6) % 7;
  start.setDate(1 - mondayOffset);

  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    days.push(addDays(start, i));
  }
  return days;
}

export function splitDaysIntoWeeks(days: Date[]): Date[][] {
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

export function singleDayEventsForDay(day: Date, events: CalendarEvent[]): CalendarEvent[] {
  return events
    .filter((event) => eventOccursOnCalendarDay(event, day) && !eventSpansMultipleDays(event))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export function buildWeekSpanSegments(weekDays: Date[], events: CalendarEvent[]): WeekSpanSegment[] {
  const weekStart = startOfDay(weekDays[0]);
  const weekEnd = startOfDay(weekDays[6]);

  const candidates = events
    .filter((event) => eventSpansMultipleDays(event))
    .filter((event) => {
      const { start, end } = eventCalendarBounds(event);
      return start <= weekEnd && end >= weekStart;
    })
    .sort((a, b) => {
      const aBounds = eventCalendarBounds(a);
      const bBounds = eventCalendarBounds(b);
      const byStart = aBounds.start.getTime() - bBounds.start.getTime();
      if (byStart !== 0) return byStart;
      const aLen = aBounds.end.getTime() - aBounds.start.getTime();
      const bLen = bBounds.end.getTime() - bBounds.start.getTime();
      return bLen - aLen;
    });

  const laneEnds: Date[] = [];
  const segments: WeekSpanSegment[] = [];

  for (const event of candidates) {
    const { start, end } = eventCalendarBounds(event);
    const segmentStart = maxDate(start, weekStart);
    const segmentEnd = minDate(end, weekEnd);

    const colStart = Math.max(0, Math.round((segmentStart.getTime() - weekStart.getTime()) / 86400000));
    const colEnd = Math.max(colStart, Math.round((segmentEnd.getTime() - weekStart.getTime()) / 86400000));
    const colSpan = colEnd - colStart + 1;

    let lane = 0;
    while (lane < laneEnds.length && segmentStart <= laneEnds[lane]) {
      lane += 1;
    }
    laneEnds[lane] = segmentEnd;

    segments.push({
      event,
      colStart: colStart + 1,
      colSpan,
      lane,
      continuesFromPriorWeek: ymdLocal(start) < ymdLocal(weekStart),
      continuesIntoNextWeek: ymdLocal(end) > ymdLocal(weekEnd),
    });
  }

  return segments;
}

export function weekLaneCount(segments: WeekSpanSegment[]): number {
  if (segments.length === 0) return 0;
  return Math.max(...segments.map((segment) => segment.lane)) + 1;
}
