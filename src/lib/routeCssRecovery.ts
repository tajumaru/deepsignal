import { markCssRecoveryFailed, markCssRecoveryResolved, markCssRecoveryStart } from "./routeRecoveryState";

const attemptedCssRecoveries = new Set<string>();

type CssRecoveryResult = {
  recovered: boolean;
  resourceUrl: string;
  retryHref: string | null;
  status: number | null;
};

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

export async function recoverRouteCssAsset(url: string): Promise<CssRecoveryResult> {
  if (typeof window === "undefined" || !isRouteCssAsset(url)) {
    return {
      recovered: false,
      resourceUrl: url,
      retryHref: null,
      status: null,
    };
  }

  const normalizedUrl = normalizeAssetUrl(url);
  if (attemptedCssRecoveries.has(normalizedUrl)) {
    return {
      recovered: false,
      resourceUrl: normalizedUrl,
      retryHref: null,
      status: null,
    };
  }
  attemptedCssRecoveries.add(normalizedUrl);
  markCssRecoveryStart(normalizedUrl);

  const retryUrl = new URL(normalizedUrl);
  retryUrl.searchParams.set("css-retry", String(Date.now()));

  const retryLink = document.createElement("link");
  retryLink.rel = "stylesheet";
  retryLink.href = retryUrl.toString();
  let status: number | null = null;

  try {
    const response = await fetch(retryUrl.toString(), {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    });
    status = response.status;
  } catch {
    status = null;
  }

  const result = await new Promise<boolean>((resolve) => {
    retryLink.onload = () => resolve(true);
    retryLink.onerror = () => resolve(false);
    document.head.appendChild(retryLink);
  });

  if (result) {
    markCssRecoveryResolved(normalizedUrl);
    return {
      recovered: true,
      resourceUrl: normalizedUrl,
      retryHref: retryUrl.toString(),
      status,
    };
  }

  markCssRecoveryFailed(normalizedUrl);
  return {
    recovered: false,
    resourceUrl: normalizedUrl,
    retryHref: retryUrl.toString(),
    status,
  };
}
