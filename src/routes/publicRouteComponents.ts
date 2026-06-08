import { lazy } from "react";
import { resolveLazyRouteModuleWithSafariRetry, retryLazyImport } from "../lib/lazyRetry";

export const publicRouteComponents = {
  TroubleshootingPage: lazy(() =>
    retryLazyImport(() => import("../pages/TroubleshootingPage"), "route-troubleshooting").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-troubleshooting"),
    ),
  ),
  PublicFormPage: lazy(() =>
    retryLazyImport(() => import("../pages/PublicFormPage"), "route-public-form").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-public-form", "PublicFormPage"),
    ),
  ),
  PublicRoadmapPage: lazy(() =>
    retryLazyImport(() => import("../pages/PublicRoadmapPage"), "route-public-roadmap").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-public-roadmap", "PublicRoadmapPage"),
    ),
  ),
  ManifestRestorePage: lazy(() =>
    retryLazyImport(() => import("../pages/ManifestRestorePage"), "route-manifest-restore").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-manifest-restore", "ManifestRestorePage"),
    ),
  ),
  ZkLoginCallbackPage: lazy(() =>
    retryLazyImport(() => import("../pages/ZkLoginCallbackPage"), "route-zklogin-callback").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-zklogin-callback", "ZkLoginCallbackPage"),
    ),
  ),
};

export type PublicRouteComponents = typeof publicRouteComponents;
