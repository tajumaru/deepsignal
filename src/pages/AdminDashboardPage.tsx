import {
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CreateFormLink } from "../components/CreateFormLink";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { AdminWorkspaceTabs } from "../components/AdminWorkspaceTabs";
import { MemberDirectorySection } from "../components/MemberDirectorySection";
import { EmptyState } from "../components/EmptyState";
import { FormattedAnswerValue } from "../components/FormattedAnswerValue";
import { PrivateSignalUnlockCard } from "../components/PrivateSignalUnlockCard";
import { RichTextContent } from "../components/RichText";
import { ShareCard } from "../components/ShareCard";
import { StorageProof } from "../components/StorageProof";
import { AdminToast } from "../features/admin/components/AdminToast";
import { CsvExportConfirmationModal } from "../features/admin/components/CsvExportConfirmationModal";
import { ProjectWorkspaceModal } from "../features/admin/components/ProjectWorkspaceModal";
import { ReviewResultCard } from "../features/admin/components/ReviewResultCard";
import { ReviewSessionModal } from "../features/admin/components/ReviewSessionModal";
import { SecondaryInspector } from "../features/admin/components/SecondaryInspector";
import { SignalAttachmentList } from "../features/admin/components/SignalAttachmentList";
import { SignalCard } from "../features/admin/components/SignalCard";
import { SignalTimelineSection } from "../features/admin/components/SignalTimelineSection";
import { MailboxIcon, SignalChannelSelector, SignalStreamsNav } from "../features/admin/components/SignalStreamsNav";
import { WorkspaceActivityLog } from "../features/admin/components/WorkspaceActivityLog";
import { WorkspaceInsights } from "../features/admin/components/WorkspaceInsights";
import { useAdminToast } from "../features/admin/hooks/useAdminToast";
import { usePendingSuiRegistration } from "../features/admin/hooks/usePendingSuiRegistration";
import { usePrivateSignalDecrypt } from "../features/admin/hooks/usePrivateSignalDecrypt";
import { useProjectWorkspace } from "../features/admin/hooks/useProjectWorkspace";
import {
  useReviewWorkspace,
  type ReviewSaveStatus,
} from "../features/admin/hooks/useReviewWorkspace";
import {
  useSignalInboxData,
  type FormWithCount,
  type SignalSortOrder,
  type SignalRecord,
  type SignalViewScope,
  type StreamId,
} from "../features/admin/hooks/useSignalInboxData";
import { useAttachmentPreviews } from "../hooks/useAttachmentPreviews";
import { useAccessControl } from "../hooks/useAccessControl";
import { useReviewerDisplayLabel } from "../hooks/useReviewerDisplayLabel";
import { useSuiWallet } from "../hooks/useSuiWallet";
import { useI18n } from "../i18n";
import { DEMO_FORM_ID, DEMO_PRIMARY_SIGNAL_ID, seedDemoWorkspace } from "../demo/demoData";
import { isAttachmentFieldType, isLongTextLikeField } from "../lib/fieldTypes";
import {
  addressesMatch,
  canAdmin,
  canAttemptPrivateSignalDecrypt,
  getRoleLabel,
} from "../lib/adminAccess";
import {
  appendActivityEvents,
  createActivityEvent,
  getActivityActorRole,
  listSuiActivityEvents,
  listActivityEvents,
  mergeActivityEvents,
} from "../lib/activityLog";
import { getTriageStatusLabel, TRIAGE_STATUS_OPTIONS } from "../lib/signalOps";
import { getRelatedSignals } from "../lib/relatedSignals";
import {
  getAssignedReviewer,
  getReviewerNoteUpdatedAt,
  getReviewerPresenceText,
  getVisibleReviewerNotes,
  hasNeedsFollowUp,
  NEEDS_FOLLOW_UP_TAG,
  setNeedsFollowUpTag,
} from "../lib/reviewCollaboration";
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
import { getPublicFormPath, getPublicRoadmapPath } from "../lib/publicLinks";
import {
  createFormOnChain,
  createMetadataDigest,
  deleteFormOnChain,
  getSelectedProjectId,
  serializeProjectFormMetadataReference,
  triageStatusToOnchainStatus,
  updateSignalStatusOnChain,
} from "../lib/projectRegistry";
import { isSuiRateLimitError } from "../lib/sui";
import { clearDeepSignalPolicyCapabilityCache } from "../lib/debugCache";
import { resetLocalEnvironment } from "../lib/resetEnvironment";
import { formatResponseDeadline, type ResponseDeadlineLabels } from "../lib/responseDeadline";
import { getSubmissionRespondentMeta } from "../lib/respondentMeta";
import {
  getSignalPreview,
  getPrivateSignalPayloadState,
  getSignalPersistenceLabel,
  getSignalPersistenceState,
  getSignalSubject,
  getSignalStorageState,
  hasPrivateSignalPayloadIssue,
  getStorageBadgeLabel,
  getWalletAccessLabel,
  getSignalStorageBlobId,
  isOnchainRecoveredSignal,
  isLocalFallbackBlob,
} from "../lib/signalInbox";
import {
  normalizeSubmission,
  storageAdapter,
} from "../lib/storage";
import { formatDate } from "../lib/utils";
import { handleRateLimitedRpcFallback, useRpcInfrastructure } from "../rpcInfrastructure";
import { cleanupRegisteredFormLocalFallback } from "../storage/localStorageAdapter";
import { listFormBlobIndex } from "../storage/blobIndex";
import { markDeletedFormTombstones } from "../storage/deletedFormTombstones";
import { forcePurgeFormArtifacts } from "../storage/forcePurgeFormArtifacts";
import { saveFormMetadataOverlay } from "../storage/formMetadataOverlay";
import { deleteFormsFromLocalCache, getStorageRuntimeStatus } from "../storage/storageFactory";
import type { ActivityEvent, FormSchema, Submission } from "../types";

const MOBILE_REVIEW_MEDIA_QUERY = "(max-width: 768px)";
const MODAL_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
const ROADMAP_READY_STATUSES = new Set<Submission["triageStatus"]>(["planned", "in_progress", "fixed"]);
const DEMO_FLOW_VISIBLE = false;
const PROJECT_RECOVERY_NOTICE_ACK_KEY = "deepsignal.admin.projectRecoveryNoticeAck";
const WORKSPACE_RECOVERY_TIMEOUT_MS = 4000;
type WorkspaceTab = "review" | "activity" | "insights" | "members";
type QuickActionId = "reviewing" | "resolve" | "publish" | "archive";
type KeyboardShortcutAction = QuickActionId | "next" | "previous" | "search" | "help";
type ProjectWorkspaceModalMode = "select" | "create" | "connect";

interface DetailWorkspaceSectionsState {
  originalSignalOpen: boolean;
  attachmentsOpen: boolean;
  reviewerNotesOpen: boolean;
  signalTimelineOpen: boolean;
  relatedSignalsOpen: boolean;
  storageProofOpen: boolean;
  advancedMetadataOpen: boolean;
  headerDetailsOpen: boolean;
}

interface SignalTimelineEntry {
  id: string;
  title: string;
  detail?: string;
  timestamp: string;
  phase: "intake" | "review" | "escalation" | "published" | "resolved";
  order: number;
}

interface SignalTimelineCurrentState {
  title: string;
  detail?: string;
  phase: SignalTimelineEntry["phase"];
}

function readProjectRecoveryNoticeAcks() {
  if (typeof window === "undefined") {
    return {} as Record<string, string>;
  }
  try {
    const raw = window.localStorage.getItem(PROJECT_RECOVERY_NOTICE_ACK_KEY);
    if (!raw) {
      return {} as Record<string, string>;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {} as Record<string, string>;
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch {
    return {} as Record<string, string>;
  }
}

function writeProjectRecoveryNoticeAcks(next: Record<string, string>) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(PROJECT_RECOVERY_NOTICE_ACK_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage write failures and continue with in-memory state.
  }
}

function buildProjectFormIdentityKey(form: Pick<FormSchema, "projectId" | "onchainFormId" | "manifestBlobId">) {
  if (form.projectId && typeof form.onchainFormId === "number") {
    return `onchain:${form.projectId}:${form.onchainFormId}`;
  }
  if (form.projectId && form.manifestBlobId && !isLocalFallbackBlob(form.manifestBlobId)) {
    return `manifest:${form.projectId}:${form.manifestBlobId}`;
  }
  return "";
}

function isFiniteFormId(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getSignalTimelinePhaseLabel(phase: SignalTimelineEntry["phase"], t: TranslationFn) {
  switch (phase) {
    case "review":
      return t("signalTimelinePhaseReview");
    case "escalation":
      return t("signalTimelinePhaseEscalation");
    case "published":
      return t("signalTimelinePhasePublished");
    case "resolved":
      return t("signalTimelinePhaseResolved");
    case "intake":
    default:
      return t("signalTimelinePhaseIntake");
  }
}

function areActivityEventListsEqual(current: ActivityEvent[], next: ActivityEvent[]) {
  if (current === next) {
    return true;
  }
  if (current.length !== next.length) {
    return false;
  }
  return current.every((event, index) => {
    const candidate = next[index];
    return (
      candidate?.id === event.id &&
      candidate?.createdAt === event.createdAt &&
      candidate?.action === event.action &&
      candidate?.txDigest === event.txDigest
    );
  });
}

function formatWorkspaceCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatAccessLabel(roleLabel: string) {
  return `${roleLabel} access`;
}

function isInteractiveKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable
  );
}

function getTriageStatusTranslationKey(triageStatus: Submission["triageStatus"]): Parameters<TranslationFn>[0] {
  switch (triageStatus) {
    case "investigating":
      return "triageStatusInvestigating";
    case "planned":
      return "triageStatusPlanned";
    case "in_progress":
      return "triageStatusInProgress";
    case "fixed":
      return "triageStatusFixed";
    case "closed":
      return "triageStatusClosed";
    case "new":
    default:
      return "triageStatusNew";
  }
}

function getLocalizedTriageStatusLabel(triageStatus: Submission["triageStatus"], t: TranslationFn) {
  return t(getTriageStatusTranslationKey(triageStatus));
}

function getLocalizedSubmissionStatusLabel(status: Submission["status"], t: TranslationFn) {
  switch (status) {
    case "read":
      return t("statusRead");
    case "archived":
      return t("statusArchived");
    case "unread":
    default:
      return t("statusUnread");
  }
}

function getLocalizedPriorityLabel(priority: Submission["priority"], t: TranslationFn) {
  switch (priority) {
    case "high":
      return t("priorityHigh");
    case "low":
      return t("priorityLow");
    case "medium":
    default:
      return t("priorityMedium");
  }
}

function getPublicDecisionLabel(submission: Submission, t: TranslationFn) {
  if (submission.status === "archived") {
    return t("statusArchived");
  }
  if (submission.triageStatus === "fixed" || submission.triageStatus === "closed") {
    return t("publicDecisionResolved");
  }
  if (ROADMAP_READY_STATUSES.has(submission.triageStatus)) {
    return t("publicDecisionPublished");
  }
  return t("publicDecisionInternalOnly");
}

function getSignalValueSummary(signalValue: Submission["signalValue"], t: TranslationFn) {
  return typeof signalValue === "number" ? `${signalValue}/5` : t("notScored");
}

function getSignalValueStars(signalValue: Submission["signalValue"]) {
  if (typeof signalValue !== "number" || signalValue < 1) {
    return null;
  }
  return Array.from({ length: 5 }, (_, index) => index < signalValue);
}

function getSubmissionMetadataString(submission: Submission, key: string) {
  if (!submission.metadata || typeof submission.metadata !== "object") {
    return undefined;
  }
  const value = (submission.metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function hasSavedReviewResult(submission: Submission) {
  const assignedReviewer = getAssignedReviewer(submission);
  const reviewerNotes = getVisibleReviewerNotes(submission).trim();
  const reviewerNoteUpdatedAt = getReviewerNoteUpdatedAt(submission);
  return (
    submission.status !== "unread" ||
    submission.triageStatus !== "new" ||
    submission.priority !== "medium" ||
    typeof submission.signalValue === "number" ||
    Boolean(assignedReviewer) ||
    Boolean(reviewerNotes) ||
    Boolean(reviewerNoteUpdatedAt) ||
    hasNeedsFollowUp(submission)
  );
}

function getSignalTimelinePriorityTitle(priority: Submission["priority"], t: TranslationFn) {
  const localizedPriority = getLocalizedPriorityLabel(priority, t);
  switch (priority) {
    case "high":
      return t("signalTimelinePriorityRaisedTitle", { priority: localizedPriority });
    case "low":
      return t("signalTimelinePriorityLoweredTitle", { priority: localizedPriority });
    case "medium":
    default:
      return t("signalTimelinePrioritySetTitle", { priority: localizedPriority });
  }
}

function buildSignalTimelineEntries(submission: Submission, t: TranslationFn) {
  const entries: SignalTimelineEntry[] = [];
  const createdAt = submission.createdAt;
  const updatedAt = submission.updatedAt || submission.createdAt;
  const proofTimestamp = updatedAt || createdAt;
  const noteUpdatedAt = getReviewerNoteUpdatedAt(submission);
  const assignedReviewer = getAssignedReviewer(submission);
  const reviewerNotes = getVisibleReviewerNotes(submission).trim();
  const followUpEnabled = hasNeedsFollowUp(submission);
  const isRoadmapVisible = ROADMAP_READY_STATUSES.has(submission.triageStatus);
  const isResolved = submission.status === "archived" || submission.triageStatus === "fixed" || submission.triageStatus === "closed";
  const proofBlobId = submission.encryptedBlobId ?? submission.receiptBlobId ?? submission.blobId;
  const txDigest = getSubmissionMetadataString(submission, "txDigest");
  let order = 0;

  const pushEntry = (entry: Omit<SignalTimelineEntry, "order">) => {
    entries.push({
      ...entry,
      order: order++,
    });
  };

  pushEntry({
    id: "received",
    title: t("signalTimelineReceivedTitle"),
    detail: t("signalTimelineReceivedDetail"),
    timestamp: createdAt,
    phase: "intake",
  });

  if (submission.isEncrypted && submission.encryptedBlobId) {
    pushEntry({
      id: "encrypted-payload-stored",
      title: t("signalTimelineEncryptedPayloadStoredTitle"),
      detail: t("signalTimelineEncryptedPayloadStoredDetail"),
      timestamp: proofTimestamp,
      phase: "intake",
    });
  }

  if (proofBlobId && !isLocalFallbackBlob(proofBlobId)) {
    pushEntry({
      id: "walrus-proof-stored",
      title: t("signalTimelineWalrusProofStoredTitle"),
      detail: t("signalTimelineWalrusProofStoredDetail"),
      timestamp: proofTimestamp,
      phase: "published",
    });
  }

  if (typeof submission.onchainSignalId === "number") {
    pushEntry({
      id: "sui-proof-registered",
      title: t("signalTimelineSuiProofRegisteredTitle"),
      detail: txDigest ? `${t("txDigestLabel")}: ${txDigest}` : t("registeredOnSuiLabel"),
      timestamp: proofTimestamp,
      phase: "published",
    });
  }

  if (
    submission.status !== "unread" ||
    submission.triageStatus === "investigating" ||
    submission.triageStatus === "in_progress" ||
    Boolean(assignedReviewer)
  ) {
    pushEntry({
      id: "reviewing",
      title: t("signalTimelineReviewingTitle"),
      detail: `${t("reviewStateLabel")}: ${getLocalizedSubmissionStatusLabel(submission.status, t)}`,
      timestamp: updatedAt,
      phase: "review",
    });
  }

  if (assignedReviewer) {
    pushEntry({
      id: "assigned-reviewer",
      title: t("signalTimelineAssignedReviewerTitle", { reviewer: assignedReviewer }),
      detail: assignedReviewer,
      timestamp: updatedAt,
      phase: "review",
    });
  }

  if (followUpEnabled) {
    pushEntry({
      id: "follow-up-enabled",
      title: t("signalTimelineFollowUpEnabledTitle"),
      detail: t("followUpEnabledLabel"),
      timestamp: updatedAt,
      phase: "escalation",
    });
  }

  if (reviewerNotes || noteUpdatedAt) {
    pushEntry({
      id: "reviewer-notes",
      title: t("signalTimelineReviewerNotesUpdatedTitle"),
      detail: reviewerNotes ? t("signalTimelineInternalNotesSavedDetail") : t("reviewerNoteLabel"),
      timestamp: noteUpdatedAt ?? updatedAt,
      phase: "review",
    });
  }

  if (submission.priority !== "medium" || updatedAt !== createdAt) {
    pushEntry({
      id: "priority",
      title: getSignalTimelinePriorityTitle(submission.priority, t),
      detail: `${t("priority")}: ${getLocalizedPriorityLabel(submission.priority, t)}`,
      timestamp: updatedAt,
      phase: submission.priority === "high" ? "escalation" : "review",
    });
  }

  if (isRoadmapVisible) {
    pushEntry({
      id: "roadmap",
      title: t("signalTimelinePublishedToRoadmapTitle"),
      detail: `${t("roadmapStatusLabel")}: ${getLocalizedTriageStatusLabel(submission.triageStatus, t)}`,
      timestamp: updatedAt,
      phase: "published",
    });
  }

  if (isResolved) {
    pushEntry({
      id: "resolved",
      title:
        submission.status === "archived"
          ? t("signalTimelineArchivedTitle")
          : t("signalTimelineResolvedTitle"),
      detail:
        submission.status === "archived"
          ? t("statusArchived")
          : getLocalizedTriageStatusLabel(submission.triageStatus, t),
      timestamp: updatedAt,
      phase: "resolved",
    });
  }

  return entries.sort((left, right) => {
    const timeDelta = Date.parse(left.timestamp) - Date.parse(right.timestamp);
    return timeDelta !== 0 ? timeDelta : left.order - right.order;
  });
}

function getSignalTimelineCurrentState(submission: Submission, entries: SignalTimelineEntry[], t: TranslationFn): SignalTimelineCurrentState {
  const latestEntry = entries[entries.length - 1];
  if (latestEntry) {
    return {
      title: latestEntry.title,
      detail: latestEntry.detail,
      phase: latestEntry.phase,
    };
  }

  return {
    title: submission.status === "unread" ? t("signalTimelineCurrentNew") : getLocalizedSubmissionStatusLabel(submission.status, t),
    detail: `${t("reviewStateLabel")}: ${getLocalizedSubmissionStatusLabel(submission.status, t)}`,
    phase: "intake",
  };
}

type TranslationFn = ReturnType<typeof useI18n>["t"];

interface MobileInboxHeaderProps {
  t: TranslationFn;
  title: string;
  sessionLabel: string;
  activeScopeLabel: string;
  viewScope: SignalViewScope;
  onViewScopeChange: (scope: SignalViewScope) => void;
  canUseProjectScope: boolean;
  allSignalsScopeLabel: string;
  projectSignalsScopeLabel: string;
  visibleCountLabel: string;
  unreadCountLabel: string;
  search: string;
  onSearchChange: (value: string) => void;
  streamItems: Array<{ id: StreamId; label: string; count: number }>;
  selectedStreamId: StreamId;
  onSelectStream: (streamId: StreamId) => void;
  sortOrder: SignalSortOrder;
  onSortOrderChange: (value: SignalSortOrder) => void;
  searchPlaceholder: string;
  filterLabel: string;
  queueLabel: string;
  accessibleForms: FormWithCount[];
  selectedFormId: string;
  onSelectForm: (formId: string) => void;
  unreadCountByFormId: Record<string, number>;
  allSignalsCount: number;
  totalUnreadCount: number;
  allSignalNodesLabel: string;
  responseDeadlineLabels: ResponseDeadlineLabels;
  openNodeDirectoryLabel: string;
  onOpenNodeDirectory: () => void;
  activeNodeSummary: string;
  onExportAllFormCsv: (formId: string) => void;
  hasAdminAccess: boolean;
  selectedProjectName: string | null;
  highlightCreateFormCta: boolean;
  onOpenProjectSettings: () => void;
  onJumpToReview: () => void;
  onRevealCreateProject: () => void;
  onRevealConnectProject: () => void;
}

function MobileFilterCaret() {
  return (
    <span className="mobile-inbox-filter-caret" aria-hidden="true">
      <svg viewBox="0 0 12 12" focusable="false">
        <path d="m2.2 4.5 3.8 3.6 3.8-3.6" />
      </svg>
    </span>
  );
}

interface MobileFilterMenuOption {
  value: string;
  label: string;
  meta?: string;
}

interface MobileFilterMenuProps {
  srLabel: string;
  buttonLabel: string;
  selectedValue: string;
  options: MobileFilterMenuOption[];
  onSelect: (value: string) => void;
  className?: string;
}

function MobileFilterMenu({
  srLabel,
  buttonLabel,
  selectedValue,
  options,
  onSelect,
  className = "",
}: MobileFilterMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  const selectedOption = options.find((option) => option.value === selectedValue) ?? options[0];

  return (
    <div ref={shellRef} className={`mobile-inbox-filter-menu ${menuOpen ? "is-open" : ""} ${className}`.trim()}>
      <span className="sr-only">{srLabel}</span>
      <button
        type="button"
        className={`mobile-inbox-filter-trigger ${menuOpen ? "is-open" : ""}`}
        onClick={() => setMenuOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={buttonLabel}
      >
        <span className="mobile-inbox-filter-trigger-copy">
          <span>{selectedOption?.label ?? buttonLabel}</span>
          {selectedOption?.meta ? <strong>{selectedOption.meta}</strong> : null}
        </span>
        <MobileFilterCaret />
      </button>
      {menuOpen ? (
        <div className="mobile-inbox-filter-panel panel" role="menu" aria-label={buttonLabel}>
          {options.map((option) => {
            const active = option.value === selectedValue;
            return (
              <button
                key={option.value}
                type="button"
                className={`mobile-inbox-filter-option ${active ? "is-active" : ""}`}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onSelect(option.value);
                  setMenuOpen(false);
                }}
              >
                <span className="mobile-inbox-filter-option-copy">
                  <strong>{option.label}</strong>
                  {option.meta ? <small>{option.meta}</small> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MobileInboxHeader(props: MobileInboxHeaderProps) {
  const {
    t,
    title,
    sessionLabel,
    activeScopeLabel,
    viewScope,
    onViewScopeChange,
    canUseProjectScope,
    allSignalsScopeLabel,
    projectSignalsScopeLabel,
    unreadCountLabel,
    search,
    onSearchChange,
    streamItems,
    selectedStreamId,
    onSelectStream,
    sortOrder,
    onSortOrderChange,
    searchPlaceholder,
    filterLabel,
    accessibleForms,
    selectedFormId,
    onSelectForm,
    unreadCountByFormId,
    allSignalsCount,
    totalUnreadCount,
    allSignalNodesLabel,
    responseDeadlineLabels,
    openNodeDirectoryLabel,
    onOpenNodeDirectory,
    activeNodeSummary,
    onExportAllFormCsv,
  } = props;
  const streamOptions: MobileFilterMenuOption[] = streamItems.map((stream) => ({
    value: stream.id,
    label: stream.label,
    meta: String(stream.count),
  }));
  const sortOptions: MobileFilterMenuOption[] = [
    { value: "default", label: getSortLabel("default", t) },
    { value: "newest", label: getSortLabel("newest", t) },
    { value: "oldest", label: getSortLabel("oldest", t) },
    { value: "priority", label: getSortLabel("priority", t) },
    { value: "unread", label: getSortLabel("unread", t) },
  ];
  const scopeActionLabel =
    viewScope === "project" ? allSignalsScopeLabel : projectSignalsScopeLabel;

  return (
    <header className="mobile-inbox-header">
      <div className="mobile-inbox-header-bar">
        <div className="mobile-inbox-title-group">
          <MailboxIcon hasUnread={totalUnreadCount > 0} />
          <div className="mobile-inbox-title">
            <strong>{title}</strong>
            <span className="mobile-inbox-session-status">{sessionLabel}</span>
            <span>{activeScopeLabel}</span>
          </div>
        </div>
        <span className="mobile-inbox-count-pill">{unreadCountLabel}</span>
      </div>

      <div className="mobile-inbox-channel-row">
        <SignalChannelSelector
          className="signal-channel-selector-mobile"
          accessibleForms={accessibleForms}
          selectedFormId={selectedFormId}
          onSelectForm={onSelectForm}
          unreadCountByFormId={unreadCountByFormId}
          allSignalsCount={allSignalsCount}
          totalUnreadCount={totalUnreadCount}
          activeScopeLabel={activeScopeLabel}
          allSignalNodesLabel={allSignalNodesLabel}
          responseDeadlineLabels={responseDeadlineLabels}
          openNodeDirectoryLabel={openNodeDirectoryLabel}
          onOpenNodeDirectory={onOpenNodeDirectory}
          activeNodeSummary={activeNodeSummary}
          onExportAllFormCsv={onExportAllFormCsv}
        />
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
        <MobileFilterMenu
          srLabel={filterLabel}
          buttonLabel={filterLabel}
          selectedValue={selectedStreamId}
          options={streamOptions}
          onSelect={(value) => onSelectStream(value as StreamId)}
        />
        <MobileFilterMenu
          srLabel={t("sortInboxSrOnly")}
          buttonLabel={t("sortInboxSrOnly")}
          selectedValue={sortOrder}
          options={sortOptions}
          onSelect={(value) => onSortOrderChange(value as SignalSortOrder)}
          className="mobile-inbox-sort"
        />
      </div>

      {canUseProjectScope ? (
        <div className="mobile-inbox-summary-row">
          <button
            type="button"
            className="ghost-button mobile-inbox-scope-action"
            onClick={() => onViewScopeChange(viewScope === "project" ? "all" : "project")}
          >
            {scopeActionLabel}
          </button>
        </div>
      ) : null}
    </header>
  );
}

interface WorkspaceShortcutBarProps {
  hasAdminAccess: boolean;
  selectedProjectName: string | null;
  selectedProjectId: string;
  projects: Array<{ objectId: string; name: string }>;
  highlightCreateFormCta: boolean;
  onSelectProject: (projectId: string) => void;
  onRevealCreateProject: () => void;
  onRevealConnectProject: () => void;
  className?: string;
}

function WorkspaceShortcutBar({
  hasAdminAccess,
  selectedProjectName,
  selectedProjectId,
  projects,
  highlightCreateFormCta,
  onSelectProject,
  onRevealCreateProject,
  onRevealConnectProject,
  className = "",
}: WorkspaceShortcutBarProps) {
  const { t } = useI18n();
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!projectMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!projectMenuRef.current?.contains(event.target as Node)) {
        setProjectMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProjectMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [projectMenuOpen]);

  return (
    <div className={`workspace-shortcut-bar ${className}`.trim()}>
      <CreateFormLink className={`primary-button ${highlightCreateFormCta ? "create-form-cta-highlight" : ""}`}>
        {t("composeSignalCta")}
      </CreateFormLink>
      {hasAdminAccess ? (
        <>
          <button type="button" className="ghost-button" onClick={onRevealCreateProject}>
            {t("createProjectButton")}
          </button>
          {!selectedProjectName ? (
            <button type="button" className="ghost-button" onClick={onRevealConnectProject}>
              {t("connectExistingShort")}
            </button>
          ) : null}
        </>
      ) : null}
      {hasAdminAccess ? (
        <div ref={projectMenuRef} className={`workspace-project-menu-shell ${projectMenuOpen ? "is-open" : ""}`}>
          <button
            type="button"
            className={`ghost-button workspace-project-menu-trigger ${projectMenuOpen ? "is-open" : ""}`}
            onClick={() => setProjectMenuOpen((current) => !current)}
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
            aria-label={t("selectedProjectLabel")}
          >
            <span>{selectedProjectName ?? t("chooseProjectButton")}</span>
            <MobileFilterCaret />
          </button>
          {projectMenuOpen ? (
            <div className="workspace-project-menu panel" role="menu" aria-label={t("selectedProjectLabel")}>
              {projects.length > 0 ? (
                projects.map((project) => {
                  const active = project.objectId === selectedProjectId;
                  return (
                    <button
                      key={project.objectId}
                      type="button"
                      className={`workspace-project-menu-option ${active ? "is-active" : ""}`}
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        onSelectProject(project.objectId);
                        setProjectMenuOpen(false);
                      }}
                    >
                      <span>{project.name}</span>
                    </button>
                  );
                })
              ) : (
                <button
                  type="button"
                  className="workspace-project-menu-option"
                  role="menuitem"
                  onClick={() => {
                    onRevealConnectProject();
                    setProjectMenuOpen(false);
                  }}
                >
                  <span>{t("connectExistingShort")}</span>
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type InboxOnboardingState = "create-project" | "create-signal" | "ready";

function SignalInboxOnboardingHero({
  state,
  projectName,
  projects,
  selectedProjectId,
  selectProject,
  onRevealCreateProject,
  onRevealConnectProject: _onRevealConnectProject,
  highlightCreateFormCta,
}: {
  state: InboxOnboardingState;
  projectName: string | null;
  projects: Array<{ objectId: string; name: string }>;
  selectedProjectId: string;
  selectProject: (projectId: string) => void;
  onRevealCreateProject: () => void;
  onRevealConnectProject: () => void;
  highlightCreateFormCta: boolean;
}) {
  const { t } = useI18n();
  void _onRevealConnectProject;
  const isCreateProjectState = state === "create-project";
  const onboardingProjectId = selectedProjectId || projects[0]?.objectId || "";

  return (
    <section className="panel glow-panel workspace-hero workspace-hero-compact desktop-signal-inbox-hero signal-inbox-onboarding-hero">
      <div className="workspace-hero-main workspace-overview-shell signal-inbox-onboarding-layout">
        <div className="workspace-hero-copy signal-inbox-onboarding-copy">
          <p className="eyebrow">{t("encryptedSignalInboxLabel")}</p>
          <h1>
            {isCreateProjectState ? t("signalInboxOnboardingCreateProjectTitle") : t("signalInboxOnboardingCreateSignalTitle")}
          </h1>
          <p className="lede">
            {isCreateProjectState ? t("signalInboxOnboardingCreateProjectBody") : t("signalInboxOnboardingCreateSignalBody")}
          </p>
          {!isCreateProjectState && projectName ? (
            <div className="signal-inbox-onboarding-meta">
              <span className="workspace-meta-item">{projectName}</span>
            </div>
          ) : null}
        </div>

        <aside className="workspace-action-dock signal-inbox-onboarding-actions">
          {isCreateProjectState ? (
            <div className="signal-inbox-onboarding-action-group">
              <div className="signal-inbox-onboarding-action-copy">
                <p className="eyebrow">{t("nextStepLabel")}</p>
                <p className="signal-inbox-onboarding-next-step">{t("signalInboxOnboardingCreateProjectHint")}</p>
              </div>
              <button type="button" className="primary-button" onClick={onRevealCreateProject}>
                {t("createProjectButton")}
              </button>
              <CreateFormLink className="signal-inbox-onboarding-secondary-action">
                {t("signalInboxOnboardingCreateSignalWithoutProject")}
              </CreateFormLink>
            </div>
          ) : (
            <>
              <CreateFormLink className={`primary-button ${highlightCreateFormCta ? "create-form-cta-highlight" : ""}`}>
                {t("composeSignalCta")}
              </CreateFormLink>
              <div className="signal-inbox-onboarding-project-picker">
                <span className="signal-inbox-onboarding-project-label">{t("selectedProjectLabel")}</span>
                <div className="workspace-shortcut-bar signal-inbox-onboarding-project-bar">
                  <div className="workspace-project-menu-shell signal-inbox-onboarding-project-shell">
                    <select
                      className="signal-inbox-onboarding-project-select"
                      value={onboardingProjectId}
                      onChange={(event) => selectProject(event.target.value)}
                      aria-label={t("selectedProjectLabel")}
                    >
                      {projects.map((project) => (
                        <option key={project.objectId} value={project.objectId}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="button" className="ghost-button" onClick={onRevealCreateProject}>
                    {t("createProjectButton")}
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

interface MobileSignalRowProps {
  record: SignalRecord;
  isSelected: boolean;
  isUnlocked: boolean;
  onSelect: () => void;
  onQuickAction: (record: SignalRecord, action: QuickActionId) => void;
  t: TranslationFn;
}

function getSignalInitials(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const [first, second] = words;
  return `${first?.[0] ?? "S"}${second?.[0] ?? ""}`.toUpperCase();
}

function buildQuickActionSubmission(submission: Submission, action: QuickActionId): Submission {
  switch (action) {
    case "reviewing":
      return { ...submission, status: "read", triageStatus: "investigating" };
    case "resolve":
      return { ...submission, status: "read", triageStatus: "fixed" };
    case "publish":
      return { ...submission, status: "read", triageStatus: "planned" };
    case "archive":
      return { ...submission, status: "archived", triageStatus: "closed" };
    default:
      return submission;
  }
}

function getSortLabel(sortOrder: SignalSortOrder, t: TranslationFn) {
  switch (sortOrder) {
    case "newest":
      return t("sortOrderNewestFirst");
    case "oldest":
      return t("sortOrderOldestFirst");
    case "priority":
      return t("sortOrderPriorityFirst");
    case "unread":
      return t("sortOrderUnreadFirst");
    default:
      return t("sortOrderDefault");
  }
}

function WorkspaceSectionToggle({
  eyebrow,
  title,
  detail,
  open,
  onToggle,
  trailing,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  open: boolean;
  onToggle: () => void;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`workspace-section-toggle ${open ? "is-open" : ""}`}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className="workspace-section-toggle-copy">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <strong>{title}</strong>
        {detail ? <span className="muted">{detail}</span> : null}
      </span>
      <span className="workspace-section-toggle-side">
        {trailing}
        <span className="workspace-section-toggle-icon" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </span>
    </button>
  );
}

function NodeDirectoryActionIcon({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="node-directory-action-icon"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function OpenBeaconActionIcon() {
  return (
    <NodeDirectoryActionIcon>
      <path d="M12 4.75v14.5" />
      <path d="M7.25 9.5 12 4.75 16.75 9.5" />
      <path d="M6 14.25a6 6 0 0 0 12 0" />
      <path d="M8.15 14.25a3.85 3.85 0 0 0 7.7 0" />
    </NodeDirectoryActionIcon>
  );
}

function RegisterNodeActionIcon() {
  return (
    <NodeDirectoryActionIcon>
      <path d="m12 4.75 6.25 3.5v7L12 19.25l-6.25-4v-7Z" />
      <path d="m12 4.75 6.25 3.5L12 11.75l-6.25-3.5" />
      <path d="M12 11.75v7.5" />
      <path d="M18.3 5.65h2.2" />
      <path d="M19.4 4.55v2.2" />
    </NodeDirectoryActionIcon>
  );
}

function DeleteNodeActionIcon() {
  return (
    <NodeDirectoryActionIcon>
      <path d="M8.25 7.25h7.5" />
      <path d="M9.25 7.25v-1.1A1.4 1.4 0 0 1 10.65 4.75h2.7a1.4 1.4 0 0 1 1.4 1.4v1.1" />
      <path d="M6.75 7.25h10.5" />
      <path d="m8.2 7.25.8 10a1.4 1.4 0 0 0 1.4 1.3h3.2a1.4 1.4 0 0 0 1.4-1.3l.8-10" />
      <path d="M10.4 10.3v4.9" />
      <path d="M13.6 10.3v4.9" />
    </NodeDirectoryActionIcon>
  );
}

function MobileSignalRow({
  record,
  isSelected,
  isUnlocked,
  onSelect,
  t,
}: MobileSignalRowProps) {
  const { submission } = record;
  const title = getSignalSubject(submission);
  const persistenceState = getSignalPersistenceState(submission);
  const priorityLabel =
    submission.priority === "high"
      ? t("priorityHigh")
      : submission.priority === "medium"
        ? t("priorityMedium")
        : t("priorityLow");
  const lockStateLabel = submission.isEncrypted
    ? isUnlocked
      ? t("unlockedSignalState")
      : t("lockedSignalState")
    : t("openSignalState");
  const preview = submission.isEncrypted ? t("encryptedPrivateSignalUnlockHint") : getSignalPreview(submission);
  const sourceLabel = getSubmissionRespondentMeta(submission).isAnonymous ? t("anonymousRespondent") : record.form.title;
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
    <article
      className={`mobile-signal-row ${isSelected ? "is-active" : ""} ${submission.status === "unread" ? "is-unread" : "is-read"}`}
    >
      <button
        type="button"
        className="mobile-signal-row-main"
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
            {submission.status === "unread" ? <span className="mobile-unread-dot" aria-hidden="true" /> : null}
            <strong>{title}</strong>
          </span>
          <span className={`mobile-signal-preview ${submission.isEncrypted ? "is-locked" : ""}`}>{preview}</span>
          <span className="mobile-signal-source-line">
            <span>{priorityLabel}</span>
            <span>{getTriageStatusLabel(submission.triageStatus)}</span>
            <span>{sourceLabel}</span>
          </span>
          {submission.isEncrypted || submission.status === "archived" || persistenceState !== "walrus_synced" ? (
            <span className="mobile-signal-meta-row">
              {submission.isEncrypted ? (
                <span className={`mobile-signal-mini-badge ${isUnlocked ? "is-selected" : ""}`}>
                  {lockStateLabel}
                </span>
              ) : null}
              {submission.status === "archived" ? (
                <span className="mobile-signal-mini-badge">{readStateLabel}</span>
              ) : null}
            </span>
          ) : null}
        </span>
      </button>

      <span className="mobile-signal-side">
        <time>{formatDate(submission.createdAt)}</time>
        <span className={`mobile-priority-badge priority-${submission.priority}`}>{priorityLabel}</span>
      </span>
    </article>
  );
}

function MobileComposeSignalButton() {
  const { t } = useI18n();
  return (
    <CreateFormLink className="mobile-compose-signal-button">
      <span aria-hidden="true">+</span>
      <span>{t("composeSignalCta")}</span>
    </CreateFormLink>
  );
}

interface MobileSignalInboxProps {
  title: string;
  sessionLabel: string;
  activeScopeLabel: string;
  viewScope: SignalViewScope;
  onViewScopeChange: (scope: SignalViewScope) => void;
  canUseProjectScope: boolean;
  allSignalsScopeLabel: string;
  projectSignalsScopeLabel: string;
  visibleCountLabel: string;
  unreadCountLabel: string;
  emptyContent: ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
  streamItems: Array<{ id: StreamId; label: string; count: number }>;
  selectedStreamId: StreamId;
  onSelectStream: (streamId: StreamId) => void;
  sortOrder: SignalSortOrder;
  onSortOrderChange: (value: SignalSortOrder) => void;
  visibleSignals: SignalRecord[];
  selectedRecord: SignalRecord | null;
  unlockedSignalId?: string | null;
  onSelectSignal: (record: SignalRecord) => void;
  onQuickAction: (record: SignalRecord, action: QuickActionId) => void;
  searchPlaceholder: string;
  accessibleForms: FormWithCount[];
  selectedFormId: string;
  onSelectForm: (formId: string) => void;
  unreadCountByFormId: Record<string, number>;
  allSignalsCount: number;
  totalUnreadCount: number;
  allSignalNodesLabel: string;
  responseDeadlineLabels: ResponseDeadlineLabels;
  openNodeDirectoryLabel: string;
  onOpenNodeDirectory: () => void;
  activeNodeSummary: string;
  onExportAllFormCsv: (formId: string) => void;
  t: TranslationFn;
  hasAdminAccess: boolean;
  selectedProjectName: string | null;
  highlightCreateFormCta: boolean;
  onOpenProjectSettings: () => void;
  onJumpToReview: () => void;
  onRevealCreateProject: () => void;
  onRevealConnectProject: () => void;
}

function MobileSignalInbox({
  title,
  sessionLabel,
  activeScopeLabel,
  viewScope,
  onViewScopeChange,
  canUseProjectScope,
  allSignalsScopeLabel,
  projectSignalsScopeLabel,
  visibleCountLabel,
  unreadCountLabel,
  emptyContent,
  search,
  onSearchChange,
  streamItems,
  selectedStreamId,
  onSelectStream,
  sortOrder,
  onSortOrderChange,
  visibleSignals,
  selectedRecord,
  unlockedSignalId,
  onSelectSignal,
  onQuickAction,
  searchPlaceholder,
  accessibleForms,
  selectedFormId,
  onSelectForm,
  unreadCountByFormId,
  allSignalsCount,
  totalUnreadCount,
  allSignalNodesLabel,
  responseDeadlineLabels,
  openNodeDirectoryLabel,
  onOpenNodeDirectory,
  activeNodeSummary,
  onExportAllFormCsv,
  t,
  hasAdminAccess,
  selectedProjectName,
  highlightCreateFormCta,
  onOpenProjectSettings,
  onJumpToReview,
  onRevealCreateProject,
  onRevealConnectProject,
}: MobileSignalInboxProps) {
  return (
    <section className={`mobile-signal-inbox ${selectedRecord ? "is-detail-open" : ""}`} aria-label={title}>
      <MobileInboxHeader
        t={t}
        title={title}
        sessionLabel={sessionLabel}
        activeScopeLabel={activeScopeLabel}
        viewScope={viewScope}
        onViewScopeChange={onViewScopeChange}
        canUseProjectScope={canUseProjectScope}
        allSignalsScopeLabel={allSignalsScopeLabel}
        projectSignalsScopeLabel={projectSignalsScopeLabel}
        visibleCountLabel={visibleCountLabel}
        unreadCountLabel={unreadCountLabel}
        search={search}
        onSearchChange={onSearchChange}
        streamItems={streamItems}
        selectedStreamId={selectedStreamId}
        onSelectStream={onSelectStream}
        sortOrder={sortOrder}
        onSortOrderChange={onSortOrderChange}
        searchPlaceholder={searchPlaceholder}
        filterLabel={t("filterInboxLabel")}
        queueLabel={t("encryptedQueueLabel")}
        accessibleForms={accessibleForms}
        selectedFormId={selectedFormId}
        onSelectForm={onSelectForm}
        unreadCountByFormId={unreadCountByFormId}
        allSignalsCount={allSignalsCount}
        totalUnreadCount={totalUnreadCount}
        allSignalNodesLabel={allSignalNodesLabel}
        responseDeadlineLabels={responseDeadlineLabels}
        openNodeDirectoryLabel={openNodeDirectoryLabel}
        onOpenNodeDirectory={onOpenNodeDirectory}
        activeNodeSummary={activeNodeSummary}
        onExportAllFormCsv={onExportAllFormCsv}
        hasAdminAccess={hasAdminAccess}
        selectedProjectName={selectedProjectName}
        highlightCreateFormCta={highlightCreateFormCta}
        onOpenProjectSettings={onOpenProjectSettings}
        onJumpToReview={onJumpToReview}
        onRevealCreateProject={onRevealCreateProject}
        onRevealConnectProject={onRevealConnectProject}
      />

      <div className="mobile-signal-list" aria-live="polite">
        {visibleSignals.length === 0
          ? emptyContent
          : visibleSignals.map((record) => (
              <MobileSignalRow
                key={record.submission.id}
                record={record}
                isSelected={selectedRecord?.submission.id === record.submission.id}
                isUnlocked={unlockedSignalId === record.submission.id}
                onSelect={() => onSelectSignal(record)}
                onQuickAction={onQuickAction}
                t={t}
              />
            ))}
      </div>

      <MobileComposeSignalButton />
    </section>
  );
}

function InboxLoadingPanel({ title, body }: { title: string; body: string }) {
  return (
    <section className="panel inbox-loading-panel" role="status" aria-live="polite">
      <div className="inbox-loading-copy">
        <p className="eyebrow">Encrypted Signal Inbox</p>
        <h1>{title}</h1>
        <p className="muted">{body}</p>
      </div>
      <div className="inbox-loading-steps" aria-hidden="true">
        <span className="is-active" />
        <span className="is-active" />
        <span />
      </div>
      <div className="inbox-loading-skeleton">
        <span className="inbox-loading-card is-wide" />
        <span className="inbox-loading-card" />
        <span className="inbox-loading-card" />
      </div>
    </section>
  );
}

function InboxRecoveryPanel({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry: () => void;
}) {
  const [resettingState, setResettingState] = useState(false);

  async function handleResetLocalState() {
    setResettingState(true);
    try {
      await resetLocalEnvironment();
    } finally {
      window.location.assign("/");
    }
  }

  return (
    <section className="panel inbox-loading-panel" role="alert" aria-live="assertive">
      <div className="inbox-loading-copy">
        <p className="eyebrow">Encrypted Signal Inbox</p>
        <h1>{title}</h1>
        <p className="muted">{body}</p>
        <p className="muted">
          Local fallback data, registry restore, or a partial publish state may be blocking recovery. You can retry or
          reset browser-local DeepSignal state without deleting on-chain records.
        </p>
      </div>
      <div className="inline-actions">
        <button type="button" className="primary-button" onClick={onRetry}>
          Retry workspace
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => void handleResetLocalState()}
          disabled={resettingState}
        >
          {resettingState ? "Resetting local state..." : "Reset local state"}
        </button>
        <Link className="ghost-button" to="/">
          Open home
        </Link>
      </div>
    </section>
  );
}

export function AdminDashboardPage() {
  const { language, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const wallet = useSuiWallet();
  const suiClient = useSuiClient();
  const rpc = useRpcInfrastructure();
  const updateSignalStatusTx = useSignAndExecuteTransaction();
  const registerFormTx = useSignAndExecuteTransaction();
  const deleteNodeOnchainTx = useSignAndExecuteTransaction();
  const [loadingRecoveryVisible, setLoadingRecoveryVisible] = useState(false);
  const {
    capabilityProfile,
    isPending: isLoadingCapabilities,
    isLoadingAccess,
    ownedObjects,
    refetch: refetchAccessControl,
  } = useAccessControl(wallet.accountAddress);
  const storageRuntime = getStorageRuntimeStatus();
  const responseDeadlineLabels: ResponseDeadlineLabels = {
    noLimit: t("responseDeadlineNone"),
    closed: t("responseDeadlineClosed"),
    hoursLeft: (hours) => t("responseDeadlineHoursLeft", { count: hours }),
    daysLeft: (days) => t("responseDeadlineDaysLeft", { count: days }),
  };
  const [saving, setSaving] = useState(false);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [registeringFormId, setRegisteringFormId] = useState<string | null>(null);
  const [nodeRegistrationFeedback, setNodeRegistrationFeedback] = useState<{
    formId: string;
    tone: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [deletingVisibleNodes, setDeletingVisibleNodes] = useState(false);
  const [nodeDirectoryOpen, setNodeDirectoryOpen] = useState(false);
  const [beaconFormId, setBeaconFormId] = useState<string | null>(null);
  const [projectRecoveryNoticeOpen, setProjectRecoveryNoticeOpen] = useState(false);
  const [projectRecoveryNoticeAcks, setProjectRecoveryNoticeAcks] = useState<Record<string, string>>(
    () => readProjectRecoveryNoticeAcks(),
  );
  const [nodeSearch, setNodeSearch] = useState("");
  const [csvExportScope, setCsvExportScope] = useState<ResponsesCsvExportScope>("filtered");
  const [csvSortOrder, setCsvSortOrder] = useState<ResponsesCsvSortOrder>("createdAtDesc");
  const [signalSortOrder, setSignalSortOrder] = useState<SignalSortOrder>("default");
  const [excludedCsvPiiFields, setExcludedCsvPiiFields] = useState<ExportPiiField[]>([]);
  const [pendingCsvExportMetadata, setPendingCsvExportMetadata] = useState<ExportMetadata | null>(null);
  const [pendingCsvExportForm, setPendingCsvExportForm] = useState<FormSchema | null>(null);
  const [pendingCsvExportResponses, setPendingCsvExportResponses] = useState<Submission[]>([]);
  const [pendingCsvExportOptions, setPendingCsvExportOptions] = useState<ExportResponsesToCsvOptions | null>(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("review");
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [isReviewerFocusMode, setIsReviewerFocusMode] = useState(false);
  const [isRunningDemoFlow, setIsRunningDemoFlow] = useState(false);
  const [isDemoGuideOpen, setIsDemoGuideOpen] = useState(true);
  const [detailSectionsState, setDetailSectionsState] = useState<DetailWorkspaceSectionsState>({
    originalSignalOpen: true,
    attachmentsOpen: false,
    reviewerNotesOpen: false,
    signalTimelineOpen: false,
    relatedSignalsOpen: false,
    storageProofOpen: false,
    advancedMetadataOpen: false,
    headerDetailsOpen: false,
  });
  const [localActivityEvents, setLocalActivityEvents] = useState<ActivityEvent[]>(() => listActivityEvents());
  const [suiActivityEvents, setSuiActivityEvents] = useState<ActivityEvent[]>([]);
  const [projectModalMode, setProjectModalMode] = useState<ProjectWorkspaceModalMode | null>(null);
  const { toast, setToast } = useAdminToast();
  const saveQueueRef = useRef(Promise.resolve());
  const reviewInboxRef = useRef<HTMLDivElement | null>(null);
  const streamsPanelRef = useRef<HTMLDivElement | null>(null);
  const signalListPanelRef = useRef<HTMLElement | null>(null);
  const signalDetailPanelRef = useRef<HTMLElement | null>(null);
  const signalSearchInputRef = useRef<HTMLInputElement | null>(null);
  const shortcutHelpHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const signalCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const reviewSessionDialogRef = useRef<HTMLElement | null>(null);
  const reviewSessionPrimaryActionRef = useRef<HTMLButtonElement | null>(null);
  const keyboardNavigationRef = useRef(false);
  const hasAdminAccess = canAdmin(capabilityProfile);
  const setWorkspaceTab = useCallback(
    (tab: WorkspaceTab) => {
      if (tab === "activity") {
        setLocalActivityEvents(listActivityEvents());
      }
      setActiveWorkspaceTab(tab);
      const params = new URLSearchParams(location.search);
      params.set("tab", tab);
      navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
    },
    [location.pathname, location.search, navigate],
  );
  const [signalViewScope, setSignalViewScope] = useState<SignalViewScope>(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("scope") === "all" || params.get("form")) {
      return "all";
    }
    return getSelectedProjectId() ? "project" : "all";
  });
  const previousSelectedProjectIdRef = useRef<string | null>(getSelectedProjectId());
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
    applyFormUpdate,
    applyFormRemovals,
    applySubmissionUpdate,
  } = useSignalInboxData({
    accountAddress: wallet.accountAddress,
    capabilityProfile,
    sortOrder: signalSortOrder,
    scopeProjectId: getSelectedProjectId(),
    viewScope: signalViewScope,
  });

  useEffect(() => {
    if (!loading) {
      setLoadingRecoveryVisible(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setLoadingRecoveryVisible(true);
    }, WORKSPACE_RECOVERY_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [loading]);
  const {
    selectedPendingSignalIds,
    registeringSignalIds,
    isRegisteringSignal,
    togglePendingSelection,
    setPendingSelections,
    handleRegisterPendingSignals,
  } = usePendingSuiRegistration({
    allSignals,
    pendingSignalIdSet: signalIndex.pendingSignalIdSet,
    applySubmissionUpdate,
    setToast,
  });
  const {
    projects,
    refetchProjects,
    selectedProjectId,
    selectProject,
    selectedProject,
    manualProjectId,
    setManualProjectId,
    projectCreateName,
    setProjectCreateName,
    highlightCreateFormCta,
    isCreatingProject,
    projectState,
    manualProjectInputRef,
    projectCreateInputRef,
    visibleOnchainForms,
    connectManualProject,
    handleCreateProject,
  } = useProjectWorkspace({
    accountAddress: wallet.accountAddress,
    capabilityProfile,
    forms,
    loadConsole,
  });

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    if (tab === "review" || tab === "activity" || tab === "insights" || tab === "members") {
      if (activeWorkspaceTab !== tab) {
        setActiveWorkspaceTab(tab);
      }
      if (tab === "activity" && activeWorkspaceTab !== "activity") {
        setLocalActivityEvents(listActivityEvents());
      }
      return;
    }
    if (activeWorkspaceTab !== "review") {
      setActiveWorkspaceTab("review");
    }
  }, [activeWorkspaceTab, location.search]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("scope") === "all" || params.get("form")) {
      if (signalViewScope !== "all") {
        setSignalViewScope("all");
      }
      return;
    }
    if (params.get("scope") === "project" && selectedProjectId && signalViewScope !== "project") {
      setSignalViewScope("project");
    }
  }, [location.search, selectedProjectId, signalViewScope]);
  useEffect(() => {
    const previousProjectId = previousSelectedProjectIdRef.current;
    if (selectedProjectId !== previousProjectId) {
      previousSelectedProjectIdRef.current = selectedProjectId;
      if (selectedProjectId) {
        const params = new URLSearchParams(location.search);
        if (params.get("scope") === "all" || params.get("form")) {
          return;
        }
        setSignalViewScope("project");
        return;
      }
    }
    if (!selectedProjectId && signalViewScope === "project") {
      setSignalViewScope("all");
    }
  }, [location.search, selectedProjectId, signalViewScope]);
  const hasOwnedAccessibleForms = accessibleForms.some((form) =>
    addressesMatch(form.ownerAddress, wallet.accountAddress),
  );
  const hasProjectManagementAccess =
    hasAdminAccess ||
    hasOwnedAccessibleForms ||
    projects.some(
      (project) =>
        addressesMatch(project.owner, wallet.accountAddress) ||
        project.admins.some((adminAddress) => addressesMatch(adminAddress, wallet.accountAddress)),
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
    decryptedSignalsById,
    bulkDecrypting,
    bulkDecryptStatusMessage,
    bulkDecryptError,
    bulkDecryptProgress,
    decryptInFlightRef,
    bulkDecryptInFlightRef,
    decryptContext: attachmentDecryptContext,
    handleDecrypt,
    handleDecryptRecords,
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
      onchainPayloadReferenceMissing: t("decryptErrorOnchainPayloadReferenceMissing"),
      onchainPayloadBlobMissing: t("decryptErrorOnchainPayloadBlobMissing"),
      encryptedPayloadMissing: t("decryptErrorEncryptedPayloadMissing"),
      sealRuntimeUnavailable: t("decryptErrorSealRuntimeUnavailable"),
      encryptedPayloadNotFound: t("decryptErrorEncryptedPayloadNotFound"),
      walletVerifiedPrivateSignalUnlocked: t("decryptToastWalletVerifiedPrivateSignalUnlocked"),
      bulkDecryptSuccess: (count) => t("bulkDecryptToastSuccess", { count }),
      bulkDecryptPartialSuccess: (count, failed) => t("bulkDecryptToastPartialSuccess", { count, failed }),
    },
  });
  const roleLabel = getRoleLabel(capabilityProfile);
  const activityActorRole = getActivityActorRole(capabilityProfile);
  const accessState = wallet.accountAddress ? "allowed" : "denied";
  const privateReviewLabel = t("privateReviewEnabled");
  const sessionStatusLabel = wallet.accountAddress ? t("secureSessionActive") : t("secureSessionStandby");

  async function handleClearDebugPolicyCache() {
    const result = await clearDeepSignalPolicyCapabilityCache();
    await refetchAccessControl();
    setToast({
      tone: "success",
      message: `Cleared cached policy data (${result.removedLocalStorageKeys.length} local, ${result.removedSessionStorageKeys.length} session).`,
    });
  }

  function renderAnswerValue(field: { type: string }, value: unknown) {
    if (isLongTextLikeField(field.type as FormSchema["fields"][number]["type"])) {
      const text = typeof value === "string" ? value : "";
      return text ? <RichTextContent value={text} className="rich-text-content" /> : <p>{t("noAnswerLabel")}</p>;
    }
    return <FormattedAnswerValue field={field as FormSchema["fields"][number]} value={value} emptyLabel={t("noAnswerLabel")} showCountryIso />;
  }

  async function deleteNodes(formIds: string[]) {
    const formsById = new Map(forms.map((form) => [form.id, form]));
    const selectedIdentityKeys = new Set(
      [...new Set(formIds)]
        .map((formId) => formsById.get(formId))
        .map((form) => (form ? buildProjectFormIdentityKey(form) : ""))
        .filter(Boolean),
    );
    const uniqueIds = [
      ...new Set([
        ...formIds,
        ...forms
          .filter((form) => {
            const identityKey = buildProjectFormIdentityKey(form);
            return Boolean(identityKey) && selectedIdentityKeys.has(identityKey);
          })
          .map((form) => form.id),
      ]),
    ];
    const selectedManifestBlobIds = new Set(
      uniqueIds
        .map((formId) => formsById.get(formId)?.manifestBlobId)
        .filter((blobId): blobId is string => Boolean(blobId) && !isLocalFallbackBlob(blobId)),
    );
    const selectedFormBlobIds = new Set(
      uniqueIds
        .map((formId) => formsById.get(formId)?.blobId)
        .filter((blobId): blobId is string => Boolean(blobId) && !isLocalFallbackBlob(blobId)),
    );
    const blobIndexAliasIds = listFormBlobIndex()
      .filter(
        (entry) =>
          (entry.manifestBlobId && selectedManifestBlobIds.has(entry.manifestBlobId)) ||
          selectedFormBlobIds.has(entry.formBlobId),
      )
      .map((entry) => entry.formId);
    const expandedIds = [...new Set([...uniqueIds, ...blobIndexAliasIds])];
    markDeletedFormTombstones({
      forms: expandedIds
        .map((formId) => formsById.get(formId))
        .filter((form): form is FormWithCount => Boolean(form)),
      manifestBlobIds: [...selectedManifestBlobIds],
      blobIds: [...selectedFormBlobIds],
    });
    const onchainDeleteTargets = [
      ...new Set(
        expandedIds
          .map((formId) => formsById.get(formId))
          .map((form) => (form ? resolveOnchainDeleteTarget(form) : null))
          .filter(isFiniteFormId),
      ),
    ];

    if (onchainDeleteTargets.length > 0) {
      if (!selectedProject) {
        throw new Error("Select the linked project before deleting this node.");
      }
      if (selectedProject.signalsCount > 0) {
        throw new Error(t("deleteOnchainFormsNoSignalsOnly"));
      }
      for (const onchainFormId of onchainDeleteTargets) {
        try {
          const tx = deleteFormOnChain({
            projectId: selectedProject.objectId,
            formId: onchainFormId,
          });
          const result = await deleteNodeOnchainTx.mutateAsync({ transaction: tx });
          await suiClient.waitForTransaction({ digest: result.digest });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes("find_form_index")) {
            throw error;
          }
          console.warn(`On-chain form ${onchainFormId} was already absent during node delete. Continuing local cleanup.`);
        }
      }
      await refetchProjects();
    }

    const walletOwnedIds = expandedIds.filter((formId) => {
      const form = formsById.get(formId);
      return addressesMatch(form?.ownerAddress, wallet.accountAddress);
    });
    const localCacheOnlyIds = expandedIds.filter((formId) => !walletOwnedIds.includes(formId));

    if (walletOwnedIds.length > 0) {
      await storageAdapter.deleteForms(walletOwnedIds);
    }
    if (expandedIds.length > 0) {
      await deleteFormsFromLocalCache(expandedIds);
    }
    forcePurgeFormArtifacts({
      formIds: expandedIds,
      manifestBlobIds: [...selectedManifestBlobIds],
      blobIds: [...selectedFormBlobIds],
    });
    const archivedEvents = expandedIds.flatMap((formId) => {
      const form = formsById.get(formId);
      return form
        ? [
            createActivityEvent({
              form,
              actorAddress: wallet.accountAddress,
              actorRole: activityActorRole,
              action: "form_archived",
            }),
          ]
        : [];
    });
    appendActivityEvents(archivedEvents);
    setLocalActivityEvents(listActivityEvents());

    return {
      walletDeletedCount: walletOwnedIds.length,
      localCacheDeletedCount: localCacheOnlyIds.length,
      totalDeletedCount: expandedIds.length,
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
      applyFormRemovals([formId]);
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

  const canRegisterNodeOnSui = useCallback(
    (form: FormWithCount) =>
      Boolean(
        form.projectId &&
        typeof form.onchainFormId !== "number" &&
        form.manifestBlobId &&
        !isLocalFallbackBlob(form.manifestBlobId),
      ),
    [],
  );

  async function handleRegisterNodeOnSui(formId: string) {
    const form = accessibleForms.find((item) => item.id === formId);
    if (!form) {
      return;
    }
    if (!form.projectId) {
      setNodeRegistrationFeedback({
        formId,
        tone: "error",
        message: t("registerNodeMissingProject"),
      });
      setToast({ tone: "error", message: t("registerNodeMissingProject") });
      return;
    }
    if (!form.manifestBlobId || isLocalFallbackBlob(form.manifestBlobId)) {
      setNodeRegistrationFeedback({
        formId,
        tone: "error",
        message: t("registerNodeRequiresWalrus"),
      });
      setToast({ tone: "error", message: t("registerNodeRequiresWalrus") });
      return;
    }
    if (typeof form.onchainFormId === "number") {
      setNodeRegistrationFeedback({
        formId,
        tone: "success",
        message: t("registerNodeAlreadyOnSui"),
      });
      setToast({ tone: "success", message: t("registerNodeAlreadyOnSui") });
      return;
    }

    setNodeRegistrationFeedback({
      formId,
      tone: "info",
      message: t("registeringOnSui"),
    });
    setRegisteringFormId(formId);
    try {
      const formMetadataDigest =
        form.formMetadataDigest ??
        await createMetadataDigest({
          localFormId: form.id,
          title: form.title,
          description: form.description,
          purpose: form.purpose,
          visibility: form.visibility,
          publicExplore: form.publicExplore,
          fieldCount: form.fields.length,
          sectionCount: form.sections?.length ?? 0,
          encryptSubmissions: form.encryptSubmissions,
          responseDeadline: form.responseDeadline ?? null,
          responseDeadlineMode: form.responseDeadlineMode ?? "none",
          ownerAddress: form.ownerAddress,
          projectId: form.projectId ?? null,
        });
      const metadataReference = serializeProjectFormMetadataReference({
        digest: formMetadataDigest,
        manifestBlobId: form.manifestBlobId,
        formBlobId: form.blobId,
        formId: form.id,
      });
      const tx = createFormOnChain({
        projectId: form.projectId,
        title: form.title,
        metadataDigest: metadataReference,
      });
      const result = await registerFormTx.mutateAsync({ transaction: tx });
      const confirmed = await suiClient.waitForTransaction({
        digest: result.digest,
        options: { showEvents: true },
      });
      const formCreatedEvent = (confirmed.events ?? []).find((chainEvent) =>
        String(chainEvent.type ?? "").endsWith("::FormCreated"),
      );
      const rawFormId = (formCreatedEvent?.parsedJson as { form_id?: string | number } | undefined)?.form_id;
      const parsedFormId = typeof rawFormId === "number" ? rawFormId : Number(rawFormId ?? Number.NaN);
      if (!Number.isFinite(parsedFormId)) {
        throw new Error("Sui registration completed, but the new form id was not returned.");
      }

      const registeredForm = {
        ...form,
        formMetadataDigest,
        onchainFormId: parsedFormId,
        isOnchain: true,
        registrationMode: "sui" as const,
        activityEvents: [
          ...(form.activityEvents ?? []),
          createActivityEvent({
            form,
            actorAddress: wallet.accountAddress,
            actorRole: activityActorRole,
            action: "form_updated",
            txDigest: result.digest,
          }),
        ],
      } satisfies FormWithCount;

      await cleanupRegisteredFormLocalFallback(registeredForm);
      saveFormMetadataOverlay(registeredForm);
      applyFormUpdate(registeredForm);
      appendActivityEvents(registeredForm.activityEvents.slice(-1));
      setNodeRegistrationFeedback({
        formId,
        tone: "success",
        message: `${t("registerNodeSuccess", { title: form.title })} ${t("registryFormIdLabel")}: ${parsedFormId}`,
      });
      setToast({ tone: "success", message: t("registerNodeSuccess", { title: form.title }) });
    } catch (error) {
      setNodeRegistrationFeedback({
        formId,
        tone: "error",
        message: error instanceof Error ? error.message : t("registerNodeFailed"),
      });
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : t("registerNodeFailed"),
      });
    } finally {
      setRegisteringFormId(null);
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
      applyFormRemovals(formIds);
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

  useEffect(() => {
    const refreshActivityEvents = () => setLocalActivityEvents(listActivityEvents());
    window.addEventListener("focus", refreshActivityEvents);
    window.addEventListener("storage", refreshActivityEvents);
    return () => {
      window.removeEventListener("focus", refreshActivityEvents);
      window.removeEventListener("storage", refreshActivityEvents);
    };
  }, []);

  useEffect(() => {
    if (!hasAdminAccess || activeWorkspaceTab !== "activity" || projects.length === 0) {
      setSuiActivityEvents((current) => (current.length === 0 ? current : []));
      return;
    }

    let cancelled = false;
    void listSuiActivityEvents(suiClient, projects).then(
      (events) => {
        if (!cancelled) {
          setSuiActivityEvents((current) =>
            areActivityEventListsEqual(current, events) ? current : events,
          );
        }
      },
      (error) => {
        console.warn("Failed to load Sui activity events", error);
        if (isSuiRateLimitError(error)) {
          handleRateLimitedRpcFallback(rpc, error);
        }
        if (!cancelled) {
          setSuiActivityEvents((current) => (current.length === 0 ? current : []));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceTab, hasAdminAccess, projects, rpc, suiClient]);

  const selectedProjectForms = useMemo(() => {
    if (!selectedProject) {
      return [];
    }

    const formsById = new Map<string, FormWithCount>();
    accessibleForms
      .filter((form) => form.projectId === selectedProject.objectId)
      .forEach((form) => {
        formsById.set(form.id, form);
      });
    allSignals
      .filter((record) => record.form.projectId === selectedProject.objectId)
      .forEach((record) => {
        formsById.set(record.form.id, record.form);
      });

    return [...formsById.values()];
  }, [accessibleForms, allSignals, selectedProject]);
  const walrusOnlyProjectForms = useMemo(() => {
    if (!selectedProject) {
      return [];
    }

    return accessibleForms.filter(
      (form) =>
        form.projectId === selectedProject.objectId &&
        typeof form.onchainFormId !== "number" &&
        Boolean(form.manifestBlobId) &&
        !isLocalFallbackBlob(form.manifestBlobId),
    );
  }, [accessibleForms, selectedProject]);
  const shouldExplainProjectRecovery =
    hasAdminAccess &&
    Boolean(selectedProject) &&
    walrusOnlyProjectForms.length > 0;
  const latestProjectRecoveryNoticeAt = useMemo(() => {
    const latestWalrusOnlyFormAt = walrusOnlyProjectForms.reduce<number | null>((latest, form) => {
      const candidate = Date.parse(form.updatedAt ?? form.createdAt);
      if (!Number.isFinite(candidate)) {
        return latest;
      }
      return latest === null || candidate > latest ? candidate : latest;
    }, null);
    if (latestWalrusOnlyFormAt !== null) {
      return new Date(latestWalrusOnlyFormAt).toISOString();
    }
    return selectedProject?.createdAt ?? null;
  }, [selectedProject?.createdAt, walrusOnlyProjectForms]);

  const acknowledgeProjectRecoveryNotice = useCallback(() => {
    if (!selectedProject || !latestProjectRecoveryNoticeAt) {
      setProjectRecoveryNoticeOpen(false);
      return;
    }
    setProjectRecoveryNoticeOpen(false);
    setProjectRecoveryNoticeAcks((current) => {
      const next = {
        ...current,
        [selectedProject.objectId]: latestProjectRecoveryNoticeAt,
      };
      writeProjectRecoveryNoticeAcks(next);
      return next;
    });
  }, [latestProjectRecoveryNoticeAt, selectedProject]);

  useEffect(() => {
    if (!selectedProject) {
      setProjectRecoveryNoticeOpen(false);
      return;
    }
    if (!shouldExplainProjectRecovery) {
      setProjectRecoveryNoticeOpen(false);
      return;
    }
    const acknowledgedAt = projectRecoveryNoticeAcks[selectedProject.objectId];
    if (acknowledgedAt && latestProjectRecoveryNoticeAt) {
      const acknowledgedMs = Date.parse(acknowledgedAt);
      const latestNoticeMs = Date.parse(latestProjectRecoveryNoticeAt);
      if (Number.isFinite(acknowledgedMs) && Number.isFinite(latestNoticeMs) && acknowledgedMs >= latestNoticeMs) {
        setProjectRecoveryNoticeOpen(false);
        return;
      }
    }
    if (acknowledgedAt && !latestProjectRecoveryNoticeAt) {
      setProjectRecoveryNoticeOpen(false);
      return;
    }
    setProjectRecoveryNoticeOpen(true);
  }, [latestProjectRecoveryNoticeAt, projectRecoveryNoticeAcks, selectedProject, shouldExplainProjectRecovery]);
  const attachmentPreviews = useAttachmentPreviews(detailAttachments, {
    enabled:
      detailAttachments.length > 0 &&
      (!detailAttachments.some((attachment) => attachment.encrypted) || Boolean(detailAnswers)),
    decryptContext: attachmentDecryptContext,
  });
  const selectedRoadmapUrl = selectedRecord
    ? getPublicRoadmapPath(selectedRecord.form.id, selectedRecord.form.manifestBlobId)
    : "";
  const relatedSignals = useMemo(
    () =>
      getRelatedSignals({
        selectedRecord,
        records: allSignals,
        maxResults: 5,
      }),
    [allSignals, selectedRecord],
  );
  const hasExplicitSelectedRecord = Boolean(selectedSignalId && selectedRecord);
  const isSelectedRecordOnRoadmap = selectedRecord
    ? ROADMAP_READY_STATUSES.has(selectedRecord.submission.triageStatus)
    : false;
  const selectedRecordNeedsDecrypt = Boolean(
    selectedRecord?.submission.isEncrypted && !detailAnswers,
  );
  const reviewSaveStatusLabel: Record<ReviewSaveStatus, string> = {
    idle: t("reviewSaveReadyToSave"),
    saving: t("reviewSaveSaving"),
    saved: t("reviewSaveSaved"),
    skipped: t("reviewSaveSkipped"),
    error: t("reviewSaveError"),
  };
  const {
    reviewSaveStatus,
    setReviewSaveStatus,
    activeReviewDraft,
    hasReviewDraftChanges,
    reviewStatusPillState,
    reviewStatusPillLabel,
    patchReviewDraft,
    buildSubmissionFromReviewDraft,
    syncReviewDraftFromSubmission,
    reviewSessionOpen,
    forceCloseReviewSession,
    requestCloseReviewSession,
    openReviewSession,
    reviewSessionStep,
    setReviewSessionStep,
    reviewSessionMobileTab,
    setReviewSessionMobileTab,
  } = useReviewWorkspace({
    selectedRecord,
    selectedRecordNeedsDecrypt,
    isReviewWorkbenchLocked: selectedRecordNeedsDecrypt,
    setSelectedSignalId,
    onSelectedRecordChange: () => {
      setDecryptError("");
    },
    discardChangesConfirmLabel: t("discardChangesConfirm"),
    reviewSaveStatusLabel,
    reviewSaveUnsavedDraftLabel: t("reviewSaveUnsavedDraft"),
    mobileReviewMediaQuery: MOBILE_REVIEW_MEDIA_QUERY,
  });
  const selectedRecordEncryptedBlobId = selectedRecord?.submission.encryptedBlobId;
  const selectedRecordEncryptedBlobStoredOnWalrus = Boolean(
    selectedRecordEncryptedBlobId && !isLocalFallbackBlob(selectedRecordEncryptedBlobId),
  );
  const selectedRecordStoredOnWalrus = Boolean(
    selectedRecord &&
      !isLocalFallbackBlob(selectedRecord.submission.encryptedBlobId ?? selectedRecord.submission.blobId),
  );
  const selectedRecordPayloadState = selectedRecord
    ? getPrivateSignalPayloadState(selectedRecord.submission)
    : "available";
  const selectedRecordHasPayloadIssue = selectedRecord
    ? hasPrivateSignalPayloadIssue(selectedRecord.submission)
    : false;
  const selectedRecordTxDigest = selectedRecord ? getSubmissionMetadataString(selectedRecord.submission, "txDigest") : undefined;
  const selectedRecordRpcProviderLabel = selectedRecord
    ? getSubmissionMetadataString(selectedRecord.submission, "rpcProvider") ?? rpc.providerLabel
    : rpc.providerLabel;
  const selectedRecordRpcNetworkLabel = selectedRecord
    ? getSubmissionMetadataString(selectedRecord.submission, "network") ?? rpc.connectedNetworkLabel
    : rpc.connectedNetworkLabel;
  const selectedRecordVerificationRouteLabel = /tatum/i.test(selectedRecordRpcProviderLabel)
    ? t("verifiedViaTatumSuiRpc")
    : t("verifiedViaSuiRpc", { provider: selectedRecordRpcProviderLabel });
  const selectedReviewContextChips = selectedRecord
    ? [
        {
          label: t("signalJourneySignal"),
          tone: "soft" as const,
        },
        {
          label: detailAnswers || !selectedRecord.submission.isEncrypted ? t("signalJourneyAnalysis") : t("signalJourneyAnalysisLocked"),
          tone: detailAnswers || !selectedRecord.submission.isEncrypted ? ("soft" as const) : ("warn" as const),
        },
        {
          label:
            typeof selectedRecord.submission.onchainSignalId === "number"
              ? t("signalJourneyImmutableProof")
              : selectedRecordStoredOnWalrus
                ? t("signalJourneyWalrusProof")
                : t("signalJourneyLocalRecovery"),
          tone:
            typeof selectedRecord.submission.onchainSignalId === "number"
              ? ("accent" as const)
              : selectedRecordStoredOnWalrus
                ? ("soft" as const)
                : ("warn" as const),
        },
        {
          label: t("prioritySummaryLabel", { value: getLocalizedPriorityLabel(selectedRecord.submission.priority, t) }),
          tone: "soft" as const,
        },
        {
          label: selectedRecord.submission.isEncrypted ? t("encryptedSignals") : t("readableLabel"),
          tone: selectedRecord.submission.isEncrypted ? ("accent" as const) : ("soft" as const),
        },
        {
          label: selectedRecordStoredOnWalrus ? t("storedOnWalrus") : t("localFallbackLabel"),
          tone: selectedRecordStoredOnWalrus ? ("soft" as const) : ("accent" as const),
        },
        {
          label: detailAnswers
            ? t("privateSignalUnlockStepUnlocked")
            : selectedRecord.submission.isEncrypted
              ? t("awaitingUnlockLabel")
              : t("readyForReviewLabel"),
          tone: detailAnswers
            ? ("soft" as const)
            : selectedRecord.submission.isEncrypted
              ? ("warn" as const)
              : ("soft" as const),
        },
        isSelectedRecordOnRoadmap && selectedRoadmapUrl
          ? {
              label: t("roadmapLinkedLabel"),
              tone: "accent" as const,
            }
          : null,
        selectedRecordHasPayloadIssue
          ? {
              label:
                selectedRecordPayloadState === "missing_onchain_payload_reference"
                  ? t("privateSignalPayloadMissingStatus")
                  : t("encryptedPayloadMissingLabel"),
              tone: "warn" as const,
            }
          : null,
      ].filter((chip): chip is { label: string; tone: "soft" | "accent" | "warn" } => Boolean(chip))
    : [];
  const selectedRecordUnlockDisabledReason = detailAnswers
    ? undefined
    : !selectedRecord?.submission.isEncrypted
      ? t("privateSignalUnlockUnavailable")
      : selectedRecordPayloadState === "missing_onchain_payload_reference"
        ? t("privateSignalPayloadMissingOnchainDisabled")
        : selectedRecordPayloadState === "missing_payload"
          ? t("privateSignalPayloadMissingDisabled")
      : !canAttemptPrivateSignalDecrypt(selectedRecord.form, wallet.accountAddress, capabilityProfile)
        ? t("privateSignalUnlockDisabled")
        : undefined;
  const hasDuplicateLikelyRelatedSignals = relatedSignals.some((signal) => signal.duplicateLikely);

  useEffect(() => {
    if (!reviewSessionOpen) {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      reviewSessionPrimaryActionRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestCloseReviewSession();
        return;
      }

      if (event.key !== "Tab" || !reviewSessionDialogRef.current) {
        return;
      }

      const focusable = Array.from(
        reviewSessionDialogRef.current.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [requestCloseReviewSession, reviewSessionOpen]);

  useEffect(() => {
    if (!selectedRecord) {
      setDetailSectionsState({
        originalSignalOpen: true,
        attachmentsOpen: false,
        reviewerNotesOpen: false,
        signalTimelineOpen: false,
        relatedSignalsOpen: false,
        storageProofOpen: false,
        advancedMetadataOpen: false,
        headerDetailsOpen: false,
      });
      setIsReviewerFocusMode(false);
      return;
    }

    const hasVisibleNotes = getVisibleReviewerNotes(selectedRecord.submission).trim().length > 0;
    setDetailSectionsState({
      originalSignalOpen: true,
      attachmentsOpen: detailAttachments.length > 0,
      reviewerNotesOpen: hasVisibleNotes,
      signalTimelineOpen: false,
      relatedSignalsOpen: hasDuplicateLikelyRelatedSignals,
      storageProofOpen: false,
      advancedMetadataOpen: false,
      headerDetailsOpen: false,
    });
    setIsReviewerFocusMode(false);
  }, [selectedRecord, detailAttachments.length, hasDuplicateLikelyRelatedSignals]);
  const reviewBasePath = location.pathname.startsWith("/admin") ? "/admin" : "/dashboard";
  const selectedFormIdFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("form") ?? "";
  }, [location.search]);
  const selectedSignalIdFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("signal") ?? "";
  }, [location.search]);

  useEffect(() => {
    if (!selectedFormIdFromUrl) {
      return;
    }
    if (selectedFormId === selectedFormIdFromUrl) {
      return;
    }
    if (!forms.some((form) => form.id === selectedFormIdFromUrl)) {
      return;
    }
    setSelectedFormId(selectedFormIdFromUrl);
  }, [forms, selectedFormId, selectedFormIdFromUrl, setSelectedFormId]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia?.(MOBILE_REVIEW_MEDIA_QUERY).matches) {
      return;
    }
    if (selectedSignalIdFromUrl) {
      if (selectedSignalIdFromUrl !== selectedSignalId) {
        setSelectedSignalId(selectedSignalIdFromUrl);
      }
      return;
    }
    if (selectedSignalId) {
      setSelectedSignalId("");
    }
  }, [selectedSignalId, selectedSignalIdFromUrl, setSelectedSignalId]);

  useEffect(() => {
    if (!showShortcutHelp) {
      return;
    }
    window.requestAnimationFrame(() => {
      shortcutHelpHeadingRef.current?.focus();
    });
  }, [showShortcutHelp]);

  useEffect(() => {
    if (!keyboardNavigationRef.current || !selectedSignalId) {
      return;
    }
    keyboardNavigationRef.current = false;
    const target = signalCardRefs.current[selectedSignalId];
    target?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selectedSignalId]);

  function syncMobileSignalUrl(record: SignalRecord | null) {
    if (typeof window === "undefined" || !window.matchMedia?.(MOBILE_REVIEW_MEDIA_QUERY).matches) {
      return;
    }
    const params = new URLSearchParams(location.search);
    if (record) {
      params.set("signal", record.submission.id);
    } else {
      params.delete("signal");
    }
    const nextSearch = params.toString();
    navigate(
      {
        pathname: reviewBasePath,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: !record },
    );
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
    : selectedRecord.submission.status === "unread"
        ? {
            eyebrow: t("nextStepLabel"),
            title: t("startReviewSessionTitle"),
            detail: t("startReviewSessionDetail"),
            cta: (
              <button
                type="button"
                className="primary-button"
                disabled={saving}
                onClick={() => openReviewSession()}
              >
                <span className="review-focus-cta-icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20" focusable="false">
                    <path d="M4 10h9" />
                    <path d="m10.5 5.5 4.5 4.5-4.5 4.5" />
                  </svg>
                </span>
                {t("reviewSignalAction")}
              </button>
            ),
          }
        : selectedRecordNeedsDecrypt
          ? null
        : selectedRecord.submission.pendingOnchainRegistration
          ? {
              eyebrow: t("nextStepLabel"),
              title: t("optionalProofRegisterSuiTitle"),
              detail: t("optionalProofRegisterSuiDetail"),
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
            ? null
            : {
                eyebrow: t("nextStepLabel"),
                title: t("signalAlreadyInReviewFlowTitle"),
                detail: t("signalAlreadyInReviewFlowDetail"),
                cta: selectedRoadmapUrl ? <Link className="ghost-button" to={selectedRoadmapUrl}>{t("openPublicRoadmap")}</Link> : null,
              };
  const firstProjectForm = selectedProjectForms[0] ?? null;
  const firstVisibleForm = accessibleForms[0] ?? null;

  const draftReviewStatus = activeReviewDraft?.status ?? selectedRecord?.submission.status ?? "unread";
  const draftTriageStatus = activeReviewDraft?.triageStatus ?? selectedRecord?.submission.triageStatus ?? "new";
  const isReviewWorkbenchLocked = selectedRecordNeedsDecrypt;
  const isDraftOnRoadmap = ROADMAP_READY_STATUSES.has(draftTriageStatus);
  const shouldHideLockedDetailBeforeReview = Boolean(
    selectedRecord &&
      selectedRecord.submission.status === "unread" &&
      selectedRecordNeedsDecrypt,
  );

  function setDetailSectionOpen(section: keyof DetailWorkspaceSectionsState, open: boolean) {
    setDetailSectionsState((current) => ({
      ...current,
      [section]: open,
    }));
  }

  const updateSubmission = useCallback(async (nextSubmission: Submission, options: { announce?: boolean } = {}) => {
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
        const signalRecord = signalIndex.signalById[normalized.id];
        const projectId = signalRecord?.form.projectId;
        const nextOnchainStatus =
          projectId && typeof normalized.onchainSignalId === "number"
            ? triageStatusToOnchainStatus(normalized.triageStatus, normalized.status)
            : undefined;
        const needsOnchainSync =
          Boolean(projectId) &&
          typeof normalized.onchainSignalId === "number" &&
          !normalized.pendingOnchainRegistration &&
          nextOnchainStatus !== undefined &&
          normalized.onchainStatus !== nextOnchainStatus;

        if (needsOnchainSync && projectId && nextOnchainStatus) {
          const tx = updateSignalStatusOnChain({
            projectId,
            signalId: normalized.onchainSignalId ?? 0,
            status: nextOnchainStatus,
          });
          const result = await updateSignalStatusTx.mutateAsync({ transaction: tx });
          await suiClient.waitForTransaction({ digest: result.digest });
          const syncedSubmission = normalizeSubmission({
            ...normalized,
            onchainStatus: nextOnchainStatus,
            metadata: {
              ...(normalized.metadata ?? {}),
              onchainStatusTxDigest: result.digest,
            },
            updatedAt: new Date().toISOString(),
          });
          await storageAdapter.updateSubmission(syncedSubmission);
          applySubmissionUpdate(syncedSubmission);
        }
        const nextStatus = normalized.pendingOnchainRegistration ? "skipped" : "saved";
        setReviewSaveStatus(nextStatus);
        if (options.announce) {
          setToast({
            tone: "success",
            message:
              nextStatus === "skipped"
                ? "Review saved. On-chain sync skipped until proof registration."
                : needsOnchainSync
                  ? "Review & Triage saved. Sui status synced."
                  : "Review & Triage saved.",
          });
        }
        saved = true;
      } catch (error) {
        setReviewSaveStatus("error");
        setToast({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "Review save failed.",
        });
      } finally {
        setSaving(false);
      }
    };
    saveQueueRef.current = saveQueueRef.current.then(runSave, runSave);
    await saveQueueRef.current;
    return saved;
  }, [applySubmissionUpdate, setReviewSaveStatus, setSelectedSignalId, setToast, signalIndex.signalById, suiClient, updateSignalStatusTx]);

  const handleQuickAction = useCallback(
    async (record: SignalRecord, action: QuickActionId) => {
      const nextSubmission = buildQuickActionSubmission(record.submission, action);
      const saved = await updateSubmission(nextSubmission, { announce: true });
      if (!saved) {
        return;
      }
      if (selectedRecord?.submission.id === record.submission.id) {
        syncReviewDraftFromSubmission(nextSubmission);
      }
    },
    [selectedRecord, syncReviewDraftFromSubmission, updateSubmission],
  );

  const saveActiveReviewDraft = useCallback(async () => {
    if (!selectedRecord || !activeReviewDraft || !hasReviewDraftChanges || isReviewWorkbenchLocked) {
      return false;
    }
    return updateSubmission(
      buildSubmissionFromReviewDraft(selectedRecord.submission, activeReviewDraft),
      { announce: true },
    );
  }, [
    activeReviewDraft,
    buildSubmissionFromReviewDraft,
    hasReviewDraftChanges,
    isReviewWorkbenchLocked,
    selectedRecord,
    updateSubmission,
  ]);

  async function handleToggleNeedsFollowUp() {
    if (!selectedRecord || isReviewWorkbenchLocked) {
      return;
    }
    await updateSubmission(
      {
        ...selectedRecord.submission,
        tags: setNeedsFollowUpTag(
          selectedRecord.submission.tags,
          !hasNeedsFollowUp(selectedRecord.submission),
        ),
      },
      { announce: true },
    );
  }

  const shortcutItems = useMemo(
    () => [
      { keys: "J / ↓", description: t("shortcutNextSignal") },
      { keys: "K / ↑", description: t("shortcutPreviousSignal") },
      { keys: "R", description: t("shortcutActionReviewing") },
      { keys: "X", description: t("shortcutActionResolve") },
      { keys: "P", description: t("shortcutActionPublish") },
      { keys: "A", description: t("shortcutActionArchive") },
      { keys: "/", description: t("shortcutFocusSearch") },
      { keys: "?", description: t("shortcutShowHelp") },
    ],
    [t],
  );

  const handleSelectDesktopSignal = useCallback(
    (signalId: string, options: { scrollIntoView?: boolean } = {}) => {
      setSelectedSignalId(signalId);
      if (!options.scrollIntoView) {
        return;
      }
      const target = signalCardRefs.current[signalId];
      if (!target) {
        return;
      }
      window.requestAnimationFrame(() => {
        target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      });
    },
    [setSelectedSignalId],
  );

  const moveSelectedSignal = useCallback(
    (direction: 1 | -1) => {
      if (visibleSignals.length === 0) {
        return;
      }
      const currentIndex = visibleSignals.findIndex((record) => record.submission.id === selectedSignalId);
      const nextIndex =
        currentIndex === -1
          ? direction > 0
            ? 0
            : visibleSignals.length - 1
          : Math.min(Math.max(currentIndex + direction, 0), visibleSignals.length - 1);
      const nextRecord = visibleSignals[nextIndex];
      if (!nextRecord) {
        return;
      }
      keyboardNavigationRef.current = true;
      handleSelectDesktopSignal(nextRecord.submission.id, { scrollIntoView: true });
    },
    [handleSelectDesktopSignal, selectedSignalId, visibleSignals],
  );

  const triggerShortcutAction = useCallback(
    async (action: KeyboardShortcutAction) => {
      if (action === "next") {
        moveSelectedSignal(1);
        return;
      }
      if (action === "previous") {
        moveSelectedSignal(-1);
        return;
      }
      if (action === "search") {
        signalSearchInputRef.current?.focus();
        signalSearchInputRef.current?.select();
        return;
      }
      if (action === "help") {
        setShowShortcutHelp(true);
        return;
      }
      if (!selectedRecord) {
        return;
      }
      await handleQuickAction(selectedRecord, action);
    },
    [handleQuickAction, moveSelectedSignal, selectedRecord],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleKeyboardShortcuts = (event: KeyboardEvent) => {
      if (window.matchMedia?.(MOBILE_REVIEW_MEDIA_QUERY).matches) {
        return;
      }
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (isInteractiveKeyboardTarget(event.target)) {
        return;
      }
      if (event.key === "Escape" && showShortcutHelp) {
        event.preventDefault();
        setShowShortcutHelp(false);
        return;
      }
      if (showShortcutHelp) {
        return;
      }
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        void triggerShortcutAction("next");
        return;
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        void triggerShortcutAction("previous");
        return;
      }
      if (event.key === "r") {
        event.preventDefault();
        void triggerShortcutAction("reviewing");
        return;
      }
      if (event.key === "x") {
        event.preventDefault();
        void triggerShortcutAction("resolve");
        return;
      }
      if (event.key === "p") {
        event.preventDefault();
        void triggerShortcutAction("publish");
        return;
      }
      if (event.key === "a") {
        event.preventDefault();
        void triggerShortcutAction("archive");
        return;
      }
      if (event.key === "/" || event.key === "?") {
        event.preventDefault();
        void triggerShortcutAction(event.key === "?" || event.shiftKey ? "help" : "search");
      }
    };
    window.addEventListener("keydown", handleKeyboardShortcuts);
    return () => window.removeEventListener("keydown", handleKeyboardShortcuts);
  }, [showShortcutHelp, triggerShortcutAction]);

  const streamItems = [
    {
      id: "needs_review",
      label: t("needsReviewSignals"),
      count: signalIndex.counts.needsReview,
    },
    {
      id: "unresolved",
      label: t("unresolvedLabel"),
      count: signalIndex.counts.unresolved,
    },
    {
      id: "unread",
      label: t("unreadSignals"),
      count: signalIndex.counts.unread,
    },
    {
      id: "verified",
      label: t("verifiedSignalsLabel"),
      count: signalIndex.counts.verified,
    },
    {
      id: "anonymous",
      label: t("anonymousLabel"),
      count: signalIndex.counts.anonymous,
    },
    {
      id: "published",
      label: t("publishedLabel"),
      count: signalIndex.counts.published,
    },
    {
      id: "high",
      label: t("criticalHighLabel"),
      count: signalIndex.counts.high,
    },
    {
      id: "follow_up",
      label: t("needsFollowUpLabel"),
      count: signalIndex.counts.followUp,
    },
    {
      id: "encrypted",
      label: t("protectedLabel"),
      count: signalIndex.counts.encrypted,
    },
    {
      id: "archived",
      label: t("resolvedLabel"),
      count: signalIndex.counts.archived,
    },
    {
      id: "pending_sui",
      label: t("pendingSuiShortLabel"),
      count: signalIndex.counts.pendingSui,
    },
    {
      id: "registered_sui",
      label: t("registeredOnSuiLabel"),
      count: signalIndex.counts.registeredSui,
    },
    {
      id: "all",
      label: t("allSignalsIndexLabel"),
      count: allSignals.length,
    },
  ] satisfies Array<{ id: StreamId; label: string; count: number }>;
  const unreadCountByFormId = signalIndex.unreadCountByFormId;

  const selectedForm = accessibleForms.find((form) => form.id === selectedFormId) ?? null;
  const activityEvents = useMemo(
    () =>
      mergeActivityEvents(
        localActivityEvents,
        suiActivityEvents,
        accessibleForms.flatMap((form) => form.activityEvents ?? []),
      ),
    [accessibleForms, localActivityEvents, suiActivityEvents],
  );
  const selectedBeaconForm =
    accessibleForms.find((form) => form.id === beaconFormId) ?? null;
  const resolveOnchainDeleteTarget = useCallback(
    (form: Pick<FormSchema, "id" | "projectId" | "onchainFormId" | "manifestBlobId">) => {
      if (!selectedProject || form.projectId !== selectedProject.objectId) {
        return null;
      }
      if (typeof form.onchainFormId === "number") {
        return form.onchainFormId;
      }
      const matchedOnchainForm = visibleOnchainForms.find(
        (entry) =>
          (form.manifestBlobId && entry.manifestBlobId === form.manifestBlobId) ||
          entry.sourceFormId === form.id,
      );
      return matchedOnchainForm?.formId ?? null;
    },
    [selectedProject, visibleOnchainForms],
  );
  const canDeleteForm = useCallback(
    (form: Pick<FormSchema, "ownerAddress">) =>
      hasAdminAccess || !capabilityProfile.isConfigured || addressesMatch(form.ownerAddress, wallet.accountAddress),
    [wallet.accountAddress, capabilityProfile.isConfigured, hasAdminAccess],
  );
  const workspaceMetaItems = hasAdminAccess
    ? [
        formatWorkspaceCount(selectedProject ? selectedProject.formsCount : accessibleForms.length, "Channel"),
        formatWorkspaceCount(selectedProject ? selectedProject.signalsCount : allSignals.length, "Signal"),
        formatAccessLabel(roleLabel),
      ]
    : [
        formatWorkspaceCount(accessibleForms.length, "Channel"),
        formatWorkspaceCount(allSignals.length, "Signal"),
        sessionStatusLabel,
      ];
  const hasProjects = projects.length > 0;
  const hasFormsInSelectedProject = selectedProject
    ? selectedProjectForms.length > 0 || selectedProject.formsCount > 0
    : accessibleForms.length > 0;
  const hasSignalsInSelectedProject = selectedProject ? selectedProject.signalsCount > 0 : false;
  const onboardingState: InboxOnboardingState =
    hasAdminAccess && !hasProjects
      ? "create-project"
      : hasAdminAccess && hasProjects && !hasFormsInSelectedProject && allSignals.length === 0 && !hasSignalsInSelectedProject
        ? "create-signal"
        : "ready";
  const showGuidedOnboarding = hasAdminAccess && onboardingState !== "ready";
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
  const selectedReviewer = activeReviewDraft?.reviewer ?? (selectedRecord ? getAssignedReviewer(selectedRecord.submission) ?? "" : "");
  const selectedReviewerDisplayLabel = useReviewerDisplayLabel(selectedReviewer);
  const selectedReviewerPresence = selectedRecord
    ? getReviewerPresenceText(selectedRecord.submission, wallet.accountAddress)
    : null;
  const selectedNeedsFollowUp = selectedRecord ? hasNeedsFollowUp(selectedRecord.submission) : false;
  const selectedReviewerNoteUpdatedAt = selectedRecord ? getReviewerNoteUpdatedAt(selectedRecord.submission) : undefined;
  const selectedSavedReviewer = selectedRecord ? getAssignedReviewer(selectedRecord.submission) ?? "" : "";
  const selectedHasSavedReviewResult = selectedRecord ? hasSavedReviewResult(selectedRecord.submission) : false;
  const selectedSavedReviewerDisplayLabel = useReviewerDisplayLabel(selectedSavedReviewer);
  const selectedPublicDecisionLabel = selectedRecord ? getPublicDecisionLabel(selectedRecord.submission, t) : "";
  const selectedSignalValueStars = selectedRecord ? getSignalValueStars(selectedRecord.submission.signalValue) : null;
  const selectedReviewResultItems = selectedRecord
    ? [
        { label: t("assignedReviewerLabel"), value: selectedSavedReviewerDisplayLabel || "-" },
        { label: t("reviewedAtLabel"), value: selectedReviewerNoteUpdatedAt ? formatDate(selectedReviewerNoteUpdatedAt) : "-" },
        {
          label: t("roadmapLinkedLabel"),
          value: isSelectedRecordOnRoadmap && selectedRoadmapUrl ? t("linkedLabel") : "-",
          href: isSelectedRecordOnRoadmap && selectedRoadmapUrl ? selectedRoadmapUrl : undefined,
        },
        { label: t("lastUpdatedLabel"), value: selectedHasSavedReviewResult ? formatDate(selectedRecord.submission.updatedAt) : "-" },
      ]
    : [];
  const selectedReviewSummaryBadges = selectedRecord
    ? [
        reviewSaveStatus !== "idle" ? reviewStatusPillLabel : null,
        isSelectedRecordOnRoadmap ? t("publishReadyTitle") : null,
        selectedRecord.submission.status === "archived" ? t("statusArchived") : null,
        selectedRecord.submission.triageStatus === "fixed" || selectedRecord.submission.triageStatus === "closed"
          ? t("resolvedLabel")
          : null,
      ].filter((value): value is string => Boolean(value))
    : [];
  const timelineNow = Date.now();
  const selectedSignalTimelineEntries = useMemo(
    () => (selectedRecord ? buildSignalTimelineEntries(selectedRecord.submission, t) : []),
    [selectedRecord, t],
  );
  const selectedSignalTimelineCurrentState = useMemo(
    () =>
      selectedRecord
        ? getSignalTimelineCurrentState(selectedRecord.submission, selectedSignalTimelineEntries, t)
        : null,
    [selectedRecord, selectedSignalTimelineEntries, t],
  );
  const getTimelinePhaseLabel = useCallback(
    (phase: SignalTimelineEntry["phase"]) => getSignalTimelinePhaseLabel(phase, t),
    [t],
  );
  const selectedSecondaryMetaItems = selectedRecord
    ? [
        selectedRecord.submission.severity
          ? t("severityLabel", { value: selectedRecord.submission.severity ?? t("mediumLabel") })
          : null,
        typeof selectedRecord.submission.ratingValue === "number"
          ? t("ratingLabel", { value: selectedRecord.submission.ratingValue })
          : null,
        t("signalsInThisFormLabel", { count: selectedFormSubmissionCount }),
        selectedRecordEncryptedBlobStoredOnWalrus ? t("storageWalrus") : null,
      ].filter((item): item is string => Boolean(item))
    : [];
  const reviewSessionStepItems = [
    { id: 1, title: t("reviewUnlockSignalTitle"), detail: t("reviewUnlockSignalDetail") },
    { id: 2, title: t("reviewReadAndClassifyTitle"), detail: t("reviewReadAndClassifyDetail") },
    { id: 3, title: t("reviewReviewerNoteTitle"), detail: t("reviewReviewerNoteDetail") },
    {
      id: 4,
      title: t("reviewPublicRoadmapDecisionTitle"),
      detail: t("reviewPublicRoadmapDecisionDetail"),
    },
  ] as const;
  const reviewSessionCurrentStep = reviewSessionStepItems.find((step) => step.id === reviewSessionStep) ?? reviewSessionStepItems[0];
  const reviewSessionPublicResultValue =
    selectedRecord && activeReviewDraft
      ? getPublicDecisionLabel(buildSubmissionFromReviewDraft(selectedRecord.submission, activeReviewDraft), t)
      : selectedRecord
        ? getPublicDecisionLabel(selectedRecord.submission, t)
        : "";
  const canAdvanceReviewSession =
    reviewSessionStep === 1
      ? Boolean(detailAnswers)
      : reviewSessionStep === 2
        ? Boolean(activeReviewDraft && (activeReviewDraft.triageStatus !== "new" || activeReviewDraft.signalValue !== undefined))
        : reviewSessionStep === 3
          ? true
          : hasReviewDraftChanges;

  function getCsvFilterSnapshot() {
    return {
      searchQuery: search,
      status: selectedStreamId === "all" ? undefined : `stream:${selectedStreamId}`,
      priority: selectedStreamId === "high" ? "high" : undefined,
      tags: [...(search.trim() ? [search.trim()] : []), ...(selectedStreamId === "follow_up" ? [NEEDS_FOLLOW_UP_TAG] : [])],
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
      exportedBy: wallet.accountAddress ?? "",
      filterSnapshot: getCsvFilterSnapshot(),
      responseOverrides: getCsvResponseOverrides(),
    };
    const metadata = buildExportMetadata(selectedRecord.form, responses, options);
    setPendingCsvExportForm(selectedRecord.form);
    setPendingCsvExportResponses(responses);
    setPendingCsvExportMetadata(metadata);
    setPendingCsvExportOptions({ ...options, metadata });
  }

  function handleOpenFormAllCsvExportReview(formId: string) {
    const form = accessibleForms.find((item) => item.id === formId);
    if (!form) {
      return;
    }
    const responses = (submissionsByFormId[formId] ?? []).map((submission) => normalizeSubmission(submission));
    if (responses.length === 0) {
      setToast({ tone: "error", message: t("noResponsesMatchCurrentFilters") });
      return;
    }
    const options: ExportResponsesToCsvOptions = {
      language,
      now: new Date(),
      scope: "all",
      sortOrder: csvSortOrder,
      excludedPiiFields: excludedCsvPiiFields,
      exportedBy: wallet.accountAddress ?? "",
      filterSnapshot: {
        searchQuery: "",
        status: undefined,
        priority: undefined,
        tags: [],
        triageStatus: undefined,
        dateRange: {},
      },
    };
    const metadata = buildExportMetadata(form, responses, options);
    setPendingCsvExportForm(form);
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

  function openAdvancedProjectSettings() {
    setProjectModalMode("select");
  }

  function revealProjectSettingsTools(mode: "connect" | "create") {
    setProjectModalMode(mode);
  }

  async function handleCreateProjectFromModal() {
    const success = await handleCreateProject();
    if (success) {
      setProjectModalMode(null);
    }
  }

  async function handleConnectProjectFromModal() {
    const success = await connectManualProject();
    if (success) {
      setProjectModalMode(null);
    }
  }

  function handleSelectProjectFromModal(projectId: string) {
    selectProject(projectId);
    setProjectModalMode(null);
  }

  function jumpToReviewWorkspace() {
    setActiveWorkspaceTab("review");
    setSelectedStreamId("all");
    setSelectedFormId("all");
    reviewInboxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleRunDemoFlow() {
    if (isRunningDemoFlow) {
      return;
    }
    setIsRunningDemoFlow(true);
    try {
      await seedDemoWorkspace();
      await loadConsole();
      setActiveWorkspaceTab("review");
      setSignalViewScope("all");
      setSelectedFormId(DEMO_FORM_ID);
      setSelectedStreamId("all");
      setSearch("");
      setSelectedSignalId(DEMO_PRIMARY_SIGNAL_ID);
      setIsDemoGuideOpen(true);
      reviewInboxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setToast({
        tone: "success",
        message: t("demoFlowSeeded"),
      });
    } catch {
      setToast({
        tone: "error",
        message: t("demoFlowSeedFailed"),
      });
    } finally {
      setIsRunningDemoFlow(false);
    }
  }

  const activeScopeLabel =
    selectedFormId === "all" ? t("allSignalNodes") : selectedForm?.title ?? t("selectedNode");
  const canUseProjectScope = Boolean(selectedProjectId);
  const projectScopeActive = signalViewScope === "project" && canUseProjectScope;
  const signalScopeAllLabel = t("signalViewScopeAll");
  const signalScopeProjectLabel = selectedProject
    ? t("signalViewScopeProjectOnlyNamed", { name: selectedProject.name })
    : t("signalViewScopeProjectOnly");
  const signalScopeActionLabel = projectScopeActive ? signalScopeAllLabel : signalScopeProjectLabel;
  const hasDemoWorkspace = accessibleForms.some((form) => form.id === DEMO_FORM_ID);
  const shouldRequireProjectSelection = hasAdminAccess && projectScopeActive && !selectedProject;
  const activeStreamLabel =
    streamItems.find((stream) => stream.id === selectedStreamId)?.label ?? "All Signals";
  const visibleUnreadCount = visibleSignals.filter(
    (record) => record.submission.status === "unread",
  ).length;
  const selectedPendingVisibleCount = visibleSignals.filter((record) =>
    selectedPendingSignalIds.includes(record.submission.id),
  ).length;
  const visiblePendingSignalIds = visibleSignals
    .filter((record) => record.submission.pendingOnchainRegistration)
    .map((record) => record.submission.id);
  const allVisiblePendingSelected =
    visiblePendingSignalIds.length > 0 &&
    visiblePendingSignalIds.every((signalId) => selectedPendingSignalIds.includes(signalId));
  const bulkDecryptableVisibleSignals = useMemo(
    () =>
      visibleSignals.filter(
        (record) =>
          record.submission.isEncrypted &&
          !decryptedSignalsById[record.submission.id] &&
          !hasPrivateSignalPayloadIssue(record.submission) &&
          canAttemptPrivateSignalDecrypt(record.form, wallet.accountAddress, capabilityProfile),
      ),
    [wallet.accountAddress, capabilityProfile, decryptedSignalsById, visibleSignals],
  );
  const lockedVisibleSignalsCount = visibleSignals.filter(
    (record) => record.submission.isEncrypted && !decryptedSignalsById[record.submission.id],
  ).length;
  const insightsRecords = useMemo(
    () =>
      selectedFormId === "all"
        ? allSignals
        : allSignals.filter((record) => record.form.id === selectedFormId),
    [allSignals, selectedFormId],
  );
  const insightsCounts = useMemo(
    () => ({
      unread: insightsRecords.filter((record) => record.submission.status === "unread").length,
      needsReview: insightsRecords.filter((record) => record.submission.status !== "archived").length,
      encrypted: insightsRecords.filter((record) => record.submission.isEncrypted).length,
    }),
    [insightsRecords],
  );
  const nodeDirectoryItems = useMemo(() => {
    const normalizedSearch = nodeSearch.trim().toLowerCase();
    const accessibleFormIdSet = new Set(accessibleForms.map((form) => form.id));
    const allFormsItem = {
      id: "all",
      title: t("allSignalNodes"),
      submissionCount: allSignals.length,
      unreadCount: signalIndex.counts.unread,
      onchainFormId: undefined,
      isOnchain: false,
      isLegacyDemo: false,
      canDelete: false,
      canRegisterOnSui: false,
      isAccessible: true,
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
        onchainFormId: form.onchainFormId,
        isOnchain: typeof form.onchainFormId === "number",
        isLegacyDemo: !form.ownerAddress,
        canDelete: canDeleteForm(form),
        canRegisterOnSui: canRegisterNodeOnSui(form),
        isAccessible: accessibleFormIdSet.has(form.id),
      }));
    return [allFormsItem, ...formItems];
  }, [
    accessibleForms,
    allSignals.length,
    canDeleteForm,
    canRegisterNodeOnSui,
    nodeSearch,
    signalIndex.counts.unread,
    t,
    unreadCountByFormId,
  ]);

  const deletableNodeIds = useMemo(
    () => nodeDirectoryItems.filter((item) => item.id !== "all" && item.canDelete).map((item) => item.id),
    [nodeDirectoryItems],
  );

  if (loading && !loadingRecoveryVisible) {
    return <InboxLoadingPanel title={t("loadingResearchLab")} body={t("loadingSignalInboxBody")} />;
  }

  if (loadingRecoveryVisible) {
    return (
      <InboxRecoveryPanel
        title="Workspace recovery is taking too long."
        body="DeepSignal stopped waiting on the spinner so you can recover the inbox state."
        onRetry={() => {
          setLoadingRecoveryVisible(false);
          void loadConsole();
        }}
      />
    );
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
      hasWallet={Boolean(wallet.accountAddress)}
      access={accessState}
      deniedBody={capabilityProfile.isConfigured ? t("reviewConsoleCapabilityRequirement") : undefined}
    >
      <section className="stack">
        <AdminToast toast={toast} />
        {projectRecoveryNoticeOpen && selectedProject ? (
          <div className="node-directory-overlay" role="dialog" aria-modal="true" aria-labelledby="project-recovery-notice-title">
            <div className="node-directory-backdrop" />
            <section className="panel glow-panel node-directory-panel shortcut-help-panel">
              <div className="signal-detail-heading">
                <div>
                  <p className="eyebrow">{t("signalRegistryTitle")}</p>
                  <h2 id="project-recovery-notice-title">{t("projectRecoveryNoticeTitle")}</h2>
                  <p className="muted">
                    {t("projectRecoveryNoticeWalrusOnlyBody", {
                      count: walrusOnlyProjectForms.length,
                    })}
                  </p>
                </div>
              </div>
              <div className="inline-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setProjectRecoveryNoticeOpen(false);
                    setNodeDirectoryOpen(true);
                  }}
                >
                  {t("projectRecoveryNoticeOpenNodes")}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={acknowledgeProjectRecoveryNotice}
                >
                  {t("projectRecoveryNoticeDismiss")}
                </button>
              </div>
            </section>
          </div>
        ) : null}
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

        {showGuidedOnboarding ? (
          <SignalInboxOnboardingHero
            state={onboardingState}
            projectName={selectedProject?.name ?? null}
            projects={projects}
            selectedProjectId={selectedProjectId}
            selectProject={selectProject}
            onRevealCreateProject={() => revealProjectSettingsTools("create")}
            onRevealConnectProject={() => revealProjectSettingsTools("connect")}
            highlightCreateFormCta={highlightCreateFormCta}
          />
        ) : (
          <section className="panel glow-panel workspace-hero workspace-hero-compact desktop-signal-inbox-hero">
            <div className="workspace-hero-main workspace-overview-shell">
              <div className="workspace-hero-copy">
                <p className="eyebrow">{sessionStatusLabel}</p>
                <h1>{hasAdminAccess && selectedProject ? selectedProject.name : t("openInboxCta")}</h1>
                <p className="lede">{t("signalInboxFastLaneBody")}</p>
                <div className="workspace-hero-meta">
                  {workspaceMetaItems.map((item) => (
                    <span key={item} className="workspace-meta-item">
                      {item}
                    </span>
                  ))}
                  {isLoadingCapabilities ? (
                    <span className="workspace-meta-item">{t("checkingWalletAccess")}</span>
                  ) : null}
                  <span className="workspace-meta-item">{sessionStatusLabel}</span>
                </div>
              </div>

              <aside className="workspace-action-dock">
                <WorkspaceShortcutBar
                  className="workspace-dock-actions"
                  hasAdminAccess={hasProjectManagementAccess}
                  selectedProjectName={selectedProject?.name ?? null}
                  selectedProjectId={selectedProjectId}
                  projects={projects}
                  highlightCreateFormCta={highlightCreateFormCta}
                  onSelectProject={selectProject}
                  onRevealCreateProject={() => revealProjectSettingsTools("create")}
                  onRevealConnectProject={() => revealProjectSettingsTools("connect")}
                />
              </aside>
            </div>
          </section>
        )}

        {hasAdminAccess && !showGuidedOnboarding ? (
          <AdminWorkspaceTabs activeTab={activeWorkspaceTab} onSelectTab={setWorkspaceTab} />
        ) : null}

        {showGuidedOnboarding ? (
          onboardingState === "create-signal" ? (
            <EmptyState variant="abyss" className="signal-inbox-onboarding-empty-state">
              <p className="eyebrow">{t("inboxEmptyEyebrow")}</p>
              <h2>{t("signalInboxOnboardingNoSignalsTitle")}</h2>
              <p>{t("signalInboxOnboardingNoSignalsBody")}</p>
            </EmptyState>
          ) : null
        ) : activeWorkspaceTab === "activity" && hasAdminAccess ? (
          <WorkspaceActivityLog events={activityEvents} />
        ) : activeWorkspaceTab === "insights" && hasAdminAccess ? (
          <WorkspaceInsights
            totalSignals={insightsRecords.length}
            unreadSignals={insightsCounts.unread}
            needsReviewSignals={insightsCounts.needsReview}
            encryptedSignals={insightsCounts.encrypted}
            records={insightsRecords}
            unlockedSignalsById={decryptedSignalsById}
          />
        ) : activeWorkspaceTab === "members" && hasAdminAccess ? (
          <MemberDirectorySection capabilityProfile={capabilityProfile} readOnly />
        ) : accessibleForms.length === 0 &&
          (!hasAdminAccess ||
            !selectedProject ||
            (selectedProject.formsCount === 0 && selectedProject.signalsCount === 0)) ? (
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
            title={selectedProject?.name ?? t("signalInboxTitle")}
            sessionLabel={sessionStatusLabel}
            activeScopeLabel={activeScopeLabel}
            viewScope={signalViewScope}
            onViewScopeChange={setSignalViewScope}
            canUseProjectScope={canUseProjectScope}
            allSignalsScopeLabel={signalScopeAllLabel}
            projectSignalsScopeLabel={signalScopeProjectLabel}
            visibleCountLabel={t("visibleSignalsLabel", { count: visibleSignals.length })}
            unreadCountLabel={t("unreadBadge", { count: visibleUnreadCount })}
            emptyContent={(
              <EmptyState variant="abyss">
                <p className="eyebrow">{t("inboxEmptyEyebrow")}</p>
                <h2>
                  {!hasAdminAccess
                    ? t("sendTestSignalToStartReviewTitle")
                    : shouldRequireProjectSelection
                    ? t("chooseProjectFirstTitle")
                    : accessibleForms.length === 0
                      ? t("createFirstSignalFormTitle")
                      : t("sendTestSignalToStartReviewTitle")}
                </h2>
                <p>
                  {!hasAdminAccess
                    ? t("sendTestSignalToStartReviewBody")
                    : shouldRequireProjectSelection
                    ? t("chooseProjectFirstBody")
                    : accessibleForms.length === 0
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
            sortOrder={signalSortOrder}
            onSortOrderChange={setSignalSortOrder}
            visibleSignals={visibleSignals}
            selectedRecord={hasExplicitSelectedRecord ? selectedRecord : null}
            unlockedSignalId={detailAnswers && selectedRecord ? selectedRecord.submission.id : null}
            onSelectSignal={handleSelectMobileSignal}
            onQuickAction={handleQuickAction}
            searchPlaceholder={t("searchSignalsPlaceholder")}
            accessibleForms={accessibleForms}
            selectedFormId={selectedFormId}
            onSelectForm={setSelectedFormId}
            unreadCountByFormId={unreadCountByFormId}
            allSignalsCount={allSignals.length}
            totalUnreadCount={signalIndex.counts.unread}
            allSignalNodesLabel={t("allSignalNodes")}
            responseDeadlineLabels={responseDeadlineLabels}
            openNodeDirectoryLabel={t("openNodeDirectory")}
            onOpenNodeDirectory={() => setNodeDirectoryOpen(true)}
            activeNodeSummary={t("activeNodeSummary", { count: accessibleForms.length })}
            onExportAllFormCsv={handleOpenFormAllCsvExportReview}
            t={t}
            hasAdminAccess={hasAdminAccess}
            selectedProjectName={selectedProject?.name ?? null}
            highlightCreateFormCta={highlightCreateFormCta}
            onOpenProjectSettings={openAdvancedProjectSettings}
            onJumpToReview={jumpToReviewWorkspace}
            onRevealCreateProject={() => revealProjectSettingsTools("create")}
            onRevealConnectProject={() => revealProjectSettingsTools("connect")}
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
                <SignalChannelSelector
                  accessibleForms={accessibleForms}
                  selectedFormId={selectedFormId}
                  onSelectForm={(formId) => {
                    setSelectedFormId(formId);
                    scrollToReviewPanel("signals");
                  }}
                  unreadCountByFormId={unreadCountByFormId}
                  allSignalsCount={allSignals.length}
                  totalUnreadCount={signalIndex.counts.unread}
                  activeScopeLabel={activeScopeLabel}
                  allSignalNodesLabel={t("allSignalNodes")}
                  responseDeadlineLabels={responseDeadlineLabels}
                  openNodeDirectoryLabel={t("openNodeDirectory")}
                  onOpenNodeDirectory={() => setNodeDirectoryOpen(true)}
                  activeNodeSummary={t("activeNodeSummary", { count: accessibleForms.length })}
                  onExportAllFormCsv={handleOpenFormAllCsvExportReview}
                />
                <div className="signal-workbench-meta">
                  <span className="signal-chip">{t("visibleSignalsLabel", { count: visibleSignals.length })}</span>
                  <span className="signal-chip signal-chip-soft">{t("unreadBadge", { count: visibleUnreadCount })}</span>
                </div>
                <div className="signal-workbench-controls">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void loadConsole()}
                    disabled={loading}
                  >
                    {loading ? t("refreshingLabel") : t("checkInbox")}
                  </button>
                  {canUseProjectScope ? (
                    <button
                      type="button"
                      className="ghost-button signal-scope-action-button"
                      onClick={() => setSignalViewScope(projectScopeActive ? "all" : "project")}
                    >
                      {signalScopeActionLabel}
                    </button>
                  ) : null}
                  {DEMO_FLOW_VISIBLE ? (
                    <button
                      type="button"
                      className={isRunningDemoFlow ? "ghost-button" : "primary-button"}
                      onClick={() => void handleRunDemoFlow()}
                      disabled={isRunningDemoFlow}
                    >
                      {isRunningDemoFlow
                        ? t("demoFlowRunning")
                        : hasDemoWorkspace
                          ? t("demoFlowRerun")
                          : t("runDemoFlow")}
                    </button>
                  ) : null}
                  <span className="signal-chip signal-chip-soft">{activeScopeLabel}</span>
                  <label className="review-sort-control">
                    <span className="sr-only">{t("sortInboxSrOnly")}</span>
                    <select
                      value={signalSortOrder}
                      onChange={(event) => setSignalSortOrder(event.target.value as SignalSortOrder)}
                    >
                      <option value="default">{getSortLabel("default", t)}</option>
                      <option value="newest">{getSortLabel("newest", t)}</option>
                      <option value="oldest">{getSortLabel("oldest", t)}</option>
                      <option value="priority">{getSortLabel("priority", t)}</option>
                      <option value="unread">{getSortLabel("unread", t)}</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
            {DEMO_FLOW_VISIBLE ? (
              <section className="demo-flow-panel" aria-label={t("demoFlowPanelTitle")}>
                <div className="demo-flow-panel-header">
                  <div className="demo-flow-panel-copy">
                    <p className="eyebrow">{t("demoFlowPanelEyebrow")}</p>
                    <h3>{t("demoFlowPanelTitle")}</h3>
                    <p className="muted">{t("demoFlowPanelBody")}</p>
                  </div>
                  <div className="demo-flow-panel-actions">
                    {hasDemoWorkspace ? (
                      <span className="signal-chip signal-chip-soft">{t("demoFlowReadyBadge")}</span>
                    ) : null}
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setIsDemoGuideOpen((current) => !current)}
                      aria-expanded={isDemoGuideOpen}
                    >
                      {isDemoGuideOpen ? t("hideDemoGuide") : t("showDemoGuide")}
                    </button>
                  </div>
                </div>
                {isDemoGuideOpen ? (
                  <ol className="demo-flow-steps">
                    <li>{t("demoFlowStep1")}</li>
                    <li>{t("demoFlowStep2")}</li>
                    <li>{t("demoFlowStep3")}</li>
                    <li>{t("demoFlowStep4")}</li>
                    <li>{t("demoFlowStep5")}</li>
                    <li>{t("demoFlowStep6")}</li>
                  </ol>
                ) : null}
              </section>
            ) : null}

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
                  visibleUnreadCount={visibleUnreadCount}
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
                  <div className="signal-column-status-stack">
                    <span className="signal-chip signal-chip-soft">{t("resultsLabel", { count: visibleSignals.length })}</span>
                    <span className="signal-chip signal-chip-soft">{t("pendingSuiResultsLabel", { count: pendingSignals.length })}</span>
                    {hasAdminAccess ? (
                      <div className="bulk-decrypt-toolbar" aria-live="polite">
                        <button
                          type="button"
                          className={`bulk-decrypt-button ${
                            bulkDecryptableVisibleSignals.length > 0 ? "primary-button" : "ghost-button is-complete"
                          }`}
                          disabled={
                            bulkDecryptableVisibleSignals.length === 0 ||
                            bulkDecrypting ||
                            decrypting ||
                            decryptInFlightRef.current ||
                            bulkDecryptInFlightRef.current
                          }
                          onClick={() => void handleDecryptRecords(bulkDecryptableVisibleSignals)}
                        >
                          {bulkDecrypting
                            ? t("bulkDecryptingSignals")
                            : bulkDecryptableVisibleSignals.length > 0
                              ? t("bulkDecryptVisibleSignals", { count: bulkDecryptableVisibleSignals.length })
                              : t("bulkDecryptVisibleSignalsComplete")}
                        </button>
                        <span>
                          {bulkDecrypting || bulkDecryptProgress.total > 0
                            ? t("bulkDecryptProgress", {
                                completed: bulkDecryptProgress.completed,
                                failed: bulkDecryptProgress.failed,
                                total: bulkDecryptProgress.total,
                              })
                            : lockedVisibleSignalsCount > 0
                              ? t("bulkDecryptLockedVisibleSignals", { count: lockedVisibleSignalsCount })
                              : t("bulkDecryptNoLockedVisibleSignals")}
                        </span>
                        {bulkDecryptStatusMessage ? <small>{bulkDecryptStatusMessage}</small> : null}
                        {bulkDecryptError ? <small className="is-error">{bulkDecryptError}</small> : null}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="ghost-button signal-shortcut-help-trigger"
                      onClick={() => setShowShortcutHelp(true)}
                      aria-label={t("shortcutHelpTitle")}
                    >
                      ?
                    </button>
                  </div>
                  <input
                    ref={signalSearchInputRef}
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
                    <div className="pending-sui-actions">
                      <button
                        type="button"
                        className={`ghost-button pending-sui-select-all-button ${allVisiblePendingSelected ? "is-active" : ""}`}
                        disabled={visiblePendingSignalIds.length === 0 || registeringSignalIds.length > 0}
                        onClick={() => {
                          setPendingSelections(visiblePendingSignalIds, !allVisiblePendingSelected);
                        }}
                      >
                        {allVisiblePendingSelected ? t("clearSelectionLabel") : t("selectAllLabel")}
                      </button>
                      <button
                        type="button"
                        className="ghost-button sui-register-button"
                        disabled={selectedPendingSignalIds.length === 0 || registeringSignalIds.length > 0}
                        onClick={() => void handleRegisterPendingSignals()}
                      >
                        {registeringSignalIds.length > 0
                          ? t("registeringOnSui")
                          : t("registerSelectedOnSui", { count: selectedPendingVisibleCount })}
                      </button>
                    </div>
                  </div>
                  <p className="muted">{t("optionalProofQueueBody")}</p>
                </section>
              ) : null}

              {visibleSignals.length === 0 ? (
                <EmptyState className="signal-inbox-empty-state" variant="abyss">
                  <p className="eyebrow">{t("inboxEmptyEyebrow")}</p>
                  <h2>
                    {!hasAdminAccess
                      ? t("sendTestSignalToStartReviewTitle")
                      : shouldRequireProjectSelection
                      ? t("chooseProjectFirstTitle")
                      : accessibleForms.length === 0
                        ? t("createFirstSignalFormTitle")
                        : t("sendTestSignalToStartReviewTitle")}
                  </h2>
                  <p>
                    {!hasAdminAccess
                      ? t("sendTestSignalToStartReviewBody")
                      : shouldRequireProjectSelection
                      ? t("chooseProjectFirstBody")
                      : accessibleForms.length === 0
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
                          target="_blank"
                          rel="noreferrer"
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
                    const storageBlobId = getSignalStorageBlobId(submission);
                    const storageLabel = getStorageBadgeLabel(storageBlobId);
                    const persistenceState = getSignalPersistenceState(submission);
                    const storageState = getSignalStorageState(submission);
                    const isOnchainRecoverySnapshot = isOnchainRecoveredSignal(submission);
                    const subject = isOnchainRecoverySnapshot
                      ? t("onchainRecoverySnapshotTitle")
                      : getSignalSubject(submission);
                    const preview = isOnchainRecoverySnapshot
                      ? t("onchainRecoverySnapshotHint")
                      : submission.isEncrypted
                        ? t("encryptedPrivateSignalUnlockHint")
                        : getSignalPreview(submission);
                    const isAnonymousSignal = getSubmissionRespondentMeta(submission).isAnonymous;
                    const isPendingSui = Boolean(submission.pendingOnchainRegistration);
                    const isSelectedForSui = selectedPendingSignalIds.includes(submission.id);
                    const isLocalOnlySignal = storageState === "local_only";
                    const isSelectedSignal = selectedRecord?.submission.id === submission.id;
                    const isUnlockedSignal = Boolean(decryptedSignalsById[submission.id]) || (isSelectedSignal && Boolean(detailAnswers));
                    const readStateLabel =
                      submission.status === "unread"
                        ? t("statusUnread")
                        : submission.status === "read"
                          ? t("statusRead")
                          : t("statusArchived");
                    const priorityLabel =
                      submission.priority === "high"
                        ? t("priorityHigh")
                        : submission.priority === "medium"
                          ? t("priorityMedium")
                          : t("priorityLow");
                    const lockStateLabel = submission.isEncrypted
                      ? isUnlockedSignal
                        ? t("unlockedSignalState")
                        : t("lockedSignalState")
                      : t("openSignalState");
                    const persistenceLabel =
                      persistenceState === "not_available" ? null : getSignalPersistenceLabel(persistenceState);
                    const hasPayloadIssue = hasPrivateSignalPayloadIssue(submission);
                    const hasNotableStatusBadge =
                      isPendingSui ||
                      isSelectedForSui ||
                      isLocalOnlySignal ||
                      submission.attachments.length > 0 ||
                      hasPayloadIssue;
                    return (
                      <SignalCard
                        key={submission.id}
                        ref={(node) => {
                          signalCardRefs.current[submission.id] = node;
                        }}
                        t={t}
                        submission={submission}
                        category={category}
                        formTitle={form.title}
                        subject={subject}
                        preview={preview}
                        triageStatusLabel={getTriageStatusLabel(submission.triageStatus)}
                        priorityLabel={priorityLabel}
                        lockStateLabel={lockStateLabel}
                        readStateLabel={readStateLabel}
                        persistenceLabel={persistenceLabel}
                        storageLabel={
                          storageState === "local_only" || storageState === "walrus_synced"
                            ? storageLabel
                            : undefined
                        }
                        persistenceState={persistenceState}
                        reviewerHint={getReviewerPresenceText(submission, wallet.accountAddress)}
                        needsFollowUp={hasNeedsFollowUp(submission)}
                        isSelectedSignal={isSelectedSignal}
                        isPendingSui={isPendingSui}
                        isSelectedForSui={isSelectedForSui}
                        isAnonymousSignal={isAnonymousSignal}
                        isUnlockedSignal={isUnlockedSignal}
                        isOnchainRecoverySnapshot={isOnchainRecoverySnapshot}
                        hasPayloadIssue={hasPayloadIssue}
                        hasNotableStatusBadge={hasNotableStatusBadge}
                        isRegistering={isRegisteringSignal(submission.id)}
                        onSelect={() => {
                          handleSelectDesktopSignal(submission.id);
                          scrollToReviewPanel("detail");
                        }}
                        onKeySelect={() => {
                          handleSelectDesktopSignal(submission.id);
                          scrollToReviewPanel("detail");
                        }}
                        onTogglePending={() => {
                          togglePendingSelection(submission.id);
                        }}
                        onRegisterPending={() => {
                          void handleRegisterPendingSignals([submission.id]);
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </section>

            <article ref={signalDetailPanelRef} className="panel signal-detail-column">
              {!selectedRecord ? (
                <EmptyState
                  className="signal-detail-empty-state"
                  variant="abyss"
                  animated={false}
                  showVisual={false}
                >
                  <p className="eyebrow">{t("signalDetailTitle")}</p>
                  <h2>{t("noSignalSelectedTitle")}</h2>
                  <p>{t("noSignalSelectedBody")}</p>
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
                      <p className="eyebrow">{t("reviewConsoleEyebrow")}</p>
                      <h2>{getSignalSubject(selectedRecord.submission)}</h2>
                      <p className="muted">
                        {selectedRecord.form.title} / {formatDate(selectedRecord.submission.createdAt)}
                      </p>
                      <p className="muted">{t("reviewConsoleBody")}</p>
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
                        className={`ghost-button ${isReviewerFocusMode ? "is-active" : ""}`}
                        onClick={() => setIsReviewerFocusMode((current) => !current)}
                      >
                        {isReviewerFocusMode ? t("showMoreToggle") : t("focusReviewToggle")}
                      </button>
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
                      <span className={`signal-chip ${detailAnswers ? "signal-chip-accent" : ""}`}>
                        {detailAnswers
                          ? t("privateSignalUnlockedStatus")
                          : selectedRecord.submission.isEncrypted
                            ? t("encryptedPrivateSignalStatus")
                            : t("openSubmissionLabel")}
                      </span>
                      {selectedRecordHasPayloadIssue ? (
                        <span className="signal-chip">
                          {t("privateSignalPayloadMissingStatus")}
                        </span>
                      ) : null}
                      {selectedReviewerPresence ? (
                        <span className="signal-chip">
                          {selectedReviewerDisplayLabel || selectedReviewerPresence.fullLabel}
                        </span>
                      ) : null}
                      {selectedNeedsFollowUp ? (
                        <span className="signal-chip signal-chip-accent">{t("needsFollowUpLabel")}</span>
                      ) : null}
                    </div>
                    {selectedSecondaryMetaItems.length > 0 && !isReviewerFocusMode ? (
                      <details
                        className="inspector-panel signal-detail-header-details"
                        open={detailSectionsState.headerDetailsOpen}
                        onToggle={(event) => {
                          setDetailSectionOpen("headerDetailsOpen", (event.currentTarget as HTMLDetailsElement).open);
                        }}
                      >
                        <summary>
                          <span>
                            <p className="eyebrow">{t("moreDetailsLabel")}</p>
                            <strong>{t("secondaryMetadataTitle")}</strong>
                          </span>
                          <span className="inspector-summary">{selectedSecondaryMetaItems.length}</span>
                        </summary>
                        <div className="inspector-panel-body">
                          <div className="signal-badge-row signal-badge-row-compact">
                            {selectedSecondaryMetaItems.map((item) => (
                              <span key={item} className="signal-chip signal-chip-soft">{item}</span>
                            ))}
                          </div>
                        </div>
                      </details>
                    ) : null}
                    <section className="answer-card review-trust-summary-card">
                      {selectedReviewContextChips.length > 0 ? (
                        <div className="signal-badge-row signal-badge-row-compact" aria-label="Review context">
                          {selectedReviewContextChips.map((chip) => (
                            <span
                              key={chip.label}
                              className={`signal-chip ${
                                chip.tone === "warn"
                                  ? "signal-chip-warn"
                                  : chip.tone === "accent"
                                    ? "signal-chip-accent"
                                    : "signal-chip-soft"
                              }`}
                            >
                              {chip.label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </section>
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

                  <div
                    className={`signal-detail-sections review-primary-sections ${
                      selectedRecordNeedsDecrypt ? "" : "is-review-ready"
                    }`}
                  >
                    <section className="answer-card original-signal-section">
                      <WorkspaceSectionToggle
                        eyebrow={t("originalSignalTitle")}
                        title={t("originalSignalTitle")}
                        detail={t("originalSignalBody")}
                        open={detailSectionsState.originalSignalOpen}
                        onToggle={() =>
                          setDetailSectionOpen("originalSignalOpen", !detailSectionsState.originalSignalOpen)
                        }
                        trailing={
                          detailAnswers ? (
                            <span className="signal-chip signal-chip-soft">{t("privateSignalUnlockedStatus")}</span>
                          ) : selectedRecordNeedsDecrypt ? (
                            <span className="signal-chip">{t("encryptedPrivateSignalStatus")}</span>
                          ) : null
                        }
                      />
                      {detailSectionsState.originalSignalOpen ? (
                        <>
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
                                      <StorageProof
                                        blobId={selectedRecordEncryptedBlobId}
                                        proof={
                                          selectedRecord.submission.encryptedWalrusProof ??
                                          selectedRecord.submission.walrusProof
                                        }
                                        compact
                                      />
                                    </>
                                  ) : null}
                                </div>
                              )}
                              {selectedRecord.form.fields
                                .filter((field) => !isAttachmentFieldType(field.type))
                                .map((field, index) => (
                                  <div key={field.id} className="answer-line" data-question-index={`Q${index + 1}`}>
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
                            <p className="muted">{t("noResponseContentYet")}</p>
                          )}
                          </div>
                          {!isReviewerFocusMode ? (
                            <div className="original-signal-block">
                              <WorkspaceSectionToggle
                                eyebrow={t("attachments")}
                                title={t("attachments")}
                                detail={
                                  selectedRecordNeedsDecrypt
                                    ? t("attachmentsHiddenUntilUnlocked")
                                    : detailAttachments.length === 0
                                      ? t("noAttachments")
                                      : undefined
                                }
                                open={detailSectionsState.attachmentsOpen}
                                onToggle={() =>
                                  setDetailSectionOpen("attachmentsOpen", !detailSectionsState.attachmentsOpen)
                                }
                                trailing={
                                  detailAttachments.length > 0 ? (
                                    <span className="signal-chip signal-chip-soft">{detailAttachments.length}</span>
                                  ) : null
                                }
                              />
                              {detailSectionsState.attachmentsOpen ? (
                                selectedRecordNeedsDecrypt ? (
                                  <p className="muted">{t("attachmentsHiddenUntilUnlocked")}</p>
                                ) : detailAttachments.length === 0 ? (
                                  <p className="muted">{t("noAttachments")}</p>
                                ) : (
                                  <SignalAttachmentList
                                    attachments={detailAttachments}
                                    attachmentPreviews={attachmentPreviews}
                                  />
                                )
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </section>

                    {selectedRecordNeedsDecrypt && !shouldHideLockedDetailBeforeReview ? (
                      <PrivateSignalUnlockCard
                        onUnlock={() => void handleDecrypt()}
                        onClearDebugCache={() => void handleClearDebugPolicyCache()}
                        isDecrypting={decrypting || decryptInFlightRef.current}
                        isUnlocked={Boolean(detailAnswers)}
                        actionLabel={t("decrypt")}
                        unlockState={decryptState}
                        statusMessage={decryptStatusMessage}
                        errorMessage={decryptError}
                        diagnostics={decryptDiagnostics}
                        disabledReason={selectedRecordUnlockDisabledReason}
                        actionDisabled={Boolean(selectedRecordUnlockDisabledReason)}
                        supportContent={
                          <>
                            <strong>{t("privateSignalUnlockReviewNote")}</strong>
                            <p className="muted">
                              {t("walletApprovalReuseNotice", { minutes: realSealSessionTtlMinutes })}
                            </p>
                          </>
                        }
                      >
                        {!isLocalFallbackBlob(selectedRecord.submission.encryptedBlobId) ? (
                          <StorageProof
                            blobId={selectedRecord.submission.encryptedBlobId}
                            proof={selectedRecord.submission.encryptedWalrusProof ?? selectedRecord.submission.walrusProof}
                            compact
                          />
                        ) : null}
                      </PrivateSignalUnlockCard>
                    ) : null}

                    <ReviewResultCard
                      t={t}
                      submission={selectedRecord.submission}
                      hasSavedReviewResult={selectedHasSavedReviewResult}
                      signalValueSummary={getSignalValueSummary(selectedRecord.submission.signalValue, t)}
                      signalValueStars={selectedSignalValueStars}
                      publicDecisionLabel={selectedPublicDecisionLabel}
                      isOnRoadmap={isSelectedRecordOnRoadmap}
                      reviewResultItems={selectedReviewResultItems}
                      reviewSummaryBadges={selectedReviewSummaryBadges}
                      needsFollowUp={selectedNeedsFollowUp}
                      roadmapUrl={selectedRoadmapUrl}
                    />
                  </div>

                  {!isReviewerFocusMode ? (
                  <div className="signal-detail-sections review-secondary-sections">
                    <SignalTimelineSection
                      open={detailSectionsState.signalTimelineOpen}
                      onToggle={() => setDetailSectionOpen("signalTimelineOpen", !detailSectionsState.signalTimelineOpen)}
                      entries={selectedSignalTimelineEntries}
                      currentState={selectedSignalTimelineCurrentState}
                      timelineNow={timelineNow}
                      getPhaseLabel={getTimelinePhaseLabel}
                    />

                    <SecondaryInspector
                      t={t}
                      selectedRecord={selectedRecord}
                      csvExportScopeLabel={csvExportScopeLabel}
                      csvExportShortScopeLabel={csvExportShortScopeLabel}
                      csvExportCount={csvExportCount}
                      csvExportIncludesDecryptedData={csvExportIncludesDecryptedData}
                      csvExportScope={csvExportScope}
                      csvSortOrder={csvSortOrder}
                      onCsvExportScopeChange={setCsvExportScope}
                      onCsvSortOrderChange={setCsvSortOrder}
                      onExportJson={() => exportSubmissionJson(selectedRecord.form, selectedRecord.submission)}
                      onOpenCsvExportReview={handleOpenCsvExportReview}
                      storageProofOpen={detailSectionsState.storageProofOpen}
                      onStorageProofOpenChange={(open) => setDetailSectionOpen("storageProofOpen", open)}
                      advancedMetadataOpen={detailSectionsState.advancedMetadataOpen}
                      onAdvancedMetadataOpenChange={(open) => setDetailSectionOpen("advancedMetadataOpen", open)}
                      relatedSignalsOpen={detailSectionsState.relatedSignalsOpen}
                      onRelatedSignalsOpenChange={(open) => setDetailSectionOpen("relatedSignalsOpen", open)}
                      storageMode={storageRuntime.mode}
                      isRegisteringSelectedSignal={isRegisteringSignal(selectedRecord.submission.id)}
                      onRegisterSelectedSignal={() => {
                        void handleRegisterPendingSignals([selectedRecord.submission.id]);
                      }}
                      detailLegacyUnencrypted={detailLegacyUnencrypted}
                      detailAnswersPresent={Boolean(detailAnswers)}
                      hasAdminAccess={hasAdminAccess}
                      selectedRecordStoredOnWalrus={selectedRecordStoredOnWalrus}
                      privateReviewLabel={privateReviewLabel}
                      responseDeadlineValue={formatResponseDeadline(selectedRecord.form.responseDeadline, responseDeadlineLabels)}
                      walletAccessValue={getWalletAccessLabel(selectedRecord.form, wallet.accountAddress)}
                      pendingSuiRegistrationValue={
                        selectedRecord.submission.onchainStatus ??
                        (selectedRecord.submission.pendingOnchainRegistration
                          ? t("pendingSuiRegistration")
                          : t("offchainOnlyLabel"))
                      }
                      rpcProviderLabel={selectedRecordRpcProviderLabel}
                      rpcNetworkLabel={selectedRecordRpcNetworkLabel}
                      verificationRouteLabel={selectedRecordVerificationRouteLabel}
                      txDigest={selectedRecordTxDigest}
                      canDecrypt={Boolean(wallet.accountAddress)}
                      relatedSignals={relatedSignals}
                      selectedSignalId={selectedSignalId}
                      onSelectRelatedRecord={(record) => {
                        if (decryptInFlightRef.current) {
                          return;
                        }
                        handleSelectDesktopSignal(record.submission.id, { scrollIntoView: true });
                      }}
                    />
                  </div>
                  ) : null}
                </>
              )}
            </article>
          </div>
          </section>
          </>
        )}
        <div className="mobile-console-banner">{t("adminDesktopNotice")}</div>
      </section>
      <ReviewSessionModal
        open={reviewSessionOpen}
        selectedRecord={selectedRecord}
        dialogRef={reviewSessionDialogRef}
        primaryActionRef={reviewSessionPrimaryActionRef}
        onBackdropMouseDown={requestCloseReviewSession}
        onRequestClose={requestCloseReviewSession}
        onCompleteClose={forceCloseReviewSession}
        reviewSessionCurrentStep={reviewSessionCurrentStep}
        reviewSessionStepItems={reviewSessionStepItems}
        reviewSessionStep={reviewSessionStep}
        setReviewSessionStep={setReviewSessionStep}
        reviewSessionMobileTab={reviewSessionMobileTab}
        setReviewSessionMobileTab={setReviewSessionMobileTab}
        reviewStatusPillState={reviewStatusPillState}
        reviewStatusPillLabel={reviewStatusPillLabel}
        selectedRecordNeedsDecrypt={selectedRecordNeedsDecrypt}
        detailAnswers={detailAnswers}
        decrypting={decrypting}
        decryptState={decryptState}
        decryptStatusMessage={decryptStatusMessage}
        decryptError={decryptError}
        decryptDiagnostics={decryptDiagnostics}
        selectedRecordUnlockDisabledReason={selectedRecordUnlockDisabledReason}
        realSealSessionTtlMinutes={realSealSessionTtlMinutes}
        decryptInFlight={decryptInFlightRef.current}
        onDecrypt={() => void handleDecrypt()}
        onClearDebugCache={() => void handleClearDebugPolicyCache()}
        activeReviewDraft={activeReviewDraft}
        patchReviewDraft={patchReviewDraft}
        triageOptions={TRIAGE_STATUS_OPTIONS}
        getLocalizedTriageStatusLabel={(value) => getLocalizedTriageStatusLabel(value, t)}
        renderAnswerValue={renderAnswerValue}
        detailAttachments={detailAttachments}
        attachmentPreviews={attachmentPreviews}
        selectedReviewerDisplayLabel={selectedReviewerDisplayLabel}
        walletAccountAddress={wallet.accountAddress}
        selectedNeedsFollowUp={selectedNeedsFollowUp}
        saving={saving}
        onToggleNeedsFollowUp={() => void handleToggleNeedsFollowUp()}
        draftTriageStatus={draftTriageStatus}
        draftReviewStatus={draftReviewStatus}
        isDraftOnRoadmap={isDraftOnRoadmap}
        publicResultValue={reviewSessionPublicResultValue}
        canAdvanceReviewSession={canAdvanceReviewSession}
        hasReviewDraftChanges={hasReviewDraftChanges}
        hasSavedReviewResult={selectedHasSavedReviewResult}
        onSaveReview={saveActiveReviewDraft}
      />
      {projectModalMode ? (
        <ProjectWorkspaceModal
          mode={projectModalMode}
          projects={projects}
          selectedProjectId={selectedProjectId}
          projectCreateName={projectCreateName}
          manualProjectId={manualProjectId}
          isCreatingProject={isCreatingProject}
          projectState={projectState}
          createInputRef={projectCreateInputRef}
          connectInputRef={manualProjectInputRef}
          onSelectProject={handleSelectProjectFromModal}
          onProjectCreateNameChange={setProjectCreateName}
          onManualProjectIdChange={setManualProjectId}
          onCreateProject={handleCreateProjectFromModal}
          onConnectProject={handleConnectProjectFromModal}
          onClose={() => setProjectModalMode(null)}
          labels={{
            close: t("closeLabel"),
            cancel: t("cancel"),
            currentProject: t("currentProjectEyebrow"),
            selectedStatus: t("projectSelectedStatus"),
            noProjectSelectedStatus: t("noProjectSelectedStatus"),
            selectTitle: t("projectModalSelectTitle"),
            selectBody: t("projectModalSelectBody"),
            selectEmpty: t("projectModalSelectEmpty"),
            createTitle: t("projectModalCreateTitle"),
            createBody: t("projectModalCreateBody"),
            createPlaceholder: t("newProjectNamePlaceholder"),
            createButton: t("createProjectButton"),
            creatingLabel: t("creatingLabel"),
            connectTitle: t("projectModalConnectTitle"),
            connectBody: t("projectModalConnectBody"),
            connectPlaceholder: t("projectOrOwnerCapPlaceholder"),
            connectButton: t("connectLabel"),
            projectStats: (params) => t("projectModalProjectStats", params),
          }}
        />
      ) : null}
      {showShortcutHelp ? (
        <div className="node-directory-overlay" role="dialog" aria-modal="true" aria-labelledby="shortcut-help-title">
          <div className="node-directory-backdrop" onClick={() => setShowShortcutHelp(false)} />
          <section className="panel glow-panel node-directory-panel shortcut-help-panel">
            <div className="signal-detail-heading">
              <div>
                <p className="eyebrow">{t("signalInboxTitle")}</p>
                <h2 id="shortcut-help-title" ref={shortcutHelpHeadingRef} tabIndex={-1}>
                  {t("shortcutHelpTitle")}
                </h2>
                <p className="muted">{t("shortcutHelpBody")}</p>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowShortcutHelp(false)}
              >
                {t("closeLabel")}
              </button>
            </div>
            <div className="shortcut-help-list">
              {shortcutItems.map((item) => (
                <div key={item.keys} className="shortcut-help-row">
                  <strong>{item.keys}</strong>
                  <span>{item.description}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
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
                    {t("activeNodeSummary", { count: forms.length })}
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
                const registrationFeedback =
                  nodeRegistrationFeedback?.formId === item.id ? nodeRegistrationFeedback : null;
                const shouldShowRegistrationFeedback = Boolean(
                  registrationFeedback &&
                    (registrationFeedback.tone !== "success" || !item.isOnchain),
                );
                return (
                  <div key={item.id} className={`node-directory-row ${isSelected ? "is-active" : ""}`}>
                    <button
                      type="button"
                      className={`node-directory-item ${isSelected ? "is-active" : ""}`}
                      disabled={!item.isAccessible}
                      onClick={() => {
                        if (!item.isAccessible) {
                          return;
                        }
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
                          {item.isLegacyDemo
                            ? ` / ${t("legacyDemoForm")}`
                            : !item.isAccessible
                              ? ` / ${t("accessDeniedButton")}`
                              : ""}
                        </p>
                        {item.id !== "all" ? (
                          <div className="signal-badge-row signal-badge-row-compact">
                            {item.isOnchain ? (
                              <>
                                <span className="signal-chip signal-chip-soft">{t("registeredOnSuiLabel")}</span>
                                {typeof item.onchainFormId === "number" ? (
                                  <span className="signal-chip signal-chip-soft">
                                    {t("registryFormIdLabel")}: {item.onchainFormId}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <span className="signal-chip signal-chip-soft">{t("notRegisteredYet")}</span>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </button>
                    {item.id !== "all" && item.isAccessible ? (
                      <div className="node-directory-actions">
                        <button
                          type="button"
                          className="ghost-button node-directory-action-button"
                          onClick={() => {
                            setBeaconFormId(item.id);
                            setNodeDirectoryOpen(false);
                          }}
                        >
                          <OpenBeaconActionIcon />
                          <span className="node-directory-action-label">{t("openSignalBeacon")}</span>
                        </button>
                        {item.canRegisterOnSui ? (
                          <button
                            type="button"
                            className="ghost-button node-directory-action-button"
                            onClick={() => void handleRegisterNodeOnSui(item.id)}
                            disabled={registeringFormId === item.id || deletingVisibleNodes}
                          >
                            <RegisterNodeActionIcon />
                            <span className="node-directory-action-label">
                              {registeringFormId === item.id ? t("registeringLabel") : t("registerNodeOnSui")}
                            </span>
                          </button>
                        ) : null}
                        {item.canDelete ? (
                          <button
                            type="button"
                            className="ghost-button node-directory-action-button node-directory-delete"
                            onClick={() => void handleDelete(item.id)}
                            disabled={deletingVisibleNodes || deletingFormId === item.id}
                          >
                            <DeleteNodeActionIcon />
                            <span className="node-directory-action-label">
                              {deletingFormId === item.id ? t("deletingLabel") : t("deleteNode")}
                            </span>
                          </button>
                        ) : null}
                        {shouldShowRegistrationFeedback && registrationFeedback ? (
                          <p className={`node-directory-feedback is-${registrationFeedback.tone}`}>
                            {registrationFeedback.message}
                          </p>
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
