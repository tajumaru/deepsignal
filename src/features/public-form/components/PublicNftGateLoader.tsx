import { lazy, Suspense } from "react";
import { retryLazyImport } from "../../../lib/lazyRetry";
import type { FormSchema } from "../../../types";
import type { PublicNftGateRuntimeState } from "./PublicNftGateRuntimeState";

const LazyPublicNftGateRuntime = lazy(() =>
  retryLazyImport(() => import("./PublicNftGateRuntime"), "public-nft-gate-runtime").then((module) => ({
    default: module.PublicNftGateRuntime,
  })),
);

interface PublicNftGateLoaderProps {
  enabled: boolean;
  form: FormSchema | null;
  walletAddress?: string;
  onStateChange: (state: PublicNftGateRuntimeState) => void;
}

export function PublicNftGateLoader({
  enabled,
  form,
  walletAddress,
  onStateChange,
}: PublicNftGateLoaderProps) {
  if (!enabled) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyPublicNftGateRuntime
        form={form}
        walletAddress={walletAddress}
        onStateChange={onStateChange}
      />
    </Suspense>
  );
}
