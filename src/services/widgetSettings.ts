export const MIN_WIDGET_WIDTH = 480;
export const MIN_WIDGET_HEIGHT = 560;
export const DEFAULT_WIDGET_WIDTH = 540;
export const DEFAULT_WIDGET_HEIGHT = 760;

/** @deprecated Use DEFAULT_WIDGET_WIDTH */
export const WIDGET_WIDTH = DEFAULT_WIDGET_WIDTH;
/** @deprecated Use DEFAULT_WIDGET_HEIGHT */
export const WIDGET_MIN_HEIGHT = DEFAULT_WIDGET_HEIGHT;
/** @deprecated Use DEFAULT_WIDGET_HEIGHT */
export const WIDGET_HEIGHT = DEFAULT_WIDGET_HEIGHT;

export type WidgetSettings = {
  width: number;
  height: number;
  x: number;
  y: number;
};

const SETTINGS_KEY = "calendar.widget.settings.v1";

const defaultSettings: WidgetSettings = {
  width: DEFAULT_WIDGET_WIDTH,
  height: DEFAULT_WIDGET_HEIGHT,
  x: 24,
  y: 24,
};

function clampDimension(value: number, min: number, max: number, fallback: number): number {
  const raw = Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(min, raw), max);
}

function sanitizeSettings(settings: Partial<WidgetSettings>): WidgetSettings {
  const maxWidth = Math.max(MIN_WIDGET_WIDTH, Math.min(Math.floor(window.screen.availWidth * 0.85), 1200));
  const maxHeight = Math.max(MIN_WIDGET_HEIGHT, Math.min(Math.floor(window.screen.availHeight * 0.92), 1400));
  const width = clampDimension(settings.width as number, MIN_WIDGET_WIDTH, maxWidth, defaultSettings.width);
  const height = clampDimension(settings.height as number, MIN_WIDGET_HEIGHT, maxHeight, defaultSettings.height);
  const maxX = Math.max(0, window.screen.availWidth - width);
  const maxY = Math.max(0, window.screen.availHeight - height);
  const x = clampDimension(settings.x as number, 0, maxX, defaultSettings.x);
  const y = clampDimension(settings.y as number, 0, maxY, defaultSettings.y);

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
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings)));
}
