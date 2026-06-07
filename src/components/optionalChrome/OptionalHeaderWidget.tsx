import { lazy, Suspense, useMemo, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { shouldRejectWalletUiImport } from "../../lib/mobileSafariSmoke";
import { SafeLazyBoundary } from "../SafeLazyBoundary";

type OptionalHeaderWidgetProps = {
  componentProps?: Record<string, unknown>;
  fallback: ReactNode;
  label: string;
  loader: () => Promise<{ default: ComponentType<any> }>;
  onError?: (error: unknown, errorInfo: ErrorInfo) => void;
  resetKey: string;
};

export function OptionalHeaderWidget({
  componentProps,
  fallback,
  label,
  loader,
  onError,
  resetKey,
}: OptionalHeaderWidgetProps) {
  const LazyComponent = useMemo(
    () =>
      lazy(async () => {
        if (shouldRejectWalletUiImport(label)) {
          throw new Error(`DeepSignal smoke rejected optional widget import: ${label}`);
        }
        return loader();
      }),
    [label, loader, resetKey],
  );

  return (
    <SafeLazyBoundary fallback={fallback} onError={onError} resetKey={resetKey}>
      <Suspense fallback={fallback}>
        <LazyComponent {...(componentProps ?? {})} />
      </Suspense>
    </SafeLazyBoundary>
  );
}
