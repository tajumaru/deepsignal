import { describe, expect, it } from "vitest";
import { lazyRouteExportSpecs } from "../lib/lazyRouteRegistry";

const routeModuleLoaders = {
  "route-access-management": () => import("../pages/AccessManagementPage"),
  "route-admin-dashboard": () => import("../pages/AdminDashboardPage"),
  "route-explore": () => import("../pages/ExploreSignalsPage"),
  "route-form-builder": () => import("../pages/FormBuilderPage"),
  "route-insights-fixture": () => import("../pages/InsightsFixturePage"),
  "route-manifest-restore": () => import("../pages/ManifestRestorePage"),
  "route-my-responses": () => import("../pages/MyResponsesPage"),
  "route-public-form": () => import("../pages/PublicFormPage"),
  "route-public-roadmap": () => import("../pages/PublicRoadmapPage"),
  "route-submission-detail": () => import("../pages/SubmissionDetailPage"),
  "route-submitted-history": () => import("../pages/SubmittedHistoryPage"),
  "route-troubleshooting": () => import("../pages/TroubleshootingPage"),
  "route-zklogin-callback": () => import("../pages/ZkLoginCallbackPage"),
} satisfies Record<keyof typeof lazyRouteExportSpecs, () => Promise<Record<string, unknown>>>;

describe("lazy route module export contract", () => {
  it.each(Object.entries(lazyRouteExportSpecs))("%s exports its expected route component", async (label, spec) => {
    const module = (await routeModuleLoaders[label as keyof typeof routeModuleLoaders]()) as Record<string, unknown>;
    expect(Object.keys(module).sort(), `${label} available exports`).toContain(spec.exportName);
    expect(module[spec.exportName], `${label} ${spec.exportName}`).toEqual(expect.any(Function));
  });
});
