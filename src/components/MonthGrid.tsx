import type { CalendarEvent } from "../types";
import { eventFillColor } from "../theme/appPalette";
import { formatTime, getWeekdayLabels } from "../locale/tr";
import { eventOccursOnCalendarDay } from "../utils/eventOnDay";
import {
  buildMonthGridDays,
  buildWeekSpanSegments,
  singleDayEventsForDay,
  splitDaysIntoWeeks,
  weekLaneCount,
} from "../utils/monthGridLayout";

type MonthGridProps = {
  month: Date;
  selectedDate: Date;
  events: CalendarEvent[];
  onSelectDate: (date: Date) => void;
};

const WEEKDAYS = getWeekdayLabels();

function toDateKey(value: Date): string {
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

function formatEventTimeLabel(ev: CalendarEvent): string {
  if (!ev || typeof ev !== "object") return "";
  if (ev.allDay === true) return "";
  const start = ev.start;
  if (typeof start !== "string") return "";
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return "";
  return formatTime(d);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function labelForEvent(ev: CalendarEvent, compact: boolean): string {
  const t = formatEventTimeLabel(ev);
  const label = t ? `${t} ${ev.title}` : ev.title;
  return truncate(label, compact ? 9 : 14);
}

export function MonthGrid({ month, selectedDate, events, onSelectDate }: MonthGridProps) {
  const days = buildMonthGridDays(month);
  const weeks = splitDaysIntoWeeks(days);
  const todayKey = toDateKey(new Date());
  const selectedKey = toDateKey(selectedDate);

  return (
    <div className="month-grid-shell">
      <div className="month-grid-head">
        {WEEKDAYS.map((label) => (
          <div key={label} className="month-grid-head-cell">
            <span className="month-grid-head-dow" title={label}>
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="month-grid">
        {weeks.map((weekDays, weekIndex) => {
          const spanSegments = buildWeekSpanSegments(weekDays, events);
          const laneCount = weekLaneCount(spanSegments);

          return (
            <div key={weekIndex} className="month-grid-week">
              {weekDays.map((day) => {
                const dayKey = toDateKey(day);
                const inCurrentMonth = day.getMonth() === month.getMonth();
                const isToday = dayKey === todayKey;
                const isSelected = dayKey === selectedKey;
                const dayEvents = singleDayEventsForDay(day, events);
                const compact = dayEvents.length > 2;
                const summaryTitle = events
                  .filter((event) => eventOccursOnCalendarDay(event, day))
                  .map((event) => {
                    const t = formatEventTimeLabel(event);
                    return t ? `${t} ${event.title}` : event.title;
                  })
                  .join("\n");

                return (
                  <button
                    key={dayKey}
                    type="button"
                    className={[
                      "day-cell",
                      inCurrentMonth ? "" : "muted",
                      isToday ? "today" : "",
                      isSelected ? "selected" : "",
                      compact ? "day-cell--compact-events" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    title={summaryTitle || undefined}
                    onClick={() => onSelectDate(day)}
                  >
                    <span className="day-cell-number">{day.getDate()}</span>
                    {laneCount > 0 ? (
                      <div
                        className="day-cell-span-slots"
                        style={{ ["--span-lanes" as string]: String(laneCount) }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <div className="day-cell-events">
                      {dayEvents.map((ev) => {
                        const full = (() => {
                          const t = formatEventTimeLabel(ev);
                          return t ? `${t} ${ev.title}` : ev.title;
                        })();
                        return (
                          <div
                            key={ev.id}
                            className="day-event-pill"
                            style={{ backgroundColor: eventFillColor(ev.color) }}
                            title={full}
                          >
                            {labelForEvent(ev, compact)}
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
              {spanSegments.length > 0 ? (
                <div
                  className="week-span-layer"
                  style={{ ["--span-lanes" as string]: String(laneCount) }}
                >
                  {spanSegments.map((segment) => {
                    const { event, colStart, colSpan, lane, continuesFromPriorWeek, continuesIntoNextWeek } =
                      segment;
                    const showTitle = !continuesFromPriorWeek;
                    return (
                      <div
                        key={`${event.id}-${weekIndex}-${lane}`}
                        className={[
                          "day-event-span",
                          continuesFromPriorWeek ? "day-event-span--continued" : "",
                          continuesIntoNextWeek ? "day-event-span--continues" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{
                          gridColumn: `${colStart} / span ${colSpan}`,
                          gridRow: lane + 1,
                          backgroundColor: eventFillColor(event.color),
                        }}
                        title={event.title}
                      >
                        {showTitle ? truncate(event.title, colSpan > 2 ? 24 : 10) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
