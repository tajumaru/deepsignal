import { getSealRuntimeStatus } from "../../crypto/cryptoFactory";
import { SUI_FULLNODE_URL, SUI_NETWORK, WALRUS_AGGREGATOR_URL, WALRUS_UPLOAD_RELAY_URL } from "../../lib/sui";
import { getWalrusMutationRuntimeStatus } from "../../storage/walrusAdapter";
import { getSuiRuntimeContext } from "../../suiRuntime";

type NetworkName = "mainnet" | "testnet";

export type EncryptionReadinessWarningKind =
  | "project-missing"
  | "seal-env-incomplete"
  | "walrus-write-unavailable"
  | "network-mismatch";

export interface EncryptionReadinessWarning {
  kind: EncryptionReadinessWarningKind;
  message: string;
  blocksPublish: boolean;
  endpoint?: string;
  detectedNetwork?: NetworkName;
  configuredNetwork?: NetworkName;
}

function inferNetworkFromUrl(value: string): NetworkName | null {
  const lower = value.toLowerCase();
  if (lower.includes("mainnet")) {
    return "mainnet";
  }
  if (lower.includes("testnet")) {
    return "testnet";
  }
  return null;
}

function getNetworkMismatchWarnings(): EncryptionReadinessWarning[] {
  const activeRpcUrl = getSuiRuntimeContext().rpcUrl;
  const endpoints = [
    { label: "Walrus aggregator", value: WALRUS_AGGREGATOR_URL },
    { label: "Walrus upload relay", value: WALRUS_UPLOAD_RELAY_URL },
    { label: "Sui RPC", value: activeRpcUrl || SUI_FULLNODE_URL },
    { label: "Seal aggregator", value: import.meta.env.VITE_SEAL_AGGREGATOR_URL ?? "" },
  ];

  return endpoints.reduce<EncryptionReadinessWarning[]>((warnings, endpoint) => {
    const detectedNetwork = inferNetworkFromUrl(endpoint.value);
    if (detectedNetwork && detectedNetwork !== SUI_NETWORK) {
      warnings.push({
        kind: "network-mismatch",
        message: `${endpoint.label} appears to target ${detectedNetwork}, but DeepSignal is configured for ${SUI_NETWORK}. Align mainnet/testnet settings before using encrypted submissions.`,
        blocksPublish: false,
        endpoint: endpoint.label,
        detectedNetwork,
        configuredNetwork: SUI_NETWORK,
      });
    }
    return warnings;
  }, []);
}

export function getCreateFormEncryptionReadiness({
  encryptSubmissions,
  projectId,
  ownerAddress,
}: {
  encryptSubmissions: boolean;
  projectId?: string | null;
  ownerAddress?: string | null;
}): EncryptionReadinessWarning[] {
  if (!encryptSubmissions) {
    return [];
  }

  const warnings: EncryptionReadinessWarning[] = [];
  const sealRuntime = getSealRuntimeStatus();
  const walrusRuntime = getWalrusMutationRuntimeStatus();
  const walrusWriteUnavailable =
    !walrusRuntime.aggregatorConfigured ||
    !walrusRuntime.writeConfigured ||
    (walrusRuntime.storageMode === "uploadRelay" && (!walrusRuntime.hasClient || !walrusRuntime.hasWallet));

  if (!projectId?.trim() && !ownerAddress?.trim()) {
    warnings.push({
      kind: "project-missing",
      message:
        "Seal encryption is enabled, but no project or owner wallet is available. Connect a wallet before publishing private submissions.",
      blocksPublish: true,
    });
  }

  if (!sealRuntime.canEncrypt) {
    warnings.push({
      kind: "seal-env-incomplete",
      message:
        "Seal environment is incomplete. Encrypted submissions will fail closed until Seal package and key server are configured.",
      blocksPublish: true,
    });
  }

  if (walrusWriteUnavailable) {
    warnings.push({
      kind: "walrus-write-unavailable",
      message:
        "Encrypted submissions require Walrus write access. Configure Walrus write/upload relay before publishing an encrypted form.",
      blocksPublish: true,
    });
  }

  warnings.push(...getNetworkMismatchWarnings());

  return warnings;
}
