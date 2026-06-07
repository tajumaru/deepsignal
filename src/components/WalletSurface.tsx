import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { buildInfo } from "../lib/buildInfo";
import { retryLazyImport } from "../lib/lazyRetry";
import { endPerf, markPerfMilestone, startPerf } from "../lib/perf";
import { getBrowserCapabilitiesSnapshot, logRouteLifecycle } from "../lib/routeDiagnostics";
import { setWalletProviderRuntimeSnapshot, WalletSurfaceContext, type WalletProviderRuntime } from "./WalletSurfaceRuntime";

type WalletProvidersModule = { default: (props: PropsWithChildren) => JSX.Element };

let walletProvidersInFlightPromise: Promise<WalletProvidersModule> | null = null;

function getWalletProviderImportTimeoutMs() {
  const capabilities = getBrowserCapabilitiesSnapshot();
  if (typeof navigator === "undefined") {
    return 8_000;
  }
  const userAgent = navigator.userAgent;
  if (capabilities.mobileSafari) {
    return 12_000;
  }
  if (/Android|iP(?:hone|ad|od)|Mobile/i.test(userAgent)) {
    return 12_000;
  }
  return 8_000;
}

type WalletProviderImportOptions = {
  onStart?: (details: WalletProviderImportEvent) => void;
  onFailure?: (details: WalletProviderImportEvent) => void;
  onSlow?: (details: WalletProviderImportEvent) => void;
  onSuccess?: (details: WalletProviderImportEvent) => void;
};

type WalletProviderImportEvent = {
  buildVersion: string;
  mobileSafari: boolean;
  retryCount: number;
  retryKey: string | number;
  routePath: string;
  timeoutMs: number;
  userAgent: string;
};

function getCurrentRoutePath() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.hash?.replace(/^#/, "") || `${window.location.pathname}${window.location.search}`;
}

function createWalletProviders(
  retryKey: string | number,
  optionsRef: { current: WalletProviderImportOptions },
) {
  return () => {
    const importTimeoutMs = getWalletProviderImportTimeoutMs();
    const capabilities = getBrowserCapabilitiesSnapshot();
    const mobileSafari = Boolean(capabilities.mobileSafari);
    const userAgent = capabilities.userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
    const routePath = getCurrentRoutePath();
    const eventDetails: WalletProviderImportEvent = {
      buildVersion: buildInfo.appVersion,
      mobileSafari,
      retryCount: Number(retryKey) || 0,
      retryKey,
      routePath,
      timeoutMs: importTimeoutMs,
      userAgent,
    };
    optionsRef.current.onStart?.(eventDetails);
    if (walletProvidersInFlightPromise) {
      logRouteLifecycle("provider:wallet-import-join", eventDetails);
      return walletProvidersInFlightPromise
        .then((module) => {
          optionsRef.current.onSuccess?.(eventDetails);
          return module;
        })
        .catch((error) => {
          optionsRef.current.onFailure?.(eventDetails);
          throw error;
        });
    }

    startPerf("provider:wallet", `retry ${retryKey}`);
    markPerfMilestone("provider:wallet:import-start", `retry ${retryKey}`);
    logRouteLifecycle("provider:wallet-import-start", eventDetails);
    const slowTimeout = window.setTimeout(() => {
      logRouteLifecycle("provider:wallet-import-slow", {
        ...eventDetails,
        elapsedMs: 5_000,
      });
      optionsRef.current.onSlow?.(eventDetails);
    }, 5_000);
    const timeout = window.setTimeout(() => {
      markPerfMilestone("provider:wallet:import-timeout", `${importTimeoutMs}ms`);
      logRouteLifecycle("provider:wallet-import-timeout", eventDetails);
    }, importTimeoutMs);
    walletProvidersInFlightPromise = retryLazyImport(() => import("../providers"), "wallet-providers")
      .then((module) => {
        markPerfMilestone("provider:wallet:import-resolved", `retry ${retryKey}`);
        logRouteLifecycle("provider:wallet-import-resolved", eventDetails);
        optionsRef.current.onSuccess?.(eventDetails);
        return {
          default: module.WalletProviders,
        } satisfies WalletProvidersModule;
      })
      .catch((error) => {
        endPerf("provider:wallet", "failed", error instanceof Error ? error.message : String(error));
        logRouteLifecycle("provider:wallet-import-failed", {
          ...eventDetails,
          chunkUrl: null,
          message: error instanceof Error ? error.message : String(error),
        });
        optionsRef.current.onFailure?.(eventDetails);
        throw error;
      })
      .finally(() => {
        walletProvidersInFlightPromise = null;
        window.clearTimeout(slowTimeout);
        window.clearTimeout(timeout);
        markPerfMilestone("provider:wallet:import-end", `retry ${retryKey}`);
        logRouteLifecycle("provider:wallet-import-end", eventDetails);
      });
    return walletProvidersInFlightPromise;
  };
}

function WalletSurfaceFallback() {
  return <div className="panel">Loading wallet...</div>;
}

interface WalletSurfaceProps extends PropsWithChildren {
  blockUntilLoaded?: boolean;
  fallback?: ReactNode;
  onImportFailure?: (details: WalletProviderImportEvent) => void;
  onImportSlow?: (details: WalletProviderImportEvent) => void;
  onImportStart?: (details: WalletProviderImportEvent) => void;
  onImportSuccess?: (details: WalletProviderImportEvent) => void;
  requestOnMount?: boolean;
  retryKey?: string | number;
}

export function WalletSurface({
  blockUntilLoaded = true,
  children,
  fallback,
  onImportFailure,
  onImportSlow,
  onImportStart,
  onImportSuccess,
  requestOnMount = false,
  retryKey = 0,
}: WalletSurfaceProps) {
  const parentRuntime = useContext(WalletSurfaceContext);
  const importOptionsRef = useRef<WalletProviderImportOptions>({
    onFailure: onImportFailure,
    onSlow: onImportSlow,
    onStart: onImportStart,
    onSuccess: onImportSuccess,
  });
  importOptionsRef.current = {
    onFailure: onImportFailure,
    onSlow: onImportSlow,
    onStart: onImportStart,
    onSuccess: onImportSuccess,
  };
  const loadWalletProviders = useMemo(() => createWalletProviders(retryKey, importOptionsRef), [retryKey]);
  const [providersModule, setProvidersModule] = useState<null | { WalletProviders: (props: PropsWithChildren) => JSX.Element }>(null);
  const [loading, setLoading] = useState(requestOnMount && !parentRuntime.loaded);
  const [loadFailed, setLoadFailed] = useState(false);
  const [treeMounted, setTreeMounted] = useState(false);
  const [contextAvailable, setContextAvailable] = useState(false);
  const [hasCommittedOnce, setHasCommittedOnce] = useState(false);
  const requestStartedRef = useRef(false);

  useEffect(() => {
    logRouteLifecycle(parentRuntime.loaded ? "wallet-surface:reuse" : "wallet-surface:mount-requested");
  }, [parentRuntime.loaded]);

  useEffect(() => {
    if (providersModule || parentRuntime.loaded) {
      return;
    }
    requestStartedRef.current = false;
    setLoading(false);
    setLoadFailed(false);
    setTreeMounted(false);
    setContextAvailable(false);
  }, [parentRuntime.loaded, providersModule, retryKey]);

  useEffect(() => {
    if (!requestOnMount || requestStartedRef.current) {
      return;
    }
    requestStartedRef.current = true;
    setLoading(true);
    setLoadFailed(false);
    void loadWalletProviders()
      .then((module) => setProvidersModule({ WalletProviders: module.default }))
      .catch(() => {
        requestStartedRef.current = false;
        setLoadFailed(true);
      })
      .finally(() => setLoading(false));
  }, [loadWalletProviders, requestOnMount]);

  useEffect(() => {
    if (!providersModule) {
      return;
    }
    logRouteLifecycle("wallet-provider-chunk-loaded", {
      providerLoading: false,
      providerChunkLoaded: true,
      providerContextAvailable: false,
      parentRuntimeLoaded: parentRuntime.loaded,
      requestOnMount,
      retryKey,
      routePath: getCurrentRoutePath(),
    });
    logRouteLifecycle("provider:wallet-chunk-loaded", {
      parentRuntimeLoaded: parentRuntime.loaded,
      requestOnMount,
      retryKey,
      routePath: getCurrentRoutePath(),
    });
  }, [parentRuntime.loaded, providersModule, requestOnMount, retryKey]);

  const markTreeMounted = useMemo(
    () => () => {
      setTreeMounted(true);
      setHasCommittedOnce(true);
    },
    [],
  );

  const markContextAvailable = useMemo(
    () => () => {
      setTreeMounted(true);
      setContextAvailable(true);
      setHasCommittedOnce(true);
      setLoading(false);
    },
    [],
  );

  const resetReadiness = useMemo(
    () => () => {
      setTreeMounted(false);
      setContextAvailable(false);
    },
    [],
  );

  const requestLoad = useMemo(
    () => () => {
      if (parentRuntime.loaded || requestStartedRef.current) {
        return;
      }
      requestStartedRef.current = true;
      setLoading(true);
      setLoadFailed(false);
      void loadWalletProviders()
        .then((module) => setProvidersModule({ WalletProviders: module.default }))
        .catch(() => {
          requestStartedRef.current = false;
          setLoadFailed(true);
        })
        .finally(() => setLoading(false));
    },
    [loadWalletProviders, parentRuntime.loaded],
  );

  const runtime = {
    chunkLoaded: Boolean(providersModule),
    contextAvailable,
    failed: loadFailed,
    hasCommittedOnce,
    loaded: contextAvailable,
    loading: loading || (Boolean(providersModule) && !contextAvailable),
    markContextAvailable,
    markTreeMounted,
    requestLoad,
    resetReadiness,
    treeMounted,
  } satisfies WalletProviderRuntime;

  useEffect(() => {
    setWalletProviderRuntimeSnapshot(runtime);
  }, [runtime]);

  if (parentRuntime.loaded) {
    return <>{children}</>;
  }

  if (providersModule) {
    const WalletProviders = providersModule.WalletProviders;
    return (
      <WalletSurfaceContext.Provider value={runtime}>
        <WalletProviders>{children}</WalletProviders>
      </WalletSurfaceContext.Provider>
    );
  }

  return (
    <WalletSurfaceContext.Provider value={runtime}>
      {(loading || loadFailed) && blockUntilLoaded ? fallback ?? <WalletSurfaceFallback /> : children}
    </WalletSurfaceContext.Provider>
  );
}
