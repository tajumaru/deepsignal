import { lazy, Suspense, useState } from "react";
import { useLocation } from "react-router-dom";
import { InitialBootReady, useBootOverlay } from "./bootstrap/useBootOverlay";
import { BuildUpdateBanner } from "./components/system/BuildUpdateBanner";
import { LandingPage } from "./pages/LandingPage";
import { retryLazyImport } from "./lib/lazyRetry";
import { RouteErrorBoundary } from "./routes/RouteErrorBoundary";
import { usesPublicChrome } from "./routes/routeRuntimePolicy";
const PublicChromeSurface = lazy(() =>
  retryLazyImport(() => import("./appSurfaces/PublicChromeSurface"), "public-chrome-surface").then((module) => ({
    default: module.PublicChromeSurface,
  })),
);
const WorkspaceSurface = lazy(() =>
  retryLazyImport(() => import("./appSurfaces/WorkspaceSurface"), "workspace-surface").then((module) => ({
    default: module.WorkspaceSurface,
  })),
);

export default function App() {
  const location = useLocation();
  const routeIsLanding = location.pathname === "/";
  const routeUsesPublicChrome = usesPublicChrome(location.pathname);
  const [initialRouteReady, setInitialRouteReady] = useState(false);
  const [bootDismissed, setBootDismissed] = useState(false);
  const routePath = `${location.pathname}${location.search}${location.hash}`;

  useBootOverlay({
    bootDismissed,
    initialRouteReady,
    routeIsLanding,
    setBootDismissed,
  });

  if (routeIsLanding) {
    return (
      <>
        <RouteErrorBoundary
          resetKey={`${location.key}:landing`}
          routePath={routePath}
          onRetryRoute={() => window.location.reload()}
        >
          <BuildUpdateBanner />
          <InitialBootReady routePath={routePath} onReady={() => setInitialRouteReady(true)}>
            <LandingPage />
          </InitialBootReady>
        </RouteErrorBoundary>
      </>
    );
  }

  if (routeUsesPublicChrome) {
    return (
      <Suspense fallback={null}>
        <PublicChromeSurface />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
      <WorkspaceSurface />
    </Suspense>
  );
}
