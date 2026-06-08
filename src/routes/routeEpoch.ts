import { useEffect, useMemo, useSyncExternalStore } from "react";

type RouteEpochSnapshot = {
  canonicalRoutePath: string;
  navigationId: number;
  routeEpoch: string;
  routePath: string;
};

let currentSnapshot: RouteEpochSnapshot = {
  canonicalRoutePath: "/",
  navigationId: 0,
  routeEpoch: "nav-0:/",
  routePath: "/",
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function snapshotsEqual(left: RouteEpochSnapshot, right: RouteEpochSnapshot) {
  return (
    left.canonicalRoutePath === right.canonicalRoutePath &&
    left.navigationId === right.navigationId &&
    left.routeEpoch === right.routeEpoch &&
    left.routePath === right.routePath
  );
}

function normalizeCanonicalRoutePath(routePath: string) {
  const trimmed = routePath.trim();
  if (!trimmed) {
    return "/";
  }
  const hashRouteIndex = trimmed.indexOf("#/");
  const normalized = hashRouteIndex >= 0 ? trimmed.slice(hashRouteIndex + 1) : trimmed.startsWith("#/") ? trimmed.slice(1) : trimmed;
  const pathname = normalized.split(/[?#]/)[0] || "/";
  if (pathname.startsWith("/")) {
    return pathname;
  }
  return `/${pathname.replace(/^\/+/, "")}`;
}

function createNextSnapshot(routePath: string, baseSnapshot: RouteEpochSnapshot = currentSnapshot): RouteEpochSnapshot {
  const canonicalRoutePath = normalizeCanonicalRoutePath(routePath);
  if (baseSnapshot.canonicalRoutePath === canonicalRoutePath) {
    return {
      ...baseSnapshot,
      routePath,
    };
  }

  return {
    canonicalRoutePath,
    navigationId: baseSnapshot.navigationId + 1,
    routeEpoch: `nav-${baseSnapshot.navigationId + 1}:${canonicalRoutePath}`,
    routePath,
  };
}

export function setCurrentRouteEpoch(routePath: string) {
  const nextSnapshot = createNextSnapshot(routePath);
  if (snapshotsEqual(currentSnapshot, nextSnapshot)) {
    return currentSnapshot;
  }
  currentSnapshot = nextSnapshot;
  emit();
  return currentSnapshot;
}

export function ensureCurrentRouteEpoch(routePath: string) {
  if (
    currentSnapshot.routePath === routePath ||
    currentSnapshot.canonicalRoutePath === normalizeCanonicalRoutePath(routePath)
  ) {
    if (currentSnapshot.routePath !== routePath) {
      currentSnapshot = {
        ...currentSnapshot,
        routePath,
      };
      emit();
    }
    return currentSnapshot;
  }
  return setCurrentRouteEpoch(routePath);
}

export function getCurrentRouteEpochSnapshot() {
  return currentSnapshot;
}

export function resetCurrentRouteEpochForTests() {
  currentSnapshot = {
    canonicalRoutePath: "/",
    navigationId: 0,
    routeEpoch: "nav-0:/",
    routePath: "/",
  };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCurrentRouteEpoch(routePath: string) {
  useEffect(() => {
    setCurrentRouteEpoch(routePath);
  }, [routePath]);

  const snapshot = useSyncExternalStore(subscribe, getCurrentRouteEpochSnapshot, getCurrentRouteEpochSnapshot);

  return useMemo(() => {
    if (
      snapshot.routePath === routePath ||
      snapshot.canonicalRoutePath === normalizeCanonicalRoutePath(routePath)
    ) {
      return snapshot;
    }
    return createNextSnapshot(routePath, snapshot);
  }, [routePath, snapshot]);
}
