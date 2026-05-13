import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CreateFormLink } from "../components/CreateFormLink";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { BlobLink } from "../components/BlobLink";
import { EmptyState } from "../components/EmptyState";
import { OperationsStatusRail, type OperationsStatusItem } from "../components/OperationsStatusRail";
import { PrivateSignalUnlockCard } from "../components/PrivateSignalUnlockCard";
import { SealStatusCard } from "../components/SealStatusCard";
import { ShareCard } from "../components/ShareCard";
import { SignalClusterPanel } from "../components/SignalClusterPanel";
import { SignalStatusBadges } from "../components/SignalStatusBadges";
import { SignalMetaChip, SignalMetaRow } from "../components/SignalMetaChip";
import { getSealRuntimeStatus } from "../crypto/cryptoFactory";
import { usePrivateSignalDecrypt } from "../features/admin/hooks/usePrivateSignalDecrypt";
import { useProjectWorkspace } from "../features/admin/hooks/useProjectWorkspace";
import {
  useSignalInboxData,
  type SignalRecord,
  type StreamId,
} from "../features/admin/hooks/useSignalInboxData";
import { getAttachmentDownloadHref, useAttachmentPreviews } from "../hooks/useAttachmentPreviews";
import { useAccessControl } from "../hooks/useAccessControl";
import { useI18n } from "../i18n";
import {
  createMetadataDigest,
  registerSignalReceipt,
} from "../lib/projectRegistry";
import {
  canAdmin,
  canReview,
  getAdminSurfaceAccessState,
  getRoleLabel,
} from "../lib/adminAccess";
import { getTriageStatusLabel, TRIAGE_STATUS_OPTIONS } from "../lib/signalOps";
import { exportSubmissionJson, exportSubmissionsCsv } from "../lib/export";
import { getEncryptedPayloadAvailabilityLabel, hasDedicatedEncryptedPayloadBlob } from "../lib/encryptionDisplay";
import { getPublicFormPath, getPublicRoadmapPath } from "../lib/publicLinks";
import { formatResponseDeadline, type ResponseDeadlineLabels } from "../lib/responseDeadline";
import { getRespondentDisplayLabel, getSubmissionRespondentMeta } from "../lib/respondentMeta";
import {
  getSignalPreview,
  getSignalSubject,
  getStorageBadgeLabel,
  getWalletAccessLabel,
  isLocalFallbackBlob,
} from "../lib/signalInbox";
import {
  normalizeSubmission,
  storageAdapter,
} from "../lib/storage";
import { flattenAnswer, formatDate } from "../lib/utils";
import { getStorageRuntimeStatus } from "../storage/storageFactory";
import type { FormSchema, Submission } from "../types";

const ROADMAP_READY_STATUSES = new Set<Submission["triageStatus"]>([
  "planned",
  "in_progress",
  "fixed",
]);

function isAttachmentFieldType(type: FormSchema["fields"][number]["type"]) {
  return type === "screenshot" || type === "video";
}

function formatWorkspaceCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatAccessLabel(roleLabel: string) {
  return `${roleLabel} access`;
}

export function AdminDashboardPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const {
    capabilityProfile,
    isPending: isLoadingCapabilities,
    isLoadingAccess,
  } = useAccessControl(account?.address);
  const registerSignalReceiptTx = useSignAndExecuteTransaction();
  const sealRuntime = getSealRuntimeStatus();
  const storageRuntime = getStorageRuntimeStatus();
  const responseDeadlineLabels: ResponseDeadlineLabels = {
    noLimit: t("responseDeadlineNone"),
    closed: t("responseDeadlineClosed"),
    hoursLeft: (hours) => t("responseDeadlineHoursLeft", { count: hours }),
    daysLeft: (days) => t("responseDeadlineDaysLeft", { count: days }),
  };
  const [saving, setSaving] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [draftTag, setDraftTag] = useState("");
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [deletingVisibleNodes, setDeletingVisibleNodes] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showEncryptedSignal, setShowEncryptedSignal] = useState(false);
  const [nodeDirectoryOpen, setNodeDirectoryOpen] = useState(false);
  const [beaconFormId, setBeaconFormId] = useState<string | null>(null);
  const [nodeSearch, setNodeSearch] = useState("");
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [selectedPendingSignalIds, setSelectedPendingSignalIds] = useState<string[]>([]);
  const [registeringSignalIds, setRegisteringSignalIds] = useState<string[]>([]);
  const saveQueueRef = useRef(Promise.resolve());
  const reviewInboxRef = useRef<HTMLDivElement | null>(null);
  const hasAdminAccess = canAdmin(capabilityProfile);
  const {
    forms,
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
    submissionsByFormId,
    signalIndex,
    allSignals,
    pendingSignals,
    visibleSignals,
    selectedRecord,
    applySubmissionUpdate,
  } = useSignalInboxData({
    accountAddress: account?.address,
    capabilityProfile,
  });
  const {
    projects,
    selectedProjectId,
    selectProject,
    selectedProject,
    localProjectFormsCount,
    projectMemberCount,
    manualProjectId,
    setManualProjectId,
    projectCreateName,
    setProjectCreateName,
    isCreatingProject,
    projectState,
    deletingProject,
    deletingOnchainFormIds,
    advancedProjectSettingsRef,
    manualProjectInputRef,
    projectCreateInputRef,
    deleteProjectBlockedReason,
    visibleOnchainForms,
    connectManualProject,
    revealProjectTools,
    handleCreateProject,
    handleDeleteProject,
    handleDeleteOnchainForm,
  } = useProjectWorkspace({
    accountAddress: account?.address,
    capabilityProfile,
    forms,
    loadConsole,
  });
  const {
    detailAnswers,
    detailAttachments,
    decrypting,
    decryptStatusMessage,
    decryptError,
    setDecryptError,
    decryptInFlightRef,
    decryptContext: attachmentDecryptContext,
    handleDecrypt,
    realSealSessionTtlMinutes,
  } = usePrivateSignalDecrypt({
    accountAddress: account?.address,
    selectedRecord,
    selectedSignalId,
    setToast,
    decryptFailedLabel: t("decryptFailed"),
  });
  const roleLabel = getRoleLabel(capabilityProfile);
  const accessState = getAdminSurfaceAccessState(
    "reviewer",
    account?.address,
    capabilityProfile,
  );
  const privateReviewLabel =
    sealRuntime.activeMode === "mock" ? "Private review ready" : "Private review enabled";

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function handleDelete(formId: string) {
    if (!window.confirm(t("deleteFormConfirm"))) {
      return;
    }
    setDeletingFormId(formId);
    try {
      await storageAdapter.deleteForm(formId);
      await loadConsole();
      setToast({ tone: "success", message: t("deleteNodeSuccess") });
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : t("deleteNodeFailed"),
      });
    } finally {
      setDeletingFormId(null);
    }
  }

  async function handleDeleteVisibleNodes(formIds: string[]) {
    if (formIds.length === 0) {
      return;
    }
    if (!window.confirm(t("deleteVisibleNodesConfirm", { count: formIds.length }))) {
      return;
    }
    setDeletingVisibleNodes(true);
    setDeletingFormId(null);
    try {
      await storageAdapter.deleteForms(formIds);
      await loadConsole();
      setToast({ tone: "success", message: t("deleteVisibleNodesSuccess", { count: formIds.length }) });
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : t("deleteNodeFailed"),
      });
    } finally {
      setDeletingVisibleNodes(false);
    }
  }

  useEffect(() => {
    if (!nodeDirectoryOpen && !beaconFormId) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (beaconFormId) {
          setBeaconFormId(null);
          return;
        }
        setNodeDirectoryOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [beaconFormId, nodeDirectoryOpen]);

  const selectedProjectForms = useMemo(
    () =>
      selectedProject
        ? accessibleForms.filter((form) => form.projectId === selectedProject.objectId)
        : [],
    [accessibleForms, selectedProject],
  );
  const selectedProjectSignals = useMemo(
    () =>
      selectedProject
        ? allSignals.filter((record) => record.form.projectId === selectedProject.objectId)
        : [],
    [allSignals, selectedProject],
  );
  useEffect(() => {
    setSelectedPendingSignalIds((current) =>
      current.filter((signalId) =>
        signalIndex.pendingSignalIdSet.has(signalId),
      ),
    );
  }, [signalIndex]);
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
                      <BlobLink
                        blobId={attachment.blobId}
                        label={t("verifyOnWalrus")}
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
  const roadmapReadySignals = useMemo(
    () => selectedProjectSignals.filter((record) => ROADMAP_READY_STATUSES.has(record.submission.triageStatus)),
    [selectedProjectSignals],
  );
  const protectedSelectedProjectFormsCount = selectedProjectForms.filter(
    (form) => form.encryptSubmissions,
  ).length;
  const hasProjectAndForms = Boolean(selectedProject) && selectedProjectForms.length > 0;
  const operationsStatusItems: OperationsStatusItem[] = [
    ...(!hasProjectAndForms
      ? [{
          label: "Project Connected",
          tone: selectedProject ? "ready" : "action",
          detail: selectedProject ? selectedProject.name : "Select, create, or connect a project",
        } satisfies OperationsStatusItem]
      : []),
    {
      label: "Private Signals Enabled",
      tone:
        selectedProjectForms.length === 0
          ? "pending"
          : protectedSelectedProjectFormsCount > 0
            ? "ready"
            : "warning",
      detail:
        selectedProjectForms.length === 0
          ? "No form published yet"
          : protectedSelectedProjectFormsCount > 0
            ? `${protectedSelectedProjectFormsCount} protected form${protectedSelectedProjectFormsCount === 1 ? "" : "s"} active`
            : "Forms exist, but private signal protection is off",
    },
    {
      label: "Reviewer Wallet Ready",
      tone: !account?.address ? "action" : canReview(capabilityProfile) || !capabilityProfile.isConfigured ? "ready" : "warning",
      detail: !account?.address
        ? "Connect reviewer wallet"
        : canReview(capabilityProfile) || !capabilityProfile.isConfigured
          ? `${getRoleLabel(capabilityProfile)} wallet verified`
          : "Connected wallet does not have reviewer access",
    },
    {
      label: "Walrus Sync Active",
      tone: storageRuntime.mode === "walrus" ? "ready" : "warning",
      detail: storageRuntime.mode === "walrus"
        ? "Trusted storage available"
        : "Local fallback active",
    },
    {
      label: "Pending Sui Verification",
      tone: pendingSignals.length > 0 ? "pending" : selectedProjectSignals.length > 0 ? "ready" : "pending",
      detail: pendingSignals.length > 0
        ? `${pendingSignals.length} signal${pendingSignals.length === 1 ? "" : "s"} waiting for verification`
        : selectedProjectSignals.length > 0
          ? "No pending proof registrations"
          : "Awaiting project signals",
    },
    {
      label: "Roadmap Publishing Ready",
      tone: roadmapReadySignals.length > 0 ? "ready" : selectedProjectSignals.length > 0 ? "pending" : "pending",
      detail: roadmapReadySignals.length > 0
        ? `${roadmapReadySignals.length} signal${roadmapReadySignals.length === 1 ? "" : "s"} ready for the Public Roadmap`
        : selectedProjectSignals.length > 0
          ? "Mark signals as Planned, In Progress, or Fixed"
          : "No roadmap candidates yet",
    },
  ];
  const selectedRoadmapUrl = selectedRecord
    ? getPublicRoadmapPath(selectedRecord.form.id, selectedRecord.form.manifestBlobId)
    : "";
  const isSelectedRecordOnRoadmap = selectedRecord
    ? ROADMAP_READY_STATUSES.has(selectedRecord.submission.triageStatus)
    : false;
  const selectedRecordNeedsDecrypt = Boolean(
    selectedRecord?.submission.isEncrypted && !detailAnswers,
  );
  const selectedRecordUnlockDisabledReason = detailAnswers
    ? undefined
    : !selectedRecord?.submission.isEncrypted
      ? t("privateSignalUnlockUnavailable")
      : !account?.address || (!canReview(capabilityProfile) && capabilityProfile.isConfigured)
        ? t("privateSignalUnlockDisabled")
        : undefined;
  const selectedRecordFocusAction = !selectedRecord
    ? null
    : selectedRecordNeedsDecrypt
      ? null
      : selectedRecord.submission.status === "unread"
        ? {
            eyebrow: "Next step",
            title: "Mark the signal as reviewed",
            detail: "You can read the signal now. Change the status to Read, then decide whether it should move toward the public roadmap.",
            cta: (
              <button
                type="button"
                className="primary-button"
                disabled={saving}
                onClick={() =>
                  void updateSubmission({
                    ...selectedRecord.submission,
                    status: "read",
                  })
                }
              >
                Mark reviewed
              </button>
            ),
          }
        : selectedRecord.submission.pendingOnchainRegistration
          ? {
              eyebrow: "Next step",
              title: "Optional proof: register on Sui",
              detail: "Review is already possible. Use this only when you want the signal recorded as an onchain proof entry.",
              cta: (
                <button
                  type="button"
                  className="ghost-button"
                  disabled={isRegisteringSignal(selectedRecord.submission.id)}
                  onClick={() => void handleRegisterPendingSignals([selectedRecord.submission.id])}
                >
                  {isRegisteringSignal(selectedRecord.submission.id) ? "Registering..." : "Register on Sui"}
                </button>
              ),
            }
          : !isSelectedRecordOnRoadmap
            ? {
                eyebrow: "Next step",
                title: "Decide whether this belongs on the roadmap",
                detail: "If this signal is ready for external visibility, move it into a roadmap status such as Planned, In Progress, or Fixed.",
                cta: (
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={saving}
                    onClick={() => void handleMoveToRoadmap()}
                  >
                    Move to Public Roadmap
                  </button>
                ),
              }
            : {
                eyebrow: "Next step",
                title: "This signal is already in review flow",
                detail: "You can refine notes, tags, or roadmap status, but no urgent action is required right now.",
                cta: selectedRoadmapUrl ? <Link className="ghost-button" to={selectedRoadmapUrl}>Open Public Roadmap</Link> : null,
              };
  const firstProjectForm = selectedProjectForms[0] ?? null;
  const firstProtectedSignal = selectedProjectSignals.find((record) => record.submission.isEncrypted) ?? null;
  const nextRecommendedAction =
    !selectedProject
      ? {
          label: "Connect a project",
          detail: "Create a new project or connect an existing one before you create or review private signals.",
          cta: (
            <div className="inline-actions">
              {hasAdminAccess ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => revealProjectTools("create")}
                >
                  Create project
                </button>
              ) : null}
              <button
                type="button"
                className="ghost-button"
                onClick={() => revealProjectTools("connect")}
              >
                Connect existing
              </button>
            </div>
          ),
        }
      : selectedProjectForms.length === 0
        ? {
            label: "Create your first signal inbox",
            detail: "Publish one protected form for this project so reviewers have signals to read.",
            cta: <CreateFormLink className="primary-button">Create Signal Form</CreateFormLink>,
          }
        : selectedProjectSignals.length === 0
          ? {
              label: "Send a test signal",
              detail: "Open the public form and submit one signal so the review inbox has something to process.",
              cta: firstProjectForm ? <Link className="primary-button" to={getPublicFormPath(firstProjectForm.id, firstProjectForm.manifestBlobId)}>Open Public Link</Link> : null,
            }
          : firstProtectedSignal && !detailAnswers
            ? {
                label: "Unlock private signal",
                detail: "Open the next protected signal, then decrypt it with reviewer wallet access.",
                cta: firstProtectedSignal ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={decrypting || decryptInFlightRef.current}
                  onClick={() => {
                    if (decryptInFlightRef.current) {
                      return;
                    }
                    setSelectedSignalId(firstProtectedSignal.submission.id);
                  }}
                >
                    Open Protected Signal
                  </button>
                ) : null,
              }
            : roadmapReadySignals.length === 0
                ? {
                    label: "Move to Public Roadmap",
                    detail: "Choose one reviewed signal and place it into a roadmap status such as Planned or In Progress.",
                    cta: selectedRecord ? (
                      <button
                        type="button"
                        className="primary-button"
                        disabled={saving}
                        onClick={() => void handleMoveToRoadmap()}
                      >
                        Move to Public Roadmap
                      </button>
                    ) : null,
                  }
                : pendingSignals.length > 0
                  ? {
                      label: "Register proof on Sui",
                      detail: "Review is already complete. Use Sui only when you want to add optional proof records.",
                      cta: (
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={registeringSignalIds.length > 0}
                          onClick={() => void handleRegisterPendingSignals()}
                        >
                          {registeringSignalIds.length > 0 ? "Registering..." : "Register Pending Signals"}
                        </button>
                      ),
                    }
                : {
                    label: "Review signal inbox",
                    detail: "The queue is healthy. Keep reviewing new signals and update roadmap entries as they change.",
                    cta: selectedRoadmapUrl ? <Link className="primary-button" to={selectedRoadmapUrl}>Open Public Roadmap</Link> : null,
                  };

  useEffect(() => {
    if (!selectedRecord) {
      setNotesDraft("");
      setDraftTag("");
      setShowMetadata(false);
      setShowEncryptedSignal(false);
      setDecryptError("");
      return;
    }
    setNotesDraft(selectedRecord.submission.notes);
    setDraftTag("");
    setDecryptError("");
    setShowMetadata(false);
    setShowEncryptedSignal(false);
  }, [selectedRecord, setDecryptError]);

  async function updateSubmission(nextSubmission: Submission) {
    const normalized = normalizeSubmission({
      ...nextSubmission,
      updatedAt: new Date().toISOString(),
    });
    applySubmissionUpdate(normalized);
    setSelectedSignalId(normalized.id);
    const runSave = async () => {
      setSaving(true);
      try {
        await storageAdapter.updateSubmission(normalized);
      } finally {
        setSaving(false);
      }
    };
    saveQueueRef.current = saveQueueRef.current.then(runSave, runSave);
    await saveQueueRef.current;
  }

  function isRegisteringSignal(signalId: string) {
    return registeringSignalIds.includes(signalId);
  }

  function togglePendingSelection(signalId: string) {
    setSelectedPendingSignalIds((current) =>
      current.includes(signalId)
        ? current.filter((entry) => entry !== signalId)
        : [...current, signalId],
    );
  }

  async function registerSubmissionRecordOnSui(record: SignalRecord) {
    const { form, submission } = record;
    if (
      !form.projectId ||
      typeof form.onchainFormId !== "number" ||
      !submission.receiptBlobId ||
      isLocalFallbackBlob(submission.receiptBlobId)
    ) {
      throw new Error("This signal is not eligible for Sui registration yet.");
    }

    const signalReceiptMetadataDigest = await createMetadataDigest({
      submissionId: submission.id,
      formId: submission.formId,
      createdAt: submission.createdAt,
      receiptBlobId: submission.receiptBlobId,
      attachmentBlobIds: submission.attachments.map((attachment) => attachment.blobId),
      encrypted: submission.isEncrypted,
      sealIdentity: submission.sealIdentity ?? null,
      respondentWalletAddress: submission.respondentMeta?.walletAddress ?? null,
      respondentSessionId: submission.respondentMeta?.sessionId ?? null,
      isAnonymous: submission.respondentMeta?.isAnonymous ?? true,
    });
    const tx = registerSignalReceipt({
      projectId: form.projectId,
      formId: form.onchainFormId,
      walrusBlobId: submission.receiptBlobId,
      metadataDigest: signalReceiptMetadataDigest,
      encrypted: submission.isEncrypted,
      sealIdentity: submission.sealIdentity ?? null,
    });
    const result = await registerSignalReceiptTx.mutateAsync({ transaction: tx });
    const confirmed = await suiClient.waitForTransaction({
      digest: result.digest,
      options: { showEvents: true },
    });
    const signalRegisteredEvent = (confirmed.events ?? []).find((chainEvent) =>
      String(chainEvent.type ?? "").endsWith("::SignalRegistered"),
    );
    const rawSignalId = (signalRegisteredEvent?.parsedJson as { signal_id?: string | number } | undefined)?.signal_id;
    const parsedSignalId = typeof rawSignalId === "number" ? rawSignalId : Number(rawSignalId ?? Number.NaN);
    const registeredSubmission = normalizeSubmission({
      ...submission,
      pendingOnchainRegistration: false,
      onchainSignalId: Number.isFinite(parsedSignalId) ? parsedSignalId : undefined,
      signalReceiptMetadataDigest,
      onchainStatus: "new",
      updatedAt: new Date().toISOString(),
    });
    await storageAdapter.updateSubmission(registeredSubmission);
    applySubmissionUpdate(registeredSubmission);
    return registeredSubmission;
  }

  async function handleRegisterPendingSignals(targetSignalIds?: string[]) {
    const nextTargetIds = (targetSignalIds ?? selectedPendingSignalIds).filter(Boolean);
    if (nextTargetIds.length === 0) {
      setToast({ tone: "error", message: "Select at least one pending signal first." });
      return;
    }

    const targetRecords = nextTargetIds
      .map((signalId) =>
        allSignals.find(
          (record) =>
            record.submission.id === signalId && record.submission.pendingOnchainRegistration,
        ) ?? null,
      )
      .filter((record): record is SignalRecord => Boolean(record));
    if (targetRecords.length === 0) {
      setToast({ tone: "error", message: "No pending Sui registrations were found for the selected signals." });
      return;
    }

    setRegisteringSignalIds((current) => [...new Set([...current, ...targetRecords.map((record) => record.submission.id)])]);
    const successes: string[] = [];
    const failures: string[] = [];

    for (const record of targetRecords) {
      try {
        await registerSubmissionRecordOnSui(record);
        successes.push(record.submission.id);
      } catch (error) {
        console.warn("register_signal failed from admin dashboard", error);
        failures.push(
          error instanceof Error
            ? `${getSignalSubject(record.submission)}: ${error.message}`
            : `${getSignalSubject(record.submission)}: Failed to register on Sui.`,
        );
      }
    }

    setRegisteringSignalIds((current) =>
      current.filter((signalId) => !targetRecords.some((record) => record.submission.id === signalId)),
    );
    if (successes.length > 0) {
      setSelectedPendingSignalIds((current) =>
        current.filter((signalId) => !successes.includes(signalId)),
      );
    }
    if (failures.length > 0) {
      setToast({
        tone: successes.length > 0 ? "success" : "error",
        message:
          successes.length > 0
            ? `Registered ${successes.length} signal${successes.length === 1 ? "" : "s"} on Sui. ${failures[0]}`
            : failures[0],
      });
      return;
    }
    setToast({
      tone: "success",
      message: `Registered ${successes.length} pending signal${successes.length === 1 ? "" : "s"} on Sui.`,
    });
  }

  async function handleMoveToRoadmap() {
    if (!selectedRecord) {
      return;
    }
    const nextStatus = ROADMAP_READY_STATUSES.has(selectedRecord.submission.triageStatus)
      ? selectedRecord.submission.triageStatus
      : "planned";
    await updateSubmission({
      ...selectedRecord.submission,
      triageStatus: nextStatus,
    });
    setToast({ tone: "success", message: "Signal added to the Public Roadmap." });
  }

  const streamItems = [
    { id: "all", label: "All Signals", count: allSignals.length },
    {
      id: "unread",
      label: "Unread",
      count: signalIndex.counts.unread,
    },
    {
      id: "encrypted",
      label: "Protected",
      count: signalIndex.counts.encrypted,
    },
    {
      id: "high",
      label: "Flagged",
      count: signalIndex.counts.high,
    },
    {
      id: "pending_sui",
      label: "Pending Sui",
      count: signalIndex.counts.pendingSui,
    },
    {
      id: "archived",
      label: "Resolved",
      count: signalIndex.counts.archived,
    },
  ] satisfies Array<{ id: StreamId; label: string; count: number }>;
  const unreadCountByFormId = signalIndex.unreadCountByFormId;

  const selectedForm = accessibleForms.find((form) => form.id === selectedFormId) ?? null;
  const selectedBeaconForm =
    accessibleForms.find((form) => form.id === beaconFormId) ?? null;
  const formById = useMemo(
    () =>
      Object.fromEntries(accessibleForms.map((form) => [form.id, form])) as Record<
        string,
        FormSchema | undefined
      >,
    [accessibleForms],
  );
  const formTitleById = useMemo(
    () =>
      Object.fromEntries(accessibleForms.map((form) => [form.id, form.title])) as Record<
        string,
        string | undefined
      >,
    [accessibleForms],
  );
  const clusterCountById = signalIndex.clusterCountById;
  const inferredAiConfidence = selectedRecord
    ? selectedRecord.submission.aiSummary
      ? selectedRecord.submission.keywords?.length
        ? "High"
        : "Medium"
      : detailAnswers
        ? "Medium"
        : "Low"
    : "Low";
  const workspaceMetaItems = [
    formatWorkspaceCount(selectedProject ? selectedProject.formsCount : accessibleForms.length, "Form"),
    formatWorkspaceCount(selectedProject ? selectedProject.signalsCount : allSignals.length, "Signal"),
    formatWorkspaceCount(projectMemberCount || 1, "Member"),
    selectedProject ? "Protected" : "Local mode",
    formatAccessLabel(roleLabel),
  ];
  const selectedFormSubmissionCount = selectedRecord ? (submissionsByFormId[selectedRecord.form.id] ?? []).length : 0;
  const activeScopeLabel =
    selectedFormId === "all" ? t("allSignalNodes") : selectedForm?.title ?? t("selectedNode");
  const activeStreamLabel =
    streamItems.find((stream) => stream.id === selectedStreamId)?.label ?? "All Signals";
  const visibleUnreadCount = visibleSignals.filter(
    (record) => record.submission.status === "unread",
  ).length;
  const selectedPendingVisibleCount = visibleSignals.filter((record) =>
    selectedPendingSignalIds.includes(record.submission.id),
  ).length;
  const hasProjects = projects.length > 0;
  const projectIdentityDescription = selectedProject
    ? "Create forms, collect private signals, review protected responses, and publish roadmap-ready updates from one workspace."
    : "Choose or create a project, then publish your first protected form and start reviewing signals.";

  const nodeDirectoryItems = useMemo(() => {
    const normalizedSearch = nodeSearch.trim().toLowerCase();
    const allFormsItem = {
      id: "all",
      title: t("allSignalNodes"),
      submissionCount: allSignals.length,
      unreadCount: signalIndex.counts.unread,
      isLegacyDemo: false,
    };
    const formItems = accessibleForms
      .filter((form) => {
        if (!normalizedSearch) {
          return true;
        }
        return (
          form.title.toLowerCase().includes(normalizedSearch) ||
          form.description.toLowerCase().includes(normalizedSearch)
        );
      })
      .map((form) => ({
        id: form.id,
        title: form.title,
        submissionCount: form.submissionCount,
        unreadCount: unreadCountByFormId[form.id] ?? 0,
        isLegacyDemo: !form.ownerAddress,
      }));
    return [allFormsItem, ...formItems];
  }, [accessibleForms, allSignals.length, nodeSearch, signalIndex.counts.unread, t, unreadCountByFormId]);

  const deletableNodeIds = useMemo(
    () => nodeDirectoryItems.filter((item) => item.id !== "all").map((item) => item.id),
    [nodeDirectoryItems],
  );

  if (loading) {
    return <div className="panel">{t("loadingResearchLab")}</div>;
  }

  if (loadError) {
    return (
      <div className="panel stack">
        <strong>Research Lab failed to load</strong>
        <p className="warning-text">{loadError}</p>
        <button
          type="button"
          className="ghost-button"
          onClick={() => void loadConsole()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoadingAccess) {
    return <div className="panel">Checking wallet capabilities...</div>;
  }

  return (
    <AdminAccessGate
      hasWallet={Boolean(account?.address)}
      access={accessState}
      deniedBody={capabilityProfile.isConfigured ? "Only wallets with OwnerCap / AdminCap / ReviewerCap can open the review console." : undefined}
    >
      <section className="stack">
        {toast ? (
          <div className={`signal-toast is-${toast.tone}`} role="status" aria-live="polite">
            {toast.message}
          </div>
        ) : null}

        <section className="panel glow-panel workspace-hero workspace-hero-compact">
          <div className="workspace-hero-main workspace-overview-shell">
            <div className="workspace-hero-copy">
              <p className="eyebrow">{t("signalInboxTitle")}</p>
              <h1>{selectedProject ? selectedProject.name : "Contest demo workspace"}</h1>
              <div className="workspace-hero-meta">
                {workspaceMetaItems.map((item) => (
                  <span key={item} className="workspace-meta-item">
                    {item}
                  </span>
                ))}
                <span className="workspace-meta-item">{privateReviewLabel}</span>
                {isLoadingCapabilities ? (
                  <span className="workspace-meta-item">Checking wallet access...</span>
                ) : null}
              </div>
            </div>

            <aside className="workspace-action-dock">
              <div className="workspace-dock-actions">
                <CreateFormLink className="primary-button">
                  Create Form
                </CreateFormLink>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setSelectedStreamId("all");
                    setSelectedFormId("all");
                    reviewInboxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  Review
                </button>
                <Link className="ghost-button" to="/admin/access">
                  Members
                </Link>
                <button
                  type="button"
                  className="ghost-button workspace-project-trigger"
                  onClick={() => {
                    advancedProjectSettingsRef.current?.open = true;
                    advancedProjectSettingsRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                >
                  {selectedProject ? `Project: ${selectedProject.name}` : "Choose Project"}
                </button>
              </div>
            </aside>
          </div>
        </section>

        {accessibleForms.length === 0 ? (
          hasProjects ? (
          <EmptyState>
            <h2>{t("noCreatorInboxesTitle")}</h2>
            <p>{t("noCreatorInboxesBody")}</p>
            {hasAdminAccess || !capabilityProfile.isConfigured ? (
              <CreateFormLink className="primary-button">
                {t("createSignalForm")}
              </CreateFormLink>
            ) : null}
          </EmptyState>
          ) : null
        ) : (
          <section ref={reviewInboxRef} className="panel signal-inbox-workbench">
            <div className="signal-workbench-header">
              <div className="signal-workbench-copy">
                <p className="eyebrow">{t("signalInboxTitle")}</p>
                <h2>Review workspace</h2>
                <p className="muted">Streams, inbox, and detail stay visible together so triage work starts immediately.</p>
              </div>
              <div className="signal-workbench-summary">
                <span className="signal-chip">{visibleSignals.length} visible signals</span>
                <span className="signal-chip signal-chip-soft">{visibleUnreadCount} unread</span>
                <span className="signal-chip signal-chip-soft">{activeScopeLabel}</span>
              </div>
            </div>

            <div className="signal-console-layout admin-console-layout signal-console-layout-priority">
            <aside className="panel signal-sidebar">
              <div className="signal-sidebar-section">
                <div>
                  <p className="eyebrow">Streams</p>
                  <h2>Streams</h2>
                </div>
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

              <div className="signal-sidebar-section">
                <div className="section-row">
                  <p className="eyebrow">Forms</p>
                  <span className="muted">{accessibleForms.length}</span>
                </div>
                <div className="form-stream-list">
                  <button
                    type="button"
                    className={`form-stream-item ${selectedFormId === "all" ? "is-active" : ""}`}
                    onClick={() => setSelectedFormId("all")}
                  >
                    <div className="form-stream-select">
                      <strong>{t("allSignalNodes")}</strong>
                      <p className="muted">{allSignals.length} signals across every form inbox.</p>
                    </div>
                    <div className="form-stream-actions">
                      <span className="signal-chip">{visibleUnreadCount} unread</span>
                      <span className="signal-chip signal-chip-soft">{allSignals.length} total</span>
                    </div>
                  </button>
                  {accessibleForms.map((form) => {
                    const isSelected = selectedFormId === form.id;
                    const unreadCount = unreadCountByFormId[form.id] ?? 0;
                    return (
                      <button
                        key={form.id}
                        type="button"
                        className={`form-stream-item ${isSelected ? "is-active" : ""}`}
                        onClick={() => setSelectedFormId(form.id)}
                      >
                        <div className="form-stream-select">
                          <strong>{form.title}</strong>
                          <p className="muted">
                            {form.submissionCount} signals
                            {form.encryptSubmissions ? " · protected inbox" : " · open inbox"}
                          </p>
                          <p className="muted">{t("responseDeadlineLabel")}: {formatResponseDeadline(form.responseDeadline, responseDeadlineLabels)}</p>
                        </div>
                        <div className="form-stream-actions">
                          <span className="signal-chip">{unreadCount} unread</span>
                          {form.projectId ? (
                            <span className="signal-chip signal-chip-soft">Project linked</span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="signal-node-summary">
                  <div className="signal-node-summary-copy">
                    <strong>{activeScopeLabel}</strong>
                    <p className="muted">
                      {t("activeNodeSummary", { count: accessibleForms.length })}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="primary-button signal-node-directory-trigger"
                    onClick={() => setNodeDirectoryOpen(true)}
                  >
                    {t("openNodeDirectory")}
                  </button>
                </div>
              </div>

            </aside>

            <section className="panel signal-inbox-column">
              <div className="signal-column-header">
                <div className="signal-column-copy">
                  <p className="eyebrow">{t("signalInboxTitle")}</p>
                  <h2>{activeStreamLabel}</h2>
                  <p className="muted">
                    {t("unreadCountSummary", {
                      count: visibleUnreadCount,
                      scope: activeScopeLabel,
                    })}
                  </p>
                </div>
                <div className="signal-column-tools">
                  <span className="signal-chip signal-chip-soft">{visibleSignals.length} results</span>
                  <span className="signal-chip signal-chip-soft">{pendingSignals.length} pending Sui</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("searchSignalsPlaceholder")}
                  />
                </div>
              </div>
              <section className="answer-card answer-card-plain">
                <div className="section-row">
                  <div>
                    <p className="eyebrow">Pending Sui Registration</p>
                    <h3>Optional proof queue</h3>
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={selectedPendingSignalIds.length === 0 || registeringSignalIds.length > 0}
                    onClick={() => void handleRegisterPendingSignals()}
                  >
                    {registeringSignalIds.length > 0
                      ? "Registering on Sui..."
                      : `Register selected on Sui${selectedPendingVisibleCount > 0 ? ` (${selectedPendingVisibleCount})` : ""}`}
                  </button>
                </div>
                <p className="muted">Sui registration is optional proof, not required for review.</p>
              </section>

              {visibleSignals.length === 0 ? (
                <EmptyState variant="abyss">
                  <p className="eyebrow">Inbox empty</p>
                  <h2>
                    {!selectedProject
                      ? "Choose a project first"
                      : selectedProjectForms.length === 0
                        ? "Create your first signal form"
                        : "Send a test signal to start review"}
                  </h2>
                  <p>
                    {!selectedProject
                      ? "The contest flow starts with project selection so reviewer access and roadmap publishing stay scoped correctly."
                      : selectedProjectForms.length === 0
                        ? "Publish a form for this project, then open the public link so someone can submit feedback."
                        : "Open the public form, submit one test signal, then return here to review it in the inbox."}
                  </p>
                  <div className="inline-actions">
                    {!selectedProject ? null : selectedProjectForms.length === 0 ? (
                      <CreateFormLink className="primary-button">
                        Create Signal Form
                      </CreateFormLink>
                    ) : firstProjectForm ? (
                      <>
                        <Link
                          className="primary-button"
                          to={getPublicFormPath(firstProjectForm.id, firstProjectForm.manifestBlobId)}
                        >
                          Open public link
                        </Link>
                        <Link
                          className="ghost-button"
                          to={getPublicFormPath(firstProjectForm.id, firstProjectForm.manifestBlobId)}
                        >
                          Send test signal
                        </Link>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            setSelectedFormId("all");
                            setSelectedStreamId("all");
                            setSearch("");
                          }}
                        >
                          Return to admin inbox
                        </button>
                      </>
                    ) : null
                    }
                  </div>
                </EmptyState>
              ) : (
                <div className="signal-list">
                  {visibleSignals.map((record) => {
                    const { form, submission, category } = record;
                    const storageLabel = getStorageBadgeLabel(
                      submission.encryptedBlobId ?? submission.blobId,
                    );
                    const isPendingSui = submission.pendingOnchainRegistration;
                    const isSelectedForSui = selectedPendingSignalIds.includes(submission.id);
                    const isLocalOnlySignal = storageLabel === "Stored locally only";
                    return (
                      <Link
                        key={submission.id}
                        className={`signal-card ${submission.status === "unread" ? "is-unread" : "is-read"}`}
                        to={`/admin/forms/${form.id}/submissions/${submission.id}`}
                      >
                        <div className="signal-card-topline">
                          <strong>{getSignalSubject(submission)}</strong>
                          <span className="signal-card-time">{formatDate(submission.createdAt)}</span>
                        </div>
                        <p className={`signal-card-preview ${submission.isEncrypted ? "is-locked" : ""}`}>
                          {submission.isEncrypted
                            ? "Encrypted private signal. Requires reviewer access to unlock."
                            : getSignalPreview(submission)}
                        </p>
                        <div className="signal-card-formline">
                          <span className="signal-card-form">{form.title}</span>
                          {getSubmissionRespondentMeta(submission).isAnonymous ? (
                            <span className="signal-chip">Anonymous respondent</span>
                          ) : submission.contributorId ? (
                            <SignalMetaChip type="contributor" value={getRespondentDisplayLabel(submission)} />
                          ) : null}
                        </div>
                        <div className="signal-badge-row signal-badge-row-compact">
                          <SignalStatusBadges
                            submission={submission}
                            category={category}
                            pendingSui={isPendingSui}
                            selectedForSui={isSelectedForSui}
                            storageLabel={isLocalOnlySignal ? storageLabel : undefined}
                          />
                        </div>
                        {isPendingSui ? (
                          <div className="signal-card-actions">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                togglePendingSelection(submission.id);
                              }}
                            >
                              {isSelectedForSui ? "Selected" : "Select for Sui"}
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={isRegisteringSignal(submission.id)}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void handleRegisterPendingSignals([submission.id]);
                              }}
                            >
                              {isRegisteringSignal(submission.id) ? "Registering..." : "Register on Sui"}
                            </button>
                          </div>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <article className="panel signal-detail-column">
              {!selectedRecord ? (
                <EmptyState variant="abyss" animated={false} showVisual={false}>
                  <p className="eyebrow">Signal detail</p>
                  <h2>No signal selected</h2>
                  <p>Choose a signal from the inbox to review it, unlock the private message, and move it toward the Public Roadmap.</p>
                </EmptyState>
              ) : (
                <>
                  <section className="answer-card signal-detail-hero">
                    <div className="signal-detail-heading">
                    <div>
                      <p className="eyebrow">{t("signalDetailTitle")}</p>
                      <h2>{getSignalSubject(selectedRecord.submission)}</h2>
                      <p className="muted">
                        {selectedRecord.form.title} / {formatDate(selectedRecord.submission.createdAt)}
                      </p>
                      <p className="muted">Read the original signal first, then set review state, priority, notes, roadmap status, and export actions.</p>
                    </div>
                    <div className="inline-actions signal-detail-utility-actions">
                      <Link
                        className="ghost-button"
                        to={`/dashboard/forms/${selectedRecord.form.id}/submissions/${selectedRecord.submission.id}`}
                      >
                        {t("openFormInbox")}
                      </Link>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() =>
                          exportSubmissionJson(selectedRecord.form, selectedRecord.submission)
                        }
                      >
                        {t("exportJson")}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() =>
                          exportSubmissionsCsv(
                            selectedRecord.form,
                            (submissionsByFormId[selectedRecord.form.id] ?? []).map((submission) => normalizeSubmission(submission)),
                          )
                        }
                      >
                        {t("exportCsv")}
                      </button>
                      {selectedRecord.submission.pendingOnchainRegistration ? (
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={isRegisteringSignal(selectedRecord.submission.id)}
                          onClick={() => void handleRegisterPendingSignals([selectedRecord.submission.id])}
                        >
                          {isRegisteringSignal(selectedRecord.submission.id)
                            ? "Registering..."
                            : "Register on Sui"}
                        </button>
                      ) : null}
                    </div>
                    </div>

                    <div className="signal-detail-meta-row signal-badge-row-compact">
                      <span className={`pill status-${selectedRecord.submission.status}`}>
                      {selectedRecord.submission.status}
                      </span>
                      <span className={`pill priority-${selectedRecord.submission.priority}`}>
                      {selectedRecord.submission.priority}
                      </span>
                      <span className="pill">{getTriageStatusLabel(selectedRecord.submission.triageStatus)}</span>
                      <span className="signal-chip">{selectedRecord.category}</span>
                      <span className="signal-chip">
                      Severity {selectedRecord.submission.severity ?? "medium"}
                      </span>
                      <span className={`signal-chip ${detailAnswers ? "signal-chip-accent" : ""}`}>
                        {detailAnswers
                          ? "Private signal unlocked"
                          : selectedRecord.submission.isEncrypted
                            ? "Encrypted private signal"
                            : "Open submission"}
                      </span>
                      {typeof selectedRecord.submission.ratingValue === "number" ? (
                        <span className="signal-chip">
                          {t("ratingLabel", {
                            value: selectedRecord.submission.ratingValue,
                          })}
                        </span>
                      ) : null}
                      <span className="signal-chip">{selectedFormSubmissionCount} signals in this form</span>
                    </div>
                  </section>

                  {selectedRecordFocusAction ? (
                    <section className="answer-card review-focus-card">
                      <div className="review-focus-copy">
                        <p className="eyebrow">{selectedRecordFocusAction.eyebrow}</p>
                        <h3>{selectedRecordFocusAction.title}</h3>
                        <p className="muted">{selectedRecordFocusAction.detail}</p>
                      </div>
                      {selectedRecordFocusAction.cta ? (
                        <div className="review-focus-actions">{selectedRecordFocusAction.cta}</div>
                      ) : null}
                    </section>
                  ) : null}

                  <div className="signal-detail-sections">
                    <section className="answer-card original-signal-section">
                      <div className="signal-detail-group-header signal-detail-group-header-original">
                        <p className="eyebrow">Original Signal</p>
                        <h3>Original Signal</h3>
                        <p className="muted">Read the submitted feedback first, then continue with triage and roadmap decisions.</p>
                      </div>
                      <div className="original-signal-block">
                        <div className="section-row">
                          <div>
                            <p className="eyebrow">Feedback body</p>
                            <h4>Submitted Feedback</h4>
                          </div>
                        </div>
                      {detailAnswers ? (
                        <div className="stack">
                          {selectedRecord.form.fields
                            .filter((field) => !isAttachmentFieldType(field.type))
                            .map((field) => (
                              <div key={field.id} className="answer-line">
                                <strong>{field.label}</strong>
                                <p>{flattenAnswer(detailAnswers[field.id]) || t("noAnswerLabel")}</p>
                              </div>
                            ))}
                          {renderAttachmentCards(detailAttachments)}
                        </div>
                      ) : selectedRecordNeedsDecrypt ? (
                        <div className="locked-signal-state">
                          <div className="locked-signal-copy">
                            <strong>Encrypted private signal</strong>
                            <p>Requires reviewer access. Decrypt with wallet to reveal the message.</p>
                          </div>
                          <div className="locked-signal-skeleton" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </div>
                        </div>
                      ) : (
                        <p className="muted">No response content is available yet.</p>
                      )}
                      </div>
                      <div className="original-signal-block">
                        <div className="section-row">
                          <div>
                            <p className="eyebrow">Attachments</p>
                            <h4>{t("attachments")}</h4>
                          </div>
                        </div>
                      {selectedRecordNeedsDecrypt ? (
                        <p className="muted">Attachments stay hidden until the private signal is unlocked.</p>
                      ) : detailAttachments.length === 0 ? (
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
                                  <BlobLink
                                    blobId={attachment.blobId}
                                    label={t("verifyOnWalrus")}
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
                      )}
                      </div>
                    </section>

                    {selectedRecord.submission.isEncrypted ? (
                      <PrivateSignalUnlockCard
                        onUnlock={() => void handleDecrypt()}
                        isDecrypting={decrypting || decryptInFlightRef.current}
                        isUnlocked={Boolean(detailAnswers)}
                        errorMessage={decryptError}
                        disabledReason={selectedRecordUnlockDisabledReason}
                      >
                        {!isLocalFallbackBlob(selectedRecord.submission.encryptedBlobId) ? (
                          <BlobLink
                            blobId={selectedRecord.submission.encryptedBlobId}
                            label={t("verifyOnWalrus")}
                          />
                        ) : null}
                      </PrivateSignalUnlockCard>
                    ) : null}

                    {selectedRecordNeedsDecrypt ? (
                      <div className="stack private-access-copy">
                        <p className="muted">
                          {sealRuntime.activeMode === "mock"
                            ? `${t("demoDecryptAvailable")} Mock mode only.`
                            : t("walletApprovalReuseNotice", { minutes: realSealSessionTtlMinutes })}
                        </p>
                        {decryptStatusMessage ? (
                          <p className="muted" role="status" aria-live="polite">{decryptStatusMessage}</p>
                        ) : null}
                      </div>
                    ) : null}

                    {selectedRecord.submission.isEncrypted && detailAnswers ? (
                      <div className="contest-inline-success" role="status" aria-live="polite">
                        <strong>Wallet verified</strong>
                        <span>Private signal unlocked</span>
                      </div>
                    ) : null}

                    <section className="answer-card review-controls-section">
                      <div className="review-controls-header">
                        <div>
                          <p className="eyebrow">Review Actions</p>
                          <h3>Priority and status</h3>
                        </div>
                        <span className={`save-state-pill ${saving ? "is-saving" : ""}`}>
                          {saving ? "Saving..." : "Ready"}
                        </span>
                      </div>
                      <div className="review-field-row">
                        <label className="review-select">
                          <span>{t("priority")}</span>
                          <select
                            value={selectedRecord.submission.priority}
                            onChange={(event) =>
                              void updateSubmission({
                                ...selectedRecord.submission,
                                priority: event.target.value as Submission["priority"],
                              })
                            }
                          >
                            <option value="low">{t("priorityLow")}</option>
                            <option value="medium">{t("priorityMedium")}</option>
                            <option value="high">{t("priorityHigh")}</option>
                          </select>
                        </label>
                        <label className="review-select">
                          <span>Triage Status</span>
                          <select
                            value={selectedRecord.submission.triageStatus}
                            onChange={(event) =>
                              void updateSubmission({
                                ...selectedRecord.submission,
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
                        <label className="review-select">
                          <span>Review State</span>
                          <select
                            value={selectedRecord.submission.status}
                            onChange={(event) =>
                              void updateSubmission({
                                ...selectedRecord.submission,
                                status: event.target.value as Submission["status"],
                              })
                            }
                          >
                            <option value="unread">{t("statusUnread")}</option>
                            <option value="read">{t("statusRead")}</option>
                            <option value="archived">{t("statusArchived")}</option>
                          </select>
                        </label>
                      </div>
                      <div className="review-action-bar">
                        <button
                          type="button"
                          className="ghost-button review-secondary-button"
                          disabled={saving || selectedRecord.submission.status === "read"}
                          onClick={() =>
                            void updateSubmission({
                              ...selectedRecord.submission,
                              status: "read",
                            })
                          }
                        >
                          Mark reviewed
                        </button>
                        <button
                          type="button"
                          className="primary-button review-primary-button"
                          disabled={saving}
                          onClick={() =>
                            void updateSubmission({
                              ...selectedRecord.submission,
                              status: "archived",
                              triageStatus: "closed",
                            })
                          }
                        >
                          Mark resolved
                        </button>
                      </div>
                    </section>

                    <section className="answer-card review-support-card review-inline-card">
                      <div className="section-row">
                        <div>
                          <p className="eyebrow">Tags</p>
                          <h3>{t("tags")}</h3>
                        </div>
                        <span className="muted">{selectedRecord.submission.tags.length}</span>
                      </div>
                      <div className="pill-row review-tag-list">
                        {selectedRecord.submission.tags.length === 0 ? (
                          <span className="muted">No tags yet.</span>
                        ) : (
                          selectedRecord.submission.tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              className="tag-pill"
                              aria-label={`Remove tag ${tag}`}
                              onClick={() =>
                                void updateSubmission({
                                  ...selectedRecord.submission,
                                  tags: selectedRecord.submission.tags.filter((item) => item !== tag),
                                })
                              }
                            >
                              {tag} x
                            </button>
                          ))
                        )}
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
                          disabled={!draftTag.trim() || saving}
                          onClick={() => {
                            const nextTag = draftTag.trim();
                            if (selectedRecord.submission.tags.includes(nextTag)) {
                              setDraftTag("");
                              return;
                            }
                            setDraftTag("");
                            void updateSubmission({
                              ...selectedRecord.submission,
                              tags: [...selectedRecord.submission.tags, nextTag],
                            });
                          }}
                        >
                          {t("addTag")}
                        </button>
                      </div>
                    </section>

                    <section className="answer-card review-support-card review-inline-card">
                      <div className="section-row">
                        <div>
                          <p className="eyebrow">Internal Notes</p>
                          <h3>{t("notesTitle")}</h3>
                        </div>
                        <span className="muted">{saving ? "Saving..." : "Private"}</span>
                      </div>
                      <textarea
                        rows={4}
                        value={notesDraft}
                        onChange={(event) => setNotesDraft(event.target.value)}
                        placeholder={t("captureReviewNotes")}
                      />
                      <div className="review-action-bar">
                        <button
                          type="button"
                          className="ghost-button review-secondary-button"
                          disabled={saving}
                          onClick={() => setNotesDraft(selectedRecord.submission.notes)}
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          className="primary-button review-primary-button"
                          disabled={saving}
                          onClick={() =>
                            void updateSubmission({
                              ...selectedRecord.submission,
                              notes: notesDraft,
                            })
                          }
                        >
                          {t("saveNote")}
                        </button>
                      </div>
                    </section>

                    <section className="answer-card review-support-card contest-roadmap-card review-inline-card">
                      <div className="section-row">
                        <div>
                          <p className="eyebrow">Move to Roadmap</p>
                          <h3>Public Roadmap</h3>
                          <p className="muted">Planned, In Progress, and Fixed signals appear on the roadmap.</p>
                        </div>
                        <span className="signal-chip">
                          {getTriageStatusLabel(selectedRecord.submission.triageStatus)}
                        </span>
                      </div>
                      <div className="review-action-bar">
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={saving}
                          onClick={() => void handleMoveToRoadmap()}
                        >
                          {isSelectedRecordOnRoadmap ? "Keep on Public Roadmap" : "Move to Public Roadmap"}
                        </button>
                        {selectedRecord.submission.pendingOnchainRegistration ? (
                          <button
                            type="button"
                            className="ghost-button"
                            disabled={isRegisteringSignal(selectedRecord.submission.id)}
                            onClick={() => void handleRegisterPendingSignals([selectedRecord.submission.id])}
                          >
                            {isRegisteringSignal(selectedRecord.submission.id) ? "Registering..." : "Register proof on Sui"}
                          </button>
                        ) : null}
                        {isSelectedRecordOnRoadmap ? (
                          <Link className="ghost-button" to={selectedRoadmapUrl}>
                            Open roadmap
                          </Link>
                        ) : null}
                      </div>
                      <div className="review-secondary-links">
                        {selectedRecord.submission.githubIssueUrl ? (
                          <a
                            className="review-inline-link"
                            href={selectedRecord.submission.githubIssueUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open GitHub issue
                          </a>
                        ) : (
                          <span className="muted">GitHub issue not linked yet</span>
                        )}
                        <Link
                          className="review-inline-link"
                          to={`/dashboard/forms/${selectedRecord.form.id}/submissions/${selectedRecord.submission.id}`}
                        >
                          Review thread
                        </Link>
                      </div>
                      {selectedRecord.submission.pendingOnchainRegistration ? (
                        <p className="muted">Sui registration is optional proof, not required for review.</p>
                      ) : null}
                    </section>

                    <section className="signal-detail-group details-group-section">
                      <div className="signal-detail-group-header signal-detail-group-header-details">
                        <p className="eyebrow">System Details</p>
                        <h3>Metadata, Walrus, Seal, and Sui</h3>
                        <p className="muted">These details stay collapsed until you need to verify storage, encryption, or proof state.</p>
                      </div>

                      <details
                        className="answer-card collapsible-detail-card tertiary-detail-section"
                        open={showMetadata}
                        onToggle={(event) =>
                          setShowMetadata((event.currentTarget as HTMLDetailsElement).open)
                        }
                      >
                        <summary>
                          <span>
                            <p className="eyebrow">Metadata</p>
                            <h3>Signal metadata and proof</h3>
                          </span>
                        </summary>
                        <div className="metadata-list">
                          <div className="metadata-row">
                            <span>Review state</span>
                            <strong>{detailAnswers ? "Private signal unlocked" : "Encrypted private signal"}</strong>
                          </div>
                          <div className="metadata-row">
                            <span>Seal runtime</span>
                            <strong>{sealRuntime.activeMode === "mock" ? "Mock reviewer mode" : "Project reviewer access"}</strong>
                          </div>
                          <SignalMetaRow label="Project" type="registry" value={selectedRecord.form.projectId} emptyLabel={t("notAvailable")} />
                          {typeof selectedRecord.form.onchainFormId === "number" ? (
                            <div className="metadata-row">
                              <span>Registry Form ID</span>
                              <strong>{selectedRecord.form.onchainFormId}</strong>
                            </div>
                          ) : null}
                          {typeof selectedRecord.submission.onchainSignalId === "number" ? (
                            <div className="metadata-row">
                              <span>Signal Receipt</span>
                              <strong>{selectedRecord.submission.onchainSignalId}</strong>
                            </div>
                          ) : null}
                          <SignalMetaRow label={t("formBlobId")} type="blob" value={selectedRecord.form.blobId} emptyLabel={t("notAvailable")}>
                            {!isLocalFallbackBlob(selectedRecord.form.blobId) ? (
                              <BlobLink
                                blobId={selectedRecord.form.blobId}
                                label={t("verifyOnWalrus")}
                              />
                            ) : null}
                          </SignalMetaRow>
                          <SignalMetaRow label={t("submissionBlobIdLabel")} type="blob" value={selectedRecord.submission.blobId} emptyLabel={t("notAvailable")}>
                            {!isLocalFallbackBlob(selectedRecord.submission.blobId) ? (
                              <BlobLink
                                blobId={selectedRecord.submission.blobId}
                                label={t("verifyOnWalrus")}
                              />
                            ) : null}
                          </SignalMetaRow>
                          {hasDedicatedEncryptedPayloadBlob(selectedRecord.submission) ? (
                            <SignalMetaRow
                              label={t("encryptedPayloadBlobId")}
                              type="seal"
                              value={selectedRecord.submission.encryptedBlobId}
                            >
                              {!isLocalFallbackBlob(selectedRecord.submission.encryptedBlobId) ? (
                                <BlobLink
                                  blobId={selectedRecord.submission.encryptedBlobId}
                                  label={t("verifyOnWalrus")}
                                />
                              ) : null}
                            </SignalMetaRow>
                          ) : selectedRecord.submission.isEncrypted ? (
                            <div className="metadata-row">
                              <span>Encrypted Payload</span>
                              <strong>{getEncryptedPayloadAvailabilityLabel(selectedRecord.submission)}</strong>
                            </div>
                          ) : null}
                          <SignalMetaRow label="Seal Identity" type="seal" value={selectedRecord.submission.sealIdentity} emptyLabel={t("notAvailable")} />
                          {selectedRecord.submission.signalReceiptMetadataDigest ? (
                            <SignalMetaRow
                              label="Receipt Metadata Digest"
                              type="registry"
                              value={selectedRecord.submission.signalReceiptMetadataDigest}
                              emptyLabel={t("notAvailable")}
                            />
                          ) : null}
                          <div className="metadata-row signal-meta-row">
                            <span>{t("attachmentBlobIds")}</span>
                            <div className="stack signal-meta-row-value">
                              {selectedRecord.submission.attachments.length === 0 ? (
                                <strong>{t("notAvailable")}</strong>
                              ) : (
                                selectedRecord.submission.attachments.map((attachment) => (
                                  <div key={attachment.blobId} className="signal-meta-row-value">
                                    {attachment.storage === "inline" ? (
                                      <strong>Embedded in private signal</strong>
                                    ) : (
                                      <SignalMetaChip type="blob" value={attachment.blobId} />
                                    )}
                                    {attachment.storage !== "inline" && !isLocalFallbackBlob(attachment.blobId) ? (
                                      <BlobLink
                                        blobId={attachment.blobId}
                                        label={t("verifyOnWalrus")}
                                      />
                                    ) : null}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                          <div className="metadata-row">
                            <span>Wallet</span>
                            <strong>
                              {getSubmissionRespondentMeta(selectedRecord.submission).isAnonymous
                                ? "Anonymous respondent"
                                : getSubmissionRespondentMeta(selectedRecord.submission).walletAddress ?? t("notAvailable")}
                            </strong>
                          </div>
                          <div className="metadata-row">
                            <span>Anonymous</span>
                            <strong>{getSubmissionRespondentMeta(selectedRecord.submission).isAnonymous ? "Yes" : "No"}</strong>
                          </div>
                          <div className="metadata-row">
                            <span>Submitted</span>
                            <strong>{formatDate(getSubmissionRespondentMeta(selectedRecord.submission).submittedAt)}</strong>
                          </div>
                          <div className="metadata-row">
                            <span>Chain</span>
                            <strong>{getSubmissionRespondentMeta(selectedRecord.submission).chain}</strong>
                          </div>
                          <div className="metadata-row">
                            <span>{t("storageMode")}</span>
                            <strong>
                              {storageRuntime.mode === "walrus"
                                ? t("storageWalrus")
                                : t("localFallbackLabel")}
                            </strong>
                          </div>
                          <div className="metadata-row">
                            <span>Reviewer access</span>
                            <strong>{privateReviewLabel}</strong>
                          </div>
                          <div className="metadata-row">
                            <span>{t("responseDeadlineLabel")}</span>
                            <strong>{formatResponseDeadline(selectedRecord.form.responseDeadline, responseDeadlineLabels)}</strong>
                          </div>
                          <div className="metadata-row">
                            <span>{t("walletAccessStatus")}</span>
                            <strong>
                              {getWalletAccessLabel(selectedRecord.form, account?.address)}
                            </strong>
                          </div>
                          <div className="metadata-row">
                            <span>Pending Sui registration</span>
                            <strong>
                              {selectedRecord.submission.onchainStatus ??
                                (selectedRecord.submission.pendingOnchainRegistration
                                  ? t("pendingSuiRegistration")
                                  : "offchain only")}
                            </strong>
                          </div>
                        </div>
                      </details>

                      <details
                        className="answer-card collapsible-detail-card original-raw-payload-section tertiary-detail-section"
                        open={showEncryptedSignal}
                        onToggle={(event) =>
                          setShowEncryptedSignal((event.currentTarget as HTMLDetailsElement).open)
                        }
                      >
                        <summary>
                          <span>
                            <p className="eyebrow">Seal Details</p>
                            <h3>Encrypted payload details</h3>
                          </span>
                        </summary>
                        <SealStatusCard
                          encryptSubmissions={selectedRecord.form.encryptSubmissions}
                          encryptedBlobId={selectedRecord.submission.encryptedBlobId}
                          encryptedPayloadEmbedded={
                            Boolean(selectedRecord.submission.encryptedPayload) &&
                            !selectedRecord.submission.encryptedBlobId
                          }
                          canDecrypt={Boolean(account?.address)}
                          walletAccessStatus={getWalletAccessLabel(selectedRecord.form, account?.address)}
                        />
                      </details>

                      <details className="answer-card collapsible-detail-card tertiary-detail-section">
                        <summary>
                          <span>
                            <p className="eyebrow">Node Actions</p>
                            <h3>{selectedRecord.form.title}</h3>
                          </span>
                        </summary>
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => setNodeDirectoryOpen(true)}
                          >
                            {t("openNodeDirectory")}
                          </button>
                          <Link
                            className="ghost-button"
                            to={getPublicFormPath(selectedRecord.form.id, selectedRecord.form.manifestBlobId)}
                          >
                            {t("openPublicForm")}
                          </Link>
                          <Link className="ghost-button" to={`/dashboard/forms/${selectedRecord.form.id}`}>
                            {t("reviewSubmissions")}
                          </Link>
                        </div>
                      </details>
                    </section>

                    <section className="signal-detail-group details-group-section">
                      <div className="signal-detail-group-header signal-detail-group-header-details">
                        <p className="eyebrow">Review Support</p>
                        <h3>AI summary and similar signals</h3>
                        <p className="muted">AI stays separate from the original signal so reviewer judgment remains primary.</p>
                      </div>

                      <details className="answer-card collapsible-detail-card ai-summary-section ai-card">
                        <summary>
                          <span>
                            <p className="eyebrow">AI Summary</p>
                            <h3>AI Summary</h3>
                          </span>
                        </summary>
                        <p>{selectedRecord.submission.aiSummary || getSignalPreview(selectedRecord.submission)}</p>
                        <div className="signal-badge-row signal-badge-row-compact">
                          <span className="signal-chip">Confidence {inferredAiConfidence}</span>
                          <span className="signal-chip">{selectedRecord.category}</span>
                          {selectedRecord.submission.keywords?.slice(0, 3).map((keyword) => (
                            <span key={keyword} className="signal-chip">
                              {keyword}
                            </span>
                          ))}
                          {selectedRecord.submission.clusterId ? (
                            <span className="signal-chip signal-chip-accent">
                              AI grouped
                              {clusterCountById[selectedRecord.submission.clusterId]
                                ? ` (${clusterCountById[selectedRecord.submission.clusterId]})`
                                : ""}
                            </span>
                          ) : null}
                        </div>
                      </details>

                      <details className="answer-card collapsible-detail-card triage-compact-card ai-card ai-similar-section">
                        <summary>
                          <span>
                            <p className="eyebrow">Similar Signals</p>
                            <h3>Similar Signals</h3>
                          </span>
                        </summary>
                        <SignalClusterPanel
                          selectedSubmission={selectedRecord.submission}
                          submissions={allSignals.map((record) => record.submission)}
                          formById={formById}
                          formTitleById={formTitleById}
                          busy={saving}
                          onSelectSignal={(submissionId) => {
                            if (decryptInFlightRef.current) {
                              return;
                            }
                            setSelectedSignalId(submissionId);
                          }}
                          onSaveSubmission={updateSubmission}
                        />
                      </details>
                    </section>
                  </div>
                </>
              )}
            </article>
          </div>
          </section>
        )}

        <OperationsStatusRail
          title="Review Queue"
          items={operationsStatusItems}
          nextActionLabel={nextRecommendedAction.label}
          nextActionDetail={nextRecommendedAction.detail}
          nextActionCta={nextRecommendedAction.cta}
        />

        <details ref={advancedProjectSettingsRef} className="panel advanced-project-settings">
          <summary>
            <span>
              <strong>Advanced project settings</strong>
              <span className="muted">Connect an existing project, review registry state, or use danger-zone actions.</span>
            </span>
          </summary>
          <div className="advanced-project-settings-body">
            <div className="project-registry-status">
              <span className="signal-chip">{selectedProject ? "Project selected" : "No project selected"}</span>
              <span className="signal-chip">{privateReviewLabel}</span>
            </div>

            <article className="project-registry-subpanel project-registry-subpanel-soft advanced-project-switcher">
              <div className="project-panel-head">
                <div>
                  <p className="eyebrow">Current Project</p>
                  <h3>Create or switch project</h3>
                </div>
                <span className="signal-chip">Workspace scope</span>
              </div>
              <p className="muted">Switch the active project for this inbox or create a fresh destination.</p>
              <label className="project-selector-inline" htmlFor="workspace-project-selector">
                <span className="eyebrow">Selected project</span>
                <select
                  id="workspace-project-selector"
                  className="project-selector-field"
                  value={selectedProjectId}
                  onChange={(event) => {
                    selectProject(event.target.value);
                  }}
                >
                  <option value="">Choose a project</option>
                  {projects.map((project) => (
                    <option key={project.objectId} value={project.objectId}>
                      {project.name} ({project.formsCount} forms / {project.signalsCount} signals)
                    </option>
                  ))}
                </select>
              </label>
              {hasAdminAccess ? (
                <div className="workspace-create-project">
                  <div className="workspace-create-project-copy">
                    <span className="eyebrow">Create project</span>
                    <p className="muted">Provision a new project without leaving the inbox workspace.</p>
                  </div>
                  <div className="workspace-create-project-actions">
                    <input
                      ref={projectCreateInputRef}
                      value={projectCreateName}
                      onChange={(event) => setProjectCreateName(event.target.value)}
                      placeholder="New project name"
                    />
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => void handleCreateProject()}
                      disabled={isCreatingProject}
                    >
                      {isCreatingProject ? "Creating..." : "Create Project"}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>

            <div className="project-registry-grid project-registry-grid-advanced">
              <article className="project-registry-subpanel project-registry-subpanel-soft">
                <div className="project-panel-head">
                  <div>
                    <p className="eyebrow">Existing Project</p>
                    <h3>Connect existing project</h3>
                  </div>
                  <span className="signal-chip">Project / OwnerCap</span>
                </div>
                <p className="muted">Paste a Project or ProjectOwnerCap object id to attach this workspace.</p>
                <div className="inline-actions">
                  <input
                    ref={manualProjectInputRef}
                    value={manualProjectId}
                    onChange={(event) => setManualProjectId(event.target.value)}
                    placeholder="Project or ProjectOwnerCap object id"
                  />
                  <button type="button" className="ghost-button" onClick={() => void connectManualProject()}>
                    Connect
                  </button>
                </div>
              </article>

              {selectedProject ? (
                <article className="project-registry-subpanel project-registry-danger">
                  <div className="project-panel-head">
                    <div>
                      <p className="eyebrow">Danger Zone</p>
                      <h3>Delete project</h3>
                    </div>
                    <span className="signal-chip">Owner only</span>
                  </div>
                  <p className="muted">Only empty projects can be deleted.</p>
                  <div className="stack">
                    <div className="workspace-hero-meta">
                      <span className="workspace-meta-item">{selectedProject.formsCount} on-chain forms</span>
                      <span className="workspace-meta-item">{selectedProject.signalsCount} on-chain signals</span>
                      <span className="workspace-meta-item">{localProjectFormsCount} local forms</span>
                    </div>
                    {deleteProjectBlockedReason ? (
                      <p className="warning-text">{deleteProjectBlockedReason} Local forms may still differ from the on-chain registry.</p>
                    ) : (
                      <p className="muted">This project is empty and can be deleted by the owner wallet.</p>
                    )}
                    {visibleOnchainForms.length > 0 ? (
                      <div className="stack onchain-form-list">
                        <p className="muted">On-chain form records</p>
                        {visibleOnchainForms.map((form) => (
                          <div key={form.formId} className="metadata-row onchain-form-row">
                            <div>
                              <strong>Form #{form.formId}</strong>
                              <p className="muted">{form.title || "Untitled form"}</p>
                            </div>
                            <div className="inline-actions">
                              <span className={`signal-chip ${form.active ? "signal-chip-accent" : "signal-chip-soft"}`}>
                                {form.active ? "Active" : "Inactive"}
                              </span>
                              <button
                                type="button"
                                className="ghost-button"
                                disabled={
                                  deletingOnchainFormIds.includes(form.formId) ||
                                  selectedProject.signalsCount > 0
                                }
                                onClick={() => void handleDeleteOnchainForm(form.formId)}
                              >
                                {deletingOnchainFormIds.includes(form.formId) ? "Deleting..." : "Delete on-chain form"}
                              </button>
                            </div>
                          </div>
                        ))}
                        {selectedProject.signalsCount > 0 ? (
                          <p className="muted">On-chain forms can only be deleted when no on-chain signals reference this project.</p>
                        ) : null}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="ghost-button node-directory-delete"
                      onClick={() => void handleDeleteProject()}
                      disabled={
                        deletingProject ||
                        !selectedProject.ownedOwnerCapId ||
                        selectedProject.formsCount > 0 ||
                        selectedProject.signalsCount > 0 ||
                        localProjectFormsCount > 0
                      }
                    >
                      {deletingProject ? "Deleting..." : "Delete Project"}
                    </button>
                  </div>
                </article>
              ) : null}
            </div>

            {projectState ? <p className="muted">{projectState}</p> : null}
          </div>
        </details>

        <div className="mobile-console-banner">{t("adminDesktopNotice")}</div>
      </section>
      {nodeDirectoryOpen ? (
        <div className="node-directory-overlay" role="dialog" aria-modal="true">
          <div className="node-directory-backdrop" onClick={() => setNodeDirectoryOpen(false)} />
          <section className="panel glow-panel node-directory-panel">
            <div className="signal-detail-heading">
              <div>
                <p className="eyebrow">{t("signalNodesTitle")}</p>
                <h2>{t("nodeDirectoryTitle")}</h2>
                <p className="muted">{t("nodeDirectoryDescription")}</p>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setNodeDirectoryOpen(false)}
              >
                {t("closeLabel")}
              </button>
            </div>

            <div className="node-directory-toolbar">
              <input
                value={nodeSearch}
                onChange={(event) => setNodeSearch(event.target.value)}
                placeholder={t("searchNodesPlaceholder")}
              />
              <div className="node-directory-toolbar-actions">
                <div className="node-directory-stats">
                  <span className="signal-chip">
                    {t("activeNodeSummary", { count: accessibleForms.length })}
                  </span>
                  <span className="signal-chip">
                    {t("signalsCount", { count: allSignals.length })}
                  </span>
                </div>
                {hasAdminAccess || !capabilityProfile.isConfigured ? (
                  <button
                    type="button"
                    className="ghost-button node-directory-delete"
                    onClick={() => void handleDeleteVisibleNodes(deletableNodeIds)}
                    disabled={deletingVisibleNodes || deletableNodeIds.length === 0}
                  >
                    {deletingVisibleNodes ? t("deletingLabel") : t("deleteVisibleNodes", { count: deletableNodeIds.length })}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="node-directory-list">
              {nodeDirectoryItems.map((item) => {
                const isSelected = selectedFormId === item.id;
                return (
                  <div key={item.id} className={`node-directory-row ${isSelected ? "is-active" : ""}`}>
                    <button
                      type="button"
                      className={`node-directory-item ${isSelected ? "is-active" : ""}`}
                      onClick={() => {
                        setSelectedFormId(item.id);
                        setNodeDirectoryOpen(false);
                      }}
                    >
                      <div className="node-directory-item-main">
                        <div className="node-directory-item-heading">
                          <strong>{item.title}</strong>
                          {item.unreadCount > 0 ? (
                            <span className="node-unread-badge">
                              {t("unreadBadge", { count: item.unreadCount })}
                            </span>
                          ) : null}
                        </div>
                        <p className="muted">
                          {t("signalsCount", { count: item.submissionCount })}
                          {item.isLegacyDemo ? ` / ${t("legacyDemoForm")}` : ""}
                        </p>
                      </div>
                    </button>
                    {item.id !== "all" ? (
                      <div className="node-directory-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            setBeaconFormId(item.id);
                            setNodeDirectoryOpen(false);
                          }}
                        >
                          {t("openSignalBeacon")}
                        </button>
                        {hasAdminAccess || !capabilityProfile.isConfigured ? (
                          <button
                            type="button"
                            className="ghost-button node-directory-delete"
                            onClick={() => void handleDelete(item.id)}
                            disabled={deletingVisibleNodes || deletingFormId === item.id}
                          >
                            {deletingFormId === item.id ? t("deletingLabel") : t("deleteNode")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {nodeDirectoryItems.length === 1 && nodeSearch.trim() ? (
                <EmptyState>
                  <h2>{t("noNodesFoundTitle")}</h2>
                  <p>{t("noNodesFoundBody")}</p>
                </EmptyState>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      {selectedBeaconForm ? (
        <div className="node-directory-overlay" role="dialog" aria-modal="true">
          <div className="node-directory-backdrop" onClick={() => setBeaconFormId(null)} />
          <section className="panel glow-panel node-directory-panel beacon-overlay-panel">
            <div className="signal-detail-heading">
              <div>
                <p className="eyebrow">{t("signalBeaconLabel")}</p>
                <h2>{selectedBeaconForm.title}</h2>
                <p className="muted">{t("signalBeaconFromNodeDescription")}</p>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setBeaconFormId(null)}
              >
                {t("closeLabel")}
              </button>
            </div>
            <ShareCard
              formId={selectedBeaconForm.id}
              blobId={selectedBeaconForm.blobId}
              createdAt={selectedBeaconForm.createdAt}
            />
          </section>
        </div>
      ) : null}
    </AdminAccessGate>
  );
}


