import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { EventList } from "./EventList";
import { EventEditor } from "./EventEditor";
import { MonthGrid } from "./MonthGrid";
import {
  createCalendarEvent,
  createGoogleOAuthUrl,
  deleteCalendarEvent,
  disconnectGoogle,
  loadCalendarEvents,
  markCalendarEventsOAuthScopeGranted,
  updateCalendarEvent,
} from "../services/calendarSync";
import type { CalendarEvent, EventDraftInput } from "../types";
import { useWidgetWindow } from "../hooks/useWidgetWindow";
import { readAuthSession, saveAuthSession } from "../services/authSession";
import { formatMonthYear, ui } from "../locale/tr";

/** Fixed loopback port so "Web application" OAuth clients can register an exact redirect URI in Google Cloud. */
const OAUTH_LOOPBACK_PORT = 43123;

/** Google redirects with ?error= / ?error_description= when the user denies or the request is invalid. */
function readGoogleOAuthErrorFromCallback(callbackUrl: string): string | null {
  const t = callbackUrl.trim();
  if (!t.includes("error=")) return null;
  try {
    const u = new URL(t);
    const err = u.searchParams.get("error");
    if (!err) return null;
    const rawDesc = u.searchParams.get("error_description");
    if (rawDesc) {
      try {
        return decodeURIComponent(rawDesc.replace(/\+/g, " "));
      } catch {
        return rawDesc.replace(/\+/g, " ");
      }
    }
    return err;
  } catch {
    return null;
  }
}

export function CalendarWidget() {
  const appWindow = getCurrentWindow();
  const today = useMemo(() => new Date(), []);
  const [displayedMonth, setDisplayedMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(() => Boolean(readAuthSession()));
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const { resizeStyle } = useWidgetWindow();

  const hasGoogleClient = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const canEditEvents = isConnected && hasGoogleClient;

  const toErrorMessage = (value: unknown): string => {
    if (value instanceof Error) return value.message;
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return "Unknown error";
    }
  };

  const refreshEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadCalendarEvents();
      setEvents(result);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load events.";
      setError(message);
    } finally {
      setLoading(false);
      setIsConnected(Boolean(readAuthSession()));
    }
  };

  const finishOAuth = async (callbackUrlOrCode: string, redirectUri: string) => {
    try {
      const oauthErrMsg = readGoogleOAuthErrorFromCallback(callbackUrlOrCode);
      if (oauthErrMsg) {
        throw new Error(oauthErrMsg);
      }

      const code = parseAuthorizationCode(callbackUrlOrCode);
      if (!code) {
        throw new Error("No authorization code found in callback URL.");
      }

      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
      const pkceCodeVerifier = localStorage.getItem("calendar.widget.pkce.verifier");
      if (!pkceCodeVerifier) {
        throw new Error("PKCE verifier not found. Please click Connect again.");
      }

      const tokenResponse = await invoke<{ access_token: string; refresh_token?: string; expires_in: number }>(
        "google_exchange_code",
        {
          code,
          codeVerifier: pkceCodeVerifier,
          clientId,
          redirectUri,
        },
      );

      localStorage.removeItem("calendar.widget.pkce.verifier");
      const existingSession = readAuthSession();
      saveAuthSession({
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || existingSession?.refreshToken || null,
        expiresAt: Date.now() + (tokenResponse.expires_in || 3600) * 1000,
      });
      markCalendarEventsOAuthScopeGranted();
      setIsConnected(true);
      setIsAuthorizing(false);
      setError(null);
      await refreshEvents();
    } catch (error) {
      localStorage.removeItem("calendar.widget.pkce.verifier");
      throw new Error(`OAuth finalize failed: ${toErrorMessage(error)}`);
    }
  };

  useEffect(() => {
    void refreshEvents();
    const interval = window.setInterval(() => {
      void refreshEvents();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  const moveMonth = (offset: number) => {
    setDisplayedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const monthTitle = formatMonthYear(displayedMonth);

  const connect = async () => {
    setError(null);
    try {
      const port = OAUTH_LOOPBACK_PORT;
      const redirectUri = `http://127.0.0.1:${port}/oauth`;
      const oauthUrl = await createGoogleOAuthUrl(redirectUri);
      const callbackPromise = invoke<string>("google_wait_for_oauth_code", { port });
      console.log("Opening OAuth URL:", oauthUrl);
      try {
        await open(oauthUrl);
      } catch (openError) {
        console.warn("Shell open failed, using window.open fallback:", openError);
        window.open(oauthUrl, "_blank", "noopener,noreferrer");
      }
      setIsAuthorizing(true);
      let callbackUrl: string;
      try {
        callbackUrl = await callbackPromise;
      } catch (invokeErr) {
        const msg = toErrorMessage(invokeErr);
        if (msg.includes("callback id") || msg.includes("Couldn't find callback")) {
          throw new Error(
            "Sign-in was interrupted (often after a hot reload). Close the app, run npm run tauri dev again, then click Connect.",
          );
        }
        throw invokeErr;
      }
      await finishOAuth(callbackUrl, redirectUri);
    } catch (connectError) {
      console.error("Connect error:", connectError);
      setIsConnected(false);
      setIsAuthorizing(false);
      setError(`Google connection failed: ${toErrorMessage(connectError)}`);
    }
  };

  function parseAuthorizationCode(input: string | null): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    if (!trimmed) return null;

    if (!trimmed.includes("=") && !trimmed.includes("://")) {
      return trimmed;
    }

    try {
      const url = new URL(trimmed);
      const code = url.searchParams.get("code");
      if (code) return code;
    } catch {
      // Not a valid URL, try other methods
    }

    const queryIndex = trimmed.indexOf("?");
    if (queryIndex >= 0) {
      const params = new URLSearchParams(trimmed.slice(queryIndex + 1));
      const code = params.get("code");
      if (code) return code;
    }

    return null;
  }

  const disconnect = async () => {
    disconnectGoogle();
    setIsConnected(false);
    setIsAuthorizing(false);
    setEditorOpen(false);
    setEditingEvent(null);
    await refreshEvents();
  };

  const openCreateEditor = () => {
    setEditorMode("create");
    setEditingEvent(null);
    setEditorOpen(true);
    setError(null);
  };

  const openEditEditor = (ev: CalendarEvent) => {
    setEditorMode("edit");
    setEditingEvent(ev);
    setEditorOpen(true);
    setError(null);
  };

  const closeEditor = () => {
    if (editorBusy) return;
    setEditorOpen(false);
    setEditingEvent(null);
  };

  const handleSaveEvent = async (input: EventDraftInput) => {
    setEditorBusy(true);
    setError(null);
    try {
      if (editorMode === "edit" && editingEvent) {
        await updateCalendarEvent(editingEvent.id, input);
      } else {
        await createCalendarEvent(input);
      }
      setEditorOpen(false);
      setEditingEvent(null);
      await refreshEvents();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setEditorBusy(false);
    }
  };

  const handleDeleteEvent = async (ev: CalendarEvent) => {
    if (!window.confirm(ui.deleteConfirm(ev.title))) return;
    setError(null);
    try {
      await deleteCalendarEvent(ev.id);
      await refreshEvents();
    } catch (err) {
      setError(toErrorMessage(err));
    }
  };

  const handleDragStart = async (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea, [data-no-drag='true']")) return;
    await appWindow.startDragging();
  };

  return (
    <div className="widget-card" style={resizeStyle} onMouseDown={handleDragStart}>
      <div className="drag-handle" data-tauri-drag-region onMouseDown={handleDragStart}>
        <span />
      </div>
      <div className="month-toolbar" data-tauri-drag-region onMouseDown={handleDragStart}>
        <button type="button" onClick={() => moveMonth(-1)} aria-label={ui.prevMonth}>
          {"<"}
        </button>
        <h2 data-tauri-drag-region>{monthTitle}</h2>
        <div className="month-toolbar-account" data-no-drag="true">
          {isConnected ? (
            <button type="button" onClick={disconnect}>
              {ui.disconnect}
            </button>
          ) : (
            <button type="button" onClick={connect}>
              {ui.connect}
            </button>
          )}
        </div>
        <button type="button" onClick={() => moveMonth(1)} aria-label={ui.nextMonth}>
          {">"}
        </button>
      </div>

      {loading ? <p className="status">{ui.refreshing}</p> : null}
      {isAuthorizing ? <p className="status">{ui.authorizing}</p> : null}
      {error ? <p className="status error">{error}</p> : null}

      <div className="widget-body calendar-container">
        <MonthGrid month={displayedMonth} selectedDate={selectedDate} events={events} onSelectDate={setSelectedDate} />
        <EventList
          selectedDate={selectedDate}
          events={events}
          canEdit={canEditEvents}
          onAdd={openCreateEditor}
          onEdit={openEditEditor}
          onDelete={handleDeleteEvent}
        />
      </div>

      <EventEditor
        isOpen={editorOpen}
        mode={editorMode}
        selectedDate={selectedDate}
        editingEvent={editingEvent}
        onClose={closeEditor}
        onSave={handleSaveEvent}
        busy={editorBusy}
      />
    </div>
  );
}
