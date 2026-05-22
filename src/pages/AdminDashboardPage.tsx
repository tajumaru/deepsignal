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
import { BlobLink } from "../components/BlobLink";
import { EmptyState } from "../components/EmptyState";
import { FormattedAnswerValue } from "../components/FormattedAnswerValue";
import type { OperationsStatusItem } from "../components/OperationsStatusRail";
import { PrivateSignalUnlockCard } from "../components/PrivateSignalUnlockCard";
import { RichTextContent } from "../components/RichText";
import { SealStatusCard } from "../components/SealStatusCard";
import { ShareCard } from "../components/ShareCard";
import { SignalStatusBadges } from "../components/SignalStatusBadges";
import { SignalMetaChip, SignalMetaRow } from "../components/SignalMetaChip";
import { StorageProof } from "../components/StorageProof";
import { SuiAddressDisplay } from "../components/SuiAddressDisplay";
import { RelatedSignalsPanel } from "../components/RelatedSignalsPanel";
import { AdminOperationsStatus } from "../features/admin/components/AdminOperationsStatus";
import { AdminToast } from "../features/admin/components/AdminToast";
import { CsvExportConfirmationModal } from "../features/admin/components/CsvExportConfirmationModal";
import { SignalAttachmentList } from "../features/admin/components/SignalAttachmentList";
import { MailboxIcon, SignalChannelSelector, SignalStreamsNav } from "../features/admin/components/SignalStreamsNav";
import { useAdminToast } from "../features/admin/hooks/useAdminToast";
import { usePendingSuiRegistration } from "../features/admin/hooks/usePendingSuiRegistration";
import { usePrivateSignalDecrypt } from "../features/admin/hooks/usePrivateSignalDecrypt";
import { useProjectWorkspace } from "../features/admin/hooks/useProjectWorkspace";
import {
  useSignalInboxData,
  type FormWithCount,
  type SignalSortOrder,
  type SignalRecord,
  type StreamId,
} from "../features/admin/hooks/useSignalInboxData";
import { useAttachmentPreviews } from "../hooks/useAttachmentPreviews";
import { useAccessControl } from "../hooks/useAccessControl";
import { useReviewerDisplayLabel } from "../hooks/useReviewerDisplayLabel";
import { useSuiWallet } from "../hooks/useSuiWallet";
import { useI18n } from "../i18n";
import { isAttachmentFieldType, isLongTextLikeField } from "../lib/fieldTypes";
import {
  addressesMatch,
  canAdmin,
  canAttemptPrivateSignalDecrypt,
  canReview,
  getRoleLabel,
} from "../lib/adminAccess";
import {
  appendActivityEvents,
  createActivityEvent,
  getActivityActorRole,
  getSuiTransactionUrl,
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
  serializeReviewNotes,
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
import { getEncryptedPayloadAvailabilityLabel, hasDedicatedEncryptedPayloadBlob } from "../lib/encryptionDisplay";
import { getPublicFormPath, getPublicRoadmapPath } from "../lib/publicLinks";
import { triageStatusToOnchainStatus, updateSignalStatusOnChain } from "../lib/projectRegistry";
import { isSuiRateLimitError, shortAddress } from "../lib/sui";
import { clearDeepSignalPolicyCapabilityCache } from "../lib/debugCache";
import { formatResponseDeadline, type ResponseDeadlineLabels } from "../lib/responseDeadline";
import { getSubmissionRespondentMeta } from "../lib/respondentMeta";
import {
  getSignalPreview,
  getPrivateSignalPayloadState,
  getSignalPersistenceLabel,
  getSignalPersistenceState,
  getSignalSyncSummary,
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
import { flattenAnswer, formatDate, formatRelativeTime } from "../lib/utils";
import { handleRateLimitedRpcFallback, useRpcInfrastructure } from "../rpcInfrastructure";
import { deleteFormsFromLocalCache, getStorageRuntimeStatus } from "../storage/storageFactory";
import type { ActivityAction, ActivityEvent, FormSchema, Submission } from "../types";

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
type ReviewSaveStatus = "idle" | "saving" | "saved" | "skipped" | "error";
type ReviewSessionMobileTab = "answers" | "review";
type ReviewDraft = Pick<Submission, "status" | "triageStatus" | "priority" | "signalValue"> & {
  notes: string;
  reviewer: string;
};
type WorkspaceTab = "review" | "activity" | "insights" | "members";
type QuickActionId = "reviewing" | "resolve" | "publish" | "archive";
type KeyboardShortcutAction = QuickActionId | "next" | "previous" | "search" | "help";
interface UnlockedSignalSummary {
  answers: Record<string, unknown>;
}
interface SignalSummaryContentCount {
  question: string;
  answer: string;
  count: number;
  total: number;
}

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

function getActivityActionLabel(action: ActivityAction, t: TranslationFn) {
  switch (action) {
    case "form_created":
      return t("activityActionCreated");
    case "form_published":
      return t("activityActionPublished");
    case "form_updated":
      return t("activityActionUpdated");
    case "form_archived":
      return t("activityActionArchived");
    default:
      return t("activityActionUpdated");
  }
}

function getActivityActionClass(action: ActivityAction) {
  switch (action) {
    case "form_created":
      return "created";
    case "form_published":
      return "published";
    case "form_updated":
      return "updated";
    case "form_archived":
      return "archived";
    default:
      return "updated";
  }
}

function shortenSummaryText(text: string, maxLength = 88) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function normalizeReadableAnswer(value: unknown) {
  const answer = flattenAnswer(value).trim().replace(/\s+/g, " ");
  return answer && answer.toLowerCase() !== "no answer" ? answer : "";
}

function getReadableSummaryEntries(
  record: SignalRecord,
  t: TranslationFn,
  unlockedSignalsById?: Record<string, UnlockedSignalSummary>,
) {
  const answers =
    unlockedSignalsById?.[record.submission.id]
      ? unlockedSignalsById[record.submission.id].answers
      : record.submission.isEncrypted || record.submission.status === "archived"
        ? null
        : record.submission.answers;

  if (!answers) {
    return [];
  }

  const entries = record.form.fields
    .map((field) => ({
      question: field.label.trim() || field.id,
      answer: normalizeReadableAnswer(answers[field.id]),
    }))
    .filter((entry) => entry.answer);

  if (entries.length > 0) {
    return entries;
  }

  const preview = normalizeReadableAnswer(getSignalPreview(record.submission));
  return preview ? [{ question: t("workspaceSignalFallbackQuestion"), answer: preview }] : [];
}

function buildSignalSummary(
  records: SignalRecord[],
  t: TranslationFn,
  unlockedSignalsById?: Record<string, UnlockedSignalSummary>,
) {
  const encryptedWaitingCount = records.filter(
    (record) =>
      record.submission.isEncrypted &&
      record.submission.status !== "archived" &&
      !unlockedSignalsById?.[record.submission.id],
  ).length;
  const contentCounts = new Map<string, SignalSummaryContentCount>();
  const questionTotals = new Map<string, number>();

  records.forEach((record) => {
    const entries = getReadableSummaryEntries(record, t, unlockedSignalsById);
    const countedQuestions = new Set<string>();
    entries.forEach((entry) => {
      const question = entry.question.trim();
      const answer = entry.answer.trim();
      if (!question || !answer) {
        return;
      }
      const questionKey = question.toLowerCase();
      if (!countedQuestions.has(questionKey)) {
        countedQuestions.add(questionKey);
        questionTotals.set(questionKey, (questionTotals.get(questionKey) ?? 0) + 1);
      }
      const key = `${question.toLowerCase()}::${answer.toLowerCase()}`;
      const current = contentCounts.get(key);
      contentCounts.set(key, {
        question: current?.question ?? question,
        answer: current?.answer ?? answer,
        count: (current?.count ?? 0) + 1,
        total: 0,
      });
    });
  });

  const items = [...contentCounts.values()]
    .map((item) => ({
      ...item,
      total: questionTotals.get(item.question.toLowerCase()) ?? item.count,
    }))
    .sort(
      (first, second) =>
        second.count - first.count ||
        first.question.localeCompare(second.question) ||
        first.answer.localeCompare(second.answer),
    )
    .slice(0, 6);

  if (items.length === 0) {
    return {
      items: [] as SignalSummaryContentCount[],
      encryptedWaitingCount,
      emptyText: t("workspaceSignalSummaryEmpty"),
    };
  }

  return {
    items,
    encryptedWaitingCount,
    emptyText: "",
  };
}

function WorkspaceActivityLog({
  events,
}: {
  events: ActivityEvent[];
}) {
  const { t } = useI18n();
  return (
    <section className="panel workspace-activity-panel">
      <div className="signal-workbench-header">
        <div className="signal-workbench-copy">
          <p className="eyebrow">{t("activityEyebrow")}</p>
          <h2>{t("workspaceActivityTitle")}</h2>
          <p className="muted">{t("workspaceActivityBody")}</p>
        </div>
        <div className="signal-workbench-summary">
          <span className="signal-chip">{t("activityEventsCount", { count: events.length })}</span>
        </div>
      </div>

      {events.length === 0 ? (
        <EmptyState>
          <h2>{t("activityEmptyTitle")}</h2>
          <p>{t("activityEmptyBody")}</p>
        </EmptyState>
      ) : (
        <div className="workspace-activity-timeline" aria-label={t("workspaceActivityTitle")}>
          {events.map((event) => {
            const actionClass = getActivityActionClass(event.action);
            const actionLabel = getActivityActionLabel(event.action, t);
            const txUrl = getSuiTransactionUrl(event.txDigest);
            return (
              <article key={event.id} className="workspace-activity-row">
                <span className={`workspace-activity-dot is-${actionClass}`} aria-hidden="true" />
                <div className="workspace-activity-main">
                  <div className="workspace-activity-line">
                    {event.actorAddress ? (
                      <SuiAddressDisplay
                        address={event.actorAddress}
                        className="workspace-activity-address"
                        showTooltip
                      />
                    ) : (
                      <strong>{t("unknownActor")}</strong>
                    )}
                    <span className={`activity-badge is-${actionClass}`}>{actionLabel}</span>
                    <span>{event.formTitleSnapshot}</span>
                  </div>
                  <div className="workspace-activity-meta">
                    <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
                    <span>{event.actorRole}</span>
                    <span>{t("activityFormId", { id: shortAddress(event.formId) })}</span>
                    {txUrl ? (
                      <a href={txUrl} target="_blank" rel="noreferrer">
                        {t("suiExplorerLabel")}
                      </a>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function WorkspaceInsights({
  totalSignals,
  unreadSignals,
  needsReviewSignals,
  encryptedSignals,
  records,
  unlockedSignalsById,
}: {
  totalSignals: number;
  unreadSignals: number;
  needsReviewSignals: number;
  encryptedSignals: number;
  records: SignalRecord[];
  unlockedSignalsById?: Record<string, UnlockedSignalSummary>;
}) {
  const { t } = useI18n();
  const encryptedPercent = totalSignals > 0 ? Math.round((encryptedSignals / totalSignals) * 100) : 0;
  const signalSummary = buildSignalSummary(records, t, unlockedSignalsById);
  const metrics = [
    {
      label: t("workspaceMetricTotalSignals"),
      value: totalSignals.toLocaleString(),
      detail: t("workspaceMetricTotalSignalsDetail"),
    },
    {
      label: t("workspaceMetricNeedsReview"),
      value: `${unreadSignals.toLocaleString()} / ${needsReviewSignals.toLocaleString()}`,
      detail: t("workspaceMetricNeedsReviewDetail"),
    },
    {
      label: t("workspaceMetricEncrypted"),
      value: encryptedSignals.toLocaleString(),
      detail: t("workspaceMetricEncryptedDetail", { percent: encryptedPercent }),
    },
  ];

  return (
    <section className="panel workspace-insights-panel" aria-labelledby="workspace-insights-title">
      <div className="workspace-insights-header">
        <div>
          <p className="eyebrow">{t("workspaceInsightsEyebrow")}</p>
          <h2 id="workspace-insights-title">{t("workspaceInsightsTitle")}</h2>
          <p className="workspace-insights-intro">{t("workspaceInsightsIntro")}</p>
        </div>
        <span className="signal-chip signal-chip-soft">{t("workspaceSignalSnapshot")}</span>
      </div>
      <div className="workspace-insights-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className="workspace-insight-card">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </div>
      <article className="workspace-signal-summary-card">
        <div className="workspace-signal-summary-header">
          <div>
            <p className="eyebrow">{t("workspaceReviewAssistEyebrow")}</p>
            <h3>{t("workspaceSignalSummaryTitle")}</h3>
          </div>
        </div>
        {signalSummary.items.length > 0 ? (
          <div className="workspace-signal-summary-grid">
            {signalSummary.items.map((item) => (
              <article key={`${item.question}-${item.answer}`} className="workspace-signal-answer-card">
                <div>
                  <span>{shortenSummaryText(item.question, 96)}</span>
                  <strong>{shortenSummaryText(item.answer, 120)}</strong>
                </div>
                <em>{item.count} / {t("workspaceSignalsCount", { count: item.total })}</em>
              </article>
            ))}
          </div>
        ) : (
          <p className="workspace-signal-summary-empty">{signalSummary.emptyText}</p>
        )}
        {signalSummary.encryptedWaitingCount > 0 ? (
          <p className="workspace-signal-summary-empty">
            {t("workspaceEncryptedSignalsStillLocked", { count: signalSummary.encryptedWaitingCount })}
          </p>
        ) : null}
      </article>
    </section>
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
    return "Resolved";
  }
  if (ROADMAP_READY_STATUSES.has(submission.triageStatus)) {
    return "Published";
  }
  return "Internal only";
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
  const noteUpdatedAt = getReviewerNoteUpdatedAt(submission);
  const assignedReviewer = getAssignedReviewer(submission);
  const reviewerNotes = getVisibleReviewerNotes(submission).trim();
  const followUpEnabled = hasNeedsFollowUp(submission);
  const isRoadmapVisible = ROADMAP_READY_STATUSES.has(submission.triageStatus);
  const isResolved = submission.status === "archived" || submission.triageStatus === "fixed" || submission.triageStatus === "closed";
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
  activeScopeLabel: string;
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
    activeScopeLabel,
    visibleCountLabel,
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
    queueLabel,
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
        <div className="mobile-inbox-title-group">
          <MailboxIcon hasUnread={totalUnreadCount > 0} />
          <div className="mobile-inbox-title">
            <strong>{title}</strong>
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
          srLabel="Sort inbox"
          buttonLabel="Sort inbox"
          selectedValue={sortOrder}
          options={sortOptions}
          onSelect={(value) => onSortOrderChange(value as SignalSortOrder)}
          className="mobile-inbox-sort"
        />
      </div>

      <div className="mobile-inbox-summary-row">
        <span>{visibleCountLabel}</span>
        <span>{queueLabel}</span>
      </div>
    </header>
  );
}

interface WorkspaceShortcutBarProps {
  hasAdminAccess: boolean;
  selectedProjectName: string | null;
  highlightCreateFormCta: boolean;
  onOpenProjectSettings: () => void;
  onJumpToReview: () => void;
  onRevealCreateProject: () => void;
  onRevealConnectProject: () => void;
  className?: string;
}

function WorkspaceShortcutBar({
  hasAdminAccess,
  selectedProjectName,
  highlightCreateFormCta,
  onOpenProjectSettings,
  onJumpToReview,
  onRevealCreateProject,
  onRevealConnectProject,
  className = "",
}: WorkspaceShortcutBarProps) {
  const { t } = useI18n();

  return (
    <div className={`workspace-shortcut-bar ${className}`.trim()}>
      {hasAdminAccess ? (
        <>
          <button type="button" className="primary-button" onClick={onRevealCreateProject}>
            {t("createProjectButton")}
          </button>
          {!selectedProjectName ? (
            <button type="button" className="ghost-button" onClick={onRevealConnectProject}>
              {t("connectExistingShort")}
            </button>
          ) : null}
          {selectedProjectName ? (
            <CreateFormLink className={`primary-button ${highlightCreateFormCta ? "create-form-cta-highlight" : ""}`}>
              {t("navCreateForm")}
            </CreateFormLink>
          ) : null}
        </>
      ) : (
        <CreateFormLink className={`primary-button ${highlightCreateFormCta ? "create-form-cta-highlight" : ""}`}>
          {t("navCreateForm")}
        </CreateFormLink>
      )}
      <button type="button" className="ghost-button" onClick={onJumpToReview}>
        {t("reviewButton")}
      </button>
      {hasAdminAccess ? (
        <>
          <button type="button" className="ghost-button workspace-project-trigger" onClick={onOpenProjectSettings}>
            {selectedProjectName ? t("projectButtonLabel", { name: selectedProjectName }) : t("chooseProjectButton")}
          </button>
        </>
      ) : null}
    </div>
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

function MobileSignalRow({
  record,
  isSelected,
  isUnlocked,
  onSelect,
  onQuickAction,
  t,
}: MobileSignalRowProps) {
  const { submission } = record;
  const title = getSignalSubject(submission);
  const persistenceState = getSignalPersistenceState(submission);
  const persistenceLabel = getSignalPersistenceLabel(persistenceState);
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
  const sourceLabel = getSubmissionRespondentMeta(submission).isAnonymous
    ? t("anonymousRespondent")
    : record.form.title;
  const signalLevelLabel =
    typeof submission.signalValue === "number"
      ? `Signal ${submission.signalValue}/5`
      : `Signal level ${submission.severity ?? submission.priority}`;
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
            <span>{sourceLabel}</span>
            <span>{getTriageStatusLabel(submission.triageStatus)}</span>
          </span>
          <span className="mobile-signal-meta-row">
            {submission.isEncrypted ? (
              <span className={`mobile-signal-mini-badge ${isUnlocked ? "is-selected" : ""}`}>
                {lockStateLabel}
              </span>
            ) : (
              <span className="mobile-signal-mini-badge">{lockStateLabel}</span>
            )}
            <span className={`mobile-signal-mini-badge status-${submission.status}`}>
              {readStateLabel}
            </span>
            {persistenceState !== "not_available" ? (
              <span className="mobile-signal-mini-badge">{persistenceLabel}</span>
            ) : null}
            <span className="mobile-signal-mini-badge">{signalLevelLabel}</span>
          </span>
        </span>
      </button>

      <span className="mobile-signal-side">
        <time>{formatDate(submission.createdAt)}</time>
        <span className={`mobile-priority-badge priority-${submission.priority}`}>{priorityLabel}</span>
        <button
          type="button"
          className="mobile-row-action-button"
          onClick={(event) => {
            event.stopPropagation();
            onQuickAction(record, submission.status === "unread" ? "reviewing" : "resolve");
          }}
        >
          {submission.status === "unread" ? "Review" : "Resolve"}
        </button>
      </span>
    </article>
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
  activeScopeLabel,
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
        activeScopeLabel={activeScopeLabel}
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

export function AdminDashboardPage() {
  const { language, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const wallet = useSuiWallet();
  const suiClient = useSuiClient();
  const rpc = useRpcInfrastructure();
  const updateSignalStatusTx = useSignAndExecuteTransaction();
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
  const [reviewSaveStatus, setReviewSaveStatus] = useState<ReviewSaveStatus>("idle");
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [deletingVisibleNodes, setDeletingVisibleNodes] = useState(false);
  const [nodeDirectoryOpen, setNodeDirectoryOpen] = useState(false);
  const [beaconFormId, setBeaconFormId] = useState<string | null>(null);
  const [nodeSearch, setNodeSearch] = useState("");
  const [csvExportScope, setCsvExportScope] = useState<ResponsesCsvExportScope>("filtered");
  const [csvSortOrder, setCsvSortOrder] = useState<ResponsesCsvSortOrder>("createdAtDesc");
  const [signalSortOrder, setSignalSortOrder] = useState<SignalSortOrder>("default");
  const [reviewSessionOpen, setReviewSessionOpen] = useState(false);
  const [reviewSessionStep, setReviewSessionStep] = useState<1 | 2 | 3 | 4>(1);
  const [reviewSessionMobileTab, setReviewSessionMobileTab] = useState<ReviewSessionMobileTab>("answers");
  const [excludedCsvPiiFields, setExcludedCsvPiiFields] = useState<ExportPiiField[]>([]);
  const [pendingCsvExportMetadata, setPendingCsvExportMetadata] = useState<ExportMetadata | null>(null);
  const [pendingCsvExportForm, setPendingCsvExportForm] = useState<FormSchema | null>(null);
  const [pendingCsvExportResponses, setPendingCsvExportResponses] = useState<Submission[]>([]);
  const [pendingCsvExportOptions, setPendingCsvExportOptions] = useState<ExportResponsesToCsvOptions | null>(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("review");
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [isReviewerFocusMode, setIsReviewerFocusMode] = useState(false);
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
  const { toast, setToast } = useAdminToast();
  const saveQueueRef = useRef(Promise.resolve());
  const reviewInboxRef = useRef<HTMLDivElement | null>(null);
  const streamsPanelRef = useRef<HTMLDivElement | null>(null);
  const signalListPanelRef = useRef<HTMLElement | null>(null);
  const signalDetailPanelRef = useRef<HTMLElement | null>(null);
  const signalSearchInputRef = useRef<HTMLInputElement | null>(null);
  const shortcutHelpHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const signalCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hasUnsavedReviewChangesRef = useRef(false);
  const reviewSessionDialogRef = useRef<HTMLElement | null>(null);
  const reviewSessionPrimaryActionRef = useRef<HTMLButtonElement | null>(null);
  const selectedRecordResetRef = useRef<string | null>(null);
  const keyboardNavigationRef = useRef(false);
  const hasAdminAccess = canAdmin(capabilityProfile);
  const setWorkspaceTab = useCallback(
    (tab: WorkspaceTab) => {
      if (tab === "activity") {
        setLocalActivityEvents(listActivityEvents());
      }
      setActiveWorkspaceTab(tab);
      navigate({ pathname: location.pathname, search: `?tab=${tab}` }, { replace: true });
    },
    [location.pathname, navigate],
  );
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
    accountAddress: wallet.accountAddress,
    capabilityProfile,
    sortOrder: signalSortOrder,
  });
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
    accountAddress: wallet.accountAddress,
    capabilityProfile,
    forms,
    loadConsole,
  });

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    if (tab === "review" || tab === "activity" || tab === "insights" || tab === "members") {
      setActiveWorkspaceTab((current) => (current === tab ? current : tab));
      if (tab === "activity") {
        setLocalActivityEvents(listActivityEvents());
      }
      return;
    }
    setActiveWorkspaceTab("review");
  }, [location.search]);
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
    const uniqueIds = [...new Set(formIds)];
    const formsById = new Map(forms.map((form) => [form.id, form]));
    const walletOwnedIds = uniqueIds.filter((formId) => {
      const form = formsById.get(formId);
      return addressesMatch(form?.ownerAddress, wallet.accountAddress);
    });
    const localCacheOnlyIds = uniqueIds.filter((formId) => !walletOwnedIds.includes(formId));

    if (walletOwnedIds.length > 0) {
      await storageAdapter.deleteForms(walletOwnedIds);
    }
    if (localCacheOnlyIds.length > 0) {
      await deleteFormsFromLocalCache(localCacheOnlyIds);
    }
    const archivedEvents = uniqueIds.flatMap((formId) => {
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
      tone: !wallet.accountAddress ? "action" : canReview(capabilityProfile) || !capabilityProfile.isConfigured ? "ready" : "warning",
      detail: !wallet.accountAddress
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
  const selectedRecordProtectionFacts = selectedRecord
    ? [
        {
          label: selectedRecordStoredOnWalrus ? "Stored on Walrus" : "Saved locally",
          detail: selectedRecordStoredOnWalrus
            ? "This signal is kept in durable Walrus storage."
            : "This signal is available in this browser while Walrus is unavailable.",
        },
        {
          label: selectedRecord.submission.isEncrypted ? "Encrypted" : "Not encrypted",
          detail: selectedRecord.submission.isEncrypted
            ? "The message body stays hidden until you decrypt it."
            : "This signal was submitted as readable content.",
        },
        {
          label: "Readable by Owner/Admin",
          detail: selectedRecord.submission.isEncrypted
            ? "Only authorized reviewers should be able to read the private message."
            : "The inbox owner can review this signal now.",
        },
        ...(selectedRecord.submission.isEncrypted
          ? [
              {
                label:
                  selectedRecordPayloadState === "missing_onchain_payload_reference"
                    ? t("privateSignalPayloadMissingStatus")
                    : selectedRecordPayloadState === "missing_payload"
                      ? t("encryptedPayloadMissingLabel")
                      : t("encryptedPayloadStored"),
                detail:
                  selectedRecordPayloadState === "missing_onchain_payload_reference"
                    ? t("decryptErrorOnchainPayloadBlobMissing")
                    : selectedRecordPayloadState === "missing_payload"
                      ? t("decryptErrorEncryptedPayloadMissing")
                      : t("encryptedPreview"),
              },
            ]
          : []),
      ]
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

  const forceCloseReviewSession = useCallback(() => {
    setReviewSessionOpen(false);
  }, []);

  const requestCloseReviewSession = useCallback(() => {
    if (hasUnsavedReviewChangesRef.current && !window.confirm(t("discardChangesConfirm"))) {
      return false;
    }
    forceCloseReviewSession();
    return true;
  }, [forceCloseReviewSession, t]);

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
  const selectedSignalIdFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("signal") ?? "";
  }, [location.search]);

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
    const mediaQuery = window.matchMedia(MOBILE_REVIEW_MEDIA_QUERY);
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
  }, []);

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

  function handleOpenProtectedSignal(record: SignalRecord) {
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
            eyebrow: t("nextStepLabel"),
            title: "Start review session",
            detail: "Unlock the signal, classify it, and save a review result in one flow.",
            cta: (
              <button
                type="button"
                className="primary-button"
                disabled={saving}
                onClick={() => openReviewSession()}
              >
                Review signal
              </button>
            ),
          }
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
            ? {
                eyebrow: t("nextStepLabel"),
                title: "Open review result",
                detail: "Use the review session to decide roadmap visibility and internal status together.",
                cta: (
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={saving}
                    onClick={() => openReviewSession()}
                  >
                    Open review
                  </button>
                ),
              }
            : {
                eyebrow: t("nextStepLabel"),
                title: t("signalAlreadyInReviewFlowTitle"),
                detail: t("signalAlreadyInReviewFlowDetail"),
                cta: selectedRoadmapUrl ? <Link className="ghost-button" to={selectedRoadmapUrl}>{t("openPublicRoadmap")}</Link> : null,
              };
  const firstProjectForm = selectedProjectForms[0] ?? null;
  const firstVisibleForm = statusForms[0] ?? null;
  const firstProtectedSignal = statusSignals.find((record) => record.submission.isEncrypted) ?? null;
  const shouldHighlightCreateProjectCta = projects.length === 0 && hasAdminAccess;
  const nextRecommendedAction =
    !hasAdminAccess
      ? accessibleForms.length === 0
        ? {
            label: t("createFirstSignalInbox"),
            detail: t("createWalletOwnedInboxDetail"),
            cta: <CreateFormLink className="primary-button">{t("navCreateForm")}</CreateFormLink>,
          }
        : allSignals.length === 0
          ? {
              label: t("sendTestSignal"),
              detail: t("sendTestSignalOwnFormDetail"),
              cta: firstVisibleForm ? <Link className="primary-button" to={getPublicFormPath(firstVisibleForm.id, firstVisibleForm.manifestBlobId)}>{t("openPublicLink")}</Link> : null,
            }
          : {
              label: t("reviewSignalInbox"),
              detail: t("walletCanReviewOwnFormsDetail"),
              cta: null,
            }
    : !selectedProject
      ? {
          label: t("connectProject"),
          detail: t("connectProjectBeforeReviewDetail"),
          cta: (
            <div className="inline-actions">
              {hasAdminAccess ? (
                <button
                  type="button"
                  className={`primary-button ${shouldHighlightCreateProjectCta ? "create-project-cta-highlight" : ""}`}
                  onClick={() => revealProjectTools("create")}
                >
                  {t("createProjectButton")}
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
            label: t("createFirstSignalInbox"),
            detail: t("publishProtectedFormDetail"),
            cta: <CreateFormLink className="primary-button">{t("navCreateForm")}</CreateFormLink>,
          }
        : selectedProjectSignals.length === 0
          ? {
              label: t("sendTestSignal"),
              detail: t("sendTestSignalToInboxDetail"),
              cta: firstProjectForm ? <Link className="primary-button" to={getPublicFormPath(firstProjectForm.id, firstProjectForm.manifestBlobId)}>{t("openPublicLink")}</Link> : null,
            }
          : firstProtectedSignal && !detailAnswers
            ? {
                label: t("unlockPrivateSignal"),
                detail: t("unlockPrivateSignalDetail"),
                cta: firstProtectedSignal ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={decrypting || decryptInFlightRef.current}
                  onClick={() => {
                    if (decryptInFlightRef.current) {
                      return;
                    }
                    handleOpenProtectedSignal(firstProtectedSignal);
                  }}
                >
                    {t("openProtectedSignal")}
                  </button>
                ) : null,
              }
            : roadmapReadySignals.length === 0
                ? {
                    label: t("moveToPublicRoadmap"),
                    detail: t("moveToPublicRoadmapDetail"),
                    cta: selectedRecord ? (
                      <button
                        type="button"
                        className="primary-button"
                        disabled={saving}
                        onClick={() => void handleMoveToRoadmap()}
                      >
                        {t("moveToPublicRoadmap")}
                      </button>
                    ) : null,
                  }
                : pendingSignals.length > 0
                  ? {
                      label: t("registerProofOnSui"),
                      detail: t("optionalProofCompleteDetail"),
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
                    label: t("reviewSignalInbox"),
                    detail: t("queueHealthyDetail"),
                    cta: selectedRoadmapUrl ? <Link className="primary-button" to={selectedRoadmapUrl}>{t("openPublicRoadmap")}</Link> : null,
                  };

  const activeReviewDraft: ReviewDraft | null = useMemo(
    () =>
      selectedRecord
        ? reviewDraft ?? {
            status: selectedRecord.submission.status,
            triageStatus: selectedRecord.submission.triageStatus,
            priority: selectedRecord.submission.priority,
            signalValue: selectedRecord.submission.signalValue,
            notes: getVisibleReviewerNotes(selectedRecord.submission),
            reviewer: getAssignedReviewer(selectedRecord.submission) ?? "",
          }
        : null,
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
  const draftReviewStatus = activeReviewDraft?.status ?? selectedRecord?.submission.status ?? "unread";
  const draftTriageStatus = activeReviewDraft?.triageStatus ?? selectedRecord?.submission.triageStatus ?? "new";
  const isReviewWorkbenchLocked = selectedRecordNeedsDecrypt;
  const isDraftOnRoadmap = ROADMAP_READY_STATUSES.has(draftTriageStatus);

  function patchReviewDraft(patch: Partial<ReviewDraft>) {
    if (!selectedRecord || isReviewWorkbenchLocked) {
      return;
    }
    setReviewDraft((current) => {
      const base = current ?? {
        status: selectedRecord.submission.status,
        triageStatus: selectedRecord.submission.triageStatus,
        priority: selectedRecord.submission.priority,
        signalValue: selectedRecord.submission.signalValue,
        notes: getVisibleReviewerNotes(selectedRecord.submission),
        reviewer: getAssignedReviewer(selectedRecord.submission) ?? "",
      };
      return {
        ...base,
        ...patch,
      };
    });
  }

  function setDetailSectionOpen(section: keyof DetailWorkspaceSectionsState, open: boolean) {
    setDetailSectionsState((current) => ({
      ...current,
      [section]: open,
    }));
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
      notes: getVisibleReviewerNotes(selectedRecord.submission),
      reviewer: getAssignedReviewer(selectedRecord.submission) ?? "",
    });
    setDecryptError("");
  }, [selectedRecord, setDecryptError]);

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
  }, [applySubmissionUpdate, setSelectedSignalId, setToast, signalIndex.signalById, suiClient, updateSignalStatusTx]);

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

  const handleQuickAction = useCallback(
    async (record: SignalRecord, action: QuickActionId) => {
      const nextSubmission = buildQuickActionSubmission(record.submission, action);
      const saved = await updateSubmission(nextSubmission, { announce: true });
      if (!saved) {
        return;
      }
      if (selectedRecord?.submission.id === record.submission.id) {
        setReviewDraft({
          status: nextSubmission.status,
          triageStatus: nextSubmission.triageStatus,
          priority: nextSubmission.priority,
          signalValue: nextSubmission.signalValue,
          notes: getVisibleReviewerNotes(nextSubmission),
          reviewer: getAssignedReviewer(nextSubmission) ?? "",
        });
      }
    },
    [selectedRecord, updateSubmission],
  );

  async function saveActiveReviewDraft() {
    if (!selectedRecord || !activeReviewDraft || !hasReviewDraftChanges || isReviewWorkbenchLocked) {
      return false;
    }
    return updateSubmission(
      buildSubmissionFromReviewDraft(selectedRecord.submission, activeReviewDraft),
      { announce: true },
    );
  }

  async function handleMoveToRoadmap() {
    if (!selectedRecord || isReviewWorkbenchLocked) {
      return;
    }
    const currentTriageStatus = activeReviewDraft?.triageStatus ?? selectedRecord.submission.triageStatus;
    const nextStatus = ROADMAP_READY_STATUSES.has(currentTriageStatus)
      ? currentTriageStatus
      : "planned";
    const saved = await updateSubmission({
      ...selectedRecord.submission,
      ...(activeReviewDraft ? buildSubmissionFromReviewDraft(selectedRecord.submission, activeReviewDraft) : {}),
      triageStatus: nextStatus,
    });
    if (!saved) {
      return;
    }
    setToast({ tone: "success", message: t("signalAddedToPublicRoadmap") });
  }

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
  const canDeleteForm = useCallback(
    (form: Pick<FormSchema, "ownerAddress">) =>
      hasAdminAccess || !capabilityProfile.isConfigured || addressesMatch(form.ownerAddress, wallet.accountAddress),
    [wallet.accountAddress, capabilityProfile.isConfigured, hasAdminAccess],
  );
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
    idle: t("reviewSaveReadyToSave"),
    saving: t("reviewSaveSaving"),
    saved: t("reviewSaveSaved"),
    skipped: t("reviewSaveSkipped"),
    error: t("reviewSaveError"),
  };
  const reviewStatusPillState = hasReviewDraftChanges ? "editing" : reviewSaveStatus;
  const reviewStatusPillLabel = hasReviewDraftChanges ? t("reviewSaveUnsavedDraft") : reviewSaveStatusLabel[reviewSaveStatus];
  const selectedReviewer = activeReviewDraft?.reviewer ?? (selectedRecord ? getAssignedReviewer(selectedRecord.submission) ?? "" : "");
  const selectedReviewerDisplayLabel = useReviewerDisplayLabel(selectedReviewer);
  const selectedReviewerPresence = selectedRecord
    ? getReviewerPresenceText(selectedRecord.submission, wallet.accountAddress)
    : null;
  const selectedNeedsFollowUp = selectedRecord ? hasNeedsFollowUp(selectedRecord.submission) : false;
  const selectedReviewerNoteUpdatedAt = selectedRecord ? getReviewerNoteUpdatedAt(selectedRecord.submission) : undefined;
  const selectedSavedReviewer = selectedRecord ? getAssignedReviewer(selectedRecord.submission) ?? "" : "";
  const selectedSavedReviewerDisplayLabel = useReviewerDisplayLabel(selectedSavedReviewer);
  const selectedPublicDecisionLabel = selectedRecord ? getPublicDecisionLabel(selectedRecord.submission, t) : "";
  const selectedSignalValueStars = selectedRecord ? getSignalValueStars(selectedRecord.submission.signalValue) : null;
  const selectedReviewResultItems = selectedRecord
    ? [
        { label: t("assignedReviewerLabel"), value: selectedSavedReviewerDisplayLabel || "-" },
        { label: "Reviewed at", value: selectedReviewerNoteUpdatedAt ? formatDate(selectedReviewerNoteUpdatedAt) : "Not reviewed yet" },
        {
          label: "Roadmap linked",
          value: isSelectedRecordOnRoadmap && selectedRoadmapUrl ? "Linked" : "Not linked",
          href: isSelectedRecordOnRoadmap && selectedRoadmapUrl ? selectedRoadmapUrl : undefined,
        },
        { label: t("lastUpdatedLabel"), value: formatDate(selectedRecord.submission.updatedAt) },
      ]
    : [];
  const selectedReviewSummaryBadges = selectedRecord
    ? [
        reviewSaveStatus !== "idle" ? reviewStatusPillLabel : null,
        isSelectedRecordOnRoadmap ? "Ready to publish" : null,
        selectedRecord.submission.status === "archived" ? "Archived" : null,
        selectedRecord.submission.triageStatus === "fixed" || selectedRecord.submission.triageStatus === "closed"
          ? "Resolved"
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
    { id: 1, title: "Unlock signal", detail: "Decrypt the private signal before review can continue." },
    { id: 2, title: "Read & classify", detail: "Read the original signal and set review outcome metadata." },
    { id: 3, title: "Reviewer note", detail: "Capture an internal-only note for the review session." },
    { id: 4, title: "Public roadmap decision", detail: "Decide whether this review stays internal, publishes, or resolves." },
  ] as const;
  const reviewSessionCurrentStep = reviewSessionStepItems.find((step) => step.id === reviewSessionStep) ?? reviewSessionStepItems[0];
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
    const details = advancedProjectSettingsRef.current;
    if (!details) {
      return;
    }
    details.open = true;
    details.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function revealProjectSettingsTools(mode: "connect" | "create") {
    openAdvancedProjectSettings();
    window.setTimeout(() => {
      if (mode === "create") {
        projectCreateInputRef.current?.focus();
        return;
      }
      manualProjectInputRef.current?.focus();
    }, 160);
  }

  function jumpToReviewWorkspace() {
    setActiveWorkspaceTab("review");
    setSelectedStreamId("all");
    setSelectedFormId("all");
    reviewInboxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const nodeDirectoryItems = useMemo(() => {
    const normalizedSearch = nodeSearch.trim().toLowerCase();
    const accessibleFormIdSet = new Set(accessibleForms.map((form) => form.id));
    const allFormsItem = {
      id: "all",
      title: t("allSignalNodes"),
      submissionCount: allSignals.length,
      unreadCount: signalIndex.counts.unread,
      isLegacyDemo: false,
      canDelete: false,
      isAccessible: true,
    };
    const formItems = forms
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
        isAccessible: accessibleFormIdSet.has(form.id),
      }));
    return [allFormsItem, ...formItems];
  }, [
    accessibleForms,
    allSignals.length,
    canDeleteForm,
    forms,
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
      hasWallet={Boolean(wallet.accountAddress)}
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
              <WorkspaceShortcutBar
                className="workspace-dock-actions"
                hasAdminAccess={hasProjectManagementAccess}
                selectedProjectName={selectedProject?.name ?? null}
                highlightCreateFormCta={highlightCreateFormCta}
                onOpenProjectSettings={openAdvancedProjectSettings}
                onJumpToReview={jumpToReviewWorkspace}
                onRevealCreateProject={() => revealProjectSettingsTools("create")}
                onRevealConnectProject={() => revealProjectSettingsTools("connect")}
              />
            </aside>
          </div>
        </section>

        {hasAdminAccess ? (
          <AdminWorkspaceTabs activeTab={activeWorkspaceTab} onSelectTab={setWorkspaceTab} />
        ) : null}

        {activeWorkspaceTab === "activity" && hasAdminAccess ? (
          <WorkspaceActivityLog events={activityEvents} />
        ) : activeWorkspaceTab === "insights" && hasAdminAccess ? (
          <WorkspaceInsights
            totalSignals={allSignals.length}
            unreadSignals={signalIndex.counts.unread}
            needsReviewSignals={signalIndex.counts.needsReview}
            encryptedSignals={signalIndex.counts.encrypted}
            records={allSignals}
            unlockedSignalsById={decryptedSignalsById}
          />
        ) : activeWorkspaceTab === "members" && hasAdminAccess ? (
          <MemberDirectorySection capabilityProfile={capabilityProfile} readOnly />
        ) : accessibleForms.length === 0 ? (
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
                  <span className="signal-chip signal-chip-soft">{activeScopeLabel}</span>
                  <label className="review-sort-control">
                    <span className="sr-only">Sort inbox</span>
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
                    const isPendingSui = submission.pendingOnchainRegistration;
                    const isSelectedForSui = selectedPendingSignalIds.includes(submission.id);
                    const isLocalOnlySignal = storageLabel === "Stored locally only";
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
                      <div
                        key={submission.id}
                        className={`signal-card ${isSelectedSignal ? "is-active" : ""} ${submission.status === "unread" ? "is-unread" : "is-read"} ${isPendingSui ? "has-select-checkbox" : ""} ${isSelectedForSui ? "is-selected-for-sui" : ""} ${
                          isAnonymousSignal ? "is-anonymous" : ""
                        }`}
                        role="button"
                        tabIndex={0}
                        aria-current={isSelectedSignal ? "true" : undefined}
                        onClick={() => {
                          handleSelectDesktopSignal(submission.id);
                          scrollToReviewPanel("detail");
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") {
                            return;
                          }
                          event.preventDefault();
                          handleSelectDesktopSignal(submission.id);
                          scrollToReviewPanel("detail");
                        }}
                        ref={(node) => {
                          signalCardRefs.current[submission.id] = node;
                        }}
                      >
                        {isPendingSui ? (
                          <div
                            className="signal-card-select-toggle"
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelectedForSui}
                              onChange={() => {
                                togglePendingSelection(submission.id);
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                              aria-label={t("selectForSui")}
                            />
                          </div>
                        ) : null}
                        <div className="signal-card-topline">
                          <span className={`signal-card-read-dot status-${submission.status}`} aria-hidden="true" />
                          <strong>{subject}</strong>
                          <span className="signal-card-topline-meta">
                            {isSelectedSignal ? <span className="signal-card-selection-badge">{t("selectedLabel")}</span> : null}
                            <span className="signal-card-time">{formatDate(submission.createdAt)}</span>
                          </span>
                        </div>
                        <p className={`signal-card-preview ${submission.isEncrypted ? "is-locked" : ""}`}>
                          {preview}
                        </p>
                        <div className="signal-card-secondary-line">
                          <span className="signal-card-form">{form.title}</span>
                          <span className="signal-card-meta-separator" aria-hidden="true">•</span>
                          <span className="signal-card-triage">{getTriageStatusLabel(submission.triageStatus)}</span>
                        </div>
                        <div className="signal-card-footer">
                          <div className="signal-card-mailbox-meta" aria-label={t("signalReviewStateLabel")}>
                            <span className={`mailbox-meta-chip priority-${submission.priority}`}>
                              {priorityLabel}
                            </span>
                            <span className={`mailbox-meta-chip ${isAnonymousSignal ? "identity-anonymous" : "identity-verified"}`}>
                              {isAnonymousSignal ? t("anonymousLabel") : t("verifiedSignalsLabel")}
                            </span>
                            <span className={`mailbox-meta-chip ${submission.isEncrypted ? "is-locked" : "is-open"} ${isUnlockedSignal ? "is-unlocked" : ""}`}>
                              {lockStateLabel}
                            </span>
                            <span className={`mailbox-meta-chip status-${submission.status}`}>
                              {readStateLabel}
                            </span>
                            {isOnchainRecoverySnapshot ? (
                              <span className="mailbox-meta-chip mailbox-meta-chip-subtle">
                                {t("onchainRecoverySnapshotLabel")}
                              </span>
                            ) : null}
                            {persistenceLabel ? (
                              <span className="mailbox-meta-chip mailbox-meta-chip-subtle">{persistenceLabel}</span>
                            ) : null}
                            {hasPayloadIssue ? (
                              <span className="mailbox-meta-chip mailbox-meta-chip-subtle">
                                {t("privateSignalPayloadMissingStatus")}
                              </span>
                            ) : null}
                          </div>
                          {hasNotableStatusBadge ? (
                            <div className="signal-badge-row signal-badge-row-compact">
                              <SignalStatusBadges
                                submission={submission}
                                category={category}
                                pendingSui={isPendingSui}
                                selectedForSui={isSelectedForSui}
                                payloadIssue={hasPayloadIssue}
                                storageLabel={
                                  storageState === "local_only" || storageState === "walrus_synced"
                                    ? storageLabel
                                    : undefined
                                }
                                persistenceState={persistenceState}
                                density="notable"
                                reviewerHint={getReviewerPresenceText(submission, wallet.accountAddress)}
                                needsFollowUp={hasNeedsFollowUp(submission)}
                              />
                            </div>
                          ) : null}
                        </div>
                        <div
                          className="signal-card-actions signal-card-actions-quick"
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          <button
                            type="button"
                            className="ghost-button review-open-button"
                            onClick={() => openReviewSession(submission.id)}
                          >
                            {submission.status === "unread" ? "Start review" : "Open review"}
                          </button>
                        </div>
                        {isPendingSui ? (
                          <div className="signal-card-actions">
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
                    {!isReviewerFocusMode ? (
                      <div className="mobile-readable-trust-panel" aria-label="Signal storage and privacy">
                        {selectedRecordProtectionFacts.map((fact) => (
                          <div key={fact.label} className="mobile-readable-trust-item">
                            <strong>{fact.label}</strong>
                            <span>{fact.detail}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
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
                            <p className="muted">No response content is available yet.</p>
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

                    {selectedRecordNeedsDecrypt ? (
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

                    <section className="answer-card review-result-card">
                      <div className="review-controls-header">
                        <div>
                          <p className="eyebrow">Review Result</p>
                          <h3>{selectedRecord.submission.status === "unread" ? "No review saved yet" : "Saved review result"}</h3>
                          <p className="review-helper-copy">
                            {selectedRecord.submission.status === "unread"
                              ? "Run a review session to decrypt, classify, and save the operator decision."
                              : "Admin view stays lightweight and reflects the last saved review outcome only."}
                          </p>
                        </div>
                        <div className="review-save-actions">
                          <button
                            type="button"
                            className="primary-button review-open-button"
                            onClick={() => openReviewSession()}
                          >
                            {selectedRecord.submission.status === "unread" ? "Start review" : "Open review"}
                          </button>
                        </div>
                      </div>

                      <div className="review-result-grid">
                        <div className="review-result-item review-result-item-featured">
                          <span>{t("signalValueLabel")}</span>
                          {selectedSignalValueStars ? (
                            <>
                              <strong>{getSignalValueSummary(selectedRecord.submission.signalValue, t)}</strong>
                              <div className="review-result-stars" aria-label={t("signalValueRatingLabel")}>
                                {selectedSignalValueStars.map((isFilled, index) => (
                                  <span
                                    key={index}
                                    className={isFilled ? "review-result-star is-filled" : "review-result-star is-empty"}
                                    aria-hidden="true"
                                  >
                                    ★
                                  </span>
                                ))}
                              </div>
                            </>
                          ) : (
                            <strong>{t("notScored")}</strong>
                          )}
                        </div>
                        <div className="review-result-item review-result-item-wide">
                          <span>Review badges</span>
                          <div className="review-result-inline-badges">
                            <span className={`pill status-${selectedRecord.submission.status}`}>
                              {getLocalizedSubmissionStatusLabel(selectedRecord.submission.status, t)}
                            </span>
                            <span className={`pill priority-${selectedRecord.submission.priority}`}>
                              {getLocalizedPriorityLabel(selectedRecord.submission.priority, t)}
                            </span>
                            <span className="pill">
                              {getLocalizedTriageStatusLabel(selectedRecord.submission.triageStatus, t)}
                            </span>
                            <span className="signal-chip signal-chip-soft">{selectedPublicDecisionLabel}</span>
                            <span className={`signal-chip ${isSelectedRecordOnRoadmap ? "signal-chip-accent" : ""}`}>
                              {isSelectedRecordOnRoadmap ? "Roadmap linked" : "Internal only"}
                            </span>
                          </div>
                        </div>
                        {selectedReviewResultItems.map((item) => (
                          <div key={item.label} className="review-result-item">
                            <span>{item.label}</span>
                            {item.href ? (
                              <Link to={item.href}>{item.value}</Link>
                            ) : (
                              <strong>{item.value}</strong>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="review-result-footer">
                        <div className="review-result-badges">
                          {selectedReviewSummaryBadges.map((badge) => (
                            <span key={badge} className="signal-chip signal-chip-soft">{badge}</span>
                          ))}
                          {selectedNeedsFollowUp ? (
                            <span className="signal-chip signal-chip-accent">{t("needsFollowUpLabel")}</span>
                          ) : null}
                        </div>
                        <div className="review-action-bar">
                          {selectedRecord.submission.githubIssueUrl ? (
                            <a
                              className="ghost-button"
                              href={selectedRecord.submission.githubIssueUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open GitHub issue
                            </a>
                          ) : null}
                          {isSelectedRecordOnRoadmap ? (
                            <Link className="ghost-button" to={selectedRoadmapUrl}>
                              {t("openRoadmap")}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </section>
                  </div>

                  {!isReviewerFocusMode ? (
                  <div className="signal-detail-sections review-secondary-sections">
                    <section className="answer-card review-secondary-card signal-timeline-section">
                      <WorkspaceSectionToggle
                        eyebrow={t("signalTimelineEyebrow")}
                        title={t("signalTimelineTitle")}
                        detail={t("signalTimelineBody")}
                        open={detailSectionsState.signalTimelineOpen}
                        onToggle={() =>
                          setDetailSectionOpen("signalTimelineOpen", !detailSectionsState.signalTimelineOpen)
                        }
                        trailing={
                          <span className="signal-chip signal-chip-soft">
                            {t("signalTimelineCount", { count: selectedSignalTimelineEntries.length })}
                          </span>
                        }
                      />
                      {detailSectionsState.signalTimelineOpen ? (
                        <div className="signal-timeline-panel">
                          {selectedSignalTimelineCurrentState ? (
                            <div className={`signal-timeline-current-state is-${selectedSignalTimelineCurrentState.phase}`}>
                              <div className="signal-timeline-current-head">
                                <span className="signal-timeline-current-label">{t("signalTimelineCurrentStateLabel")}</span>
                                <span className={`signal-timeline-phase-pill is-${selectedSignalTimelineCurrentState.phase}`}>
                                  {getSignalTimelinePhaseLabel(selectedSignalTimelineCurrentState.phase, t)}
                                </span>
                              </div>
                              <strong>{selectedSignalTimelineCurrentState.title}</strong>
                              {selectedSignalTimelineCurrentState.detail ? (
                                <p className="muted">{selectedSignalTimelineCurrentState.detail}</p>
                              ) : null}
                            </div>
                          ) : null}
                          <p className="muted signal-timeline-derived-note">{t("signalTimelineDerivedHint")}</p>
                          <div className="signal-timeline-list" aria-label={t("signalTimelineTitle")}>
                            {selectedSignalTimelineEntries.map((entry, index) => {
                              const isCurrent = index === selectedSignalTimelineEntries.length - 1;
                              return (
                              <article
                                key={entry.id}
                                className={`signal-timeline-item ${isCurrent ? "is-current" : "is-past"} is-${entry.phase}`}
                              >
                                <span className={`signal-timeline-marker is-${entry.phase}`} aria-hidden="true" />
                                <div className="signal-timeline-card">
                                  <div className="signal-timeline-card-header">
                                    <strong>{entry.title}</strong>
                                    <div className="signal-timeline-meta">
                                      <span className={`signal-timeline-phase-pill is-${entry.phase}`}>
                                        {getSignalTimelinePhaseLabel(entry.phase, t)}
                                      </span>
                                      <time dateTime={entry.timestamp} title={formatDate(entry.timestamp)}>
                                        {formatRelativeTime(entry.timestamp, timelineNow)}
                                      </time>
                                    </div>
                                  </div>
                                  {entry.detail ? (
                                    <p className="muted signal-timeline-detail">{entry.detail}</p>
                                  ) : null}
                                </div>
                              </article>
                            );})}
                          </div>
                        </div>
                      ) : null}
                    </section>

                    <section className="secondary-inspector">
                      <div className="secondary-inspector-header">
                        <div>
                          <p className="eyebrow">{t("secondaryToolsEyebrow")}</p>
                          <h3>{t("secondaryInspectorTitle")}</h3>
                        </div>
                        <p className="muted">{t("metadataExportBody")}</p>
                      </div>

                      <div className="secondary-inspector-grid">
                        <details className="inspector-panel inspector-export-panel">
                          <summary>
                            <span>
                              <p className="eyebrow">{t("exportInspectorEyebrow")}</p>
                              <strong>JSON / CSV</strong>
                            </span>
                            <span className="inspector-summary">{csvExportScopeLabel}</span>
                          </summary>
                          <div className="inspector-panel-body">
                            <div className="export-quick-summary" aria-label={t("currentExportSummaryAriaLabel")}>
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

                        <details
                          className="inspector-panel signal-proof-panel"
                          open={detailSectionsState.storageProofOpen}
                          onToggle={(event) => {
                            setDetailSectionOpen("storageProofOpen", (event.currentTarget as HTMLDetailsElement).open);
                          }}
                        >
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
                              <div className="metadata-list signal-proof-metadata-list">
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
                                    <StorageProof
                                      blobId={selectedRecord.submission.blobId}
                                      proof={selectedRecord.submission.walrusProof}
                                      compact
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
                                      <StorageProof
                                        blobId={selectedRecord.submission.encryptedBlobId}
                                        proof={selectedRecord.submission.encryptedWalrusProof ?? selectedRecord.submission.walrusProof}
                                        compact
                                      />
                                    ) : null}
                                  </SignalMetaRow>
                                ) : selectedRecord.submission.isEncrypted ? (
                                  <div className="metadata-row">
                                    <span>{t("encryptedPayloadLabel")}</span>
                                    <strong>{getEncryptedPayloadAvailabilityLabel(selectedRecord.submission)}</strong>
                                  </div>
                                ) : null}
                                <div className="metadata-row">
                                  <span>{t("reviewerAccessLabel")}</span>
                                  <strong>{privateReviewLabel}</strong>
                                </div>
                              </div>
                              <details
                                className="inspector-nested-detail"
                                open={detailSectionsState.advancedMetadataOpen}
                                onToggle={(event) => {
                                  setDetailSectionOpen("advancedMetadataOpen", (event.currentTarget as HTMLDetailsElement).open);
                                }}
                              >
                                <summary>{t("advancedMetadataTitle")}</summary>
                                <div className="metadata-list signal-proof-metadata-list">
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
                                              <StorageProof
                                                blobId={attachment.blobId}
                                                proof={attachment.walrusProof}
                                                fallbackSize={attachment.size}
                                                compact
                                              />
                                            ) : null}
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                  <div className="metadata-row">
                                    <span>{t("walletLabel")}</span>
                                    {getSubmissionRespondentMeta(selectedRecord.submission).isAnonymous ? (
                                      <strong>{t("anonymousRespondent")}</strong>
                                    ) : getSubmissionRespondentMeta(selectedRecord.submission).walletAddress ? (
                                      <SignalMetaChip
                                        type="contributor"
                                        value={getSubmissionRespondentMeta(selectedRecord.submission).walletAddress ?? ""}
                                      />
                                    ) : (
                                      <strong>{t("notAvailable")}</strong>
                                    )}
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
                                    <span>{t("responseDeadlineLabel")}</span>
                                    <strong>{formatResponseDeadline(selectedRecord.form.responseDeadline, responseDeadlineLabels)}</strong>
                                  </div>
                                  <div className="metadata-row">
                                    <span>{t("walletAccessStatus")}</span>
                                    <strong>
                                      {getWalletAccessLabel(selectedRecord.form, wallet.accountAddress)}
                                    </strong>
                                  </div>
                                  <div className="metadata-row">
                                    <span>Signal sync</span>
                                    <strong>{getSignalSyncSummary(selectedRecord.submission)}</strong>
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
                              </details>
                            </div>
                            <div className="inspector-subsection inspector-seal-subsection">
                              <div>
                                <p className="eyebrow">{t("sealDetailsEyebrow")}</p>
                                <h3>{t("encryptedPayloadDetailsTitle")}</h3>
                              </div>
                              <SealStatusCard
                                encryptSubmissions={selectedRecord.form.encryptSubmissions}
                                canDecrypt={Boolean(wallet.accountAddress)}
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

                        <details
                          className="inspector-panel"
                          open={detailSectionsState.relatedSignalsOpen}
                          onToggle={(event) => {
                            setDetailSectionOpen("relatedSignalsOpen", (event.currentTarget as HTMLDetailsElement).open);
                          }}
                        >
                          <summary>
                            <span>
                              <p className="eyebrow">{t("reviewSupportEyebrow")}</p>
                              <strong>{t("relatedSignalsTitle")}</strong>
                            </span>
                            <span className="inspector-summary">{t("reviewSupportSummary")}</span>
                          </summary>
                          <div className="inspector-panel-body">
                            <RelatedSignalsPanel
                              relatedSignals={relatedSignals}
                              selectedSignalId={selectedSignalId}
                              onSelectRecord={(record) => {
                                if (decryptInFlightRef.current) {
                                  return;
                                }
                                handleSelectDesktopSignal(record.submission.id, { scrollIntoView: true });
                              }}
                            />
                          </div>
                        </details>
                      </div>

                      <div className="inspector-utility-links">
                        <Link className="ghost-button" to={`/dashboard/forms/${selectedRecord.form.id}`}>
                          {t("reviewSubmissions")}
                        </Link>
                      </div>

                    </section>
                  </div>
                  ) : null}
                </>
              )}
            </article>
          </div>
          </section>
          </>
        )}

        {activeWorkspaceTab !== "insights" && activeWorkspaceTab !== "members" ? (
          <AdminOperationsStatus
            items={operationsStatusItems}
            nextActionLabel={nextRecommendedAction.label}
            nextActionDetail={nextRecommendedAction.detail}
            nextActionCta={nextRecommendedAction.cta}
          />
        ) : null}

        {hasProjectManagementAccess && activeWorkspaceTab !== "insights" && activeWorkspaceTab !== "members" ? (
        <details ref={advancedProjectSettingsRef} className="panel advanced-project-settings" open>
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
              {hasProjectManagementAccess ? (
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
      {reviewSessionOpen && selectedRecord ? (
        <div className="modal-backdrop review-session-backdrop" role="presentation" onMouseDown={requestCloseReviewSession}>
          <section
            ref={reviewSessionDialogRef}
            className="answer-card review-session-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-session-title"
            aria-describedby="review-session-description"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="review-session-shell">
              <div className="review-session-header">
                <div>
                  <p className="eyebrow">Review Session</p>
                  <h3 id="review-session-title">{reviewSessionCurrentStep.title}</h3>
                  <p id="review-session-description" className="muted">{reviewSessionCurrentStep.detail}</p>
                </div>
                <div className="review-session-header-actions">
                  <span className={`save-state-pill is-${reviewStatusPillState}`}>{reviewStatusPillLabel}</span>
                  <button
                    type="button"
                    className="review-session-close-button"
                    aria-label={t("closeLabel")}
                    title={t("closeLabel")}
                    onClick={requestCloseReviewSession}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M7 7 17 17" />
                      <path d="M17 7 7 17" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="review-progress-rail review-session-progress" aria-label={t("reviewProgressAriaLabel")}>
                {reviewSessionStepItems.map((step) => {
                  const isCompletedStep = reviewSessionStep > step.id;
                  const isStepLocked = step.id > 1 && selectedRecordNeedsDecrypt && !detailAnswers;
                  return (
                  <button
                    key={step.id}
                    type="button"
                    className={`review-progress-step ${reviewSessionStep === step.id ? "is-current" : isCompletedStep ? "is-complete" : ""}`}
                    onClick={() => {
                      if (!isCompletedStep && (step.id === 1 || !selectedRecordNeedsDecrypt || Boolean(detailAnswers))) {
                        setReviewSessionStep(step.id);
                      }
                    }}
                    disabled={isCompletedStep || isStepLocked}
                  >
                    <span className="review-progress-marker" aria-hidden="true">
                      {isCompletedStep ? "✓" : step.id}
                    </span>
                    <span className="review-progress-copy">
                      <span className="review-progress-step-label">
                        {reviewSessionStep > step.id ? "Done" : reviewSessionStep === step.id ? `Step ${step.id}` : `Step ${step.id}`}
                      </span>
                      <span className="review-progress-title">{step.title}</span>
                    </span>
                  </button>
                );
                })}
              </div>

              {reviewSessionStep === 1 ? (
                <div className="review-session-stage review-session-stage-unlock">
                  <div className="review-session-stage-copy">
                    <strong>Private signal locked</strong>
                    <p className="muted">
                      Decrypt is the primary action in this session. Until the payload is unlocked, the rest of the workflow stays read-only.
                    </p>
                  </div>
                  <div className={`review-session-decrypt-shell ${decrypting || decryptState === "decrypting" ? "is-active" : ""} ${detailAnswers ? "is-unlocked" : ""}`}>
                    <PrivateSignalUnlockCard
                      onUnlock={() => void handleDecrypt()}
                      onClearDebugCache={() => void handleClearDebugPolicyCache()}
                      isDecrypting={decrypting || decryptInFlightRef.current}
                      isUnlocked={Boolean(detailAnswers)}
                      actionLabel="Decrypt signal"
                      unlockState={decryptState}
                      statusMessage={decryptStatusMessage}
                      errorMessage={decryptError}
                      diagnostics={decryptDiagnostics}
                      disabledReason={selectedRecordUnlockDisabledReason}
                      actionDisabled={Boolean(selectedRecordUnlockDisabledReason)}
                      supportContent={(
                        <>
                          <strong>Seal review session</strong>
                          <p className="muted">
                            {t("walletApprovalReuseNotice", { minutes: realSealSessionTtlMinutes })}
                          </p>
                        </>
                      )}
                    >
                      {selectedRecord.submission.encryptedBlobId && !isLocalFallbackBlob(selectedRecord.submission.encryptedBlobId) ? (
                        <StorageProof
                          blobId={selectedRecord.submission.encryptedBlobId}
                          proof={selectedRecord.submission.encryptedWalrusProof ?? selectedRecord.submission.walrusProof}
                          compact
                        />
                      ) : null}
                    </PrivateSignalUnlockCard>
                  </div>
                </div>
              ) : null}

              {reviewSessionStep === 2 ? (
                <div className="review-session-stage review-session-stage-split">
                  <div className="review-session-mobile-tabs" role="tablist" aria-label="Review session sections">
                    <button
                      type="button"
                      role="tab"
                      id="review-session-mobile-tab-answers"
                      aria-selected={reviewSessionMobileTab === "answers"}
                      aria-controls="review-session-mobile-panel-answers"
                      tabIndex={reviewSessionMobileTab === "answers" ? 0 : -1}
                      className={`review-session-mobile-tab ${reviewSessionMobileTab === "answers" ? "is-active" : ""}`}
                      onClick={() => setReviewSessionMobileTab("answers")}
                    >
                      Original signal
                    </button>
                    <button
                      type="button"
                      role="tab"
                      id="review-session-mobile-tab-review"
                      aria-selected={reviewSessionMobileTab === "review"}
                      aria-controls="review-session-mobile-panel-review"
                      tabIndex={reviewSessionMobileTab === "review" ? 0 : -1}
                      className={`review-session-mobile-tab ${reviewSessionMobileTab === "review" ? "is-active" : ""}`}
                      onClick={() => setReviewSessionMobileTab("review")}
                    >
                      {t("reviewClassifyTitle")}
                    </button>
                  </div>

                  <div
                    id="review-session-mobile-panel-answers"
                    role="tabpanel"
                    aria-labelledby="review-session-mobile-tab-answers"
                    className={`review-session-read-panel ${reviewSessionMobileTab === "review" ? "is-mobile-hidden" : ""}`}
                  >
                    <div className="review-session-stage-copy">
                      <strong>Original signal</strong>
                      <p className="muted">Review the submitted signal first, then classify it.</p>
                    </div>
                    <div className="review-session-answer-list">
                      {selectedRecord.form.fields
                        .filter((field) => !isAttachmentFieldType(field.type))
                        .map((field, index) => (
                          <article key={field.id} className="review-session-answer-card">
                            <div className="review-session-question-head">
                              <span className="review-session-question-index">Q{index + 1}</span>
                              <strong>{field.label}</strong>
                            </div>
                            <div>{renderAnswerValue(field, detailAnswers?.[field.id])}</div>
                          </article>
                        ))}
                      {detailAttachments.length > 0 ? (
                        <article className="review-session-answer-card">
                          <span>{t("attachmentsTitle")}</span>
                          <SignalAttachmentList
                            attachments={detailAttachments}
                            attachmentPreviews={attachmentPreviews}
                          />
                        </article>
                      ) : null}
                    </div>
                  </div>

                  <div
                    id="review-session-mobile-panel-review"
                    role="tabpanel"
                    aria-labelledby="review-session-mobile-tab-review"
                    className={`review-stage-card ${reviewSessionMobileTab === "answers" ? "is-mobile-hidden" : ""}`}
                  >
                    <div className="review-stage-header">
                      <p className="eyebrow">{t("stepLabel", { count: 2 })}</p>
                      <strong>{t("reviewClassifyTitle")}</strong>
                    </div>
                    <div className="review-field-grid">
                      <div className="review-badge-field">
                        <span>{t("reviewStateLabel")}</span>
                        <div className="review-badge-options" role="group" aria-label={t("reviewStateLabel")}>
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
                                disabled={isSelected}
                                onClick={() => patchReviewDraft({ status: option.value as Submission["status"] })}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <label className="review-select review-badge-field">
                        <span>{t("triageStatusLabel")}</span>
                        <select
                          value={activeReviewDraft?.triageStatus ?? "new"}
                          onChange={(event) =>
                            patchReviewDraft({
                              triageStatus: event.target.value as Submission["triageStatus"],
                            })
                          }
                        >
                          {TRIAGE_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {getLocalizedTriageStatusLabel(option.value, t)}
                            </option>
                          ))}
                        </select>
                      </label>
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
                                disabled={isSelected}
                                onClick={() => patchReviewDraft({ priority: option.value as Submission["priority"] })}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="review-badge-field">
                        <span>{t("signalValueLabel")}</span>
                        <div className="review-badge-options" role="group" aria-label={t("signalValueLabel")}>
                          <div className="review-star-rating" aria-label={t("signalValueRatingLabel")}>
                            {[1, 2, 3, 4, 5].map((value) => {
                              const currentValue = activeReviewDraft?.signalValue ?? 0;
                              const isSelected = activeReviewDraft?.signalValue === value;
                              const isFilled = currentValue >= value;
                              const canToggleOffToUnscored = value === 1 && activeReviewDraft?.signalValue === 1;
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  className={`review-star-button ${isFilled ? "is-filled" : ""} ${isSelected ? "is-selected" : ""}`}
                                  aria-label={t("signalValueRatingOption", { value })}
                                  aria-pressed={isSelected}
                                  disabled={isSelected && !canToggleOffToUnscored}
                                  onClick={() => patchReviewDraft({ signalValue: canToggleOffToUnscored ? undefined : value })}
                                >
                                  ★
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {reviewSessionStep === 3 ? (
                <div className="review-session-stage">
                  <div className="review-stage-card">
                    <div className="review-stage-header">
                      <p className="eyebrow">{t("stepLabel", { count: 3 })}</p>
                      <strong>{t("reviewerNoteLabel")}</strong>
                    </div>
                    <p className="review-session-internal-note">Internal only. This stays in the review result and is not part of the public signal payload.</p>
                    <label className="review-select">
                      <span>{t("assignedReviewerLabel")}</span>
                      <input
                        type="text"
                        value={activeReviewDraft?.reviewer ?? ""}
                        onChange={(event) => patchReviewDraft({ reviewer: event.target.value })}
                        placeholder={t("reviewerInputPlaceholder")}
                      />
                    </label>
                    <div className="review-notes-actions">
                      <span className="signal-chip signal-chip-soft">{selectedReviewerDisplayLabel || t("unassignedLabel")}</span>
                      {wallet.accountAddress ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => patchReviewDraft({ reviewer: wallet.accountAddress })}
                        >
                          {t("assignToMe")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={`ghost-button ${selectedNeedsFollowUp ? "is-active" : ""}`}
                        disabled={saving}
                        onClick={() => void handleToggleNeedsFollowUp()}
                      >
                        {selectedNeedsFollowUp ? t("followUpEnabledLabel") : t("needsFollowUpLabel")}
                      </button>
                    </div>
                    <label className="review-select">
                      <span>{t("internalNote")}</span>
                      <textarea
                        rows={7}
                        value={activeReviewDraft?.notes ?? ""}
                        onChange={(event) => patchReviewDraft({ notes: event.target.value })}
                        placeholder={t("captureReviewNotes")}
                      />
                    </label>
                    <p className="review-action-helper">{t("reviewUnsavedDraftHelper")}</p>
                  </div>
                </div>
              ) : null}

              {reviewSessionStep === 4 ? (
                <div className="review-session-stage">
                  <div className="review-stage-card review-stage-card-compact-decision">
                    <div className="review-stage-header">
                      <p className="eyebrow">{t("publicRoadmapDecisionStep")}</p>
                      <strong>Public roadmap decision</strong>
                    </div>
                    <p className="muted">
                      Public visibility is handled here. Internal review status above can stay more detailed than what gets surfaced on the roadmap.
                    </p>
                    <div className="review-session-decision-grid">
                      <button
                        type="button"
                        className={`review-state-badge ${!isDraftOnRoadmap && draftTriageStatus !== "closed" ? "is-active" : ""}`}
                        onClick={() => patchReviewDraft({ status: "read" })}
                      >
                        Keep internal
                      </button>
                      <button
                        type="button"
                        className={`review-state-badge is-triage-planned ${isDraftOnRoadmap ? "is-active" : ""}`}
                        onClick={() => patchReviewDraft({
                          status: "read",
                          triageStatus: ROADMAP_READY_STATUSES.has(draftTriageStatus) ? draftTriageStatus : "planned",
                        })}
                      >
                        Publish to roadmap
                      </button>
                      <button
                        type="button"
                        className={`review-state-badge is-triage-closed ${draftTriageStatus === "closed" ? "is-active" : ""}`}
                        onClick={() => patchReviewDraft({ status: "read", triageStatus: "closed" })}
                      >
                        Resolve internally
                      </button>
                      <button
                        type="button"
                        className={`review-state-badge is-status-archived ${draftReviewStatus === "archived" ? "is-active" : ""}`}
                        onClick={() => patchReviewDraft({ status: "archived", triageStatus: "closed" })}
                      >
                        Archive signal
                      </button>
                    </div>
                    <div className="review-result-grid review-result-grid-compact">
                      <div className="review-result-item">
                        <span>{t("roadmapStatusLabel")}</span>
                        <strong>{isDraftOnRoadmap ? "Visible on roadmap" : "Not on roadmap"}</strong>
                      </div>
                      <div className="review-result-item">
                        <span>Public result</span>
                        <strong>{activeReviewDraft ? getPublicDecisionLabel(buildSubmissionFromReviewDraft(selectedRecord.submission, activeReviewDraft), t) : getPublicDecisionLabel(selectedRecord.submission, t)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="review-session-footer">
                {reviewSessionStep === 1 ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      requestCloseReviewSession();
                    }}
                  >
                    {t("closeLabel")}
                  </button>
                ) : (
                  <span aria-hidden="true" />
                )}
                <div className="review-session-footer-actions">
                  {reviewSessionStep < 4 ? (
                    <button
                      ref={reviewSessionPrimaryActionRef}
                      type="button"
                      className="primary-button"
                      disabled={!canAdvanceReviewSession}
                      onClick={() => setReviewSessionStep((current) => (Math.min(4, current + 1) as 1 | 2 | 3 | 4))}
                    >
                      Next step
                    </button>
                  ) : (
                    <button
                      ref={reviewSessionPrimaryActionRef}
                      type="button"
                      className={`primary-button review-save-button ${hasReviewDraftChanges ? "is-draft-ready" : ""}`}
                      disabled={saving || !hasReviewDraftChanges}
                      onClick={async () => {
                        const saved = await saveActiveReviewDraft();
                        if (saved) {
                          forceCloseReviewSession();
                        }
                      }}
                    >
                      {saving ? t("reviewSaveSaving") : t("saveReview")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
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
                      </div>
                    </button>
                    {item.id !== "all" && item.isAccessible ? (
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
