import { useLayoutEffect, useState } from "react";

type PopoverDimensions = { height: number; width: number };

export function clamp(value: number, min: number, max: number) {
  if (max <= min) return min;
  return Math.min(Math.max(value, min), max);
}

export function getPopoverPosition(
  anchor: { top: number; left: number },
  dimensions: PopoverDimensions,
  containerDimensions: { width: number; height: number },
  containerScrollTop: number,
) {
  const margin = 16;
  const gap = 12;
  const maxWidth = Math.min(352, containerDimensions.width - margin * 2);
  const width = dimensions.width || maxWidth;
  const height = dimensions.height;
  const left = clamp(
    anchor.left,
    margin,
    containerDimensions.width - width - margin,
  );
  const preferredTop = anchor.top - height - gap;
  const top = clamp(
    preferredTop,
    containerScrollTop + margin,
    containerScrollTop + containerDimensions.height - height - margin,
  );
  return { left, maxWidth, top };
}

export function usePopoverPosition(
  popoverRef: React.RefObject<HTMLDivElement | null>,
  defaultWidth?: number,
) {
  const [dimensions, setDimensions] = useState<PopoverDimensions>({
    height: 0,
    width: defaultWidth ?? 352,
  });

  useLayoutEffect(() => {
    const node = popoverRef.current;
    if (!node) return;

    const updateDimensions = () => {
      const nextDimensions = {
        height: node.offsetHeight,
        width: node.offsetWidth,
      };
      setDimensions((current) => {
        if (
          current.height === nextDimensions.height &&
          current.width === nextDimensions.width
        ) {
          return current;
        }
        return nextDimensions;
      });
    };

    updateDimensions();

    if (typeof window === "undefined") return;

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateDimensions);
    resizeObserver?.observe(node);

    return () => {
      resizeObserver?.disconnect();
    };
  }, [popoverRef]);

  return dimensions;
}
