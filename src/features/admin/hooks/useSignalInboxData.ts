import { useEffect, useMemo, useRef, useState } from "react";
import { canReviewForm } from "../../../lib/adminAccess";
import {
  getSignalPreview,
  getSignalSubject,
  inferSignalCategory,
  type SignalCategory,
} from "../../../lib/signalInbox";
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
  | "unread"
  | "encrypted"
  | "high"
  | "pending_sui"
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

export function matchesStream(record: SignalRecord, streamId: StreamId) {
  switch (streamId) {
    case "unread":
      return record.submission.status === "unread";
    case "encrypted":
      return record.submission.isEncrypted;
    case "high":
      return record.submission.priority === "high";
    case "pending_sui":
      return Boolean(record.submission.pendingOnchainRegistration);
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
  const [forms, setForms] = useState<FormWithCount[]>([]);
  const [submissionsByFormId, setSubmissionsByFormId] = useState<Record<string, Submission[]>>({});
  const [loading, setLoading] = useState(true);
  const [, setSubmissionsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedFormId, setSelectedFormId] = useState("all");
  const [selectedStreamId, setSelectedStreamId] = useState<StreamId>("all");
  const [selectedSignalId, setSelectedSignalId] = useState("");
  const [search, setSearch] = useState("");
  const loadConsoleRunRef = useRef(0);

  async function loadConsole(preferredSignalId?: string) {
    const runId = loadConsoleRunRef.current + 1;
    loadConsoleRunRef.current = runId;
    setLoading(true);
    setSubmissionsLoading(false);
    setLoadError("");
    try {
      const allForms = await storageAdapter.listForms();
      if (runId !== loadConsoleRunRef.current) {
        return;
      }

      const nextForms = allForms.map((form) => ({ ...normalizeForm(form), submissionCount: 0 }));
      setForms(nextForms);
      setSubmissionsByFormId({});
      setSelectedSignalId((current) => preferredSignalId ?? current);
      setLoading(false);

      if (nextForms.length === 0) {
        return;
      }

      setSubmissionsLoading(true);
      const nextSubmissions: Record<string, Submission[]> = {};

      for (let index = 0; index < nextForms.length; index += ADMIN_SUBMISSION_BATCH_SIZE) {
        const formBatch = nextForms.slice(index, index + ADMIN_SUBMISSION_BATCH_SIZE);
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
    } catch (error) {
      console.error("Failed to load admin console", error);
      setForms([]);
      setSubmissionsByFormId({});
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
  }, []);

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
      unread: 0,
      encrypted: 0,
      high: 0,
      pendingSui: 0,
      archived: 0,
    };
    const unreadCountByFormId: Record<string, number> = {};
    const clusterCountById: Record<string, number> = {};
    const pendingSignalIdSet = new Set<string>();

    for (const form of accessibleForms) {
      let unreadCount = 0;
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

        signals.push(record);
        signalById[submission.id] = record;

        if (submission.status === "unread") {
          unreadCount += 1;
          counts.unread += 1;
        }
        if (submission.isEncrypted) {
          counts.encrypted += 1;
        }
        if (submission.priority === "high") {
          counts.high += 1;
        }
        if (submission.pendingOnchainRegistration) {
          counts.pendingSui += 1;
          pendingSignalIdSet.add(submission.id);
        }
        if (submission.status === "archived") {
          counts.archived += 1;
        }
        if (submission.clusterId) {
          clusterCountById[submission.clusterId] = (clusterCountById[submission.clusterId] ?? 0) + 1;
        }
      }

      unreadCountByFormId[form.id] = unreadCount;
    }

    return {
      signals,
      signalById,
      counts,
      unreadCountByFormId,
      clusterCountById,
      pendingSignalIdSet,
    };
  }, [accessibleForms, submissionsByFormId]);

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

  const selectedRecord =
    visibleSignals.find((record) => record.submission.id === selectedSignalId) ??
    signalIndex.signalById[selectedSignalId] ??
    visibleSignals[0] ??
    null;

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
