import { readAuthSession, saveAuthSession, clearAuthSession, isAuthExpired, refreshAccessToken } from "./authSession";
import { resolveEventColorFromId } from "../theme/googleCalendarColors";
import { ui } from "../locale/tr";
import { paletteColor } from "../theme/appPalette";
import type { CalendarEvent, EventDraftInput } from "../types";

export type CalendarSyncState = {
  events: CalendarEvent[];
  loading: boolean;
  error: string | null;
  isConnected: boolean;
};

const CALENDAR_PRIMARY = "primary";
const GOOGLE_EVENTS_API =
  `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_PRIMARY}/events?singleEvents=true&maxResults=250&orderBy=startTime`;
const PKCE_VERIFIER_KEY = "calendar.widget.pkce.verifier";

/** After upgrading OAuth scope, force consent until a successful sign-in sets this. */
const OAUTH_SCOPE_VERSION_KEY = "calendar.widget.oauth.scopeVersion";
const OAUTH_SCOPE_VERSION = "calendar.events-v1";

export const GOOGLE_CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function markCalendarEventsOAuthScopeGranted(): void {
  localStorage.setItem(OAUTH_SCOPE_VERSION_KEY, OAUTH_SCOPE_VERSION);
}

export function invalidateCalendarEventsOAuthScope(): void {
  localStorage.removeItem(OAUTH_SCOPE_VERSION_KEY);
}

function isCalendarEventsOAuthScopeGranted(): boolean {
  return localStorage.getItem(OAUTH_SCOPE_VERSION_KEY) === OAUTH_SCOPE_VERSION;
}

function formatDateOnlyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDaysLocal(d: Date, days: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + days);
  return x;
}

async function parseGoogleCalendarError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // ignore
  }
  return text.slice(0, 280) || `HTTP ${response.status}`;
}

function mapGoogleEventItem(item: {
  id: string;
  etag?: string;
  summary?: string;
  colorId?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}): CalendarEvent | null {
  if (!item.start?.dateTime && !item.start?.date) return null;
  const allDay = Boolean(item.start.date && !item.start.dateTime);
  if (allDay && item.start.date && item.end?.date) {
    const endInclusive = addDaysLocal(parseYmdLocal(item.end.date), -1);
    return {
      id: item.id,
      title: item.summary || ui.untitledEvent,
      start: `${item.start.date}T12:00:00.000Z`,
      end: `${formatDateOnlyLocal(endInclusive)}T12:00:00.000Z`,
      color: resolveEventColorFromId(item.id, item.colorId),
      etag: item.etag,
      allDay: true,
    };
  }
  return {
    id: item.id,
    title: item.summary || ui.untitledEvent,
    start: item.start!.dateTime ?? `${item.start!.date}T00:00:00.000Z`,
    end: item.end?.dateTime ?? `${item.end?.date}T00:00:00.000Z`,
    color: resolveEventColorFromId(item.id, item.colorId),
    etag: item.etag,
    allDay: false,
  };
}

function buildGoogleEventResource(input: EventDraftInput): Record<string, unknown> {
  if (input.allDay) {
    const startStr = formatDateOnlyLocal(input.start);
    const endExclusive = formatDateOnlyLocal(addDaysLocal(input.end, 1));
    return {
      summary: input.title.trim() || ui.untitledEvent,
      start: { date: startStr },
      end: { date: endExclusive },
    };
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  };
  return {
    summary: input.title.trim() || ui.untitledEvent,
    start: { dateTime: fmt(input.start), timeZone: tz },
    end: { dateTime: fmt(input.end), timeZone: tz },
  };
}

export async function createCalendarEvent(input: EventDraftInput): Promise<CalendarEvent> {
  const accessToken = await ensureValidToken();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_PRIMARY)}/events?sendUpdates=none`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildGoogleEventResource(input)),
  });
  if (!response.ok) {
    if (response.status === 401) {
      clearAuthSession();
      throw new Error("Google token expired/invalid (401). Please reconnect.");
    }
    if (response.status === 403) {
      invalidateCalendarEventsOAuthScope();
      throw new Error("Calendar write denied (403). Click Disconnect, then Connect again to grant event editing.");
    }
    throw new Error(await parseGoogleCalendarError(response));
  }
  const created = (await response.json()) as {
    id: string;
    etag?: string;
    summary?: string;
    colorId?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  };
  const mapped = mapGoogleEventItem(created);
  if (!mapped) throw new Error("Invalid event response from Google.");
  markCalendarEventsOAuthScopeGranted();
  return mapped;
}

export async function updateCalendarEvent(eventId: string, input: EventDraftInput): Promise<CalendarEvent> {
  const accessToken = await ensureValidToken();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_PRIMARY)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  // No If-Match: list etags are often stale or omitted; 412 breaks edits and feels like "need to reconnect".
  const response = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(buildGoogleEventResource(input)),
  });
  if (!response.ok) {
    if (response.status === 401) {
      clearAuthSession();
      throw new Error("Google token expired/invalid (401). Please reconnect.");
    }
    if (response.status === 412) {
      throw new Error("Could not save changes (event changed elsewhere). Refresh and try again.");
    }
    if (response.status === 403) {
      invalidateCalendarEventsOAuthScope();
      throw new Error("Calendar write denied (403). Click Disconnect, then Connect again to grant event editing.");
    }
    throw new Error(await parseGoogleCalendarError(response));
  }
  const updated = (await response.json()) as {
    id: string;
    etag?: string;
    summary?: string;
    colorId?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  };
  const mapped = mapGoogleEventItem(updated);
  if (!mapped) throw new Error("Invalid event response from Google.");
  markCalendarEventsOAuthScopeGranted();
  return mapped;
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const accessToken = await ensureValidToken();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_PRIMARY)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  //404/410 = already removed (idempotent); still counts as success for UX.
  if (response.status === 204 || response.status === 200 || response.status === 404 || response.status === 410) {
    markCalendarEventsOAuthScopeGranted();
    return;
  }
  if (response.status === 401) {
    clearAuthSession();
    throw new Error("Google token expired/invalid (401). Please reconnect.");
  }
  if (response.status === 403) {
    invalidateCalendarEventsOAuthScope();
    throw new Error("Calendar write denied (403). Click Disconnect, then Connect again to grant event editing.");
  }
  throw new Error(await parseGoogleCalendarError(response));
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode.apply(null, Array.from(array)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export async function createGoogleOAuthUrl(redirectUri: string): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) {
    throw new Error("Missing VITE_GOOGLE_CLIENT_ID. Add it to .env and restart the app.");
  }

  // Generate PKCE code verifier and challenge
  const codeVerifier = generateCodeVerifier();
  localStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const scope = encodeURIComponent(GOOGLE_CALENDAR_EVENTS_SCOPE);
  const existingSession = readAuthSession();
  const hasRefreshToken = Boolean(existingSession?.refreshToken);
  const scopeGranted = isCalendarEventsOAuthScopeGranted();
  // Must prompt when no session, or token may still be readonly-only until user re-consents with the new scope.
  const needsConsentPrompt = !hasRefreshToken || !scopeGranted;
  const oauthUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    "&response_type=code" +
    `&scope=${scope}` +
    "&access_type=offline" +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    "&code_challenge_method=S256" +
    "&include_granted_scopes=true" +
    (needsConsentPrompt ? "&prompt=consent" : "");
  return oauthUrl;
}

export function saveGoogleAccessToken(tokenInput: string): void {
  const token = parseAccessToken(tokenInput);
  if (!token) {
    throw new Error("No access token provided. Please complete Google sign-in and paste access_token or full URL.");
  }

  // Extract refresh token if present (from authorization code flow response)
  const refreshToken = parseRefreshToken(tokenInput);

  saveAuthSession({
    accessToken: token,
    refreshToken: refreshToken || null,
    expiresAt: Date.now() + 1000 * 60 * 55,
  });
}

export function disconnectGoogle(): void {
  clearAuthSession();
  localStorage.removeItem(OAUTH_SCOPE_VERSION_KEY);
}

export async function ensureValidToken(): Promise<string> {
  let session = readAuthSession();
  if (!session) {
    throw new Error("Not authenticated. Please connect Google Calendar.");
  }

  // Check if token is expired
  if (isAuthExpired(session)) {
    // Try to refresh using refresh token
    if (session.refreshToken) {
      const refreshed = await refreshAccessToken(session);
      if (refreshed) {
        session = refreshed;
      } else {
        // Refresh failed, clear session
        clearAuthSession();
        throw new Error("Session expired. Please reconnect Google Calendar.");
      }
    } else {
      // No refresh token, need to re-authenticate
      clearAuthSession();
      throw new Error("Session expired. Please reconnect Google Calendar.");
    }
  }

  return session.accessToken;
}

/** Wide window loaded once; month navigation uses cached events client-side. */
export function calendarFetchRange(): { timeMin: string; timeMax: string } {
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 13, 0);
  rangeEnd.setHours(23, 59, 59, 999);
  return { timeMin: rangeStart.toISOString(), timeMax: rangeEnd.toISOString() };
}

export async function loadCalendarEvents(): Promise<CalendarEvent[]> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  
  if (!clientId) {
    return buildMockEvents();
  }

  let accessToken: string;
  try {
    accessToken = await ensureValidToken();
  } catch {
    return [];
  }

  const { timeMin, timeMax } = calendarFetchRange();
  const query =
    `${GOOGLE_EVENTS_API}` +
    `&timeMin=${encodeURIComponent(timeMin)}` +
    `&timeMax=${encodeURIComponent(timeMax)}`;
  const response = await fetch(query, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Cache-Control": "no-cache",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 401) {
      clearAuthSession();
      throw new Error("Google token expired/invalid (401). Please reconnect.");
    }
    throw new Error(`Calendar API request failed (${response.status}). ${errorBody.slice(0, 180)}`);
  }

  const payload = (await response.json()) as {
    items?: Array<{
      id: string;
      etag?: string;
      summary?: string;
      colorId?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>;
  };

  const items = payload.items ?? [];
  return items.map((item) => mapGoogleEventItem(item)).filter((e): e is CalendarEvent => e !== null);
}

function parseAccessToken(input: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!trimmed.includes("access_token=")) return trimmed;

  const fragment = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  const fromHash = new URLSearchParams(fragment).get("access_token");
  if (fromHash) return fromHash;

  const hashIndex = trimmed.indexOf("#");
  if (hashIndex >= 0) {
    const hashParams = new URLSearchParams(trimmed.slice(hashIndex + 1));
    const fromUrlHash = hashParams.get("access_token");
    if (fromUrlHash) return fromUrlHash;
  }
  return null;
}

function parseRefreshToken(input: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Check in URL hash
  const fragment = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  const fromHash = new URLSearchParams(fragment).get("refresh_token");
  if (fromHash) return fromHash;

  // Check after hash in URL
  const hashIndex = trimmed.indexOf("#");
  if (hashIndex >= 0) {
    const hashParams = new URLSearchParams(trimmed.slice(hashIndex + 1));
    const fromUrlHash = hashParams.get("refresh_token");
    if (fromUrlHash) return fromUrlHash;
  }

  return null;
}

function buildMockEvents(): CalendarEvent[] {
  const today = new Date();
  const month = today;
  const iso = (offsetHours: number) => {
    const date = new Date(today);
    date.setHours(today.getHours() + offsetHours, 0, 0, 0);
    return date.toISOString();
  };
  const ymd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const retreatStart = new Date(month.getFullYear(), month.getMonth(), 8);
  const retreatEnd = new Date(month.getFullYear(), month.getMonth(), 11);
  const pastDay = new Date(today);
  pastDay.setDate(pastDay.getDate() - 5);

  return [
    { id: "m-1", title: "Sabah odak bloğu", start: iso(1), end: iso(2), color: paletteColor(0), allDay: false },
    { id: "m-2", title: "Ürün toplantısı", start: iso(4), end: iso(5), color: paletteColor(1), allDay: false },
    { id: "m-3", title: "Antrenman", start: iso(8), end: iso(9), color: paletteColor(2), allDay: false },
    {
      id: "m-4",
      title: "Ekip toplantısı",
      start: `${ymd(retreatStart)}T12:00:00.000Z`,
      end: `${ymd(retreatEnd)}T12:00:00.000Z`,
      color: paletteColor(3),
      allDay: true,
    },
    {
      id: "m-5",
      title: "Geçmiş değerlendirme",
      start: new Date(pastDay.getFullYear(), pastDay.getMonth(), pastDay.getDate(), 10, 0).toISOString(),
      end: new Date(pastDay.getFullYear(), pastDay.getMonth(), pastDay.getDate(), 11, 0).toISOString(),
      color: paletteColor(1),
      allDay: false,
    },
  ];
}
