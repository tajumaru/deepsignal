import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { WalletSurface } from "./WalletSurface";

const retryLazyImportMock = vi.fn();

vi.mock("../lib/lazyRetry", () => ({
  retryLazyImport: (...args: unknown[]) => retryLazyImportMock(...args),
}));

vi.mock("../lib/buildInfo", () => ({
  buildInfo: {
    appVersion: "test-build",
  },
}));

vi.mock("../lib/perf", () => ({
  endPerf: vi.fn(),
  markPerfMilestone: vi.fn(),
  startPerf: vi.fn(),
}));

vi.mock("../lib/routeDiagnostics", () => ({
  getBrowserCapabilitiesSnapshot: () => ({ mobileSafari: false, userAgent: "test-agent" }),
  logRouteLifecycle: vi.fn(),
}));

describe("WalletSurface", () => {
  beforeEach(() => {
    retryLazyImportMock.mockReset();
  });

  it("shares a single in-flight wallet provider import across concurrent surfaces", async () => {
    let resolveImport: ((value: {
      WalletProviders: ({ children }: { children: React.ReactNode }) => React.ReactNode;
    }) => void) | undefined;
    retryLazyImportMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        }),
    );

    render(
      <>
        <WalletSurface requestOnMount>
          <div>first</div>
        </WalletSurface>
        <WalletSurface requestOnMount>
          <div>second</div>
        </WalletSurface>
      </>,
    );

    expect(retryLazyImportMock).toHaveBeenCalledTimes(1);

    resolveImport?.({
      WalletProviders: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    });

    await waitFor(() => {
      expect(retryLazyImportMock).toHaveBeenCalledTimes(1);
    });
  });
});
