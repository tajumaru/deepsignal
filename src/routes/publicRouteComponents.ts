import { lazy } from "react";
import {
  StaleLazyImportEpochError,
  resolveLazyRouteModuleWithSafariRetry,
  retryLazyImport,
} from "../lib/lazyRetry";
import { logRouteLifecycle } from "../lib/routeDiagnostics";

function suppressStaleLazyImport<T>(promise: Promise<T>, label: string) {
  return promise.catch((error) => {
    if (error instanceof StaleLazyImportEpochError) {
      logRouteLifecycle("lazy-import-stale-suppressed", {
        label,
        message: error.message,
      });
      return new Promise<T>(() => undefined);
    }
    throw error;
  });
}

export const publicRouteComponents = {
  TroubleshootingPage: lazy(() =>
    suppressStaleLazyImport(retryLazyImport(() => import("../pages/TroubleshootingPage"), "route-troubleshooting").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-troubleshooting"),
    ), "route-troubleshooting"),
  ),
  PublicFormPage: lazy(() =>
    suppressStaleLazyImport(retryLazyImport(() => import("../pages/PublicFormPage"), "route-public-form").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-public-form", "PublicFormPage"),
    ), "route-public-form"),
  ),
  PublicRoadmapPage: lazy(() =>
    suppressStaleLazyImport(retryLazyImport(() => import("../pages/PublicRoadmapPage"), "route-public-roadmap").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-public-roadmap", "PublicRoadmapPage"),
    ), "route-public-roadmap"),
  ),
  ManifestRestorePage: lazy(() =>
    suppressStaleLazyImport(retryLazyImport(() => import("../pages/ManifestRestorePage"), "route-manifest-restore").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-manifest-restore", "ManifestRestorePage"),
    ), "route-manifest-restore"),
  ),
  ZkLoginCallbackPage: lazy(() =>
    suppressStaleLazyImport(retryLazyImport(() => import("../pages/ZkLoginCallbackPage"), "route-zklogin-callback").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-zklogin-callback", "ZkLoginCallbackPage"),
    ), "route-zklogin-callback"),
  ),
};

export type PublicRouteComponents = typeof publicRouteComponents;
