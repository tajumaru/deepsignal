import { useCallback, useMemo, useState } from "react";
import {
  useCurrentAccount as useCurrentAccountNext,
  useCurrentClient,
  useCurrentNetwork,
  useCurrentWallet as useCurrentWalletNext,
  useDAppKit,
  useWalletConnection,
} from "@mysten/dapp-kit-react";
import type { DAppKit, UiWallet, UiWalletAccount } from "@mysten/dapp-kit-react";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { SUI_NETWORK } from "./sui";

export type DeepSignalDAppKit = DAppKit<[typeof SUI_NETWORK], SuiJsonRpcClient>;

declare module "@mysten/dapp-kit-react" {
  interface Register {
    dAppKit: DeepSignalDAppKit;
  }
}

const DEFAULT_PREFERRED_WALLETS = ["Sui Wallet", "Slush", "Phantom", "OKX Wallet"];

type LegacyMutationResult<TArgs, TResult> = {
  isPending: boolean;
  mutateAsync: (args: TArgs) => Promise<TResult>;
};

type LegacyVoidMutationResult<TResult> = {
  isPending: boolean;
  mutateAsync: () => Promise<TResult>;
};

type LegacySignAndExecuteResult = {
  digest: string;
  rawResult: Awaited<ReturnType<ReturnType<typeof useDAppKit>["signAndExecuteTransaction"]>>;
};

export function walletMatchesPreferredFeatureSet(wallet: Pick<UiWallet, "name" | "features">) {
  if (wallet.name.toLowerCase().includes("nightly")) {
    return false;
  }
  return Boolean(wallet.features.includes("sui:signTransaction") || wallet.features.includes("sui:signTransactionBlock"));
}

export function compareWalletPreference(left: Pick<UiWallet, "name">, right: Pick<UiWallet, "name">) {
  const leftIndex = DEFAULT_PREFERRED_WALLETS.indexOf(left.name);
  const rightIndex = DEFAULT_PREFERRED_WALLETS.indexOf(right.name);
  const normalizedLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
  const normalizedRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
  if (normalizedLeftIndex !== normalizedRightIndex) {
    return normalizedLeftIndex - normalizedRightIndex;
  }
  return left.name.localeCompare(right.name);
}

function useAsyncMutation<TArgs, TResult>(
  action: (args: TArgs) => Promise<TResult>,
): LegacyMutationResult<TArgs, TResult> {
  const [isPending, setIsPending] = useState(false);
  const mutateAsync = useCallback(
    async (args: TArgs) => {
      setIsPending(true);
      try {
        return await action(args);
      } finally {
        setIsPending(false);
      }
    },
    [action],
  );

  return useMemo(
    () => ({
      isPending,
      mutateAsync,
    }),
    [isPending, mutateAsync],
  );
}

function useAsyncVoidMutation<TResult>(
  action: () => Promise<TResult>,
): LegacyVoidMutationResult<TResult> {
  const [isPending, setIsPending] = useState(false);
  const mutateAsync = useCallback(async () => {
    setIsPending(true);
    try {
      return await action();
    } finally {
      setIsPending(false);
    }
  }, [action]);

  return useMemo(
    () => ({
      isPending,
      mutateAsync,
    }),
    [isPending, mutateAsync],
  );
}

export function useCurrentAccount() {
  return useCurrentAccountNext();
}

export function useCurrentWallet() {
  const currentWallet = useCurrentWalletNext();
  const connection = useWalletConnection();
  return useMemo(
    () => ({
      currentWallet,
      connectionStatus: connection.status === "reconnecting" ? "connecting" : connection.status,
      isConnected: connection.isConnected,
      supportedIntents: connection.supportedIntents,
    }),
    [connection.isConnected, connection.status, connection.supportedIntents, currentWallet],
  );
}

export function useSuiClient() {
  return useCurrentClient();
}

export function useSuiClientContext() {
  const client = useCurrentClient();
  const network = useCurrentNetwork();
  return useMemo(
    () => ({
      client,
      config: null,
      network,
    }),
    [client, network],
  );
}

export function useAccounts() {
  const wallet = useCurrentWalletNext();
  return wallet?.accounts ?? [];
}

export function useDisconnectWallet() {
  const dAppKit = useDAppKit();
  return useAsyncVoidMutation(async () => {
    await dAppKit.disconnectWallet();
  });
}

export function useSwitchAccount() {
  const dAppKit = useDAppKit();
  return useAsyncMutation<{ account: UiWalletAccount }, void>(async ({ account }) => {
    dAppKit.switchAccount({ account });
  });
}

export function useSignPersonalMessage() {
  const dAppKit = useDAppKit();
  return useAsyncMutation<{ message: Uint8Array }, Awaited<ReturnType<typeof dAppKit.signPersonalMessage>>>(
    async ({ message }) => dAppKit.signPersonalMessage({ message }),
  );
}

export function useSignAndExecuteTransaction() {
  const dAppKit = useDAppKit();
  return useAsyncMutation<{ transaction: unknown }, LegacySignAndExecuteResult>(async ({ transaction }) => {
    const rawResult = await dAppKit.signAndExecuteTransaction({
      transaction: transaction as Parameters<typeof dAppKit.signAndExecuteTransaction>[0]["transaction"],
    });
    if (rawResult.FailedTransaction) {
      throw new Error(rawResult.FailedTransaction.status.error?.message ?? "Sui transaction failed.");
    }
    return {
      digest: rawResult.Transaction.digest,
      rawResult,
    };
  });
}
