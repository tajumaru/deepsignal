import {
  useCurrentAccount,
} from "@mysten/dapp-kit";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CreateFormLink } from "../components/CreateFormLink";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { BlobLink } from "../components/BlobLink";
import { EmptyState } from "../components/EmptyState";
import { FormattedAnswerValue } from "../components/FormattedAnswerValue";
import type { OperationsStatusItem } from "../components/OperationsStatusRail";
import { PrivateSignalUnlockCard } from "../components/PrivateSignalUnlockCard";
import { RichTextContent } from "../components/RichText";
import { SealStatusCard } from "../components/SealStatusCard";
import { ShareCard } from "../components/ShareCard";
import { SignalClusterPanel } from "../components/SignalClusterPanel";
import { SignalStatusBadges } from "../components/SignalStatusBadges";
import { SignalMetaChip, SignalMetaRow } from "../components/SignalMetaChip";
import { AdminOperationsStatus } from "../features/admin/components/AdminOperationsStatus";
import { AdminToast } from "../features/admin/components/AdminToast";
import { CsvExportConfirmationModal } from "../features/admin/components/CsvExportConfirmationModal";
import { SignalAttachmentList } from "../features/admin/components/SignalAttachmentList";
import { SignalStreamsNav } from "../features/admin/components/SignalStreamsNav";
import { useAdminToast } from "../features/admin/hooks/useAdminToast";
import { usePendingSuiRegistration } from "../features/admin/hooks/usePendingSuiRegistration";
import { usePrivateSignalDecrypt } from "../features/admin/hooks/usePrivateSignalDecrypt";
import { useProjectWorkspace } from "../features/admin/hooks/useProjectWorkspace";
import {
  useSignalInboxData,
  type SignalRecord,
  type StreamId,
} from "../features/admin/hooks/useSignalInboxData";
import { useAttachmentPreviews } from "../hooks/useAttachmentPreviews";
import { useAccessControl } from "../hooks/useAccessControl";
import { useI18n } from "../i18n";
import { isAttachmentFieldType, isLongTextLikeField } from "../lib/fieldTypes";
import {
  addressesMatch,
  canAdmin,
  canReview,
  getRoleLabel,
} from "../lib/adminAccess";
import { getTriageStatusLabel, TRIAGE_STATUS_OPTIONS } from "../lib/signalOps";
import { exportSubmissionJson } from "../lib/export";
import {
  buildExportMetadata,
  exportResponsesToCsv,
  type ExportMetadata,
  type ExportResponsesToCsvOptions,
  type ExportPiiField,
  type ResponsesCsvExportScope,
  type ResponsesCsvSortOrder,
} from "../lib/exportResponses";
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
import { formatDate } from "../lib/utils";
import { deleteFormsFromLocalCache, getStorageRuntimeStatus } from "../storage/storageFactory";
import type { FormSchema, Submission } from "../types";

const ROADMAP_READY_STATUSES = new Set<Submission["triageStatus"]>(["planned", "in_progress", "fixed"]);
type ReviewSaveStatus = "idle" | "saving" | "saved" | "skipped" | "error";
type ReviewDraft = Pick<Submission, "status" | "triageStatus" | "priority" | "signalValue" | "notes">;

function formatWorkspaceCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatAccessLabel(roleLabel: string) {
  return `${roleLabel} access`;
}

type TranslationFn = ReturnType<typeof useI18n>["t"];

interface MobileInboxHeaderProps {
  title: string;
  activeScopeLabel: string;
  visibleCountLabel: string;
  unreadCountLabel: string;
  search: string;
  onSearchChange: (value: string) => void;
  streamItems: Array<{ id: StreamId; label: string; count: number }>;
  selectedStreamId: StreamId;
  onSelectStream: (streamId: StreamId) => void;
  searchPlaceholder: string;
  filterLabel: string;
  queueLabel: string;
}

function MobileInboxHeader({
  title,
  activeScopeLabel,
  visibleCountLabel,
  unreadCountLabel,
  search,
  onSearchChange,
  streamItems,
  selectedStreamId,
  onSelectStream,
  searchPlaceholder,
  filterLabel,
  queueLabel,
}: MobileInboxHeaderProps) {
  return (
    <header className="mobile-inbox-header">
      <div className="mobile-inbox-header-bar">
        <button
          type="button"
          className="mobile-inbox-icon-button"
          aria-label="Back"
          onClick={() => window.history.back()}
        >
          <span aria-hidden="true">&lt;</span>
        </button>
        <div className="mobile-inbox-title">
          <strong>{title}</strong>
          <span>{activeScopeLabel}</span>
        </div>
        <span className="mobile-inbox-count-pill">{unreadCountLabel}</span>
      </div>

      <div className="mobile-inbox-search-row">
        <label className="mobile-inbox-search">
          <span className="sr-only">{searchPlaceholder}</span>
          <span aria-hidden="true">S</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
          />
        </label>
        <label className="mobile-inbox-filter">
          <span className="sr-only">{filterLabel}</span>
          <select value={selectedStreamId} onChange={(event) => onSelectStream(event.target.value as StreamId)}>
            {streamItems.map((stream) => (
              <option key={stream.id} value={stream.id}>
                {stream.label} ({stream.count})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mobile-inbox-summary-row">
        <span>{visibleCountLabel}</span>
        <span>{queueLabel}</span>
      </div>
    </header>
  );
}

interface MobileSignalRowProps {
  record: SignalRecord;
  isSelected: boolean;
  isSelectedForSui: boolean;
  isUnlocked: boolean;
  onSelect: () => void;
  t: TranslationFn;
}

function getSignalInitials(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const [first, second] = words;
  return `${first?.[0] ?? "S"}${second?.[0] ?? ""}`.toUpperCase();
}

function MobileSignalRow({
  record,
  isSelected,
  isSelectedForSui,
  isUnlocked,
  onSelect,
  t,
}: MobileSignalRowProps) {
  const { form, submission, category } = record;
  const title = getSignalSubject(submission);
  const respondentMeta = getSubmissionRespondentMeta(submission);
  const storageLabel = getStorageBadgeLabel(submission.encryptedBlobId ?? submission.blobId);
  const isLocalOnlySignal = storageLabel === "Stored locally only";
  const priorityLabel = submission.priority === "high" ? t("priority") : submission.priority;
  const preview = submission.isEncrypted ? t("encryptedPrivateSignalUnlockHint") : getSignalPreview(submission);
  const lockStateLabel = submission.isEncrypted
    ? isUnlocked
      ? t("unlockedSignalState")
      : t("lockedSignalState")
    : t("openSignalState");
  const readStateLabel =
    submission.status === "unread"
      ? t("statusUnread")
      : submission.status === "read"
        ? t("statusRead")
        : t("statusArchived");
  const ariaLabel = t("mobileSignalRowAriaLabel", {
    subject: title,
    status: readStateLabel,
    priority: submission.priority,
    triage: getTriageStatusLabel(submission.triageStatus),
    lockState: lockStateLabel,
  });

  return (
    <button
      type="button"
      className={`mobile-signal-row ${isSelected ? "is-active" : ""} ${submission.status === "unread" ? "is-unread" : "is-read"}`}
      aria-current={isSelected ? "true" : undefined}
      aria-label={ariaLabel}
      onClick={onSelect}
    >
      <span className="mobile-signal-avatar" aria-hidden="true">
        {getSignalInitials(title)}
        <span className={`mobile-signal-status-dot status-${submission.status}`} />
      </span>

      <span className="mobile-signal-main">
        <span className="mobile-signal-title-line">
          <strong>{title}</strong>
        </span>
        <span className={`mobile-signal-preview ${submission.isEncrypted ? "is-locked" : ""}`}>
          {preview}
        </span>
        <span className="mobile-signal-source-line">
          <span>{form.title}</span>
          <span>{category}</span>
          {respondentMeta.isAnonymous ? <span>{t("anonymousRespondent")}</span> : null}
        </span>
        <span className="mobile-signal-meta-row">
          <span className={`mobile-signal-mini-badge triage-${submission.triageStatus}`}>
            {getTriageStatusLabel(submission.triageStatus)}
          </span>
          {submission.isEncrypted ? (
            <span className={`mobile-signal-mini-badge ${isUnlocked ? "is-selected" : ""}`}>
              {lockStateLabel}
            </span>
          ) : (
            <span className="mobile-signal-mini-badge">{lockStateLabel}</span>
          )}
          {submission.responderSignature ? <span className="mobile-signal-mini-badge">{t("verifiedSignalState")}</span> : null}
          {submission.pendingOnchainRegistration ? (
            <span className={`mobile-signal-mini-badge ${isSelectedForSui ? "is-selected" : ""}`}>Sui proof</span>
          ) : null}
          {isLocalOnlySignal ? <span className="mobile-signal-mini-badge">{t("localSignalState")}</span> : null}
        </span>
      </span>

      <span className="mobile-signal-side">
        <time>{formatDate(submission.createdAt)}</time>
        {submission.status === "unread" ? <span className="mobile-unread-dot" aria-label={t("unreadSignalState")} /> : null}
        <span className={`mobile-priority-badge priority-${submission.priority}`}>{priorityLabel}</span>
      </span>
    </button>
  );
}

function MobileComposeSignalButton() {
  return (
    <CreateFormLink className="mobile-compose-signal-button">
      <span aria-hidden="true">+</span>
      <span className="sr-only">Create signal inbox</span>
    </CreateFormLink>
  );
}

interface MobileSignalInboxProps {
  title: string;
  activeScopeLabel: string;
  visibleCountLabel: string;
  unreadCountLabel: string;
  emptyContent: ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
  streamItems: Array<{ id: StreamId; label: string; count: number }>;
  selectedStreamId: StreamId;
  onSelectStream: (streamId: StreamId) => void;
  visibleSignals: SignalRecord[];
  selectedRecord: SignalRecord | null;
  unlockedSignalId?: string | null;
  selectedPendingSignalIds: string[];
  onSelectSignal: (record: SignalRecord) => void;
  searchPlaceholder: string;
  t: TranslationFn;
}

function MobileSignalInbox({
  title,
  activeScopeLabel,
  visibleCountLabel,
  unreadCountLabel,
  emptyContent,
  search,
  onSearchChange,
  streamItems,
  selectedStreamId,
  onSelectStream,
  visibleSignals,
  selectedRecord,
  unlockedSignalId,
  selectedPendingSignalIds,
  onSelectSignal,
  searchPlaceholder,
  t,
}: MobileSignalInboxProps) {
  return (
    <section className={`mobile-signal-inbox ${selectedRecord ? "is-detail-open" : ""}`} aria-label={title}>
      <MobileInboxHeader
        title={title}
        activeScopeLabel={activeScopeLabel}
        visibleCountLabel={visibleCountLabel}
        unreadCountLabel={unreadCountLabel}
        search={search}
        onSearchChange={onSearchChange}
        streamItems={streamItems}
        selectedStreamId={selectedStreamId}
        onSelectStream={onSelectStream}
        searchPlaceholder={searchPlaceholder}
        filterLabel={t("filterInboxLabel")}
        queueLabel={t("encryptedQueueLabel")}
      />

      <div className="mobile-signal-list" aria-live="polite">
        {visibleSignals.length === 0
          ? emptyContent
          : visibleSignals.map((record) => (
              <MobileSignalRow
                key={record.submission.id}
                record={record}
                isSelected={selectedRecord?.submission.id === record.submission.id}
                isSelectedForSui={selectedPendingSignalIds.includes(record.submission.id)}
                isUnlocked={unlockedSignalId === record.submission.id}
                onSelect={() => onSelectSignal(record)}
                t={t}
              />
            ))}
      </div>

      <MobileComposeSignalButton />
    </section>
  );
}

export function AdminDashboardPage() {
  const { language, t } = useI18n();
  const account = useCurrentAccount();
  const {
    capabilityProfile,
    isPending: isLoadingCapabilities,
    isLoadingAccess,
    ownedObjects,
  } = useAccessControl(account?.address);
  const storageRuntime = getStorageRuntimeStatus();
  const responseDeadlineLabels: ResponseDeadlineLabels = {
    noLimit: t("responseDeadlineNone"),
    closed: t("responseDeadlineClosed"),
    hoursLeft: (hours) => t("responseDeadlineHoursLeft", { count: hours }),
    daysLeft: (days) => t("responseDeadlineDaysLeft", { count: days }),
  };
  const [saving, setSaving] = useState(false);
  const [reviewSaveStatus, setReviewSaveStatus] = useState<ReviewSaveStatus>("idle");
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [deletingVisibleNodes, setDeletingVisibleNodes] = useState(false);
  const [nodeDirectoryOpen, setNodeDirectoryOpen] = useState(false);
  const [beaconFormId, setBeaconFormId] = useState<string | null>(null);
  const [nodeSearch, setNodeSearch] = useState("");
  const [csvExportScope, setCsvExportScope] = useState<ResponsesCsvExportScope>("filtered");
  const [csvSortOrder, setCsvSortOrder] = useState<ResponsesCsvSortOrder>("createdAtDesc");
  const [excludedCsvPiiFields, setExcludedCsvPiiFields] = useState<ExportPiiField[]>([]);
  const [pendingCsvExportMetadata, setPendingCsvExportMetadata] = useState<ExportMetadata | null>(null);
  const [pendingCsvExportForm, setPendingCsvExportForm] = useState<FormSchema | null>(null);
  const [pendingCsvExportResponses, setPendingCsvExportResponses] = useState<Submission[]>([]);
  const [pendingCsvExportOptions, setPendingCsvExportOptions] = useState<ExportResponsesToCsvOptions | null>(null);
  const { toast, setToast } = useAdminToast();
  const saveQueueRef = useRef(Promise.resolve());
  const reviewInboxRef = useRef<HTMLDivElement | null>(null);
  const streamsPanelRef = useRef<HTMLDivElement | null>(null);
  const signalListPanelRef = useRef<HTMLElement | null>(null);
  const signalDetailPanelRef = useRef<HTMLElement | null>(null);
  const selectedRecordResetRef = useRef<string | null>(null);
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
    selectedPendingSignalIds,
    registeringSignalIds,
    isRegisteringSignal,
    togglePendingSelection,
    handleRegisterPendingSignals,
  } = usePendingSuiRegistration({
    allSignals,
    pendingSignalIdSet: signalIndex.pendingSignalIdSet,
    applySubmissionUpdate,
    setToast,
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
    highlightCreateFormCta,
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
    detailLegacyUnencrypted,
    decrypting,
    decryptState,
    decryptStatusMessage,
    decryptError,
    decryptDiagnostics,
    setDecryptError,
    decryptInFlightRef,
    decryptContext: attachmentDecryptContext,
    handleDecrypt,
    realSealSessionTtlMinutes,
  } = usePrivateSignalDecrypt({
    accountAddress: account?.address,
    capabilityProfile,
    ownedCapabilityObjects: ownedObjects,
    selectedRecord,
    selectedSignalId,
    setToast,
    decryptFailedLabel: t("decryptFailed"),
  });
  const roleLabel = getRoleLabel(capabilityProfile);
  const accessState = account?.address ? "allowed" : "denied";
  const privateReviewLabel = t("privateReviewEnabled");

  function renderAnswerValue(field: { type: string }, value: unknown) {
    if (isLongTextLikeField(field.type as FormSchema["fields"][number]["type"])) {
      const text = typeof value === "string" ? value : "";
      return text ? <RichTextContent value={text} className="rich-text-content" /> : <p>{t("noAnswerLabel")}</p>;
    }
    return <FormattedAnswerValue field={field as FormSchema["fields"][number]} value={value} emptyLabel={t("noAnswerLabel")} showCountryIso />;
  }

  async function deleteNodes(formIds: string[]) {
    const uniqueIds = [...new Set(formIds)];
    const walletOwnedIds = uniqueIds.filter((formId) => {
      const form = forms.find((item) => item.id === formId);
      return addressesMatch(form?.ownerAddress, account?.address);
    });
    const localCacheOnlyIds = uniqueIds.filter((formId) => !walletOwnedIds.includes(formId));

    if (walletOwnedIds.length > 0) {
      await storageAdapter.deleteForms(walletOwnedIds);
    }
    if (localCacheOnlyIds.length > 0) {
      await deleteFormsFromLocalCache(localCacheOnlyIds);
    }

    return {
      walletDeletedCount: walletOwnedIds.length,
      localCacheDeletedCount: localCacheOnlyIds.length,
      totalDeletedCount: uniqueIds.length,
    };
  }

  function getDeleteSuccessMessage(result: Awaited<ReturnType<typeof deleteNodes>>, singleNode = false) {
    if (result.localCacheDeletedCount > 0 && result.walletDeletedCount === 0) {
      return t("deleteNodeLocalSuccess", { count: result.localCacheDeletedCount });
    }
    if (result.localCacheDeletedCount > 0) {
      return t("deleteVisibleNodesLocalMixedSuccess", {
        walrusCount: result.walletDeletedCount,
        localCount: result.localCacheDeletedCount,
      });
    }
    if (singleNode) {
      return t("deleteNodeSuccess");
    }
    return t("deleteVisibleNodesSuccess", { count: result.totalDeletedCount });
  }

  const scrollToReviewPanel = useCallback((target: "streams" | "signals" | "detail") => {
    if (!window.matchMedia("(max-width: 768px)").matches) {
      return;
    }
    const panel =
      target === "streams"
        ? streamsPanelRef.current
        : target === "signals"
          ? signalListPanelRef.current
          : signalDetailPanelRef.current;
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  async function handleDelete(formId: string) {
    if (!window.confirm(t("deleteFormConfirm"))) {
      return;
    }
    setDeletingFormId(formId);
    try {
      const result = await deleteNodes([formId]);
      await loadConsole();
      setToast({ tone: "success", message: getDeleteSuccessMessage(result, true) });
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
      const result = await deleteNodes(formIds);
      await loadConsole();
      setToast({ tone: "success", message: getDeleteSuccessMessage(result) });
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
  const attachmentPreviews = useAttachmentPreviews(detailAttachments, {
    enabled:
      detailAttachments.length > 0 &&
      (!detailAttachments.some((attachment) => attachment.encrypted) || Boolean(detailAnswers)),
    decryptContext: attachmentDecryptContext,
  });
  const roadmapReadySignals = useMemo(
    () => selectedProjectSignals.filter((record) => ROADMAP_READY_STATUSES.has(record.submission.triageStatus)),
    [selectedProjectSignals],
  );
  const statusForms = hasAdminAccess ? selectedProjectForms : accessibleForms;
  const statusSignals = hasAdminAccess ? selectedProjectSignals : allSignals;
  const protectedStatusFormsCount = statusForms.filter(
    (form) => form.encryptSubmissions,
  ).length;
  const hasProjectAndForms = Boolean(selectedProject) && selectedProjectForms.length > 0;
  const operationsStatusItems: OperationsStatusItem[] = [
    ...(hasAdminAccess && !hasProjectAndForms
      ? [{
          label: t("projectConnectedStatusLabel"),
          tone: selectedProject ? "ready" : "action",
          detail: selectedProject ? selectedProject.name : t("selectCreateOrConnectProject"),
        } satisfies OperationsStatusItem]
      : []),
    {
      label: t("privateSignalsEnabledStatusLabel"),
      tone:
        statusForms.length === 0
          ? "pending"
          : protectedStatusFormsCount > 0
            ? "ready"
            : "warning",
      detail:
        statusForms.length === 0
          ? t("noFormPublishedYet")
          : protectedStatusFormsCount > 0
            ? t("protectedFormsActive", { count: protectedStatusFormsCount })
            : t("privateSignalProtectionOff"),
    },
    {
      label: t("reviewerWalletReadyStatusLabel"),
      tone: !account?.address ? "action" : canReview(capabilityProfile) || !capabilityProfile.isConfigured ? "ready" : "warning",
      detail: !account?.address
        ? t("connectReviewerWallet")
        : canReview(capabilityProfile) || !capabilityProfile.isConfigured
          ? t("walletVerifiedWithRole", { role: getRoleLabel(capabilityProfile) })
          : t("connectedWalletNoReviewerAccess"),
    },
    {
      label: t("walrusSyncActiveStatusLabel"),
      tone: storageRuntime.mode === "walrus" ? "ready" : "warning",
      detail: storageRuntime.mode === "walrus"
        ? t("trustedStorageAvailable")
        : t("localFallbackActive"),
    },
    ...(hasAdminAccess
      ? [
          {
            label: t("pendingSuiVerificationStatusLabel"),
            tone: pendingSignals.length > 0 ? "pending" : statusSignals.length > 0 ? "ready" : "pending",
            detail: pendingSignals.length > 0
              ? t("signalsWaitingForVerification", { count: pendingSignals.length })
              : statusSignals.length > 0
                ? t("noPendingProofRegistrations")
                : t("awaitingProjectSignals"),
          },
          {
            label: t("roadmapPublishingReadyStatusLabel"),
            tone: roadmapReadySignals.length > 0 ? "ready" : statusSignals.length > 0 ? "pending" : "pending",
            detail: roadmapReadySignals.length > 0
              ? t("signalsReadyForPublicRoadmap", { count: roadmapReadySignals.length })
              : statusSignals.length > 0
                ? t("markSignalsForRoadmap")
                : t("noRoadmapCandidatesYet"),
          },
        ] satisfies OperationsStatusItem[]
      : []),
  ];
  const selectedRoadmapUrl = selectedRecord
    ? getPublicRoadmapPath(selectedRecord.form.id, selectedRecord.form.manifestBlobId)
    : "";
  const hasExplicitSelectedRecord = Boolean(selectedSignalId && selectedRecord);
  const isSelectedRecordOnRoadmap = selectedRecord
    ? ROADMAP_READY_STATUSES.has(selectedRecord.submission.triageStatus)
    : false;
  const selectedRecordNeedsDecrypt = Boolean(
    selectedRecord?.submission.isEncrypted && !detailAnswers,
  );
  const selectedRecordEncryptedBlobId = selectedRecord?.submission.encryptedBlobId;
  const selectedRecordEncryptedBlobStoredOnWalrus = Boolean(
    selectedRecordEncryptedBlobId && !isLocalFallbackBlob(selectedRecordEncryptedBlobId),
  );
  const selectedRecordUnlockDisabledReason = detailAnswers
    ? undefined
    : !selectedRecord?.submission.isEncrypted
      ? t("privateSignalUnlockUnavailable")
      : !account?.address || (!canReview(capabilityProfile) && capabilityProfile.isConfigured)
        ? t("privateSignalUnlockDisabled")
        : undefined;
  const reviewBasePath =
    typeof window !== "undefined" && window.location.pathname.startsWith("/admin") ? "/admin" : "/dashboard";

  function syncMobileSignalUrl(record: SignalRecord | null) {
    if (typeof window === "undefined" || !window.matchMedia?.("(max-width: 640px)").matches) {
      return;
    }
    const nextPath = record
      ? `${reviewBasePath}/forms/${record.form.id}/submissions/${record.submission.id}`
      : reviewBasePath;
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
    }
  }

  function handleReturnToSignals() {
    setSelectedSignalId("");
    syncMobileSignalUrl(null);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function handleSelectMobileSignal(record: SignalRecord) {
    setSelectedSignalId(record.submission.id);
    syncMobileSignalUrl(record);
    window.requestAnimationFrame(() => {
      reviewInboxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

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
                  {isRegisteringSignal(selectedRecord.submission.id) ? t("registeringStatus") : t("registerOnSui")}
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
  const firstVisibleForm = statusForms[0] ?? null;
  const firstProtectedSignal = statusSignals.find((record) => record.submission.isEncrypted) ?? null;
  const shouldHighlightCreateProjectCta = projects.length === 0 && hasAdminAccess;
  const nextRecommendedAction =
    !hasAdminAccess
      ? accessibleForms.length === 0
        ? {
            label: "Create your first signal inbox",
            detail: "Create a wallet-owned form. Project controls stay hidden until this wallet has AdminCap or OwnerCap.",
            cta: <CreateFormLink className="primary-button">Create Signal Form</CreateFormLink>,
          }
        : allSignals.length === 0
          ? {
              label: "Send a test signal",
              detail: "Open your public form and submit one signal so this inbox has something to process.",
              cta: firstVisibleForm ? <Link className="primary-button" to={getPublicFormPath(firstVisibleForm.id, firstVisibleForm.manifestBlobId)}>Open Public Link</Link> : null,
            }
          : {
              label: "Review signal inbox",
              detail: "This wallet can review its own forms. Project management requires AdminCap or OwnerCap.",
              cta: null,
            }
    : !selectedProject
      ? {
          label: "Connect a project",
          detail: "Create a new project or connect an existing one before you create or review private signals.",
          cta: (
            <div className="inline-actions">
              {hasAdminAccess ? (
                <button
                  type="button"
                  className={`primary-button ${shouldHighlightCreateProjectCta ? "create-project-cta-highlight" : ""}`}
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
                {t("connectExistingShort")}
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
                      label: t("registerProofOnSui"),
                      detail: "Review is already complete. Use Sui only when you want to add optional proof records.",
                      cta: (
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={registeringSignalIds.length > 0}
                          onClick={() => void handleRegisterPendingSignals()}
                        >
                          {registeringSignalIds.length > 0 ? t("registeringStatus") : t("registerPendingSignals")}
                        </button>
                      ),
                    }
                : {
                    label: "Review signal inbox",
                    detail: "The queue is healthy. Keep reviewing new signals and update roadmap entries as they change.",
                    cta: selectedRoadmapUrl ? <Link className="primary-button" to={selectedRoadmapUrl}>Open Public Roadmap</Link> : null,
                  };

  const activeReviewDraft: ReviewDraft | null = selectedRecord
    ? reviewDraft ?? {
        status: selectedRecord.submission.status,
        triageStatus: selectedRecord.submission.triageStatus,
        priority: selectedRecord.submission.priority,
        signalValue: selectedRecord.submission.signalValue,
        notes: selectedRecord.submission.notes,
      }
    : null;
  const hasReviewDraftChanges = Boolean(
    selectedRecord &&
      activeReviewDraft &&
      (activeReviewDraft.status !== selectedRecord.submission.status ||
        activeReviewDraft.triageStatus !== selectedRecord.submission.triageStatus ||
        activeReviewDraft.priority !== selectedRecord.submission.priority ||
        activeReviewDraft.signalValue !== selectedRecord.submission.signalValue ||
        activeReviewDraft.notes !== selectedRecord.submission.notes),
  );
  function patchReviewDraft(patch: Partial<ReviewDraft>) {
    if (!selectedRecord) {
      return;
    }
    setReviewDraft((current) => {
      const base = current ?? {
        status: selectedRecord.submission.status,
        triageStatus: selectedRecord.submission.triageStatus,
        priority: selectedRecord.submission.priority,
        signalValue: selectedRecord.submission.signalValue,
        notes: selectedRecord.submission.notes,
      };
      return {
        ...base,
        ...patch,
      };
    });
  }

  useEffect(() => {
    const selectedRecordId = selectedRecord?.submission.id ?? null;
    if (selectedRecordId === selectedRecordResetRef.current) {
      return;
    }
    selectedRecordResetRef.current = selectedRecordId;

    if (!selectedRecord) {
      setReviewDraft(null);
      setDecryptError("");
      return;
    }
    setReviewDraft({
      status: selectedRecord.submission.status,
      triageStatus: selectedRecord.submission.triageStatus,
      priority: selectedRecord.submission.priority,
      signalValue: selectedRecord.submission.signalValue,
      notes: selectedRecord.submission.notes,
    });
    setDecryptError("");
  }, [selectedRecord, setDecryptError]);

  async function updateSubmission(nextSubmission: Submission, options: { announce?: boolean } = {}) {
    const normalized = normalizeSubmission({
      ...nextSubmission,
      updatedAt: new Date().toISOString(),
    });
    applySubmissionUpdate(normalized);
    setSelectedSignalId(normalized.id);
    let saved = false;
    const runSave = async () => {
      setSaving(true);
      setReviewSaveStatus("saving");
      try {
        await storageAdapter.updateSubmission(normalized);
        const nextStatus = normalized.pendingOnchainRegistration ? "skipped" : "saved";
        setReviewSaveStatus(nextStatus);
        if (options.announce) {
          setToast({
            tone: "success",
            message:
              nextStatus === "skipped"
                ? "Review saved. On-chain sync skipped until proof registration."
                : "Review & Triage saved.",
          });
        }
        saved = true;
      } catch (error) {
        setReviewSaveStatus("error");
        setToast({
          tone: "error",
          message: error instanceof Error ? error.message : "Review save failed.",
        });
      } finally {
        setSaving(false);
      }
    };
    saveQueueRef.current = saveQueueRef.current.then(runSave, runSave);
    await saveQueueRef.current;
    return saved;
  }

  async function handleMoveToRoadmap() {
    if (!selectedRecord) {
      return;
    }
    const nextStatus = ROADMAP_READY_STATUSES.has(selectedRecord.submission.triageStatus)
      ? selectedRecord.submission.triageStatus
      : "planned";
    const saved = await updateSubmission({
      ...selectedRecord.submission,
      triageStatus: nextStatus,
    });
    if (!saved) {
      return;
    }
    setToast({ tone: "success", message: t("signalAddedToPublicRoadmap") });
  }

  const streamItems = [
    { id: "all", label: t("allSignals"), count: allSignals.length },
    {
      id: "unread",
      label: t("unreadSignals"),
      count: signalIndex.counts.unread,
    },
    {
      id: "encrypted",
      label: t("protectedLabel"),
      count: signalIndex.counts.encrypted,
    },
    {
      id: "high",
      label: t("flaggedLabel"),
      count: signalIndex.counts.high,
    },
    {
      id: "pending_sui",
      label: t("pendingSuiShortLabel"),
      count: signalIndex.counts.pendingSui,
    },
    {
      id: "archived",
      label: t("resolvedLabel"),
      count: signalIndex.counts.archived,
    },
  ] satisfies Array<{ id: StreamId; label: string; count: number }>;
  const unreadCountByFormId = signalIndex.unreadCountByFormId;

  const selectedForm = accessibleForms.find((form) => form.id === selectedFormId) ?? null;
  const selectedBeaconForm =
    accessibleForms.find((form) => form.id === beaconFormId) ?? null;
  const canDeleteForm = useCallback(
    (form: Pick<FormSchema, "ownerAddress">) =>
      hasAdminAccess || !capabilityProfile.isConfigured || addressesMatch(form.ownerAddress, account?.address),
    [account?.address, capabilityProfile.isConfigured, hasAdminAccess],
  );
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
  const workspaceMetaItems = hasAdminAccess
    ? [
        formatWorkspaceCount(selectedProject ? selectedProject.formsCount : accessibleForms.length, "Form"),
        formatWorkspaceCount(selectedProject ? selectedProject.signalsCount : allSignals.length, "Signal"),
        formatWorkspaceCount(projectMemberCount || 1, "Member"),
        selectedProject ? "Protected" : "Local mode",
        formatAccessLabel(roleLabel),
      ]
    : [
        formatWorkspaceCount(accessibleForms.length, "Form"),
        formatWorkspaceCount(allSignals.length, "Signal"),
        "Owner wallet",
      ];
  const selectedFormSubmissionCount = selectedRecord ? (submissionsByFormId[selectedRecord.form.id] ?? []).length : 0;
  const selectedFormFilteredExportCount = selectedRecord
    ? visibleSignals.filter((record) => record.form.id === selectedRecord.form.id).length
    : 0;
  const selectedFormSelectedExportCount = selectedRecord ? 1 : 0;
  const csvExportCount =
    csvExportScope === "filtered"
      ? selectedFormFilteredExportCount
      : csvExportScope === "selected"
        ? selectedFormSelectedExportCount
        : selectedFormSubmissionCount;
  const csvExportScopeLabel =
    csvExportScope === "filtered"
      ? t("filteredExportCount", { count: selectedFormFilteredExportCount })
      : csvExportScope === "selected"
        ? t("selectedResponsesCount", { count: selectedFormSelectedExportCount })
      : t("allResponsesCount", { count: selectedFormSubmissionCount });
  const csvExportShortScopeLabel =
    csvExportScope === "filtered"
      ? t("filteredExportShort")
      : csvExportScope === "selected"
        ? t("selectedExportShort")
        : t("allExportShort");
  const csvExportIncludesDecryptedData = Boolean(detailAnswers && csvExportCount > 0);
  const reviewSaveStatusLabel: Record<ReviewSaveStatus, string> = {
    idle: t("reviewSaveReady"),
    saving: t("reviewSaveSaving"),
    saved: t("reviewSaveSaved"),
    skipped: t("reviewSaveSkipped"),
    error: t("reviewSaveError"),
  };
  const reviewStatusPillState = hasReviewDraftChanges ? "editing" : reviewSaveStatus;
  const reviewStatusPillLabel = hasReviewDraftChanges ? "Editing" : reviewSaveStatusLabel[reviewSaveStatus];

  function getCsvFilterSnapshot() {
    return {
      searchQuery: search,
      status: selectedStreamId === "all" ? undefined : `stream:${selectedStreamId}`,
      priority: selectedStreamId === "high" ? "high" : undefined,
      tags: search.trim() ? [search.trim()] : [],
      triageStatus: undefined,
      dateRange: {},
    };
  }

  function getCsvExportResponses() {
    if (!selectedRecord) {
      return [];
    }
    const allFormResponses = (submissionsByFormId[selectedRecord.form.id] ?? []).map((submission) =>
      normalizeSubmission(submission),
    );
    if (csvExportScope === "selected") {
      return allFormResponses.filter((submission) => submission.id === selectedRecord.submission.id);
    }
    if (csvExportScope === "filtered") {
      const filteredResponseIds = new Set(
        visibleSignals
          .filter((record) => record.form.id === selectedRecord.form.id)
          .map((record) => record.submission.id),
      );
      return allFormResponses.filter((submission) => filteredResponseIds.has(submission.id));
    }
    return allFormResponses;
  }

  function getCsvResponseOverrides() {
    return detailAnswers && selectedRecord
      ? {
          [selectedRecord.submission.id]: {
            answers: detailAnswers,
            attachments: detailAttachments,
          },
        }
      : undefined;
  }

  function handleOpenCsvExportReview() {
    if (!selectedRecord || csvExportCount === 0) {
      setToast({ tone: "error", message: t("noResponsesMatchCurrentFilters") });
      return;
    }
    const responses = getCsvExportResponses();
    const options: ExportResponsesToCsvOptions = {
      language,
      now: new Date(),
      scope: csvExportScope,
      sortOrder: csvSortOrder,
      excludedPiiFields: excludedCsvPiiFields,
      exportedBy: account?.address ?? "",
      filterSnapshot: getCsvFilterSnapshot(),
      responseOverrides: getCsvResponseOverrides(),
    };
    const metadata = buildExportMetadata(selectedRecord.form, responses, options);
    setPendingCsvExportForm(selectedRecord.form);
    setPendingCsvExportResponses(responses);
    setPendingCsvExportMetadata(metadata);
    setPendingCsvExportOptions({ ...options, metadata });
  }

  function handleToggleCsvPiiField(field: ExportPiiField) {
    setExcludedCsvPiiFields((current) => {
      const next = current.includes(field) ? current.filter((item) => item !== field) : [...current, field];
      if (pendingCsvExportMetadata && pendingCsvExportForm && pendingCsvExportOptions) {
        const nextOptions: ExportResponsesToCsvOptions = {
          ...pendingCsvExportOptions,
          excludedPiiFields: next,
          now: new Date(pendingCsvExportMetadata.exportedAt),
          metadata: undefined,
        };
        const nextMetadata = buildExportMetadata(pendingCsvExportForm, pendingCsvExportResponses, nextOptions);
        setPendingCsvExportMetadata(nextMetadata);
        setPendingCsvExportOptions({ ...nextOptions, metadata: nextMetadata });
      }
      return next;
    });
  }

  function handleConfirmCsvExport() {
    if (!pendingCsvExportForm || !pendingCsvExportOptions) {
      return;
    }
    try {
      const result = exportResponsesToCsv(pendingCsvExportForm, pendingCsvExportResponses, pendingCsvExportOptions);
      if (result?.exported) {
        setPendingCsvExportMetadata(null);
        setPendingCsvExportForm(null);
        setPendingCsvExportResponses([]);
        setPendingCsvExportOptions(null);
        setToast({ tone: "success", message: t("csvExported") });
      }
    } catch (error) {
      console.error("CSV export failed", error);
      setToast({ tone: "error", message: t("csvExportFailed") });
    }
  }
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
  const nodeDirectoryItems = useMemo(() => {
    const normalizedSearch = nodeSearch.trim().toLowerCase();
    const allFormsItem = {
      id: "all",
      title: t("allSignalNodes"),
      submissionCount: allSignals.length,
      unreadCount: signalIndex.counts.unread,
      isLegacyDemo: false,
      canDelete: false,
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
        canDelete: canDeleteForm(form),
      }));
    return [allFormsItem, ...formItems];
  }, [
    accessibleForms,
    allSignals.length,
    canDeleteForm,
    nodeSearch,
    signalIndex.counts.unread,
    t,
    unreadCountByFormId,
  ]);

  const deletableNodeIds = useMemo(
    () => nodeDirectoryItems.filter((item) => item.id !== "all" && item.canDelete).map((item) => item.id),
    [nodeDirectoryItems],
  );

  if (loading) {
    return <div className="panel">{t("loadingResearchLab")}</div>;
  }

  if (loadError) {
    return (
      <div className="panel stack">
        <strong>{t("researchLabFailedToLoad")}</strong>
        <p className="warning-text">{loadError}</p>
        <button
          type="button"
          className="ghost-button"
          onClick={() => void loadConsole()}
        >
          {t("retryLabel")}
        </button>
      </div>
    );
  }

  if (isLoadingAccess) {
    return <div className="panel">{t("checkingWalletCapabilities")}</div>;
  }

  return (
    <AdminAccessGate
      hasWallet={Boolean(account?.address)}
      access={accessState}
      deniedBody={capabilityProfile.isConfigured ? t("reviewConsoleCapabilityRequirement") : undefined}
    >
      <section className="stack">
        <AdminToast toast={toast} />
        {pendingCsvExportMetadata ? (
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
              setPendingCsvExportForm(null);
              setPendingCsvExportResponses([]);
              setPendingCsvExportOptions(null);
            }}
            onConfirm={handleConfirmCsvExport}
          />
        ) : null}

        <section className="panel glow-panel workspace-hero workspace-hero-compact desktop-signal-inbox-hero">
          <div className="workspace-hero-main workspace-overview-shell">
            <div className="workspace-hero-copy">
              <p className="eyebrow">{t("signalInboxTitle")}</p>
              <h1>{hasAdminAccess && selectedProject ? selectedProject.name : t("signalInboxTitle")}</h1>
              <div className="workspace-hero-meta">
                {workspaceMetaItems.map((item) => (
                  <span key={item} className="workspace-meta-item">
                    {item}
                  </span>
                ))}
                <span className="workspace-meta-item">{privateReviewLabel}</span>
                {isLoadingCapabilities ? (
                  <span className="workspace-meta-item">{t("checkingWalletAccess")}</span>
                ) : null}
              </div>
            </div>

            <aside className="workspace-action-dock">
              <div className="workspace-dock-actions">
                <CreateFormLink
                  className={`primary-button ${highlightCreateFormCta ? "create-form-cta-highlight" : ""}`}
                >
                  {t("navCreateForm")}
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
                  {t("reviewButton")}
                </button>
                {hasAdminAccess ? (
                  <>
                    <Link className="ghost-button" to="/admin/access">
                      {t("membersButton")}
                    </Link>
                    <button
                      type="button"
                      className="ghost-button workspace-project-trigger"
                      onClick={() => {
                        const details = advancedProjectSettingsRef.current;
                        if (!details) {
                          return;
                        }
                        details.open = true;
                        details.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }}
                    >
                      {selectedProject ? t("projectButtonLabel", { name: selectedProject.name }) : t("chooseProjectButton")}
                    </button>
                  </>
                ) : null}
              </div>
            </aside>
          </div>
        </section>

        {accessibleForms.length === 0 ? (
          <EmptyState>
            <h2>{t("noCreatorInboxesTitle")}</h2>
            <p>{t("noCreatorInboxesBody")}</p>
            <CreateFormLink className="primary-button">
              {t("createSignalForm")}
            </CreateFormLink>
          </EmptyState>
        ) : (
          <>
          <MobileSignalInbox
            title={t("signalInboxTitle")}
            activeScopeLabel={activeScopeLabel}
            visibleCountLabel={t("visibleSignalsLabel", { count: visibleSignals.length })}
            unreadCountLabel={t("unreadBadge", { count: visibleUnreadCount })}
            emptyContent={(
              <EmptyState variant="abyss">
                <p className="eyebrow">{t("inboxEmptyEyebrow")}</p>
                <h2>
                  {!hasAdminAccess
                    ? t("sendTestSignalToStartReviewTitle")
                    : !selectedProject
                    ? t("chooseProjectFirstTitle")
                    : selectedProjectForms.length === 0
                      ? t("createFirstSignalFormTitle")
                      : t("sendTestSignalToStartReviewTitle")}
                </h2>
                <p>
                  {!hasAdminAccess
                    ? t("sendTestSignalToStartReviewBody")
                    : !selectedProject
                    ? t("chooseProjectFirstBody")
                    : selectedProjectForms.length === 0
                      ? t("createFirstSignalFormBody")
                      : t("sendTestSignalToStartReviewBody")}
                </p>
              </EmptyState>
            )}
            search={search}
            onSearchChange={setSearch}
            streamItems={streamItems}
            selectedStreamId={selectedStreamId}
            onSelectStream={setSelectedStreamId}
            visibleSignals={visibleSignals}
            selectedRecord={hasExplicitSelectedRecord ? selectedRecord : null}
            unlockedSignalId={detailAnswers && selectedRecord ? selectedRecord.submission.id : null}
            selectedPendingSignalIds={selectedPendingSignalIds}
            onSelectSignal={handleSelectMobileSignal}
            searchPlaceholder={t("searchSignalsPlaceholder")}
            t={t}
          />
          <section
            ref={reviewInboxRef}
            className={`panel signal-inbox-workbench desktop-signal-inbox ${hasExplicitSelectedRecord ? "has-selected-signal" : ""}`}
          >
            <div className="signal-workbench-header">
              <div className="signal-workbench-copy">
                <p className="eyebrow">{t("signalInboxTitle")}</p>
                <h2>{t("reviewWorkspaceTitle")}</h2>
                <p className="muted">{t("reviewWorkspaceBody")}</p>
              </div>
              <div className="signal-workbench-summary">
                <span className="signal-chip">{t("visibleSignalsLabel", { count: visibleSignals.length })}</span>
                <span className="signal-chip signal-chip-soft">{t("unreadBadge", { count: visibleUnreadCount })}</span>
                <span className="signal-chip signal-chip-soft">{activeScopeLabel}</span>
              </div>
            </div>

            <nav className="mobile-review-nav" aria-label={t("reviewWorkspaceTitle")}>
              <button type="button" onClick={() => scrollToReviewPanel("streams")}>
                {t("mobileReviewNavNodes")}
              </button>
              <button type="button" onClick={() => scrollToReviewPanel("signals")}>
                {t("mobileReviewNavSignals")}
              </button>
              <button type="button" onClick={() => scrollToReviewPanel("detail")} disabled={!selectedRecord}>
                {t("mobileReviewNavDetail")}
              </button>
            </nav>

            <div className="signal-console-layout admin-console-layout signal-console-layout-priority">
              <div ref={streamsPanelRef} className="signal-console-region signal-console-region-streams">
                <SignalStreamsNav
                  streamItems={streamItems}
                  selectedStreamId={selectedStreamId}
                  onSelectStream={(streamId) => {
                    setSelectedStreamId(streamId);
                    scrollToReviewPanel("signals");
                  }}
                  accessibleForms={accessibleForms}
                  selectedFormId={selectedFormId}
                  onSelectForm={(formId) => {
                    setSelectedFormId(formId);
                    scrollToReviewPanel("signals");
                  }}
                  unreadCountByFormId={unreadCountByFormId}
                  visibleUnreadCount={visibleUnreadCount}
                  allSignalsCount={allSignals.length}
                  activeScopeLabel={activeScopeLabel}
                  activeNodeSummary={t("activeNodeSummary", { count: accessibleForms.length })}
                  allSignalNodesLabel={t("allSignalNodes")}
                  responseDeadlineLabels={responseDeadlineLabels}
                  openNodeDirectoryLabel={t("openNodeDirectory")}
                  onOpenNodeDirectory={() => setNodeDirectoryOpen(true)}
                />
              </div>

            <section ref={signalListPanelRef} className="panel signal-inbox-column">
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
                  <span className="signal-chip signal-chip-soft">{t("resultsLabel", { count: visibleSignals.length })}</span>
                  <span className="signal-chip signal-chip-soft">{t("pendingSuiResultsLabel", { count: pendingSignals.length })}</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("searchSignalsPlaceholder")}
                  />
                </div>
              </div>
              {hasAdminAccess ? (
                <section className="answer-card answer-card-plain">
                  <div className="section-row">
                    <div>
                      <p className="eyebrow">{t("pendingSuiRegistrationEyebrow")}</p>
                      <h3>{t("optionalProofQueueTitle")}</h3>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={selectedPendingSignalIds.length === 0 || registeringSignalIds.length > 0}
                      onClick={() => void handleRegisterPendingSignals()}
                    >
                      {registeringSignalIds.length > 0
                        ? t("registeringOnSui")
                        : t("registerSelectedOnSui", { count: selectedPendingVisibleCount })}
                    </button>
                  </div>
                  <p className="muted">{t("optionalProofQueueBody")}</p>
                </section>
              ) : null}

              {visibleSignals.length === 0 ? (
                <EmptyState variant="abyss">
                  <p className="eyebrow">{t("inboxEmptyEyebrow")}</p>
                  <h2>
                    {!hasAdminAccess
                      ? t("sendTestSignalToStartReviewTitle")
                      : !selectedProject
                      ? t("chooseProjectFirstTitle")
                      : selectedProjectForms.length === 0
                        ? t("createFirstSignalFormTitle")
                        : t("sendTestSignalToStartReviewTitle")}
                  </h2>
                  <p>
                    {!hasAdminAccess
                      ? t("sendTestSignalToStartReviewBody")
                      : !selectedProject
                      ? t("chooseProjectFirstBody")
                      : selectedProjectForms.length === 0
                        ? t("createFirstSignalFormBody")
                        : t("sendTestSignalToStartReviewBody")}
                  </p>
                  <div className="inline-actions">
                    {!hasAdminAccess && firstVisibleForm ? (
                      <Link
                        className="primary-button"
                        to={getPublicFormPath(firstVisibleForm.id, firstVisibleForm.manifestBlobId)}
                      >
                        {t("openPublicLink")}
                      </Link>
                    ) : !selectedProject ? null : selectedProjectForms.length === 0 ? (
                      <CreateFormLink className="primary-button">
                        {t("createSignalForm")}
                      </CreateFormLink>
                    ) : firstProjectForm ? (
                      <>
                        <Link
                          className="primary-button"
                          to={getPublicFormPath(firstProjectForm.id, firstProjectForm.manifestBlobId)}
                        >
                          {t("openPublicLink")}
                        </Link>
                        <Link
                          className="ghost-button"
                          to={getPublicFormPath(firstProjectForm.id, firstProjectForm.manifestBlobId)}
                        >
                          {t("sendTestSignal")}
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
                          {t("returnToAdminInbox")}
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
                    const isSelectedSignal = selectedRecord?.submission.id === submission.id;
                    const isUnlockedSignal = isSelectedSignal && Boolean(detailAnswers);
                    return (
                      <div
                        key={submission.id}
                        className={`signal-card ${isSelectedSignal ? "is-active" : ""} ${submission.status === "unread" ? "is-unread" : "is-read"}`}
                        role="button"
                        tabIndex={0}
                        aria-current={isSelectedSignal ? "true" : undefined}
                        onClick={() => {
                          setSelectedSignalId(submission.id);
                          scrollToReviewPanel("detail");
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") {
                            return;
                          }
                          event.preventDefault();
                          setSelectedSignalId(submission.id);
                          scrollToReviewPanel("detail");
                        }}
                      >
                        <div className="signal-card-topline">
                          <span className={`signal-card-read-dot status-${submission.status}`} aria-hidden="true" />
                          <strong>{getSignalSubject(submission)}</strong>
                          <span className="signal-card-time">{formatDate(submission.createdAt)}</span>
                        </div>
                        <p className={`signal-card-preview ${submission.isEncrypted ? "is-locked" : ""}`}>
                          {submission.isEncrypted
                            ? t("encryptedPrivateSignalUnlockHint")
                            : getSignalPreview(submission)}
                        </p>
                        <div className="signal-card-formline">
                          <span className="signal-card-form">{form.title}</span>
                          {getSubmissionRespondentMeta(submission).isAnonymous ? (
                            <span className="signal-chip">{t("anonymousRespondent")}</span>
                          ) : submission.contributorId ? (
                            <SignalMetaChip type="contributor" value={getRespondentDisplayLabel(submission)} />
                          ) : null}
                        </div>
                        <div className="signal-card-mailbox-meta" aria-label="Signal review state">
                          <span className={`mailbox-meta-chip priority-${submission.priority}`}>
                            {submission.priority}
                          </span>
                          <span className={`mailbox-meta-chip triage-${submission.triageStatus}`}>
                            {getTriageStatusLabel(submission.triageStatus)}
                          </span>
                          <span className={`mailbox-meta-chip ${submission.isEncrypted ? "is-locked" : "is-open"} ${isUnlockedSignal ? "is-unlocked" : ""}`}>
                            {submission.isEncrypted
                              ? isUnlockedSignal
                                ? t("unlockedSignalState")
                                : t("lockedSignalState")
                              : t("openSignalState")}
                          </span>
                          <span className={`mailbox-meta-chip status-${submission.status}`}>
                            {submission.status === "unread"
                              ? t("statusUnread")
                              : submission.status === "read"
                                ? t("statusRead")
                                : t("statusArchived")}
                          </span>
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
                              {isSelectedForSui ? t("selectedLabel") : t("selectForSui")}
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
                              {isRegisteringSignal(submission.id) ? t("registeringStatus") : t("registerOnSui")}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <article ref={signalDetailPanelRef} className="panel signal-detail-column">
              {!selectedRecord ? (
                <EmptyState variant="abyss" animated={false} showVisual={false}>
                  <p className="eyebrow">Signal detail</p>
                  <h2>No signal selected</h2>
                  <p>Choose a signal from the inbox to review it, unlock the private message, and move it toward the Public Roadmap.</p>
                </EmptyState>
              ) : (
                <>
                  <section className="answer-card signal-detail-hero">
                    <button
                      type="button"
                      className="ghost-button mobile-detail-back-button"
                      onClick={handleReturnToSignals}
                    >
                      {t("backToSignals")}
                    </button>
                    <div className="signal-detail-heading">
                    <div>
                      <p className="eyebrow">{t("signalDetailTitle")}</p>
                      <h2>{getSignalSubject(selectedRecord.submission)}</h2>
                      <p className="muted">
                        {selectedRecord.form.title} / {formatDate(selectedRecord.submission.createdAt)}
                      </p>
                      <p className="muted">{t("signalDetailReviewHint")}</p>
                    </div>
                    <div className="inline-actions signal-detail-utility-actions">
                      <Link
                        className="ghost-button"
                        to={`/dashboard/forms/${selectedRecord.form.id}/submissions/${selectedRecord.submission.id}`}
                      >
                        {t("openFormInbox")}
                      </Link>
                      <span className="signal-chip signal-chip-soft">{t("reviewFirstLabel")}</span>
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
                      {t("severityLabel", { value: selectedRecord.submission.severity ?? t("mediumLabel") })}
                      </span>
                      <span className={`signal-chip ${detailAnswers ? "signal-chip-accent" : ""}`}>
                        {detailAnswers
                          ? t("privateSignalUnlockedStatus")
                          : selectedRecord.submission.isEncrypted
                            ? t("encryptedPrivateSignalStatus")
                            : t("openSubmissionLabel")}
                      </span>
                      {typeof selectedRecord.submission.ratingValue === "number" ? (
                        <span className="signal-chip">
                          {t("ratingLabel", {
                            value: selectedRecord.submission.ratingValue,
                          })}
                        </span>
                      ) : null}
                      <span className="signal-chip">{t("signalsInThisFormLabel", { count: selectedFormSubmissionCount })}</span>
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

                  <div className="signal-detail-sections review-primary-sections">
                    <section className="answer-card original-signal-section">
                      <div className="signal-detail-group-header signal-detail-group-header-original">
                        <p className="eyebrow">{t("originalSignalTitle")}</p>
                        <h3>{t("originalSignalTitle")}</h3>
                        <p className="muted">{t("originalSignalBody")}</p>
                      </div>
                      <div className="original-signal-block original-signal-body-block">
                        <div className="section-row">
                          <div>
                            <p className="eyebrow">{t("feedbackBodyLabel")}</p>
                            <h4>{t("submittedFeedbackTitle")}</h4>
                          </div>
                        </div>
                      {detailAnswers ? (
                        <div className="stack">
                          {detailLegacyUnencrypted ? (
                            <p className="warning-text">{t("legacyUnencryptedResponse")}</p>
                          ) : (
                            <div className="signal-badge-row signal-badge-row-compact">
                              <span className="signal-chip signal-chip-accent">{t("sealEncryptedCreatorAdminOnly")}</span>
                              {selectedRecordEncryptedBlobStoredOnWalrus && selectedRecordEncryptedBlobId ? (
                                <>
                                  <span className="signal-chip signal-chip-soft">{t("storedOnWalrus")}</span>
                                  <span className="signal-meta-inline">
                                    <span className="signal-meta-inline-label">{t("blobIdLabel")}</span>
                                    <SignalMetaChip type="blob" value={selectedRecordEncryptedBlobId} />
                                  </span>
                                </>
                              ) : null}
                            </div>
                          )}
                          {selectedRecord.form.fields
                            .filter((field) => !isAttachmentFieldType(field.type))
                            .map((field) => (
                              <div key={field.id} className="answer-line">
                                <strong>{field.label}</strong>
                                {renderAnswerValue(field, detailAnswers[field.id])}
                              </div>
                            ))}
                        </div>
                      ) : selectedRecordNeedsDecrypt ? (
                        <div className="locked-signal-state">
                          <div className="locked-signal-copy">
                            <div className="classified-signal-redaction" aria-hidden="true">
                              <span />
                              <span />
                              <span />
                              <span />
                              <span />
                              <span />
                            </div>
                            <strong>{t("encryptedPrivateSignalStatus")}</strong>
                            <p>{t("requiresReviewerAccessDecryptHint")}</p>
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
                        <p className="muted">{t("attachmentsHiddenUntilUnlocked")}</p>
                      ) : detailAttachments.length === 0 ? (
                        <p className="muted">{t("noAttachments")}</p>
                      ) : (
                        <SignalAttachmentList
                          attachments={detailAttachments}
                          attachmentPreviews={attachmentPreviews}
                          verifyOnWalrusLabel={t("verifyOnWalrus")}
                        />
                      )}
                      </div>
                    </section>

                    {selectedRecordNeedsDecrypt ? (
                      <PrivateSignalUnlockCard
                        onUnlock={() => void handleDecrypt()}
                        isDecrypting={decrypting || decryptInFlightRef.current}
                        isUnlocked={Boolean(detailAnswers)}
                        unlockState={decryptState}
                        statusMessage={decryptStatusMessage}
                        errorMessage={decryptError}
                        diagnostics={decryptDiagnostics}
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
                      <div className="review-unlock-context">
                        <strong>Unlock private signal to review.</strong>
                        <p className="muted">
                          {t("walletApprovalReuseNotice", { minutes: realSealSessionTtlMinutes })}
                        </p>
                        {decryptStatusMessage ? (
                          <p className="muted" role="status" aria-live="polite">{decryptStatusMessage}</p>
                        ) : null}
                      </div>
                    ) : null}

                    <section className="answer-card review-controls-section review-triage-card">
                      <div className="review-controls-header">
                        <div>
                          <p className="eyebrow">Review Workbench</p>
                          <h3>Review Workbench</h3>
                          <p className="review-helper-copy">Turn this raw feedback into an actionable signal.</p>
                        </div>
                        <span className={`save-state-pill is-${reviewStatusPillState}`}>
                          {reviewStatusPillLabel}
                        </span>
                      </div>
                      <div className="review-field-grid">
                        <div className="review-badge-field">
                          <span>Review State</span>
                          <div className="review-badge-options" role="group" aria-label="Review State">
                            {[
                              { value: "unread", label: t("statusUnread") },
                              { value: "read", label: t("statusRead") },
                              { value: "archived", label: t("statusArchived") },
                            ].map((option) => {
                              const isSelected = activeReviewDraft?.status === option.value;

                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={`review-state-badge is-status-${option.value} ${isSelected ? "is-active" : ""}`}
                                  aria-pressed={isSelected}
                                  disabled={saving || isSelected}
                                  onClick={() => patchReviewDraft({ status: option.value as Submission["status"] })}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="review-badge-field">
                          <span>Triage Status</span>
                          <div className="review-badge-options" role="group" aria-label="Triage Status">
                            {TRIAGE_STATUS_OPTIONS.map((option) => {
                              const isSelected = activeReviewDraft?.triageStatus === option.value;

                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={`review-state-badge is-triage-${option.value} ${isSelected ? "is-active" : ""}`}
                                  aria-pressed={isSelected}
                                  disabled={saving || isSelected}
                                  onClick={() => patchReviewDraft({ triageStatus: option.value })}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="review-badge-field">
                          <span>{t("priority")}</span>
                          <div className="review-badge-options" role="group" aria-label={t("priority")}>
                            {[
                              { value: "low", label: t("priorityLow") },
                              { value: "medium", label: t("priorityMedium") },
                              { value: "high", label: t("priorityHigh") },
                            ].map((option) => {
                              const isSelected = activeReviewDraft?.priority === option.value;

                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={`review-state-badge is-priority-${option.value} ${isSelected ? "is-active" : ""}`}
                                  aria-pressed={isSelected}
                                  disabled={saving || isSelected}
                                  onClick={() => patchReviewDraft({ priority: option.value as Submission["priority"] })}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="review-badge-field">
                          <span>Signal Value</span>
                          <div className="review-badge-options" role="group" aria-label="Signal Value">
                            <button
                              type="button"
                              className={`review-state-badge is-value-none ${activeReviewDraft?.signalValue === undefined ? "is-active" : ""}`}
                              aria-pressed={activeReviewDraft?.signalValue === undefined}
                              disabled={saving || activeReviewDraft?.signalValue === undefined}
                              onClick={() => patchReviewDraft({ signalValue: undefined })}
                            >
                              Not scored
                            </button>
                            <div className="review-star-rating" aria-label="Signal Value rating">
                              {[1, 2, 3, 4, 5].map((value) => {
                                const currentValue = activeReviewDraft?.signalValue ?? 0;
                                const isSelected = activeReviewDraft?.signalValue === value;
                                const isFilled = currentValue >= value;

                                return (
                                  <button
                                    key={value}
                                    type="button"
                                    className={`review-star-button ${isFilled ? "is-filled" : ""} ${isSelected ? "is-selected" : ""}`}
                                    aria-label={`Signal Value ${value}`}
                                    aria-pressed={isSelected}
                                    disabled={saving || isSelected}
                                    onClick={() => patchReviewDraft({ signalValue: value })}
                                  >
                                    ★
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                      <label className="review-select">
                        <span>Internal note</span>
                        <textarea
                          rows={5}
                          value={activeReviewDraft?.notes ?? ""}
                          onChange={(event) => patchReviewDraft({ notes: event.target.value })}
                          placeholder={t("captureReviewNotes")}
                        />
                      </label>
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
                          Mark as read
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
                          Close as resolved
                        </button>
                        <button
                          type="button"
                          className="primary-button review-primary-button"
                          disabled={saving || !hasReviewDraftChanges}
                          onClick={() =>
                            void updateSubmission({
                              ...selectedRecord.submission,
                              ...(activeReviewDraft ?? {}),
                            }, { announce: true })
                          }
                        >
                          Save review changes
                        </button>
                      </div>
                      <p className="review-action-helper">
                        These actions update the private inbox review. They do not publish the signal.
                      </p>
                      <div className="review-roadmap-strip">
                        <div>
                          <p className="eyebrow">Public roadmap decision</p>
                          <strong>
                            Roadmap status:{" "}
                            {getTriageStatusLabel(activeReviewDraft?.triageStatus ?? selectedRecord.submission.triageStatus)}
                          </strong>
                          <p className="muted">
                            Only signals set to Planned, In Progress, or Fixed appear publicly, with safe metadata only.
                          </p>
                        </div>
                        <div className="review-action-bar review-roadmap-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            disabled={saving}
                            onClick={() => void handleMoveToRoadmap()}
                          >
                            {isSelectedRecordOnRoadmap ? t("keepOnPublicRoadmap") : t("moveToPublicRoadmap")}
                          </button>
                          {isSelectedRecordOnRoadmap ? (
                            <Link className="ghost-button" to={selectedRoadmapUrl}>
                              {t("openRoadmap")}
                            </Link>
                          ) : null}
                          {selectedRecord.submission.githubIssueUrl ? (
                            <a
                              className="review-inline-link"
                              href={selectedRecord.submission.githubIssueUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open GitHub issue
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </section>
                  </div>

                  <div className="signal-detail-sections review-secondary-sections">
                    <section className="secondary-inspector">
                      <div className="secondary-inspector-header">
                        <div>
                          <p className="eyebrow">{t("secondaryToolsEyebrow")}</p>
                          <h3>Secondary inspector</h3>
                        </div>
                        <p className="muted">{t("metadataExportBody")}</p>
                      </div>

                      <div className="secondary-inspector-grid">
                        <details className="inspector-panel inspector-export-panel">
                          <summary>
                            <span>
                              <p className="eyebrow">Export</p>
                              <strong>JSON / CSV</strong>
                            </span>
                            <span className="inspector-summary">{csvExportScopeLabel}</span>
                          </summary>
                          <div className="inspector-panel-body">
                            <div className="export-quick-summary" aria-label="Current export summary">
                              <span>{csvExportShortScopeLabel}</span>
                              <span>{t("responsesCount", { count: csvExportCount })}</span>
                              <span>
                                {csvExportIncludesDecryptedData
                                  ? t("decryptedDataIncluded")
                                  : t("decryptedDataNotIncluded")}
                              </span>
                            </div>
                            <div className="inspector-export-actions">
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
                                onClick={handleOpenCsvExportReview}
                                disabled={csvExportCount === 0}
                              >
                                {t("exportCsv")}
                              </button>
                            </div>
                            <div className="inspector-export-options">
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
                            </div>
                            {csvExportCount === 0 ? (
                              <p className="export-zero-note">{t("noResponsesMatchCurrentFilters")}</p>
                            ) : null}
                            <p className="export-privacy-note">
                              {t("exportCsvPrivacyNote")}
                            </p>
                          </div>
                        </details>

                        <details className="inspector-panel">
                          <summary>
                            <span>
                              <p className="eyebrow">Verification</p>
                              <strong>Metadata / Seal</strong>
                            </span>
                            <span className="inspector-summary">{storageRuntime.mode === "walrus" ? t("storageWalrus") : t("localFallbackLabel")}</span>
                          </summary>
                          <div className="inspector-panel-body">
                            <div className="inspector-subsection">
                              <div className="section-row">
                                <div>
                                  <p className="eyebrow">Metadata</p>
                                  <h3>{t("signalMetadataAndProofTitle")}</h3>
                                </div>
                                {selectedRecord.submission.pendingOnchainRegistration ? (
                                  <button
                                    type="button"
                                    className="ghost-button"
                                    disabled={isRegisteringSignal(selectedRecord.submission.id)}
                                    onClick={() => void handleRegisterPendingSignals([selectedRecord.submission.id])}
                                  >
                                    {isRegisteringSignal(selectedRecord.submission.id) ? t("registeringStatus") : t("registerProofOnSui")}
                                  </button>
                                ) : null}
                              </div>
                              <div className="metadata-list">
                        <div className="metadata-row">
                          <span>{t("reviewStateLabel")}</span>
                            <strong>
                              {detailLegacyUnencrypted
                                ? t("legacyUnencryptedResponse")
                                : detailAnswers
                                  ? t("privateSignalUnlockedStatus")
                                  : t("encryptedPrivateSignalStatus")}
                            </strong>
                        </div>
                          <div className="metadata-row">
                            <span>{t("sealRuntimeLabel")}</span>
                            <strong>{hasAdminAccess ? t("projectReviewerAccess") : t("walletLabel")}</strong>
                          </div>
                          {hasAdminAccess ? (
                            <SignalMetaRow label="Project" type="registry" value={selectedRecord.form.projectId} emptyLabel={t("notAvailable")} />
                          ) : null}
                          {typeof selectedRecord.form.onchainFormId === "number" ? (
                            <div className="metadata-row">
                              <span>{t("registryFormIdLabel")}</span>
                              <strong>{selectedRecord.form.onchainFormId}</strong>
                            </div>
                          ) : null}
                          {typeof selectedRecord.submission.onchainSignalId === "number" ? (
                            <div className="metadata-row">
                              <span>{t("signalReceiptLabel")}</span>
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
                              <span>{t("encryptedPayloadLabel")}</span>
                              <strong>{getEncryptedPayloadAvailabilityLabel(selectedRecord.submission)}</strong>
                            </div>
                          ) : null}
                          <SignalMetaRow label={t("sealIdentityLabel")} type="seal" value={selectedRecord.submission.sealIdentity} emptyLabel={t("notAvailable")} />
                          {selectedRecord.submission.signalReceiptMetadataDigest ? (
                            <SignalMetaRow
                              label={t("receiptMetadataDigestLabel")}
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
                                      <strong>{t("embeddedInPrivateSignal")}</strong>
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
                            <span>{t("walletLabel")}</span>
                            <strong>
                              {getSubmissionRespondentMeta(selectedRecord.submission).isAnonymous
                                ? t("anonymousRespondent")
                                : getSubmissionRespondentMeta(selectedRecord.submission).walletAddress ?? t("notAvailable")}
                            </strong>
                          </div>
                          <div className="metadata-row">
                            <span>{t("anonymousLabel")}</span>
                            <strong>{getSubmissionRespondentMeta(selectedRecord.submission).isAnonymous ? t("yesLabel") : t("noLabel")}</strong>
                          </div>
                          <div className="metadata-row">
                            <span>{t("submittedLabel")}</span>
                            <strong>{formatDate(getSubmissionRespondentMeta(selectedRecord.submission).submittedAt)}</strong>
                          </div>
                          <div className="metadata-row">
                            <span>{t("chainLabel")}</span>
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
                            <span>{t("reviewerAccessLabel")}</span>
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
                            <span>{t("pendingSuiRegistrationLabel")}</span>
                            <strong>
                              {selectedRecord.submission.onchainStatus ??
                                (selectedRecord.submission.pendingOnchainRegistration
                                  ? t("pendingSuiRegistration")
                                  : t("offchainOnlyLabel"))}
                            </strong>
                          </div>
                              </div>
                            </div>
                            <div className="inspector-subsection inspector-seal-subsection">
                              <div>
                                <p className="eyebrow">{t("sealDetailsEyebrow")}</p>
                                <h3>{t("encryptedPayloadDetailsTitle")}</h3>
                              </div>
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
                            </div>
                            <div className="review-secondary-links inspector-related-links">
                              <Link
                                className="review-inline-link"
                                to={`/dashboard/forms/${selectedRecord.form.id}/submissions/${selectedRecord.submission.id}`}
                              >
                                Review thread
                              </Link>
                              {selectedRecord.submission.pendingOnchainRegistration ? (
                                <span className="muted">{t("suiRegistrationOptionalProof")}</span>
                              ) : null}
                            </div>
                          </div>
                        </details>

                        <details className="inspector-panel">
                          <summary>
                            <span>
                              <p className="eyebrow">{t("reviewSupportEyebrow")}</p>
                              <strong>AI Assist</strong>
                            </span>
                            <span className="inspector-summary">{t("aiSummaryTitle")}</span>
                          </summary>
                          <div className="inspector-panel-body">
                            <div className="inspector-subsection ai-summary-section">
                              <div>
                                <p className="eyebrow">{t("aiSummaryEyebrow")}</p>
                                <h3>{t("aiSummaryTitle")}</h3>
                              </div>
                              <p>{selectedRecord.submission.aiSummary || getSignalPreview(selectedRecord.submission)}</p>
                              <div className="signal-badge-row signal-badge-row-compact">
                                <span className="signal-chip">{t("aiConfidenceLabel", { value: inferredAiConfidence })}</span>
                                <span className="signal-chip">{selectedRecord.category}</span>
                                {selectedRecord.submission.keywords?.slice(0, 3).map((keyword) => (
                                  <span key={keyword} className="signal-chip">
                                    {keyword}
                                  </span>
                                ))}
                                {selectedRecord.submission.clusterId ? (
                                  <span className="signal-chip signal-chip-accent">
                                    {t("aiGroupedLabel")}
                                    {clusterCountById[selectedRecord.submission.clusterId]
                                      ? ` (${clusterCountById[selectedRecord.submission.clusterId]})`
                                      : ""}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <details className="inspector-nested-detail">
                              <summary>{t("similarSignalsTitle")}</summary>
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
                                onSaveSubmission={async (submission) => {
                                  await updateSubmission(submission);
                                }}
                              />
                            </details>
                          </div>
                        </details>
                      </div>

                      <div className="inspector-utility-links">
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
                    </section>
                  </div>
                </>
              )}
            </article>
          </div>
          </section>
          </>
        )}

        <AdminOperationsStatus
          items={operationsStatusItems}
          nextActionLabel={nextRecommendedAction.label}
          nextActionDetail={nextRecommendedAction.detail}
          nextActionCta={nextRecommendedAction.cta}
        />

        {hasAdminAccess ? (
        <details ref={advancedProjectSettingsRef} className="panel advanced-project-settings">
          <summary>
            <span>
              <strong>{t("advancedProjectSettingsTitle")}</strong>
              <span className="muted">{t("advancedProjectSettingsBody")}</span>
            </span>
          </summary>
          <div className="advanced-project-settings-body">
            <div className="project-registry-status">
              <span className="signal-chip">{selectedProject ? t("projectSelectedStatus") : t("noProjectSelectedStatus")}</span>
              <span className="signal-chip">{privateReviewLabel}</span>
            </div>

            <article className="project-registry-subpanel project-registry-subpanel-soft advanced-project-switcher">
              <div className="project-panel-head">
                <div>
                  <p className="eyebrow">{t("currentProjectEyebrow")}</p>
                  <h3>{t("createOrSwitchProjectTitle")}</h3>
                </div>
                <span className="signal-chip">{t("workspaceScopeLabel")}</span>
              </div>
              <p className="muted">{t("switchProjectBody")}</p>
              <label className="project-selector-inline" htmlFor="workspace-project-selector">
                <span className="eyebrow">{t("selectedProjectLabel")}</span>
                <select
                  id="workspace-project-selector"
                  className="project-selector-field"
                  value={selectedProjectId}
                  onChange={(event) => {
                    selectProject(event.target.value);
                  }}
                >
                  <option value="">{t("chooseProjectButton")}</option>
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
                    <span className="eyebrow">{t("createProjectEyebrow")}</span>
                    <p className="muted">{t("createProjectBody")}</p>
                  </div>
                  <div className="workspace-create-project-actions">
                    <input
                      ref={projectCreateInputRef}
                      value={projectCreateName}
                      onChange={(event) => setProjectCreateName(event.target.value)}
                      placeholder={t("newProjectNamePlaceholder")}
                    />
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => void handleCreateProject()}
                      disabled={isCreatingProject}
                    >
                      {isCreatingProject ? t("creatingLabel") : t("createProjectButton")}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>

            <div className="project-registry-grid project-registry-grid-advanced">
              <article className="project-registry-subpanel project-registry-subpanel-soft">
                <div className="project-panel-head">
                  <div>
                    <p className="eyebrow">{t("existingProjectEyebrow")}</p>
                    <h3>{t("connectExistingProjectTitle")}</h3>
                  </div>
                  <span className="signal-chip">{t("projectOwnerCapLabel")}</span>
                </div>
                <p className="muted">{t("attachWorkspaceBody")}</p>
                <div className="inline-actions">
                  <input
                    ref={manualProjectInputRef}
                    value={manualProjectId}
                    onChange={(event) => setManualProjectId(event.target.value)}
                    placeholder={t("projectOrOwnerCapPlaceholder")}
                  />
                  <button type="button" className="ghost-button" onClick={() => void connectManualProject()}>
                    {t("connectLabel")}
                  </button>
                </div>
              </article>

              {selectedProject ? (
                <article className="project-registry-subpanel project-registry-danger">
                  <div className="project-panel-head">
                    <div>
                      <p className="eyebrow">{t("dangerZoneEyebrow")}</p>
                      <h3>{t("deleteProjectTitle")}</h3>
                    </div>
                    <span className="signal-chip">{t("ownerOnlyLabel")}</span>
                  </div>
                  <p className="muted">{t("emptyProjectsDeleteOnly")}</p>
                  <div className="stack">
                    <div className="workspace-hero-meta">
                      <span className="workspace-meta-item">{t("onchainFormsCount", { count: selectedProject.formsCount })}</span>
                      <span className="workspace-meta-item">{t("onchainSignalsCount", { count: selectedProject.signalsCount })}</span>
                      <span className="workspace-meta-item">{t("localFormsCount", { count: localProjectFormsCount })}</span>
                    </div>
                    {deleteProjectBlockedReason ? (
                      <p className="warning-text">{deleteProjectBlockedReason} {t("localFormsDifferWarningSuffix")}</p>
                    ) : (
                      <p className="muted">{t("projectEmptyDeleteBody")}</p>
                    )}
                    {visibleOnchainForms.length > 0 ? (
                      <div className="stack onchain-form-list">
                        <p className="muted">{t("onchainFormRecords")}</p>
                        {visibleOnchainForms.map((form) => (
                          <div key={form.formId} className="metadata-row onchain-form-row">
                            <div>
                              <strong>{t("formNumberLabel", { id: form.formId })}</strong>
                              <p className="muted">{form.title || t("untitledForm")}</p>
                            </div>
                            <div className="inline-actions">
                              <span className={`signal-chip ${form.active ? "signal-chip-accent" : "signal-chip-soft"}`}>
                                {form.active ? t("activeLabel") : t("inactiveLabel")}
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
                                {deletingOnchainFormIds.includes(form.formId) ? t("deletingLabel") : t("deleteOnchainFormButton")}
                              </button>
                            </div>
                          </div>
                        ))}
                        {selectedProject.signalsCount > 0 ? (
                          <p className="muted">{t("deleteOnchainFormsNoSignalsOnly")}</p>
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
                      {deletingProject ? t("deletingLabel") : t("deleteProjectButton")}
                    </button>
                  </div>
                </article>
              ) : null}
            </div>

            {projectState ? <p className="muted">{projectState}</p> : null}
          </div>
        </details>
        ) : null}

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
                {deletableNodeIds.length > 0 ? (
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
                        {item.canDelete ? (
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
              manifestBlobId={selectedBeaconForm.manifestBlobId}
            />
          </section>
        </div>
      ) : null}
    </AdminAccessGate>
  );
}


