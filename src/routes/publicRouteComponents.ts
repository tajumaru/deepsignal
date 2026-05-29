import { lazy } from "react";
import { retryLazyImport } from "../lib/lazyRetry";

export function createPublicRouteComponents(retryNonce = 0) {
  void retryNonce;
  return {
    PublicFormPage: lazy(() =>
      retryLazyImport(() => import("../pages/PublicFormPage"), "route-public-form").then((module) => ({
        default: module.PublicFormPage,
      })),
    ),
    PublicRoadmapPage: lazy(() =>
      retryLazyImport(() => import("../pages/PublicRoadmapPage"), "route-public-roadmap").then((module) => ({
        default: module.PublicRoadmapPage,
      })),
    ),
    ManifestRestorePage: lazy(() =>
      retryLazyImport(() => import("../pages/ManifestRestorePage"), "route-manifest-restore").then((module) => ({
        default: module.ManifestRestorePage,
      })),
    ),
    ZkLoginCallbackPage: lazy(() =>
      retryLazyImport(() => import("../pages/ZkLoginCallbackPage"), "route-zklogin-callback").then((module) => ({
        default: module.ZkLoginCallbackPage,
      })),
    ),
  };
}

export type PublicRouteComponents = ReturnType<typeof createPublicRouteComponents>;
