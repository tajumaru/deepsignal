import {
  useCurrentAccount,
  useCurrentWallet,
  useSuiClientContext,
} from "@mysten/dapp-kit";
import { walrus } from "@mysten/walrus";
import walrusWasmUrl from "@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url";
import { useEffect, useMemo, type PropsWithChildren } from "react";
import { WALRUS_AGGREGATOR_URL, WALRUS_UPLOAD_RELAY_URL } from "./lib/sui";
import { logRouteLifecycle } from "./lib/routeDiagnostics";
import { endPerf, markPerfMilestone, startPerf } from "./lib/perf";
import { WalrusDiagnosticError, getWalrusErrorMessage } from "./storage/walrusDiagnostics";
import { setWalrusRuntimeContext } from "./storage/walrusAdapter";
import { setSuiRuntimeContext } from "./suiRuntime";

const WALRUS_TX_WAIT_TIMEOUT_MS = 3 * 60 * 1000;
const WALRUS_UPLOAD_RELAY_TIMEOUT_RAW = import.meta.env.VITE_WALRUS_UPLOAD_RELAY_TIMEOUT_MS;
const WALRUS_UPLOAD_RELAY_TIMEOUT_MS =
  WALRUS_UPLOAD_RELAY_TIMEOUT_RAW && WALRUS_UPLOAD_RELAY_TIMEOUT_RAW.trim()
    ? Number(WALRUS_UPLOAD_RELAY_TIMEOUT_RAW)
    : 90 * 1000;
const WALRUS_UPLOAD_RELAY_TIP_MAX_RAW = import.meta.env.VITE_WALRUS_UPLOAD_RELAY_TIP_MAX;
const WALRUS_UPLOAD_RELAY_TIP_MAX =
  WALRUS_UPLOAD_RELAY_TIP_MAX_RAW && WALRUS_UPLOAD_RELAY_TIP_MAX_RAW.trim()
    ? Number(WALRUS_UPLOAD_RELAY_TIP_MAX_RAW)
    : null;
const AGGREGATOR_DIAGNOSTIC_TIMEOUT_MS = 3500;

function buildWaitForTransactionTimeoutError(digest: string, timeoutMs: number, lastError: unknown) {
  const lastRpcError = getWalrusErrorMessage(lastError);
  const timeoutSeconds = Math.round(timeoutMs / 1000);
  const message =
    `Walrus transaction submitted, but RPC visibility timed out after ${timeoutSeconds}s.` +
    ` digest=${digest}` +
    (lastRpcError ? ` lastRpcError=${lastRpcError}` : "");
  return new WalrusDiagnosticError(
    message,
    {
      stage: "rpc-visibility",
      digest,
      lastRpcError,
      timeoutMs,
    },
    lastError,
  );
}

function WalrusRuntimeBridgeInner() {
  const account = useCurrentAccount();
  const { currentWallet, supportedIntents } = useCurrentWallet();
  const { client, config, network } = useSuiClientContext();
  const rpcUrl = config?.url ?? null;
  const currentNetwork = network ?? null;
  useEffect(() => {
    markPerfMilestone("walrus-runtime:bridge-mounted", currentNetwork ?? "network-pending");
    logRouteLifecycle("walrus-runtime:bridge-mounted", {
      hasClient: Boolean(client),
      rpcUrl,
      network: currentNetwork,
      aggregatorConfigured: Boolean(WALRUS_AGGREGATOR_URL),
    });
  }, [client, currentNetwork, rpcUrl]);

  useEffect(() => {
    const aggregatorUrl = WALRUS_AGGREGATOR_URL?.replace(/\/$/, "");
    if (!aggregatorUrl) {
      markPerfMilestone("walrus:aggregator:unconfigured");
      logRouteLifecycle("walrus:aggregator-unconfigured");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), AGGREGATOR_DIAGNOSTIC_TIMEOUT_MS);
    startPerf("walrus:aggregator-readiness", aggregatorUrl);
    markPerfMilestone("walrus:aggregator-readiness:start", aggregatorUrl);
    logRouteLifecycle("walrus:aggregator-readiness-start", { aggregatorUrl });

    void fetch(aggregatorUrl, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        endPerf("walrus:aggregator-readiness", response.ok ? "ok" : "failed", String(response.status));
        markPerfMilestone("walrus:aggregator-readiness:end", String(response.status));
        logRouteLifecycle("walrus:aggregator-readiness-end", {
          aggregatorUrl,
          ok: response.ok,
          status: response.status,
        });
      })
      .catch((error) => {
        endPerf("walrus:aggregator-readiness", "failed", error instanceof Error ? error.message : String(error));
        markPerfMilestone("walrus:aggregator-readiness:end", "failed");
        logRouteLifecycle("walrus:aggregator-readiness-failed", {
          aggregatorUrl,
          timeoutMs: AGGREGATOR_DIAGNOSTIC_TIMEOUT_MS,
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!client) {
      startPerf("sui-rpc:readiness", rpcUrl ?? "rpc-pending");
      logRouteLifecycle("sui-rpc:readiness-pending", {
        rpcUrl,
        network: currentNetwork,
      });
      return;
    }
    endPerf("sui-rpc:readiness", "ok", rpcUrl ?? "rpc-ready");
    markPerfMilestone("sui-rpc:ready", rpcUrl ?? "rpc-ready");
    logRouteLifecycle("sui-rpc:ready", {
      rpcUrl,
      network: currentNetwork,
    });
  }, [client, currentNetwork, rpcUrl]);

  const stableSupportedIntents = useMemo(
    () => (Array.isArray(supportedIntents) ? [...supportedIntents] : []),
    [supportedIntents],
  );
  const walrusClient = useMemo(
    () => {
      if (!client) {
        startPerf("walrus:client-create", rpcUrl ?? "client-pending");
        logRouteLifecycle("walrus-runtime:client-pending", {
          rpcUrl,
          network: currentNetwork,
        });
        return null;
      }
      startPerf("walrus:client-create", rpcUrl ?? "client-ready");
      markPerfMilestone("walrus:client-create:start", rpcUrl ?? "rpc-ready");
      const walrusEnabledClient = client.$extend(
        walrus({
          wasmUrl: walrusWasmUrl,
          ...(WALRUS_UPLOAD_RELAY_URL
            ? {
                uploadRelay: {
                  host: WALRUS_UPLOAD_RELAY_URL,
                  timeout: WALRUS_UPLOAD_RELAY_TIMEOUT_MS,
                  ...(WALRUS_UPLOAD_RELAY_TIP_MAX != null
                    ? {
                        sendTip: {
                          max: WALRUS_UPLOAD_RELAY_TIP_MAX,
                        },
                      }
                    : {}),
                },
              }
            : {}),
          }),
      );
      endPerf("walrus:client-create", "ok", currentNetwork ?? "network-ready");
      markPerfMilestone("walrus:client-create:end", currentNetwork ?? "network-ready");
      logRouteLifecycle("walrus-runtime:client-created", {
        rpcUrl,
        network: currentNetwork,
        uploadRelayConfigured: Boolean(WALRUS_UPLOAD_RELAY_URL),
        wasmUrl: walrusWasmUrl,
      });
      (walrusEnabledClient.core as typeof walrusEnabledClient.core & {
        waitForTransaction: typeof walrusEnabledClient.core.waitForTransaction;
      }).waitForTransaction = async (input) => {
        const timeout = input?.timeout ?? WALRUS_TX_WAIT_TIMEOUT_MS;
        const include =
          input?.include?.effects
            ? ({
                ...(input.include ?? {}),
                objectTypes: true,
              } as typeof input.include)
            : input?.include;
        const digest =
          "result" in input && input.result
            ? (input.result.Transaction ?? input.result.FailedTransaction)?.digest
            : input.digest;
        const schedule = input?.pollSchedule ?? [0, 300, 600, 1500, 3500];
        const lastInterval =
          schedule.length > 0 ? schedule[schedule.length - 1] - (schedule[schedule.length - 2] ?? 0) : 2000;
        const abortSignal = input?.signal
          ? AbortSignal.any([AbortSignal.timeout(timeout), input.signal])
          : AbortSignal.timeout(timeout);
        const abortPromise = new Promise<never>((_, reject) => {
          abortSignal.addEventListener("abort", () => reject(abortSignal.reason));
        });
        abortPromise.catch(() => {});

        const startedAt = Date.now();
        let scheduleIndex = 0;
        let lastGetTransactionError: unknown;

        try {
          while (true) {
            if (scheduleIndex < schedule.length) {
              const remaining = startedAt + schedule[scheduleIndex] - Date.now();
              scheduleIndex += 1;
              if (remaining > 0) {
                await Promise.race([new Promise((resolve) => setTimeout(resolve, remaining)), abortPromise]);
              }
            } else {
              await Promise.race([new Promise((resolve) => setTimeout(resolve, lastInterval)), abortPromise]);
            }

            abortSignal.throwIfAborted();
            try {
              return await walrusEnabledClient.core.getTransaction({
                digest,
                include,
                signal: abortSignal,
              });
            } catch (error) {
              lastGetTransactionError = error;
            }
          }
        } catch (error) {
          if (digest && error instanceof Error && error.name === "TimeoutError") {
            throw buildWaitForTransactionTimeoutError(digest, timeout, lastGetTransactionError ?? error);
          }
          throw error;
        }
      };
      return walrusEnabledClient;
    },
    [client, currentNetwork, rpcUrl],
  );
  const runtimeContext = useMemo(
    () => ({
      account,
      wallet: currentWallet,
      supportedIntents: stableSupportedIntents,
      client: walrusClient,
      rpcUrl,
      network: currentNetwork,
    }),
    [account, currentNetwork, currentWallet, rpcUrl, stableSupportedIntents, walrusClient],
  );

  useEffect(() => {
    setWalrusRuntimeContext(runtimeContext);
    setSuiRuntimeContext({
      client,
      rpcUrl,
      network: currentNetwork,
    });
    markPerfMilestone("walrus-runtime:context-set", runtimeContext.client ? "client-ready" : "client-null");
    logRouteLifecycle("walrus-runtime:context-set", {
      hasClient: Boolean(runtimeContext.client),
      hasAccount: Boolean(runtimeContext.account),
      hasWallet: Boolean(runtimeContext.wallet),
      rpcUrl,
      network: currentNetwork,
    });

    return () => {
      setWalrusRuntimeContext({
        account: null,
        wallet: null,
        supportedIntents: [],
        client: null,
        rpcUrl: null,
        network: null,
      });
      setSuiRuntimeContext({
        client: null,
        rpcUrl: null,
        network: null,
      });
    };
  }, [client, currentNetwork, rpcUrl, runtimeContext]);

  return null;
}

export default function WalrusRuntimeBridge({ children }: PropsWithChildren) {
  return (
    <>
      <WalrusRuntimeBridgeInner />
      {children}
    </>
  );
}
