import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import type { ProjectSummary } from "../lib/projectRegistry";
import { RpcInfrastructureContext, type RpcInfrastructureContextValue } from "../rpcInfrastructure";
import type { Submission } from "../types";
import type { FormWithCount, SignalRecord, StreamId } from "../features/admin/hooks/useSignalInboxData";
import {
  clearInMemorySignalMemoriesForTests,
  createSignalMemoryAdapter,
  setSignalMemoryMemWalClientFactoryForTests,
  type SignalPatternMemory,
} from "../memory";
import { AdminDashboardWorkspace as AdminDashboardPage } from "./AdminDashboardWorkspace";

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
    signalById: {} as Record<string, SignalRecord>,
    unreadCountByFormId: {},
    signalCountByFormId: {},
  };
  type MockInboxState = {
    forms: FormWithCount[];
    selectedStreamId: StreamId;
    allSignals: SignalRecord[];
    visibleSignals: SignalRecord[];
    selectedRecord: SignalRecord | null;
    signalIndex: typeof signalIndex;
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
        projects: [] as ProjectSummary[],
        selectedProjectId: "",
        selectedProject: null as ProjectSummary | null,
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
    } as { current: MockInboxState },
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

vi.mock("../lib/mystenDappKitCompat", () => ({
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
    isProviderPending: false,
    isRestoringConnection: false,
    connectLockState: "idle",
    connectMode: null,
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

function createSystemRecord(
  overrides: {
    id?: string;
    createdAt?: string;
    severity?: "warning" | "error" | "critical";
    fingerprint?: string;
    errorName?: string;
    errorMessage?: string;
    routeId?: string;
    routePath?: string;
    buildVersion?: string;
  } = {},
) {
  const form: FormWithCount = {
    id: "system:deepsignal-runtime",
    title: "DeepSignal System Alerts",
    description: "Runtime diagnostics",
    fields: [],
    sections: [],
    submissionCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const submission: Submission = {
    id: overrides.id ?? "system-error-1",
    formId: form.id,
    kind: "system_error",
    source: "deepsignal-runtime",
    systemSeverity: overrides.severity ?? "critical",
    answers: {
      diagnostics: "raw-answer-secret",
    },
    attachments: [
      {
        fieldId: "upload",
        type: "document",
        blobId: "attachment-secret",
        name: "attachment-secret.pdf",
        size: 123,
        inlineData: "attachment-inline-secret",
      },
    ],
    publicPayload: {
      answers: {
        hidden: "public-answer-secret",
      },
      attachments: [
        {
          fieldId: "public-upload",
          type: "document",
          blobId: "public-attachment-secret",
          name: "public-attachment-secret.pdf",
          size: 456,
        },
      ],
    },
    respondentMeta: {
      chain: "sui",
      isAnonymous: true,
      sessionId: "session-secret",
      submittedAt: "2026-01-01T00:00:00.000Z",
    },
    metadata: {
      systemDiagnostics: {
        severity: overrides.severity ?? "critical",
        fingerprint: overrides.fingerprint ?? "fp-admin",
        errorName: overrides.errorName ?? "ChunkLoadError",
        errorMessage: overrides.errorMessage ?? "Failed https://example.test/assets/admin.js?token=abc#frag",
        errorStack: "Error session=secret-token at https://example.test/assets/admin.js?token=abc#frag:1:2",
        routePath: overrides.routePath ?? "/admin?token=abc#frag",
        routeId: overrides.routeId ?? "admin",
        chunkUrl: "https://example.test/assets/admin.js?token=abc#frag",
        buildVersion: overrides.buildVersion ?? "0.12.21",
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
    severity: overrides.severity ?? "critical",
    subjectPreview: "ChunkLoadError",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
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
    } satisfies SignalRecord,
  };
}

function createResponderRecord(overrides: Partial<Submission> = {}) {
  const form: FormWithCount = {
    id: "responder-form-1",
    title: "Field Signals",
    description: "Responder signals",
    fields: [],
    sections: [],
    submissionCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const submission: Submission = {
    id: "response-1",
    formId: form.id,
    answers: { report: "bridge outage" },
    attachments: [],
    status: "unread",
    priority: "medium",
    triageStatus: "new",
    tags: [],
    notes: "",
    isEncrypted: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    ...overrides,
  };
  return {
    form,
    submission,
    record: {
      form,
      submission,
      category: "General" as const,
      searchText: "bridge outage",
    } satisfies SignalRecord,
  };
}

function allowAdminAccess() {
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
    objectId: "project-1",
    name: "Ops Project",
    owner: "0xowner",
    formsCount: 1,
    signalsCount: 1,
    members: [],
    admins: [],
    reviewers: [],
  } satisfies ProjectSummary;
  mockProjectState.current = {
    projects: [project],
    selectedProjectId: project.objectId,
    selectedProject: project,
  };
}

function createPatternMemory(overrides: Partial<SignalPatternMemory> = {}): SignalPatternMemory {
  return {
    schemaVersion: "deepsignal.signal_pattern_memory.v1",
    memoryId: "memory-1",
    type: "system_diagnostic_pattern",
    title: "Related runtime pattern",
    summary: "Safe pattern summary.",
    signalKinds: ["system_signal"],
    sourceSignalIds: ["system-error-1"],
    fingerprints: [],
    tags: [],
    affectedRoutes: [],
    affectedBuilds: [],
    platforms: [],
    frequency: {
      count: 1,
      window: "all_time",
      trend: "new",
    },
    firstSeen: "2026-01-01T00:00:00.000Z",
    lastSeen: "2026-01-01T00:00:00.000Z",
    status: "watching",
    confidence: "medium",
    evidenceSummary: ["Safe evidence summary."],
    recommendedAction: "Review safely.",
    recommendedCodexPrompt: "Investigate safe pattern.",
    failedFixes: [],
    confirmedFixes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:05:00.000Z",
    ...overrides,
  };
}

async function seedPatternMemory(memory: SignalPatternMemory, namespace = "deepsignal:project:project-1:signal-pattern-memory:v1") {
  vi.stubEnv("VITE_SIGNAL_MEMORY_PROVIDER", "memory");
  await createSignalMemoryAdapter().saveMemory(namespace, memory);
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
    clearInMemorySignalMemoriesForTests();
    setSignalMemoryMemWalClientFactoryForTests(null);
    vi.useRealTimers();
    vi.unstubAllEnvs();
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
      objectId: "project-1",
      name: "Ops Project",
      owner: "0xowner",
      formsCount: 1,
      signalsCount: 1,
      members: [],
      admins: [],
      reviewers: [],
    } satisfies ProjectSummary;
    mockProjectState.current = {
      projects: [project],
      selectedProjectId: project.objectId,
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

    const includeStackTracesToggle = await screen.findByLabelText(/include stack traces/i);
    includeStackTracesToggle.click();
    const copyButtons = await screen.findAllByRole("button", { name: /copy redacted diagnostics/i });
    copyButtons[copyButtons.length - 1].click();

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = String(writeText.mock.calls[0][0]);
    expect(copied).toContain('"source": "deepsignal-runtime"');
    expect(copied).toContain('"routePath": "/admin"');
    expect(copied).not.toContain("errorStack");
    expect(copied).not.toContain("raw-answer-secret");
    expect(copied).not.toContain("public-answer-secret");
    expect(copied).not.toContain("attachment-secret");
    expect(copied).not.toContain("public-attachment-secret");
    expect(copied).not.toContain("session-secret");
    expect(copied).not.toContain("signature-secret");
    expect(copied).not.toContain("encrypted-secret");
    expect(copied).not.toContain("answers");
    expect(copied).not.toContain("publicPayload");
    expect(copied).not.toContain("encryptedPayload");
    expect(copied).not.toContain("responderSignature");
    expect(copied).not.toContain("responderSignedBytes");
    expect(copied).not.toContain("respondentMeta");
    expect(copied).not.toContain("metadata");
    expect(copied).not.toContain("token=abc");
    expect(copied).not.toContain("#frag");
  });

  it("shows System Alerts as diagnostics instead of submitted feedback", async () => {
    const { form, submission, record } = createSystemRecord();
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
      objectId: "project-1",
      name: "Ops Project",
      owner: "0xowner",
      formsCount: 1,
      signalsCount: 1,
      members: [],
      admins: [],
      reviewers: [],
    } satisfies ProjectSummary;
    mockProjectState.current = {
      projects: [project],
      selectedProjectId: project.objectId,
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

    expect(await screen.findByRole("heading", { name: "ChunkLoadError", level: 3 })).toBeInTheDocument();
    expect(screen.getByText("System alert diagnostics")).toBeInTheDocument();
    expect(screen.queryByText("Submitted Feedback")).not.toBeInTheDocument();
    expect(screen.queryByText("Feedback body")).not.toBeInTheDocument();
    expect(screen.queryByText("raw-answer-secret")).not.toBeInTheDocument();
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
      objectId: "project-1",
      name: "Ops Project",
      owner: "0xowner",
      formsCount: 1,
      signalsCount: 1,
      members: [],
      admins: [],
      reviewers: [],
    } satisfies ProjectSummary;
    mockProjectState.current = {
      projects: [project],
      selectedProjectId: project.objectId,
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

    expect(
      await screen.findByText("Stack traces may include SDK error bodies, route params, object dumps, or local paths."),
    ).toBeInTheDocument();
    const exportButton = await screen.findByRole("button", { name: "Export visible diagnostics JSON" });
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
    expect(exportedJson).not.toContain("errorStack");
    expect(exportedJson).not.toContain("raw-answer-secret");
    expect(exportedJson).not.toContain("public-answer-secret");
    expect(exportedJson).not.toContain("attachment-secret");
    expect(exportedJson).not.toContain("public-attachment-secret");
    expect(exportedJson).not.toContain("session-secret");
    expect(exportedJson).not.toContain("signature-secret");
    expect(exportedJson).not.toContain("encrypted-secret");
    expect(exportedJson).not.toContain("answers");
    expect(exportedJson).not.toContain("publicPayload");
    expect(exportedJson).not.toContain("encryptedPayload");
    expect(exportedJson).not.toContain("responderSignature");
    expect(exportedJson).not.toContain("responderSignedBytes");
    expect(exportedJson).not.toContain("respondentMeta");
    expect(exportedJson).not.toContain("metadata");
    expect(exportedJson).not.toContain("token=abc");
    expect(exportedJson).not.toContain("#frag");
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:diagnostics");
  });

  it("shows a redacted diagnostics summary only for the System Alerts stream", async () => {
    const first = createSystemRecord({ id: "system-error-1", fingerprint: "fp-admin", routeId: "admin" });
    const second = createSystemRecord({
      id: "system-error-2",
      createdAt: "2026-01-01T00:02:00.000Z",
      severity: "error",
      fingerprint: "fp-admin",
      routeId: "admin",
    });
    const third = createSystemRecord({
      id: "system-error-3",
      createdAt: "2026-01-01T00:03:00.000Z",
      severity: "warning",
      fingerprint: "fp-public",
      routeId: "public-form",
      routePath: "/f/form-1",
      errorName: "WindowError",
    });
    allowAdminAccess();
    signalIndex.counts.system = 3;
    signalIndex.signalById = {
      [first.submission.id]: first.record,
      [second.submission.id]: second.record,
      [third.submission.id]: third.record,
    };
    mockInboxState.current = {
      forms: [first.form],
      selectedStreamId: "system",
      allSignals: [first.record, second.record, third.record],
      visibleSignals: [first.record, second.record, third.record],
      selectedRecord: first.record,
      signalIndex,
    };

    renderAdminRoute();

    expect(await screen.findByRole("heading", { name: "System Diagnostics Summary" })).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "System Diagnostics Summary" });
    await waitFor(() => expect(within(panel).getByText("fp-admin")).toBeInTheDocument());
    expect(within(panel).getByText("3")).toBeInTheDocument();
    expect(within(panel).getByText("2 events")).toBeInTheDocument();
    expect(within(panel).getByText("system-error-1")).toBeInTheDocument();
    expect(within(panel).getByText("system-error-2")).toBeInTheDocument();
    expect(within(panel).getByText("CRITICAL")).toBeInTheDocument();
    expect(within(panel).getByText("public-form")).toBeInTheDocument();
    expect(panel.textContent).not.toContain("raw-answer-secret");
    expect(panel.textContent).not.toContain("public-answer-secret");
    expect(panel.textContent).not.toContain("attachment-secret");
    expect(panel.textContent).not.toContain("session-secret");
    expect(panel.textContent).not.toContain("signature-secret");
    expect(panel.textContent).not.toContain("encrypted-secret");
    expect(panel.textContent).not.toContain("secret-token");
    expect(panel.textContent).not.toContain("token=abc");
    expect(panel.textContent).not.toContain("#frag");
  });

  it("opens a safe Signal Pattern Memory draft modal from a Diagnostics Summary group and copies JSON", async () => {
    const first = createSystemRecord({ id: "system-error-1", fingerprint: "fp-admin", routeId: "admin" });
    const second = createSystemRecord({
      id: "system-error-2",
      createdAt: "2026-01-01T00:02:00.000Z",
      severity: "error",
      fingerprint: "fp-admin",
      routeId: "admin",
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    allowAdminAccess();
    signalIndex.counts.system = 2;
    signalIndex.signalById = {
      [first.submission.id]: first.record,
      [second.submission.id]: second.record,
    };
    mockInboxState.current = {
      forms: [first.form],
      selectedStreamId: "system",
      allSignals: [first.record, second.record],
      visibleSignals: [first.record, second.record],
      selectedRecord: first.record,
      signalIndex,
    };

    renderAdminRoute();

    expect(await screen.findByRole("heading", { name: "System Diagnostics Summary" })).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "System Diagnostics Summary" });
    await waitFor(() => expect(within(panel).getByText("fp-admin")).toBeInTheDocument());
    fireEvent.click(within(panel).getAllByRole("button", { name: "Save pattern memory" })[0]);

    const modal = await screen.findByRole("dialog", { name: "Review pattern memory draft" });
    expect(within(modal).getByText("This draft is not saved yet. MemWal integration comes later.")).toBeInTheDocument();
    expect(within(modal).getByLabelText("Type")).toHaveValue("system_diagnostic_pattern");
    expect(within(modal).getByLabelText("Title")).toHaveValue("Repeated fingerprint fp-admin");
    expect(within(modal).getByLabelText("Status")).toHaveValue("draft");
    expect(within(modal).getByLabelText("Confidence")).toHaveValue("medium");
    expect(within(modal).getByText("Affected routes")).toBeInTheDocument();
    expect(within(modal).getByText("Affected builds")).toBeInTheDocument();
    expect(within(modal).getByText("Platforms")).toBeInTheDocument();
    expect(within(modal).getByText("Frequency")).toBeInTheDocument();

    fireEvent.change(within(modal).getByLabelText("Title"), {
      target: { value: "Admin chunk failure memory" },
    });
    fireEvent.change(within(modal).getByLabelText("Status"), {
      target: { value: "watching" },
    });
    fireEvent.click(within(modal).getByRole("button", { name: "Copy draft JSON" }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = String(writeText.mock.calls[0][0]);
    expect(copied).toContain('"schemaVersion": "deepsignal.signal_pattern_memory.v1"');
    expect(copied).toContain('"title": "Admin chunk failure memory"');
    expect(copied).toContain('"status": "watching"');
    expect(copied).toContain('"type": "system_diagnostic_pattern"');
    expect(copied).toContain('"sourceSignalIds"');
    expect(copied).toContain('"system-error-1"');
    expect(copied).not.toContain("raw-answer-secret");
    expect(copied).not.toContain("public-answer-secret");
    expect(copied).not.toContain("attachment-secret");
    expect(copied).not.toContain("session-secret");
    expect(copied).not.toContain("signature-secret");
    expect(copied).not.toContain("signed-bytes-secret");
    expect(copied).not.toContain("encrypted-secret");
    expect(copied).not.toContain("metadata");
    expect(copied).not.toContain("errorStack");
    expect(copied).not.toContain("token=abc");
    expect(copied).not.toContain("#frag");
    expect(modal.textContent).not.toContain("raw-answer-secret");
    expect(modal.textContent).not.toContain("public-answer-secret");
    expect(modal.textContent).not.toContain("attachment-secret");
    expect(modal.textContent).not.toContain("session-secret");
    expect(modal.textContent).not.toContain("signature-secret");
    expect(modal.textContent).not.toContain("signed-bytes-secret");
    expect(modal.textContent).not.toContain("encrypted-secret");
    expect(modal.textContent).not.toContain("metadata-secret");
    expect(modal.textContent).not.toContain("errorStack");
    expect(modal.textContent).not.toContain("token=abc");
    expect(modal.textContent).not.toContain("#frag");

    fireEvent.click(within(modal).getByRole("button", { name: "Save pattern memory" }));
    expect(await within(modal).findByText("Pattern memory validated. Persistence is disabled.")).toBeInTheDocument();
    expect(screen.getAllByText("Pattern memory validated. Persistence is disabled.").length).toBeGreaterThan(0);
  });

  it("shows saved Signal Pattern Memories in the System Alerts session panel when memory provider is enabled", async () => {
    vi.stubEnv("VITE_SIGNAL_MEMORY_PROVIDER", "memory");
    const first = createSystemRecord({ id: "system-error-1", fingerprint: "fp-admin", routeId: "admin" });
    const second = createSystemRecord({
      id: "system-error-2",
      createdAt: "2026-01-01T00:02:00.000Z",
      severity: "error",
      fingerprint: "fp-admin",
      routeId: "admin",
    });
    allowAdminAccess();
    signalIndex.counts.system = 2;
    signalIndex.signalById = {
      [first.submission.id]: first.record,
      [second.submission.id]: second.record,
    };
    mockInboxState.current = {
      forms: [first.form],
      selectedStreamId: "system",
      allSignals: [first.record, second.record],
      visibleSignals: [first.record, second.record],
      selectedRecord: first.record,
      signalIndex,
    };

    renderAdminRoute();

    const summaryPanel = await screen.findByRole("region", { name: "System Diagnostics Summary" });
    await waitFor(() => expect(within(summaryPanel).getByText("fp-admin")).toBeInTheDocument());
    const memoriesPanel = screen.getByRole("region", { name: "Saved Pattern Memories" });
    expect(within(memoriesPanel).getByText("No pattern memories saved in this session.")).toBeInTheDocument();

    fireEvent.click(within(summaryPanel).getAllByRole("button", { name: "Save pattern memory" })[0]);
    const modal = await screen.findByRole("dialog", { name: "Review pattern memory draft" });
    fireEvent.change(within(modal).getByLabelText("Title"), {
      target: { value: "Runtime admin chunk memory" },
    });
    fireEvent.change(within(modal).getByLabelText("Status"), {
      target: { value: "watching" },
    });
    fireEvent.click(within(modal).getByRole("button", { name: "Save pattern memory" }));

    expect(await within(modal).findByText("Pattern memory saved for this session.")).toBeInTheDocument();
    await waitFor(() => expect(within(memoriesPanel).getByText("Runtime admin chunk memory")).toBeInTheDocument());
    expect(within(memoriesPanel).getByText("system_diagnostic_pattern")).toBeInTheDocument();
    expect(within(memoriesPanel).getByText("watching")).toBeInTheDocument();
    expect(within(memoriesPanel).getByText("medium")).toBeInTheDocument();
    expect(within(memoriesPanel).getByText("system")).toBeInTheDocument();
    expect(within(memoriesPanel).getByText("diagnostics")).toBeInTheDocument();
    expect(memoriesPanel.textContent).not.toContain("raw-answer-secret");
    expect(memoriesPanel.textContent).not.toContain("attachment-secret");
    expect(memoriesPanel.textContent).not.toContain("encrypted-secret");
    expect(memoriesPanel.textContent).not.toContain("signature-secret");
    expect(memoriesPanel.textContent).not.toContain("metadata-secret");
    expect(memoriesPanel.textContent).not.toContain("errorStack");
    expect(memoriesPanel.textContent).not.toContain("token=abc");
  });

  it("shows a filterable Pattern Memories explorer with safe detail and prompt copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { form, record } = createResponderRecord({
      answers: { report: "raw explorer answer secret" },
      attachments: [
        {
          fieldId: "upload",
          type: "document",
          blobId: "raw-explorer-attachment",
          name: "raw-explorer-attachment.pdf",
          size: 12,
        },
      ],
      metadata: { token: "raw-explorer-metadata" },
      encryptedPayload: "raw-explorer-payload",
      respondentMeta: {
        chain: "sui",
        isAnonymous: true,
        sessionId: "raw-explorer-session",
        submittedAt: "2026-01-01T00:00:00.000Z",
      },
      responderSignature: "raw-explorer-signature",
      responderSignedBytes: "raw-explorer-signed-bytes",
    });
    await seedPatternMemory(createPatternMemory({
      memoryId: "memory-wallet",
      type: "ux_friction_pattern",
      title: "Wallet connection memory",
      summary: "Safe wallet connection summary.",
      signalKinds: ["user_signal"],
      sourceSignalIds: ["response-1"],
      tags: ["wallet", "mobile-ux"],
      frequency: { count: 4, window: "all_time", trend: "stable" },
      evidenceSummary: ["Safe redacted wallet evidence."],
      recommendedAction: "Review wallet copy.",
      recommendedCodexPrompt: "Investigate wallet connection memory.",
      failedFixes: [{ summary: "Changing button color did not reduce confusion." }],
      confirmedFixes: [{ summary: "Clearer wallet copy reduced support reports." }],
      affectedRoutes: ["admin"],
      affectedBuilds: ["0.13.0"],
      platforms: ["mobile"],
    }));
    await seedPatternMemory(createPatternMemory({
      memoryId: "memory-template",
      type: "product_request_pattern",
      title: "Template request memory",
      summary: "Safe template request summary.",
      signalKinds: ["user_signal"],
      sourceSignalIds: ["response-2"],
      tags: ["templates"],
      status: "active",
      confidence: "high",
      frequency: { count: 2, window: "all_time", trend: "new" },
      evidenceSummary: ["Safe redacted template evidence."],
      recommendedCodexPrompt: "Investigate template request memory.",
    }));
    allowAdminAccess();
    signalIndex.counts.system = 0;
    signalIndex.signalById = { [record.submission.id]: record };
    mockInboxState.current = {
      forms: [form],
      selectedStreamId: "all",
      allSignals: [record],
      visibleSignals: [record],
      selectedRecord: record,
      signalIndex,
    };

    renderAdminRoute();

    const explorer = await screen.findByRole("region", { name: "Pattern Memories" });
    await waitFor(() => expect(within(explorer).getByRole("button", { name: "Wallet connection memory" })).toBeInTheDocument());
    expect(within(explorer).getByRole("button", { name: "Template request memory" })).toBeInTheDocument();
    expect(within(explorer).getAllByText("4 events").length).toBeGreaterThan(0);

    fireEvent.change(within(explorer).getByLabelText("Search pattern memories"), {
      target: { value: "template" },
    });
    expect(within(explorer).queryByRole("button", { name: "Wallet connection memory" })).not.toBeInTheDocument();
    expect(within(explorer).getByRole("button", { name: "Template request memory" })).toBeInTheDocument();

    fireEvent.change(within(explorer).getByLabelText("Search pattern memories"), {
      target: { value: "" },
    });
    fireEvent.change(within(explorer).getByLabelText("Filter pattern memories by type"), {
      target: { value: "ux_friction_pattern" },
    });
    fireEvent.change(within(explorer).getByLabelText("Filter pattern memories by status"), {
      target: { value: "watching" },
    });
    fireEvent.change(within(explorer).getByLabelText("Filter pattern memories by tag"), {
      target: { value: "wallet" },
    });
    expect(within(explorer).getByRole("button", { name: "Wallet connection memory" })).toBeInTheDocument();
    expect(within(explorer).queryByRole("button", { name: "Template request memory" })).not.toBeInTheDocument();

    fireEvent.click(within(explorer).getByRole("button", { name: "Wallet connection memory" }));
    fireEvent.change(within(explorer).getByLabelText("Filter pattern memories by status"), {
      target: { value: "all" },
    });
    expect(within(explorer).getByText("Safe wallet connection summary.")).toBeInTheDocument();
    expect(within(explorer).getByText("Safe redacted wallet evidence.")).toBeInTheDocument();
    expect(within(explorer).getByLabelText("Edit recommended action")).toHaveValue("Review wallet copy.");
    expect(within(explorer).getByText("Changing button color did not reduce confusion.")).toBeInTheDocument();
    expect(within(explorer).getByText("Clearer wallet copy reduced support reports.")).toBeInTheDocument();
    expect(within(explorer).getByText("response-1")).toBeInTheDocument();
    expect(within(explorer).getByText("0.13.0")).toBeInTheDocument();

    fireEvent.change(within(explorer).getByLabelText("Update pattern memory status"), {
      target: { value: "investigating" },
    });
    expect(await within(explorer).findByText("Pattern memory updated for this session.")).toBeInTheDocument();
    await waitFor(() => expect(within(explorer).getAllByText("investigating").length).toBeGreaterThan(0));

    fireEvent.change(within(explorer).getByLabelText("Update pattern memory confidence"), {
      target: { value: "high" },
    });
    await waitFor(() => expect(within(explorer).getAllByText("high").length).toBeGreaterThan(0));

    fireEvent.change(within(explorer).getByLabelText("Edit recommended action"), {
      target: { value: "Review the updated wallet lifecycle." },
    });
    fireEvent.change(within(explorer).getByLabelText("Edit recommended Codex prompt"), {
      target: { value: "Investigate updated wallet lifecycle." },
    });
    fireEvent.change(within(explorer).getByLabelText("Add failed fix"), {
      target: { value: "Hiding the wallet badge caused regressions." },
    });
    fireEvent.change(within(explorer).getByLabelText("Add confirmed fix"), {
      target: { value: "Inline wallet copy resolved confusion." },
    });
    fireEvent.click(within(explorer).getByRole("button", { name: "Update pattern memory" }));
    expect(await within(explorer).findByText("Hiding the wallet badge caused regressions.")).toBeInTheDocument();
    expect(within(explorer).getByText("Inline wallet copy resolved confusion.")).toBeInTheDocument();
    expect(within(explorer).getByLabelText("Edit recommended action")).toHaveValue("Review the updated wallet lifecycle.");
    expect(within(explorer).getByLabelText("Edit recommended Codex prompt")).toHaveValue("Investigate updated wallet lifecycle.");

    fireEvent.click(within(explorer).getByRole("button", { name: "Copy Codex Prompt" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Investigate updated wallet lifecycle."));

    expect(explorer.textContent).not.toContain("raw explorer answer secret");
    expect(explorer.textContent).not.toContain("raw-explorer-attachment");
    expect(explorer.textContent).not.toContain("raw-explorer-metadata");
    expect(explorer.textContent).not.toContain("raw-explorer-payload");
    expect(explorer.textContent).not.toContain("raw-explorer-session");
    expect(explorer.textContent).not.toContain("raw-explorer-signature");
    expect(explorer.textContent).not.toContain("raw-explorer-signed-bytes");
  });

  it("shows Pattern Memory lifecycle counts, timeline, review queue, and lifecycle filters", async () => {
    const { form, record } = createResponderRecord();
    await seedPatternMemory(createPatternMemory({
      memoryId: "memory-active-old",
      title: "Active stale update memory",
      type: "ux_friction_pattern",
      status: "active",
      confidence: "high",
      tags: ["mobile"],
      updatedAt: "2026-05-01T00:00:00.000Z",
    }));
    await seedPatternMemory(createPatternMemory({
      memoryId: "memory-investigating-old",
      title: "Long investigation memory",
      type: "system_diagnostic_pattern",
      status: "investigating",
      confidence: "medium",
      tags: ["diagnostics"],
      updatedAt: "2026-04-20T00:00:00.000Z",
    }));
    await seedPatternMemory(createPatternMemory({
      memoryId: "memory-stale-old",
      title: "Old stale memory",
      type: "product_request_pattern",
      status: "stale",
      confidence: "low",
      tags: ["templates"],
      updatedAt: "2026-04-01T00:00:00.000Z",
    }));
    await seedPatternMemory(createPatternMemory({
      memoryId: "memory-fixed-recent",
      title: "Recently fixed memory",
      type: "operational_fix_pattern",
      status: "confirmed_fixed",
      confidence: "high",
      tags: ["release"],
      updatedAt: "2026-06-02T00:00:00.000Z",
    }));
    await seedPatternMemory(createPatternMemory({
      memoryId: "memory-revoked",
      title: "Revoked memory",
      status: "revoked",
      confidence: "medium",
      updatedAt: "2026-05-31T00:00:00.000Z",
    }));
    allowAdminAccess();
    signalIndex.signalById = { [record.submission.id]: record };
    mockInboxState.current = {
      forms: [form],
      selectedStreamId: "all",
      allSignals: [record],
      visibleSignals: [record],
      selectedRecord: record,
      signalIndex,
    };

    renderAdminRoute();

    const explorer = await screen.findByRole("region", { name: "Pattern Memories" });
    const dashboard = within(explorer).getByRole("region", { name: "Pattern Memory Lifecycle Dashboard" });
    const counts = within(dashboard).getByRole("region", { name: "Pattern memory status counts" });
    expect(within(counts).getByText("active").parentElement).toHaveTextContent("1");
    expect(within(counts).getByText("watching").parentElement).toHaveTextContent("0");
    expect(within(counts).getByText("investigating").parentElement).toHaveTextContent("1");
    expect(within(counts).getByText("mitigated").parentElement).toHaveTextContent("0");
    expect(within(counts).getByText("confirmed_fixed").parentElement).toHaveTextContent("1");
    expect(within(counts).getByText("stale").parentElement).toHaveTextContent("1");
    expect(within(counts).getByText("revoked").parentElement).toHaveTextContent("1");

    const needsReview = within(dashboard).getByRole("region", { name: "Pattern memories needing review" });
    expect(within(needsReview).getByText("Old stale memory")).toBeInTheDocument();
    expect(within(needsReview).getByText(/Stale for \d+ days/)).toBeInTheDocument();
    expect(within(needsReview).getByText("Long investigation memory")).toBeInTheDocument();
    expect(within(needsReview).getByText(/Investigating for \d+ days/)).toBeInTheDocument();
    expect(within(needsReview).getByText("Active stale update memory")).toBeInTheDocument();
    expect(within(needsReview).getByText(/Active without updates for \d+ days/)).toBeInTheDocument();
    expect(within(needsReview).queryByText("Recently fixed memory")).not.toBeInTheDocument();

    const timeline = within(dashboard).getByRole("region", { name: "Pattern memory status timeline" });
    const timelineText = timeline.textContent ?? "";
    expect(timelineText.indexOf("Recently fixed memory")).toBeLessThan(timelineText.indexOf("Revoked memory"));
    expect(timelineText.indexOf("Revoked memory")).toBeLessThan(timelineText.indexOf("Active stale update memory"));

    fireEvent.change(within(explorer).getByLabelText("Filter pattern memories by status"), {
      target: { value: "stale" },
    });
    expect(within(explorer).getByRole("button", { name: "Old stale memory" })).toBeInTheDocument();
    expect(within(explorer).queryByRole("button", { name: "Active stale update memory" })).not.toBeInTheDocument();

    fireEvent.change(within(explorer).getByLabelText("Filter pattern memories by status"), {
      target: { value: "all" },
    });
    fireEvent.change(within(explorer).getByLabelText("Filter pattern memories by confidence"), {
      target: { value: "high" },
    });
    expect(within(explorer).getByRole("button", { name: "Active stale update memory" })).toBeInTheDocument();
    expect(within(explorer).getByRole("button", { name: "Recently fixed memory" })).toBeInTheDocument();
    expect(within(explorer).queryByRole("button", { name: "Old stale memory" })).not.toBeInTheDocument();

    fireEvent.change(within(explorer).getByLabelText("Filter pattern memories by type"), {
      target: { value: "operational_fix_pattern" },
    });
    expect(within(explorer).getByRole("button", { name: "Recently fixed memory" })).toBeInTheDocument();
    expect(within(explorer).queryByRole("button", { name: "Active stale update memory" })).not.toBeInTheDocument();
  });

  it("drives safe Pattern Memory actions from the Action Center", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { form, record } = createResponderRecord({
      answers: { report: "raw action center answer secret" },
      attachments: [
        {
          fieldId: "upload",
          type: "document",
          blobId: "raw-action-attachment",
          name: "raw-action-attachment.pdf",
          size: 12,
        },
      ],
      metadata: { token: "raw-action-metadata" },
      encryptedPayload: "raw-action-payload",
      respondentMeta: {
        chain: "sui",
        isAnonymous: true,
        sessionId: "raw-action-session",
        submittedAt: "2026-01-01T00:00:00.000Z",
      },
      responderSignature: "raw-action-signature",
      responderSignedBytes: "raw-action-signed-bytes",
    });
    await seedPatternMemory(createPatternMemory({
      memoryId: "memory-action-center",
      title: "Action center memory",
      summary: "Safe action center summary.",
      type: "ux_friction_pattern",
      status: "active",
      confidence: "high",
      frequency: { count: 6, window: "30d", trend: "increasing" },
      tags: ["wallet", "mobile"],
      affectedRoutes: ["admin"],
      affectedBuilds: ["0.13.1"],
      platforms: ["iPhone Safari"],
      evidenceSummary: ["Safe action evidence."],
      recommendedAction: "Investigate the reviewed wallet friction.",
      recommendedCodexPrompt: "Investigate the safe action center memory.",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    allowAdminAccess();
    signalIndex.signalById = { [record.submission.id]: record };
    mockInboxState.current = {
      forms: [form],
      selectedStreamId: "all",
      allSignals: [record],
      visibleSignals: [record],
      selectedRecord: record,
      signalIndex,
    };

    renderAdminRoute();

    const explorer = await screen.findByRole("region", { name: "Pattern Memories" });
    fireEvent.click(within(explorer).getByRole("button", { name: "Action center memory" }));
    const actionCenter = within(explorer).getByRole("region", { name: "Recommended Actions" });
    expect(within(actionCenter).getByText("Recommended Actions")).toBeInTheDocument();
    expect(within(actionCenter).getByText("Needs review")).toBeInTheDocument();
    expect(within(actionCenter).getByText(/Active without updates for \d+ days/)).toBeInTheDocument();
    expect(within(actionCenter).getByText("Investigate the safe action center memory.")).toBeInTheDocument();

    fireEvent.click(within(actionCenter).getByRole("button", { name: "Copy Prompt" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Investigate the safe action center memory."));

    fireEvent.click(within(actionCenter).getByRole("button", { name: "Use for Investigation" }));
    await waitFor(() => expect(screen.getByText("Prompt copied for investigation.")).toBeInTheDocument());

    fireEvent.click(within(actionCenter).getByRole("button", { name: "Create Issue Draft" }));
    const modal = await screen.findByRole("dialog", { name: "GitHub Issue Draft" });
    expect(within(modal).getByLabelText("Issue draft title")).toHaveValue("Action center memory");
    const issueBody = within(modal).getByLabelText("Issue draft body") as HTMLTextAreaElement;
    expect(issueBody.value).toContain("# Summary");
    expect(issueBody.value).toContain("Safe action center summary.");
    expect(issueBody.value).toContain("# Status\nactive");
    expect(issueBody.value).toContain("# Confidence\nhigh");
    expect(issueBody.value).toContain("# Frequency\n6 events (30d)");
    expect(issueBody.value).toContain("# Affected routes\nadmin");
    expect(issueBody.value).toContain("# Affected builds\n0.13.1");
    expect(issueBody.value).toContain("# Platforms\niPhone Safari");
    expect(issueBody.value).toContain("# Evidence summary");
    expect(issueBody.value).toContain("- Safe action evidence.");
    expect(issueBody.value).toContain("# Recommended action");
    expect(issueBody.value).toContain("Investigate the reviewed wallet friction.");
    expect(issueBody.value).toContain("# Suggested Codex prompt");
    expect(issueBody.value).toContain("Investigate the safe action center memory.");
    expect(issueBody.value).toContain("Generated from redacted Signal Pattern Memory. No raw submissions included.");
    expect(issueBody.value).not.toContain("raw action center answer secret");
    expect(issueBody.value).not.toContain("raw-action-attachment");
    expect(issueBody.value).not.toContain("raw-action-metadata");
    expect(issueBody.value).not.toContain("raw-action-payload");
    expect(issueBody.value).not.toContain("raw-action-session");
    expect(issueBody.value).not.toContain("raw-action-signature");
    expect(issueBody.value).not.toContain("raw-action-signed-bytes");
    fireEvent.click(within(modal).getByRole("button", { name: "Copy Issue Markdown" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(issueBody.value));
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining("raw action center answer secret"));
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining("raw-action-payload"));
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining("raw-action-attachment"));
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining("raw-action-metadata"));
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining("errorStack"));
    fireEvent.click(within(modal).getByRole("button", { name: "Close issue draft" }));

    fireEvent.click(within(actionCenter).getByRole("button", { name: "Mark Investigating" }));
    await waitFor(() => expect(within(explorer).getAllByText("investigating").length).toBeGreaterThan(0));
    fireEvent.click(within(actionCenter).getByRole("button", { name: "Mark Mitigated" }));
    await waitFor(() => expect(within(explorer).getAllByText("mitigated").length).toBeGreaterThan(0));
    fireEvent.click(within(actionCenter).getByRole("button", { name: "Mark Confirmed Fixed" }));
    await waitFor(() => expect(within(explorer).getAllByText("confirmed_fixed").length).toBeGreaterThan(0));

    expect(explorer.textContent).not.toContain("raw action center answer secret");
    expect(explorer.textContent).not.toContain("raw-action-attachment");
    expect(explorer.textContent).not.toContain("raw-action-metadata");
    expect(explorer.textContent).not.toContain("raw-action-payload");
    expect(explorer.textContent).not.toContain("raw-action-session");
    expect(explorer.textContent).not.toContain("raw-action-signature");
    expect(explorer.textContent).not.toContain("raw-action-signed-bytes");
  });

  it("does not save MemWal memories when MemWal is not configured", async () => {
    vi.stubEnv("VITE_SIGNAL_MEMORY_PROVIDER", "memwal");
    const first = createSystemRecord({ id: "system-error-1", fingerprint: "fp-admin", routeId: "admin" });
    allowAdminAccess();
    signalIndex.counts.system = 1;
    signalIndex.signalById = {
      [first.submission.id]: first.record,
    };
    mockInboxState.current = {
      forms: [first.form],
      selectedStreamId: "system",
      allSignals: [first.record],
      visibleSignals: [first.record],
      selectedRecord: first.record,
      signalIndex,
    };

    renderAdminRoute();

    const summaryPanel = await screen.findByRole("region", { name: "System Diagnostics Summary" });
    await waitFor(() => expect(within(summaryPanel).getByText("fp-admin")).toBeInTheDocument());
    const memoriesPanel = screen.getByRole("region", { name: "Saved Pattern Memories" });
    fireEvent.click(within(summaryPanel).getByRole("button", { name: "Save pattern memory" }));
    const modal = await screen.findByRole("dialog", { name: "Review pattern memory draft" });
    fireEvent.click(within(modal).getByRole("button", { name: "Save pattern memory" }));

    expect(await within(modal).findByText("MemWal is not configured.")).toBeInTheDocument();
    expect(within(memoriesPanel).getByText("No pattern memories saved in this session.")).toBeInTheDocument();
  });

  it("shows MemWal saved copy when configured MemWal persistence accepts the memory", async () => {
    vi.stubEnv("VITE_SIGNAL_MEMORY_PROVIDER", "memwal");
    vi.stubEnv("VITE_MEMWAL_ENABLED", "true");
    vi.stubEnv("VITE_MEMWAL_SERVER_URL", "https://relayer.staging.memwal.ai");
    vi.stubEnv("VITE_MEMWAL_ACCOUNT_ID", "0xmemwalaccount");
    vi.stubEnv("VITE_MEMWAL_DELEGATE_KEY", `0x${"a".repeat(64)}`);
    const storedTexts: string[] = [];
    setSignalMemoryMemWalClientFactoryForTests(async () => ({
      remember: vi.fn(async (text: string) => {
        storedTexts.push(text);
      }),
      recall: vi.fn(async ({ query }: { query: string }) => ({
        results: storedTexts
          .filter((text) => text.toLowerCase().includes(query.toLowerCase()) || query.includes("deepsignal signal pattern memory"))
          .map((text) => ({ text })),
      })),
    }));
    const first = createSystemRecord({ id: "system-error-1", fingerprint: "fp-admin", routeId: "admin" });
    allowAdminAccess();
    signalIndex.counts.system = 1;
    signalIndex.signalById = {
      [first.submission.id]: first.record,
    };
    mockInboxState.current = {
      forms: [first.form],
      selectedStreamId: "system",
      allSignals: [first.record],
      visibleSignals: [first.record],
      selectedRecord: first.record,
      signalIndex,
    };

    renderAdminRoute();

    const summaryPanel = await screen.findByRole("region", { name: "System Diagnostics Summary" });
    await waitFor(() => expect(within(summaryPanel).getByText("fp-admin")).toBeInTheDocument());
    const memoriesPanel = screen.getByRole("region", { name: "Saved Pattern Memories" });
    fireEvent.click(within(summaryPanel).getByRole("button", { name: "Save pattern memory" }));
    const modal = await screen.findByRole("dialog", { name: "Review pattern memory draft" });
    fireEvent.click(within(modal).getByRole("button", { name: "Save pattern memory" }));

    expect(await within(modal).findByText("Pattern memory saved to MemWal.")).toBeInTheDocument();
    await waitFor(() => expect(within(memoriesPanel).queryByText("No pattern memories saved in this session.")).not.toBeInTheDocument());
    expect(storedTexts.join("\n")).toContain("deepsignal.signal_pattern_memory");
    expect(storedTexts.join("\n")).not.toContain("raw-answer-secret");
    expect(storedTexts.join("\n")).not.toContain("encrypted-secret");
    expect(storedTexts.join("\n")).not.toContain("attachment-secret");
    expect(storedTexts.join("\n")).not.toContain("errorStack");
  });

  it("shows related pattern memories matched by fingerprint in System Signal detail", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const first = createSystemRecord({ id: "system-error-1", fingerprint: "fp-admin", routeId: "admin" });
    await seedPatternMemory(createPatternMemory({
      memoryId: "memory-fingerprint",
      title: "Fingerprint memory",
      fingerprints: ["fp-admin"],
      tags: ["diagnostics"],
      recommendedCodexPrompt: "Investigate fingerprint memory safely.",
    }));
    allowAdminAccess();
    signalIndex.counts.system = 1;
    signalIndex.signalById = { [first.submission.id]: first.record };
    mockInboxState.current = {
      forms: [first.form],
      selectedStreamId: "system",
      allSignals: [first.record],
      visibleSignals: [first.record],
      selectedRecord: first.record,
      signalIndex,
    };

    renderAdminRoute();

    const relatedPanel = await screen.findByRole("region", { name: "Related Pattern Memories" });
    expect(within(relatedPanel).getByText("Fingerprint memory")).toBeInTheDocument();
    expect(within(relatedPanel).getByText("watching")).toBeInTheDocument();
    expect(within(relatedPanel).getByText("medium")).toBeInTheDocument();
    expect(within(relatedPanel).getByText("diagnostics")).toBeInTheDocument();
    expect(within(relatedPanel).getByText("Investigate fingerprint memory safely.")).toBeInTheDocument();

    fireEvent.click(within(relatedPanel).getByRole("button", { name: "Copy Prompt" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Investigate fingerprint memory safely."));
  });

  it("shows related pattern memories matched by routeId in System Signal detail", async () => {
    const first = createSystemRecord({ id: "system-error-1", fingerprint: "fp-admin", routeId: "admin" });
    await seedPatternMemory(createPatternMemory({
      memoryId: "memory-route",
      title: "Route memory",
      affectedRoutes: ["admin"],
    }));
    allowAdminAccess();
    signalIndex.counts.system = 1;
    signalIndex.signalById = { [first.submission.id]: first.record };
    mockInboxState.current = {
      forms: [first.form],
      selectedStreamId: "system",
      allSignals: [first.record],
      visibleSignals: [first.record],
      selectedRecord: first.record,
      signalIndex,
    };

    renderAdminRoute();

    const relatedPanel = await screen.findByRole("region", { name: "Related Pattern Memories" });
    expect(within(relatedPanel).getByText("Route memory")).toBeInTheDocument();
  });

  it("shows related pattern memories matched by buildVersion in System Signal detail", async () => {
    const first = createSystemRecord({ id: "system-error-1", fingerprint: "fp-admin", buildVersion: "0.12.21" });
    await seedPatternMemory(createPatternMemory({
      memoryId: "memory-build",
      title: "Build memory",
      affectedBuilds: ["0.12.21"],
    }));
    allowAdminAccess();
    signalIndex.counts.system = 1;
    signalIndex.signalById = { [first.submission.id]: first.record };
    mockInboxState.current = {
      forms: [first.form],
      selectedStreamId: "system",
      allSignals: [first.record],
      visibleSignals: [first.record],
      selectedRecord: first.record,
      signalIndex,
    };

    renderAdminRoute();

    const relatedPanel = await screen.findByRole("region", { name: "Related Pattern Memories" });
    expect(within(relatedPanel).getByText("Build memory")).toBeInTheDocument();
  });

  it("shows related pattern memories for normal user signals without rendering raw answers", async () => {
    const { form, record } = createResponderRecord({
      answers: { report: "raw wallet answer secret" },
      category: "bug",
      priority: "high",
      triageStatus: "investigating",
      tags: ["wallet", "mobile-ux"],
      aiSummary: "Users are confused by wallet connection on mobile.",
      subjectPreview: "Wallet connection confusion",
      notes: "Safe admin note about connection copy.",
    });
    await seedPatternMemory(createPatternMemory({
      memoryId: "memory-user-signal",
      type: "ux_friction_pattern",
      title: "Wallet connection UX memory",
      summary: "Users report wallet connection confusion on mobile.",
      signalKinds: ["user_signal"],
      sourceSignalIds: [],
      tags: ["mobile-ux"],
      recommendedCodexPrompt: "Investigate wallet connection UX.",
    }));
    allowAdminAccess();
    signalIndex.counts.system = 0;
    signalIndex.signalById = { [record.submission.id]: record };
    mockInboxState.current = {
      forms: [form],
      selectedStreamId: "all",
      allSignals: [record],
      visibleSignals: [record],
      selectedRecord: record,
      signalIndex,
    };

    renderAdminRoute();

    const relatedPanel = await screen.findByRole("region", { name: "Related Pattern Memories" });
    expect(within(relatedPanel).getByText("Wallet connection UX memory")).toBeInTheDocument();
    expect(within(relatedPanel).getByText("ux_friction_pattern")).toBeInTheDocument();
    expect(within(relatedPanel).getByText("Shared tags")).toBeInTheDocument();
    expect(within(relatedPanel).getByText("Same category")).toBeInTheDocument();
    expect(within(relatedPanel).getByText("Similar summary")).toBeInTheDocument();
    expect(relatedPanel.textContent).not.toContain("raw wallet answer secret");
  });

  it("does not show unrelated pattern memories in System Signal detail", async () => {
    const first = createSystemRecord({ id: "system-error-1", fingerprint: "fp-admin", routeId: "admin" });
    await seedPatternMemory(createPatternMemory({
      memoryId: "memory-unrelated",
      title: "Unrelated memory",
      sourceSignalIds: [],
      fingerprints: ["fp-other"],
      affectedRoutes: ["public-form"],
      affectedBuilds: ["9.9.9"],
      tags: ["unrelated"],
    }));
    allowAdminAccess();
    signalIndex.counts.system = 1;
    signalIndex.signalById = { [first.submission.id]: first.record };
    mockInboxState.current = {
      forms: [first.form],
      selectedStreamId: "system",
      allSignals: [first.record],
      visibleSignals: [first.record],
      selectedRecord: first.record,
      signalIndex,
    };

    renderAdminRoute();

    const relatedPanel = await screen.findByRole("region", { name: "Related Pattern Memories" });
    expect(within(relatedPanel).queryByText("Unrelated memory")).not.toBeInTheDocument();
    expect(within(relatedPanel).getByText("No related pattern memories found.")).toBeInTheDocument();
  });

  it("shows an empty related pattern memory state when there are no saved matches", async () => {
    const first = createSystemRecord({ id: "system-error-1", fingerprint: "fp-admin", routeId: "admin" });
    allowAdminAccess();
    signalIndex.counts.system = 1;
    signalIndex.signalById = { [first.submission.id]: first.record };
    mockInboxState.current = {
      forms: [first.form],
      selectedStreamId: "system",
      allSignals: [first.record],
      visibleSignals: [first.record],
      selectedRecord: first.record,
      signalIndex,
    };

    renderAdminRoute();

    const relatedPanel = await screen.findByRole("region", { name: "Related Pattern Memories" });
    expect(within(relatedPanel).getByText("No related pattern memories found.")).toBeInTheDocument();
  });

  it("regroups the System Diagnostics Summary by routeId", async () => {
    const first = createSystemRecord({ id: "system-error-1", fingerprint: "fp-admin", routeId: "admin" });
    const second = createSystemRecord({
      id: "system-error-2",
      createdAt: "2026-01-01T00:02:00.000Z",
      fingerprint: "fp-public",
      routeId: "public-form",
      routePath: "/f/form-1",
    });
    allowAdminAccess();
    signalIndex.counts.system = 2;
    signalIndex.signalById = {
      [first.submission.id]: first.record,
      [second.submission.id]: second.record,
    };
    mockInboxState.current = {
      forms: [first.form],
      selectedStreamId: "system",
      allSignals: [first.record, second.record],
      visibleSignals: [first.record, second.record],
      selectedRecord: first.record,
      signalIndex,
    };

    renderAdminRoute();

    expect(await screen.findByRole("heading", { name: "System Diagnostics Summary" })).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "System Diagnostics Summary" });
    fireEvent.change(screen.getByLabelText("Group diagnostics by"), { target: { value: "routeId" } });

    await waitFor(() => expect(within(panel).queryByText("fp-admin")).not.toBeInTheDocument());
    expect(within(panel).getAllByText("admin").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("public-form").length).toBeGreaterThan(0);
  });

  it("shows when the System Diagnostics Summary is capped at the max diagnostics limit", async () => {
    const records = Array.from({ length: 505 }, (_, index) =>
      createSystemRecord({
        id: `system-error-${index}`,
        createdAt: `2026-01-01T${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00.000Z`,
        fingerprint: index < 500 ? "fp-loaded" : "fp-over-limit",
      }).record,
    );
    const form = records[0].form;
    allowAdminAccess();
    signalIndex.counts.system = records.length;
    signalIndex.signalById = Object.fromEntries(records.map((record) => [record.submission.id, record]));
    mockInboxState.current = {
      forms: [form],
      selectedStreamId: "system",
      allSignals: records,
      visibleSignals: records,
      selectedRecord: records[0],
      signalIndex,
    };

    renderAdminRoute();

    expect(await screen.findByRole("heading", { name: "System Diagnostics Summary" })).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "System Diagnostics Summary" });
    await waitFor(() => expect(within(panel).getByText("500/505")).toBeInTheDocument());
    expect(within(panel).getByText("Summary is capped at 500 of 505 visible diagnostics.")).toBeInTheDocument();
  });

  it("does not show the diagnostics summary for normal user response streams", async () => {
    const { form, record, submission } = createResponderRecord();
    allowAdminAccess();
    signalIndex.counts.system = 0;
    signalIndex.signalById = { [submission.id]: record };
    mockInboxState.current = {
      forms: [form],
      selectedStreamId: "all",
      allSignals: [record],
      visibleSignals: [record],
      selectedRecord: null,
      signalIndex,
    };

    renderAdminRoute();

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Connect Wallet" })).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "System Diagnostics Summary" })).not.toBeInTheDocument();
    expect(screen.queryByText("No system diagnostics match the current filters.")).not.toBeInTheDocument();
  });
});
