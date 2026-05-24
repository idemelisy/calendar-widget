import type { CalendarEvent } from "../types";
import { eventFillColor } from "../theme/appPalette";
import { formatSelectedDate, formatTime, ui } from "../locale/tr";
import { eventOccursOnCalendarDay } from "../utils/eventOnDay";

type EventListProps = {
  selectedDate: Date;
  events: CalendarEvent[];
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
};

function formatRange(event: CalendarEvent): string {
  if (event.allDay) {
    const s = event.start.slice(0, 10);
    const e = event.end.slice(0, 10);
    if (s === e) return ui.allDay;
    return ui.allDayRange(s, e);
  }
  const start = new Date(event.start);
  const end = new Date(event.end);
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function EventList({ selectedDate, events, canEdit, onAdd, onEdit, onDelete }: EventListProps) {
  const matching = events
    .filter((event) => eventOccursOnCalendarDay(event, selectedDate))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const dateLabel = formatSelectedDate(selectedDate);

  return (
    <section className="event-list">
      <div className="event-list-header">
        <h3>{dateLabel}</h3>
        {canEdit ? (
          <button type="button" className="event-list-add" onClick={onAdd}>
            {ui.add}
          </button>
        ) : null}
      </div>
      {matching.length === 0 ? (
        <p className="event-empty">{ui.noEvents}</p>
      ) : (
        <ul>
          {matching.map((eventItem) => (
            <li key={eventItem.id} className="event-list-item">
              <span className="event-color" style={{ backgroundColor: eventFillColor(eventItem.color) }} />
              <div className="event-list-body">
                <strong>{eventItem.title}</strong>
                <p>{formatRange(eventItem)}</p>
              </div>
              {canEdit ? (
                <div className="event-list-actions" data-no-drag="true">
                  <button type="button" className="event-list-action" onClick={() => onEdit(eventItem)}>
                    {ui.edit}
                  </button>
                  <button type="button" className="event-list-action danger" onClick={() => onDelete(eventItem)}>
                    {ui.delete}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
