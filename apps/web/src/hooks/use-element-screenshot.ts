import { toPng } from "html-to-image";
import { useCallback } from "react";

/**
 * Captures a DOM element as a base64-encoded PNG screenshot.
 * Returns a stable `capture` function (element resolved at call time).
 */
export function useElementScreenshot() {
  const capture = useCallback(async (element: HTMLElement): Promise<string> => {
    const dataUrl = await toPng(element, {
      width: Math.min(element.scrollWidth, 800),
      pixelRatio: 1,
      cacheBust: true,
    });

    // Strip the data URL prefix to get raw base64
    return dataUrl.replace(/^data:image\/png;base64,/, "");
  }, []);

  return { capture };
}
