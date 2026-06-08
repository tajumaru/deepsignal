import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { resolveLazyRouteModuleWithSafariRetry, retryLazyImport, suppressStaleLazyImport } from "../lib/lazyRetry";

function createLazyRouteComponent<TProps extends object = Record<string, never>>(
  loader: () => Promise<unknown>,
  label: string,
): LazyExoticComponent<ComponentType<TProps>> {
  return lazy(async () => {
    const module = await suppressStaleLazyImport(loader(), label);
    return module as { default: ComponentType<TProps> };
  });
}

export function createPublicRouteComponents(retryNonce = 0) {
  void retryNonce;
  return {
    PublicFormPage: createLazyRouteComponent(() =>
      retryLazyImport(() => import("../pages/PublicFormPage"), "route-public-form").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-public-form"),
      ),
      "route-public-form",
    ),
    PublicRoadmapPage: createLazyRouteComponent(() =>
      retryLazyImport(() => import("../pages/PublicRoadmapPage"), "route-public-roadmap").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-public-roadmap"),
      ),
      "route-public-roadmap",
    ),
    ManifestRestorePage: createLazyRouteComponent(() =>
      retryLazyImport(() => import("../pages/ManifestRestorePage"), "route-manifest-restore").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-manifest-restore"),
      ),
      "route-manifest-restore",
    ),
    ZkLoginCallbackPage: createLazyRouteComponent(() =>
      retryLazyImport(() => import("../pages/ZkLoginCallbackPage"), "route-zklogin-callback").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-zklogin-callback"),
      ),
      "route-zklogin-callback",
    ),
  };
}

export const publicRouteComponents = createPublicRouteComponents();

export type PublicRouteComponents = ReturnType<typeof createPublicRouteComponents>;
