import { toPng } from "html-to-image";

type UseElementScreenshotReturn = {
  capture: () => Promise<string>;
};

export function useElementScreenshot(
  element: HTMLElement | null,
): UseElementScreenshotReturn {
  const capture = async (): Promise<string> => {
    if (!element) {
      throw new Error("No element provided for screenshot capture");
    }

    const dataUrl = await toPng(element, {
      width: Math.min(element.scrollWidth, 800),
      pixelRatio: 1,
      cacheBust: true,
    });

    // Strip the data URL prefix to get raw base64
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    return base64;
  };

  return { capture };
}
