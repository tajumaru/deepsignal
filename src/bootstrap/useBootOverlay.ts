import { Fragment, createElement, useCallback, useEffect, type ReactNode } from "react";
import { endPerf, markPerfMilestone } from "../lib/perf";

declare global {
  interface Window {
    __DEEPSIGNAL_BOOT_STARTED_AT__?: number;
  }
}

export const BOOT_MIN_VISIBLE_MS = 1250;
export const BOOT_EXIT_DURATION_MS = 380;
export const BOOT_FAILSAFE_MS = 2500;

export function InitialBootReady({
  onReady,
  routePath,
  workspaceReady = true,
  children,
}: {
  onReady: () => void;
  routePath: string;
  workspaceReady?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    endPerf("app_boot_start", "ok", routePath);
    endPerf("app:render", "ok");
    markPerfMilestone("route_ready", routePath);
    markPerfMilestone("route:interactive", routePath);
    onReady();
  }, [onReady, routePath]);

  useEffect(() => {
    if (!workspaceReady) {
      return;
    }
    markPerfMilestone("workspace:ready", routePath);
  }, [routePath, workspaceReady]);

  return createElement(Fragment, null, children);
}

export function useBootOverlay({
  bootDismissed,
  initialRouteReady,
  routeIsLanding,
  setBootDismissed,
}: {
  bootDismissed: boolean;
  initialRouteReady: boolean;
  routeIsLanding: boolean;
  setBootDismissed: (value: boolean) => void;
}) {
  const dismissBootOverlay = useCallback(() => {
    document.getElementById("boot-overlay")?.remove();
    document.body.classList.remove("booting");
    setBootDismissed(true);
  }, [setBootDismissed]);

  useEffect(() => {
    const failsafe = window.setTimeout(dismissBootOverlay, BOOT_FAILSAFE_MS);

    return () => window.clearTimeout(failsafe);
  }, [dismissBootOverlay]);

  useEffect(() => {
    if (!initialRouteReady || bootDismissed) {
      return undefined;
    }

    const bootOverlay = document.getElementById("boot-overlay");
    const bootStatus = document.querySelector<HTMLElement>("[data-boot-status]");
    if (!bootOverlay) {
      dismissBootOverlay();
      return undefined;
    }

    const startedAt = window.__DEEPSIGNAL_BOOT_STARTED_AT__ ?? performance.now();
    const elapsed = performance.now() - startedAt;
    const delay = routeIsLanding ? 0 : Math.max(0, BOOT_MIN_VISIBLE_MS - elapsed);
    let exitTimer = 0;

    const finalize = window.setTimeout(() => {
      if (bootStatus && !routeIsLanding) {
        bootStatus.textContent = "Opening encrypted signal workspace...";
      }
      bootOverlay.setAttribute("data-state", "exiting");

      exitTimer = window.setTimeout(() => {
        dismissBootOverlay();
      }, BOOT_EXIT_DURATION_MS);
    }, delay);

    return () => {
      window.clearTimeout(finalize);
      window.clearTimeout(exitTimer);
    };
  }, [bootDismissed, dismissBootOverlay, initialRouteReady, routeIsLanding]);
}
