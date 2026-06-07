import { markCssRecoveryFailed, markCssRecoveryResolved, markCssRecoveryStart } from "./routeRecoveryState";

const attemptedCssRecoveries = new Set<string>();

function normalizeAssetUrl(url: string) {
  const parsed = new URL(url, window.location.href);
  parsed.hash = "";
  return parsed.toString();
}

function isRouteCssAsset(url: string) {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith("/assets/") && parsed.pathname.endsWith(".css");
  } catch {
    return false;
  }
}

export async function recoverRouteCssAsset(url: string) {
  if (typeof window === "undefined" || !isRouteCssAsset(url)) {
    return false;
  }

  const normalizedUrl = normalizeAssetUrl(url);
  if (attemptedCssRecoveries.has(normalizedUrl)) {
    return false;
  }
  attemptedCssRecoveries.add(normalizedUrl);
  markCssRecoveryStart(normalizedUrl);

  const retryUrl = new URL(normalizedUrl);
  retryUrl.searchParams.set("css-retry", String(Date.now()));

  const retryLink = document.createElement("link");
  retryLink.rel = "stylesheet";
  retryLink.href = retryUrl.toString();

  const result = await new Promise<boolean>((resolve) => {
    retryLink.onload = () => resolve(true);
    retryLink.onerror = () => resolve(false);
    document.head.appendChild(retryLink);
  });

  if (result) {
    markCssRecoveryResolved(normalizedUrl);
    return true;
  }

  markCssRecoveryFailed(normalizedUrl);
  return false;
}
