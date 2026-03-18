import { useCallback, useEffect, useRef, useState } from "react";

export function usePlaceholderRotation(examples: string[], intervalMs: number) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const pausedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (examples.length <= 1) return;

    clearTimer();
    intervalRef.current = setInterval(() => {
      if (pausedRef.current) return;

      // Fade out briefly, swap text, fade back in
      setVisible(false);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setIndex((prev) => (prev + 1) % examples.length);
        setVisible(true);
      }, 150);
    }, intervalMs);
  }, [examples.length, intervalMs, clearTimer]);

  useEffect(() => {
    if (!pausedRef.current) {
      startTimer();
    }
    return clearTimer;
  }, [startTimer, clearTimer]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    clearTimer();
  }, [clearTimer]);

  const resume = useCallback(() => {
    pausedRef.current = false;
    startTimer();
  }, [startTimer]);

  return {
    placeholder: examples[index] ?? "",
    visible,
    pause,
    resume,
  };
}
