import { SUI_NETWORK, shortAddress } from "./sui";
import type { FormSchema } from "../types";

const MAX_CAPTURED_EVENTS = 8;

interface CapturedEvent {
  message: string;
  source?: string;
  timestamp: string;
}

export interface AttachedSignalContext {
  device: {
    type: string;
    userAgent: string | null;
  };
  os: string;
  browser: string;
  browserVersion: string;
  viewport: {
    width: number;
    height: number;
  };
  dpr: number;
  url: string;
  route: string;
  pageName: string;
  timestamp: string;
  locale: string;
  timezone: string;
  wallet: {
    connected: boolean;
    provider: string | null;
    address: string | null;
  };
  chain: string;
  ids: {
    formId: string | null;
    signalId: string | null;
    projectId: string | null;
    workspaceId: string | null;
    manifestBlobId: string | null;
  };
  consoleErrors: CapturedEvent[];
  networkErrors: CapturedEvent[];
}

const capturedConsoleErrors: CapturedEvent[] = [];
const capturedNetworkErrors: CapturedEvent[] = [];
let captureInstalled = false;

function pushCapturedEvent(target: CapturedEvent[], event: Omit<CapturedEvent, "timestamp">) {
  target.unshift({
    ...event,
    message: event.message.slice(0, 500),
    timestamp: new Date().toISOString(),
  });
  target.splice(MAX_CAPTURED_EVENTS);
}

function stringifyConsoleValue(value: unknown) {
  if (value instanceof Error) {
    return value.stack || value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function detectDeviceType() {
  if (typeof navigator === "undefined") {
    return "unknown";
  }
  const userAgent = navigator.userAgent.toLowerCase();
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  if (/ipad|tablet/.test(userAgent) || (maxTouchPoints > 1 && /macintosh/.test(userAgent))) {
    return "tablet";
  }
  if (/mobi|iphone|android/.test(userAgent)) {
    return "mobile";
  }
  return "desktop";
}

function detectOs(userAgent: string) {
  if (/windows nt/i.test(userAgent)) return "Windows";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS";
  if (/android/i.test(userAgent)) return "Android";
  if (/mac os x|macintosh/i.test(userAgent)) return "macOS";
  if (/linux/i.test(userAgent)) return "Linux";
  return "unknown";
}

function detectBrowser(userAgent: string) {
  const browserMatchers: Array<[string, RegExp]> = [
    ["Edge", /edg\/([\d.]+)/i],
    ["Chrome", /chrome\/([\d.]+)/i],
    ["Firefox", /firefox\/([\d.]+)/i],
    ["Safari", /version\/([\d.]+).*safari/i],
  ];
  for (const [name, matcher] of browserMatchers) {
    const match = userAgent.match(matcher);
    if (match?.[1]) {
      return { name, version: match[1] };
    }
  }
  return { name: "unknown", version: "unknown" };
}

function getPageName(form: FormSchema | null) {
  if (!form) {
    return "Public signal intake";
  }
  return form.purpose === "bug" ? "Signal Intake" : form.title || "Public signal intake";
}

export function installSignalContextCapture() {
  if (captureInstalled || typeof window === "undefined") {
    return;
  }
  captureInstalled = true;

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    pushCapturedEvent(capturedConsoleErrors, {
      message: args.map(stringifyConsoleValue).filter(Boolean).join(" "),
      source: "console.error",
    });
    originalConsoleError(...args);
  };

  window.addEventListener("error", (event) => {
    pushCapturedEvent(capturedConsoleErrors, {
      message: event.message || "Unhandled window error",
      source: event.filename || "window.error",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    pushCapturedEvent(capturedConsoleErrors, {
      message: stringifyConsoleValue(event.reason) || "Unhandled promise rejection",
      source: "unhandledrejection",
    });
  });

  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        if (!response.ok) {
          pushCapturedEvent(capturedNetworkErrors, {
            message: `${response.status} ${response.statusText}`.trim(),
            source: typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : "fetch",
          });
        }
        return response;
      } catch (error) {
        pushCapturedEvent(capturedNetworkErrors, {
          message: stringifyConsoleValue(error),
          source: typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : "fetch",
        });
        throw error;
      }
    };
  }
}

export function collectSignalContext({
  form,
  manifestBlobId,
  walletAddress,
  walletProvider,
}: {
  form: FormSchema | null;
  manifestBlobId?: string;
  walletAddress?: string;
  walletProvider?: string | null;
}): AttachedSignalContext {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const browser = detectBrowser(userAgent);
  return {
    device: {
      type: detectDeviceType(),
      userAgent: userAgent || null,
    },
    os: userAgent ? detectOs(userAgent) : "unknown",
    browser: browser.name,
    browserVersion: browser.version,
    viewport: {
      width: typeof window === "undefined" ? 0 : window.innerWidth,
      height: typeof window === "undefined" ? 0 : window.innerHeight,
    },
    dpr: typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
    url: typeof window === "undefined" ? "" : window.location.href,
    route: typeof window === "undefined" ? "" : window.location.pathname,
    pageName: getPageName(form),
    timestamp: new Date().toISOString(),
    locale: typeof navigator === "undefined" ? "unknown" : navigator.language || "unknown",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
    wallet: {
      connected: Boolean(walletAddress),
      provider: walletProvider || (walletAddress ? "Sui wallet" : null),
      address: walletAddress ? shortAddress(walletAddress) : null,
    },
    chain: SUI_NETWORK,
    ids: {
      formId: form?.id ?? null,
      signalId: null,
      projectId: form?.projectId ?? null,
      workspaceId: null,
      manifestBlobId: manifestBlobId || form?.manifestBlobId || null,
    },
    consoleErrors: [...capturedConsoleErrors],
    networkErrors: [...capturedNetworkErrors],
  };
}
