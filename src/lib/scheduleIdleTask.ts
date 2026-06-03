export type IdleTaskCleanup = () => void;

export function scheduleIdleTask(task: () => void, fallbackDelayMs = 3000): IdleTaskCleanup {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  let completed = false;
  let idleHandle: number | undefined;

  const runTask = () => {
    if (completed) {
      return;
    }
    completed = true;
    if (typeof window === "undefined") {
      return;
    }
    if (idleHandle !== undefined && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(idleHandle);
    }
    if (timeoutHandle !== undefined) {
      window.clearTimeout(timeoutHandle);
    }
    task();
  };

  if ("requestIdleCallback" in window) {
    idleHandle = window.requestIdleCallback(() => runTask(), { timeout: fallbackDelayMs });
  }
  const timeoutHandle = window.setTimeout(runTask, fallbackDelayMs);
  return () => {
    completed = true;
    if (typeof window === "undefined") {
      return;
    }
    if (idleHandle !== undefined && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(idleHandle);
    }
    if (timeoutHandle !== undefined) {
      window.clearTimeout(timeoutHandle);
    }
  };
}
