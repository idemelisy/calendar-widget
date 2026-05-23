import { useEffect, useState, type FormEvent } from "react";
import type { CalendarEvent, EventDraftInput } from "../types";
import { ui } from "../locale/tr";

type EventEditorProps = {
  isOpen: boolean;
  mode: "create" | "edit";
  selectedDate: Date;
  editingEvent: CalendarEvent | null;
  onClose: () => void;
  onSave: (input: EventDraftInput) => Promise<void>;
  busy: boolean;
};

function defaultTimedRange(day: Date): { start: Date; end: Date } {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0, 0, 0);
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0, 0, 0);
  return { start, end };
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(s: string): Date {
  const [datePart, timePart] = s.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = (timePart ?? "09:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDateInputValue(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function EventEditor({
  isOpen,
  mode,
  selectedDate,
  editingEvent,
  onClose,
  onSave,
  busy,
}: EventEditorProps) {
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startTimed, setStartTimed] = useState("");
  const [endTimed, setEndTimed] = useState("");
  const [startDay, setStartDay] = useState("");
  const [endDay, setEndDay] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    if (mode === "edit" && editingEvent) {
      setTitle(editingEvent.title);
      setAllDay(Boolean(editingEvent.allDay));
      if (editingEvent.allDay) {
        const s = editingEvent.start.slice(0, 10);
        const e = editingEvent.end.slice(0, 10);
        setStartDay(s);
        setEndDay(e);
        setStartTimed(toDatetimeLocalValue(defaultTimedRange(selectedDate).start));
        setEndTimed(toDatetimeLocalValue(defaultTimedRange(selectedDate).end));
      } else {
        const s = new Date(editingEvent.start);
        const e = new Date(editingEvent.end);
        setStartTimed(toDatetimeLocalValue(s));
        setEndTimed(toDatetimeLocalValue(e));
        setStartDay(toDateInputValue(selectedDate));
        setEndDay(toDateInputValue(selectedDate));
      }
    } else {
      setTitle("");
      setAllDay(false);
      const { start, end } = defaultTimedRange(selectedDate);
      setStartTimed(toDatetimeLocalValue(start));
      setEndTimed(toDatetimeLocalValue(end));
      const ymd = toDateInputValue(selectedDate);
      setStartDay(ymd);
      setEndDay(ymd);
    }
  }, [isOpen, mode, editingEvent, selectedDate]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    let start: Date;
    let end: Date;
    if (allDay) {
      start = fromDateInputValue(startDay);
      end = fromDateInputValue(endDay);
      if (end < start) end = new Date(start);
    } else {
      start = fromDatetimeLocalValue(startTimed);
      end = fromDatetimeLocalValue(endTimed);
      if (end <= start) {
        end = new Date(start.getTime() + 60 * 60 * 1000);
      }
    }
    await onSave({
      title: title.trim() || ui.untitledEvent,
      allDay,
      start,
      end,
    });
  };

  return (
    <div className="event-editor-overlay" data-no-drag="true">
      <div className="event-editor-panel">
        <h4 className="event-editor-title">{mode === "create" ? ui.newEvent : ui.editEvent}</h4>
        <form onSubmit={(ev) => void handleSubmit(ev)}>
          <label className="event-editor-label">
            {ui.title}
            <input
              className="event-editor-input"
              value={title}
              onChange={(ev) => setTitle(ev.target.value)}
              placeholder={ui.titlePlaceholder}
              disabled={busy}
            />
          </label>
          <label className="event-editor-check">
            <input type="checkbox" checked={allDay} onChange={(ev) => setAllDay(ev.target.checked)} disabled={busy} />
            {ui.allDay}
          </label>
          {allDay ? (
            <div className="event-editor-row">
              <label className="event-editor-label">
                {ui.start}
                <input
                  type="date"
                  className="event-editor-input"
                  value={startDay}
                  onChange={(ev) => setStartDay(ev.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="event-editor-label">
                {ui.endInclusive}
                <input
                  type="date"
                  className="event-editor-input"
                  value={endDay}
                  onChange={(ev) => setEndDay(ev.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
          ) : (
            <div className="event-editor-row">
              <label className="event-editor-label">
                {ui.start}
                <input
                  type="datetime-local"
                  className="event-editor-input"
                  value={startTimed}
                  onChange={(ev) => setStartTimed(ev.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="event-editor-label">
                {ui.end}
                <input
                  type="datetime-local"
                  className="event-editor-input"
                  value={endTimed}
                  onChange={(ev) => setEndTimed(ev.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
          )}
          <div className="event-editor-actions">
            <button type="button" className="event-editor-btn secondary" onClick={onClose} disabled={busy}>
              {ui.cancel}
            </button>
            <button type="submit" className="event-editor-btn primary" disabled={busy}>
              {busy ? ui.saving : ui.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
