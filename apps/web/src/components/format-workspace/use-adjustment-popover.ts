import { useRef } from "react";

export function useAdjustmentPopover() {
  const containerRef = useRef<HTMLElement | null>(null);

  return {
    containerRef,
  };
}
