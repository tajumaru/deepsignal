import { lazy } from "react";
import { retryLazyImport } from "../lib/lazyRetry";

export function createRouteComponents(retryNonce = 0) {
  void retryNonce;
  return {
    AccessManagementPage: lazy(() =>
      retryLazyImport(() => import("../pages/AccessManagementPage"), "route-access-management").then((module) => ({
        default: module.AccessManagementPage,
      })),
    ),
    LandingPage: lazy(() =>
      retryLazyImport(() => import("../pages/LandingPage"), "route-landing").then((module) => ({
        default: module.LandingPage,
      })),
    ),
    AdminDashboardPage: lazy(() =>
      retryLazyImport(() => import("../pages/AdminDashboardPage"), "route-admin-dashboard").then((module) => ({
        default: module.AdminDashboardPage,
      })),
    ),
    FormBuilderPage: lazy(() =>
      retryLazyImport(() => import("../pages/FormBuilderPage"), "route-form-builder").then((module) => ({
        default: module.FormBuilderPage,
      })),
    ),
    ManifestRestorePage: lazy(() =>
      retryLazyImport(() => import("../pages/ManifestRestorePage"), "route-manifest-restore").then((module) => ({
        default: module.ManifestRestorePage,
      })),
    ),
    PublicRoadmapPage: lazy(() =>
      retryLazyImport(() => import("../pages/PublicRoadmapPage"), "route-public-roadmap").then((module) => ({
        default: module.PublicRoadmapPage,
      })),
    ),
    SubmissionDetailPage: lazy(() =>
      retryLazyImport(() => import("../pages/SubmissionDetailPage"), "route-submission-detail").then((module) => ({
        default: module.SubmissionDetailPage,
      })),
    ),
    SubmittedHistoryPage: lazy(() =>
      retryLazyImport(() => import("../pages/SubmittedHistoryPage"), "route-submitted-history").then((module) => ({
        default: module.SubmittedHistoryPage,
      })),
    ),
    MyResponsesPage: lazy(() =>
      retryLazyImport(() => import("../pages/MyResponsesPage"), "route-my-responses").then((module) => ({
        default: module.MyResponsesPage,
      })),
    ),
    ExploreSignalsPage: lazy(() =>
      retryLazyImport(() => import("../pages/ExploreSignalsPage"), "route-explore").then((module) => ({
        default: module.ExploreSignalsPage,
      })),
    ),
    TroubleshootingPage: lazy(() =>
      retryLazyImport(() => import("../pages/TroubleshootingPage"), "route-troubleshooting").then((module) => ({
        default: module.TroubleshootingPage,
      })),
    ),
    InsightsFixturePage: lazy(() =>
      retryLazyImport(() => import("../pages/InsightsFixturePage"), "route-insights-fixture").then((module) => ({
        default: module.InsightsFixturePage,
      })),
    ),
    PublicFormPage: lazy(() =>
      retryLazyImport(() => import("../pages/PublicFormPage"), "route-public-form").then((module) => ({
        default: module.PublicFormPage,
      })),
    ),
    ZkLoginCallbackPage: lazy(() =>
      retryLazyImport(() => import("../pages/ZkLoginCallbackPage"), "route-zklogin-callback").then((module) => ({
        default: module.ZkLoginCallbackPage,
      })),
    ),
  };
}

export type AppRouteComponents = ReturnType<typeof createRouteComponents>;
