import { lazy } from "react";
import { resolveLazyRouteModule, retryLazyImport } from "../lib/lazyRetry";

export function createPublicRouteComponents(retryNonce = 0) {
  void retryNonce;
  return {
    PublicFormPage: lazy(() =>
      retryLazyImport(() => import("../pages/PublicFormPage"), "route-public-form").then((module) =>
        resolveLazyRouteModule(module, "route-public-form"),
      ),
    ),
    PublicRoadmapPage: lazy(() =>
      retryLazyImport(() => import("../pages/PublicRoadmapPage"), "route-public-roadmap").then((module) =>
        resolveLazyRouteModule(module, "route-public-roadmap"),
      ),
    ),
    ManifestRestorePage: lazy(() =>
      retryLazyImport(() => import("../pages/ManifestRestorePage"), "route-manifest-restore").then((module) =>
        resolveLazyRouteModule(module, "route-manifest-restore"),
      ),
    ),
    ZkLoginCallbackPage: lazy(() =>
      retryLazyImport(() => import("../pages/ZkLoginCallbackPage"), "route-zklogin-callback").then((module) =>
        resolveLazyRouteModule(module, "route-zklogin-callback"),
      ),
    ),
  };
}

export type PublicRouteComponents = ReturnType<typeof createPublicRouteComponents>;
