import { lazy } from "react";
import { resolveLazyRouteModule, retryLazyImport } from "../lib/lazyRetry";

export function createAppRouteComponents(retryNonce = 0) {
  void retryNonce;
  return {
    AccessManagementPage: lazy(() =>
      retryLazyImport(() => import("../pages/AccessManagementPage"), "route-access-management").then((module) =>
        resolveLazyRouteModule(module, "route-access-management"),
      ),
    ),
    LandingPage: lazy(() =>
      retryLazyImport(() => import("../pages/LandingPage"), "route-landing").then((module) =>
        resolveLazyRouteModule(module, "route-landing"),
      ),
    ),
    AdminDashboardPage: lazy(() =>
      retryLazyImport(() => import("../pages/AdminDashboardPage"), "route-admin-dashboard").then((module) =>
        resolveLazyRouteModule(module, "route-admin-dashboard"),
      ),
    ),
    FormBuilderPage: lazy(() =>
      retryLazyImport(() => import("../pages/FormBuilderPage"), "route-form-builder").then((module) =>
        resolveLazyRouteModule<{ initialSurface?: "home" | "composer" }>(module, "route-form-builder"),
      ),
    ),
    SubmissionDetailPage: lazy(() =>
      retryLazyImport(() => import("../pages/SubmissionDetailPage"), "route-submission-detail").then((module) =>
        resolveLazyRouteModule(module, "route-submission-detail"),
      ),
    ),
    SubmittedHistoryPage: lazy(() =>
      retryLazyImport(() => import("../pages/SubmittedHistoryPage"), "route-submitted-history").then((module) =>
        resolveLazyRouteModule(module, "route-submitted-history", "SubmittedHistoryPage"),
      ),
    ),
    MyResponsesPage: lazy(() =>
      retryLazyImport(() => import("../pages/MyResponsesPage"), "route-my-responses").then((module) =>
        resolveLazyRouteModule(module, "route-my-responses", "MyResponsesPage"),
      ),
    ),
    ExploreSignalsPage: lazy(() =>
      retryLazyImport(() => import("../pages/ExploreSignalsPage"), "route-explore").then((module) =>
        resolveLazyRouteModule(module, "route-explore"),
      ),
    ),
    TroubleshootingPage: lazy(() =>
      retryLazyImport(() => import("../pages/TroubleshootingPage"), "route-troubleshooting").then((module) =>
        resolveLazyRouteModule(module, "route-troubleshooting"),
      ),
    ),
    InsightsFixturePage: lazy(() =>
      retryLazyImport(() => import("../pages/InsightsFixturePage"), "route-insights-fixture").then((module) =>
        resolveLazyRouteModule(module, "route-insights-fixture"),
      ),
    ),
  };
}

export type AppRouteComponents = ReturnType<typeof createAppRouteComponents>;
