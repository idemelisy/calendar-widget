import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow, type PhysicalPosition, type PhysicalSize } from "@tauri-apps/api/window";
import { readWidgetSettings, writeWidgetSettings } from "../services/widgetSettings";

const MIN_WIDTH = 300;
const MIN_HEIGHT = 380;

export function useWidgetWindow() {
  const [size, setSize] = useState(() => {
    const settings = readWidgetSettings();
    return { width: settings.width, height: settings.height };
  });

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const settings = readWidgetSettings();

    const bootstrap = async () => {
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
        const current = readWidgetSettings();
        writeWidgetSettings({ ...current, x: payload.x, y: payload.y });
      }),
      appWindow.onResized(async ({ payload }) => {
        const boundedWidth = Math.max(payload.width, MIN_WIDTH);
        const boundedHeight = Math.max(payload.height, MIN_HEIGHT);
        setSize({ width: boundedWidth, height: boundedHeight });
        writeWidgetSettings({ ...readWidgetSettings(), width: boundedWidth, height: boundedHeight });
      }),
    ]);

    void bootstrap();
    return () => {
      void unlisten.then((listeners) => listeners.forEach((stop) => stop()));
    };
  }, []);

  const resizeStyle = useMemo(
    () => ({
      width: `${size.width}px`,
      height: `${size.height}px`,
      minWidth: `${MIN_WIDTH}px`,
      minHeight: `${MIN_HEIGHT}px`,
      resize: "both" as const,
      overflow: "hidden" as const,
    }),
    [size.height, size.width],
  );

  return { resizeStyle };
}
