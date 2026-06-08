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

export function createAppRouteComponents(retryNonce = 0) {
  void retryNonce;
  return {
    AccessManagementPage: createLazyRouteComponent(() =>
      retryLazyImport(() => import("../pages/AccessManagementPage"), "route-access-management").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-access-management"),
      ),
      "route-access-management",
    ),
    AdminDashboardPage: createLazyRouteComponent(() =>
      retryLazyImport(() => import("../pages/AdminDashboardPage"), "route-admin-dashboard").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-admin-dashboard"),
      ),
      "route-admin-dashboard",
    ),
    FormBuilderPage: createLazyRouteComponent<{ initialSurface?: "home" | "composer" }>(() =>
      retryLazyImport(() => import("../pages/FormBuilderPage"), "route-form-builder").then((module) =>
        resolveLazyRouteModuleWithSafariRetry<{ initialSurface?: "home" | "composer" }>(module, "route-form-builder"),
      ),
      "route-form-builder",
    ),
    SubmissionDetailPage: createLazyRouteComponent(() =>
      retryLazyImport(() => import("../pages/SubmissionDetailPage"), "route-submission-detail").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-submission-detail"),
      ),
      "route-submission-detail",
    ),
    SubmittedHistoryPage: createLazyRouteComponent(() =>
      retryLazyImport(() => import("../pages/SubmittedHistoryPage"), "route-submitted-history").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-submitted-history", "SubmittedHistoryPage"),
      ),
      "route-submitted-history",
    ),
    MyResponsesPage: createLazyRouteComponent(() =>
      retryLazyImport(() => import("../pages/MyResponsesPage"), "route-my-responses").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-my-responses", "MyResponsesPage"),
      ),
      "route-my-responses",
    ),
    ExploreSignalsPage: createLazyRouteComponent(() =>
      retryLazyImport(() => import("../pages/ExploreSignalsPage"), "route-explore").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-explore"),
      ),
      "route-explore",
    ),
    TroubleshootingPage: createLazyRouteComponent(() =>
      retryLazyImport(() => import("../pages/TroubleshootingPage"), "route-troubleshooting").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-troubleshooting"),
      ),
      "route-troubleshooting",
    ),
    InsightsFixturePage: createLazyRouteComponent(() =>
      retryLazyImport(() => import("../pages/InsightsFixturePage"), "route-insights-fixture").then((module) =>
        resolveLazyRouteModuleWithSafariRetry(module, "route-insights-fixture"),
      ),
      "route-insights-fixture",
    ),
  };
}

export const appRouteComponents = createAppRouteComponents();

export type AppRouteComponents = ReturnType<typeof createAppRouteComponents>;
