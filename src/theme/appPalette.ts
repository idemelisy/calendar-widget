/** App accent palette (user-provided). */
export const APP_PALETTE = ["#B4D02F", "#2FD09C", "#4B2FD0", "#D02F63"] as const;

export function paletteColor(index: number): string {
  return APP_PALETTE[((index % APP_PALETTE.length) + APP_PALETTE.length) % APP_PALETTE.length];
}

export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function eventFillColor(hex: string | undefined, fallbackIndex = 0): string {
  return hex ?? paletteColor(fallbackIndex);
}
