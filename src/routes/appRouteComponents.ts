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

export const appRouteComponents = {
  AccessManagementPage: lazy(() =>
    suppressStaleLazyImport(retryLazyImport(() => import("../pages/AccessManagementPage"), "route-access-management").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-access-management"),
    ), "route-access-management"),
  ),
  AdminDashboardPage: lazy(() =>
    suppressStaleLazyImport(retryLazyImport(() => import("../pages/AdminDashboardPage"), "route-admin-dashboard").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-admin-dashboard"),
    ), "route-admin-dashboard"),
  ),
  FormBuilderPage: lazy(() =>
    suppressStaleLazyImport(retryLazyImport(() => import("../pages/FormBuilderPage"), "route-form-builder").then((module) =>
      resolveLazyRouteModuleWithSafariRetry<{ initialSurface?: "home" | "composer" }>(module, "route-form-builder"),
    ), "route-form-builder"),
  ),
  SubmissionDetailPage: lazy(() =>
    suppressStaleLazyImport(retryLazyImport(() => import("../pages/SubmissionDetailPage"), "route-submission-detail").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-submission-detail"),
    ), "route-submission-detail"),
  ),
  SubmittedHistoryPage: lazy(() =>
    suppressStaleLazyImport(retryLazyImport(() => import("../pages/SubmittedHistoryPage"), "route-submitted-history").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-submitted-history", "SubmittedHistoryPage"),
    ), "route-submitted-history"),
  ),
  MyResponsesPage: lazy(() =>
    suppressStaleLazyImport(retryLazyImport(() => import("../pages/MyResponsesPage"), "route-my-responses").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-my-responses", "MyResponsesPage"),
    ), "route-my-responses"),
  ),
  ExploreSignalsPage: lazy(() =>
    suppressStaleLazyImport(retryLazyImport(() => import("../pages/ExploreSignalsPage"), "route-explore").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-explore"),
    ), "route-explore"),
  ),
  InsightsFixturePage: lazy(() =>
    suppressStaleLazyImport(retryLazyImport(() => import("../pages/InsightsFixturePage"), "route-insights-fixture").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-insights-fixture"),
    ), "route-insights-fixture"),
  ),
};

export type AppRouteComponents = typeof appRouteComponents;
