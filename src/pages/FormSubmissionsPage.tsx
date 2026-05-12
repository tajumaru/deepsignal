import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { BlobLink } from "../components/BlobLink";
import { EmptyState } from "../components/EmptyState";
import { PrivateSignalUnlockCard } from "../components/PrivateSignalUnlockCard";
import { SignalMetaChip } from "../components/SignalMetaChip";
import { useAccessControl } from "../hooks/useAccessControl";
import { getAttachmentDownloadHref, useAttachmentPreviews } from "../hooks/useAttachmentPreviews";
import { getSealRuntimeStatus } from "../crypto/cryptoFactory";
import { REAL_SEAL_SESSION_TTL_MIN } from "../crypto/sealPayload";
import { useI18n } from "../i18n";
import { getReviewAccessState } from "../lib/adminAccess";
import { exportSubmissionJson, exportSubmissionsCsv, exportSummaryJson } from "../lib/export";
import { getPublicFormPath, getPublicRoadmapPath } from "../lib/publicLinks";
import { getRespondentDisplayLabel, getSubmissionRespondentMeta } from "../lib/respondentMeta";
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
  resolveSubmissionAnswers,
  storageAdapter,
} from "../lib/storage";
import { buildSurveySummary } from "../lib/surveySummary";
import { formatDate, flattenAnswer } from "../lib/utils";
import type { FormSchema, Submission } from "../types";

type StreamId =
  | "all"
  | "unread"
  | "encrypted"
  | "high"
  | "planned"
  | "in_progress"
  | "fixed"
  | "bug"
  | "feature"
  | "survey"
  | "archived";

function getDecryptStatusMessage(
  status: "waiting_wallet_approval" | "decrypting_private_signal" | "finishing",
) {
  switch (status) {
    case "waiting_wallet_approval":
      return "Waiting for wallet approval...";
    case "decrypting_private_signal":
      return "Decrypting private signal...";
    case "finishing":
      return "Finishing...";
  }
}

function isAttachmentFieldType(type: FormSchema["fields"][number]["type"]) {
  return type === "screenshot" || type === "video";
}

function matchesStream(submission: Submission, streamId: StreamId) {
  const category = inferSignalCategory(submission);
  switch (streamId) {
    case "unread":
      return submission.status === "unread";
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

export function FormSubmissionsPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const signPersonalMessage = useSignPersonalMessage();
  const updateSignalStatusTx = useSignAndExecuteTransaction();
  const { capabilityProfile, isLoadingAccess } = useAccessControl(account?.address);
  const location = useLocation();
  const { formId = "", submissionId = "" } = useParams();
  const sealRuntime = getSealRuntimeStatus();
  const sealRuntimeLabel = sealRuntime.isFallback
    ? "FALLBACK"
    : sealRuntime.activeMode.toUpperCase();
  const [form, setForm] = useState<FormSchema | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSignalId, setSelectedSignalId] = useState(submissionId);
  const [selectedStreamId, setSelectedStreamId] = useState<StreamId>("all");
  const [search, setSearch] = useState("");
  const [detailAnswers, setDetailAnswers] = useState<Record<string, unknown> | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<Submission["attachments"]>([]);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptStatusMessage, setDecryptStatusMessage] = useState("");
  const [decryptError, setDecryptError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [statusDraft, setStatusDraft] = useState<Submission["status"]>("unread");
  const [triageStatusDraft, setTriageStatusDraft] = useState<Submission["triageStatus"]>("new");
  const [priorityDraft, setPriorityDraft] = useState<Submission["priority"]>("medium");
  const [signalValueDraft, setSignalValueDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [draftTag, setDraftTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const saveQueueRef = useRef(Promise.resolve());
  const decryptInFlightRef = useRef(false);
  const decryptRequestIdRef = useRef(0);
  const activeDecryptRequestRef = useRef<{ requestId: number; submissionId: string } | null>(null);
  const selectedSignalIdRef = useRef(selectedSignalId);
  const previousSelectedSubmissionIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedSignalIdRef.current = selectedSignalId;
  }, [selectedSignalId]);

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
  const attachmentDecryptContext = useMemo(
    () => ({
      walletAddress: account?.address,
      projectId: form?.projectId,
      suiClient,
      signPersonalMessage: async (message: Uint8Array) => {
        const result = await signPersonalMessage.mutateAsync({ message });
        return result.signature;
      },
    }),
    [account?.address, form?.projectId, signPersonalMessage, suiClient],
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
                      {attachment.type} ﾂｷ {Math.round(attachment.size / 1024)} KB
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
                      <BlobLink blobId={attachment.blobId} label={t("verifyOnWalrus")} />
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
      setDetailAnswers(null);
      setDetailAttachments([]);
      setNotesDraft("");
      setDecryptError("");
      setSaveError("");
      setSaveState("idle");
      if (!decryptInFlightRef.current) {
        setDecryptStatusMessage("");
      }
      previousSelectedSubmissionIdRef.current = null;
      return;
    }
    const previousSelectedSubmissionId = previousSelectedSubmissionIdRef.current;
    const didSelectionChange = previousSelectedSubmissionId !== selectedSubmission.id;
    previousSelectedSubmissionIdRef.current = selectedSubmission.id;
    setNotesDraft(selectedSubmission.notes);
    setStatusDraft(selectedSubmission.status);
    setTriageStatusDraft(selectedSubmission.triageStatus);
    setPriorityDraft(selectedSubmission.priority);
    setSignalValueDraft(
      typeof selectedSubmission.signalValue === "number"
        ? selectedSubmission.signalValue.toString()
        : "",
    );
    if (didSelectionChange) {
      setDetailAnswers(selectedSubmission.isEncrypted ? null : selectedSubmission.answers);
      setDetailAttachments(selectedSubmission.attachments ?? []);
      setDecryptError("");
      if (!decryptInFlightRef.current) {
        setDecryptStatusMessage("");
      }
    }
    setSaveError("");
  }, [selectedSubmission]);

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
        let successMessage = "Review controls saved.";
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
      return;
    }
    setSelectedSignalId(submission.id);
  }

  async function handleDecrypt() {
    if (!form || !selectedSubmission || decryptInFlightRef.current) {
      return;
    }
    const requestId = decryptRequestIdRef.current + 1;
    decryptRequestIdRef.current = requestId;
    const submissionId = selectedSubmission.id;
    decryptInFlightRef.current = true;
    activeDecryptRequestRef.current = { requestId, submissionId };
    setDecrypting(true);
    setDecryptStatusMessage("Waiting for wallet approval...");
    setDecryptError("");
    try {
      const resolved = await resolveSubmissionAnswers(form, selectedSubmission, undefined, {
        walletAddress: account?.address,
        projectId: form.projectId,
        suiClient,
        signPersonalMessage: async (message) => {
          const result = await signPersonalMessage.mutateAsync({ message });
          return result.signature;
        },
        onStatusChange: (status) => {
          const activeRequest = activeDecryptRequestRef.current;
          if (
            activeRequest?.requestId !== requestId ||
            activeRequest.submissionId !== submissionId
          ) {
            return;
          }
          setDecryptStatusMessage(getDecryptStatusMessage(status));
        },
      });
      const isLatestRequest =
        activeDecryptRequestRef.current?.requestId === requestId &&
        activeDecryptRequestRef.current?.submissionId === submissionId;
      if (resolved && isLatestRequest && selectedSignalIdRef.current === submissionId) {
        setDetailAnswers(resolved.answers);
        setDetailAttachments(resolved.attachments);
      }
    } catch (error) {
      const isLatestRequest =
        activeDecryptRequestRef.current?.requestId === requestId &&
        activeDecryptRequestRef.current?.submissionId === submissionId;
      if (isLatestRequest && selectedSignalIdRef.current === submissionId) {
        setDecryptError(error instanceof Error ? error.message : t("decryptFailed"));
      }
    } finally {
      const isLatestRequest =
        activeDecryptRequestRef.current?.requestId === requestId &&
        activeDecryptRequestRef.current?.submissionId === submissionId;
      if (isLatestRequest) {
        activeDecryptRequestRef.current = null;
      }
      decryptInFlightRef.current = false;
      setDecrypting(false);
      setDecryptStatusMessage("");
    }
  }

  async function handleSaveReviewControls() {
    if (!selectedSubmission) {
      return;
    }
    await updateSubmission(
      {
        ...selectedSubmission,
        status: statusDraft,
        triageStatus: triageStatusDraft,
        priority: priorityDraft,
        signalValue: signalValueDraft ? Number(signalValueDraft) : undefined,
        notes: notesDraft,
      },
      { notifyOnSuccess: true },
    );
  }

  const streamItems = [
    { id: "all", label: t("allSignals"), count: submissions.length },
    {
      id: "unread",
      label: t("unreadSignals"),
      count: submissions.filter((submission) => submission.status === "unread").length,
    },
    {
      id: "encrypted",
      label: t("encryptedSignals"),
      count: submissions.filter((submission) => submission.isEncrypted).length,
    },
    {
      id: "high",
      label: t("highPrioritySignals"),
      count: submissions.filter((submission) => submission.priority === "high").length,
    },
    {
      id: "planned",
      label: "Planned Signals",
      count: submissions.filter((submission) => submission.triageStatus === "planned").length,
    },
    {
      id: "in_progress",
      label: "In Progress",
      count: submissions.filter((submission) => submission.triageStatus === "in_progress").length,
    },
    {
      id: "fixed",
      label: "Fixed Signals",
      count: submissions.filter((submission) => submission.triageStatus === "fixed").length,
    },
    {
      id: "bug",
      label: t("bugReports"),
      count: submissions.filter((submission) => inferSignalCategory(submission) === "Bug").length,
    },
    {
      id: "feature",
      label: t("featureRequests"),
      count: submissions.filter((submission) => inferSignalCategory(submission) === "Feature").length,
    },
    {
      id: "survey",
      label: t("surveys"),
      count: submissions.filter((submission) => inferSignalCategory(submission) === "Survey").length,
    },
    {
      id: "archived",
      label: t("archivedSignals"),
      count: submissions.filter((submission) => submission.status === "archived").length,
    },
  ] satisfies Array<{ id: StreamId; label: string; count: number }>;

  const summaryCards = [
    { label: "Total signals", value: submissions.length },
    {
      label: "New signals",
      value: submissions.filter((submission) => submission.triageStatus === "new").length,
    },
    {
      label: "Planned",
      value: submissions.filter((submission) => submission.triageStatus === "planned").length,
    },
    {
      label: "Fixed",
      value: submissions.filter((submission) => submission.triageStatus === "fixed").length,
    },
    {
      label: "Clustered",
      value: submissions.filter((submission) => Boolean(submission.clusterId)).length,
    },
    {
      label: "High value signals",
      value: submissions.filter((submission) => (submission.signalValue ?? 0) >= 4).length,
    },
    {
      label: "Average signal value",
      value:
        submissions.filter((submission) => typeof submission.signalValue === "number").length === 0
          ? "N/A"
          : (
              submissions.reduce((sum, submission) => sum + (submission.signalValue ?? 0), 0) /
              submissions.filter((submission) => typeof submission.signalValue === "number").length
            ).toFixed(1),
    },
  ];

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

  const access = getReviewAccessState(form, account?.address, capabilityProfile);
  const surveySummary = buildSurveySummary(form, submissions);
  const showSurveySummary =
    form.purpose === "survey" ||
    submissions.some((submission) => inferSignalCategory(submission) === "Survey");
  const activeForm = form as FormSchema;
  const resolvedDetailAnswers = detailAnswers ?? {};
  const isDecryptInteractionLocked = decrypting || decryptInFlightRef.current;
  const previewAnswerFields = detailAnswers
    ? activeForm.fields.filter((field) => {
        if (isAttachmentFieldType(field.type)) {
          return false;
        }
        const value = flattenAnswer(resolvedDetailAnswers[field.id]).trim();
        return Boolean(value);
      }).slice(0, 3)
    : [];
  const isDetailOnly = Boolean(submissionId);
  const inboxPath = `${
    location.pathname.startsWith("/dashboard") ? "/dashboard" : "/admin"
  }/forms/${formId}`;
  const unlockDisabledReason = detailAnswers
    ? undefined
    : !selectedSubmission?.isEncrypted
      ? t("privateSignalUnlockUnavailable")
      : !account?.address
        ? t("privateSignalUnlockDisabled")
        : undefined;

  return (
    <AdminAccessGate
      hasWallet={Boolean(account?.address)}
      access={access}
      legacyMessage={t("legacyDemoFormBody")}
      deniedBody={
        capabilityProfile.isConfigured
          ? "OwnerCap / AdminCap / ReviewerCap を持つウォレットだけが review 操作を実行できます。"
          : undefined
      }
    >
      <section className={isDetailOnly ? "signal-detail-only-shell" : "stack"}>
        {toast ? (
          <div className={`signal-toast is-${toast.tone}`} role="status" aria-live="polite">
            {toast.message}
          </div>
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
                      Back to inbox
                    </Link>
                    <p className="eyebrow">Contributor Signal</p>
                    <h2>{getSignalSubject(selectedSubmission)}</h2>
                    <p className="muted">{formatDate(selectedSubmission.createdAt)}</p>
                  </div>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => exportSubmissionJson(form, selectedSubmission)}
                    >
                      {t("exportJson")}
                    </button>
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
                </div>

                {selectedSubmission.isEncrypted ? (
                  <PrivateSignalUnlockCard
                    onUnlock={() => void handleDecrypt()}
                    isDecrypting={isDecryptInteractionLocked}
                    isUnlocked={Boolean(detailAnswers)}
                    errorMessage={decryptError}
                    disabledReason={unlockDisabledReason}
                  >
                    {!isLocalFallbackBlob(selectedSubmission.encryptedBlobId) ? (
                      <BlobLink
                        blobId={selectedSubmission.encryptedBlobId}
                        label={t("verifyOnWalrus")}
                      />
                    ) : null}
                  </PrivateSignalUnlockCard>
                ) : null}

                {selectedSubmission.isEncrypted && !detailAnswers ? (
                  <div className="stack">
                    <p className="muted">Seal Runtime: {sealRuntimeLabel}</p>
                    <p className="muted">
                      {sealRuntime.activeMode === "mock"
                        ? `${t("demoDecryptAvailable")} Mock mode only.`
                        : t("walletApprovalReuseNotice", { minutes: REAL_SEAL_SESSION_TTL_MIN })}
                    </p>
                    {decryptStatusMessage ? (
                      <p className="muted" role="status" aria-live="polite">{decryptStatusMessage}</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="signal-detail-sections">
                  <section className="answer-card">
                    <h3>Signal Detail</h3>
                    {detailAnswers ? (
                      <div className="stack">
                        {previewAnswerFields.map((field) => (
                          <div key={field.id} className="answer-line">
                            <strong>{field.label}</strong>
                            <p>{flattenAnswer(detailAnswers[field.id]) || t("noAnswerLabel")}</p>
                          </div>
                        ))}
                        {renderAttachmentCards(detailAttachments)}
                        {activeForm.fields.length > previewAnswerFields.length ? (
                          <p className="muted">Open Answers to view the full response.</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="muted">{t("encryptedFeedbackHidden")}</p>
                    )}
                  </section>

                  <section className="answer-card">
                    <div className="section-row">
                      <h3>Review Controls</h3>
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
                    <label>
                      <span>Note</span>
                      <textarea
                        rows={5}
                        value={notesDraft}
                        onChange={(event) => setNotesDraft(event.target.value)}
                        placeholder={t("captureReviewNotes")}
                      />
                    </label>
                    <div className="review-controls-actions">
                      <button
                        type="button"
                        className="primary-button"
                        disabled={saveState === "saving"}
                        onClick={() => void handleSaveReviewControls()}
                      >
                        Save Review Controls
                      </button>
                    </div>
                  </section>
                </div>
              </>
            )}
          </article>
        ) : (
          <>
        <div className="panel glow-panel inbox-shell-header">
          <div>
            <p className="eyebrow">Signal Triage</p>
            <h1>{form.title}</h1>
            <p className="lede">{form.description || t("encryptedSignalReviewForForm")}</p>
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

              <button
                type="button"
                className="ghost-button"
                onClick={() => exportSubmissionsCsv(form, submissions)}
                disabled={submissions.length === 0}
              >
                {t("exportCsv")}
              </button>
              {showSurveySummary ? (
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
                    count: visibleSignals.filter((submission) => submission.status === "unread").length,
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
              <div className="signal-list">
                {visibleSignals.map((submission) => {
                  const category = inferSignalCategory(submission);
                  const isSelected = selectedSubmission?.id === submission.id;
                  return (
                    <button
                      key={submission.id}
                      type="button"
                      className={`signal-card ${isSelected ? "is-active" : ""} ${submission.status === "unread" ? "is-unread" : "is-read"}`}
                      onClick={() => void handleSelect(submission)}
                      disabled={isDecryptInteractionLocked}
                    >
                      <div className="signal-card-topline">
                        <strong>{getSignalSubject(submission)}</strong>
                        <span>{formatDate(submission.createdAt)}</span>
                      </div>
                      <p className="signal-card-form">{form.title}</p>
                      <p className="signal-card-preview">{getSignalPreview(submission)}</p>
                      <div className="signal-badge-row">
                        <span className="signal-chip">{category}</span>
                        <span className="signal-chip">{getTriageStatusLabel(submission.triageStatus)}</span>
                        {submission.severity ? (
                          <span className="signal-chip">Severity {submission.severity}</span>
                        ) : null}
                        {submission.clusterId ? (
                          <span className="signal-chip signal-chip-accent">
                            Clustered
                          </span>
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
                        {submission.isEncrypted ? (
                          <span className="signal-chip signal-chip-accent">
                            {t("encryptedSignalLabel")}
                          </span>
                        ) : null}
                        {submission.status === "unread" ? (
                          <span className="signal-chip signal-chip-accent">
                            {t("newSignalLabel")}
                          </span>
                        ) : null}
                        {submission.priority === "high" ? (
                          <span className="signal-chip signal-chip-warn">
                            {t("highPrioritySignals")}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
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
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => exportSubmissionJson(form, selectedSubmission)}
                    >
                      {t("exportJson")}
                    </button>
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
                </div>

                {selectedSubmission.isEncrypted ? (
                  <PrivateSignalUnlockCard
                    onUnlock={() => void handleDecrypt()}
                    isDecrypting={isDecryptInteractionLocked}
                    isUnlocked={Boolean(detailAnswers)}
                    errorMessage={decryptError}
                    disabledReason={unlockDisabledReason}
                  >
                    {!isLocalFallbackBlob(selectedSubmission.encryptedBlobId) ? (
                      <BlobLink
                        blobId={selectedSubmission.encryptedBlobId}
                        label={t("verifyOnWalrus")}
                      />
                    ) : null}
                  </PrivateSignalUnlockCard>
                ) : null}

                {selectedSubmission.isEncrypted && !detailAnswers ? (
                  <div className="stack">
                    <p className="muted">Seal Runtime: {sealRuntimeLabel}</p>
                    <p className="muted">
                      {sealRuntime.activeMode === "mock"
                        ? `${t("demoDecryptAvailable")} Mock mode only.`
                        : t("walletApprovalReuseNotice", { minutes: REAL_SEAL_SESSION_TTL_MIN })}
                    </p>
                    {decryptStatusMessage ? (
                      <p className="muted" role="status" aria-live="polite">{decryptStatusMessage}</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="signal-detail-sections">
                  <section className="answer-card">
                    <h3>Signal Detail</h3>
                    {detailAnswers ? (
                      <div className="stack">
                        {previewAnswerFields.map((field) => (
                          <div key={field.id} className="answer-line">
                            <strong>{field.label}</strong>
                            <p>{flattenAnswer(resolvedDetailAnswers[field.id]) || t("noAnswerLabel")}</p>
                          </div>
                        ))}
                        {renderAttachmentCards(detailAttachments)}
                        {activeForm.fields.length > previewAnswerFields.length ? (
                          <p className="muted">Open Answers to view the full response.</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="muted">{t("encryptedFeedbackHidden")}</p>
                    )}
                  </section>

                  <section className="answer-card">
                    <div className="section-row">
                      <h3>Review Controls</h3>
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
                    <label>
                      <span>{t("status")}</span>
                      <select
                        value={selectedSubmission.status}
                        onChange={(event) =>
                          void updateSubmission({
                            ...selectedSubmission,
                            status: event.target.value as Submission["status"],
                          })
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
                        value={selectedSubmission.triageStatus}
                        onChange={(event) =>
                          void updateSubmission({
                            ...selectedSubmission,
                            triageStatus: event.target.value as Submission["triageStatus"],
                          })
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
                        value={selectedSubmission.priority}
                        onChange={(event) =>
                          void updateSubmission({
                            ...selectedSubmission,
                            priority: event.target.value as Submission["priority"],
                          })
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
                        value={selectedSubmission.signalValue?.toString() ?? ""}
                        onChange={(event) =>
                          void updateSubmission({
                            ...selectedSubmission,
                            signalValue: event.target.value ? Number(event.target.value) : undefined,
                          })
                        }
                      >
                        <option value="">Not scored</option>
                        {[1, 2, 3, 4, 5].map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  </section>
                </div>

                {selectedSubmission ? (
                <div className="signal-detail-sections">
                  {showSurveySummary ? (
                    <section className="answer-card">
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

                  <section className="answer-card">
                    <h3>{t("attachments")}</h3>
                    {detailAttachments.length === 0 ? (
                      <p className="muted">{t("noAttachments")}</p>
                    ) : (
                      <div className="stack">
                        {detailAttachments.map((attachment) => (
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
                                {attachment.type} · {Math.round(attachment.size / 1024)} KB
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
                                <BlobLink blobId={attachment.blobId} label={t("verifyOnWalrus")} />
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
                    )}
                  </section>

                  <section className="answer-card" hidden>
                    <div className="section-row">
                      <h3>{t("tags")}</h3>
                      <span className="muted">{selectedSubmission.tags.length}</span>
                    </div>
                    <div className="pill-row">
                      {selectedSubmission.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="tag-pill"
                          onClick={() =>
                            void updateSubmission({
                              ...selectedSubmission,
                              tags: selectedSubmission.tags.filter((item) => item !== tag),
                            })
                          }
                        >
                          {tag} ×
                        </button>
                      ))}
                    </div>
                    <div className="inline-actions">
                      <input
                        value={draftTag}
                        onChange={(event) => setDraftTag(event.target.value)}
                        placeholder={t("addTagPlaceholder")}
                      />
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={!draftTag.trim() || saveState === "saving"}
                        onClick={() => {
                          const nextTag = draftTag.trim();
                          if (selectedSubmission.tags.includes(nextTag)) {
                            setDraftTag("");
                            return;
                          }
                          setDraftTag("");
                          void updateSubmission({
                            ...selectedSubmission,
                            tags: [...selectedSubmission.tags, nextTag],
                          });
                        }}
                      >
                        {t("addTag")}
                      </button>
                    </div>
                  </section>

                  <section className="answer-card">
                    <h3>{t("internalNotes")}</h3>
                    <textarea
                      rows={6}
                      value={notesDraft}
                      onChange={(event) => setNotesDraft(event.target.value)}
                      placeholder={t("captureReviewNotes")}
                    />
                    <button
                      type="button"
                      className="primary-button"
                      disabled={saveState === "saving"}
                      onClick={() =>
                        void updateSubmission({
                          ...selectedSubmission,
                          notes: notesDraft,
                        })
                      }
                    >
                      {t("saveNote")}
                    </button>
                  </section>

                </div>
                ) : null}
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
