import { buildInfo } from "./buildInfo";
import {
  getBrowserCapabilitiesSnapshot,
  getCurrentRoutePath,
  logRouteLifecycle,
} from "./routeDiagnostics";

declare global {
  interface Window {
    __DEEPSIGNAL_DASHBOARD_ADVANCED_STARTED_AT__?: number;
  }
}

function nowMs() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function getAdvancedStartedAt() {
  if (typeof window === "undefined") {
    return nowMs();
  }
  window.__DEEPSIGNAL_DASHBOARD_ADVANCED_STARTED_AT__ ??= nowMs();
  return window.__DEEPSIGNAL_DASHBOARD_ADVANCED_STARTED_AT__;
}

export function markDashboardAdvancedTimingStart(routePath: string, details: Record<string, unknown> = {}) {
  if (typeof window === "undefined") {
    return;
  }
  window.__DEEPSIGNAL_DASHBOARD_ADVANCED_STARTED_AT__ = nowMs();
  recordDashboardAdvancedTiming("dashboard:advanced-click", {
    ...details,
    durationMs: 0,
    routePath,
  });
}

export function recordDashboardAdvancedTiming(event: string, details: Record<string, unknown> = {}) {
  if (typeof window === "undefined") {
    return;
  }
  const now = nowMs();
  const startedAt = getAdvancedStartedAt();
  const capabilities = getBrowserCapabilitiesSnapshot();
  logRouteLifecycle(event, {
    buildVersion: buildInfo.appVersion,
    deltaMs: Math.round(now - startedAt),
    durationMs: details.durationMs ?? null,
    mobileSafari: Boolean(capabilities.mobileSafari),
    routePath: getCurrentRoutePath(),
    ...details,
  });
}
