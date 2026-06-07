import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SafeLazyBoundary } from "../SafeLazyBoundary";
import { OptionalHeaderWidget } from "./OptionalHeaderWidget";

function HeaderWidgetBody({ label }: { label?: string }) {
  return <div>{label ?? "Wallet widget runtime"}</div>;
}

function RetryableBoundaryBody({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("retryable boundary failure");
  }
  return <div>Boundary recovered</div>;
}

function setWalletUiSmokeRejection(enabled: boolean) {
  const windowWithSmoke = window as Window & {
    __DEEPSIGNAL_SMOKE__?: {
      rejectWalletUiImport?: boolean;
    };
  };

  if (enabled) {
    windowWithSmoke.__DEEPSIGNAL_SMOKE__ = {
      rejectWalletUiImport: true,
    };
    return;
  }

  delete windowWithSmoke.__DEEPSIGNAL_SMOKE__;
}

afterEach(() => {
  cleanup();
  setWalletUiSmokeRejection(false);
  vi.restoreAllMocks();
});

describe("OptionalHeaderWidget", () => {
  it("renders fallback and does not rethrow when the lazy import rejects", async () => {
    setWalletUiSmokeRejection(true);
    const onError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() =>
      render(
        <OptionalHeaderWidget
          fallback={<div>Wallet widget unavailable</div>}
          label="wallet-runtime-connect-surface"
          loader={async () => ({ default: HeaderWidgetBody })}
          onError={onError}
          resetKey="wallet-runtime-connect-surface:0"
        />,
      ),
    ).not.toThrow();

    expect(await screen.findByText("Wallet widget unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Wallet widget runtime")).not.toBeInTheDocument();
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(consoleError).toHaveBeenCalled();
  });

  it("allows retry when the SafeLazyBoundary resetKey changes", async () => {
    const { rerender } = render(
      <SafeLazyBoundary fallback={<div>Boundary fallback</div>} resetKey="boundary:0">
        <RetryableBoundaryBody shouldThrow />
      </SafeLazyBoundary>,
    );

    expect(await screen.findByText("Boundary fallback")).toBeInTheDocument();

    rerender(
      <SafeLazyBoundary fallback={<div>Boundary fallback</div>} resetKey="boundary:1">
        <RetryableBoundaryBody shouldThrow={false} />
      </SafeLazyBoundary>,
    );

    expect(await screen.findByText("Boundary recovered")).toBeInTheDocument();
    expect(screen.queryByText("Boundary fallback")).not.toBeInTheDocument();
  });
});
