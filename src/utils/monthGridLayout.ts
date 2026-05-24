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

function mondayBeforeOrOn(date: Date): Date {
  const monday = startOfDay(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return monday;
}

/** Days from `date` forward to the Sunday ending its ISO-style (Mon–Sun) week. */
function daysUntilSunday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 0 : 7 - day;
}

export function buildMonthGridDays(month: Date): Date[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);

  const start = mondayBeforeOrOn(first);
  const end = startOfDay(last);
  end.setDate(last.getDate() + daysUntilSunday(last));

  const days: Date[] = [];
  for (let current = startOfDay(start); current.getTime() <= end.getTime(); current = addDays(current, 1)) {
    days.push(new Date(current));
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

export type DayEventPlacement = {
  event: CalendarEvent;
  row: number;
};

/** One row per event, sorted by start time — prevents same-time events from overlapping. */
export function layoutSingleDayEvents(events: CalendarEvent[]): DayEventPlacement[] {
  return [...events]
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .map((event, row) => ({ event, row }));
}

function spanSegmentSort(a: WeekSpanSegment, b: WeekSpanSegment): number {
  if (a.lane !== b.lane) return a.lane - b.lane;
  if (a.continuesFromPriorWeek !== b.continuesFromPriorWeek) {
    return a.continuesFromPriorWeek ? -1 : 1;
  }
  return a.colStart - b.colStart;
}

export function spanZIndex(segment: WeekSpanSegment): number {
  const laneBase = (segment.lane + 1) * 10;
  const continuedPenalty = segment.continuesFromPriorWeek ? 0 : 5;
  return laneBase + continuedPenalty;
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

  return segments.sort(spanSegmentSort);
}

export function weekLaneCount(segments: WeekSpanSegment[]): number {
  if (segments.length === 0) return 0;
  return Math.max(...segments.map((segment) => segment.lane)) + 1;
}
