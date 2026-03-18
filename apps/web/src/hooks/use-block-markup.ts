import { useCallback } from "react";

type BlockMarkupInput = {
  /** The DOM element representing the rendered block */
  element: HTMLElement | null;
  /** The target format determines what kind of markup to extract */
  targetFormat: "reader" | "markdown";
  /** Optional: raw markdown source lines for markdown format */
  markdownSource?: string;
};

type UseBlockMarkupReturn = {
  /** Extract the current markup of the block */
  getMarkup: () => string;
};

export function useBlockMarkup(input: BlockMarkupInput): UseBlockMarkupReturn {
  const getMarkup = useCallback((): string => {
    if (input.targetFormat === "markdown" && input.markdownSource != null) {
      return input.markdownSource;
    }

    if (!input.element) {
      return "";
    }

    return input.element.innerHTML;
  }, [input.element, input.targetFormat, input.markdownSource]);

  return { getMarkup };
}
