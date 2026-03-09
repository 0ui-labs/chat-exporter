import { type RefObject, useLayoutEffect, useState } from "react";

export function useAdjustmentPopover(
  sectionRef: RefObject<HTMLElement | null>,
) {
  const [containerDimensions, setContainerDimensions] = useState<{
    width: number;
    height: number;
  }>({
    width: 0,
    height: 0,
  });

  useLayoutEffect(() => {
    const node = sectionRef.current;

    if (!node) {
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
  }, [sectionRef.current]);

  return {
    containerDimensions,
  };
}
