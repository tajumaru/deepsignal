export type RouteAssetKey =
  | "access"
  | "admin"
  | "create"
  | "explore"
  | "insightsFixture"
  | "landing"
  | "manifestRestore"
  | "publicForm"
  | "publicRoadmap"
  | "submissionDetail"
  | "submittedHistory"
  | "myResponses"
  | "troubleshooting"
  | "zkloginCallback";

export type RouteChunkSpec = {
  exportName: string;
  filePrefix: string;
  routeKey: RouteAssetKey;
  modulePath?: string;
};

export const lazyRouteExportSpecs = {
  "route-access-management": {
    exportName: "AccessManagementPage",
    filePrefix: "AccessManagementPage",
    modulePath: "../pages/AccessManagementPage",
    routeKey: "access",
  },
  "route-admin-dashboard": {
    exportName: "AdminDashboardPage",
    filePrefix: "AdminDashboardPage",
    modulePath: "../pages/AdminDashboardPage",
    routeKey: "admin",
  },
  "route-explore": {
    exportName: "ExploreSignalsPage",
    filePrefix: "ExploreSignalsPage",
    modulePath: "../pages/ExploreSignalsPage",
    routeKey: "explore",
  },
  "route-form-builder": {
    exportName: "FormBuilderPage",
    filePrefix: "FormBuilderPage",
    modulePath: "../pages/FormBuilderPage",
    routeKey: "create",
  },
  "route-insights-fixture": {
    exportName: "InsightsFixturePage",
    filePrefix: "InsightsFixturePage",
    modulePath: "../pages/InsightsFixturePage",
    routeKey: "insightsFixture",
  },
  "route-manifest-restore": {
    exportName: "ManifestRestorePage",
    filePrefix: "ManifestRestorePage",
    modulePath: "../pages/ManifestRestorePage",
    routeKey: "manifestRestore",
  },
  "route-my-responses": {
    exportName: "MyResponsesPage",
    filePrefix: "MyResponsesPage",
    modulePath: "../pages/MyResponsesPage",
    routeKey: "myResponses",
  },
  "route-public-form": {
    exportName: "PublicFormPage",
    filePrefix: "PublicFormPage",
    modulePath: "../pages/PublicFormPage",
    routeKey: "publicForm",
  },
  "route-public-roadmap": {
    exportName: "PublicRoadmapPage",
    filePrefix: "PublicRoadmapPage",
    modulePath: "../pages/PublicRoadmapPage",
    routeKey: "publicRoadmap",
  },
  "route-submission-detail": {
    exportName: "SubmissionDetailPage",
    filePrefix: "SubmissionDetailPage",
    modulePath: "../pages/SubmissionDetailPage",
    routeKey: "submissionDetail",
  },
  "route-submitted-history": {
    exportName: "SubmittedHistoryPage",
    filePrefix: "SubmittedHistoryPage",
    modulePath: "../pages/SubmittedHistoryPage",
    routeKey: "submittedHistory",
  },
  "route-troubleshooting": {
    exportName: "TroubleshootingPage",
    filePrefix: "TroubleshootingPage",
    modulePath: "../pages/TroubleshootingPage",
    routeKey: "troubleshooting",
  },
  "route-zklogin-callback": {
    exportName: "ZkLoginCallbackPage",
    filePrefix: "ZkLoginCallbackPage",
    modulePath: "../pages/ZkLoginCallbackPage",
    routeKey: "zkloginCallback",
  },
} as const satisfies Record<string, RouteChunkSpec>;

export const lazyChunkExportSpecs: Record<string, RouteChunkSpec> = {
  ...lazyRouteExportSpecs,
  "prefetch-route-admin-dashboard": {
    exportName: "AdminDashboardPage",
    filePrefix: "AdminDashboardPage",
    routeKey: "admin",
  },
  "prefetch-route-explore": {
    exportName: "ExploreSignalsPage",
    filePrefix: "ExploreSignalsPage",
    routeKey: "explore",
  },
  "app-shell": { exportName: "AppShell", filePrefix: "AppShell", routeKey: "admin" },
  "network-menu": { exportName: "NetworkMenu", filePrefix: "NetworkMenu", routeKey: "admin" },
  "wallet-runtime-panel": { exportName: "default", filePrefix: "WalletRuntimePanel", routeKey: "admin" },
  "wallet-providers": { exportName: "WalletProviders", filePrefix: "providers", routeKey: "admin" },
  "walrus-runtime-provider": { exportName: "WalrusRuntimeProvider", filePrefix: "WalrusRuntimeProvider", routeKey: "admin" },
};
