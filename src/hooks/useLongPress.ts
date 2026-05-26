import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseLongPressOptions {
  duration: number;
  allowMouse?: boolean;
  enabled?: boolean;
  moveThreshold?: number;
  onComplete: () => void;
  onStart?: () => void;
  onCancel?: () => void;
}

export function useLongPress<T extends HTMLElement>({
  duration,
  allowMouse = false,
  enabled = true,
  moveThreshold = 14,
  onComplete,
  onStart,
  onCancel,
}: UseLongPressOptions) {
  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const startPointRef = useRef({ x: 0, y: 0 });
  const completedRef = useRef(false);

  const stopFrames = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const reset = useCallback(
    (triggerCancel: boolean) => {
      const wasHolding = pointerIdRef.current !== null;
      stopFrames();
      pointerIdRef.current = null;
      startedAtRef.current = 0;
      setIsHolding(false);
      setProgress(0);
      if (triggerCancel && wasHolding && !completedRef.current) {
        onCancel?.();
      }
      completedRef.current = false;
    },
    [onCancel, stopFrames],
  );

  const tick = useCallback(() => {
    if (!startedAtRef.current) {
      return;
    }
    const nextProgress = Math.min((Date.now() - startedAtRef.current) / duration, 1);
    setProgress(nextProgress);
    if (nextProgress < 1) {
      frameRef.current = window.requestAnimationFrame(tick);
    }
  }, [duration]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (!enabled || (!allowMouse && event.pointerType === "mouse") || event.button !== 0 || pointerIdRef.current !== null) {
        return;
      }
      pointerIdRef.current = event.pointerId;
      startPointRef.current = { x: event.clientX, y: event.clientY };
      startedAtRef.current = Date.now();
      completedRef.current = false;
      setIsHolding(true);
      setProgress(0);
      onStart?.();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      frameRef.current = window.requestAnimationFrame(tick);
      timerRef.current = window.setTimeout(() => {
        completedRef.current = true;
        stopFrames();
        pointerIdRef.current = null;
        startedAtRef.current = 0;
        setIsHolding(false);
        setProgress(1);
        onComplete();
      }, duration);
    },
    [allowMouse, duration, enabled, onComplete, onStart, stopFrames, tick],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }
      const deltaX = event.clientX - startPointRef.current.x;
      const deltaY = event.clientY - startPointRef.current.y;
      if (Math.hypot(deltaX, deltaY) > moveThreshold) {
        reset(true);
      }
    },
    [moveThreshold, reset],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }
      reset(true);
    },
    [reset],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }
      reset(true);
    },
    [reset],
  );

  useEffect(() => {
    if (enabled) {
      return;
    }
    reset(false);
  }, [enabled, reset]);

  useEffect(() => () => reset(false), [reset]);

  return {
    isHolding,
    progress,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture: onPointerCancel,
    },
  };
}
