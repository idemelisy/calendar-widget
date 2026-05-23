import { paletteColor } from "./appPalette";

/** Google Calendar API colorId → app palette. */
const GOOGLE_PALETTE: Record<string, number> = {
  "1": 2,
  "2": 1,
  "3": 2,
  "4": 3,
  "5": 0,
  "6": 3,
  "7": 1,
  "8": 2,
  "9": 2,
  "10": 1,
  "11": 3,
};

export function resolveEventColor(colorId: string | undefined, fallbackIndex = 0): string {
  if (!colorId) return paletteColor(fallbackIndex);
  const mapped = GOOGLE_PALETTE[colorId];
  return paletteColor(mapped ?? fallbackIndex);
}

export function resolveEventColorFromId(eventId: string, colorId?: string): string {
  if (colorId) return resolveEventColor(colorId);
  let hash = 0;
  for (let i = 0; i < eventId.length; i += 1) {
    hash = (hash + eventId.charCodeAt(i) * (i + 1)) % 997;
  }
  return paletteColor(hash);
}
