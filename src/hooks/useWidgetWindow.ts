import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow, type PhysicalPosition, type PhysicalSize } from "@tauri-apps/api/window";
import {
  MIN_WIDGET_HEIGHT,
  MIN_WIDGET_WIDTH,
  readWidgetSettings,
  writeWidgetSettings,
} from "../services/widgetSettings";

export {
  DEFAULT_WIDGET_HEIGHT,
  DEFAULT_WIDGET_WIDTH,
  MIN_WIDGET_HEIGHT,
  MIN_WIDGET_WIDTH,
  WIDGET_HEIGHT,
  WIDGET_MIN_HEIGHT,
  WIDGET_WIDTH,
} from "../services/widgetSettings";

function applyWidgetCssVars(width: number, height: number): void {
  document.documentElement.style.setProperty("--widget-width", `${width}px`);
  document.documentElement.style.setProperty("--widget-height", `${height}px`);
}

export function useWidgetWindow() {
  const [size, setSize] = useState(() => {
    const settings = readWidgetSettings();
    return { width: settings.width, height: settings.height };
  });

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const settings = readWidgetSettings();
    applyWidgetCssVars(settings.width, settings.height);

    const bootstrap = async () => {
      await appWindow.setResizable(true);
      await appWindow.setSize({
        type: "Physical",
        width: settings.width,
        height: settings.height,
      } as PhysicalSize);
      await appWindow.setPosition({
        type: "Physical",
        x: settings.x,
        y: settings.y,
      } as PhysicalPosition);
    };

    const unlisten = Promise.all([
      appWindow.onMoved(async ({ payload }) => {
        writeWidgetSettings({ ...readWidgetSettings(), x: payload.x, y: payload.y });
      }),
      appWindow.onResized(async ({ payload }) => {
        const width = Math.max(payload.width, MIN_WIDGET_WIDTH);
        const height = Math.max(payload.height, MIN_WIDGET_HEIGHT);
        setSize({ width, height });
        applyWidgetCssVars(width, height);
        writeWidgetSettings({ ...readWidgetSettings(), width, height });
      }),
    ]);

    void bootstrap();
    return () => {
      void unlisten.then((listeners) => listeners.forEach((stop) => stop()));
    };
  }, []);

  const windowStyle = useMemo(
    () => ({
      width: `${size.width}px`,
      height: `${size.height}px`,
      minWidth: `${MIN_WIDGET_WIDTH}px`,
      minHeight: `${MIN_WIDGET_HEIGHT}px`,
      overflow: "hidden" as const,
    }),
    [size.height, size.width],
  );

  return { windowStyle };
}
