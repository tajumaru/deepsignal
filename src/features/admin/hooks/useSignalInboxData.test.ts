import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectSummary } from "../../../lib/projectRegistry";
import type { CapabilityProfile } from "../../../hooks/useAccessControl";
import type { FormSchema, Submission } from "../../../types";
import {
  createShadowForm,
  matchesStream,
  mergeFormsWithProjectRegistry,
  requiresReview,
  useSignalInboxData,
  type FormWithCount,
} from "./useSignalInboxData";

const mockUseProjectRegistry = vi.fn();
const mockListForms = vi.fn();
const mockListSubmissions = vi.fn();
const mockFetchJsonBlob = vi.fn();
const mockReadManifestWithForm = vi.fn();

vi.mock("@mysten/dapp-kit", () => ({
  useSuiClient: () => ({
    getObject: vi.fn(),
  }),
}));

vi.mock("../../../hooks/useProjectRegistry", () => ({
  useProjectRegistry: (...args: unknown[]) => mockUseProjectRegistry(...args),
}));

vi.mock("../../../lib/walrus", () => ({
  fetchJsonBlob: (...args: unknown[]) => mockFetchJsonBlob(...args),
  readManifestWithForm: (...args: unknown[]) => mockReadManifestWithForm(...args),
}));

vi.mock("../../../lib/storage", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/storage")>("../../../lib/storage");
  return {
    ...actual,
    storageAdapter: {
      ...actual.storageAdapter,
      listForms: (...args: unknown[]) => mockListForms(...args),
      listSubmissions: (...args: unknown[]) => mockListSubmissions(...args),
    },
  };
});

vi.mock("../../../lib/projectRegistry", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/projectRegistry")>("../../../lib/projectRegistry");
  return {
    ...actual,
    getSelectedProjectId: () => null,
    subscribeProjectRegistryStorageChange: () => () => undefined,
  };
});

vi.mock("../../../storage/submissionDelivery", async () => {
  const actual = await vi.importActual<typeof import("../../../storage/submissionDelivery")>(
    "../../../storage/submissionDelivery",
  );
  return {
    ...actual,
    fetchRemoteSubmissionIndex: vi.fn().mockResolvedValue([]),
    getRemoteSubmissionIndexSource: vi.fn().mockReturnValue(""),
    writeOwnerSubmissionIndexFetchLog: vi.fn(),
  };
});

function createProject(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    objectId: "0xproject-1",
    name: "Project One",
    owner: "0xowner-1",
    admins: [],
    reviewers: [],
    members: [],
    formsCount: 1,
    signalsCount: 0,
    onchainForms: [],
    onchainSignals: [],
    createdAt: "2026-05-23T00:00:00.000Z",
    ...overrides,
  };
}

function createForm(overrides: Partial<FormSchema> = {}): FormWithCount {
  return {
    id: "form-1",
    title: "Local form",
    description: "Local cache form",
    fields: [],
    sections: [],
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    ownerAddress: "0xowner-1",
    creationMode: "admin",
    submissionCount: 0,
    ...overrides,
  };
}

function createCapabilityProfile(overrides: Partial<CapabilityProfile> = {}): CapabilityProfile {
  return {
    isConfigured: true,
    packageId: "0xpackage",
    registryId: "0xregistry",
    hasOwnerCap: true,
    hasAdminCap: false,
    hasReviewerCap: false,
    ownerCapIds: ["0xowner-cap"],
    adminCapIds: [],
    reviewerCapIds: [],
    ...overrides,
  };
}

function createSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "submission-local-1",
    formId: "form-1",
    answers: { summary: "Needs follow-up" },
    attachments: [],
    category: "general",
    status: "unread",
    priority: "medium",
    triageStatus: "new",
    tags: [],
    notes: "",
    isEncrypted: true,
    receiptBlobId: "blob-shared-1",
    pendingOnchainRegistration: true,
    createdAt: "2026-05-23T01:00:00.000Z",
    updatedAt: "2026-05-23T01:00:00.000Z",
    ...overrides,
  };
}

describe("mergeFormsWithProjectRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectRegistry.mockReturnValue({
      projects: [],
      dataUpdatedAt: 0,
    });
    mockListForms.mockResolvedValue([]);
    mockListSubmissions.mockResolvedValue([]);
    mockFetchJsonBlob.mockResolvedValue(null);
    mockReadManifestWithForm.mockResolvedValue({ manifest: {}, form: null });
  });

  it("adds shadow forms for on-chain project forms when local cache is empty", () => {
    const project = createProject({
      objectId: "0xproject-a",
      owner: "0xowner-a",
      onchainForms: [
        {
          formId: 7,
          title: "Recovered chain form",
          metadataDigest: "digest-7",
          active: true,
          createdAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      onchainSignals: [
        {
          signalId: 99,
          formId: 7,
          walrusBlobId: "blob-99",
          metadataDigest: "signal-digest-99",
          encrypted: true,
          status: "new",
          createdAt: "2026-05-22T01:00:00.000Z",
        },
      ],
    });

    const merged = mergeFormsWithProjectRegistry([], [project], null);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "onchain:0xproject-a:7",
      projectId: "0xproject-a",
      onchainFormId: 7,
      isOnchain: true,
      submissionCount: 1,
    });
  });

  it("does not duplicate forms already represented in local cache", () => {
    const project = createProject({
      objectId: "0xproject-a",
      onchainForms: [
        {
          formId: 7,
          title: "Recovered chain form",
          metadataDigest: "digest-7",
          active: true,
          createdAt: "2026-05-22T00:00:00.000Z",
        },
      ],
    });
    const localForm = createForm({
      id: "local-form-7",
      projectId: "0xproject-a",
      onchainFormId: 7,
    });

    const merged = mergeFormsWithProjectRegistry([localForm], [project], null);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("local-form-7");
  });

  it("keeps the preferred project shadow forms first when rebuilding from registry", () => {
    const preferredProject = createProject({
      objectId: "0xpreferred",
      name: "Preferred",
      onchainForms: [
        {
          formId: 1,
          title: "Preferred form",
          metadataDigest: "digest-1",
          active: true,
        },
      ],
    });
    const otherProject = createProject({
      objectId: "0xother",
      name: "Other",
      onchainForms: [
        {
          formId: 2,
          title: "Other form",
          metadataDigest: "digest-2",
          active: true,
        },
      ],
    });

    const merged = mergeFormsWithProjectRegistry([], [otherProject, preferredProject], preferredProject);

    expect(merged.map((form) => form.id)).toEqual([
      createShadowForm(preferredProject, preferredProject.onchainForms?.[0], 1).id,
      createShadowForm(otherProject, otherProject.onchainForms?.[0], 2).id,
    ]);
  });

  it("keeps one visible signal after Sui registration when the on-chain signal matches a pending local signal", async () => {
    const localForm = createForm({
      id: "form-1",
      projectId: "0xproject-a",
      projectName: "Project A",
      onchainFormId: 7,
    });
    const localSubmission = createSubmission();
    const project = createProject({
      objectId: "0xproject-a",
      name: "Project A",
      onchainForms: [
        {
          formId: 7,
          title: "Recovered chain form",
          metadataDigest: "digest-form-7",
          active: true,
          createdAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      onchainSignals: [
        {
          signalId: 99,
          formId: 7,
          walrusBlobId: "blob-shared-1",
          metadataDigest: "signal-digest-99",
          encrypted: true,
          status: "new",
          createdAt: "2026-05-23T01:00:05.000Z",
        },
      ],
    });

    mockUseProjectRegistry.mockReturnValue({
      projects: [project],
      dataUpdatedAt: 1,
    });
    mockListForms.mockResolvedValue([localForm]);
    mockListSubmissions.mockResolvedValue([localSubmission]);

    const { result } = renderHook(() =>
      useSignalInboxData({
        accountAddress: "0xowner-1",
        capabilityProfile: createCapabilityProfile(),
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.visibleSignals).toHaveLength(1));

    expect(mockFetchJsonBlob).not.toHaveBeenCalled();
    expect(result.current.visibleSignals).toHaveLength(1);
    expect(result.current.visibleSignals[0].submission.id).toBe("submission-local-1");
    expect(result.current.visibleSignals[0].submission.pendingOnchainRegistration).toBe(false);
    expect(result.current.visibleSignals[0].submission.onchainSignalId).toBe(99);
    expect(result.current.visibleSignals[0].submission.signalReceiptMetadataDigest).toBe("signal-digest-99");
    expect(result.current.visibleSignals[0].submission.onchainStatus).toBe("new");
    expect(result.current.signalIndex.counts.registeredSui).toBe(1);
    expect(result.current.signalIndex.counts.pendingSui).toBe(0);
  });

  it("loads submissions for forms restored from a project manifest during the same inbox refresh", async () => {
    const restoredForm = createForm({
      id: "form-restored",
      title: "Restored Walrus channel",
      projectId: "0xproject-a",
      projectName: "Project A",
      onchainFormId: 7,
      manifestBlobId: "manifest-7",
    });
    const restoredSubmission = createSubmission({
      id: "submission-restored-1",
      formId: "form-restored",
      receiptBlobId: "blob-restored-1",
      pendingOnchainRegistration: false,
    });
    const project = createProject({
      objectId: "0xproject-a",
      name: "Project A",
      onchainForms: [
        {
          formId: 7,
          title: "Restored Walrus channel",
          metadataDigest: "digest-form-7",
          manifestBlobId: "manifest-7",
          active: true,
          createdAt: "2026-05-22T00:00:00.000Z",
        },
      ],
    });

    mockUseProjectRegistry.mockReturnValue({
      projects: [project],
      dataUpdatedAt: 1,
    });
    mockListForms.mockResolvedValue([]);
    mockReadManifestWithForm.mockResolvedValue({
      manifest: { formBlobId: "__bundled_form__" },
      form: restoredForm,
    });
    mockListSubmissions.mockImplementation((formId: string) =>
      Promise.resolve(formId === "form-restored" ? [restoredSubmission] : []),
    );

    const { result } = renderHook(() =>
      useSignalInboxData({
        accountAddress: "0xowner-1",
        capabilityProfile: createCapabilityProfile(),
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() =>
      expect(result.current.forms.some((form) => form.id === "form-restored")).toBe(true),
    );
    await waitFor(() =>
      expect(result.current.visibleSignals.some((record) => record.submission.id === "submission-restored-1")).toBe(
        true,
      ),
    );

    expect(mockListSubmissions).toHaveBeenCalledWith("form-restored");
    expect(result.current.forms.find((form) => form.id === "form-restored")?.submissionCount).toBe(1);
  });
});

describe("processing mode stream routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectRegistry.mockReturnValue({
      projects: [],
      dataUpdatedAt: 0,
    });
    mockListForms.mockResolvedValue([]);
    mockListSubmissions.mockResolvedValue([]);
    mockFetchJsonBlob.mockResolvedValue(null);
    mockReadManifestWithForm.mockResolvedValue({ manifest: {}, form: null });
  });

  it("keeps auto-process signals in all signals while excluding them from review queues", () => {
    const form = createForm({
      processingMode: "auto_process",
    });
    const submission = createSubmission({
      processingMode: "auto_process",
      reviewState: "not_required",
      visibilityState: "aggregate_only",
      insightEligibility: "eligible",
      isEncrypted: false,
      pendingOnchainRegistration: false,
    });
    const record = {
      form,
      submission,
      category: "Survey",
      searchText: "survey aggregate",
    } satisfies Parameters<typeof requiresReview>[0];

    expect(requiresReview(record)).toBe(false);
    expect(matchesStream(record, "needs_review")).toBe(false);
    expect(matchesStream(record, "unread")).toBe(false);
    expect(matchesStream(record, "unresolved")).toBe(false);
    expect(matchesStream(record, "all")).toBe(true);
  });

  it("routes system errors only into the System Alerts stream", () => {
    const form = createForm({
      id: "system:deepsignal-runtime",
      title: "DeepSignal System Alerts",
    });
    const submission = createSubmission({
      id: "system-error-1",
      formId: "system:deepsignal-runtime",
      kind: "system_error",
      source: "deepsignal-runtime",
      systemSeverity: "critical",
      severity: "critical",
      isEncrypted: false,
      pendingOnchainRegistration: false,
      metadata: {
        systemDiagnostics: {
          errorName: "ChunkLoadError",
          routePath: "/admin",
          buildVersion: "0.12.16",
        },
      },
    });
    const record = {
      form,
      submission,
      category: "System",
      searchText: "chunk load error",
    } satisfies Parameters<typeof requiresReview>[0];

    expect(matchesStream(record, "system")).toBe(true);
    expect(matchesStream(record, "needs_review")).toBe(false);
    expect(matchesStream(record, "unread")).toBe(false);
    expect(matchesStream(record, "high")).toBe(false);
    expect(matchesStream(record, "bug")).toBe(false);
    expect(matchesStream(record, "all")).toBe(true);
  });

  it("keeps auto-process submissions visible without incrementing review workload counts", async () => {
    const form = createForm({
      processingMode: "auto_process",
    });
    const submission = createSubmission({
      processingMode: "auto_process",
      reviewState: "not_required",
      visibilityState: "aggregate_only",
      insightEligibility: "eligible",
      isEncrypted: false,
      pendingOnchainRegistration: false,
    });

    mockUseProjectRegistry.mockReturnValue({
      projects: [],
      dataUpdatedAt: 1,
    });
    mockListForms.mockResolvedValue([form]);
    mockListSubmissions.mockResolvedValue([submission]);

    const { result } = renderHook(() =>
      useSignalInboxData({
        accountAddress: "0xowner-1",
        capabilityProfile: createCapabilityProfile(),
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.allSignals).toHaveLength(1));

    expect(result.current.signalIndex.counts.needsReview).toBe(0);
    expect(result.current.signalIndex.counts.unread).toBe(0);
    expect(result.current.signalIndex.counts.unresolved).toBe(0);
    expect(result.current.visibleSignals).toHaveLength(1);
  });

  it("counts system errors separately from responder review workload", async () => {
    const form = createForm({
      id: "system:deepsignal-runtime",
      title: "DeepSignal System Alerts",
    });
    const submission = createSubmission({
      id: "system-error-1",
      formId: "system:deepsignal-runtime",
      kind: "system_error",
      source: "deepsignal-runtime",
      systemSeverity: "error",
      severity: "error",
      isEncrypted: false,
      pendingOnchainRegistration: false,
    });

    mockUseProjectRegistry.mockReturnValue({
      projects: [],
      dataUpdatedAt: 1,
    });
    mockListForms.mockResolvedValue([form]);
    mockListSubmissions.mockResolvedValue([submission]);

    const { result } = renderHook(() =>
      useSignalInboxData({
        accountAddress: "0xowner-1",
        capabilityProfile: createCapabilityProfile(),
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.allSignals).toHaveLength(1));

    expect(result.current.signalIndex.counts.system).toBe(1);
    expect(result.current.signalIndex.counts.needsReview).toBe(0);
    expect(result.current.signalIndex.counts.unread).toBe(0);
    expect(result.current.signalIndex.counts.high).toBe(0);
  });
});
