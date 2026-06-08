import { lazy } from "react";
import { resolveLazyRouteModuleWithSafariRetry, retryLazyImport } from "../lib/lazyRetry";

export const appRouteComponents = {
  AccessManagementPage: lazy(() =>
    retryLazyImport(() => import("../pages/AccessManagementPage"), "route-access-management").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-access-management"),
    ),
  ),
  AdminDashboardPage: lazy(() =>
    retryLazyImport(() => import("../pages/AdminDashboardPage"), "route-admin-dashboard").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-admin-dashboard"),
    ),
  ),
  FormBuilderPage: lazy(() =>
    retryLazyImport(() => import("../pages/FormBuilderPage"), "route-form-builder").then((module) =>
      resolveLazyRouteModuleWithSafariRetry<{ initialSurface?: "home" | "composer" }>(module, "route-form-builder"),
    ),
  ),
  SubmissionDetailPage: lazy(() =>
    retryLazyImport(() => import("../pages/SubmissionDetailPage"), "route-submission-detail").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-submission-detail"),
    ),
  ),
  SubmittedHistoryPage: lazy(() =>
    retryLazyImport(() => import("../pages/SubmittedHistoryPage"), "route-submitted-history").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-submitted-history", "SubmittedHistoryPage"),
    ),
  ),
  MyResponsesPage: lazy(() =>
    retryLazyImport(() => import("../pages/MyResponsesPage"), "route-my-responses").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-my-responses", "MyResponsesPage"),
    ),
  ),
  ExploreSignalsPage: lazy(() =>
    retryLazyImport(() => import("../pages/ExploreSignalsPage"), "route-explore").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-explore"),
    ),
  ),
  InsightsFixturePage: lazy(() =>
    retryLazyImport(() => import("../pages/InsightsFixturePage"), "route-insights-fixture").then((module) =>
      resolveLazyRouteModuleWithSafariRetry(module, "route-insights-fixture"),
    ),
  ),
};

export type AppRouteComponents = typeof appRouteComponents;
