import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DecryptDiagnosticError } from "../../../crypto/decryptDiagnostics";
import type { CapabilityProfile } from "../../../hooks/useAccessControl";
import { SEAL_PERMISSION_DENIED_MESSAGE } from "../../../lib/seal";
import type { FormSchema, Submission } from "../../../types";
import type { SignalRecord } from "./useSignalInboxData";
import { usePrivateSignalDecrypt } from "./usePrivateSignalDecrypt";
import { resolveSubmissionAnswers } from "../../../lib/storage";

type ToastSetter = (toast: { tone: "success" | "error"; message: string } | null) => void;

vi.mock("@mysten/dapp-kit", () => ({
  useSuiClient: () => ({ name: "sui-client" }),
  useSignPersonalMessage: () => ({
    mutateAsync: vi.fn(async () => ({ signature: "signature" })),
  }),
}));

vi.mock("../../../lib/storage", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/storage")>("../../../lib/storage");
  return {
    ...actual,
    resolveSubmissionAnswers: vi.fn(),
  };
});

const mockedResolveSubmissionAnswers = vi.mocked(resolveSubmissionAnswers);

const form: FormSchema = {
  id: "form-1",
  title: "Private feedback",
  description: "",
  createdAt: new Date(0).toISOString(),
  ownerAddress: "0xowner",
  projectId: "0xproject",
  fields: [
    {
      id: "answer",
      type: "shortText",
      label: "Answer",
      required: false,
      sensitive: true,
    },
  ],
};

function capabilityProfile(overrides: Partial<CapabilityProfile> = {}): CapabilityProfile {
  return {
    isConfigured: true,
    packageId: "0xpackage",
    registryId: "0xregistry",
    hasOwnerCap: false,
    hasAdminCap: false,
    hasReviewerCap: true,
    ownerCapIds: [],
    adminCapIds: [],
    reviewerCapIds: ["0xreviewer-cap"],
    ...overrides,
  };
}

function submission(id: string, overrides: Partial<Submission> = {}): Submission {
  return {
    id,
    formId: form.id,
    answers: {},
    attachments: [],
    category: "general",
    status: "unread",
    priority: "medium",
    triageStatus: "new",
    tags: [],
    notes: "",
    isEncrypted: true,
    encryptedPayload: "seal-envelope",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function record(item: Submission, nextForm: FormSchema = form): SignalRecord {
  return {
    form: { ...nextForm, submissionCount: 1 },
    submission: item,
    category: "General",
    searchText: "",
  };
}

function renderDecryptHook(args?: {
  selectedRecord?: SignalRecord | null;
  selectedSignalId?: string;
  profile?: CapabilityProfile;
  wallet?: string | null;
  setToast?: ToastSetter;
}) {
  const setToast = (args?.setToast ?? vi.fn()) as ToastSetter & ReturnType<typeof vi.fn>;
  return {
    setToast,
    ...renderHook(
      (props: {
        selectedRecord: SignalRecord | null;
        selectedSignalId: string;
        profile: CapabilityProfile;
        wallet?: string | null;
      }) =>
        usePrivateSignalDecrypt({
          accountAddress: props.wallet,
          capabilityProfile: props.profile,
          ownedCapabilityObjects: [],
          selectedRecord: props.selectedRecord,
          selectedSignalId: props.selectedSignalId,
          setToast,
          decryptFailedLabel: "Decryption failed.",
        }),
      {
        initialProps: {
          selectedRecord: args?.selectedRecord ?? record(submission("submission-1")),
          selectedSignalId: args?.selectedSignalId ?? "submission-1",
          profile: args?.profile ?? capabilityProfile(),
          wallet: args?.wallet ?? "0xreviewer",
        },
      },
    ),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("usePrivateSignalDecrypt", () => {
  beforeEach(() => {
    mockedResolveSubmissionAnswers.mockReset();
  });

  it("decrypts through the shared resolver with reviewer capability context", async () => {
    mockedResolveSubmissionAnswers.mockResolvedValue({
      answers: { answer: "private answer" },
      attachments: [],
      legacyUnencrypted: false,
    });
    const { result, setToast } = renderDecryptHook();

    await act(async () => {
      await result.current.handleDecrypt();
    });

    expect(mockedResolveSubmissionAnswers).toHaveBeenCalledWith(
      expect.objectContaining({ id: "form-1" }),
      expect.objectContaining({ id: "submission-1" }),
      undefined,
      expect.objectContaining({
        walletAddress: "0xreviewer",
        projectId: "0xproject",
        ownerAddress: "0xowner",
        reviewerCapId: "0xreviewer-cap",
      }),
    );
    expect(result.current.decryptState).toBe("decrypted");
    expect(result.current.detailAnswers).toEqual({ answer: "private answer" });
    expect(setToast).toHaveBeenCalledWith({
      tone: "success",
      message: "Wallet verified. Private signal unlocked.",
    });
  });

  it("does not pass a reviewer cap for owner/admin capability holders", async () => {
    mockedResolveSubmissionAnswers.mockResolvedValue({
      answers: { answer: "admin answer" },
      attachments: [],
      legacyUnencrypted: false,
    });
    const { result } = renderDecryptHook({
      profile: capabilityProfile({
        hasAdminCap: true,
        hasReviewerCap: true,
        adminCapIds: ["0xadmin-cap"],
        reviewerCapIds: ["0xreviewer-cap"],
      }),
      wallet: "0xadmin",
    });

    await act(async () => {
      await result.current.handleDecrypt();
    });

    expect(mockedResolveSubmissionAnswers).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      expect.objectContaining({ reviewerCapId: undefined }),
    );
  });

  it("passes owner-wallet decrypt context for personal forms", async () => {
    mockedResolveSubmissionAnswers.mockResolvedValue({
      answers: { answer: "owner answer" },
      attachments: [],
      legacyUnencrypted: false,
    });
    const personalForm: FormSchema = {
      ...form,
      projectId: undefined,
      ownerAddress: "0xowner",
    };
    const { result } = renderDecryptHook({
      selectedRecord: record(submission("owner-submission"), personalForm),
      selectedSignalId: "owner-submission",
      profile: capabilityProfile({
        hasReviewerCap: false,
        reviewerCapIds: [],
      }),
      wallet: "0xowner",
    });

    await act(async () => {
      await result.current.handleDecrypt();
    });

    expect(mockedResolveSubmissionAnswers).toHaveBeenCalledWith(
      expect.objectContaining({ ownerAddress: "0xowner", projectId: undefined }),
      expect.objectContaining({ id: "owner-submission" }),
      undefined,
      expect.objectContaining({
        walletAddress: "0xowner",
        projectId: undefined,
        ownerAddress: "0xowner",
        reviewerCapId: undefined,
      }),
    );
    expect(result.current.detailAnswers).toEqual({ answer: "owner answer" });
  });

  it("exposes plaintext answers for unencrypted selected records without calling decrypt", () => {
    const openSubmission = submission("open-submission", {
      isEncrypted: false,
      encryptedPayload: undefined,
      answers: { answer: "open answer" },
      attachments: [
        {
          fieldId: "answer",
          name: "note.txt",
          type: "document",
          blobId: "blob-note",
          size: 12,
          storage: "blob",
        },
      ],
    });
    const { result } = renderDecryptHook({
      selectedRecord: record(openSubmission),
      selectedSignalId: "open-submission",
    });

    expect(result.current.decryptState).toBe("decrypted");
    expect(result.current.detailAnswers).toEqual({ answer: "open answer" });
    expect(result.current.detailAttachments).toEqual(openSubmission.attachments);
    expect(mockedResolveSubmissionAnswers).not.toHaveBeenCalled();
  });

  it("reflects resolver status changes while decrypting", async () => {
    const pending = deferred<{
      answers: Record<string, unknown>;
      attachments: Submission["attachments"];
      legacyUnencrypted: boolean;
    }>();
    mockedResolveSubmissionAnswers.mockImplementation(async (_form, _submission, _seal, context) => {
      context?.onStatusChange?.("waiting_wallet_approval");
      return pending.promise;
    });
    const { result } = renderDecryptHook();

    void act(() => {
      void result.current.handleDecrypt();
    });

    await waitFor(() => {
      expect(result.current.decryptState).toBe("waiting_wallet_approval");
      expect(result.current.decryptStatusMessage).toBe("Requesting wallet approval");
    });

    await act(async () => {
      pending.resolve({
        answers: { answer: "approved answer" },
        attachments: [],
        legacyUnencrypted: false,
      });
      await pending.promise;
    });

    expect(result.current.decryptState).toBe("decrypted");
    expect(result.current.decryptStatusMessage).toBe("Signal unlocked");
    expect(result.current.detailAnswers).toEqual({ answer: "approved answer" });
  });

  it("reports unauthorized wallets without exposing stale decrypted data", async () => {
    mockedResolveSubmissionAnswers.mockRejectedValue(
      new DecryptDiagnosticError("UNAUTHORIZED_WALLET", SEAL_PERMISSION_DENIED_MESSAGE, {
        formId: "form-1",
        responseId: "submission-1",
      }),
    );
    const { result } = renderDecryptHook({ wallet: "0xoutsider" });

    await act(async () => {
      await result.current.handleDecrypt();
    });

    expect(result.current.decryptState).toBe("unauthorized");
    expect(result.current.decryptError).toBe("This wallet is not authorized to decrypt this response.");
    expect(result.current.detailAnswers).toBeNull();
  });

  it("decrypts multiple records and reuses cached answers when a signal is selected", async () => {
    mockedResolveSubmissionAnswers.mockImplementation(async (_form, item) => ({
      answers: { answer: `answer-${item.id}` },
      attachments: [],
      legacyUnencrypted: false,
    }));
    const first = record(submission("submission-1"));
    const second = record(submission("submission-2"));
    const { result, rerender } = renderDecryptHook({
      selectedRecord: first,
      selectedSignalId: "submission-1",
    });

    await act(async () => {
      await result.current.handleDecryptRecords([first, second]);
    });

    expect(mockedResolveSubmissionAnswers).toHaveBeenCalledTimes(2);
    expect(result.current.decryptedSignalsById["submission-1"].answers).toEqual({
      answer: "answer-submission-1",
    });
    expect(result.current.decryptedSignalsById["submission-2"].answers).toEqual({
      answer: "answer-submission-2",
    });
    expect(result.current.bulkDecryptProgress).toEqual({ completed: 2, failed: 0, total: 2 });

    rerender({
      selectedRecord: second,
      selectedSignalId: "submission-2",
      profile: capabilityProfile(),
      wallet: "0xreviewer",
    });

    await waitFor(() => {
      expect(result.current.detailAnswers).toEqual({ answer: "answer-submission-2" });
    });
    expect(mockedResolveSubmissionAnswers).toHaveBeenCalledTimes(2);
  });

  it("ignores an old decrypt result after selecting another signal", async () => {
    const pending = deferred<{
      answers: Record<string, unknown>;
      attachments: Submission["attachments"];
      legacyUnencrypted: boolean;
    }>();
    mockedResolveSubmissionAnswers.mockReturnValue(pending.promise);
    const first = record(submission("submission-1"));
    const second = record(submission("submission-2"));
    const { result, rerender } = renderDecryptHook({
      selectedRecord: first,
      selectedSignalId: "submission-1",
    });

    void act(() => {
      void result.current.handleDecrypt();
    });
    await waitFor(() => expect(result.current.decrypting).toBe(true));

    rerender({
      selectedRecord: second,
      selectedSignalId: "submission-2",
      profile: capabilityProfile(),
      wallet: "0xreviewer",
    });

    await act(async () => {
      pending.resolve({
        answers: { answer: "old answer" },
        attachments: [],
        legacyUnencrypted: false,
      });
      await pending.promise;
    });

    expect(result.current.detailAnswers).toBeNull();
    expect(result.current.decryptState).toBe("locked");
  });

  it("keeps cancelled decrypt results from unlocking the signal", async () => {
    const pending = deferred<{
      answers: Record<string, unknown>;
      attachments: Submission["attachments"];
      legacyUnencrypted: boolean;
    }>();
    mockedResolveSubmissionAnswers.mockReturnValue(pending.promise);
    const { result } = renderDecryptHook();

    void act(() => {
      void result.current.handleDecrypt();
    });
    await waitFor(() => expect(result.current.decrypting).toBe(true));

    act(() => {
      result.current.handleCancelDecrypt();
    });

    await act(async () => {
      pending.resolve({
        answers: { answer: "cancelled answer" },
        attachments: [],
        legacyUnencrypted: false,
      });
      await pending.promise;
    });

    expect(result.current.detailAnswers).toBeNull();
    expect(result.current.decryptState).toBe("locked");
    expect(result.current.decrypting).toBe(false);
  });
});
