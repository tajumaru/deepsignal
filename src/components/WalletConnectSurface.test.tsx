import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletConnectSurface } from "./WalletConnectSurface";

const {
  copyRouteLifecycleDiagnosticsToClipboardSpy,
  remountWalletProviderSpy,
  resetWalletSessionSpy,
  walletRuntimeControls,
  routeDiagnosticsState,
  routeRecoveryState,
  walletRuntimeRecoveryState,
} = vi.hoisted(() => ({
  copyRouteLifecycleDiagnosticsToClipboardSpy: vi.fn(async () => true),
  remountWalletProviderSpy: vi.fn(),
  resetWalletSessionSpy: vi.fn(async (options?: { onBeforeReload?: () => void }) => {
    options?.onBeforeReload?.();
    return { disconnectError: null, removedKeys: [] };
  }),
  walletRuntimeControls: {
    beginManualConnect: vi.fn(),
    cancelManualConnect: vi.fn(),
    clearConnectFailure: vi.fn(),
    suppressAutoRestore: vi.fn(),
  },
  routeDiagnosticsState: {
    mobileSafari: false,
  },
  routeRecoveryState: {
    cssAssetError: null as string | null,
    failedChunkUrl: null as string | null,
    pagehideCount: 0,
    pageshowCount: 0,
    pendingLabels: [] as string[],
    phase: "idle" as "idle" | "importing" | "css_recovering" | "css_failed",
    visibilityState: "visible" as DocumentVisibilityState,
  },
  walletRuntimeRecoveryState: {
    hadPriorWalletConnectChunkFailure: false,
    reloadWalletConnectRuntimeForRetry: vi.fn(async () => true),
  },
}));

const walletState = {
  status: "disconnected",
  accountAddress: undefined,
  walletName: undefined,
  displayName: "",
  isConnected: false,
  isConnecting: false,
  isDisconnecting: false,
  isProviderPending: false,
  isRestoringConnection: false,
  connectLockState: "idle" as "idle" | "manual_connecting" | "auto_restoring",
  connectMode: null as null | "manual" | "autoRestore",
  lastConnectFailure: null as null | {
    classification: string;
    message: string;
    source: string;
    requiresSlushRecovery: boolean;
    userMessage: string | null;
  },
  disconnect: async () => undefined,
};

const walletRuntimeState = {
  failed: false,
  loaded: false,
  loading: false,
  requestLoad: vi.fn(() => {
    walletRuntimeState.loading = true;
    walletRuntimeState.failed = false;
  }),
};

vi.mock("../hooks/useSuiWallet", () => ({
  useSuiWallet: () => walletState,
}));

vi.mock("../i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../walletStatus", () => ({
  useWalletRuntimeControls: () => walletRuntimeControls,
}));

vi.mock("./WalletSurfaceRuntime", () => ({
  useWalletProviderRuntime: () => walletRuntimeState,
}));

vi.mock("../lib/routeDiagnostics", () => ({
  copyRouteLifecycleDiagnosticsToClipboard: copyRouteLifecycleDiagnosticsToClipboardSpy,
  getBrowserCapabilitiesSnapshot: () => routeDiagnosticsState,
  logRouteLifecycle: vi.fn(),
}));

vi.mock("../lib/routeRecoveryState", () => ({
  useRouteRecoveryState: () => routeRecoveryState,
}));

vi.mock("../lib/walletConnectRuntimeRecovery", () => ({
  hadPriorWalletConnectChunkFailure: () => walletRuntimeRecoveryState.hadPriorWalletConnectChunkFailure,
  reloadWalletConnectRuntimeForRetry: walletRuntimeRecoveryState.reloadWalletConnectRuntimeForRetry,
}));

vi.mock("../lib/walletSessionReset", () => ({
  resetWalletSession: resetWalletSessionSpy,
}));

vi.mock("../walletProviderReset", () => ({
  useWalletProviderReset: () => ({
    remountWalletProvider: remountWalletProviderSpy,
  }),
}));

afterEach(() => {
  walletState.status = "disconnected";
  walletState.isConnecting = false;
  walletState.isRestoringConnection = false;
  walletState.connectLockState = "idle";
  walletState.connectMode = null;
  walletState.lastConnectFailure = null;
  walletRuntimeState.loaded = false;
  walletRuntimeState.failed = false;
  walletRuntimeState.loading = false;
  walletRuntimeState.requestLoad.mockClear();
  copyRouteLifecycleDiagnosticsToClipboardSpy.mockClear();
  remountWalletProviderSpy.mockClear();
  resetWalletSessionSpy.mockClear();
  walletRuntimeControls.beginManualConnect.mockClear();
  walletRuntimeControls.cancelManualConnect.mockClear();
  walletRuntimeControls.clearConnectFailure.mockClear();
  walletRuntimeControls.suppressAutoRestore.mockClear();
  routeDiagnosticsState.mobileSafari = false;
  routeRecoveryState.cssAssetError = null;
  routeRecoveryState.failedChunkUrl = null;
  routeRecoveryState.pagehideCount = 0;
  routeRecoveryState.pageshowCount = 0;
  routeRecoveryState.pendingLabels = [];
  routeRecoveryState.phase = "idle";
  routeRecoveryState.visibilityState = "visible";
  walletRuntimeRecoveryState.hadPriorWalletConnectChunkFailure = false;
  walletRuntimeRecoveryState.reloadWalletConnectRuntimeForRetry.mockClear();
  cleanup();
});

describe("WalletConnectSurface", () => {
  it("lets the user dismiss a stuck opening state and return to connect", () => {
    walletRuntimeState.requestLoad.mockImplementation(() => {
      walletRuntimeState.loading = true;
      walletRuntimeState.failed = false;
    });

    const { rerender } = render(<WalletConnectSurface compact surface="mobileDrawer" />);

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    rerender(<WalletConnectSurface compact surface="mobileDrawer" />);

    expect(walletRuntimeState.requestLoad).toHaveBeenCalledTimes(1);
    expect(walletRuntimeControls.beginManualConnect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Opening..." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(walletRuntimeControls.cancelManualConnect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("returns to a retry state when wallet runtime loading fails", () => {
    walletRuntimeState.requestLoad.mockImplementation(() => {
      walletRuntimeState.loading = true;
      walletRuntimeState.failed = false;
    });

    const { rerender } = render(<WalletConnectSurface compact surface="mobileDrawer" />);

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    walletRuntimeState.loading = false;
    walletRuntimeState.failed = true;
    rerender(<WalletConnectSurface compact surface="mobileDrawer" />);

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("blocks manual connect while route recovery is still pending", () => {
    walletState.status = "connecting";
    walletState.isConnecting = false;
    walletState.isRestoringConnection = true;
    walletState.connectLockState = "auto_restoring";
    walletState.connectMode = "autoRestore";
    routeRecoveryState.phase = "importing";
    routeRecoveryState.pendingLabels = ["route-form-builder"];
    walletRuntimeState.requestLoad.mockImplementation(() => {
      walletRuntimeState.loading = true;
    });

    render(<WalletConnectSurface compact surface="mobileDrawer" />);

    expect(screen.getByRole("button", { name: "Route recovering..." })).toBeDisabled();

    expect(walletRuntimeControls.beginManualConnect).toHaveBeenCalledTimes(0);
    expect(walletRuntimeControls.suppressAutoRestore).toHaveBeenCalledTimes(0);
    expect(walletRuntimeState.requestLoad).toHaveBeenCalledTimes(0);
  });

  it("re-imports the wallet connect runtime on mobile Safari after a prior preload failure", async () => {
    routeDiagnosticsState.mobileSafari = true;
    walletRuntimeRecoveryState.hadPriorWalletConnectChunkFailure = true;

    render(<WalletConnectSurface compact surface="mobileDrawer" />);

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(walletRuntimeRecoveryState.reloadWalletConnectRuntimeForRetry).toHaveBeenCalledTimes(1);
  });

  it("does not create overlapping manual connect attempts on repeated clicks", () => {
    walletRuntimeState.requestLoad.mockImplementation(() => {
      walletRuntimeState.loading = true;
    });

    render(<WalletConnectSurface compact surface="mobileDrawer" />);

    const button = screen.getByRole("button", { name: "Connect" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(walletRuntimeState.requestLoad).toHaveBeenCalledTimes(1);
    expect(walletRuntimeControls.beginManualConnect).toHaveBeenCalledTimes(1);
  });

  it("keeps the empty dashboard wallet header passive until the user explicitly taps connect", () => {
    walletRuntimeState.loaded = true;

    render(
      <WalletConnectSurface
        compact
        passiveUntilRequested
        runtimeStatus={{
          accountAddress: null,
          connectMode: null,
          openState: "passive",
          projectRestoreState: "ready_without_project",
          selectedProjectId: "",
          walletConnectedState: "disconnected",
          walletProviderState: "disconnected",
        }}
        surface="mobileDrawer"
      />,
    );

    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(walletRuntimeState.requestLoad).toHaveBeenCalledTimes(0);
    expect(walletRuntimeControls.beginManualConnect).toHaveBeenCalledTimes(0);
    expect(walletRuntimeControls.cancelManualConnect).toHaveBeenCalledTimes(0);
  });

  it("does not repeatedly update state while disconnected without an account on the empty dashboard shell", () => {
    walletRuntimeState.loaded = true;

    const runtimeStatus = {
      accountAddress: null,
      connectMode: null,
      openState: "passive" as const,
      projectRestoreState: "ready_without_project",
      selectedProjectId: "",
      walletConnectedState: "disconnected" as const,
      walletProviderState: "disconnected" as const,
    };

    const { rerender } = render(
      <WalletConnectSurface compact passiveUntilRequested runtimeStatus={runtimeStatus} surface="mobileDrawer" />,
    );

    rerender(<WalletConnectSurface compact passiveUntilRequested runtimeStatus={runtimeStatus} surface="mobileDrawer" />);
    rerender(<WalletConnectSurface compact passiveUntilRequested runtimeStatus={runtimeStatus} surface="mobileDrawer" />);

    expect(walletRuntimeControls.beginManualConnect).toHaveBeenCalledTimes(0);
    expect(walletRuntimeControls.cancelManualConnect).toHaveBeenCalledTimes(0);
    expect(walletRuntimeControls.clearConnectFailure).toHaveBeenCalledTimes(0);
    expect(walletRuntimeControls.suppressAutoRestore).toHaveBeenCalledTimes(0);
  });

  it("shows the Slush hard recovery controls and remounts the wallet provider only on explicit reset", async () => {
    walletState.lastConnectFailure = {
      classification: "slush_dapp_registration_failed",
      message: "Failed to add dApp connection.",
      source: "slush_injected_provider",
      requiresSlushRecovery: true,
      userMessage: "Slush could not register this dApp connection. Open Slush, remove the old DeepSignal connection, then try again.",
    };

    render(<WalletConnectSurface compact context="adminGate" />);

    expect(
      screen.getByText("Slush could not register this dApp connection. Open Slush, remove the old DeepSignal connection, then try again."),
    ).toBeInTheDocument();
    walletRuntimeControls.cancelManualConnect.mockClear();
    walletRuntimeControls.clearConnectFailure.mockClear();
    walletRuntimeControls.suppressAutoRestore.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Copy diagnostics" }));
    expect(copyRouteLifecycleDiagnosticsToClipboardSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Reset wallet session" }));

    await waitFor(() => expect(resetWalletSessionSpy).toHaveBeenCalledTimes(1));
    expect(walletRuntimeControls.cancelManualConnect).toHaveBeenCalledTimes(1);
    expect(walletRuntimeControls.clearConnectFailure).toHaveBeenCalledTimes(1);
    expect(walletRuntimeControls.suppressAutoRestore).toHaveBeenCalledTimes(1);
    expect(remountWalletProviderSpy).toHaveBeenCalledTimes(1);
    expect(walletRuntimeState.requestLoad).toHaveBeenCalledTimes(0);
  });
});
