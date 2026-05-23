import { invoke } from "@tauri-apps/api/core";

export type AuthSession = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
};

const AUTH_KEY = "calendar.widget.auth.google.v1";

export function saveAuthSession(session: AuthSession): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

export function readAuthSession(): AuthSession | null {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AuthSession;
    return parsed;
  } catch {
    return null;
  }
}

export function isAuthExpired(session: AuthSession | null): boolean {
  if (!session) return true;
  return Date.now() >= session.expiresAt;
}

export function clearAuthSession(): void {
  localStorage.removeItem(AUTH_KEY);
}

export async function refreshAccessToken(session: AuthSession): Promise<AuthSession | null> {
  if (!session.refreshToken) return null;

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  if (!clientId) return null;

  try {
    const data = await invoke<{ access_token: string; expires_in: number; refresh_token?: string }>(
      "google_refresh_token",
      {
        refreshToken: session.refreshToken,
        clientId,
      },
    );

    const newSession: AuthSession = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || session.refreshToken,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };

    saveAuthSession(newSession);
    return newSession;
  } catch {
    clearAuthSession();
    return null;
  }
}
