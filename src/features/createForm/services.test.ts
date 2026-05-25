import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreparedPublishForm } from "./types";
import { publishForm } from "./services";

const {
  mockCreateMetadataDigest,
  mockSaveForm,
  mockSaveFormMetadataOverlay,
  mockDeleteFormsFromLocalCache,
  mockVerifyWalrusBlob,
  mockReadManifestWithForm,
  mockReadJsonBlobOrThrow,
} = vi.hoisted(() => ({
  mockCreateMetadataDigest: vi.fn(async () => "digest-123"),
  mockSaveForm: vi.fn(),
  mockSaveFormMetadataOverlay: vi.fn(),
  mockDeleteFormsFromLocalCache: vi.fn(),
  mockVerifyWalrusBlob: vi.fn(),
  mockReadManifestWithForm: vi.fn(),
  mockReadJsonBlobOrThrow: vi.fn(),
}));

vi.mock("../../lib/projectRegistry", () => ({
  createMetadataDigest: mockCreateMetadataDigest,
}));

vi.mock("../../lib/storage", () => ({
  storageAdapter: {
    saveForm: mockSaveForm,
  },
  deleteFormsFromLocalCache: (...args: unknown[]) => mockDeleteFormsFromLocalCache(...args),
}));

vi.mock("../../storage/formMetadataOverlay", () => ({
  saveFormMetadataOverlay: mockSaveFormMetadataOverlay,
}));

vi.mock("../../storage/storageFactory", () => ({
  deleteFormsFromLocalCache: mockDeleteFormsFromLocalCache,
}));

vi.mock("../../lib/walrusProof", () => ({
  verifyWalrusBlob: mockVerifyWalrusBlob,
}));

vi.mock("../../lib/walrus", () => ({
  readManifestWithForm: mockReadManifestWithForm,
  readJsonBlobOrThrow: mockReadJsonBlobOrThrow,
}));

vi.mock("./utils", async () => {
  const actual = await vi.importActual<typeof import("./utils")>("./utils");
  return {
    ...actual,
    wait: () => Promise.resolve(),
  };
});

function createFormFixture(overrides: Partial<PreparedPublishForm> = {}): PreparedPublishForm {
  return {
    id: "form-123",
    title: "Signal Form",
    description: "Investigate runtime health",
    purpose: "custom",
    visibility: "private",
    publicExplore: false,
    fields: [{ id: "field-1", type: "shortText", label: "Signal", required: true, sensitive: false }],
    sections: [],
    encryptSubmissions: false,
    responseDeadline: null,
    responseDeadlineMode: "none",
    ownerAddress: "0xabc",
    createdAt: "2026-05-25T00:00:00.000Z",
    ...overrides,
  };
}

function createTranslate() {
  return (key: string) => key;
}

describe("publishForm", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("completes publish without waiting for public route asset verification", async () => {
    mockSaveForm.mockResolvedValue({
      blobId: "manifest-blob-1",
      manifestBlobId: "manifest-blob-1",
    });
    mockVerifyWalrusBlob.mockResolvedValue("verified");
    mockReadManifestWithForm.mockResolvedValue({
      manifest: {
        formId: "form-123",
        formBlobId: "__bundled_form__",
      },
      form: createFormFixture(),
    });
    const result = await publishForm({
      t: createTranslate(),
      form: createFormFixture({ encryptSubmissions: true }),
      selectedProject: null,
      setPublishStageIndex: vi.fn(),
      setPublishBlobId: vi.fn(),
      setPublishStorageMode: vi.fn(),
      setPublishResultNote: vi.fn(),
      setPublishActiveStageStatus: vi.fn(),
      setPublishActiveStageDetail: vi.fn(),
      setProjectState: vi.fn(),
      shouldContinue: () => true,
    });

    expect(result?.manifestBlobId).toBe("manifest-blob-1");
    expect(mockSaveFormMetadataOverlay).toHaveBeenCalledTimes(1);
  });

  it("keeps publish successful even if manifest verification fails after blob upload", async () => {
    mockSaveForm.mockResolvedValue({
      blobId: "manifest-blob-1",
      manifestBlobId: "manifest-blob-1",
    });
    mockVerifyWalrusBlob.mockResolvedValue("failed");

    const setPublishResultNote = vi.fn();

    const result = await publishForm({
      t: createTranslate(),
      form: createFormFixture(),
      selectedProject: null,
      setPublishStageIndex: vi.fn(),
      setPublishBlobId: vi.fn(),
      setPublishStorageMode: vi.fn(),
      setPublishResultNote,
      setPublishActiveStageStatus: vi.fn(),
      setPublishActiveStageDetail: vi.fn(),
      setProjectState: vi.fn(),
      shouldContinue: () => true,
    });

    expect(result?.manifestBlobId).toBe("manifest-blob-1");
    expect(setPublishResultNote).toHaveBeenCalledWith("publishManifestVerificationDeferred");
    expect(mockDeleteFormsFromLocalCache).not.toHaveBeenCalled();
  });

  it("reports upload failure before any registry update", async () => {
    mockSaveForm.mockRejectedValue(new Error("Walrus upload failed: relay returned 503"));

    await expect(
      publishForm({
        t: createTranslate(),
        form: createFormFixture(),
        selectedProject: null,
        setPublishStageIndex: vi.fn(),
        setPublishBlobId: vi.fn(),
        setPublishStorageMode: vi.fn(),
        setPublishResultNote: vi.fn(),
        setPublishActiveStageStatus: vi.fn(),
        setPublishActiveStageDetail: vi.fn(),
        setProjectState: vi.fn(),
        shouldContinue: () => true,
      }),
    ).rejects.toMatchObject({
      uploadSucceeded: false,
      registryUpdated: false,
    });
    expect(mockDeleteFormsFromLocalCache).not.toHaveBeenCalled();
  });

  it("times out manifest verification without discarding the saved blob state", async () => {
    vi.useFakeTimers();
    mockSaveForm.mockResolvedValue({
      blobId: "manifest-blob-1",
      manifestBlobId: "manifest-blob-1",
    });
    mockVerifyWalrusBlob.mockImplementation(() => new Promise(() => undefined));

    const setPublishResultNote = vi.fn();

    const publishPromise = publishForm({
      t: createTranslate(),
      form: createFormFixture(),
      selectedProject: null,
      setPublishStageIndex: vi.fn(),
      setPublishBlobId: vi.fn(),
      setPublishStorageMode: vi.fn(),
      setPublishResultNote,
      setPublishActiveStageStatus: vi.fn(),
      setPublishActiveStageDetail: vi.fn(),
      setProjectState: vi.fn(),
      shouldContinue: () => true,
    });

    await vi.advanceTimersByTimeAsync(12_500);
    const result = await publishPromise;

    expect(result?.manifestBlobId).toBe("manifest-blob-1");
    expect(setPublishResultNote).toHaveBeenCalledWith("publishManifestVerificationTimedOut");
    expect(mockDeleteFormsFromLocalCache).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
