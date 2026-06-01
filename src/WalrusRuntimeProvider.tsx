import { Component, useEffect, type PropsWithChildren, type ReactNode } from "react";
import { endPerf, markPerfMilestone } from "./lib/perf";
import { setDeepSignalDebugReadiness } from "./lib/routeDiagnostics";
import WalrusRuntimeBridge from "./walrusRuntimeBridge";

export class OptionalWalrusRuntimeBoundary extends Component<
  PropsWithChildren<{ fallback?: ReactNode }>,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("Walrus runtime failed to initialize; continuing with local fallback.", error);
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback ?? null;
    }

    return this.props.children;
  }
}

export function WalrusRuntimeProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    setDeepSignalDebugReadiness({ walrusRuntimeProvider: "ready" });
    endPerf("provider:walrus-runtime", "ok");
    markPerfMilestone("provider:walrus-runtime:ready");
  }, []);

  return (
    <OptionalWalrusRuntimeBoundary fallback={children}>
      <WalrusRuntimeBridge>{children}</WalrusRuntimeBridge>
    </OptionalWalrusRuntimeBoundary>
  );
}
