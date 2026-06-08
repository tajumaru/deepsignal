import { lazy, Suspense, type ComponentType, type ErrorInfo, type LazyExoticComponent, type ReactNode } from "react";
import { suppressStaleLazyImport } from "../../lib/lazyRetry";
import { logRouteLifecycle } from "../../lib/routeDiagnostics";
import { shouldRejectWalletUiImport } from "../../lib/mobileSafariSmoke";
import { SafeLazyBoundary } from "../SafeLazyBoundary";

type OptionalHeaderWidgetComponent = ComponentType<Record<string, unknown>>;

type OptionalHeaderWidgetProps = {
  componentProps?: Record<string, unknown>;
  fallback: ReactNode;
  label: string;
  loader: () => Promise<{ default: OptionalHeaderWidgetComponent }>;
  onError?: (error: unknown, errorInfo: ErrorInfo) => void;
  resetKey: string;
};

const optionalHeaderWidgetImports = new Map<string, Promise<{ default: OptionalHeaderWidgetComponent }>>();
const optionalHeaderWidgetComponents = new Map<string, LazyExoticComponent<OptionalHeaderWidgetComponent>>();

function getOptionalHeaderWidgetCacheKey(label: string, resetKey: string) {
  return `${label}:${resetKey}`;
}

function loadOptionalHeaderWidget(
  cacheKey: string,
  label: string,
  resetKey: string,
  loader: () => Promise<{ default: OptionalHeaderWidgetComponent }>,
) {
  const existingImport = optionalHeaderWidgetImports.get(cacheKey);
  if (existingImport) {
    logRouteLifecycle("optional-header-widget:import-deduped", {
      label,
      resetKey,
    });
    return existingImport;
  }

  logRouteLifecycle("optional-header-widget:import-start", {
    label,
    resetKey,
  });

  const importPromise = (async () => {
    if (shouldRejectWalletUiImport(label)) {
      throw new Error(`DeepSignal smoke rejected optional widget import: ${label}`);
    }
    return suppressStaleLazyImport(loader(), label);
  })();

  optionalHeaderWidgetImports.set(cacheKey, importPromise);
  return importPromise;
}

function getOptionalHeaderWidgetComponent(
  cacheKey: string,
  label: string,
  resetKey: string,
  loader: () => Promise<{ default: OptionalHeaderWidgetComponent }>,
) {
  const existingComponent = optionalHeaderWidgetComponents.get(cacheKey);
  if (existingComponent) {
    return existingComponent;
  }

  const lazyComponent = lazy(() => loadOptionalHeaderWidget(cacheKey, label, resetKey, loader));
  optionalHeaderWidgetComponents.set(cacheKey, lazyComponent);
  return lazyComponent;
}

export function OptionalHeaderWidget({
  componentProps,
  fallback,
  label,
  loader,
  onError,
  resetKey,
}: OptionalHeaderWidgetProps) {
  const cacheKey = getOptionalHeaderWidgetCacheKey(label, resetKey);
  const LazyComponent = getOptionalHeaderWidgetComponent(cacheKey, label, resetKey, loader);

  return (
    <SafeLazyBoundary fallback={fallback} onError={onError} resetKey={resetKey}>
      <Suspense fallback={fallback}>
        <LazyComponent {...(componentProps ?? {})} />
      </Suspense>
    </SafeLazyBoundary>
  );
}
