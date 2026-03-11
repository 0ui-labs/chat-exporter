export function clamp(value: number, min: number, max: number) {
  if (max <= min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculates a stable popover position. No measurement needed — the width is
 * fixed (28rem) and height is handled by CSS `transform: translateY(-100%)`.
 */
export function getPopoverPosition(
  anchor: { top: number; left: number },
  containerDimensions: { width: number; height: number },
  containerScrollTop: number,
) {
  const margin = 16;
  const gap = 12;
  const maxWidth = Math.min(448, containerDimensions.width - margin * 2);
  const left = clamp(
    anchor.left,
    margin,
    containerDimensions.width - maxWidth - margin,
  );

  // Stable anchor: bottom of popover sits gap-px above the selected block.
  // translateY(-100%) on the element makes it grow upward from this point.
  const top = anchor.top - gap;

  // Limit height so the popover doesn't overflow above the visible area.
  const maxHeight = Math.max(200, top - containerScrollTop - margin);

  return { left, maxHeight, maxWidth, top };
}
