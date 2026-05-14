import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicFormPage } from "./PublicFormPage";
import type { FormSchema } from "../types";

const mockUseCurrentAccount = vi.fn();
const mockReadManifestWithForm = vi.fn();
const mockReadJsonBlobOrThrow = vi.fn();
const mockGetWalrusMutationRuntimeStatus = vi.fn();
const mockGetForm = vi.fn();
const mockSaveSubmission = vi.fn();
const mockSaveForm = vi.fn();
const mockUpsertFormBlobIndex = vi.fn();

vi.mock("@mysten/dapp-kit", () => ({
  useCurrentAccount: () => mockUseCurrentAccount(),
}));

vi.mock("../i18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      if (key === "loadingPublicForm") {
        return "Loading public form...";
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

vi.mock("../storage/walrusAdapter", () => ({
  readManifestWithForm: (...args: unknown[]) => mockReadManifestWithForm(...args),
  readJsonBlobOrThrow: (...args: unknown[]) => mockReadJsonBlobOrThrow(...args),
  getWalrusMutationRuntimeStatus: () => mockGetWalrusMutationRuntimeStatus(),
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

describe("PublicFormPage shared manifest restore", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    mockUseCurrentAccount.mockReturnValue(null);
    mockReadJsonBlobOrThrow.mockReset();
    mockReadManifestWithForm.mockReset();
    mockGetWalrusMutationRuntimeStatus.mockReset();
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
    mockGetForm.mockResolvedValue(null);
    mockSaveSubmission.mockResolvedValue({ id: "submission-123", blobId: "local-submission-123" });
    mockSaveForm.mockResolvedValue(undefined);
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

    render(
      <MemoryRouter initialEntries={["/f/form-123?manifest=blob-abc"]}>
        <Routes>
          <Route path="/f/:formId" element={<PublicFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Loading public form...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Shared Feedback Form" })).toBeInTheDocument());
    expect(screen.getByText("What happened?")).toBeInTheDocument();
    expect(mockGetForm).not.toHaveBeenCalled();
    expect(mockSaveForm).toHaveBeenCalledTimes(1);
  });

  it("falls back to a cached form when the shared manifest cannot be restored", async () => {
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

    render(
      <MemoryRouter initialEntries={["/f/form-123?manifest=blob-abc"]}>
        <Routes>
          <Route path="/f/:formId" element={<PublicFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Cached Feedback Form" })).toBeInTheDocument());
    expect(screen.getByText("What should we know?")).toBeInTheDocument();
    expect(mockGetForm).toHaveBeenCalledWith("form-123");
    expect(mockSaveForm).not.toHaveBeenCalled();
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

    render(
      <MemoryRouter initialEntries={["/f/form-123?manifest=blob-abc"]}>
        <Routes>
          <Route path="/f/:formId" element={<PublicFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Shared Feedback Form" })).toBeInTheDocument());
    await waitFor(() => expect(mockSaveForm).toHaveBeenCalledTimes(1));
    const answerInput = screen.getByRole("textbox");
    fireEvent.input(answerInput, { target: { value: "The shared responder path works." } });
    expect(answerInput).toHaveValue("The shared responder path works.");
    fireEvent.click(screen.getByRole("button", { name: "Submit anonymously" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Signal sent" })).toBeInTheDocument());
    expect(mockSaveSubmission).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/sending it requires/i)).not.toBeInTheDocument();
    expect(screen.getByText("signalStoredLocally")).toBeInTheDocument();
  });
});
