export type WidgetSettings = {
  width: number;
  height: number;
  x: number;
  y: number;
};

const SETTINGS_KEY = "calendar.widget.settings.v1";

const defaultSettings: WidgetSettings = {
  width: 380,
  height: 520,
  x: 24,
  y: 24,
};

function sanitizeSettings(settings: Partial<WidgetSettings>): WidgetSettings {
  // Keep widget bounds compact enough to never "black out" the desktop.
  const maxWidth = Math.max(300, Math.min(Math.floor(window.screen.availWidth * 0.7), 720));
  const maxHeight = Math.max(380, Math.min(Math.floor(window.screen.availHeight * 0.8), 900));
  const rawWidth = Number.isFinite(settings.width) ? (settings.width as number) : defaultSettings.width;
  const rawHeight = Number.isFinite(settings.height) ? (settings.height as number) : defaultSettings.height;
  const width = Math.min(Math.max(300, rawWidth), maxWidth);
  const height = Math.min(Math.max(380, rawHeight), maxHeight);
  const maxX = Math.max(0, window.screen.availWidth - width);
  const maxY = Math.max(0, window.screen.availHeight - height);
  const rawX = Number.isFinite(settings.x) ? (settings.x as number) : defaultSettings.x;
  const rawY = Number.isFinite(settings.y) ? (settings.y as number) : defaultSettings.y;
  const x = Math.min(Math.max(0, rawX), maxX);
  const y = Math.min(Math.max(0, rawY), maxY);

  return { width, height, x, y };
}

export function readWidgetSettings(): WidgetSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return defaultSettings;

  try {
    return sanitizeSettings(JSON.parse(raw) as Partial<WidgetSettings>);
  } catch {
    return defaultSettings;
  }
}

export function writeWidgetSettings(settings: WidgetSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
