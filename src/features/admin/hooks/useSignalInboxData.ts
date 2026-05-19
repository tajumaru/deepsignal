import { useEffect, useMemo, useRef, useState } from "react";
import { canReviewForm } from "../../../lib/adminAccess";
import { fetchJsonBlob } from "../../../lib/walrus";
import { useProjectRegistry } from "../../../hooks/useProjectRegistry";
import {
  getSignalPreview,
  getSignalSubject,
  inferSignalCategory,
  type SignalCategory,
} from "../../../lib/signalInbox";
import type {
  OnchainProjectFormSummary,
  OnchainProjectSignalSummary,
  ProjectSummary,
} from "../../../lib/projectRegistry";
import {
  normalizeForm,
  normalizeSubmission,
  storageAdapter,
} from "../../../lib/storage";
import { flattenAnswer } from "../../../lib/utils";
import type { CapabilityProfile } from "../../../hooks/useAccessControl";
import type { FormSchema, Submission } from "../../../types";

export interface FormWithCount extends FormSchema {
  submissionCount: number;
}

export type StreamId =
  | "all"
  | "needs_review"
  | "unread"
  | "encrypted"
  | "high"
  | "pending_sui"
  | "registered_sui"
  | "bug"
  | "feature"
  | "archived";

export interface SignalRecord {
  form: FormWithCount;
  submission: Submission;
  category: SignalCategory;
  searchText: string;
}

const ADMIN_SUBMISSION_BATCH_SIZE = 4;
const ONCHAIN_SIGNAL_BATCH_SIZE = 4;

function buildOnchainShadowFormId(projectId: string, onchainFormId: number) {
  return `onchain:${projectId}:${onchainFormId}`;
}

function buildOnchainShadowSignalId(projectId: string, signalId: number) {
  return `onchain:${projectId}:${signalId}`;
}

function createShadowForm(
  project: ProjectSummary,
  onchainForm: OnchainProjectFormSummary | undefined,
  onchainFormId: number,
): FormWithCount {
  return {
    id: buildOnchainShadowFormId(project.objectId, onchainFormId),
    title: onchainForm?.title || `${project.name} signal stream`,
    description: "Recovered from on-chain project registry.",
    fields: [],
    sections: [],
    createdAt: onchainForm?.createdAt ?? project.createdAt ?? new Date(0).toISOString(),
    updatedAt: onchainForm?.createdAt ?? project.createdAt ?? new Date(0).toISOString(),
    ownerAddress: project.owner,
    creationMode: "admin",
    isOnchain: true,
    encryptSubmissions: true,
    projectId: project.objectId,
    projectName: project.name,
    onchainFormId,
    formMetadataDigest: onchainForm?.metadataDigest,
    registrationMode: "sui",
    submissionCount: 0,
  } satisfies FormWithCount;
}

function mapOnchainStatusToSubmissionState(status: OnchainProjectSignalSummary["status"]) {
  if (status === "archived") {
    return {
      status: "archived" as const,
      triageStatus: "closed" as const,
      priority: "medium" as const,
    };
  }
  if (status === "triaged") {
    return {
      status: "read" as const,
      triageStatus: "investigating" as const,
      priority: "medium" as const,
    };
  }
  return {
    status: "unread" as const,
    triageStatus: "new" as const,
    priority: "medium" as const,
  };
}

function unwrapWalrusSubmissionPayload(
  payload: unknown,
  fallbackSignal: OnchainProjectSignalSummary,
  formId: string,
): Submission | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (
    "kind" in payload &&
    (payload as { kind?: unknown }).kind === "submissionBundle" &&
    "submission" in payload &&
    (payload as { submission?: unknown }).submission &&
    typeof (payload as { submission?: unknown }).submission === "object"
  ) {
    return normalizeSubmission({
      ...((payload as { submission: Record<string, unknown> }).submission),
      formId,
    } as Record<string, unknown> & { id: string; formId: string; createdAt: string });
  }

  if ("id" in payload && "createdAt" in payload) {
    return normalizeSubmission({
      ...(payload as Record<string, unknown>),
      formId,
    } as Record<string, unknown> & { id: string; formId: string; createdAt: string });
  }

  const fallbackState = mapOnchainStatusToSubmissionState(fallbackSignal.status);
  return normalizeSubmission({
    id: buildOnchainShadowSignalId(formId, fallbackSignal.signalId),
    formId,
    createdAt: fallbackSignal.createdAt ?? new Date(0).toISOString(),
    updatedAt: fallbackSignal.createdAt ?? new Date(0).toISOString(),
    answers: {},
    attachments: [],
    isEncrypted: fallbackSignal.encrypted,
    status: fallbackState.status,
    triageStatus: fallbackState.triageStatus,
    priority: fallbackState.priority,
    tags: [],
    notes: "",
    receiptBlobId: fallbackSignal.walrusBlobId,
    onchainSignalId: fallbackSignal.signalId,
    signalReceiptMetadataDigest: fallbackSignal.metadataDigest,
    onchainStatus: fallbackSignal.status,
    sealIdentity: fallbackSignal.sealIdentity,
    respondentMeta: fallbackSignal.submitter
      ? {
          walletAddress: fallbackSignal.submitter,
          chain: "sui",
          submittedAt: fallbackSignal.createdAt ?? new Date(0).toISOString(),
          isAnonymous: false,
        }
      : undefined,
  });
}

function createFallbackOnchainSubmission(
  signal: OnchainProjectSignalSummary,
  formId: string,
  formTitle: string,
): Submission {
  const fallbackState = mapOnchainStatusToSubmissionState(signal.status);
  return normalizeSubmission({
    id: buildOnchainShadowSignalId(formId, signal.signalId),
    formId,
    createdAt: signal.createdAt ?? new Date(0).toISOString(),
    updatedAt: signal.createdAt ?? new Date(0).toISOString(),
    answers: {},
    attachments: [],
    isEncrypted: signal.encrypted,
    status: fallbackState.status,
    triageStatus: fallbackState.triageStatus,
    priority: fallbackState.priority,
    tags: ["onchain-recovered"],
    notes: "",
    receiptBlobId: signal.walrusBlobId,
    onchainSignalId: signal.signalId,
    signalReceiptMetadataDigest: signal.metadataDigest,
    onchainStatus: signal.status,
    sealIdentity: signal.sealIdentity,
    subjectPreview: signal.encrypted ? "Private signal" : `${formTitle} signal`,
    respondentMeta: signal.submitter
      ? {
          walletAddress: signal.submitter,
          chain: "sui",
          submittedAt: signal.createdAt ?? new Date(0).toISOString(),
          isAnonymous: false,
        }
      : undefined,
  });
}

export function matchesStream(record: SignalRecord, streamId: StreamId) {
  switch (streamId) {
    case "needs_review":
      return record.submission.status !== "archived";
    case "unread":
      return record.submission.status === "unread";
    case "encrypted":
      return record.submission.isEncrypted;
    case "high":
      return record.submission.priority === "high";
    case "pending_sui":
      return Boolean(record.submission.pendingOnchainRegistration);
    case "registered_sui":
      return typeof record.submission.onchainSignalId === "number";
    case "bug":
      return record.category === "Bug";
    case "feature":
      return record.category === "Feature";
    case "archived":
      return record.submission.status === "archived";
    default:
      return true;
  }
}

interface UseSignalInboxDataArgs {
  accountAddress?: string | null;
  capabilityProfile: CapabilityProfile;
}

export function useSignalInboxData({
  accountAddress,
  capabilityProfile,
}: UseSignalInboxDataArgs) {
  const { projects, dataUpdatedAt: projectsUpdatedAt } = useProjectRegistry(accountAddress);
  const [forms, setForms] = useState<FormWithCount[]>([]);
  const [submissionsByFormId, setSubmissionsByFormId] = useState<Record<string, Submission[]>>({});
  const [supplementalSignals, setSupplementalSignals] = useState<SignalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setSubmissionsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedFormId, setSelectedFormId] = useState("all");
  const [selectedStreamId, setSelectedStreamId] = useState<StreamId>("all");
  const [selectedSignalId, setSelectedSignalId] = useState("");
  const [search, setSearch] = useState("");
  const loadConsoleRunRef = useRef(0);

  async function hydrateOnchainSignals(
    nextForms: FormWithCount[],
    nextSubmissions: Record<string, Submission[]>,
    runId: number,
  ) {
    if (projects.length === 0) {
      if (runId === loadConsoleRunRef.current) {
        setSupplementalSignals([]);
      }
      return;
    }

    const localFormsByOnchainKey = new Map<string, FormWithCount>();
    const localSignalKeys = new Set<string>();

    nextForms.forEach((form) => {
      if (form.projectId && typeof form.onchainFormId === "number") {
        localFormsByOnchainKey.set(`${form.projectId}:${form.onchainFormId}`, form);
      }
    });

    Object.entries(nextSubmissions).forEach(([formId, submissions]) => {
      const form = nextForms.find((entry) => entry.id === formId);
      if (!form?.projectId) {
        return;
      }
      submissions.forEach((submission) => {
        if (typeof submission.onchainSignalId === "number") {
          localSignalKeys.add(`${form.projectId}:${submission.onchainSignalId}`);
        }
      });
    });

    const candidates = projects.flatMap((project) =>
      (project.onchainSignals ?? []).flatMap((signal) => {
        const dedupeKey = `${project.objectId}:${signal.signalId}`;
        if (localSignalKeys.has(dedupeKey)) {
          return [];
        }
        return [{ project, signal }];
      }),
    );

    if (candidates.length === 0) {
      if (runId === loadConsoleRunRef.current) {
        setSupplementalSignals([]);
      }
      return;
    }

    const hydratedRecords: SignalRecord[] = [];

    for (let index = 0; index < candidates.length; index += ONCHAIN_SIGNAL_BATCH_SIZE) {
      const batch = candidates.slice(index, index + ONCHAIN_SIGNAL_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async ({ project, signal }) => {
          const onchainForm = (project.onchainForms ?? []).find((entry) => entry.formId === signal.formId);
          const localForm =
            localFormsByOnchainKey.get(`${project.objectId}:${signal.formId}`) ?? null;
          const form = localForm ?? createShadowForm(project, onchainForm, signal.formId);
          const fallbackSubmission = createFallbackOnchainSubmission(signal, form.id, form.title);

          try {
            const payload = await fetchJsonBlob<unknown>(signal.walrusBlobId);
            const hydratedSubmission =
              unwrapWalrusSubmissionPayload(payload, signal, form.id) ?? fallbackSubmission;
            const submission = normalizeSubmission({
              ...hydratedSubmission,
              formId: form.id,
              receiptBlobId: hydratedSubmission.receiptBlobId ?? signal.walrusBlobId,
              onchainSignalId: signal.signalId,
              signalReceiptMetadataDigest:
                hydratedSubmission.signalReceiptMetadataDigest ?? signal.metadataDigest,
              onchainStatus: signal.status,
              isEncrypted: signal.encrypted || hydratedSubmission.isEncrypted,
              sealIdentity: hydratedSubmission.sealIdentity ?? signal.sealIdentity,
              updatedAt: hydratedSubmission.updatedAt ?? hydratedSubmission.createdAt,
            });
            return {
              form: { ...form, submissionCount: Math.max(form.submissionCount, 1) },
              submission,
            };
          } catch (error) {
            console.warn(`Failed to hydrate on-chain signal ${signal.signalId} from Walrus`, error);
            return {
              form: { ...form, submissionCount: Math.max(form.submissionCount, 1) },
              submission: fallbackSubmission,
            };
          }
        }),
      );

      if (runId !== loadConsoleRunRef.current) {
        return;
      }

      batchResults.forEach(({ form, submission }) => {
        const category = inferSignalCategory(submission);
        hydratedRecords.push({
          form,
          submission,
          category,
          searchText: [
            form.title,
            getSignalSubject(submission),
            getSignalPreview(submission),
            flattenAnswer(submission.answers),
            submission.tags.join(" "),
            category,
            form.projectName ?? "",
          ]
            .join(" ")
            .toLowerCase(),
        });
      });
    }

    if (runId === loadConsoleRunRef.current) {
      setSupplementalSignals(hydratedRecords);
    }
  }

  async function loadConsole(preferredSignalId?: string) {
    const runId = loadConsoleRunRef.current + 1;
    loadConsoleRunRef.current = runId;
    setLoading(true);
    setSubmissionsLoading(false);
    setLoadError("");
    setSupplementalSignals([]);
    try {
      const allForms = await storageAdapter.listForms();
      if (runId !== loadConsoleRunRef.current) {
        return;
      }

      const nextForms = allForms.map((form) => ({ ...normalizeForm(form), submissionCount: 0 }));
      const nextAccessibleForms = nextForms.filter((form) => canReviewForm(form, accountAddress, capabilityProfile));
      setForms(nextForms);
      setSubmissionsByFormId({});
      setSelectedSignalId((current) => preferredSignalId ?? current);
      setLoading(false);

      if (nextAccessibleForms.length === 0) {
        await hydrateOnchainSignals(nextForms, {}, runId);
        return;
      }

      setSubmissionsLoading(true);
      const nextSubmissions: Record<string, Submission[]> = {};

      for (let index = 0; index < nextAccessibleForms.length; index += ADMIN_SUBMISSION_BATCH_SIZE) {
        const formBatch = nextAccessibleForms.slice(index, index + ADMIN_SUBMISSION_BATCH_SIZE);
        const batchResults = await Promise.all(
          formBatch.map(async (form) => {
            try {
              const raw = await storageAdapter.listSubmissions(form.id);
              return {
                formId: form.id,
                submissions: raw.map((submission) => normalizeSubmission(submission)),
              };
            } catch (error) {
              console.error(`Failed to load submissions for form ${form.id}`, error);
              return {
                formId: form.id,
                submissions: [] as Submission[],
              };
            }
          }),
        );

        if (runId !== loadConsoleRunRef.current) {
          return;
        }

        batchResults.forEach((result) => {
          nextSubmissions[result.formId] = result.submissions;
        });

        setSubmissionsByFormId((current) => ({
          ...current,
          ...Object.fromEntries(batchResults.map((result) => [result.formId, result.submissions])),
        }));
        setForms((current) =>
          current.map((form) => {
            const loaded = nextSubmissions[form.id];
            return loaded
              ? { ...form, submissionCount: loaded.length }
              : form;
          }),
        );
      }

      await hydrateOnchainSignals(nextForms, nextSubmissions, runId);
    } catch (error) {
      console.error("Failed to load admin console", error);
      setForms([]);
      setSubmissionsByFormId({});
      setSupplementalSignals([]);
      setLoadError(
        error instanceof Error
          ? `Failed to load Research Lab: ${error.message}`
          : "Failed to load Research Lab.",
      );
    } finally {
      if (runId === loadConsoleRunRef.current) {
        setSubmissionsLoading(false);
      }
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConsole();
    // loadConsole intentionally owns a fresh run id and reads the latest scoped state on refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accountAddress,
    capabilityProfile.hasOwnerCap,
    capabilityProfile.hasAdminCap,
    capabilityProfile.hasReviewerCap,
    capabilityProfile.isConfigured,
    projectsUpdatedAt,
  ]);

  const accessibleForms = useMemo(
    () =>
      forms.filter((form) => canReviewForm(form, accountAddress, capabilityProfile)),
    [accountAddress, capabilityProfile, forms],
  );

  useEffect(() => {
    if (selectedFormId === "all") {
      return;
    }
    if (!accessibleForms.some((form) => form.id === selectedFormId)) {
      setSelectedFormId("all");
    }
  }, [accessibleForms, selectedFormId]);

  const signalIndex = useMemo(() => {
    const signals: SignalRecord[] = [];
    const signalById: Record<string, SignalRecord | undefined> = {};
    const counts = {
      needsReview: 0,
      unread: 0,
      encrypted: 0,
      high: 0,
      pendingSui: 0,
      registeredSui: 0,
      archived: 0,
    };
    const unreadCountByFormId: Record<string, number> = {};
    const clusterCountById: Record<string, number> = {};
    const pendingSignalIdSet = new Set<string>();
    const seenOnchainSignals = new Set<string>();

    function appendRecord(record: SignalRecord) {
      signals.push(record);
      signalById[record.submission.id] = record;

      if (record.submission.status === "unread") {
        unreadCountByFormId[record.form.id] = (unreadCountByFormId[record.form.id] ?? 0) + 1;
        counts.unread += 1;
      }
      if (record.submission.status !== "archived") {
        counts.needsReview += 1;
      }
      if (record.submission.isEncrypted) {
        counts.encrypted += 1;
      }
      if (record.submission.priority === "high") {
        counts.high += 1;
      }
      if (record.submission.pendingOnchainRegistration) {
        counts.pendingSui += 1;
        pendingSignalIdSet.add(record.submission.id);
      }
      if (typeof record.submission.onchainSignalId === "number") {
        counts.registeredSui += 1;
        if (record.form.projectId) {
          seenOnchainSignals.add(`${record.form.projectId}:${record.submission.onchainSignalId}`);
        }
      }
      if (record.submission.status === "archived") {
        counts.archived += 1;
      }
      if (record.submission.clusterId) {
        clusterCountById[record.submission.clusterId] = (clusterCountById[record.submission.clusterId] ?? 0) + 1;
      }
    }

    for (const form of accessibleForms) {
      unreadCountByFormId[form.id] = unreadCountByFormId[form.id] ?? 0;
      const submissions = submissionsByFormId[form.id] ?? [];

      for (const submission of submissions) {
        const category = inferSignalCategory(submission);
        const record = {
          form,
          submission,
          category,
          searchText: [
            form.title,
            getSignalSubject(submission),
            getSignalPreview(submission),
            flattenAnswer(submission.answers),
            submission.tags.join(" "),
            category,
          ]
            .join(" ")
            .toLowerCase(),
        } satisfies SignalRecord;

        appendRecord(record);
      }
    }

    for (const record of supplementalSignals) {
      if (
        record.form.projectId &&
        typeof record.submission.onchainSignalId === "number" &&
        seenOnchainSignals.has(`${record.form.projectId}:${record.submission.onchainSignalId}`)
      ) {
        continue;
      }
      appendRecord(record);
    }

    return {
      signals,
      signalById,
      counts,
      unreadCountByFormId,
      clusterCountById,
      pendingSignalIdSet,
    };
  }, [accessibleForms, submissionsByFormId, supplementalSignals]);

  const allSignals = signalIndex.signals;
  const pendingSignals = useMemo(
    () => allSignals.filter((record) => record.submission.pendingOnchainRegistration),
    [allSignals],
  );
  const visibleSignals = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return allSignals.filter((record) => {
      if (selectedFormId !== "all" && record.form.id !== selectedFormId) {
        return false;
      }
      if (!matchesStream(record, selectedStreamId)) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return record.searchText.includes(normalizedSearch);
    });
  }, [allSignals, search, selectedFormId, selectedStreamId]);

  const selectedRecord = selectedSignalId
    ? visibleSignals.find((record) => record.submission.id === selectedSignalId) ??
      signalIndex.signalById[selectedSignalId] ??
      null
    : visibleSignals[0] ?? null;

  function applySubmissionUpdate(nextSubmission: Submission) {
    setSubmissionsByFormId((current) => ({
      ...current,
      [nextSubmission.formId]: (current[nextSubmission.formId] ?? []).map((submission) =>
        submission.id === nextSubmission.id ? nextSubmission : submission,
      ),
    }));
  }

  return {
    forms,
    setForms,
    submissionsByFormId,
    setSubmissionsByFormId,
    loading,
    loadError,
    selectedFormId,
    setSelectedFormId,
    selectedStreamId,
    setSelectedStreamId,
    selectedSignalId,
    setSelectedSignalId,
    search,
    setSearch,
    loadConsole,
    accessibleForms,
    signalIndex,
    allSignals,
    pendingSignals,
    visibleSignals,
    selectedRecord,
    applySubmissionUpdate,
  };
}
