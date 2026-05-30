import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { RpcInfrastructureContext, type RpcInfrastructureContextValue } from "../rpcInfrastructure";
import { AdminDashboardPage } from "./AdminDashboardPage";

const { emptyCapabilityProfile, signalIndex } = vi.hoisted(() => ({
  emptyCapabilityProfile: {
    isConfigured: true,
    packageId: "0x1",
    registryId: "0x2",
    hasOwnerCap: false,
    hasAdminCap: false,
    hasReviewerCap: false,
    ownerCapIds: [],
    adminCapIds: [],
    reviewerCapIds: [],
  },
  signalIndex: {
    counts: {
      needsReview: 0,
      unresolved: 0,
      unread: 0,
      verified: 0,
      anonymous: 0,
      published: 0,
      high: 0,
      followUp: 0,
      encrypted: 0,
      archived: 0,
      pendingSui: 0,
      registeredSui: 0,
    },
    pendingSignalIdSet: new Set<string>(),
    signalById: {},
    unreadCountByFormId: {},
    signalCountByFormId: {},
  },
}));

const mockRpcInfrastructure: RpcInfrastructureContextValue = {
  mode: "default",
  network: "testnet",
  currentRpcUrl: "https://rpc.testnet.sui.io",
  displayRpcUrl: "Sui RPC",
  defaultRpcUrl: "https://rpc.testnet.sui.io",
  tatumRpcUrl: null,
  providerLabel: "Sui RPC",
  usingTatum: false,
  canUseTatum: false,
  connectedNetworkLabel: "Sui Testnet",
  setConnectedNetworkLabel: vi.fn(),
  switchToDefault: vi.fn(),
  switchToTatum: vi.fn(),
  noteRateLimited: vi.fn(),
  clearRateLimitedState: vi.fn(),
  rateLimitedUntil: 0,
  isRateLimitedCooldownActive: false,
  canAutoFallbackFromRateLimit: false,
};

vi.mock("@mysten/dapp-kit", () => ({
  useSignAndExecuteTransaction: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useSuiClient: () => ({
    getObject: vi.fn(),
    multiGetObjects: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock("../components/WalletConnectSurface", () => ({
  WalletConnectSurface: () => <button type="button">Connect wallet</button>,
}));

vi.mock("../hooks/useSuiWallet", () => ({
  useSuiWallet: () => ({
    account: null,
    accountAddress: undefined,
    walletName: undefined,
    status: "disconnected",
    isConnected: false,
    isConnecting: false,
    isDisconnecting: false,
    isRestoringConnection: false,
    displayName: "",
    suinsName: null,
    shortAddressLabel: "",
    error: null,
    disconnect: vi.fn(),
    copyAddress: vi.fn(),
  }),
}));

vi.mock("../hooks/useAccessControl", () => ({
  useAccessControl: () => ({
    capabilityProfile: emptyCapabilityProfile,
    isPending: false,
    isLoadingAccess: false,
    ownedObjects: [],
    refetch: vi.fn(),
  }),
}));

vi.mock("../features/admin/hooks/useSignalInboxData", () => ({
  useSignalInboxData: () => ({
    forms: [],
    loading: false,
    submissionsLoading: false,
    loadError: "",
    selectedFormId: "all",
    setSelectedFormId: vi.fn(),
    selectedStreamId: "all",
    setSelectedStreamId: vi.fn(),
    selectedSignalId: "",
    setSelectedSignalId: vi.fn(),
    search: "",
    setSearch: vi.fn(),
    loadConsole: vi.fn().mockResolvedValue(undefined),
    accessibleForms: [],
    submissionsByFormId: {},
    signalIndex,
    allSignals: [],
    visibleSignals: [],
    selectedRecord: null,
    applyFormUpdate: vi.fn(),
    applyFormRemovals: vi.fn(),
    applySubmissionUpdate: vi.fn(),
  }),
}));

vi.mock("../features/admin/hooks/useProjectWorkspace", () => ({
  useProjectWorkspace: () => ({
    projects: [],
    refetchProjects: vi.fn().mockResolvedValue(undefined),
    selectedProjectId: "",
    selectProject: vi.fn(),
    selectedProject: null,
    manualProjectId: "",
    setManualProjectId: vi.fn(),
    projectCreateName: "",
    setProjectCreateName: vi.fn(),
    highlightCreateFormCta: false,
    isCreatingProject: false,
    projectState: "",
    deletingProject: false,
    deleteProjectBlockedReason: "",
    manualProjectInputRef: { current: null },
    projectCreateInputRef: { current: null },
    visibleOnchainForms: [],
    connectManualProject: vi.fn(),
    handleCreateProject: vi.fn(),
    handleDeleteProject: vi.fn(),
  }),
}));

vi.mock("../features/admin/hooks/usePendingSuiRegistration", () => ({
  usePendingSuiRegistration: () => ({
    selectedPendingSignalIds: [],
    registeringSignalIds: [],
    isRegisteringSignal: () => false,
    togglePendingSelection: vi.fn(),
    setPendingSelections: vi.fn(),
    handleRegisterPendingSignals: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../features/admin/hooks/usePrivateSignalDecrypt", () => ({
  usePrivateSignalDecrypt: () => ({
    detailAnswers: null,
    detailAttachments: [],
    detailLegacyUnencrypted: false,
    decrypting: false,
    decryptState: "idle",
    decryptStatusMessage: "",
    decryptError: "",
    decryptDiagnostics: null,
    setDecryptError: vi.fn(),
    decryptedSignalsById: {},
    bulkDecrypting: false,
    bulkDecryptStatusMessage: "",
    bulkDecryptError: "",
    bulkDecryptProgress: { completed: 0, failed: 0, total: 0 },
    decryptInFlightRef: { current: false },
    bulkDecryptInFlightRef: { current: false },
    decryptContext: null,
    handleDecrypt: vi.fn(),
    handleDecryptRecords: vi.fn().mockResolvedValue(undefined),
    realSealSessionTtlMinutes: null,
  }),
}));

vi.mock("../features/admin/hooks/useReviewWorkspace", () => ({
  useReviewWorkspace: () => ({
    reviewSaveStatus: "idle",
    setReviewSaveStatus: vi.fn(),
    activeReviewDraft: null,
    hasReviewDraftChanges: false,
    reviewStatusPillState: "idle",
    reviewStatusPillLabel: "",
    patchReviewDraft: vi.fn(),
    buildSubmissionFromReviewDraft: vi.fn(),
    syncReviewDraftFromSubmission: vi.fn(),
    reviewSessionOpen: false,
    forceCloseReviewSession: vi.fn(),
    requestCloseReviewSession: vi.fn(),
    openReviewSession: vi.fn(),
    reviewSessionStep: 1,
    setReviewSessionStep: vi.fn(),
    reviewSessionMobileTab: "review",
    setReviewSessionMobileTab: vi.fn(),
  }),
}));

vi.mock("../hooks/useAttachmentPreviews", () => ({
  useAttachmentPreviews: () => [],
}));

vi.mock("../hooks/useReviewerDisplayLabel", () => ({
  useReviewerDisplayLabel: (value: string) => value,
}));

function renderAdminRoute() {
  render(
    <MemoryRouter initialEntries={["/admin"]}>
      <RpcInfrastructureContext.Provider value={mockRpcInfrastructure}>
        <I18nProvider>
          <AdminDashboardPage />
        </I18nProvider>
      </RpcInfrastructureContext.Provider>
    </MemoryRouter>,
  );
}

describe("AdminDashboardPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete (globalThis as typeof globalThis & { demoScenario?: unknown }).demoScenario;
  });

  it("renders the disconnected local-fallback admin route without demo globals", async () => {
    expect("demoScenario" in globalThis).toBe(false);

    renderAdminRoute();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Connect Wallet" })).toBeInTheDocument());
    expect(screen.getByText("Wallet Verified access is required for admin and dashboard views.")).toBeInTheDocument();
    expect(screen.queryByText(/demoScenario is not defined/)).not.toBeInTheDocument();
  });
});
