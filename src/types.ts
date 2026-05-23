export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  color?: string;
  /** From Calendar API; use with PATCH If-Match for concurrency. */
  etag?: string;
  /** True when API used `date` fields (all-day). */
  allDay?: boolean;
};

export type EventDraftInput = {
  title: string;
  allDay: boolean;
  start: Date;
  end: Date;
};
