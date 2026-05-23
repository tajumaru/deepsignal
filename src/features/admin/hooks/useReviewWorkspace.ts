import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAssignedReviewer,
  getReviewerNoteUpdatedAt,
  getVisibleReviewerNotes,
  serializeReviewNotes,
} from "../../../lib/reviewCollaboration";
import type { Submission } from "../../../types";
import type { SignalRecord } from "./useSignalInboxData";

export type ReviewSaveStatus = "idle" | "saving" | "saved" | "skipped" | "error";
export type ReviewSessionMobileTab = "answers" | "review";
export type ReviewSessionStep = 1 | 2 | 3 | 4;
export type ReviewDraft = Pick<Submission, "status" | "triageStatus" | "priority" | "signalValue"> & {
  notes: string;
  reviewer: string;
};

interface UseReviewWorkspaceArgs {
  selectedRecord: SignalRecord | null;
  selectedRecordNeedsDecrypt: boolean;
  isReviewWorkbenchLocked: boolean;
  setSelectedSignalId: (signalId: string) => void;
  onSelectedRecordChange?: () => void;
  discardChangesConfirmLabel: string;
  reviewSaveStatusLabel: Record<ReviewSaveStatus, string>;
  reviewSaveUnsavedDraftLabel: string;
  persistReviewDraft?: (nextSubmission: Submission) => Promise<boolean>;
  mobileReviewMediaQuery?: string;
}

function createReviewDraftFromSubmission(submission: Submission): ReviewDraft {
  return {
    status: submission.status,
    triageStatus: submission.triageStatus,
    priority: submission.priority,
    signalValue: submission.signalValue,
    notes: getVisibleReviewerNotes(submission),
    reviewer: getAssignedReviewer(submission) ?? "",
  };
}

export function useReviewWorkspace({
  selectedRecord,
  selectedRecordNeedsDecrypt,
  isReviewWorkbenchLocked,
  setSelectedSignalId,
  onSelectedRecordChange,
  discardChangesConfirmLabel,
  reviewSaveStatusLabel,
  reviewSaveUnsavedDraftLabel,
  persistReviewDraft,
  mobileReviewMediaQuery = "(max-width: 768px)",
}: UseReviewWorkspaceArgs) {
  const [reviewSaveStatus, setReviewSaveStatus] = useState<ReviewSaveStatus>("idle");
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [reviewSessionOpen, setReviewSessionOpen] = useState(false);
  const [reviewSessionStep, setReviewSessionStep] = useState<ReviewSessionStep>(1);
  const [reviewSessionMobileTab, setReviewSessionMobileTab] = useState<ReviewSessionMobileTab>("answers");
  const selectedRecordResetRef = useRef<string | null>(null);
  const hasUnsavedReviewChangesRef = useRef(false);

  const activeReviewDraft: ReviewDraft | null = useMemo(
    () => (selectedRecord ? reviewDraft ?? createReviewDraftFromSubmission(selectedRecord.submission) : null),
    [reviewDraft, selectedRecord],
  );

  const hasReviewDraftChanges = Boolean(
    selectedRecord &&
      activeReviewDraft &&
      (activeReviewDraft.status !== selectedRecord.submission.status ||
        activeReviewDraft.triageStatus !== selectedRecord.submission.triageStatus ||
        activeReviewDraft.priority !== selectedRecord.submission.priority ||
        activeReviewDraft.signalValue !== selectedRecord.submission.signalValue ||
        activeReviewDraft.notes !== getVisibleReviewerNotes(selectedRecord.submission) ||
        activeReviewDraft.reviewer !== (getAssignedReviewer(selectedRecord.submission) ?? "")),
  );

  useEffect(() => {
    const selectedRecordId = selectedRecord?.submission.id ?? null;
    if (selectedRecordId === selectedRecordResetRef.current) {
      return;
    }
    selectedRecordResetRef.current = selectedRecordId;

    if (!selectedRecord) {
      setReviewDraft(null);
      onSelectedRecordChange?.();
      return;
    }

    setReviewDraft(createReviewDraftFromSubmission(selectedRecord.submission));
    onSelectedRecordChange?.();
  }, [onSelectedRecordChange, selectedRecord]);

  useEffect(() => {
    hasUnsavedReviewChangesRef.current = reviewSessionOpen && hasReviewDraftChanges;
  }, [hasReviewDraftChanges, reviewSessionOpen]);

  useEffect(() => {
    if (!reviewSessionOpen || !hasReviewDraftChanges) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasReviewDraftChanges, reviewSessionOpen]);

  const forceCloseReviewSession = useCallback(() => {
    setReviewSessionOpen(false);
  }, []);

  const requestCloseReviewSession = useCallback(() => {
    if (hasUnsavedReviewChangesRef.current && !window.confirm(discardChangesConfirmLabel)) {
      return false;
    }
    forceCloseReviewSession();
    return true;
  }, [discardChangesConfirmLabel, forceCloseReviewSession]);

  const openReviewSession = useCallback((signalId?: string) => {
    if (signalId) {
      setSelectedSignalId(signalId);
    }
    setReviewSessionStep(selectedRecordNeedsDecrypt ? 1 : 2);
    setReviewSessionOpen(true);
  }, [selectedRecordNeedsDecrypt, setSelectedSignalId]);

  useEffect(() => {
    if (!reviewSessionOpen) {
      return;
    }
    if (selectedRecordNeedsDecrypt) {
      setReviewSessionStep(1);
      return;
    }
    setReviewSessionStep((current) => (current < 2 ? 2 : current));
  }, [reviewSessionOpen, selectedRecordNeedsDecrypt, selectedRecord?.submission.id]);

  useEffect(() => {
    if (!reviewSessionOpen) {
      setReviewSessionMobileTab("answers");
      return;
    }
    if (reviewSessionStep !== 2) {
      setReviewSessionMobileTab("answers");
    }
  }, [reviewSessionOpen, reviewSessionStep]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mediaQuery = window.matchMedia(mobileReviewMediaQuery);
    const syncReviewSessionMobileTab = (event?: MediaQueryListEvent) => {
      if (!(event?.matches ?? mediaQuery.matches)) {
        setReviewSessionMobileTab("answers");
      }
    };
    syncReviewSessionMobileTab();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncReviewSessionMobileTab);
      return () => mediaQuery.removeEventListener("change", syncReviewSessionMobileTab);
    }
    mediaQuery.addListener(syncReviewSessionMobileTab);
    return () => mediaQuery.removeListener(syncReviewSessionMobileTab);
  }, [mobileReviewMediaQuery]);

  const patchReviewDraft = useCallback((patch: Partial<ReviewDraft>) => {
    if (!selectedRecord || isReviewWorkbenchLocked) {
      return;
    }
    setReviewDraft((current) => {
      const base = current ?? createReviewDraftFromSubmission(selectedRecord.submission);
      return {
        ...base,
        ...patch,
      };
    });
  }, [isReviewWorkbenchLocked, selectedRecord]);

  const buildSubmissionFromReviewDraft = useCallback(
    (submission: Submission, draft: ReviewDraft) => {
      const previousVisibleNotes = getVisibleReviewerNotes(submission);
      const previousNoteUpdatedAt = getReviewerNoteUpdatedAt(submission);
      const noteUpdatedAt =
        draft.notes !== previousVisibleNotes ? new Date().toISOString() : previousNoteUpdatedAt;

      return {
        ...submission,
        status: draft.status,
        triageStatus: draft.triageStatus,
        priority: draft.priority,
        signalValue: draft.signalValue,
        notes: serializeReviewNotes(draft.notes, {
          reviewer: draft.reviewer,
          noteUpdatedAt,
        }),
      } satisfies Submission;
    },
    [],
  );

  const saveActiveReviewDraft = useCallback(async () => {
    if (
      !persistReviewDraft ||
      !selectedRecord ||
      !activeReviewDraft ||
      !hasReviewDraftChanges ||
      isReviewWorkbenchLocked
    ) {
      return false;
    }

    return persistReviewDraft(
      buildSubmissionFromReviewDraft(selectedRecord.submission, activeReviewDraft),
    );
  }, [
    activeReviewDraft,
    buildSubmissionFromReviewDraft,
    hasReviewDraftChanges,
    isReviewWorkbenchLocked,
    persistReviewDraft,
    selectedRecord,
  ]);

  const reviewStatusPillState = hasReviewDraftChanges ? "editing" : reviewSaveStatus;
  const reviewStatusPillLabel = hasReviewDraftChanges
    ? reviewSaveUnsavedDraftLabel
    : reviewSaveStatusLabel[reviewSaveStatus];

  const syncReviewDraftFromSubmission = useCallback((submission: Submission | null) => {
    setReviewDraft(submission ? createReviewDraftFromSubmission(submission) : null);
  }, []);

  return {
    reviewSaveStatus,
    setReviewSaveStatus,
    activeReviewDraft,
    hasReviewDraftChanges,
    reviewStatusPillState,
    reviewStatusPillLabel,
    patchReviewDraft,
    buildSubmissionFromReviewDraft,
    saveActiveReviewDraft,
    syncReviewDraftFromSubmission,
    reviewSessionOpen,
    forceCloseReviewSession,
    requestCloseReviewSession,
    openReviewSession,
    reviewSessionStep,
    setReviewSessionStep,
    reviewSessionMobileTab,
    setReviewSessionMobileTab,
  };
}
