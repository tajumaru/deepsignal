import { useSuiClient } from "@mysten/dapp-kit";
import { useEffect, useRef, useState } from "react";
import { getConnectedNetworkLabel, isSuiRateLimitError } from "../lib/sui";
import { useRpcInfrastructure } from "../rpcInfrastructure";

const INITIAL_DIAGNOSTIC_DELAY_MS = 2_500;

function NetworkSignalIcon() {
  return (
    <span className="network-select-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M4.75 10.4a10.5 10.5 0 0 1 14.5 0" />
        <path d="M7.6 13.4a6.9 6.9 0 0 1 8.8 0" />
        <path d="M10.45 16.35a3.25 3.25 0 0 1 3.1 0" />
        <circle cx="12" cy="18.35" r="1.35" />
      </svg>
    </span>
  );
}

export function TatumFrogIcon({ className = "" }: { className?: string }) {
  return (
    <span className={`network-select-icon network-select-icon-tatum ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <defs>
          <linearGradient id="network-frog-gradient" x1="7.25" y1="7.5" x2="16.9" y2="18.1" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#1ea8ff" />
            <stop offset="1" stopColor="#32f0dc" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="9" className="network-frog-ring" />
        <path
          d="M8.35 15.7c-1.1 0-1.92-.94-1.92-2.06 0-1.24.57-2.6 1.62-3.82 1.13-1.32 2.55-2.1 3.93-2.1 1.66 0 3.25.96 4.19 2.53.3.49.46 1 .46 1.49 0 .48-.16.92-.43 1.27-.24.31-.55.55-.89.74-.67.37-1.38.92-1.87 1.55-.56.72-.83 1.48-.83 2.29h1.16c.52 0 .93.41.93.92s-.41.92-.93.92H8.35Z"
          className="network-frog-body"
        />
        <circle cx="14.25" cy="8.78" r="1.52" className="network-frog-eye" />
        <circle cx="14.25" cy="8.78" r="0.62" className="network-frog-eye-core" />
        <path d="M15.62 18.44h2.1" className="network-frog-base" />
      </svg>
    </span>
  );
}

function formatLatency(latencyMs: number | null) {
  if (latencyMs == null) {
    return "RPC Ping -- ms";
  }
  return `RPC Ping ${latencyMs} ms`;
}

export function NetworkMenu() {
  const suiClient = useSuiClient();
  const {
    canUseTatum,
    connectedNetworkLabel,
    currentRpcUrl,
    displayRpcUrl,
    isRateLimitedCooldownActive,
    mode,
    noteRateLimited,
    providerLabel,
    setConnectedNetworkLabel,
    switchToDefault,
    switchToTatum,
    usingTatum,
  } = useRpcInfrastructure();
  const value = usingTatum ? "tatum" : "default";
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [healthy, setHealthy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const hasMountedRef = useRef(false);
  const previousRpcModeRef = useRef(mode);
  const previousRpcUrlRef = useRef(currentRpcUrl);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  function handleSelect(nextValue: "default" | "tatum") {
    if (nextValue === "tatum") {
      switchToTatum();
    } else {
      switchToDefault();
    }
    setMenuOpen(false);
  }

  useEffect(() => {
    if (isRateLimitedCooldownActive) {
      return;
    }

    const rpcChanged =
      previousRpcModeRef.current !== mode ||
      previousRpcUrlRef.current !== currentRpcUrl;
    previousRpcModeRef.current = mode;
    previousRpcUrlRef.current = currentRpcUrl;

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
    }

    const shouldRunDeferredInitialDiagnostic = !menuOpen && !rpcChanged && latencyMs == null;
    if (!menuOpen && !rpcChanged && !shouldRunDeferredInitialDiagnostic) {
      return;
    }

    let cancelled = false;

    async function runDiagnostics() {
      const startedAt = performance.now();

      try {
        const chainIdentifier = await suiClient.getChainIdentifier();
        if (cancelled) {
          return;
        }
        setLatencyMs(Math.max(1, Math.round(performance.now() - startedAt)));
        setHealthy(true);
        setConnectedNetworkLabel(getConnectedNetworkLabel(chainIdentifier));
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isSuiRateLimitError(error)) {
          noteRateLimited();
        }
        setLatencyMs(null);
        setHealthy(false);
      }
    }

    if (shouldRunDeferredInitialDiagnostic) {
      const timeout = window.setTimeout(() => {
        void runDiagnostics();
      }, INITIAL_DIAGNOSTIC_DELAY_MS);
      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
      };
    }

    void runDiagnostics();
    return () => {
      cancelled = true;
    };
  }, [
    currentRpcUrl,
    isRateLimitedCooldownActive,
    latencyMs,
    menuOpen,
    mode,
    noteRateLimited,
    setConnectedNetworkLabel,
    suiClient,
    value,
  ]);

  return (
    <div ref={shellRef} className="network-select-shell" title={displayRpcUrl}>
      <button
        type="button"
        className={`network-select-trigger ${menuOpen ? "is-open" : ""}`}
        onClick={() => setMenuOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <span className="network-select-header">
          {usingTatum ? <TatumFrogIcon /> : <NetworkSignalIcon />}
          <span className="network-select-label">Network</span>
        </span>
        <span className="network-select-value-row">
          <span className="network-select-value">{providerLabel}</span>
          <span className="network-select-caret" aria-hidden="true">
            <svg viewBox="0 0 12 12" focusable="false">
              <path d="M2.25 4.25 6 7.75l3.75-3.5" />
            </svg>
          </span>
        </span>
      </button>
      <small className="network-select-meta">
        <span className={`network-status-dot ${healthy ? "is-online" : ""}`} aria-hidden="true" />
        <span className="network-select-latency">{formatLatency(latencyMs)}</span>
        <span className="network-select-network">{connectedNetworkLabel}</span>
      </small>
      {menuOpen ? (
        <div className="network-select-menu panel" role="menu" aria-label="Network RPC provider">
          <button
            type="button"
            className={`network-select-option ${value === "default" ? "is-selected" : ""}`}
            onClick={() => handleSelect("default")}
            role="menuitemradio"
            aria-checked={value === "default"}
          >
            <span>Default Sui RPC</span>
            <span className="network-select-option-check" aria-hidden="true">
              {value === "default" ? "●" : ""}
            </span>
          </button>
          {canUseTatum ? (
            <button
              type="button"
              className={`network-select-option ${value === "tatum" ? "is-selected" : ""}`}
              onClick={() => handleSelect("tatum")}
              role="menuitemradio"
              aria-checked={value === "tatum"}
            >
              <span>Tatum RPC</span>
              <span className="network-select-option-check" aria-hidden="true">
                {value === "tatum" ? "●" : ""}
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
