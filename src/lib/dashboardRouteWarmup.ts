import { getExpectedRouteChunkUrl, getExpectedRouteCssUrls, retryLazyImport } from "./lazyRetry";
import { logRouteLifecycle } from "./routeDiagnostics";

const warmedAssetHrefs = new Set<string>();

function appendPreloadLink(rel: "modulepreload" | "preload", href: string, as?: "style") {
  if (typeof document === "undefined" || !href || warmedAssetHrefs.has(`${rel}:${href}`)) {
    return;
  }
  const existing = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"][href="${href}"]`);
  if (existing) {
    warmedAssetHrefs.add(`${rel}:${href}`);
    return;
  }
  const link = document.createElement("link");
  link.rel = rel;
  link.href = href;
  if (as) {
    link.as = as;
  }
  if (rel === "modulepreload") {
    link.crossOrigin = "";
  }
  document.head.appendChild(link);
  warmedAssetHrefs.add(`${rel}:${href}`);
}

function appendCssWarmupLink(href: string, source: string) {
  if (typeof document === "undefined" || !href || warmedAssetHrefs.has(`preload:${href}`)) {
    return;
  }
  const existing = document.head.querySelector<HTMLLinkElement>(`link[rel="preload"][href="${href}"]`);
  if (existing) {
    warmedAssetHrefs.add(`preload:${href}`);
    return;
  }
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "style";
  link.href = href;
  link.onerror = () => {
    logRouteLifecycle("dashboard-css-preload-warning", {
      attempt: 0,
      chunkUrl: null,
      cssUrl: href,
      label: "route-admin-dashboard",
      message: "Dashboard CSS warmup preload failed.",
      routePath: "/dashboard",
      warmupSource: source,
    });
  };
  document.head.appendChild(link);
  warmedAssetHrefs.add(`preload:${href}`);
}

export function warmDashboardRouteEntry(source: string) {
  if (typeof window === "undefined") {
    return;
  }

  void getExpectedRouteChunkUrl("route-admin-dashboard").then((chunkUrl) => {
    if (chunkUrl) {
      appendPreloadLink("modulepreload", chunkUrl);
    }
  });

  void getExpectedRouteCssUrls("route-admin-dashboard").then((cssUrls) => {
    cssUrls.forEach((cssUrl) => appendCssWarmupLink(cssUrl, source));
  });

  logRouteLifecycle("dashboard-import-warmup", {
    attempt: 0,
    chunkUrl: null,
    cssUrl: null,
    label: "route-admin-dashboard",
    routePath: "/dashboard",
    warmupSource: source,
  });

  void Promise.allSettled([
    retryLazyImport(() => import("../pages/AdminDashboardPage"), "prefetch-route-admin-dashboard"),
    import("../components/AppShell"),
    import("../lib/projectRegistry"),
    import("../storage/storageFactory"),
  ]);
}
