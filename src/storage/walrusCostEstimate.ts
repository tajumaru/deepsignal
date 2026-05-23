import { WALRUS_UPLOAD_RELAY_URL } from "../lib/sui";
import { getTatumStorageWriteUrl, isTatumStorageEnabled } from "./tatumStorage";
import type { FormSchema, SignalManifest } from "../types";

export type WalrusCostEstimateStatus = "ready" | "relay-unavailable" | "local-fallback";

export interface WalrusCostEstimate {
  status: WalrusCostEstimateStatus;
  payloadBytes: number;
  storageEpochs: number;
  storageMode: "publisher" | "uploadRelay" | "tatum";
  relayTipMist: number | null;
  estimatedWal: number | null;
  estimatedSui: number | null;
  relayTipSource: "tip-config" | "not-applicable" | "unavailable";
  note: string;
}

type RelayTipConfig =
  | {
      address?: string;
      kind?: {
        const?: number | string;
        linear?: {
          base?: number | string;
          perEncodedKib?: number | string;
        };
      };
    }
  | {
      sendTip?: RelayTipConfig;
      tip?: RelayTipConfig;
    };

const bundledFormPointer = "__bundled_form__";
const walrusStorageMode = (() => {
  const configuredMode = String(import.meta.env.VITE_WALRUS_STORAGE_MODE || "uploadRelay").toLowerCase();
  if (configuredMode === "publisher") {
    return "publisher" as const;
  }
  if (configuredMode === "tatum") {
    return "tatum" as const;
  }
  return "uploadRelay" as const;
})();
const storageEpochs = Math.max(1, Number(import.meta.env.VITE_WALRUS_STORAGE_EPOCHS || "5"));
const estimateBaseWal = Math.max(0, Number(import.meta.env.VITE_WALRUS_ESTIMATE_BASE_WAL || "0.012"));
const estimateWalPerMbEpoch = Math.max(0, Number(import.meta.env.VITE_WALRUS_ESTIMATE_WAL_PER_MB_EPOCH || "0.0002"));
const estimateBaseSui = Math.max(0, Number(import.meta.env.VITE_WALRUS_ESTIMATE_BASE_SUI || "0.015"));
const requireWalrus = String(import.meta.env.VITE_REQUIRE_WALRUS).toLowerCase() === "true";
const walrusRequested = requireWalrus || import.meta.env.VITE_STORAGE_MODE === "walrus";
const publisherConfigured = Boolean(import.meta.env.VITE_WALRUS_PUBLISHER_URL);
const uploadRelayConfigured = Boolean(WALRUS_UPLOAD_RELAY_URL);
const tatumStorageConfigured = isTatumStorageEnabled() && Boolean(getTatumStorageWriteUrl());
let relayTipConfigPromise: Promise<RelayTipConfig | null> | null = null;

function createEstimateManifest(form: Pick<FormSchema, "id" | "createdAt" | "headerImage" | "headerLogo">): SignalManifest {
  return {
    version: 1,
    formId: form.id,
    createdAt: form.createdAt,
    updatedAt: form.createdAt,
    formBlobId: bundledFormPointer,
    headerImage: form.headerImage,
    headerLogo: form.headerLogo,
    submissions: [],
  };
}

function normalizeNumber(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function findTipConfig(payload: RelayTipConfig | null): RelayTipConfig | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if ("kind" in payload && payload.kind) {
    return payload;
  }
  if ("sendTip" in payload) {
    return findTipConfig(payload.sendTip ?? null);
  }
  if ("tip" in payload) {
    return findTipConfig(payload.tip ?? null);
  }
  return null;
}

function estimateEncodedKib(payloadBytes: number) {
  // Walrus adds fixed per-blob metadata and erasure-coding overhead; this keeps
  // relay-tip estimates conservative when a relay charges by encoded KiB.
  const encodedBytes = Math.max(payloadBytes * 5, 66_034_000);
  return Math.ceil(encodedBytes / 1024);
}

function estimateRelayTipMist(payload: RelayTipConfig | null, payloadBytes: number) {
  const tip = findTipConfig(payload);
  const kind = tip && "kind" in tip ? tip.kind : null;
  if (!kind) {
    return null;
  }
  const constTip = normalizeNumber(kind.const);
  if (constTip !== null) {
    return constTip;
  }
  const linear = kind.linear;
  if (!linear) {
    return null;
  }
  const base = normalizeNumber(linear.base) ?? 0;
  const perEncodedKib = normalizeNumber(linear.perEncodedKib) ?? 0;
  return base + perEncodedKib * estimateEncodedKib(payloadBytes);
}

function estimateWal(payloadBytes: number) {
  const payloadMb = payloadBytes / (1024 * 1024);
  return estimateBaseWal + payloadMb * storageEpochs * estimateWalPerMbEpoch;
}

function estimateSui(relayTipMist: number | null) {
  return estimateBaseSui + (relayTipMist ?? 0) / 1_000_000_000;
}

function buildEstimateCosts(payloadBytes: number, relayTipMist: number | null) {
  return {
    estimatedWal: estimateWal(payloadBytes),
    estimatedSui: estimateSui(relayTipMist),
  };
}

export function getWalrusEstimatePayloadBytes(form: FormSchema) {
  const payload = {
    version: 1,
    kind: "formBundle",
    form,
    manifest: createEstimateManifest(form),
  };
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}

export async function createWalrusCostEstimate(form: FormSchema): Promise<WalrusCostEstimate> {
  const payloadBytes = getWalrusEstimatePayloadBytes(form);

  if (!walrusRequested) {
    return {
      status: "local-fallback",
      payloadBytes,
      storageEpochs,
      storageMode: walrusStorageMode,
      relayTipMist: null,
      estimatedWal: null,
      estimatedSui: null,
      relayTipSource: "not-applicable",
      note: "Local storage mode is active; publish does not create a Walrus write cost.",
    };
  }

  if (walrusStorageMode === "publisher") {
    const estimatedCosts = publisherConfigured
      ? buildEstimateCosts(payloadBytes, null)
      : { estimatedWal: null, estimatedSui: null };
    return {
      status: publisherConfigured ? "ready" : "local-fallback",
      payloadBytes,
      storageEpochs,
      storageMode: "publisher",
      relayTipMist: null,
      ...estimatedCosts,
      relayTipSource: "not-applicable",
      note: publisherConfigured
        ? "Publisher mode returns exact Walrus cost after upload."
        : "Publisher is not configured; publish may use local fallback.",
    };
  }

  if (walrusStorageMode === "tatum") {
    return {
      status: tatumStorageConfigured ? "ready" : "local-fallback",
      payloadBytes,
      storageEpochs,
      storageMode: "tatum",
      relayTipMist: null,
      estimatedWal: null,
      estimatedSui: null,
      relayTipSource: "not-applicable",
      note: tatumStorageConfigured
        ? "Tatum Storage API handles upload and certification asynchronously; final billing is managed by Tatum."
        : "Tatum storage is not configured; publish may use local fallback.",
    };
  }

  if (!uploadRelayConfigured) {
    return {
      status: "local-fallback",
      payloadBytes,
      storageEpochs,
      storageMode: "uploadRelay",
      relayTipMist: null,
      estimatedWal: null,
      estimatedSui: null,
      relayTipSource: "unavailable",
      note: "Upload relay is not configured; publish may use local fallback.",
    };
  }

  try {
    relayTipConfigPromise ??= fetch(`${WALRUS_UPLOAD_RELAY_URL.replace(/\/$/, "")}/v1/tip-config`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Relay tip config returned ${response.status}.`);
        }
        return response.json() as Promise<RelayTipConfig>;
      })
      .catch(() => null);
    const payload = await relayTipConfigPromise;
    if (!payload) {
      throw new Error("Relay tip config unavailable.");
    }
    const relayTipMist = estimateRelayTipMist(payload, payloadBytes);
    return {
      status: "ready",
      payloadBytes,
      storageEpochs,
      storageMode: "uploadRelay",
      relayTipMist,
      ...buildEstimateCosts(payloadBytes, relayTipMist),
      relayTipSource: "tip-config",
      note: "Relay tip is estimated before upload; WAL storage and SUI gas finalize in wallet approval.",
    };
  } catch {
    return {
      status: "relay-unavailable",
      payloadBytes,
      storageEpochs,
      storageMode: "uploadRelay",
      relayTipMist: null,
      ...buildEstimateCosts(payloadBytes, null),
      relayTipSource: "unavailable",
      note: "Relay tip config was unavailable; WAL storage and SUI gas finalize in wallet approval.",
    };
  }
}
