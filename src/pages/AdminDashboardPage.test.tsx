import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { RpcInfrastructureContext, type RpcInfrastructureContextValue } from "../rpcInfrastructure";
import type { FormSchema, Submission } from "../types";
import { AdminDashboardPage } from "./AdminDashboardPage";

const { defaultCapabilityProfile, mockCapabilityProfile, mockWalletState, mockProjectState, signalIndex, mockInboxState } = vi.hoisted(() => {
  const defaultCapabilityProfile = {
    isConfigured: true,
    packageId: "0x1",
    registryId: "0x2",
    hasOwnerCap: false,
    hasAdminCap: false,
    hasReviewerCap: false,
    ownerCapIds: [] as string[],
    adminCapIds: [] as string[],
    reviewerCapIds: [] as string[],
  };
  const signalIndex = {
    counts: {
      needsReview: 0,
      unresolved: 0,
      unread: 0,
      verified: 0,
      anonymous: 0,
      published: 0,
      high: 0,
      system: 0,
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
  };
  return {
    defaultCapabilityProfile,
    mockCapabilityProfile: { current: defaultCapabilityProfile },
    mockWalletState: {
      current: {
        accountAddress: undefined as string | undefined,
        isConnected: false,
        status: "disconnected",
      },
    },
    mockProjectState: {
      current: {
        projects: [] as any[],
        selectedProjectId: "",
        selectedProject: null as any,
      },
    },
    signalIndex,
    mockInboxState: {
      current: {
        forms: [],
        selectedStreamId: "all",
        allSignals: [],
        visibleSignals: [],
        selectedRecord: null,
        signalIndex,
      },
    } as { current: any },
  };
});

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
    account: mockWalletState.current.accountAddress ? { address: mockWalletState.current.accountAddress } : null,
    accountAddress: mockWalletState.current.accountAddress,
    walletName: undefined,
    status: mockWalletState.current.status,
    isConnected: mockWalletState.current.isConnected,
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
    capabilityProfile: mockCapabilityProfile.current,
    isPending: false,
    isLoadingAccess: false,
    ownedObjects: [],
    refetch: vi.fn(),
  }),
}));

vi.mock("../features/admin/hooks/useSignalInboxData", () => ({
  useSignalInboxData: () => ({
    forms: mockInboxState.current.forms,
    loading: false,
    submissionsLoading: false,
    loadError: "",
    selectedFormId: "all",
    setSelectedFormId: vi.fn(),
    selectedStreamId: mockInboxState.current.selectedStreamId,
    setSelectedStreamId: vi.fn(),
    selectedSignalId: mockInboxState.current.selectedRecord?.submission.id ?? "",
    setSelectedSignalId: vi.fn(),
    search: "",
    setSearch: vi.fn(),
    loadConsole: vi.fn().mockResolvedValue(undefined),
    accessibleForms: mockInboxState.current.forms,
    submissionsByFormId: {},
    signalIndex: mockInboxState.current.signalIndex,
    allSignals: mockInboxState.current.allSignals,
    visibleSignals: mockInboxState.current.visibleSignals,
    selectedRecord: mockInboxState.current.selectedRecord,
    applyFormUpdate: vi.fn(),
    applyFormRemovals: vi.fn(),
    applySubmissionUpdate: vi.fn(),
  }),
}));

vi.mock("../features/admin/hooks/useProjectWorkspace", () => ({
  useProjectWorkspace: () => ({
    projects: mockProjectState.current.projects,
    refetchProjects: vi.fn().mockResolvedValue(undefined),
    selectedProjectId: mockProjectState.current.selectedProjectId,
    selectProject: vi.fn(),
    selectedProject: mockProjectState.current.selectedProject,
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

function createSystemRecord() {
  const form: FormSchema = {
    id: "system:deepsignal-runtime",
    title: "DeepSignal System Alerts",
    description: "Runtime diagnostics",
    fields: [],
    sections: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const submission: Submission = {
    id: "system-error-1",
    formId: form.id,
    kind: "system_error",
    source: "deepsignal-runtime",
    systemSeverity: "critical",
    answers: {
      diagnostics: "raw-answer-secret",
    },
    attachments: [],
    publicPayload: {
      answers: {
        hidden: "public-answer-secret",
      },
    },
    respondentMeta: {
      chain: "sui",
      isAnonymous: true,
      sessionId: "session-secret",
      submittedAt: "2026-01-01T00:00:00.000Z",
    },
    metadata: {
      systemDiagnostics: {
        severity: "critical",
        fingerprint: "fp-admin",
        errorName: "ChunkLoadError",
        errorMessage: "Failed https://example.test/assets/admin.js?token=abc#frag",
        errorStack: "Error session=secret-token at https://example.test/assets/admin.js?token=abc#frag:1:2",
        routePath: "/admin?token=abc#frag",
        routeId: "admin",
        chunkUrl: "https://example.test/assets/admin.js?token=abc#frag",
        buildVersion: "0.12.21",
        gitHash: "abc123",
        platform: "iPhone",
        localStorageKey: "deepsignal.submissions",
      },
    },
    responderSignature: "signature-secret",
    responderSignedBytes: "signed-bytes-secret",
    encryptedPayload: "encrypted-secret",
    status: "unread",
    priority: "high",
    triageStatus: "new",
    tags: ["system"],
    notes: "",
    isEncrypted: false,
    severity: "critical",
    subjectPreview: "ChunkLoadError",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    remoteSyncStatus: "local_only",
  };
  return {
    form,
    submission,
    record: {
      form,
      submission,
      category: "System" as const,
      searchText: "chunk load error",
    },
  };
}

describe("AdminDashboardPage", () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockCapabilityProfile.current = defaultCapabilityProfile;
    mockWalletState.current = {
      accountAddress: undefined,
      isConnected: false,
      status: "disconnected",
    };
    signalIndex.counts.system = 0;
    signalIndex.signalById = {};
    mockInboxState.current = {
      forms: [],
      selectedStreamId: "all",
      allSignals: [],
      visibleSignals: [],
      selectedRecord: null,
      signalIndex,
    };
    delete (globalThis as typeof globalThis & { demoScenario?: unknown }).demoScenario;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the disconnected local-fallback admin route without demo globals", async () => {
    expect("demoScenario" in globalThis).toBe(false);

    renderAdminRoute();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Connect Wallet" })).toBeInTheDocument());
    expect(screen.getByText("Wallet Verified access is required for admin and dashboard views.")).toBeInTheDocument();
    expect(screen.queryByText(/demoScenario is not defined/)).not.toBeInTheDocument();
  });

  it("copies selected system diagnostics through the redacted diagnostics service", async () => {
    const { form, submission, record } = createSystemRecord();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mockCapabilityProfile.current = {
      ...defaultCapabilityProfile,
      hasOwnerCap: true,
      ownerCapIds: ["owner-cap"],
    };
    mockWalletState.current = {
      accountAddress: "0xowner",
      isConnected: true,
      status: "connected",
    };
    const project = {
      id: "project-1",
      name: "Ops Project",
      owner: "0xowner",
      forms: [form],
      formsCount: 1,
      signalsCount: 1,
      members: [],
      admins: [],
      reviewers: [],
    };
    mockProjectState.current = {
      projects: [project],
      selectedProjectId: project.id,
      selectedProject: project,
    };
    signalIndex.counts.system = 1;
    signalIndex.signalById = { [submission.id]: record };
    mockInboxState.current = {
      forms: [form],
      selectedStreamId: "system",
      allSignals: [record],
      visibleSignals: [record],
      selectedRecord: record,
      signalIndex,
    };

    renderAdminRoute();

    const copyButtons = await screen.findAllByRole("button", { name: /copy redacted diagnostics/i });
    copyButtons[copyButtons.length - 1].click();

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = String(writeText.mock.calls[0][0]);
    expect(copied).toContain('"source": "deepsignal-runtime"');
    expect(copied).toContain('"routePath": "/admin"');
    expect(copied).not.toContain("raw-answer-secret");
    expect(copied).not.toContain("public-answer-secret");
    expect(copied).not.toContain("session-secret");
    expect(copied).not.toContain("signature-secret");
    expect(copied).not.toContain("encrypted-secret");
    expect(copied).not.toContain("token=abc");
    expect(copied).not.toContain("#frag");
  });

  it("exports visible System Alerts as a redacted diagnostics envelope", async () => {
    const { form, submission, record } = createSystemRecord();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createObjectUrlSpy = vi.fn().mockReturnValue("blob:diagnostics");
    const revokeObjectUrlSpy = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrlSpy,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrlSpy,
    });
    mockCapabilityProfile.current = {
      ...defaultCapabilityProfile,
      hasOwnerCap: true,
      ownerCapIds: ["owner-cap"],
    };
    mockWalletState.current = {
      accountAddress: "0xowner",
      isConnected: true,
      status: "connected",
    };
    const project = {
      id: "project-1",
      name: "Ops Project",
      owner: "0xowner",
      forms: [form],
      formsCount: 1,
      signalsCount: 1,
      members: [],
      admins: [],
      reviewers: [],
    };
    mockProjectState.current = {
      projects: [project],
      selectedProjectId: project.id,
      selectedProject: project,
    };
    signalIndex.counts.system = 1;
    signalIndex.signalById = { [submission.id]: record };
    mockInboxState.current = {
      forms: [form],
      selectedStreamId: "system",
      allSignals: [record],
      visibleSignals: [record],
      selectedRecord: record,
      signalIndex,
    };

    renderAdminRoute();

    const exportButton = await screen.findByRole("button", { name: "Export System Diagnostics JSON" });
    exportButton.click();

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(createObjectUrlSpy).toHaveBeenCalledWith(expect.any(Blob));
    const exportedBlob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
    const exportedJson = await exportedBlob.text();
    expect(exportedJson).toContain('"source": "deepsignal-diagnostics-service"');
    expect(exportedJson).toContain('"count": 1');
    expect(exportedJson).toContain('"maxLimit": 500');
    expect(exportedJson).toContain('"truncated": false');
    expect(exportedJson).toContain('"routePath": "/admin"');
    expect(exportedJson).not.toContain("raw-answer-secret");
    expect(exportedJson).not.toContain("public-answer-secret");
    expect(exportedJson).not.toContain("session-secret");
    expect(exportedJson).not.toContain("signature-secret");
    expect(exportedJson).not.toContain("encrypted-secret");
    expect(exportedJson).not.toContain("token=abc");
    expect(exportedJson).not.toContain("#frag");
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:diagnostics");
  });
});
