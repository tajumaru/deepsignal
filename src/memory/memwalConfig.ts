export type MemWalConfigValidation = {
  enabled: boolean;
  configured: boolean;
  serverUrl: string | null;
  accountId: string | null;
  delegateKey: string | null;
  namespacePrefix: string;
  missing: string[];
  errors: string[];
};

type MemWalConfigEnv = Pick<
  ImportMetaEnv,
  | "VITE_MEMWAL_ENABLED"
  | "VITE_MEMWAL_SERVER_URL"
  | "VITE_MEMWAL_ACCOUNT_ID"
  | "VITE_MEMWAL_DELEGATE_KEY"
  | "VITE_MEMWAL_NAMESPACE_PREFIX"
>;

function readFlag(value?: string) {
  return String(value || "").toLowerCase() === "true";
}

function readOptional(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hasHexLikeDelegateKey(value: string) {
  return /^(?:0x)?[a-f0-9]{64,}$/i.test(value);
}

export function validateMemWalConfig(env: MemWalConfigEnv = import.meta.env): MemWalConfigValidation {
  const enabled = readFlag(env.VITE_MEMWAL_ENABLED);
  const serverUrl = readOptional(env.VITE_MEMWAL_SERVER_URL);
  const accountId = readOptional(env.VITE_MEMWAL_ACCOUNT_ID);
  const delegateKey = readOptional(env.VITE_MEMWAL_DELEGATE_KEY);
  const namespacePrefix = readOptional(env.VITE_MEMWAL_NAMESPACE_PREFIX) ?? "deepsignal";

  if (!enabled) {
    return {
      enabled: false,
      configured: false,
      serverUrl,
      accountId,
      delegateKey,
      namespacePrefix,
      missing: [],
      errors: [],
    };
  }

  const requiredSettings: Array<{ name: string; value: string | null }> = [
    { name: "VITE_MEMWAL_SERVER_URL", value: serverUrl },
    { name: "VITE_MEMWAL_ACCOUNT_ID", value: accountId },
    { name: "VITE_MEMWAL_DELEGATE_KEY", value: delegateKey },
  ];
  const missing = requiredSettings.filter((setting) => !setting.value).map((setting) => setting.name);

  const errors: string[] = [];
  if (serverUrl) {
    try {
      const parsed = new URL(serverUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        errors.push("VITE_MEMWAL_SERVER_URL must use http or https.");
      }
    } catch {
      errors.push("VITE_MEMWAL_SERVER_URL must be a valid URL.");
    }
  }
  if (delegateKey && !hasHexLikeDelegateKey(delegateKey)) {
    errors.push("VITE_MEMWAL_DELEGATE_KEY must be a hex-encoded Ed25519 delegate key.");
  }
  if (!/^[a-z0-9:_-]+$/i.test(namespacePrefix)) {
    errors.push("VITE_MEMWAL_NAMESPACE_PREFIX may only contain letters, numbers, colon, underscore, and hyphen.");
  }

  return {
    enabled,
    configured: missing.length === 0 && errors.length === 0,
    serverUrl,
    accountId,
    delegateKey,
    namespacePrefix,
    missing,
    errors,
  };
}
