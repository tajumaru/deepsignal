import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RpcInfrastructureContext, type RpcInfrastructureContextValue } from "../rpcInfrastructure";
import { PublicFormPage } from "./PublicFormPage";
import type { FormSchema } from "../types";
import type { ZkLoginSession } from "../lib/zkloginSession";
import { listPendingSubmissions } from "../storage/submissionDelivery";

const SUBMIT_SIGNAL_BUTTON = /^(Hold to send signal|Signal preserved locally|Signal sent)/;

const mockUseCurrentAccount = vi.fn();
const mockUseCurrentWallet = vi.fn();
const mockReadManifestWithForm = vi.fn();
const mockReadJsonBlobOrThrow = vi.fn();
const mockGetWalrusMutationRuntimeStatus = vi.fn();
const mockVerifyPublicRouteAssets = vi.fn();
const mockVerifyWalrusBlob = vi.fn();
const mockGetForm = vi.fn();
const mockSaveSubmission = vi.fn();
const mockSaveForm = vi.fn();
const mockUpsertFormBlobIndex = vi.fn();
const mockIsZkLoginEnabled = vi.fn();
const mockBeginGoogleZkLogin = vi.fn();
const mockLoadZkLoginSession = vi.fn();
const mockClearZkLoginSession = vi.fn();
let mockLanguage = "en";
const mockRpcInfrastructure: RpcInfrastructureContextValue = {
  mode: "default",
  network: "mainnet",
  currentRpcUrl: "https://fullnode.mainnet.sui.io",
  displayRpcUrl: "https://fullnode.mainnet.sui.io",
  defaultRpcUrl: "https://fullnode.mainnet.sui.io",
  tatumRpcUrl: null,
  providerLabel: "Sui Fullnode",
  usingTatum: false,
  canUseTatum: false,
  connectedNetworkLabel: "mainnet",
  setConnectedNetworkLabel: vi.fn(),
  switchToDefault: vi.fn(),
  switchToTatum: vi.fn(),
  noteRateLimited: vi.fn(),
  clearRateLimitedState: vi.fn(),
  rateLimitedUntil: 0,
  isRateLimitedCooldownActive: false,
  canAutoFallbackFromRateLimit: true,
};

vi.mock("@mysten/dapp-kit", () => ({
  useCurrentAccount: () => mockUseCurrentAccount(),
  useCurrentWallet: () => mockUseCurrentWallet(),
  createNetworkConfig: (config: unknown) => ({ networkConfig: config }),
  SuiClientProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  WalletProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useDisconnectWallet: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSuiClientContext: () => ({
    client: null,
    network: "mainnet",
    selectNetwork: vi.fn(),
    networks: {},
  }),
}));

vi.mock("../hooks/useSuiName", () => ({
  useSuiName: () => ({ data: null }),
}));

vi.mock("../i18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      if (key === "loadingPublicForm") {
        return "Loading public form...";
      }
      if (key === "publicFormMissingBody") {
        return `Missing public form (${mockLanguage})`;
      }
      if (key === "publicDefaultBody") {
        return "Public form";
      }
      return key;
    },
  }),
}));

vi.mock("../components/WalletConnect", () => ({
  WalletConnect: () => <div>Wallet Connect</div>,
}));

vi.mock("../lib/zkloginOAuth", () => ({
  isZkLoginEnabled: () => mockIsZkLoginEnabled(),
  beginGoogleZkLogin: (...args: unknown[]) => mockBeginGoogleZkLogin(...args),
}));

vi.mock("../lib/zkloginSession", () => ({
  loadZkLoginSession: () => mockLoadZkLoginSession(),
  clearZkLoginSession: () => mockClearZkLoginSession(),
}));

vi.mock("../lib/publicRouteAssets", () => ({
  verifyPublicRouteAssets: (...args: unknown[]) => mockVerifyPublicRouteAssets(...args),
}));

vi.mock("../lib/walrusProof", () => ({
  getCurrentWalrusNetwork: () => "testnet",
  verifyWalrusBlob: (...args: unknown[]) => mockVerifyWalrusBlob(...args),
}));

vi.mock("../lib/walrus", () => ({
  readManifestWithForm: (...args: unknown[]) => mockReadManifestWithForm(...args),
  readJsonBlobOrThrow: (...args: unknown[]) => mockReadJsonBlobOrThrow(...args),
  getWalrusMutationRuntimeStatus: () => mockGetWalrusMutationRuntimeStatus(),
  subscribeWalrusRuntime: () => vi.fn(),
  waitForWalrusMutationRuntimeReady: vi.fn(async () => false),
}));

vi.mock("../lib/storage", async () => {
  const actual = await vi.importActual<typeof import("../lib/storage")>("../lib/storage");
  return {
    ...actual,
    storageAdapter: {
      ...actual.storageAdapter,
      getForm: (...args: unknown[]) => mockGetForm(...args),
      saveSubmission: (...args: unknown[]) => mockSaveSubmission(...args),
    },
    getStorageRuntimeStatus: () => ({ mode: "walrus", notice: null, diagnostics: null }),
  };
});

vi.mock("../storage/localStorageAdapter", () => ({
  localStorageAdapter: {
    saveForm: (...args: unknown[]) => mockSaveForm(...args),
  },
}));

vi.mock("../storage/blobIndex", () => ({
  upsertFormBlobIndex: (...args: unknown[]) => mockUpsertFormBlobIndex(...args),
}));

function renderPublicFormPage(
  initialEntry = "/f/form-123?manifest=blob-abc&step=answer&identity=anonymous",
) {
  return render(
    <RpcInfrastructureContext.Provider value={mockRpcInfrastructure}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/f/:formId" element={<PublicFormPage />} />
        </Routes>
      </MemoryRouter>
    </RpcInfrastructureContext.Provider>,
  );
}

describe("PublicFormPage shared manifest restore", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockLanguage = "en";
    Element.prototype.scrollIntoView = vi.fn();
    window.localStorage.clear();
    mockUseCurrentAccount.mockReturnValue(null);
    mockUseCurrentWallet.mockReturnValue({
      currentWallet: null,
      connectionStatus: "disconnected",
      isConnected: false,
      isConnecting: false,
      supportedIntents: [],
    });
    mockReadJsonBlobOrThrow.mockReset();
    mockReadManifestWithForm.mockReset();
    mockGetWalrusMutationRuntimeStatus.mockReset();
    mockVerifyPublicRouteAssets.mockReset();
    mockVerifyWalrusBlob.mockReset();
    mockGetForm.mockReset();
    mockSaveSubmission.mockReset();
    mockSaveForm.mockReset();
    mockUpsertFormBlobIndex.mockReset();
    mockGetWalrusMutationRuntimeStatus.mockReturnValue({
      aggregatorConfigured: true,
      writeConfigured: true,
      hasClient: false,
      hasWallet: false,
      canWrite: false,
      storageMode: "uploadRelay",
    });
    mockVerifyPublicRouteAssets.mockResolvedValue({ ok: true, failedAsset: null, assets: [] });
    mockVerifyWalrusBlob.mockResolvedValue("verified");
    mockGetForm.mockResolvedValue(null);
    mockSaveSubmission.mockResolvedValue({ id: "submission-123", blobId: "local-submission-123" });
    mockSaveForm.mockResolvedValue(undefined);
    mockIsZkLoginEnabled.mockReset();
    mockBeginGoogleZkLogin.mockReset();
    mockLoadZkLoginSession.mockReset();
    mockClearZkLoginSession.mockReset();
    mockIsZkLoginEnabled.mockReturnValue(false);
    mockLoadZkLoginSession.mockReturnValue(null);
  });

  it("renders a shared public form without a connected wallet", async () => {
    const form: FormSchema = {
      id: "form-123",
      title: "Shared Feedback Form",
      description: "Restored from a Walrus manifest link.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What happened?",
          required: true,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
    };

    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-123",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form,
    });

    renderPublicFormPage("/f/form-123?manifest=blob-abc&step=answer&identity=wallet");

    expect(screen.getByText("Loading public form...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Shared Feedback Form" })).toBeInTheDocument());
    expect(screen.getByText("What happened?")).toBeInTheDocument();
    expect(mockGetForm).not.toHaveBeenCalled();
    expect(mockSaveForm).toHaveBeenCalledTimes(1);
  });

  it("falls back to anonymous submission when a wallet-optional form is opened in wallet mode without a connected wallet", async () => {
    const form: FormSchema = {
      id: "form-123",
      title: "Shared Feedback Form",
      description: "Restored from a Walrus manifest link.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What happened?",
          required: true,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
      identityPolicy: "anonymous_allowed",
    };

    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-123",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form,
    });

    renderPublicFormPage("/f/form-123?manifest=blob-abc&step=answer&identity=wallet");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Shared Feedback Form" })).toBeInTheDocument());
    const answerInput = screen.getByRole("textbox");
    fireEvent.change(answerInput, { target: { value: "Anonymous fallback still submits." } });
    await waitFor(() => expect(answerInput).toHaveValue("Anonymous fallback still submits."));
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_SIGNAL_BUTTON }));

    await waitFor(() => expect(mockSaveSubmission).toHaveBeenCalledTimes(1));
    const [savedSubmission] = mockSaveSubmission.mock.calls[0] as [{ respondentMeta?: unknown; metadata?: unknown }];
    expect(savedSubmission.respondentMeta).toMatchObject({
      isAnonymous: true,
      identityKind: "anonymous",
      walletAddress: undefined,
      verifiedAddress: undefined,
    });
    expect(savedSubmission.metadata).toMatchObject({
      respondentIdentity: {
        mode: "anonymous",
        provider: undefined,
        verifiedAddress: undefined,
      },
    });
    expect(screen.queryByText("This form requires a connected wallet before you can submit.")).not.toBeInTheDocument();
  });

  it("shows a detailed restore error when the shared manifest cannot be restored", async () => {
    const cachedForm: FormSchema = {
      id: "form-123",
      title: "Cached Feedback Form",
      description: "Loaded from local fallback.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What should we know?",
          required: false,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
      manifestBlobId: "blob-abc",
    };

    mockReadManifestWithForm.mockRejectedValue(new Error("Walrus read timed out."));
    mockGetForm.mockResolvedValue(cachedForm);

    renderPublicFormPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "sharedLinkUnavailableTitle" })).toBeInTheDocument());
    expect(screen.getAllByText(/Walrus read timed out/).length).toBeGreaterThan(0);
    expect(screen.getByText("blob-abc")).toBeInTheDocument();
    expect(mockGetForm).not.toHaveBeenCalled();
    expect(mockSaveForm).not.toHaveBeenCalled();
  });

  it("shows the failed module asset and republish action when a required module script cannot load", async () => {
    mockReadManifestWithForm.mockRejectedValue(new TypeError("Importing a module script failed."));
    mockVerifyPublicRouteAssets.mockResolvedValue({
      ok: false,
      failedAsset: {
        path: "./assets/PublicFormPage-broken.js",
        status: 503,
        contentType: "text/plain",
      },
      assets: [],
    });

    renderPublicFormPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "sharedLinkUnavailableTitle" })).toBeInTheDocument());
    expect(screen.getByText("./assets/PublicFormPage-broken.js")).toBeInTheDocument();
    expect(screen.getByText(/503/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "republish" })).toHaveAttribute("href", expect.stringContaining("/create?"));
  });

  it("shows a form mismatch error for links that point to a different manifest form", async () => {
    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-other",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form: null,
    });

    renderPublicFormPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "sharedLinkMismatchTitle" })).toBeInTheDocument());
    expect(screen.getAllByText(/form-other/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("form-123").length).toBeGreaterThan(0);
    expect(mockGetForm).not.toHaveBeenCalled();
  });

  it("allows shared public form submission to use local fallback when Walrus write runtime is unavailable", async () => {
    const form: FormSchema = {
      id: "form-123",
      title: "Shared Feedback Form",
      description: "Restored from a Walrus manifest link.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What happened?",
          required: true,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
    };

    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-123",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form,
    });

    renderPublicFormPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Shared Feedback Form" })).toBeInTheDocument());
    await waitFor(() => expect(mockSaveForm).toHaveBeenCalledTimes(1));
    const answerInput = screen.getByRole("textbox");
    fireEvent.input(answerInput, { target: { value: "The shared responder path works." } });
    expect(answerInput).toHaveValue("The shared responder path works.");
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_SIGNAL_BUTTON }));

    await waitFor(() => expect(mockSaveSubmission).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/sending it requires/i)).not.toBeInTheDocument();
  });

  it("clears local recovery once a public submission reaches the owner inbox", async () => {
    const form: FormSchema = {
      id: "form-123",
      title: "Shared Feedback Form",
      description: "Restored from a Walrus manifest link.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What happened?",
          required: true,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
    };

    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-123",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form,
    });
    mockSaveSubmission.mockResolvedValue({
      id: "submission-123",
      blobId: "blob-remote-123",
      answerBlobId: "blob-answer-123",
      remoteIndexUpdated: true,
      remoteIndexReadBack: true,
      ownerReadable: true,
      remoteSyncStatus: "remote_synced",
    });

    renderPublicFormPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Shared Feedback Form" })).toBeInTheDocument());
    fireEvent.input(screen.getByRole("textbox"), { target: { value: "This reaches the owner inbox." } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_SIGNAL_BUTTON }));

    await waitFor(() => expect(mockSaveSubmission).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listPendingSubmissions()).toEqual([]));
    expect(screen.queryByText("Pending local signals")).not.toBeInTheDocument();
  });

  it("does not show local recovery for relay-accepted submissions awaiting inbox readback", async () => {
    const form: FormSchema = {
      id: "form-123",
      title: "Shared Feedback Form",
      description: "Restored from a Walrus manifest link.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What happened?",
          required: true,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
    };

    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-123",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form,
    });
    mockSaveSubmission.mockResolvedValue({
      id: "submission-123",
      blobId: "blob-remote-123",
      answerBlobId: "blob-answer-123",
      remoteIndexTarget: "google-apps-script-drive",
      remoteIndexUpdated: true,
      remoteIndexReadBack: false,
      ownerReadable: false,
      remoteSyncStatus: "sync_pending",
    });

    renderPublicFormPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Shared Feedback Form" })).toBeInTheDocument());
    fireEvent.input(screen.getByRole("textbox"), { target: { value: "Relay accepted, readback pending." } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_SIGNAL_BUTTON }));

    await waitFor(() => expect(listPendingSubmissions()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText("Pending local signals")).not.toBeInTheDocument());
  });

  it("preserves typed answers when public page language text changes", async () => {
    const form: FormSchema = {
      id: "form-123",
      title: "Shared Feedback Form",
      description: "Restored from a Walrus manifest link.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What happened?",
          required: true,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
    };

    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-123",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form,
    });

    const view = renderPublicFormPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Shared Feedback Form" })).toBeInTheDocument());
    fireEvent.input(screen.getByRole("textbox"), { target: { value: "Keep this draft through language switch." } });

    mockLanguage = "ja";
    view.rerender(
      <RpcInfrastructureContext.Provider value={mockRpcInfrastructure}>
        <MemoryRouter initialEntries={["/f/form-123?manifest=blob-abc&step=answer&identity=anonymous"]}>
          <Routes>
            <Route path="/f/:formId" element={<PublicFormPage />} />
          </Routes>
        </MemoryRouter>
      </RpcInfrastructureContext.Provider>,
    );

    expect(screen.getByRole("textbox")).toHaveValue("Keep this draft through language switch.");
    expect(mockReadManifestWithForm).toHaveBeenCalledTimes(1);
  });

  it("keeps anonymous uploadRelay submission wallet-free when the relay runtime reports no client", async () => {
    const form: FormSchema = {
      id: "form-123",
      title: "Shared Feedback Form",
      description: "Restored from a Walrus manifest link.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What happened?",
          required: true,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
      identityPolicy: "anonymous_allowed",
    };

    mockGetWalrusMutationRuntimeStatus.mockReturnValue({
      aggregatorConfigured: true,
      writeConfigured: true,
      hasClient: false,
      hasWallet: false,
      canWrite: false,
      storageMode: "uploadRelay",
    });
    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-123",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form,
    });

    renderPublicFormPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Shared Feedback Form" })).toBeInTheDocument());
    fireEvent.input(screen.getByRole("textbox"), { target: { value: "Anonymous relay path still submits." } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_SIGNAL_BUTTON }));

    await waitFor(() => expect(mockSaveSubmission).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/reconnect your wallet/i)).not.toBeInTheDocument();
  });

  it("disables anonymous uploadRelay submission while storage is still preparing", async () => {
    const form: FormSchema = {
      id: "form-123",
      title: "Shared Feedback Form",
      description: "Restored from a Walrus manifest link.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What happened?",
          required: true,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
      identityPolicy: "anonymous_allowed",
    };

    mockGetWalrusMutationRuntimeStatus.mockReturnValue({
      aggregatorConfigured: true,
      writeConfigured: false,
      hasClient: false,
      hasWallet: false,
      canWrite: false,
      storageMode: "uploadRelay",
    });
    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-123",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form,
    });

    renderPublicFormPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Shared Feedback Form" })).toBeInTheDocument());
    expect(screen.getByText("Storage is preparing. Please wait a few seconds.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SUBMIT_SIGNAL_BUTTON })).toBeDisabled();
    expect(mockSaveSubmission).not.toHaveBeenCalled();
  });

  it("maps anonymous uploadRelay runtime failures to a storage message instead of wallet reconnect copy", async () => {
    const form: FormSchema = {
      id: "form-123",
      title: "Shared Feedback Form",
      description: "Restored from a Walrus manifest link.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What happened?",
          required: true,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
      identityPolicy: "anonymous_allowed",
    };

    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-123",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form,
    });
    mockSaveSubmission.mockRejectedValue(
      new Error("Walrus client is not ready yet. Refresh the page and reconnect your wallet."),
    );

    renderPublicFormPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Shared Feedback Form" })).toBeInTheDocument());
    fireEvent.input(screen.getByRole("textbox"), { target: { value: "Anonymous relay readiness should stay storage-specific." } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_SIGNAL_BUTTON }));

    await waitFor(() => expect(screen.getAllByText("Storage is preparing. Please wait a few seconds.").length).toBeGreaterThan(0));
    expect(screen.queryByText(/reconnect your wallet/i)).not.toBeInTheDocument();
  });

  it("preserves failed public form input and offers draft recovery on return", async () => {
    const form: FormSchema = {
      id: "form-123",
      title: "Shared Feedback Form",
      description: "Restored from a Walrus manifest link.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What happened?",
          required: true,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
    };

    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-123",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form,
    });
    mockSaveSubmission.mockRejectedValue(new Error("Walrus upload failed."));

    const view = renderPublicFormPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Shared Feedback Form" })).toBeInTheDocument());
    fireEvent.input(screen.getByRole("textbox"), { target: { value: "Please keep this draft." } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_SIGNAL_BUTTON }));

    await waitFor(() => expect(screen.getAllByText("Walrus upload failed.").length).toBeGreaterThan(0));
    expect(window.localStorage.getItem("deepsignal:public-draft:form-123:blob-abc")).toContain("Please keep this draft.");

    view.unmount();

    renderPublicFormPage();

    await waitFor(() => expect(screen.getByText("recoverableDraftTitle")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "restore" }));
    expect(screen.getByRole("textbox")).toHaveValue("Please keep this draft.");
  });

  it("marks repeated quota recovery failures as corrupted and discards local recovery state", async () => {
    const form: FormSchema = {
      id: "form-123",
      title: "Shared Feedback Form",
      description: "Restored from a Walrus manifest link.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What happened?",
          required: true,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
    };

    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-123",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form,
    });
    mockSaveSubmission.mockRejectedValue(new Error("The quota has been exceeded."));
    window.localStorage.setItem("deepsignal.encryptedPayloads", JSON.stringify([{ blobId: "pending", payload: "sealed" }]));

    renderPublicFormPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Shared Feedback Form" })).toBeInTheDocument());
    fireEvent.input(screen.getByRole("textbox"), { target: { value: "Please keep this draft." } });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      fireEvent.click(screen.getByRole("button", { name: SUBMIT_SIGNAL_BUTTON }));
      await waitFor(() => expect(mockSaveSubmission).toHaveBeenCalledTimes(attempt + 1));
    }

    await waitFor(() =>
      expect(window.localStorage.getItem("deepsignal:public-recovery-retries:form-123:blob-abc")).not.toBeNull(),
    );
    expect(screen.queryByRole("button", { name: "retryLabel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^(discard|discardRecovery)$/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^(discard|discardRecovery)$/ }));

    expect(window.localStorage.getItem("deepsignal:public-draft:form-123:blob-abc")).toBeNull();
  });

  it("saves a zkLogin verified respondent identity on wallet-optional forms", async () => {
    const form: FormSchema = {
      id: "form-123",
      title: "Shared Feedback Form",
      description: "Restored from a Walrus manifest link.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What happened?",
          required: true,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
      identityPolicy: "anonymous_allowed",
    };
    const zkLoginSession: ZkLoginSession = {
      provider: "google",
      iss: "https://accounts.google.com",
      aud: "google-client-id",
      address: "0xzklogin123",
      subHash: "hashed-sub",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };

    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-123",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form,
    });
    mockIsZkLoginEnabled.mockReturnValue(true);
    mockLoadZkLoginSession.mockReturnValue(zkLoginSession);

    renderPublicFormPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Shared Feedback Form" })).toBeInTheDocument());
    fireEvent.input(screen.getByRole("textbox"), { target: { value: "The zkLogin responder path works." } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_SIGNAL_BUTTON }));

    await waitFor(() => expect(mockSaveSubmission).toHaveBeenCalledTimes(1));
    const [savedSubmission] = mockSaveSubmission.mock.calls[0] as [{
      respondentMeta?: unknown;
      metadata?: unknown;
      contributorId?: unknown;
    }];
    expect(savedSubmission.respondentMeta).toMatchObject({
      isAnonymous: false,
      identityKind: "zklogin",
      identityProvider: "google",
      verifiedAddress: "0xzklogin123",
      zkLogin: {
        iss: "https://accounts.google.com",
        aud: "google-client-id",
        address: "0xzklogin123",
        legacyAddress: false,
        subHash: "hashed-sub",
      },
    });
    expect(savedSubmission.metadata).toMatchObject({
      respondentIdentity: {
        mode: "zklogin",
        provider: "google",
        verifiedAddress: "0xzklogin123",
        zkLoginIssuer: "https://accounts.google.com",
      },
    });
    expect(savedSubmission.contributorId).toBe("0xzklogin123");
  });

  it("keeps wallet-required forms gated to Sui wallets even when a zkLogin session exists", async () => {
    const form: FormSchema = {
      id: "form-123",
      title: "Secure Feedback Form",
      description: "Wallet verification is required.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What happened?",
          required: true,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
      identityPolicy: "wallet_required",
    };
    const zkLoginSession: ZkLoginSession = {
      provider: "google",
      iss: "https://accounts.google.com",
      address: "0xzklogin123",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };

    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-123",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form,
    });
    mockIsZkLoginEnabled.mockReturnValue(true);
    mockLoadZkLoginSession.mockReturnValue(zkLoginSession);

    renderPublicFormPage();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Secure Feedback Form" })).toBeInTheDocument());
    fireEvent.input(screen.getByRole("textbox"), { target: { value: "Wallet-required forms still reject zkLogin only." } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_SIGNAL_BUTTON }));

    await waitFor(() =>
      expect(screen.getByText("This form requires a connected wallet before you can submit.")).toBeInTheDocument(),
    );
    expect(mockSaveSubmission).not.toHaveBeenCalled();
  });

  it("submits wallet-required forms when a Sui wallet is already connected", async () => {
    const form: FormSchema = {
      id: "form-123",
      title: "Secure Feedback Form",
      description: "Wallet verification is required.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What happened?",
          required: true,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
      identityPolicy: "wallet_required",
    };

    mockUseCurrentAccount.mockReturnValue({
      address: "0xabc123",
    });
    mockUseCurrentWallet.mockReturnValue({
      currentWallet: { name: "Sui Wallet" },
      connectionStatus: "connected",
      isConnected: true,
      isConnecting: false,
      supportedIntents: [],
    });
    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-123",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form,
    });

    renderPublicFormPage("/f/form-123?manifest=blob-abc");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Secure Feedback Form" })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: SUBMIT_SIGNAL_BUTTON })).toBeInTheDocument());
    fireEvent.input(screen.getByRole("textbox"), { target: { value: "Connected wallet path now submits." } });
    fireEvent.click(screen.getByRole("button", { name: SUBMIT_SIGNAL_BUTTON }));

    await waitFor(() => expect(mockSaveSubmission).toHaveBeenCalledTimes(1));
    const [savedSubmission] = mockSaveSubmission.mock.calls[0] as [{ respondentMeta?: unknown; metadata?: unknown }];
    expect(savedSubmission.respondentMeta).toMatchObject({
      isAnonymous: false,
      identityKind: "sui_wallet",
      walletAddress: "0xabc123",
      verifiedAddress: "0xabc123",
    });
    expect(savedSubmission.metadata).toMatchObject({
      respondentIdentity: {
        mode: "sui_wallet",
        verifiedAddress: "0xabc123",
      },
    });
    expect(screen.queryByText("This form requires a connected wallet before you can submit.")).not.toBeInTheDocument();
  });

  it("skips the identity choice screen when wallet-required forms only allow one answer mode", async () => {
    const form: FormSchema = {
      id: "form-123",
      title: "Secure Feedback Form",
      description: "Wallet verification is required.",
      fields: [
        {
          id: "field-1",
          type: "shortText",
          label: "What happened?",
          required: true,
          sensitive: false,
        },
      ],
      createdAt: "2026-05-14T00:00:00.000Z",
      identityPolicy: "wallet_required",
    };

    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        version: 1,
        formId: "form-123",
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        formBlobId: "__bundled_form__",
        submissions: [],
      },
      form,
    });

    renderPublicFormPage("/f/form-123?manifest=blob-abc");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Secure Feedback Form" })).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "publicIdentityChoiceTitle" })).not.toBeInTheDocument();
    expect(screen.getByText("What happened?")).toBeInTheDocument();
    expect(screen.queryByText("publicIdentityChangeAction")).not.toBeInTheDocument();
  });
});
