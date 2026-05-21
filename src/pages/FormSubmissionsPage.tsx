import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { BlobLink } from "../components/BlobLink";
import { EmptyState } from "../components/EmptyState";
import { FormattedAnswerValue } from "../components/FormattedAnswerValue";
import { PrivateSignalUnlockCard } from "../components/PrivateSignalUnlockCard";
import { ProofPanel } from "../components/ProofPanel";
import { RichTextContent } from "../components/RichText";
import { SignalStatusBadges } from "../components/SignalStatusBadges";
import { SignalMetaChip } from "../components/SignalMetaChip";
import { StorageProof } from "../components/StorageProof";
import { CsvExportConfirmationModal } from "../features/admin/components/CsvExportConfirmationModal";
import { usePrivateSignalDecrypt } from "../features/admin/hooks/usePrivateSignalDecrypt";
import { useAccessControl } from "../hooks/useAccessControl";
import { getAttachmentDownloadHref, useAttachmentPreviews } from "../hooks/useAttachmentPreviews";
import { useSuiWallet } from "../hooks/useSuiWallet";
import { getSealRuntimeStatus } from "../crypto/cryptoFactory";
import { useI18n } from "../i18n";
import { formatAnswerText } from "../lib/answerFormatting";
import { isAttachmentFieldType, isLongTextLikeField } from "../lib/fieldTypes";
import { canAttemptPrivateSignalDecrypt, getReviewAccessState } from "../lib/adminAccess";
import { exportSubmissionJson, exportSummaryJson } from "../lib/export";
import {
  buildExportMetadata,
  exportResponsesToCsv,
  type ExportMetadata,
  type ExportResponsesToCsvOptions,
  type ExportPiiField,
  type ResponsesCsvExportScope,
  type ResponsesCsvSortOrder,
} from "../lib/exportResponses";
import { getPublicFormPath, getPublicRoadmapPath } from "../lib/publicLinks";
import { clearDeepSignalPolicyCapabilityCache } from "../lib/debugCache";
import { formatResponseDeadline, type ResponseDeadlineLabels } from "../lib/responseDeadline";
import { getRespondentDisplayLabel, getSubmissionRespondentMeta } from "../lib/respondentMeta";
import {
  getAssignedReviewer,
  getReviewerNoteUpdatedAt,
  getReviewerPresenceText,
  getVisibleReviewerNotes,
  hasNeedsFollowUp,
  NEEDS_FOLLOW_UP_TAG,
  serializeReviewNotes,
  setNeedsFollowUpTag,
} from "../lib/reviewCollaboration";
import {
  triageStatusToOnchainStatus,
  updateSignalStatusOnChain,
} from "../lib/projectRegistry";
import {
  getSignalPreview,
  getSignalSubject,
  inferSignalCategory,
  isLocalFallbackBlob,
} from "../lib/signalInbox";
import { getTriageStatusLabel, TRIAGE_STATUS_OPTIONS } from "../lib/signalOps";
import {
  normalizeForm,
  normalizeSubmission,
  storageAdapter,
} from "../lib/storage";
import { buildSurveySummary } from "../lib/surveySummary";
import { formatDate, flattenAnswer } from "../lib/utils";
import { useRpcInfrastructure } from "../rpcInfrastructure";
import type { FormSchema, Submission } from "../types";

type StreamId =
  | "all"
  | "unread"
  | "follow_up"
  | "encrypted"
  | "high"
  | "planned"
  | "in_progress"
  | "fixed"
  | "bug"
  | "feature"
  | "survey"
  | "archived";

function matchesStream(submission: Submission, streamId: StreamId) {
  const category = inferSignalCategory(submission);
  switch (streamId) {
    case "unread":
      return submission.status === "unread";
    case "follow_up":
      return hasNeedsFollowUp(submission);
    case "encrypted":
      return submission.isEncrypted;
    case "high":
      return submission.priority === "high";
    case "planned":
      return submission.triageStatus === "planned";
    case "in_progress":
      return submission.triageStatus === "in_progress";
    case "fixed":
      return submission.triageStatus === "fixed";
    case "bug":
      return category === "Bug";
    case "feature":
      return category === "Feature";
    case "survey":
      return category === "Survey";
    case "archived":
      return submission.status === "archived";
    default:
      return true;
  }
}

function getReviewLifecycleSteps(submission?: Submission | null, unlocked = false) {
  const hasSubmission = Boolean(submission);
  const isReviewed = submission?.status === "read" || submission?.status === "archived";
  const isTriaged = Boolean(submission?.triageStatus && submission.triageStatus !== "new");
  const isResolved = submission?.status === "archived" || submission?.triageStatus === "fixed";

  return [
    { label: "Incoming", active: hasSubmission, complete: hasSubmission },
    { label: "Protected", active: Boolean(submission?.isEncrypted), complete: Boolean(submission && (!submission.isEncrypted || unlocked)) },
    { label: "Needs review", active: submission?.status === "unread", complete: isReviewed },
    { label: "Triaged", active: isTriaged, complete: isTriaged },
    { label: "Resolved", active: isResolved, complete: isResolved },
  ];
}

export function FormSubmissionsPage() {
  const { language, t } = useI18n();
  const wallet = useSuiWallet();
  const rpcInfrastructure = useRpcInfrastructure();
  const updateSignalStatusTx = useSignAndExecuteTransaction();
  const {
    capabilityProfile,
    isLoadingAccess,
    ownedObjects,
    refetch: refetchAccessControl,
  } = useAccessControl(wallet.accountAddress);
  const reviewDeniedBody = capabilityProfile.isConfigured ? t("reviewAccessRequiresCapability") : undefined;
  const { formId = "", submissionId = "" } = useParams();
  const sealRuntime = getSealRuntimeStatus();
  const responseDeadlineLabels: ResponseDeadlineLabels = {
    noLimit: t("responseDeadlineNone"),
    closed: t("responseDeadlineClosed"),
    hoursLeft: (hours) => t("responseDeadlineHoursLeft", { count: hours }),
    daysLeft: (days) => t("responseDeadlineDaysLeft", { count: days }),
  };
  const sealRuntimeLabel = sealRuntime.activeMode.toUpperCase();

  async function handleClearDebugPolicyCache() {
    await clearDeepSignalPolicyCapabilityCache();
    await refetchAccessControl();
    setDecryptDiagnostics(null);
    setDecryptError("");
    setDecryptStatusMessage("Cached policy data cleared. Unlock again to refetch wallet objects.");
  }

  function renderAnswerValue(field: FormSchema["fields"][number], value: unknown) {
    if (isLongTextLikeField(field.type)) {
      const text = typeof value === "string" ? value : "";
      return text ? <RichTextContent value={text} className="rich-text-content" /> : <p>{t("noAnswerLabel")}</p>;
    }
    return <FormattedAnswerValue field={field} value={value} emptyLabel={t("noAnswerLabel")} showCountryIso />;
  }
  const [form, setForm] = useState<FormSchema | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSignalId, setSelectedSignalId] = useState(submissionId);
  const [selectedStreamId, setSelectedStreamId] = useState<StreamId>("all");
  const [search, setSearch] = useState("");
  const [unlockInteractionNotice, setUnlockInteractionNotice] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [statusDraft, setStatusDraft] = useState<Submission["status"]>("unread");
  const [triageStatusDraft, setTriageStatusDraft] = useState<Submission["triageStatus"]>("new");
  const [priorityDraft, setPriorityDraft] = useState<Submission["priority"]>("medium");
  const [signalValueDraft, setSignalValueDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [reviewerDraft, setReviewerDraft] = useState("");
  const [csvExportScope, setCsvExportScope] = useState<ResponsesCsvExportScope>("filtered");
  const [csvSortOrder, setCsvSortOrder] = useState<ResponsesCsvSortOrder>("createdAtDesc");
  const [excludedCsvPiiFields, setExcludedCsvPiiFields] = useState<ExportPiiField[]>([]);
  const [pendingCsvExportMetadata, setPendingCsvExportMetadata] = useState<ExportMetadata | null>(null);
  const [pendingCsvExportResponses, setPendingCsvExportResponses] = useState<Submission[]>([]);
  const [pendingCsvExportOptions, setPendingCsvExportOptions] = useState<ExportResponsesToCsvOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const saveQueueRef = useRef(Promise.resolve());
  const previousSelectedSubmissionIdRef = useRef<string | null>(null);

  useEffect(() => {
    async function loadInbox() {
      const [nextForm, rawSubmissions] = await Promise.all([
        storageAdapter.getForm(formId),
        storageAdapter.listSubmissions(formId),
      ]);
      setForm(nextForm ? normalizeForm(nextForm) : null);
      setSubmissions(rawSubmissions.map((submission) => normalizeSubmission(submission)));
      setSelectedSignalId((current) => submissionId ?? current);
      setLoading(false);
    }

    void loadInbox();
  }, [formId, submissionId]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visibleSignals = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return submissions.filter((submission) => {
      if (!matchesStream(submission, selectedStreamId)) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      const searchable = [
        getSignalSubject(submission),
        getSignalPreview(submission),
        flattenAnswer(submission.answers),
        submission.tags.join(" "),
        inferSignalCategory(submission),
        submission.contributorId ?? "",
        getTriageStatusLabel(submission.triageStatus),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedSearch);
    });
  }, [search, selectedStreamId, submissions]);
  const selectedSubmission =
    visibleSignals.find((submission) => submission.id === selectedSignalId) ??
    submissions.find((submission) => submission.id === selectedSignalId) ??
    visibleSignals[0] ??
    null;
  const selectedRecord = useMemo(
    () =>
      form && selectedSubmission
        ? {
            form: {
              ...form,
              submissionCount: submissions.length,
            },
            submission: selectedSubmission,
            category: inferSignalCategory(selectedSubmission),
            searchText: "",
          }
        : null,
    [form, selectedSubmission, submissions.length],
  );
  const {
    detailAnswers,
    detailAttachments,
    detailLegacyUnencrypted,
    decrypting,
    decryptState,
    decryptStatusMessage,
    decryptError,
    decryptDiagnostics,
    setDecryptError,
    setDecryptDiagnostics,
    setDecryptStatusMessage,
    decryptInFlightRef,
    activeDecryptSubmissionId,
    decryptContext: attachmentDecryptContext,
    handleDecrypt,
    handleCancelDecrypt: cancelSharedDecrypt,
    realSealSessionTtlMinutes,
  } = usePrivateSignalDecrypt({
    accountAddress: wallet.accountAddress,
    capabilityProfile,
    ownedCapabilityObjects: ownedObjects,
    selectedRecord,
    selectedSignalId,
    setToast,
    decryptFailedLabel: t("decryptFailed"),
    decryptMessages: {
      loadingSealRuntime: t("decryptStatusLoadingSealRuntime"),
      validatingAccessPolicy: t("decryptStatusValidatingAccessPolicy"),
      requestingWalletApproval: t("decryptStatusRequestingWalletApproval"),
      decryptingEncryptedPayload: t("decryptStatusDecryptingEncryptedPayload"),
      signalUnlocked: t("decryptStatusSignalUnlocked"),
      connectWalletToUnlockSignal: t("decryptErrorConnectWalletToUnlockSignal"),
      unauthorizedWalletDecrypt: t("decryptErrorUnauthorizedWallet"),
      sealSessionExpired: t("decryptErrorSealSessionExpired"),
      walletApprovalRequiredToDecrypt: t("decryptErrorWalletApprovalRequired"),
      encryptionPolicyMismatch: t("decryptErrorEncryptionPolicyMismatch"),
      manifestMismatchDetected: t("decryptErrorManifestMismatch"),
      blobFetchFailed: t("decryptErrorBlobFetchFailed"),
      encryptedPayloadMissing: t("decryptErrorEncryptedPayloadMissing"),
      sealRuntimeUnavailable: t("decryptErrorSealRuntimeUnavailable"),
      encryptedPayloadNotFound: t("decryptErrorEncryptedPayloadNotFound"),
      walletVerifiedPrivateSignalUnlocked: t("decryptToastWalletVerifiedPrivateSignalUnlocked"),
    },
  });
  const csvExportCount =
    csvExportScope === "filtered"
      ? visibleSignals.length
      : csvExportScope === "selected"
        ? selectedSubmission
          ? 1
          : 0
        : submissions.length;
  const csvExportScopeLabel =
    csvExportScope === "filtered"
      ? t("filteredExportCount", { count: visibleSignals.length })
      : csvExportScope === "selected"
        ? t("selectedResponsesCount", { count: selectedSubmission ? 1 : 0 })
      : t("allResponsesCount", { count: submissions.length });
  const submissionMetrics = useMemo(() => {
    const next = {
      unread: 0,
      encrypted: 0,
      high: 0,
      followUp: 0,
      planned: 0,
      inProgress: 0,
      fixed: 0,
      bug: 0,
      feature: 0,
      survey: 0,
      archived: 0,
      newSignals: 0,
      clustered: 0,
      highValue: 0,
      signalValueTotal: 0,
      signalValueCount: 0,
      visibleUnread: 0,
    };

    for (const submission of submissions) {
      const category = inferSignalCategory(submission);
      if (submission.status === "unread") {
        next.unread += 1;
      }
      if (submission.isEncrypted) {
        next.encrypted += 1;
      }
      if (submission.priority === "high") {
        next.high += 1;
      }
      if (hasNeedsFollowUp(submission)) {
        next.followUp += 1;
      }
      if (submission.triageStatus === "new") {
        next.newSignals += 1;
      }
      if (submission.triageStatus === "planned") {
        next.planned += 1;
      }
      if (submission.triageStatus === "in_progress") {
        next.inProgress += 1;
      }
      if (submission.triageStatus === "fixed") {
        next.fixed += 1;
      }
      if (category === "Bug") {
        next.bug += 1;
      }
      if (category === "Feature") {
        next.feature += 1;
      }
      if (category === "Survey") {
        next.survey += 1;
      }
      if (submission.status === "archived") {
        next.archived += 1;
      }
      if (submission.clusterId) {
        next.clustered += 1;
      }
      if ((submission.signalValue ?? 0) >= 4) {
        next.highValue += 1;
      }
      if (typeof submission.signalValue === "number") {
        next.signalValueTotal += submission.signalValue;
        next.signalValueCount += 1;
      }
    }

    for (const submission of visibleSignals) {
      if (submission.status === "unread") {
        next.visibleUnread += 1;
      }
    }

    return next;
  }, [submissions, visibleSignals]);

  const streamItems = useMemo(
    () =>
      [
        { id: "all", label: t("allSignals"), count: submissions.length },
        { id: "unread", label: t("unreadSignals"), count: submissionMetrics.unread },
        { id: "encrypted", label: t("encryptedSignals"), count: submissionMetrics.encrypted },
        { id: "high", label: t("highPrioritySignals"), count: submissionMetrics.high },
        { id: "follow_up", label: t("needsFollowUpLabel"), count: submissionMetrics.followUp },
        { id: "planned", label: "Planned Signals", count: submissionMetrics.planned },
        { id: "in_progress", label: "In Progress", count: submissionMetrics.inProgress },
        { id: "fixed", label: "Fixed Signals", count: submissionMetrics.fixed },
        { id: "bug", label: t("bugReports"), count: submissionMetrics.bug },
        { id: "feature", label: t("featureRequests"), count: submissionMetrics.feature },
        { id: "survey", label: t("surveys"), count: submissionMetrics.survey },
        { id: "archived", label: t("archivedSignals"), count: submissionMetrics.archived },
      ] satisfies Array<{ id: StreamId; label: string; count: number }>,
    [submissionMetrics, submissions.length, t],
  );

  const summaryCards = useMemo(
    () => [
      { label: "Total signals", value: submissions.length },
      { label: "New signals", value: submissionMetrics.newSignals },
      { label: "Planned", value: submissionMetrics.planned },
      { label: "Fixed", value: submissionMetrics.fixed },
      { label: "Clustered", value: submissionMetrics.clustered },
      { label: "High value signals", value: submissionMetrics.highValue },
      {
        label: "Average signal value",
        value:
          submissionMetrics.signalValueCount === 0
            ? "N/A"
            : (submissionMetrics.signalValueTotal / submissionMetrics.signalValueCount).toFixed(1),
      },
    ],
    [submissionMetrics, submissions.length],
  );

  const surveySummary = useMemo(
    () => (form ? buildSurveySummary(form, submissions) : null),
    [form, submissions],
  );
  const showSurveySummary = useMemo(
    () => Boolean(form && (form.purpose === "survey" || submissionMetrics.survey > 0)),
    [form, submissionMetrics.survey],
  );
  const selectedSubmissionEncryptedBlobId = selectedSubmission?.encryptedBlobId;
  const selectedSubmissionEncryptedBlobStoredOnWalrus = Boolean(
    selectedSubmissionEncryptedBlobId && !isLocalFallbackBlob(selectedSubmissionEncryptedBlobId),
  );
  const attachmentPreviews = useAttachmentPreviews(detailAttachments, {
    enabled:
      detailAttachments.length > 0 &&
      (!detailAttachments.some((attachment) => attachment.encrypted) || Boolean(detailAnswers)),
    decryptContext: attachmentDecryptContext,
  });
  const renderAttachmentCards = (attachments: Submission["attachments"]) => {
    if (attachments.length === 0) {
      return null;
    }
    return (
      <div className="stack">
        {attachments.map((attachment) => (
          <div key={attachment.blobId} className="attachment-row">
            {(() => {
              const preview = attachmentPreviews[attachment.blobId];
              const label = preview?.name ?? attachment.originalName ?? attachment.name;
              const downloadHref = getAttachmentDownloadHref(attachment, preview);
              return (
                <>
                  <div>
                    <strong>{label}</strong>
                    <p className="muted">
                      {attachment.type} - {Math.round(attachment.size / 1024)} KB
                    </p>
                    {attachment.encrypted && preview?.error ? (
                      <p className="warning-text">{preview.error}</p>
                    ) : null}
                    {preview?.kind === "image" && preview.url ? (
                      <img
                        src={preview.url}
                        alt={label}
                        className="attachment-preview-image"
                      />
                    ) : null}
                    {preview?.kind === "video" && preview.url ? (
                      <video
                        src={preview.url}
                        className="attachment-preview-video"
                        controls
                      />
                    ) : null}
                  </div>
                  <div className="stack signal-meta-row-value">
                    {attachment.storage === "inline" ? (
                      <strong>Embedded in private signal</strong>
                    ) : (
                      <SignalMetaChip type="blob" value={attachment.blobId} />
                    )}
                    {attachment.storage !== "inline" && !isLocalFallbackBlob(attachment.blobId) ? (
                      <StorageProof
                        blobId={attachment.blobId}
                        proof={attachment.walrusProof}
                        fallbackSize={attachment.size}
                        compact
                      />
                    ) : null}
                    {downloadHref ? (
                      <a
                        className="ghost-button"
                        href={downloadHref}
                        download={label}
                      >
                        Download attachment
                      </a>
                    ) : null}
                  </div>
                </>
              );
            })()}
          </div>
        ))}
      </div>
    );
  };

  useEffect(() => {
    if (!selectedSubmission) {
      setNotesDraft("");
      setReviewerDraft("");
      setDecryptError("");
      setDecryptDiagnostics(null);
      setUnlockInteractionNotice("");
      setSaveError("");
      setSaveState("idle");
      previousSelectedSubmissionIdRef.current = null;
      return;
    }
    const previousSelectedSubmissionId = previousSelectedSubmissionIdRef.current;
    const didSelectionChange = previousSelectedSubmissionId !== selectedSubmission.id;
    previousSelectedSubmissionIdRef.current = selectedSubmission.id;
    setNotesDraft(getVisibleReviewerNotes(selectedSubmission));
    setReviewerDraft(getAssignedReviewer(selectedSubmission) ?? "");
    setStatusDraft(selectedSubmission.status);
    setTriageStatusDraft(selectedSubmission.triageStatus);
    setPriorityDraft(selectedSubmission.priority);
    setSignalValueDraft(
      typeof selectedSubmission.signalValue === "number"
        ? selectedSubmission.signalValue.toString()
        : "",
    );
    if (didSelectionChange) {
      setDecryptError("");
      setDecryptDiagnostics(null);
      setUnlockInteractionNotice("");
    }
    setSaveError("");
  }, [selectedSubmission, setDecryptDiagnostics, setDecryptError]);

  function applySubmissionUpdate(nextSubmission: Submission) {
    setSubmissions((current) =>
      current.map((submission) =>
        submission.id === nextSubmission.id ? nextSubmission : submission,
      ),
    );
  }

  async function updateSubmission(
    nextSubmission: Submission,
    options?: { notifyOnSuccess?: boolean },
  ) {
    const normalized = normalizeSubmission({
      ...nextSubmission,
      updatedAt: new Date().toISOString(),
    });
    const previousSubmission = submissions.find((submission) => submission.id === normalized.id) ?? null;
    applySubmissionUpdate(normalized);
    setSelectedSignalId(normalized.id);
    setSaveState("saving");
    setSaveError("");
    const runSave = async () => {
      try {
        let successMessage = "Review & triage saved.";
        await storageAdapter.updateSubmission(normalized);
        const nextOnchainStatus = triageStatusToOnchainStatus(normalized.triageStatus, normalized.status);
        const previousOnchainStatus = previousSubmission
          ? triageStatusToOnchainStatus(previousSubmission.triageStatus, previousSubmission.status)
          : undefined;
        const shouldSyncOnchain =
          form?.projectId &&
          typeof normalized.onchainSignalId === "number" &&
          previousOnchainStatus !== nextOnchainStatus;

        if (shouldSyncOnchain) {
          try {
            const projectId = form?.projectId;
            const signalId = normalized.onchainSignalId;
            if (!projectId || typeof signalId !== "number") {
              throw new Error("Project registry ids are missing for this signal.");
            }
            const tx = updateSignalStatusOnChain({
              projectId,
              signalId,
              status: nextOnchainStatus,
            });
            await updateSignalStatusTx.mutateAsync({ transaction: tx });
            normalized.onchainStatus = nextOnchainStatus;
            applySubmissionUpdate(normalized);
            await storageAdapter.updateSubmission(normalized);
          } catch (chainError) {
            console.warn("update_signal_status failed, keeping local triage state", chainError);
            successMessage =
              chainError instanceof Error
                ? `Saved locally. Project status sync skipped: ${chainError.message}`
                : "Saved locally. Project status sync skipped.";
            setSaveError(successMessage);
          }
        }
        setSaveState("saved");
        if (options?.notifyOnSuccess) {
          setToast({ tone: "success", message: successMessage });
        }
      } catch (error) {
        setSaveState("error");
        const message =
          error instanceof Error ? error.message : "Failed to save signal operations.";
        setSaveError(message);
        if (options?.notifyOnSuccess) {
          setToast({ tone: "error", message });
        }
      }
    };
    saveQueueRef.current = saveQueueRef.current.then(runSave, runSave);
    await saveQueueRef.current;
  }

  async function handleSelect(submission: Submission) {
    if (decryptInFlightRef.current) {
      const message = t("finishOrCancelCurrentUnlock");
      setUnlockInteractionNotice(message);
      setToast({ tone: "error", message });
      return;
    }
    setUnlockInteractionNotice("");
    setSelectedSignalId(submission.id);
  }

  function buildSubmissionWithReviewState(submission: Submission) {
    const previousVisibleNotes = getVisibleReviewerNotes(submission);
    const previousNoteUpdatedAt = getReviewerNoteUpdatedAt(submission);
    return {
      ...submission,
      status: statusDraft,
      triageStatus: triageStatusDraft,
      priority: priorityDraft,
      signalValue: signalValueDraft ? Number(signalValueDraft) : undefined,
      notes: serializeReviewNotes(notesDraft, {
        reviewer: reviewerDraft,
        noteUpdatedAt: notesDraft !== previousVisibleNotes ? new Date().toISOString() : previousNoteUpdatedAt,
      }),
    } satisfies Submission;
  }

  function handleCancelDecrypt() {
    cancelSharedDecrypt();
    setUnlockInteractionNotice(t("unlockCancelledStatus"));
  }

  async function handleSaveReviewControls() {
    if (!selectedSubmission) {
      return;
    }
    await updateSubmission(
      buildSubmissionWithReviewState(selectedSubmission),
      { notifyOnSuccess: true },
    );
  }

  function getCsvFilterSnapshot() {
    return {
      searchQuery: search,
      status: selectedStreamId === "all" ? undefined : `stream:${selectedStreamId}`,
      priority: selectedStreamId === "high" ? "high" : undefined,
      tags: [...(search.trim() ? [search.trim()] : []), ...(selectedStreamId === "follow_up" ? [NEEDS_FOLLOW_UP_TAG] : [])],
      triageStatus:
        selectedStreamId === "planned" || selectedStreamId === "in_progress" || selectedStreamId === "fixed"
          ? selectedStreamId
          : undefined,
      dateRange: {},
    };
  }

  function getCsvExportResponses() {
    if (csvExportScope === "selected") {
      return selectedSubmission ? [selectedSubmission] : [];
    }
    return csvExportScope === "filtered" ? visibleSignals : submissions;
  }

  function getCsvResponseOverrides() {
    return selectedSubmission && detailAnswers
      ? {
          [selectedSubmission.id]: {
            answers: detailAnswers,
            attachments: detailAttachments,
          },
        }
      : undefined;
  }

  function handleOpenCsvExportReview() {
    if (!form) {
      return;
    }
    const responses = getCsvExportResponses();
    if (responses.length === 0) {
      setToast({ tone: "error", message: t("noResponsesMatchCurrentFilters") });
      return;
    }
    const options: ExportResponsesToCsvOptions = {
      language,
      now: new Date(),
      scope: csvExportScope,
      sortOrder: csvSortOrder,
      excludedPiiFields: excludedCsvPiiFields,
      exportedBy: wallet.accountAddress ?? "",
      filterSnapshot: getCsvFilterSnapshot(),
      responseOverrides: getCsvResponseOverrides(),
    };
    const metadata = buildExportMetadata(form, responses, options);
    setPendingCsvExportResponses(responses);
    setPendingCsvExportMetadata(metadata);
    setPendingCsvExportOptions({ ...options, metadata });
  }

  function handleToggleCsvPiiField(field: ExportPiiField) {
    setExcludedCsvPiiFields((current) => {
      const next = current.includes(field) ? current.filter((item) => item !== field) : [...current, field];
      if (form && pendingCsvExportMetadata && pendingCsvExportOptions) {
        const nextOptions: ExportResponsesToCsvOptions = {
          ...pendingCsvExportOptions,
          excludedPiiFields: next,
          now: new Date(pendingCsvExportMetadata.exportedAt),
          metadata: undefined,
        };
        const nextMetadata = buildExportMetadata(form, pendingCsvExportResponses, nextOptions);
        setPendingCsvExportMetadata(nextMetadata);
        setPendingCsvExportOptions({ ...nextOptions, metadata: nextMetadata });
      }
      return next;
    });
  }

  function handleConfirmCsvExport() {
    if (!form || !pendingCsvExportOptions) {
      return;
    }
    try {
      const result = exportResponsesToCsv(form, pendingCsvExportResponses, pendingCsvExportOptions);
      if (result?.exported) {
        setPendingCsvExportMetadata(null);
        setPendingCsvExportResponses([]);
        setPendingCsvExportOptions(null);
        setToast({ tone: "success", message: t("csvExported") });
      }
    } catch (error) {
      console.error("CSV export failed", error);
      setToast({ tone: "error", message: t("csvExportFailed") });
    }
  }

  if (loading) {
    return <div className="panel">{t("loadingSubmissions")}</div>;
  }

  if (!form) {
    return (
      <EmptyState>
        <h1>{t("emptyFormNotFound")}</h1>
      </EmptyState>
    );
  }

  if (isLoadingAccess) {
    return <div className="panel">Checking wallet capabilities...</div>;
  }

  const access = getReviewAccessState(form, wallet.accountAddress, capabilityProfile);
  const activeForm = form as FormSchema;
  const resolvedDetailAnswers = detailAnswers ?? {};
  const isDecryptInteractionLocked = decrypting || decryptInFlightRef.current;
  const activeUnlockSubmissionId = activeDecryptSubmissionId;
  const previewAnswerFields = detailAnswers
    ? activeForm.fields.filter((field) => {
        if (isAttachmentFieldType(field.type)) {
          return false;
        }
        const value = formatAnswerText(field, resolvedDetailAnswers[field.id], language).trim();
        return Boolean(value);
      }).slice(0, 3)
    : [];
  const isDetailOnly = Boolean(submissionId);
  const inboxPath = "/admin";
  const selectedReviewerPresence = selectedSubmission
    ? getReviewerPresenceText(selectedSubmission, wallet.accountAddress)
    : null;
  const selectedNeedsFollowUp = selectedSubmission ? hasNeedsFollowUp(selectedSubmission) : false;
  const selectedReviewerNoteUpdatedAt = selectedSubmission ? getReviewerNoteUpdatedAt(selectedSubmission) : undefined;
  const unlockDisabledReason = detailAnswers
    ? undefined
    : !selectedSubmission?.isEncrypted
      ? t("privateSignalUnlockUnavailable")
      : !canAttemptPrivateSignalDecrypt(activeForm, wallet.accountAddress, capabilityProfile)
        ? t("privateSignalUnlockDisabled")
        : undefined;
  const listLockTitle =
    decryptState === "waiting_wallet_approval"
      ? t("walletApprovalPendingStatus")
      : t("unlockInProgressStatus");

  const renderUnlockGate = () => {
    if (!selectedSubmission?.isEncrypted || detailAnswers) {
      return null;
    }

    return (
      <div className="review-unlock-block">
        <PrivateSignalUnlockCard
          onUnlock={() => void handleDecrypt()}
          onClearDebugCache={() => void handleClearDebugPolicyCache()}
          onCancel={handleCancelDecrypt}
          isDecrypting={isDecryptInteractionLocked}
          isUnlocked={Boolean(detailAnswers)}
          unlockState={decryptState}
          statusMessage={decryptStatusMessage}
          errorMessage={decryptError}
          diagnostics={decryptDiagnostics}
          disabledReason={unlockDisabledReason}
          actionDisabled={Boolean(unlockDisabledReason)}
          supportContent={
            <>
              <strong>{t("privateSignalUnlockReviewTriageNote")}</strong>
              <p className="muted">Seal Runtime: {sealRuntimeLabel}</p>
              <p className="muted">
                {t("walletApprovalReuseNotice", { minutes: realSealSessionTtlMinutes })}
              </p>
              {unlockInteractionNotice ? (
                <p className="warning-text" role="status" aria-live="polite">{unlockInteractionNotice}</p>
              ) : null}
            </>
          }
        >
          {!isLocalFallbackBlob(selectedSubmission.encryptedBlobId) ? (
            <BlobLink
              blobId={selectedSubmission.encryptedBlobId}
              label={t("verifyOnWalrus")}
            />
          ) : null}
        </PrivateSignalUnlockCard>
      </div>
    );
  };

  const renderSignalDetailCard = () => {
    if (!selectedSubmission) {
      return null;
    }

    return (
      <section className="answer-card signal-detail-primary-card">
        <div className="section-row">
          <h3>Signal Detail</h3>
          {selectedSubmission.isEncrypted && detailAnswers ? (
            <span className="signal-chip signal-chip-soft">Unlocked for review</span>
          ) : null}
        </div>
        {detailAnswers ? (
          <div className="stack">
            {detailLegacyUnencrypted ? (
              <p className="warning-text">Legacy unencrypted response - created before Seal enforcement</p>
            ) : selectedSubmission.isEncrypted ? (
              <div className="signal-badge-row signal-badge-row-compact signal-storage-badges">
                <span className="signal-chip signal-chip-accent">Seal encrypted - creator/admin only</span>
                {selectedSubmissionEncryptedBlobStoredOnWalrus && selectedSubmissionEncryptedBlobId ? (
                  <>
                    <span className="signal-chip signal-chip-soft">Stored on Walrus</span>
                    <span className="signal-meta-inline">
                      <span className="signal-meta-inline-label">Blob ID</span>
                      <SignalMetaChip type="blob" value={selectedSubmissionEncryptedBlobId} />
                    </span>
                    <StorageProof
                      blobId={selectedSubmissionEncryptedBlobId}
                      proof={selectedSubmission.encryptedWalrusProof ?? selectedSubmission.walrusProof}
                      compact
                    />
                  </>
                ) : null}
              </div>
            ) : null}
            {previewAnswerFields.map((field, index) => (
              <div key={field.id} className="answer-line" data-question-index={`Q${index + 1}`}>
                <strong>{field.label}</strong>
                {renderAnswerValue(field, resolvedDetailAnswers[field.id])}
              </div>
            ))}
            {renderAttachmentCards(detailAttachments)}
            {activeForm.fields.length > previewAnswerFields.length ? (
              <p className="muted">Open Answers to view the full response.</p>
            ) : null}
          </div>
        ) : (
          <div className="review-locked-signal-copy">
            <div className="classified-signal-redaction" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <strong>{t("privateSignalUnlockReviewTriageNote")}</strong>
            <p className="muted">{t("encryptedFeedbackHidden")}</p>
          </div>
        )}
      </section>
    );
  };

  const renderReviewTriageCard = () => (
    <section className="answer-card review-triage-card">
      <div className="section-row">
        <div>
          <p className="eyebrow">Review workbench</p>
          <h3>Review & Triage</h3>
          <p className="review-helper-copy">Turn this raw feedback into an actionable signal.</p>
        </div>
        <span className={`save-state-pill is-${saveState}`}>
          {saveState === "saving"
            ? "Saving signal ops..."
            : saveState === "saved"
              ? "Saved"
              : saveState === "error"
                ? "Save failed"
                : "Ready"}
        </span>
      </div>
      {saveError ? <p className="warning-text">{saveError}</p> : null}
      <div className="review-field-grid">
        <label>
          <span>{t("status")}</span>
          <select
            value={statusDraft}
            onChange={(event) =>
              setStatusDraft(event.target.value as Submission["status"])
            }
          >
            <option value="unread">{t("statusUnread")}</option>
            <option value="read">{t("statusRead")}</option>
            <option value="archived">{t("statusArchived")}</option>
          </select>
        </label>
        <label>
          <span>Signal Triage</span>
          <select
            value={triageStatusDraft}
            onChange={(event) =>
              setTriageStatusDraft(event.target.value as Submission["triageStatus"])
            }
          >
            {TRIAGE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("priority")}</span>
          <select
            value={priorityDraft}
            onChange={(event) =>
              setPriorityDraft(event.target.value as Submission["priority"])
            }
          >
            <option value="low">{t("priorityLow")}</option>
            <option value="medium">{t("priorityMedium")}</option>
            <option value="high">{t("priorityHigh")}</option>
          </select>
        </label>
        <label>
          <span>Signal Value</span>
          <select
            value={signalValueDraft}
            onChange={(event) => setSignalValueDraft(event.target.value)}
          >
            <option value="">Not scored</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <span>{t("assignedReviewerLabel")}</span>
        <input
          type="text"
          value={reviewerDraft}
          onChange={(event) => setReviewerDraft(event.target.value)}
          placeholder={t("reviewerInputPlaceholder")}
        />
      </label>
      <div className="review-controls-actions">
        <span className="signal-chip signal-chip-soft">{reviewerDraft || t("unassignedLabel")}</span>
        {wallet.accountAddress ? (
          <button
            type="button"
            className="ghost-button"
            onClick={() => setReviewerDraft(wallet.accountAddress ?? "")}
          >
            {t("assignToMe")}
          </button>
        ) : null}
        {selectedSubmission ? (
          <button
            type="button"
            className="ghost-button"
            onClick={() =>
              void updateSubmission(
                {
                  ...selectedSubmission,
                  tags: setNeedsFollowUpTag(selectedSubmission.tags, !hasNeedsFollowUp(selectedSubmission)),
                },
                { notifyOnSuccess: true },
              )
            }
          >
            {selectedNeedsFollowUp ? t("followUpEnabledLabel") : t("needsFollowUpLabel")}
          </button>
        ) : null}
      </div>
      <label>
        <span>{t("reviewerNoteLabel")}</span>
        <textarea
          rows={5}
          value={notesDraft}
          onChange={(event) => setNotesDraft(event.target.value)}
          placeholder={t("captureReviewNotes")}
        />
      </label>
      <div className="review-controls-actions">
        <span className={`save-state-pill is-${saveState === "saving" ? "saving" : notesDraft !== (selectedSubmission ? getVisibleReviewerNotes(selectedSubmission) : "") || reviewerDraft !== (selectedSubmission ? getAssignedReviewer(selectedSubmission) ?? "" : "") ? "editing" : "saved"}`}>
          {saveState === "saving"
            ? t("reviewSaveSaving")
            : notesDraft !== (selectedSubmission ? getVisibleReviewerNotes(selectedSubmission) : "") || reviewerDraft !== (selectedSubmission ? getAssignedReviewer(selectedSubmission) ?? "" : "")
              ? t("reviewSaveUnsavedDraft")
              : t("reviewSaveSaved")}
        </span>
        {selectedReviewerNoteUpdatedAt ? (
          <span className="muted">
            {t("lastUpdatedLabel")}: {formatDate(selectedReviewerNoteUpdatedAt)}
          </span>
        ) : null}
        <button
          type="button"
          className="primary-button"
          disabled={saveState === "saving"}
          onClick={() => void handleSaveReviewControls()}
        >
          Save Review & Triage
        </button>
      </div>
    </section>
  );

  const renderMetadataExportCard = () => {
    if (!selectedSubmission) {
      return null;
    }

    return (
      <section className="answer-card review-secondary-card">
        <div className="section-row">
          <div>
            <p className="eyebrow">Secondary tools</p>
            <h3>Metadata / Export</h3>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => exportSubmissionJson(form, selectedSubmission)}
            >
              {t("exportJson")}
            </button>
            <label className="review-select export-select">
              <span>{t("exportScope")}</span>
              <select
                value={csvExportScope}
                onChange={(event) => setCsvExportScope(event.target.value as ResponsesCsvExportScope)}
              >
                <option value="filtered">{t("exportVisibleFilteredResponses")}</option>
                <option value="all">{t("exportAllResponses")}</option>
                <option value="selected">{t("exportSelectedResponses")}</option>
              </select>
            </label>
            <label className="review-select export-select">
              <span>{t("csvSortOrder")}</span>
              <select
                value={csvSortOrder}
                onChange={(event) => setCsvSortOrder(event.target.value as ResponsesCsvSortOrder)}
              >
                <option value="createdAtDesc">{t("createdAtDesc")}</option>
                <option value="createdAtAsc">{t("createdAtAsc")}</option>
              </select>
            </label>
            <button
              type="button"
              className="ghost-button"
              onClick={handleOpenCsvExportReview}
              disabled={csvExportCount === 0}
            >
              {t("exportCsv")}
            </button>
            <span className="signal-chip signal-chip-soft">{csvExportScopeLabel}</span>
          </div>
        </div>
        {csvExportCount === 0 ? (
          <p className="export-zero-note">{t("noResponsesMatchCurrentFilters")}</p>
        ) : null}
        <p className="export-privacy-note">
          {t("exportCsvPrivacyNote")}
        </p>
        <div className="metadata-list">
          <div className="metadata-row">
            <span>Seal unlock status</span>
            <strong>{selectedSubmission.isEncrypted ? (detailAnswers ? "Unlocked" : "Locked") : "Not encrypted"}</strong>
          </div>
          <div className="metadata-row">
            <span>{t("sealModeLabel")}</span>
            <strong>{sealRuntimeLabel}</strong>
          </div>
          <div className="metadata-row">
            <span>{t("submissionBlobIdLabel")}</span>
            <div className="signal-meta-row-value">
              {selectedSubmission.blobId ? (
                <StorageProof
                  blobId={selectedSubmission.blobId}
                  proof={selectedSubmission.walrusProof}
                  compact
                />
              ) : (
                <strong>{t("notAvailable")}</strong>
              )}
            </div>
          </div>
          {selectedSubmissionEncryptedBlobId ? (
            <div className="metadata-row">
              <span>{t("encryptedPayloadBlobId")}</span>
              <div className="signal-meta-row-value">
                <SignalMetaChip type="blob" value={selectedSubmissionEncryptedBlobId} />
                {selectedSubmissionEncryptedBlobStoredOnWalrus ? (
                  <StorageProof
                    blobId={selectedSubmissionEncryptedBlobId}
                    proof={selectedSubmission.encryptedWalrusProof ?? selectedSubmission.walrusProof}
                    compact
                  />
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="metadata-row">
            <span>Respondent</span>
            {getSubmissionRespondentMeta(selectedSubmission).isAnonymous ? (
              <strong>{getRespondentDisplayLabel(selectedSubmission)}</strong>
            ) : (
              <SignalMetaChip type="contributor" value={getRespondentDisplayLabel(selectedSubmission)} />
            )}
          </div>
          <div className="metadata-row">
            <span>{t("attachments")}</span>
            <strong>{t("attachmentCountLabel", { count: detailAttachments.length })}</strong>
          </div>
        </div>
      </section>
    );
  };

  const renderReviewSecondaryPanels = () => {
    if (!selectedSubmission) {
      return null;
    }

    const proofItems = [
      { label: "Walrus Blob ID", blobId: selectedSubmission.blobId },
      { label: "Encrypted Payload Blob", blobId: selectedSubmission.encryptedBlobId },
    ].filter((item) => item.blobId);
    const submissionMetadata = selectedSubmission.metadata ?? {};
    const transactionDigest =
      typeof submissionMetadata.txDigest === "string" ? submissionMetadata.txDigest : undefined;
    const storedNetwork =
      typeof submissionMetadata.network === "string"
        ? submissionMetadata.network
        : rpcInfrastructure.connectedNetworkLabel;
    const rpcProvider =
      typeof submissionMetadata.rpcProvider === "string"
        ? submissionMetadata.rpcProvider
        : rpcInfrastructure.providerLabel;

    return (
      <div className="signal-detail-sections review-secondary-sections">
        <ProofPanel
          title="Submission Proof"
          items={proofItems}
          walletAddress={wallet.accountAddress}
          ownerAddress={form?.ownerAddress}
          sealMode={selectedSubmission.isEncrypted ? sealRuntimeLabel : "NOT ENCRYPTED"}
          transactionDigest={transactionDigest}
          networkLabel={storedNetwork}
          encryptionStatus={selectedSubmission.isEncrypted ? "Seal protected" : "Standard submission"}
          storedTimestamp={selectedSubmission.updatedAt || selectedSubmission.createdAt}
          rpcProvider={rpcProvider}
        />
        {renderMetadataExportCard()}
        {showSurveySummary && surveySummary ? (
          <section className="answer-card review-secondary-card">
            <div className="section-row">
              <h3>{t("surveySummaryTitle")}</h3>
              <span className="muted">{t("submissionCountLabel", { count: surveySummary.submissionCount })}</span>
            </div>
            <div className="metadata-list">
              <div className="metadata-row">
                <span>{t("submissionCount")}</span>
                <strong>{surveySummary.submissionCount}</strong>
              </div>
              <div className="metadata-row">
                <span>{t("averageRating")}</span>
                <strong>{surveySummary.averageRating ?? t("notAvailable")}</strong>
              </div>
            </div>
            {surveySummary.encryptedPendingCount > 0 ? (
              <p className="warning-text">{t("surveySummaryEncryptedNotice")}</p>
            ) : null}
          </section>
        ) : null}
      </div>
    );
  };

  return (
    <AdminAccessGate
      hasWallet={Boolean(wallet.accountAddress)}
      access={access}
      legacyMessage={t("legacyDemoFormBody")}
      deniedBody={reviewDeniedBody ?? (
        capabilityProfile.isConfigured
          ? t("reviewAccessRequiresCapability")
          : undefined
      )}
    >
      <section className={isDetailOnly ? "signal-detail-only-shell" : "stack"}>
        {toast ? (
          <div className={`signal-toast is-${toast.tone}`} role="status" aria-live="polite">
            {toast.message}
          </div>
        ) : null}
        {pendingCsvExportMetadata && form ? (
          <CsvExportConfirmationModal
            metadata={pendingCsvExportMetadata}
            excludedPiiFields={excludedCsvPiiFields}
            labels={{
              title: t("exportReviewTitle"),
              body: t("exportReviewBody"),
              targetForm: t("targetForm"),
              targetCount: t("targetCount"),
              includedColumns: t("includedColumns"),
              includesDecryptedData: t("includesDecryptedData"),
              includesAttachmentInfo: t("includesAttachmentInfo"),
              exportedBy: t("exportedBy"),
              filterSnapshot: t("exportFilterSnapshot"),
              personalInfoOptions: t("personalInfoOptions"),
              omitWalletAddress: t("omitWalletAddress"),
              omitNotes: t("omitNotes"),
              omitAttachments: t("omitAttachments"),
              omitDecryptedAnswers: t("omitDecryptedAnswers"),
              yes: t("yes"),
              no: t("no"),
              cancel: t("cancel"),
              confirm: t("confirmExport"),
            }}
            onTogglePiiField={handleToggleCsvPiiField}
            onCancel={() => {
              setPendingCsvExportMetadata(null);
              setPendingCsvExportResponses([]);
              setPendingCsvExportOptions(null);
            }}
            onConfirm={handleConfirmCsvExport}
          />
        ) : null}
        {isDetailOnly ? (
          <article className="panel signal-detail-column">
            {!selectedSubmission ? (
              <EmptyState variant="abyss" animated={false} showVisual={false}>
                <p className="eyebrow">Signal Chamber</p>
                <h2>{t("abyssAwaitingSignalTitle")}</h2>
                <p>{t("abyssAwaitingSignalBody")}</p>
              </EmptyState>
            ) : (
              <>
                <div className="signal-detail-heading">
                  <div>
                    <Link className="ghost-button signal-back-link" to={inboxPath}>
                      {t("openInboxView")}
                    </Link>
                    <p className="eyebrow">Contributor Signal</p>
                    <h2>{getSignalSubject(selectedSubmission)}</h2>
                    <p className="muted">{formatDate(selectedSubmission.createdAt)}</p>
                  </div>
                  <div className="signal-detail-heading-support">
                    <span className="signal-chip signal-chip-soft">Review first</span>
                  </div>
                </div>

                <div className="signal-detail-meta-row">
                  <span className={`pill status-${selectedSubmission.status}`}>
                    {selectedSubmission.status}
                  </span>
                  <span className={`pill priority-${selectedSubmission.priority}`}>
                    {selectedSubmission.priority}
                  </span>
                  <span className="pill">{getTriageStatusLabel(selectedSubmission.triageStatus)}</span>
                  <span className="pill">{inferSignalCategory(selectedSubmission)}</span>
                  <span className="pill">Severity {selectedSubmission.severity ?? "medium"}</span>
                  <span className="pill">Signal Value {selectedSubmission.signalValue ?? "N/A"}</span>
                  {selectedReviewerPresence ? <span className="pill">{selectedReviewerPresence.fullLabel}</span> : null}
                  {selectedNeedsFollowUp ? <span className="pill">{t("needsFollowUpLabel")}</span> : null}
                </div>
                <div className="review-lifecycle-strip" aria-label="Signal lifecycle">
                  {getReviewLifecycleSteps(selectedSubmission, Boolean(detailAnswers)).map((step) => (
                    <span key={step.label} className={step.complete ? "is-complete" : step.active ? "is-active" : ""}>
                      <i aria-hidden="true" />
                      {step.label}
                    </span>
                  ))}
                </div>

                {renderUnlockGate()}

                <div className="signal-detail-sections review-primary-sections">
                  {renderSignalDetailCard()}
                  {renderReviewTriageCard()}
                </div>
                {renderReviewSecondaryPanels()}

              </>
            )}
          </article>
        ) : (
          <>
        <div className="panel glow-panel inbox-shell-header">
          <div>
            <p className="eyebrow">Review OS</p>
            <h1>{form.title}</h1>
            <p className="lede">{form.description || t("encryptedSignalReviewForForm")}</p>
            <p className="muted">{t("responseDeadlineLabel")}: {formatResponseDeadline(form.responseDeadline, responseDeadlineLabels)}</p>
          </div>
          <div className="inbox-header-actions">
            <Link className="ghost-button" to="/admin">
              {t("allInboxes")}
            </Link>
            <Link className="ghost-button" to={getPublicRoadmapPath(form.id, form.manifestBlobId)}>
              Open Public Roadmap
            </Link>
            <Link className="primary-button" to={getPublicFormPath(form.id, form.manifestBlobId)}>
              {t("openPublicForm")}
            </Link>
          </div>
        </div>
        <div className="review-lifecycle-strip review-lifecycle-strip-header" aria-label="Signal lifecycle">
          {["Incoming", "Protected", "Needs review", "Triaged", "Resolved"].map((step, index) => (
            <span key={step} className={index < 3 ? "is-active" : ""}>
              <i aria-hidden="true" />
              {step}
            </span>
          ))}
        </div>

        <div className="summary-grid">
          {summaryCards.map((card) => (
            <article key={card.label} className="signal-metric">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </div>

        <div className="mobile-console-banner">{t("adminDesktopNotice")}</div>

        <div className="signal-console-layout">
          <aside className="panel signal-sidebar">
            <div className="signal-sidebar-section">
              <p className="eyebrow">{t("signalStreamsTitle")}</p>
              <div className="stream-list">
                {streamItems.map((stream) => (
                  <button
                    key={stream.id}
                    type="button"
                    className={`stream-item ${selectedStreamId === stream.id ? "is-active" : ""}`}
                    onClick={() => setSelectedStreamId(stream.id)}
                  >
                    <span>{stream.label}</span>
                    <strong>{stream.count}</strong>
                  </button>
                ))}
              </div>
            </div>

            <div className="signal-sidebar-section stack">
              <div className="wallet-status-card">
                <p className="eyebrow">{t("formBlobId")}</p>
                {form.blobId ? <SignalMetaChip type="blob" value={form.blobId} /> : <strong>{t("notAvailable")}</strong>}
                {!isLocalFallbackBlob(form.blobId) ? (
                  <BlobLink blobId={form.blobId} label={t("verifyOnWalrus")} />
              ) : null}
              </div>

              <label className="review-select export-select">
                <span>{t("exportScope")}</span>
                <select
                  value={csvExportScope}
                  onChange={(event) => setCsvExportScope(event.target.value as ResponsesCsvExportScope)}
                >
                  <option value="filtered">{t("exportVisibleFilteredResponses")}</option>
                  <option value="all">{t("exportAllResponses")}</option>
                  <option value="selected">{t("exportSelectedResponses")}</option>
                </select>
              </label>
              <label className="review-select export-select">
                <span>{t("csvSortOrder")}</span>
                <select
                  value={csvSortOrder}
                  onChange={(event) => setCsvSortOrder(event.target.value as ResponsesCsvSortOrder)}
                >
                  <option value="createdAtDesc">{t("createdAtDesc")}</option>
                  <option value="createdAtAsc">{t("createdAtAsc")}</option>
                </select>
              </label>
              <button
                type="button"
                className="ghost-button"
                onClick={handleOpenCsvExportReview}
                disabled={csvExportCount === 0}
              >
                {t("exportCsv")}
              </button>
              <span className="signal-chip signal-chip-soft">{csvExportScopeLabel}</span>
              {csvExportCount === 0 ? (
                <p className="export-zero-note">{t("noResponsesMatchCurrentFilters")}</p>
              ) : null}
              <p className="export-privacy-note">
                {t("exportCsvPrivacyNote")}
              </p>
              {showSurveySummary && surveySummary ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => exportSummaryJson(form, surveySummary)}
                >
                  {t("exportSummaryJson")}
                </button>
              ) : null}
            </div>
          </aside>

          <section className="panel signal-inbox-column">
            <div className="signal-column-header">
              <div>
                <p className="eyebrow">Deep Signals Worth Tracking</p>
                <h2>{streamItems.find((stream) => stream.id === selectedStreamId)?.label}</h2>
                <p className="muted">
                  {t("unreadCountSummary", {
                    count: submissionMetrics.visibleUnread,
                    scope: t("totalCountLabel", { count: submissions.length }),
                  })}
                </p>
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("searchSignalsPlaceholder")}
              />
            </div>

            {visibleSignals.length === 0 ? (
              <EmptyState variant="abyss">
                <p className="eyebrow">Abyssal Scan</p>
                <h2>{t("abyssNoSignalsTitle")}</h2>
                <p>{t("abyssNoSignalsBody")}</p>
                <p className="muted">{t("abyssNoSignalsHint")}</p>
              </EmptyState>
            ) : (
              <>
                {isDecryptInteractionLocked ? (
                  <div className="signal-list-lock-note" role="status" aria-live="polite">
                    <strong>{listLockTitle}</strong>
                    <span>{decryptStatusMessage || t("finishOrCancelCurrentUnlock")}</span>
                    <span>{t("finishOrCancelCurrentUnlock")}</span>
                  </div>
                ) : unlockInteractionNotice ? (
                  <div className="signal-list-lock-note is-passive" role="status" aria-live="polite">
                    <strong>{unlockInteractionNotice}</strong>
                  </div>
                ) : null}
              <div className="signal-list" aria-busy={isDecryptInteractionLocked}>
                {visibleSignals.map((submission) => {
                  const category = inferSignalCategory(submission);
                  const isSelected = selectedSubmission?.id === submission.id;
                  const isActiveUnlockTarget = activeUnlockSubmissionId === submission.id;
                  return (
                    <button
                      key={submission.id}
                      type="button"
                      className={`signal-card ${isSelected ? "is-active" : ""} ${submission.status === "unread" ? "is-unread" : "is-read"} ${isDecryptInteractionLocked ? "is-locked" : ""} ${isActiveUnlockTarget ? "is-unlocking" : ""}`}
                      onClick={() => void handleSelect(submission)}
                      aria-disabled={isDecryptInteractionLocked}
                    >
                      <div className="signal-card-topline">
                        <strong>{getSignalSubject(submission)}</strong>
                        <span className="signal-card-topline-meta">
                          {isSelected ? <span className="signal-card-selection-badge">{t("selectedLabel")}</span> : null}
                          <span className="signal-card-time">{formatDate(submission.createdAt)}</span>
                        </span>
                      </div>
                      <p className="signal-card-form">{form.title}</p>
                      <p className="signal-card-preview">{getSignalPreview(submission)}</p>
                      <div className="signal-badge-row">
                        <SignalStatusBadges
                          submission={submission}
                          category={category}
                          showEncrypted
                          reviewerHint={getReviewerPresenceText(submission, wallet.accountAddress)}
                          needsFollowUp={hasNeedsFollowUp(submission)}
                        />
                        {isActiveUnlockTarget ? (
                          <span className="signal-chip signal-chip-soft">
                            {decryptState === "waiting_wallet_approval"
                              ? t("walletApprovalPendingStatus")
                              : t("unlockInProgressStatus")}
                          </span>
                        ) : null}
                        <span className="signal-chip">{getTriageStatusLabel(submission.triageStatus)}</span>
                        {submission.severity ? (
                          <span className="signal-chip">Severity {submission.severity}</span>
                        ) : null}
                        {getSubmissionRespondentMeta(submission).isAnonymous ? (
                          <span className="signal-chip">Anonymous respondent</span>
                        ) : (
                          <SignalMetaChip type="contributor" value={getRespondentDisplayLabel(submission)} />
                        )}
                        {typeof submission.signalValue === "number" ? (
                          <span className="signal-chip">Signal Value {submission.signalValue}/5</span>
                        ) : null}
                        {typeof submission.ratingValue === "number" ? (
                          <span className="signal-chip">
                            {t("ratingLabel", { value: submission.ratingValue })}
                          </span>
                        ) : null}
                      </div>
                      <div className="signal-card-lifecycle" aria-label="Signal lifecycle">
                        {getReviewLifecycleSteps(submission, selectedSubmission?.id === submission.id && Boolean(detailAnswers)).map((step) => (
                          <span key={step.label} className={step.complete ? "is-complete" : step.active ? "is-active" : ""}>
                            <i aria-hidden="true" />
                            {step.label}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
              </>
            )}
          </section>

          <article className="panel signal-detail-column">
            {!selectedSubmission ? (
              <EmptyState variant="abyss" animated={false} showVisual={false}>
                <p className="eyebrow">Signal Chamber</p>
                <h2>{t("abyssAwaitingSignalTitle")}</h2>
                <p>{t("abyssAwaitingSignalBody")}</p>
              </EmptyState>
            ) : (
              <>
                <div className="signal-detail-heading">
                  <div>
                    <p className="eyebrow">Contributor Signal</p>
                    <h2>{getSignalSubject(selectedSubmission)}</h2>
                    <p className="muted">{formatDate(selectedSubmission.createdAt)}</p>
                  </div>
                  <div className="signal-detail-heading-support">
                    <span className="signal-chip signal-chip-soft">Review first</span>
                  </div>
                </div>

                <div className="signal-detail-meta-row">
                  <span className={`pill status-${selectedSubmission.status}`}>
                    {selectedSubmission.status}
                  </span>
                  <span className={`pill priority-${selectedSubmission.priority}`}>
                    {selectedSubmission.priority}
                  </span>
                  <span className="pill">{getTriageStatusLabel(selectedSubmission.triageStatus)}</span>
                  <span className="pill">{inferSignalCategory(selectedSubmission)}</span>
                  <span className="pill">Severity {selectedSubmission.severity ?? "medium"}</span>
                  <span className="pill">Signal Value {selectedSubmission.signalValue ?? "N/A"}</span>
                  {selectedReviewerPresence ? <span className="pill">{selectedReviewerPresence.fullLabel}</span> : null}
                  {selectedNeedsFollowUp ? <span className="pill">{t("needsFollowUpLabel")}</span> : null}
                </div>
                <div className="review-lifecycle-strip" aria-label="Signal lifecycle">
                  {getReviewLifecycleSteps(selectedSubmission, Boolean(detailAnswers)).map((step) => (
                    <span key={step.label} className={step.complete ? "is-complete" : step.active ? "is-active" : ""}>
                      <i aria-hidden="true" />
                      {step.label}
                    </span>
                  ))}
                </div>

                {renderUnlockGate()}

                <div className="signal-detail-sections review-primary-sections">
                  {renderSignalDetailCard()}
                  {renderReviewTriageCard()}
                </div>
                {renderReviewSecondaryPanels()}


              </>
            )}
          </article>
        </div>
          </>
        )}
      </section>
    </AdminAccessGate>
  );
}
