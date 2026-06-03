import { lazy } from "react";
import { resolveLazyRouteModuleWithSafariRetry, retryLazyImport } from "../lib/lazyRetry";

export function createPublicRouteComponents(retryNonce = 0) {
  void retryNonce;
  return {
    PublicFormPage: lazy(() =>
      retryLazyImport(() => import("../pages/PublicFormPage"), "route-public-form").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-public-form"),
      ),
    ),
    PublicRoadmapPage: lazy(() =>
      retryLazyImport(() => import("../pages/PublicRoadmapPage"), "route-public-roadmap").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-public-roadmap"),
      ),
    ),
    ManifestRestorePage: lazy(() =>
      retryLazyImport(() => import("../pages/ManifestRestorePage"), "route-manifest-restore").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-manifest-restore"),
      ),
    ),
    ZkLoginCallbackPage: lazy(() =>
      retryLazyImport(() => import("../pages/ZkLoginCallbackPage"), "route-zklogin-callback").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-zklogin-callback"),
      ),
    ),
  };
}

export type PublicRouteComponents = ReturnType<typeof createPublicRouteComponents>;
