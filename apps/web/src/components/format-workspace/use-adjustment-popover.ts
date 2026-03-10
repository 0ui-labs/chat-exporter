import { useLayoutEffect, useRef, useState } from "react";

import {
  adjustableViews,
  type ViewMode,
} from "@/components/format-workspace/types";

export function useAdjustmentPopover(view: ViewMode, hasSelection: boolean) {
  const containerRef = useRef<HTMLElement | null>(null);

  const [containerDimensions, setContainerDimensions] = useState<{
    width: number;
    height: number;
  }>({
    width: 0,
    height: 0,
  });

  const isActive = adjustableViews.has(view) && hasSelection;

  useLayoutEffect(() => {
    const node = containerRef.current;

    if (!node || !isActive) {
      return;
    }

    const updateDimensions = () => {
      setContainerDimensions((current) => {
        const nextWidth = node.clientWidth;
        const nextHeight = node.clientHeight;

        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }

        return { width: nextWidth, height: nextHeight };
      });
    };

    updateDimensions();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateDimensions);

    resizeObserver?.observe(node);

    return () => {
      resizeObserver?.disconnect();
    };
  }, [isActive]);

  return {
    containerRef,
    containerDimensions,
  };
}
