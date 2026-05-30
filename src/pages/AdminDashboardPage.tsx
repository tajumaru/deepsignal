import {
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import "../styles/components/forms-content.css";
import "../styles/components/metadata-proof.css";
import "../styles/components/signal-review.css";
import "../styles/components/wallet-network.css";
import "../styles/pages/admin-inbox.css";
import "../styles/pages/admin-intelligence-timeline.css";
import "../styles/mobile/layout.css";
import "../styles/mobile/workspace.css";
import "../styles/mobile/wallet.css";
import "../styles/mobile/signal.css";
import "../styles/mobile/signal-timeline.css";
import "../styles/mobile/review.css";
import "../styles/mobile/review-session.css";
import "../styles/mobile/private-signal.css";
import "../styles/mobile/inbox.css";
import type { CSSProperties, ReactNode } from "react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CreateFormLink } from "../components/CreateFormLink";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { AdminWorkspaceTabs } from "../components/AdminWorkspaceTabs";
import { EmptyState } from "../components/EmptyState";
import { FormattedAnswerValue } from "../components/FormattedAnswerValue";
import { PrivateSignalUnlockCard } from "../components/PrivateSignalUnlockCard";
import { RichTextContent } from "../components/RichText";
import { ShareCard } from "../components/ShareCard";
import { StorageProof } from "../components/StorageProof";
import { AdminToast } from "../features/admin/components/AdminToast";
import {
  InboxListSkeleton,
  InboxRecoveryPanel,
  WorkspaceInsightsFallback,
} from "../features/admin/components/AdminDashboardStates";
import {
  SignalInboxOnboardingHero,
  WorkspaceShortcutBar,
  type InboxOnboardingState,
} from "../features/admin/components/AdminOnboarding";
import { CsvExportConfirmationModal } from "../features/admin/components/CsvExportConfirmationModal";
import { ProjectWorkspaceModal } from "../features/admin/components/ProjectWorkspaceModal";
import { ProjectMemberManagementSection } from "../features/admin/components/ProjectMemberManagementSection";
import { ReviewResultCard } from "../features/admin/components/ReviewResultCard";
import { ReviewSessionModal } from "../features/admin/components/ReviewSessionModal";
import { SecondaryInspector } from "../features/admin/components/SecondaryInspector";
import { SignalAttachmentList } from "../features/admin/components/SignalAttachmentList";
import { SignalCard } from "../features/admin/components/SignalCard";
import { buildSignalCardIntelligence } from "../features/admin/components/signalIntelligence";
import { SignalTimelineSection } from "../features/admin/components/SignalTimelineSection";
import { MailboxIcon, SignalChannelSelector, SignalStreamsNav } from "../features/admin/components/SignalStreamsNav";
import { WorkspaceActivityLog } from "../features/admin/components/WorkspaceActivityLog";
import { useAdminToast } from "../features/admin/hooks/useAdminToast";
import { usePendingSuiRegistration } from "../features/admin/hooks/usePendingSuiRegistration";
import { usePrivateSignalDecrypt } from "../features/admin/hooks/usePrivateSignalDecrypt";
import { useProjectWorkspace } from "../features/admin/hooks/useProjectWorkspace";
import { createMockAdminWorkspaceData, useMockAdminMode } from "../features/admin/mockAdmin";
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
import { useLongPress } from "../hooks/useLongPress";
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
import { loadVersionedFormSchemas, type VersionedFormSchemas } from "../lib/formVersionSchemas";
import {
  getAssignedReviewer,
  getReviewerNoteUpdatedAt,
  getVisibleReviewerNotes,
  hasNeedsFollowUp,
  NEEDS_FOLLOW_UP_TAG,
  setNeedsFollowUpTag,
} from "../lib/reviewCollaboration";
import { exportSubmissionJson } from "../lib/export";
import type {
  ExportMetadata,
  ExportResponsesToCsvOptions,
  ExportPiiField,
  ResponsesCsvExportScope,
  ResponsesCsvSortOrder,
} from "../lib/exportResponses";
import { getPublicFormPath, getPublicRoadmapPath } from "../lib/publicLinks";
import { ACCESS_CONTROL_PACKAGE_ID, isSuiRateLimitError } from "../lib/sui";
import { clearDeepSignalPolicyCapabilityCache } from "../lib/debugCache";
import { formatResponseDeadline, type ResponseDeadlineLabels } from "../lib/responseDeadline";
import { getSubmissionRespondentMeta } from "../lib/respondentMeta";
import {
  getSubmissionVersionCounts,
  getSubmissionVersion,
  matchesSubmissionVersion,
  type SubmissionVersionFilter,
} from "../lib/submissionVersioning";
import { endPerf, startPerf } from "../lib/perf";
import {
  getSignalPreview,
  getPrivateSignalPayloadState,
  getSignalPersistenceLabel,
  getSignalPersistenceState,
  getSignalSubject,
  hasPrivateSignalPayloadIssue,
  getWalletAccessLabel,
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
const COARSE_POINTER_MEDIA_QUERY = "(pointer: coarse)";
const INITIAL_SIGNAL_LIST_LIMIT = 20;
const SIGNAL_LIST_PAGE_SIZE = 20;
const NODE_LONG_PRESS_MS = 3000;
const NODE_LONG_PRESS_MOVE_THRESHOLD = 18;
const NODE_SWIPE_ACTIVATION_THRESHOLD = 10;
const NODE_SWIPE_DELETE_THRESHOLD = 64;
const NODE_SWIPE_HORIZONTAL_LEEWAY = 56;
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
const LazyWorkspaceInsights = lazy(() => import("../features/admin/components/WorkspaceInsights"));

function loadCsvExportModule() {
  return import("../lib/exportResponses");
}

function loadProjectRegistryWriteModule() {
  return import("../lib/projectRegistry");
}

function loadSuiTransactionModule() {
  return import("@mysten/sui/transactions");
}

function loadWalrusDeleteModule() {
  return import("../storage/walrusAdapter");
}

function normalizeProjectObjectId(value?: string | null) {
  if (!value) {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function getSelectedProjectIdSnapshot() {
  if (typeof window === "undefined") {
    return "";
  }
  const namespace = normalizeProjectObjectId(ACCESS_CONTROL_PACKAGE_ID) || "unconfigured";
  try {
    return normalizeProjectObjectId(window.localStorage.getItem(`deepsignal.projectRegistry.selectedProjectId:${namespace}`));
  } catch {
    return "";
  }
}

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

interface InboxTimelineEvent {
  id: string;
  label: string;
  title: string;
  detail: string;
  timestamp: string;
  tone: "intake" | "analysis" | "positive" | "risk";
}

interface InboxTrendCard {
  id: "rising-topic" | "positive-trend" | "emerging-risk";
  label: string;
  title: string;
  value: string;
  detail: string;
  tone: "topic" | "positive" | "risk";
}

interface InboxTimelineModel {
  events: InboxTimelineEvent[];
  trendCards: InboxTrendCard[];
  responseGrowthLabel: string;
  activeTrendLabel: string;
  unreadCount: number;
  generatedFromCount: number;
  hasTrendData: boolean;
}

const DEMO_SIGNAL_VOLUME_OPTIONS = [0, 3, 5, 20, 100] as const;

type DemoSignalVolume = (typeof DEMO_SIGNAL_VOLUME_OPTIONS)[number];
type DemoSignalScenario = "safari_incident" | "product_feedback" | "disaster_checkin";
type DemoIntelligenceViewMode = "executive" | "developer";
type IntelligenceAlertLevel = "Observation" | "Emerging Pattern" | "Action Recommended" | "Critical Signal";
type IntelligenceConfidenceLabel = "High" | "Medium" | "Low";
type DemoIntelligenceEventType =
  | "trend_unlocked"
  | "insights_unlocked"
  | "evolution_unlocked"
  | "ingest_complete";

interface DemoIntelligenceEvent {
  id: string;
  type: DemoIntelligenceEventType;
  timestamp: number;
  count?: number;
}

interface IntelligenceBrief {
  alertLevel: IntelligenceAlertLevel;
  title: string;
  topTopic: string;
  topTopicCount: number;
  totalSignals: number;
  evidenceCount: number;
  confidence: IntelligenceConfidenceLabel;
  insight: string;
  recommendedAction: string;
  generatedAt: string;
}

interface DemoIntelligenceOutcome {
  topTopic: string;
  topTopicCount: number;
  totalSignals: number;
  topTopicRatio: number;
  insight: string;
  insightShort: string;
  evidenceCount: number;
  followUpQuestion: string;
  followUpShort: string;
  confidenceLabel: IntelligenceConfidenceLabel;
  contribution: string;
  derivedFrom: string[];
  fallbackUsed: boolean;
}

const DEMO_SIGNAL_METADATA_FLAG = "deepSignalDemoOnly";
const DEFAULT_DEMO_SIGNAL_SCENARIO: DemoSignalScenario = "safari_incident";

const DEMO_SIGNAL_SCENARIOS: Record<
  DemoSignalScenario,
  {
    label: string;
    formTitle: string;
    clusterId: string;
    category: Submission["category"];
    keywords: string[];
    summaries: string[];
    subjects: string[];
    answers: string[];
    outcome: {
      topTopic: string;
      insight: string;
      insightShort: string;
      followUp: string;
      followUpShort: string;
      contribution: string;
    };
    alertLevel: IntelligenceAlertLevel;
  }
> = {
  safari_incident: {
    label: "Safari Incident",
    formTitle: "Safari Incident Signal",
    clusterId: "Mobile Safari",
    category: "bug",
    keywords: ["Mobile Safari", "chunk failure", "module script failed", "blank screen", "reload loop", "wallet restore delay"],
    subjects: [
      "Mobile Safari blank screen",
      "Module script failed on iPhone",
      "Chunk failure after reload",
      "Wallet restore delay",
      "Safari reload loop",
    ],
    summaries: [
      "Mobile Safari users report blank screens after loading the review workspace.",
      "Several responses mention module script failures and chunk loading errors on iPhone Safari.",
      "Reload loops are appearing after users attempt to recover the session.",
      "Wallet restore takes longer on Safari when the workspace resumes.",
      "Mobile Safari loading complaints are increasing.",
    ],
    answers: [
      "Mobile Safari shows a blank screen after the loading spinner finishes.",
      "I see a module script failed message and then the page stays empty.",
      "The page enters a reload loop after the chunk failure.",
      "Wallet restore eventually works, but Safari delays the workspace for a long time.",
      "The review screen does not recover cleanly on iPhone Safari.",
    ],
    outcome: {
      topTopic: "Mobile Safari",
      insight: "Mobile Safari loading complaints are increasing.",
      insightShort: "Loading complaints increasing",
      followUp: "What Safari issue are you experiencing?",
      followUpShort: "Follow-up suggested",
      contribution: "Loading complaints increasing",
    },
    alertLevel: "Action Recommended",
  },
  product_feedback: {
    label: "Product Feedback",
    formTitle: "Product Feedback Signal",
    clusterId: "Product Feedback",
    category: "feature",
    keywords: ["love the UI", "mobile layout", "export request", "dashboard complexity", "follow-up request"],
    subjects: [
      "Love the UI",
      "Mobile layout feedback",
      "Export request",
      "Dashboard complexity",
      "Follow-up request",
    ],
    summaries: [
      "Users like the signal intelligence UI and want more guided follow-up actions.",
      "Mobile layout feedback is increasing around compact review controls.",
      "Export requests are appearing from operators who want review snapshots.",
      "Some operators find the dashboard complex during first-time triage.",
      "Follow-up request patterns are emerging from active reviewers.",
    ],
    answers: [
      "I love the UI and the signal cards make review feel much faster.",
      "The mobile layout is useful, but some controls could stack more clearly.",
      "Please add an export option for selected signal groups.",
      "The dashboard is powerful, but new reviewers need clearer next steps.",
      "It would help if DeepSignal suggested follow-up signals automatically.",
    ],
    outcome: {
      topTopic: "Mobile layout",
      insight: "Users like the UI but request export and dashboard simplification.",
      insightShort: "Export and simplification requested",
      followUp: "Which dashboard step feels most complex?",
      followUpShort: "Follow-up suggested",
      contribution: "Export and dashboard simplification requests",
    },
    alertLevel: "Emerging Pattern",
  },
  disaster_checkin: {
    label: "Disaster Check-in",
    formTitle: "Disaster Check-in Signal",
    clusterId: "Disaster Check-in",
    category: "general",
    keywords: ["safe", "need supplies", "location unavailable", "emergency", "family check-in"],
    subjects: [
      "Safe check-in",
      "Need supplies",
      "Location unavailable",
      "Emergency report",
      "Family check-in",
    ],
    summaries: [
      "Several responders are safe, but supply needs are starting to cluster.",
      "Supply requests are increasing across recent check-ins.",
      "Location unavailable reports may require manual follow-up.",
      "Emergency language appears in a small number of high-priority responses.",
      "Family check-in requests are appearing in the current scope.",
    ],
    answers: [
      "We are safe and checking in from the community center.",
      "We need water, batteries, and basic medical supplies.",
      "Location is unavailable on this phone, but we are near the school.",
      "This is an emergency. We need immediate contact.",
      "Please help confirm whether my family has checked in.",
    ],
    outcome: {
      topTopic: "Need supplies",
      insight: "Safety reports are stable, but supply requests are increasing.",
      insightShort: "Supply requests increasing",
      followUp: "What supplies are most urgent?",
      followUpShort: "Follow-up suggested",
      contribution: "Supply requests increasing",
    },
    alertLevel: "Critical Signal",
  },
};

function getDemoSimulationStage(demoSignalVolume: DemoSignalVolume, t: TranslationFn) {
  if (demoSignalVolume >= 100) {
    return {
      index: 4,
      label: t("demoSimulationStageEvolution"),
      title: t("demoSimulationHeroEvolutionTitle"),
      body: t("demoSimulationHeroEvolutionBody"),
    };
  }

  if (demoSignalVolume >= 20) {
    return {
      index: 3,
      label: t("demoSimulationStageInsights"),
      title: t("demoSimulationHeroInsightsTitle"),
      body: t("demoSimulationHeroInsightsBody"),
    };
  }

  if (demoSignalVolume >= 5) {
    return {
      index: 2,
      label: t("demoSimulationStageTrends"),
      title: t("demoSimulationHeroTrendsTitle"),
      body: t("demoSimulationHeroTrendsBody"),
    };
  }

  if (demoSignalVolume >= 3) {
    return {
      index: 1,
      label: t("demoSimulationStageLearning"),
      title: t("demoSimulationHeroLearningTitle"),
      body: t("demoSimulationHeroLearningBody"),
    };
  }

  return {
    index: 0,
    label: t("demoSimulationStageMonitoring"),
    title: t("demoSimulationHeroMonitoringTitle"),
    body: t("demoSimulationHeroMonitoringBody"),
  };
}

function normalizeDemoScenarioId(scenarioId?: string | null): DemoSignalScenario {
  return scenarioId === "product_feedback" || scenarioId === "disaster_checkin" || scenarioId === "safari_incident"
    ? scenarioId
    : DEFAULT_DEMO_SIGNAL_SCENARIO;
}

function getDemoScenarioOutcome(scenarioId?: string | null) {
  return DEMO_SIGNAL_SCENARIOS[normalizeDemoScenarioId(scenarioId)].outcome;
}

function getDemoScenarioAlertLevel(scenarioId?: string | null): IntelligenceAlertLevel {
  return DEMO_SIGNAL_SCENARIOS[normalizeDemoScenarioId(scenarioId)].alertLevel;
}

function getDemoFallbackOutcome(scenarioId?: string | null): DemoIntelligenceOutcome {
  const outcome = getDemoScenarioOutcome(scenarioId);
  return {
    topTopic: outcome.topTopic,
    topTopicCount: 0,
    totalSignals: 0,
    topTopicRatio: 0,
    insight: outcome.insight,
    insightShort: outcome.insightShort,
    evidenceCount: 0,
    followUpQuestion: outcome.followUp,
    followUpShort: outcome.followUpShort,
    confidenceLabel: "Low",
    contribution: outcome.contribution,
    derivedFrom: [],
    fallbackUsed: true,
  };
}

const DEMO_TOPIC_RULES: Array<{
  label: string;
  patterns: string[];
  insight: string;
  insightShort: string;
  followUpQuestion: string;
  contribution: string;
}> = [
  {
    label: "Mobile Safari",
    patterns: ["mobile safari", "iphone safari", "safari", "module script", "chunk", "blank screen", "reload loop", "loading"],
    insight: "Mobile Safari loading complaints are increasing.",
    insightShort: "Loading complaints increasing",
    followUpQuestion: "What Safari issue are you experiencing?",
    contribution: "Loading complaints increasing",
  },
  {
    label: "Mobile layout",
    patterns: ["mobile layout", "mobile controls", "stack", "compact review"],
    insight: "Mobile layout feedback is becoming a repeated product signal.",
    insightShort: "Mobile layout feedback rising",
    followUpQuestion: "Which mobile layout step feels hardest?",
    contribution: "Mobile layout feedback",
  },
  {
    label: "Export request",
    patterns: ["export", "csv", "snapshot", "download"],
    insight: "Export requests are becoming a repeated product need.",
    insightShort: "Export requests repeating",
    followUpQuestion: "Which export format do you need most?",
    contribution: "Export requests",
  },
  {
    label: "Dashboard complexity",
    patterns: ["dashboard complexity", "complex", "first-time triage", "new reviewers", "next steps"],
    insight: "Users like the UI but request dashboard simplification.",
    insightShort: "Simplification requested",
    followUpQuestion: "Which dashboard step feels most complex?",
    contribution: "Dashboard simplification requests",
  },
  {
    label: "Need supplies",
    patterns: ["need supplies", "supplies", "water", "batteries", "medical"],
    insight: "Supply and safety requests are becoming the dominant signal.",
    insightShort: "Supply requests increasing",
    followUpQuestion: "What supplies are most urgent?",
    contribution: "Supply requests increasing",
  },
  {
    label: "Emergency",
    patterns: ["emergency", "immediate", "urgent"],
    insight: "Emergency language is appearing in high-priority responses.",
    insightShort: "Emergency language detected",
    followUpQuestion: "What immediate help is needed?",
    contribution: "Emergency language",
  },
  {
    label: "Safe check-in",
    patterns: ["safe", "check-in", "family check-in", "community center"],
    insight: "Safety reports are stable, but follow-up needs remain visible.",
    insightShort: "Safety reports stable",
    followUpQuestion: "Who still needs a check-in?",
    contribution: "Safety reports",
  },
];

function getSubmissionAnswerText(submission: Submission) {
  return Object.values(submission.answers)
    .map((value) => {
      if (typeof value === "string") {
        return value;
      }
      if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === "string").join(" ");
      }
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

function countPatternMatches(text: string, patterns: string[]) {
  const normalized = text.toLowerCase();
  return patterns.reduce((count, pattern) => count + (normalized.includes(pattern) ? 1 : 0), 0);
}

function buildDemoIntelligenceOutcome(
  demoSignals: SignalRecord[],
  scenarioId: DemoSignalScenario,
): DemoIntelligenceOutcome {
  const fallback = getDemoFallbackOutcome(scenarioId);
  const totalSignals = demoSignals.length;
  if (totalSignals === 0) {
    return fallback;
  }

  const sourceSet = new Set<string>();
  const candidates = new Map<string, {
    label: string;
    patterns: string[];
    matchingIds: Set<string>;
    score: number;
    rule?: (typeof DEMO_TOPIC_RULES)[number];
  }>();

  function ensureCandidate(label: string, patterns = [label.toLowerCase()], rule?: (typeof DEMO_TOPIC_RULES)[number]) {
    const key = label.toLowerCase();
    const current = candidates.get(key);
    if (current) {
      patterns.forEach((pattern) => {
        if (!current.patterns.includes(pattern)) {
          current.patterns.push(pattern);
        }
      });
      return current;
    }
    const next = {
      label,
      patterns,
      matchingIds: new Set<string>(),
      score: 0,
      rule,
    };
    candidates.set(key, next);
    return next;
  }

  DEMO_TOPIC_RULES.forEach((rule) => ensureCandidate(rule.label, rule.patterns, rule));
  demoSignals.forEach(({ submission }) => {
    submission.keywords?.forEach((keyword) => {
      ensureCandidate(keyword, [keyword.toLowerCase()]);
    });
  });

  demoSignals.forEach(({ submission }) => {
    const keywordText = (submission.keywords ?? []).join(" ");
    const summaryText = submission.aiSummary ?? "";
    const subjectText = submission.subjectPreview ?? "";
    const answerText = getSubmissionAnswerText(submission);
    if (keywordText) sourceSet.add("keywords");
    if (summaryText) sourceSet.add("AI summaries");
    if (answerText) sourceSet.add("answer text");
    if (subjectText) sourceSet.add("subject previews");

    candidates.forEach((candidate) => {
      const keywordMatches = countPatternMatches(keywordText, candidate.patterns);
      const summaryMatches = countPatternMatches(summaryText, candidate.patterns);
      const subjectMatches = countPatternMatches(subjectText, candidate.patterns);
      const answerMatches = countPatternMatches(answerText, candidate.patterns);
      const weightedScore = keywordMatches * 2 + summaryMatches * 3 + subjectMatches * 2 + answerMatches * 2;
      if (weightedScore > 0) {
        candidate.matchingIds.add(submission.id);
        candidate.score += weightedScore;
      }
    });
  });

  const ranked = [...candidates.values()]
    .filter((candidate) => candidate.matchingIds.size > 0)
    .sort((left, right) => {
      const countDelta = right.matchingIds.size - left.matchingIds.size;
      if (countDelta !== 0) return countDelta;
      return right.score - left.score;
    });
  const topCandidate = ranked[0];
  if (!topCandidate) {
    return {
      ...fallback,
      totalSignals,
      fallbackUsed: true,
      derivedFrom: [...sourceSet],
    };
  }

  const matchingIds = topCandidate.matchingIds;
  const topTopicCount = matchingIds.size;
  const topTopicRatio = totalSignals > 0 ? topTopicCount / totalSignals : 0;
  const matchedRule =
    topCandidate.rule ??
    DEMO_TOPIC_RULES.find((rule) => rule.patterns.some((pattern) => topCandidate.patterns.includes(pattern))) ??
    null;
  const evidencePatterns = matchedRule?.patterns ?? topCandidate.patterns;
  const evidenceCount = demoSignals.reduce((count, { submission }) => {
    const evidenceText = [
      submission.aiSummary,
      submission.subjectPreview,
      getSubmissionAnswerText(submission),
      ...(submission.keywords ?? []),
    ]
      .filter(Boolean)
      .join(" ");
    return count + (countPatternMatches(evidenceText, evidencePatterns) > 0 ? 1 : 0);
  }, 0);
  const confidenceLabel: DemoIntelligenceOutcome["confidenceLabel"] =
    topTopicRatio >= 0.5 || evidenceCount >= 20
      ? "High"
      : topTopicRatio >= 0.25 || evidenceCount >= 5
        ? "Medium"
        : "Low";

  return {
    topTopic: topCandidate.label,
    topTopicCount,
    totalSignals,
    topTopicRatio,
    insight: matchedRule?.insight ?? fallback.insight,
    insightShort: matchedRule?.insightShort ?? fallback.insightShort,
    evidenceCount,
    followUpQuestion: matchedRule?.followUpQuestion ?? fallback.followUpQuestion,
    followUpShort: fallback.followUpShort,
    confidenceLabel,
    contribution: matchedRule?.contribution ?? fallback.contribution,
    derivedFrom: [...sourceSet],
    fallbackUsed: false,
  };
}

function buildDemoIntelligenceBrief(demoSignals: SignalRecord[], scenarioId: DemoSignalScenario): IntelligenceBrief {
  const outcome = buildDemoIntelligenceOutcome(demoSignals, scenarioId);
  return {
    alertLevel: getDemoScenarioAlertLevel(scenarioId),
    title: outcome.insightShort,
    topTopic: outcome.topTopic,
    topTopicCount: outcome.topTopicCount,
    totalSignals: outcome.totalSignals,
    evidenceCount: outcome.evidenceCount,
    confidence: outcome.confidenceLabel,
    insight: outcome.insight,
    recommendedAction: outcome.followUpQuestion,
    generatedAt: new Date().toISOString(),
  };
}

function getRecommendedActionFromTimeline(model: InboxTimelineModel, records: SignalRecord[], t: TranslationFn) {
  const riskCount = countRiskSignals(records);
  if (riskCount > 0) {
    return t("realBriefRecommendedActionRisk");
  }
  if (model.unreadCount > 0) {
    return t("realBriefRecommendedActionUnread", { count: model.unreadCount });
  }
  if (model.hasTrendData) {
    return t("realBriefRecommendedActionTrend", { topic: model.activeTrendLabel });
  }
  return t("realBriefRecommendedActionMonitor");
}

function getRealBriefAlertLevel(model: InboxTimelineModel, records: SignalRecord[]): IntelligenceAlertLevel {
  if (records.some((record) => record.submission.severity === "high" || record.submission.priority === "high")) {
    return "Critical Signal";
  }
  if (records.some((record) => hasNeedsFollowUp(record.submission))) {
    return "Action Recommended";
  }
  if (model.hasTrendData) {
    return "Emerging Pattern";
  }
  return "Observation";
}

function buildRealIntelligenceBrief(records: SignalRecord[], t: TranslationFn): IntelligenceBrief | null {
  if (records.length === 0) {
    return null;
  }

  const model = buildInboxTimelineModel(records, t);
  const topTopic = model.activeTrendLabel === t("inboxTimelineNoActiveTrend")
    ? getTopTopic(records, { includeFallbackText: false })?.[0] ?? t("realBriefTopTopicFallback")
    : model.activeTrendLabel;
  const topicCount = getTopTopic(records, { includeFallbackText: false })?.[1] ?? (model.hasTrendData ? records.length : 0);
  const latestAnalysisEvent = model.events.find((event) => event.id === "ai-summary");
  const riskCount = countRiskSignals(records);
  const evidenceCount = Math.max(topicCount, riskCount, model.hasTrendData ? records.length : 0);
  const confidence: IntelligenceConfidenceLabel =
    evidenceCount >= 20 || evidenceCount / records.length >= 0.5
      ? "High"
      : evidenceCount >= 5 || model.hasTrendData
        ? "Medium"
        : "Low";

  return {
    alertLevel: getRealBriefAlertLevel(model, records),
    title: latestAnalysisEvent?.detail ? compactTimelineText(latestAnalysisEvent.detail) : model.activeTrendLabel,
    topTopic,
    topTopicCount: topicCount,
    totalSignals: records.length,
    evidenceCount,
    confidence,
    insight: latestAnalysisEvent?.detail ?? t("realBriefInsightFallback", { count: records.length }),
    recommendedAction: getRecommendedActionFromTimeline(model, records, t),
    generatedAt: new Date().toISOString(),
  };
}

function getDemoScenarioIdFromSubmission(submission?: Submission | null): DemoSignalScenario {
  const scenario = submission?.metadata?.scenario;
  if (typeof scenario === "string") {
    return normalizeDemoScenarioId(scenario);
  }
  return DEFAULT_DEMO_SIGNAL_SCENARIO;
}

function getDemoIntelligenceEventContent(
  event: DemoIntelligenceEvent,
  t: TranslationFn,
  outcome: DemoIntelligenceOutcome,
) {
  switch (event.type) {
    case "trend_unlocked":
      return {
        icon: "🔥",
        label: t("demoEventTrendUnlockedLabel"),
        detail: t("demoEventTrendUnlockedDetail", {
          topic: outcome.topTopic,
          count: outcome.topTopicCount,
          total: outcome.totalSignals,
        }),
      };
    case "insights_unlocked":
      return {
        icon: "🧠",
        label: t("demoEventInsightsUnlockedLabel"),
        detail: t("demoEventInsightsUnlockedDetail", { count: outcome.evidenceCount }),
      };
    case "evolution_unlocked":
      return {
        icon: "🌱",
        label: t("demoEventEvolutionUnlockedLabel"),
        detail: t("demoEventEvolutionUnlockedDetail", { confidence: outcome.confidenceLabel }),
      };
    case "ingest_complete":
      return {
        icon: "✓",
        label: t("demoEventIngestCompleteLabel"),
        detail: t("demoEventIngestCompleteDetail", { count: event.count ?? 0 }),
      };
    default:
      return {
        icon: "✓",
        label: t("demoEventIngestCompleteLabel"),
        detail: t("demoEventIngestCompleteDetail", { count: event.count ?? 0 }),
      };
  }
}

function formatDemoIntelligenceEventTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function isDemoSignalSubmission(submission?: Submission | null) {
  return Boolean(submission?.metadata?.[DEMO_SIGNAL_METADATA_FLAG]);
}

function isDemoSignalRecord(record?: SignalRecord | null) {
  return isDemoSignalSubmission(record?.submission);
}

function getDemoSignalVolume(count: number): DemoSignalVolume {
  if (count >= 100) {
    return 100;
  }
  if (count >= 20) {
    return 20;
  }
  if (count >= 5) {
    return 5;
  }
  if (count >= 3) {
    return 3;
  }
  return 0;
}

function buildDemoSignalRecords(scenarioId: DemoSignalScenario, totalCount: number, startIndex = 0): SignalRecord[] {
  const safeScenarioId = normalizeDemoScenarioId(scenarioId);
  const scenario = DEMO_SIGNAL_SCENARIOS[safeScenarioId];
  const now = Date.now();
  const reviewProfiles: Array<{
    priority: Submission["priority"];
    severity: Submission["severity"];
    status: Submission["status"];
    triageStatus: Submission["triageStatus"];
    signalValue: number;
    emotion: string;
    tags: string[];
  }> = [
    {
      priority: "high",
      severity: "high",
      status: "unread",
      triageStatus: "investigating",
      signalValue: 5,
      emotion: "urgent",
      tags: [NEEDS_FOLLOW_UP_TAG, "priority-high"],
    },
    {
      priority: "medium",
      severity: "medium",
      status: "unread",
      triageStatus: "new",
      signalValue: 4,
      emotion: safeScenarioId === "product_feedback" ? "positive" : "concerned",
      tags: ["needs-review"],
    },
    {
      priority: "low",
      severity: "low",
      status: "read",
      triageStatus: "closed",
      signalValue: 2,
      emotion: safeScenarioId === "product_feedback" ? "mixed" : "stable",
      tags: ["low-priority"],
    },
    {
      priority: "medium",
      severity: "low",
      status: "read",
      triageStatus: "investigating",
      signalValue: 3,
      emotion: "watching",
      tags: ["under-review"],
    },
    {
      priority: "high",
      severity: "medium",
      status: "unread",
      triageStatus: "new",
      signalValue: 4,
      emotion: safeScenarioId === "disaster_checkin" ? "urgent" : "frustrated",
      tags: [NEEDS_FOLLOW_UP_TAG],
    },
  ];
  const form: FormWithCount = {
    id: `demo-generator:${safeScenarioId}`,
    title: scenario.formTitle,
    description: "Demo-only generated signals for the current review session.",
    fields: [
      { id: "summary", type: "longText", label: "Signal detail", required: false, sensitive: false },
      { id: "environment", type: "shortText", label: "Environment", required: false, sensitive: false },
    ],
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    creationMode: "admin",
    submissionCount: totalCount,
    signalType: scenario.category === "bug" ? "incident" : scenario.category === "feature" ? "product_voice" : "operation",
    analystType: "operations",
  };

  return Array.from({ length: totalCount }, (_, offset) => {
    const index = startIndex + offset;
    const subject = scenario.subjects[index % scenario.subjects.length];
    const answer = scenario.answers[index % scenario.answers.length];
    const summary = scenario.summaries[index % scenario.summaries.length];
    const createdAt = new Date(now - index * 45_000).toISOString();
    const profile = reviewProfiles[(index * 7 + scenario.keywords.length) % reviewProfiles.length];
    const signalValueOffset = (index + scenario.clusterId.length) % 3 === 0 ? -1 : 0;
    const signalValue = Math.min(5, Math.max(1, profile.signalValue + signalValueOffset));
    const submission: Submission = {
      id: `demo-signal-${safeScenarioId}-${index + 1}`,
      formId: form.id,
      formVersion: 1,
      answers: {
        summary: answer,
        environment: safeScenarioId === "safari_incident" ? "iPhone Safari" : scenario.label,
      },
      attachments: [],
      metadata: {
        [DEMO_SIGNAL_METADATA_FLAG]: true,
        scenario: safeScenarioId,
      },
      category: scenario.category,
      aiSummary: summary,
      severity: profile.severity,
      emotion: profile.emotion,
      keywords: scenario.keywords,
      clusterId: scenario.clusterId,
      status: profile.status,
      priority: profile.priority,
      triageStatus: profile.triageStatus,
      tags: ["demo-only", scenario.clusterId.toLowerCase().replace(/\s+/g, "-"), ...profile.tags],
      notes: profile.tags.includes(NEEDS_FOLLOW_UP_TAG)
        ? "Demo review: follow-up recommended for the current operator workflow."
        : "Demo review: no persistent review action will be saved.",
      signalValue,
      isEncrypted: false,
      subjectPreview: subject,
      ratingValue: safeScenarioId === "product_feedback" ? signalValue : undefined,
      createdAt,
      updatedAt: createdAt,
    };

    return {
      form,
      submission,
      category: scenario.category === "bug" ? "Bug" : scenario.category === "feature" ? "Feature" : "General",
      searchText: [
        scenario.formTitle,
        subject,
        answer,
        summary,
        scenario.keywords.join(" "),
        scenario.clusterId,
        "demo",
      ]
        .join(" ")
        .toLowerCase(),
    };
  });
}

interface TimelineComparisonWindow {
  previousRecords: SignalRecord[];
  recentRecords: SignalRecord[];
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
  if (typeof signalValue !== "number") {
    return t("notScored");
  }
  const normalizedValue = signalValue > 5 ? signalValue / 20 : signalValue;
  const clampedValue = Math.min(5, Math.max(1, normalizedValue));
  return Number.isInteger(clampedValue) ? `${clampedValue}/5` : `${clampedValue.toFixed(1)}/5`;
}

function getSignalValueStars(signalValue: Submission["signalValue"]) {
  if (typeof signalValue !== "number" || signalValue < 1) {
    return null;
  }
  const normalizedValue = signalValue > 5 ? signalValue / 20 : signalValue;
  const filledStars = Math.min(5, Math.max(1, Math.round(normalizedValue)));
  return Array.from({ length: 5 }, (_, index) => index < filledStars);
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

const TOPIC_STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "but",
  "can",
  "for",
  "from",
  "has",
  "have",
  "into",
  "need",
  "needs",
  "not",
  "our",
  "signal",
  "still",
  "that",
  "the",
  "this",
  "with",
  "without",
  "you",
]);

function compactTimelineText(text: string, maxLength = 96) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function getRecordTimestamp(record: SignalRecord, key: "createdAt" | "updatedAt") {
  const fallback = record.submission.createdAt;
  return record.submission[key] || fallback;
}

function extractTrendTopics(record: SignalRecord, options: { includeFallbackText?: boolean } = {}) {
  const includeFallbackText = options.includeFallbackText ?? true;
  const topics = new Set<string>();
  (record.submission.keywords ?? []).forEach((keyword) => {
    const normalized = keyword.trim().toLowerCase();
    if (normalized) {
      topics.add(normalized);
    }
  });
  if (record.submission.clusterId?.trim()) {
    topics.add(record.submission.clusterId.trim().toLowerCase());
  }
  record.submission.tags.forEach((tag) => {
    const normalized = tag.trim().toLowerCase();
    if (normalized && normalized !== NEEDS_FOLLOW_UP_TAG) {
      topics.add(normalized);
    }
  });
  if (includeFallbackText) {
    const fallbackText = `${record.form.title} ${record.submission.subjectPreview ?? ""} ${record.submission.aiSummary ?? ""}`;
    fallbackText
      .toLowerCase()
      .match(/[a-z][a-z0-9-]{3,}/g)
      ?.forEach((word) => {
        if (!TOPIC_STOP_WORDS.has(word)) {
          topics.add(word);
        }
      });
  }
  return [...topics].slice(0, 8);
}

function getSentimentScore(submission: Submission) {
  const corpus = `${submission.emotion ?? ""} ${submission.aiSummary ?? ""} ${submission.subjectPreview ?? ""}`.toLowerCase();
  let score = 0;
  if (/(hopeful|happy|excited|positive|praise|love|good|great|thanks|resolved|momentum)/.test(corpus)) {
    score += 1;
  }
  if (/(urgent|fear|fearful|angry|frustrated|concerned|anxious|drained|guarded|risk|blocked|critical|panic|retaliation)/.test(corpus)) {
    score -= 1;
  }
  if (typeof submission.ratingValue === "number") {
    if (submission.ratingValue >= 4) {
      score += 1;
    } else if (submission.ratingValue <= 2) {
      score -= 1;
    }
  }
  return score;
}

function getSentimentLabel(delta: number, average: number, t: TranslationFn) {
  if (delta >= 0.35) {
    return t("inboxTimelineSentimentImprovingTitle");
  }
  if (delta <= -0.35) {
    return t("inboxTimelineSentimentSofteningTitle");
  }
  if (average > 0.25) {
    return t("inboxTimelineSentimentPositiveTitle");
  }
  if (average < -0.25) {
    return t("inboxTimelineSentimentRiskTitle");
  }
  return t("inboxTimelineSentimentSteadyTitle");
}

function averageSentiment(records: SignalRecord[]) {
  if (records.length === 0) {
    return 0;
  }
  return records.reduce((sum, record) => sum + getSentimentScore(record.submission), 0) / records.length;
}

function countTopics(records: SignalRecord[], options?: { includeFallbackText?: boolean }) {
  const counts = new Map<string, number>();
  records.forEach((record) => {
    extractTrendTopics(record, options).forEach((topic) => {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    });
  });
  return counts;
}

function getTopTopic(records: SignalRecord[], options?: { includeFallbackText?: boolean }) {
  return [...countTopics(records, options).entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0] ?? null;
}

function countRiskSignals(records: SignalRecord[]) {
  return records.filter((record) => isRiskSignal(record)).length;
}

function hasRiskKeyword(submission: Submission) {
  const corpus = `${submission.emotion ?? ""} ${submission.aiSummary ?? ""} ${submission.subjectPreview ?? ""}`.toLowerCase();
  return /(risk|urgent|critical|blocked|failure|fails|unsafe|retaliation|missing|abuse|trapped)/.test(corpus);
}

function isRiskSignal(record: SignalRecord) {
  return (
    record.submission.priority === "high" ||
    record.submission.severity === "high" ||
    hasNeedsFollowUp(record.submission) ||
    hasRiskKeyword(record.submission)
  );
}

function getTimelineComparisonWindow(sorted: SignalRecord[]): TimelineComparisonWindow {
  if (sorted.length === 0) {
    return { previousRecords: [], recentRecords: [] };
  }

  const latestTimestamp = Date.parse(getRecordTimestamp(sorted[sorted.length - 1], "createdAt"));
  if (Number.isFinite(latestTimestamp)) {
    const windowMs = 7 * 24 * 60 * 60 * 1000;
    const recentStart = latestTimestamp - windowMs;
    const previousStart = recentStart - windowMs;
    const recentRecords = sorted.filter((record) => {
      const timestamp = Date.parse(getRecordTimestamp(record, "createdAt"));
      return Number.isFinite(timestamp) && timestamp > recentStart && timestamp <= latestTimestamp;
    });
    const previousRecords = sorted.filter((record) => {
      const timestamp = Date.parse(getRecordTimestamp(record, "createdAt"));
      return Number.isFinite(timestamp) && timestamp > previousStart && timestamp <= recentStart;
    });
    if (recentRecords.length > 0 && previousRecords.length > 0) {
      return { previousRecords, recentRecords };
    }
  }

  const recentSize = Math.min(5, sorted.length);
  const recentRecords = sorted.slice(-recentSize);
  const previousRecords = sorted.slice(Math.max(0, sorted.length - recentSize * 2), sorted.length - recentSize);
  return { previousRecords, recentRecords };
}

function buildInboxTimelineModel(records: SignalRecord[], t: TranslationFn): InboxTimelineModel {
  const sorted = [...records].sort(
    (left, right) => Date.parse(getRecordTimestamp(left, "createdAt")) - Date.parse(getRecordTimestamp(right, "createdAt")),
  );
  const latestRecord = sorted[sorted.length - 1] ?? null;
  const { previousRecords, recentRecords } = getTimelineComparisonWindow(sorted);
  const latestCreatedAt = latestRecord ? getRecordTimestamp(latestRecord, "createdAt") : new Date().toISOString();
  const recentCount = recentRecords.length || sorted.length;
  const previousCount = previousRecords.length;
  const growthDelta = Math.max(0, recentCount - previousCount);
  const summaryRecords = sorted.filter((record) => record.submission.aiSummary?.trim());
  const latestSummaryRecord = [...summaryRecords].sort(
    (left, right) => Date.parse(getRecordTimestamp(right, "updatedAt")) - Date.parse(getRecordTimestamp(left, "updatedAt")),
  )[0] ?? null;
  const recentSentiment = averageSentiment(recentRecords.length > 0 ? recentRecords : sorted);
  const previousSentiment = averageSentiment(previousRecords);
  const sentimentDelta = recentSentiment - previousSentiment;
  const sentimentTitle = getSentimentLabel(sentimentDelta, recentSentiment, t);
  const recentTopicCounts = countTopics(recentRecords.length > 0 ? recentRecords : sorted, { includeFallbackText: false });
  const previousTopicCounts = countTopics(previousRecords, { includeFallbackText: false });
  const risingTopic =
    [...recentTopicCounts.entries()].sort((left, right) => {
      const leftDelta = left[1] - (previousTopicCounts.get(left[0]) ?? 0);
      const rightDelta = right[1] - (previousTopicCounts.get(right[0]) ?? 0);
      return rightDelta - leftDelta || right[1] - left[1] || left[0].localeCompare(right[0]);
    }).find(([topic, count]) => count >= 2 && count > (previousTopicCounts.get(topic) ?? 0)) ?? getTopTopic(sorted, { includeFallbackText: false });
  const hasRealTopic = Boolean(risingTopic && risingTopic[1] >= 2);
  const positiveCount = sorted.filter((record) => getSentimentScore(record.submission) > 0).length;
  const riskCount = countRiskSignals(sorted);
  const hasSentimentDelta = Math.abs(sentimentDelta) >= 0.35;
  const hasRiskSignal = riskCount > 0;
  const latestRiskRecord =
    [...sorted].reverse().find((record) => countRiskSignals([record]) > 0) ?? latestRecord;

  const events: InboxTimelineEvent[] = [
    {
      id: "response-growth",
      label: t("inboxTimelineResponseGrowthLabel"),
      title: t("inboxTimelineResponseGrowthTitle", { count: sorted.length }),
      detail:
        growthDelta > 0
          ? t("inboxTimelineResponseGrowthDetail", { recent: recentCount, delta: growthDelta })
          : t("inboxTimelineResponseSteadyDetail", { recent: recentCount }),
      timestamp: latestCreatedAt,
      tone: "intake" as const,
    },
    latestSummaryRecord
      ? {
          id: "ai-summary",
          label: t("inboxTimelineAiSummaryLabel"),
          title: t("inboxTimelineAiSummaryTitle", { count: summaryRecords.length }),
          detail: compactTimelineText(latestSummaryRecord.submission.aiSummary ?? t("inboxTimelineAiSummaryFallback")),
          timestamp: getRecordTimestamp(latestSummaryRecord, "updatedAt"),
          tone: "analysis" as const,
        }
      : {
          id: "ai-summary",
          label: t("inboxTimelineAiSummaryLabel"),
          title: t("inboxTimelineAiSummaryPendingTitle"),
          detail: t("inboxTimelineAiSummaryPendingDetail"),
          timestamp: latestCreatedAt,
          tone: "analysis" as const,
        },
    {
      id: "sentiment",
      label: t("inboxTimelineSentimentLabel"),
      title: sentimentTitle,
      detail: t("inboxTimelineSentimentDetail", {
        positive: positiveCount,
        risk: riskCount,
      }),
      timestamp: latestRecord ? getRecordTimestamp(latestRecord, "updatedAt") : latestCreatedAt,
      tone: recentSentiment >= 0 ? "positive" as const : "risk" as const,
    },
  ].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));

  const trendCards: InboxTrendCard[] = [
    hasRealTopic && risingTopic
      ? {
      id: "rising-topic",
      label: t("inboxTrendRisingTopicLabel"),
      title: risingTopic[0],
      value: t("inboxTrendSignalCount", { count: risingTopic[1] }),
      detail: t("inboxTrendRisingTopicDetail", { topic: risingTopic[0], count: risingTopic[1] }),
      tone: "topic",
    }
      : null,
    hasSentimentDelta
      ? {
      id: "positive-trend",
      label: t("inboxTrendPositiveLabel"),
      title: positiveCount > 0 ? t("inboxTrendPositiveTitle") : t("inboxTrendPositiveQuietTitle"),
      value: t("inboxTrendSignalCount", { count: positiveCount }),
      detail:
        sentimentDelta > 0
          ? t("inboxTrendPositiveRisingDetail")
          : t("inboxTrendPositiveDetail", { count: positiveCount }),
      tone: "positive",
    }
      : null,
    hasRiskSignal
      ? {
      id: "emerging-risk",
      label: t("inboxTrendRiskLabel"),
      title: t("inboxTrendRiskTitle"),
      value: t("inboxTrendSignalCount", { count: riskCount }),
      detail: latestRiskRecord
        ? compactTimelineText(latestRiskRecord.submission.aiSummary || latestRiskRecord.submission.subjectPreview || t("inboxTrendRiskFallback"))
        : t("inboxTrendRiskQuietDetail"),
      tone: "risk",
    }
      : null,
  ].filter((card): card is InboxTrendCard => Boolean(card));

  return {
    events,
    trendCards,
    responseGrowthLabel:
      growthDelta > 0
        ? t("inboxTimelineGrowthPill", { delta: growthDelta })
        : t("inboxTimelineGrowthSteadyPill"),
    activeTrendLabel: hasRealTopic && risingTopic && sorted.length > 0 ? risingTopic[0] : t("inboxTimelineNoActiveTrend"),
    unreadCount: sorted.filter((record) => record.submission.status === "unread").length,
    generatedFromCount: sorted.length,
    hasTrendData: sorted.length >= 5 && trendCards.length > 0,
  };
}

function buildDemoSimulationTimelineModel(
  baseModel: InboxTimelineModel,
  demoSignalVolume: DemoSignalVolume,
  t: TranslationFn,
  outcome: DemoIntelligenceOutcome,
): InboxTimelineModel {
  const now = new Date().toISOString();
  const demoTrendUnlocked = demoSignalVolume >= 5;
  const demoAiUnlocked = demoSignalVolume >= 20;
  const demoEvolutionUnlocked = demoSignalVolume >= 100;
  const trendCards: InboxTrendCard[] = [];

  if (demoTrendUnlocked) {
    trendCards.push({
      id: "rising-topic",
      label: t("inboxTrendRisingTopicLabel"),
      title: outcome.topTopic,
      value: t("inboxTrendSignalCount", { count: demoSignalVolume }),
      detail: t("demoOutcomeTopTopicEvidence", {
        count: outcome.topTopicCount,
        total: outcome.totalSignals,
      }),
      tone: "topic",
    });
  }

  if (demoAiUnlocked) {
    trendCards.push({
      id: "positive-trend",
      label: t("intelligenceCenterAiInsightsTitle"),
      title: t("demoSimulationAiInsightTitle"),
      value: t("inboxTrendSignalCount", { count: demoSignalVolume }),
      detail: outcome.insight,
      tone: "positive",
    });
  }

  if (demoEvolutionUnlocked) {
    trendCards.push({
      id: "emerging-risk",
      label: t("intelligenceCenterSignalEvolutionTitle"),
      title: t("demoSimulationSignalEvolutionTitle"),
      value: t("inboxTrendSignalCount", { count: demoSignalVolume }),
      detail: t("demoOutcomeFollowUpValue", { followUp: outcome.followUpQuestion }),
      tone: "risk",
    });
  }

  return {
    ...baseModel,
    events: [
      {
        id: "response-growth",
        label: t("inboxTimelineResponseGrowthLabel"),
        title: t("inboxTimelineResponseGrowthTitle", { count: demoSignalVolume }),
        detail:
          demoSignalVolume === 0
            ? t("intelligenceUnlockMonitoringWaiting")
            : t("demoSimulationResponseGrowthDetail", { count: demoSignalVolume }),
        timestamp: now,
        tone: "intake",
      },
      {
        id: "ai-summary",
        label: t("inboxTimelineAiSummaryLabel"),
        title: demoAiUnlocked ? t("intelligenceUnlockAiUnlocked") : t("inboxTimelineAiSummaryPendingTitle"),
        detail: demoAiUnlocked ? outcome.insight : t("inboxTimelineAiSummaryPendingDetail"),
        timestamp: now,
        tone: "analysis",
      },
    ],
    trendCards,
    responseGrowthLabel: demoSignalVolume === 0 ? t("inboxTimelineGrowthSteadyPill") : t("demoSimulationCountPill", { count: demoSignalVolume }),
    activeTrendLabel: demoTrendUnlocked ? outcome.topTopic : t("inboxTimelineNoActiveTrend"),
    unreadCount: demoSignalVolume,
    generatedFromCount: demoSignalVolume,
    hasTrendData: demoTrendUnlocked,
  };
}

function InboxTimelineOverview({
  model,
  t,
  compact = false,
  demoSignalCount = 0,
  realSignalCount,
  demoGenerating = false,
  demoIngestTarget = null,
  demoArrivalAlert = null,
  demoEventFeed = [],
  demoScenario = DEFAULT_DEMO_SIGNAL_SCENARIO,
  demoOutcome = getDemoFallbackOutcome(demoScenario),
  demoIntelligenceViewMode = "executive",
  latestBrief = null,
  onOpenDemoBrief,
}: {
  model: InboxTimelineModel;
  t: TranslationFn;
  compact?: boolean;
  demoSignalCount?: number;
  realSignalCount?: number;
  demoGenerating?: boolean;
  demoIngestTarget?: 5 | 20 | 100 | null;
  demoArrivalAlert?: string | null;
  demoEventFeed?: DemoIntelligenceEvent[];
  demoScenario?: DemoSignalScenario;
  demoOutcome?: DemoIntelligenceOutcome;
  demoIntelligenceViewMode?: DemoIntelligenceViewMode;
  latestBrief?: IntelligenceBrief | null;
  onOpenDemoBrief?: () => void;
}) {
  const liveFeedEvents = demoEventFeed.slice(-8);
  const effectiveDemoOutcome = demoOutcome;
  const demoModeVisible = demoSignalCount > 0 || demoGenerating || liveFeedEvents.length > 0;
  const showDeveloperDemoFeed = demoIntelligenceViewMode === "developer";
  const currentDemoStage =
    model.generatedFromCount >= 100
      ? 4
      : model.generatedFromCount >= 20
        ? 3
        : model.generatedFromCount >= 5
          ? 2
          : 1;
  const storyStages = [
    { id: 1, label: t("demoStoryStageMonitoring"), detail: t("demoStoryStageMonitoringDetail") },
    {
      id: 2,
      label: t("demoStoryStageTrendDetection"),
      detail: currentDemoStage >= 2 ? t("demoOutcomeTopTopicValue", { topic: effectiveDemoOutcome.topTopic }) : t("demoSimulationLockedStatus"),
    },
    {
      id: 3,
      label: t("demoStoryStageAiInsights"),
      detail: currentDemoStage >= 3 ? effectiveDemoOutcome.insightShort : t("demoSimulationLockedStatus"),
    },
    {
      id: 4,
      label: t("demoStoryStageSignalEvolution"),
      detail: currentDemoStage >= 4 ? effectiveDemoOutcome.followUpShort : t("demoSimulationLockedStatus"),
    },
  ];
  if (compact) {
    return (
      <section className="inbox-timeline-overview is-compact" aria-label={t("inboxActivityTitle")}>
        <div className="inbox-timeline-overview-head">
          <div>
            <p className="eyebrow">{t("inboxActivityEyebrow")}</p>
            <h3>{t("inboxActivityTitle")}</h3>
          </div>
        </div>
        <div className="inbox-activity-chip-row">
          <span>{t("inboxActivityResponses", { count: model.generatedFromCount })}</span>
          {demoModeVisible ? (
            <>
              {model.generatedFromCount >= 5 ? (
                <span>{t("demoActivityTopTopic", { topic: effectiveDemoOutcome.topTopic })}</span>
              ) : null}
              {model.generatedFromCount >= 20 ? (
                <span>{t("demoActivityInsight", { insight: effectiveDemoOutcome.insightShort })}</span>
              ) : null}
              {model.generatedFromCount >= 100 ? (
                <span>{t("demoActivityNextAction", { action: effectiveDemoOutcome.followUpShort })}</span>
              ) : null}
              <span className="is-subtle">{t("demoSignalMixLabel", { demo: demoSignalCount, real: realSignalCount ?? 0 })}</span>
            </>
          ) : (
            <>
              <span>{t("inboxActivityUnread", { count: model.unreadCount })}</span>
              <span>{model.activeTrendLabel}</span>
              <span>{model.responseGrowthLabel}</span>
            </>
          )}
        </div>
        {demoGenerating && demoIngestTarget ? (
          <div className="inbox-demo-receiving" role="status" aria-live="polite">
            <div>
              <span>{t("demoReceivingSignalsLabel")}</span>
              <strong>{t("demoReceivedProgress", { count: demoSignalCount, target: demoIngestTarget })}</strong>
            </div>
            <span className="inbox-demo-receiving-track">
              <span
                className="inbox-demo-receiving-fill"
                style={{ width: `${Math.min(100, Math.round((demoSignalCount / demoIngestTarget) * 100))}%` }}
              />
            </span>
          </div>
        ) : null}
        {!demoGenerating && demoArrivalAlert ? (
          <div className="inbox-demo-arrival-alert" role="status" aria-live="polite">
            <strong>{t("demoSignalArrivedTitle")}</strong>
            <span>{demoArrivalAlert}</span>
          </div>
        ) : null}
        {latestBrief ? (
          <article className={`latest-intelligence-card is-${(latestBrief?.alertLevel ?? "Observation").toLowerCase().replace(/\s+/g, "-")}`}>
            <div>
              <span>{t("latestIntelligenceTitle")}</span>
              <strong>{latestBrief?.title ?? effectiveDemoOutcome.insightShort}</strong>
              <small>{t("latestIntelligenceMeta", { level: latestBrief?.alertLevel ?? "Observation", count: latestBrief?.evidenceCount ?? effectiveDemoOutcome.evidenceCount })}</small>
            </div>
            {onOpenDemoBrief ? (
              <button type="button" onClick={onOpenDemoBrief}>
                {t("latestIntelligenceOpenBrief")}
              </button>
            ) : null}
          </article>
        ) : null}
        {!demoGenerating && showDeveloperDemoFeed && liveFeedEvents.length > 0 ? (
          <div className="demo-event-feed" aria-label={t("demoEventFeedTitle")}>
            <div className="demo-event-feed-head">
              <strong>{t("demoEventFeedTitle")}</strong>
              <span>{t("demoEventFeedStoryLabel")}</span>
            </div>
            <div className="demo-event-stage-strip" aria-label={t("demoEventFeedStageLabel")}>
              {storyStages.map((stage) => (
                <span
                  key={stage.id}
                  className={`${stage.id === currentDemoStage ? "is-current" : ""} ${stage.id < currentDemoStage ? "is-complete" : ""}`}
                >
                  <strong>{t("demoEventFeedStageNumber", { count: stage.id })}</strong>
                  <em>{stage.label}</em>
                  <small>{stage.detail}</small>
                </span>
              ))}
            </div>
            <ol>
              {liveFeedEvents.map((event, index) => {
                const content = getDemoIntelligenceEventContent(event, t, effectiveDemoOutcome);
                const newest = index === liveFeedEvents.length - 1;
                return (
                  <li key={event.id} className={`demo-event-feed-item is-${event.type} ${newest ? "is-newest" : ""}`}>
                    <time>{formatDemoIntelligenceEventTime(event.timestamp)}</time>
                    <span className="demo-event-feed-icon" aria-hidden="true">
                      {content.icon}
                    </span>
                    <span className="demo-event-feed-copy">
                      <strong>{content.label}</strong>
                      <span>{content.detail}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
        {model.generatedFromCount === 0 ? (
          <p className="muted inbox-timeline-derived-note">{t("inboxActivityInsufficientData")}</p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="inbox-timeline-overview" aria-label={t("inboxTimelineOverviewTitle")}>
      <div className="inbox-timeline-overview-head">
        <div>
          <p className="eyebrow">{t("inboxTimelineOverviewEyebrow")}</p>
          <h3>{t("inboxTimelineOverviewTitle")}</h3>
          <p className="muted">{t("inboxTimelineOverviewBody", { count: model.generatedFromCount })}</p>
        </div>
        <span className="signal-chip signal-chip-soft">{model.responseGrowthLabel}</span>
      </div>

      <div className="inbox-timeline-event-strip">
        {model.events.map((event) => (
          <article key={event.id} className={`inbox-timeline-event is-${event.tone}`}>
            <div className="inbox-timeline-event-meta">
              <span>{event.label}</span>
              <time dateTime={event.timestamp} title={formatDate(event.timestamp)}>
                {formatDate(event.timestamp)}
              </time>
            </div>
            <strong>{event.title}</strong>
            <p>{event.detail}</p>
          </article>
        ))}
      </div>

      {model.hasTrendData ? (
        <div className="inbox-trend-card-grid" aria-label={t("inboxTrendCardsTitle")}>
          {model.trendCards.map((card) => (
            <article key={card.id} className={`inbox-trend-card is-${card.tone}`}>
              <span className="inbox-trend-card-label">{card.label}</span>
              <strong>{card.title}</strong>
              <span className="inbox-trend-card-value">{card.value}</span>
              <p>{card.detail}</p>
            </article>
          ))}
        </div>
      ) : null}
      <p className="muted inbox-timeline-derived-note">{t("inboxTimelineOverviewDerivedHint")}</p>
    </section>
  );
}

function SignalIntelligenceCenter({
  model,
  t,
  demoSimulationEnabled,
  demoControlsEnabled,
  demoSignalVolume,
  demoScenario,
  demoSignalCount,
  realSignalCount,
  demoOutcome,
  intelligenceBrief,
  demoIntelligenceViewMode,
  demoGenerating,
  demoIngestTarget,
  demoUnlockAlert,
  onDemoIntelligenceViewModeChange,
  onDemoScenarioChange,
  onGenerateDemoSignals,
  onCancelDemoIngest,
  onResetDemoSignals,
}: {
  model: InboxTimelineModel;
  t: TranslationFn;
  demoSimulationEnabled: boolean;
  demoControlsEnabled: boolean;
  demoSignalVolume: DemoSignalVolume;
  demoScenario: DemoSignalScenario;
  demoSignalCount: number;
  realSignalCount: number;
  demoOutcome: DemoIntelligenceOutcome;
  intelligenceBrief: IntelligenceBrief | null;
  demoIntelligenceViewMode: DemoIntelligenceViewMode;
  demoGenerating: boolean;
  demoIngestTarget: 5 | 20 | 100 | null;
  demoUnlockAlert: string | null;
  onDemoIntelligenceViewModeChange: (mode: DemoIntelligenceViewMode) => void;
  onDemoScenarioChange: (scenario: DemoSignalScenario) => void;
  onGenerateDemoSignals: (targetCount: 5 | 20 | 100) => void;
  onCancelDemoIngest: () => void;
  onResetDemoSignals: () => void;
}) {
  const safeDemoScenario = normalizeDemoScenarioId(demoScenario);
  const effectiveModel = demoSimulationEnabled ? buildDemoSimulationTimelineModel(model, demoSignalVolume, t, demoOutcome) : model;
  const empty = effectiveModel.generatedFromCount === 0;
  const isDeveloperDemoMode = !demoSimulationEnabled || demoIntelligenceViewMode === "developer";
  const demoStage = getDemoSimulationStage(demoSignalVolume, t);
  const demoStepOptions = DEMO_SIGNAL_VOLUME_OPTIONS.map((volume) => ({
    volume,
    label:
      volume === 0
        ? t("demoSimulationStageMonitoring")
        : volume === 3
          ? t("demoSimulationStageLearning")
          : volume === 5
            ? t("demoSimulationStageTrends")
            : volume === 20
              ? t("demoSimulationStageInsights")
              : t("demoSimulationStageEvolution"),
  }));
  const unlockStages = [
    {
      id: "monitoring",
      label: t("intelligenceUnlockMonitoringLabel"),
      threshold: 0,
      unlocked: true,
      detail: empty ? t("intelligenceUnlockMonitoringWaiting") : t("intelligenceUnlockMonitoringActive"),
      current: demoSimulationEnabled && demoSignalVolume < 5,
    },
    {
      id: "trend-detection",
      label: t("selectedSignalTrendDetectionLabel"),
      threshold: 5,
      unlocked: effectiveModel.hasTrendData,
      detail: effectiveModel.hasTrendData
        ? t("demoOutcomeTopTopicValue", { topic: demoOutcome.topTopic })
        : t("intelligenceUnlockTrendLocked", { count: Math.max(0, 5 - effectiveModel.generatedFromCount) }),
      current: demoSimulationEnabled && demoSignalVolume >= 5 && demoSignalVolume < 20,
    },
    {
      id: "ai-insights",
      label: t("intelligenceCenterAiInsightsTitle"),
      threshold: 20,
      unlocked: effectiveModel.generatedFromCount >= 20,
      detail:
        effectiveModel.generatedFromCount >= 20
          ? demoOutcome.insightShort
          : t("intelligenceUnlockAiLocked", { count: Math.max(0, 20 - effectiveModel.generatedFromCount) }),
      current: demoSimulationEnabled && demoSignalVolume >= 20 && demoSignalVolume < 100,
    },
    {
      id: "signal-evolution",
      label: t("intelligenceCenterSignalEvolutionTitle"),
      threshold: 100,
      unlocked: effectiveModel.generatedFromCount >= 100,
      detail:
        effectiveModel.generatedFromCount >= 100
          ? demoOutcome.followUpShort
          : t("intelligenceUnlockEvolutionLocked", { count: Math.max(0, 100 - effectiveModel.generatedFromCount) }),
      current: demoSimulationEnabled && demoSignalVolume >= 100,
    },
  ];
  const intelligencePlaceholders = [
    {
      id: "live-trends",
      label: t("intelligenceCenterLiveTrendsTitle"),
      detail: empty ? t("intelligenceCenterLiveTrendsEmpty") : demoSimulationEnabled ? demoOutcome.topTopic : effectiveModel.activeTrendLabel,
      unlocked: effectiveModel.hasTrendData,
    },
    {
      id: "ai-insights",
      label: t("intelligenceCenterAiInsightsTitle"),
      detail: empty
        ? t("intelligenceCenterAiInsightsEmpty")
        : demoSimulationEnabled && effectiveModel.generatedFromCount >= 20
          ? demoOutcome.insight
          : effectiveModel.events.find((event) => event.id === "ai-summary")?.detail ?? t("inboxTimelineAiSummaryPendingDetail"),
      unlocked: effectiveModel.generatedFromCount >= 20,
    },
    {
      id: "follow-up",
      label: t("intelligenceCenterFollowUpTitle"),
      detail: empty
        ? t("intelligenceCenterFollowUpEmpty")
        : demoSimulationEnabled && effectiveModel.generatedFromCount >= 100
          ? demoOutcome.followUpQuestion
          : effectiveModel.unreadCount > 0
          ? t("intelligenceCenterFollowUpUnread", { count: effectiveModel.unreadCount })
          : t("intelligenceCenterFollowUpStable"),
      unlocked: effectiveModel.generatedFromCount >= 100 || (!demoSimulationEnabled && !empty && effectiveModel.unreadCount > 0),
    },
  ];

  return (
    <section className={`signal-intelligence-center ${empty ? "is-empty" : ""} ${demoSimulationEnabled ? "is-demo-simulation" : ""}`}>
      <div className="signal-intelligence-center-head">
        <p className="eyebrow">{t("signalIntelligenceEyebrow")}</p>
        <h2>{t("signalIntelligenceCenterTitle")}</h2>
        <p className="muted">
          {demoSimulationEnabled
            ? t("demoSimulationDisclosure")
            : empty
              ? t("signalIntelligenceCenterEmptyBody")
              : t("signalIntelligenceCenterBody", { count: effectiveModel.generatedFromCount })}
        </p>
      </div>
      {demoControlsEnabled ? (
      <div className="demo-simulation-control" aria-label={t("demoSimulationTitle")}>
        <div className="demo-simulation-toggle-row">
          <div>
            <strong>{t("demoGeneratorTitle")}</strong>
            <span>{t("demoGeneratorBody")}</span>
          </div>
          <span className={`demo-generator-state ${demoSimulationEnabled ? "is-active" : ""}`}>
            {demoSimulationEnabled ? t("demoModeActiveLabel") : t("demoModeReadyLabel")}
          </span>
        </div>
        <p className="demo-only-disclosure">{t("demoModeOnlyDisclosure")}</p>
        <div className="demo-generator-controls">
          <label>
            <span>{t("demoScenarioLabel")}</span>
            <select
              value={safeDemoScenario}
              onChange={(event) => onDemoScenarioChange(event.target.value as DemoSignalScenario)}
              disabled={demoGenerating}
            >
              {(Object.keys(DEMO_SIGNAL_SCENARIOS) as DemoSignalScenario[]).map((scenarioId) => (
                <option key={scenarioId} value={scenarioId}>
                  {DEMO_SIGNAL_SCENARIOS[scenarioId].label}
                </option>
              ))}
            </select>
          </label>
          <div className="demo-generator-actions" aria-label={t("demoGeneratorTitle")}>
            <button type="button" onClick={() => onGenerateDemoSignals(5)} disabled={demoGenerating}>
              {t("demoGenerateFive")}
            </button>
            <button type="button" onClick={() => onGenerateDemoSignals(20)} disabled={demoGenerating}>
              {t("demoGenerateTwenty")}
            </button>
            <button type="button" onClick={() => onGenerateDemoSignals(100)} disabled={demoGenerating}>
              {t("demoGenerateHundred")}
            </button>
            {demoGenerating ? (
              <button type="button" className="is-secondary" onClick={onCancelDemoIngest}>
                {t("demoCancelIngest")}
              </button>
            ) : null}
            <button type="button" className="is-secondary" onClick={onResetDemoSignals} disabled={demoSignalCount === 0 && !demoGenerating}>
              {t("demoReset")}
            </button>
          </div>
          {demoGenerating && demoIngestTarget ? (
            <div className="demo-ingest-status" role="status" aria-live="polite">
              <div className="demo-ingest-status-head">
                <span>{t("demoIngestingLabel")}</span>
                <strong>{t("demoIngestProgress", { count: demoSignalCount, target: demoIngestTarget })}</strong>
              </div>
              <span className="demo-ingest-progress-track">
                <span
                  className="demo-ingest-progress-fill"
                  style={{ width: `${Math.min(100, Math.round((demoSignalCount / demoIngestTarget) * 100))}%` }}
                />
              </span>
            </div>
          ) : null}
          <div className="demo-intelligence-mode-switch" role="group" aria-label={t("demoIntelligenceModeLabel")}>
            <button
              type="button"
              className={demoIntelligenceViewMode === "executive" ? "is-active" : ""}
              onClick={() => onDemoIntelligenceViewModeChange("executive")}
            >
              {t("demoIntelligenceExecutiveMode")}
            </button>
            <button
              type="button"
              className={demoIntelligenceViewMode === "developer" ? "is-active" : ""}
              onClick={() => onDemoIntelligenceViewModeChange("developer")}
            >
              {t("demoIntelligenceDeveloperMode")}
            </button>
          </div>
          <p>{t("demoGeneratorDisclosure")}</p>
        </div>
        {demoSimulationEnabled && demoIntelligenceViewMode === "developer" ? (
          <div className="demo-simulation-volume-control">
            <article className={`demo-simulation-stage-hero ${demoSignalVolume >= 100 ? "is-evolution" : ""}`}>
              {demoUnlockAlert ? (
                <div className="demo-unlock-alert" role="status" aria-live="polite">
                  {demoUnlockAlert}
                </div>
              ) : null}
              <span>{t("demoSimulationStageCounter", { stage: demoStage.index })}</span>
              <strong>{demoStage.title}</strong>
              <em>{t("demoSimulationSignalVolumeValue", { count: demoSignalCount })}</em>
              <p>{demoStage.body}</p>
              {demoSignalVolume >= 100 ? (
                <div className="demo-simulation-follow-up-callout">
                  <span>{t("selectedSignalFollowUpLabel")}</span>
                  <strong>“{demoOutcome.followUpQuestion}”</strong>
                  <button type="button" disabled>
                    {t("demoSimulationCreateFollowUpCta")}
                  </button>
                </div>
              ) : null}
            </article>
            <div className="demo-simulation-volume-head">
              <span>{t("demoSimulationProgressTitle")}</span>
              <strong>{t("demoSignalMixLabel", { demo: demoSignalCount, real: realSignalCount })}</strong>
            </div>
            <div className="demo-simulation-volume-options" role="group" aria-label={t("demoSimulationProgressTitle")}>
              {demoStepOptions.map((step) => (
                <span
                  key={step.volume}
                  className={step.volume === demoSignalVolume ? "is-active" : ""}
                >
                  <span>{step.volume}</span>
                  <strong>{step.label}</strong>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      ) : null}
      {demoSimulationEnabled && demoIntelligenceViewMode === "executive" ? (
        <ExecutiveBriefCard
          t={t}
          brief={intelligenceBrief ?? buildDemoIntelligenceBrief([], demoScenario)}
          demoSignalCount={demoSignalCount}
          realSignalCount={realSignalCount}
          mixLabel={t("demoSignalMixLabel", { demo: demoSignalCount, real: realSignalCount })}
        />
      ) : null}
      {isDeveloperDemoMode ? (
      <div className="signal-intelligence-center-metrics">
        <span>{t("inboxActivityResponses", { count: effectiveModel.generatedFromCount })}</span>
        {demoSimulationEnabled ? (
          <>
            {effectiveModel.generatedFromCount >= 5 ? (
              <span>{t("demoActivityTopTopic", { topic: demoOutcome.topTopic })}</span>
            ) : null}
            {effectiveModel.generatedFromCount >= 20 ? (
              <span>{t("demoActivityInsight", { insight: demoOutcome.insightShort })}</span>
            ) : null}
            {effectiveModel.generatedFromCount >= 100 ? (
              <span>{t("demoActivityNextAction", { action: demoOutcome.followUpShort })}</span>
            ) : null}
            <span className="is-subtle">{t("demoSignalMixLabel", { demo: demoSignalCount, real: realSignalCount })}</span>
          </>
        ) : (
          <>
            <span>{t("inboxActivityUnread", { count: effectiveModel.unreadCount })}</span>
            <span>{effectiveModel.responseGrowthLabel}</span>
          </>
        )}
      </div>
      ) : null}
      {isDeveloperDemoMode && demoSimulationEnabled && effectiveModel.generatedFromCount >= 5 ? (
        <article className="demo-outcome-summary-card">
          <span>{t("demoOutcomeSummaryTitle")}</span>
          <div>
            <strong>{t("demoOutcomeTopTopicLabel")}</strong>
            <p>{demoOutcome.topTopic}</p>
            <small>{t("demoOutcomeTopTopicEvidence", { count: demoOutcome.topTopicCount, total: demoOutcome.totalSignals })}</small>
          </div>
          {effectiveModel.generatedFromCount >= 20 ? (
            <div>
              <strong>{t("demoOutcomeInsightLabel")}</strong>
              <p>{demoOutcome.insight}</p>
              <small>{t("demoOutcomeInsightEvidence", { count: demoOutcome.evidenceCount })}</small>
            </div>
          ) : null}
          {effectiveModel.generatedFromCount >= 100 ? (
            <div>
              <strong>{t("demoOutcomeFollowUpLabel")}</strong>
              <p>“{demoOutcome.followUpQuestion}”</p>
              <small>{t("demoOutcomeConfidence", { confidence: demoOutcome.confidenceLabel })}</small>
            </div>
          ) : null}
          <em>
            {demoOutcome.derivedFrom.length > 0
              ? t("demoOutcomeDerivedFrom", { sources: demoOutcome.derivedFrom.join(", ") })
              : t("demoOutcomeFallbackUsed")}
          </em>
        </article>
      ) : null}
      {isDeveloperDemoMode ? (
      <div className="intelligence-unlock-panel" aria-label={t("intelligenceUnlockTitle")}>
        <div className="intelligence-unlock-panel-head">
          <strong>{t("intelligenceUnlockTitle")}</strong>
          <span>{t("intelligenceUnlockSignalCount", { count: effectiveModel.generatedFromCount })}</span>
        </div>
        <div className="intelligence-unlock-stage-list">
          {unlockStages.map((stage) => (
            <article
              key={stage.id}
              className={`intelligence-unlock-stage ${stage.unlocked ? "is-unlocked" : "is-locked"} ${stage.current ? "is-current" : ""}`}
            >
              <span className="intelligence-unlock-stage-marker" aria-hidden="true">
                {stage.unlocked ? "✓" : stage.threshold}
              </span>
              <div>
                <strong>{stage.label}</strong>
                <p>{stage.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
      ) : null}
      {isDeveloperDemoMode && empty ? (
        <article className="signal-intelligence-readiness-card">
          <span>{t("intelligenceReadinessLabel")}</span>
          <strong>{t("intelligenceReadinessTitle")}</strong>
          <p>{t("intelligenceReadinessBody")}</p>
          <ul>
            <li>{t("intelligenceCenterLiveTrendsTitle")}</li>
            <li>{t("intelligenceCenterAiInsightsTitle")}</li>
            <li>{t("intelligenceCenterFollowUpTitle")}</li>
            <li>{t("intelligenceCenterSignalEvolutionTitle")}</li>
          </ul>
        </article>
      ) : null}
      {isDeveloperDemoMode ? (
      <div className="signal-intelligence-center-card-grid">
        {intelligencePlaceholders.map((card) => (
          <article
            key={card.id}
            className={`signal-intelligence-center-card ${empty ? "is-waiting" : ""} ${card.unlocked ? "is-unlocked" : "is-locked"}`}
          >
            <span className="signal-intelligence-card-status">
              {card.unlocked ? t("demoSimulationUnlockedStatus") : t("demoSimulationLockedStatus")}
            </span>
            <strong>{card.label}</strong>
            <p>{card.detail}</p>
          </article>
        ))}
      </div>
      ) : null}
      {isDeveloperDemoMode && !empty && effectiveModel.hasTrendData ? (
        <div className="signal-intelligence-center-trends">
          {effectiveModel.trendCards.map((card) => (
            <article key={card.id} className={`inbox-trend-card is-${card.tone}`}>
              <span className="inbox-trend-card-label">{card.label}</span>
              <strong>{card.title}</strong>
              <p>{card.detail}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ExecutiveBriefCard({
  t,
  brief,
  demoSignalCount,
  realSignalCount,
  mixLabel,
}: {
  t: TranslationFn;
  brief: IntelligenceBrief;
  demoSignalCount: number;
  realSignalCount: number;
  mixLabel?: string;
}) {
  return (
    <article className="executive-brief-card" aria-label={t("executiveBriefTitle")}>
      <div className="executive-brief-head">
        <span>{t("executiveBriefTitle")}</span>
        <strong>{mixLabel ?? t("intelligenceSignalMixLabel", { demo: demoSignalCount, real: realSignalCount })}</strong>
      </div>
      <span className={`executive-brief-level is-${brief.alertLevel.toLowerCase().replace(/\s+/g, "-")}`}>
        {brief.alertLevel}
      </span>
      <div className="executive-brief-grid">
        <section className="executive-brief-item is-issue">
          <span>{t("executiveIssueDetectedLabel")}</span>
          <strong>{brief.title}</strong>
        </section>
        <section className="executive-brief-item">
          <span>{t("executiveTopTopicLabel")}</span>
          <strong>{brief.topTopic}</strong>
        </section>
        <section className="executive-brief-item">
          <span>{t("executiveEvidenceCountLabel")}</span>
          <strong>{t("executiveEvidenceCountValue", { count: brief.evidenceCount })}</strong>
          <small>{t("demoOutcomeTopTopicEvidence", { count: brief.topTopicCount, total: brief.totalSignals })}</small>
        </section>
        <section className="executive-brief-item">
          <span>{t("executiveConfidenceLabel")}</span>
          <strong>{brief.confidence}</strong>
        </section>
        <section className="executive-brief-item is-action">
          <span>{t("executiveRecommendedActionLabel")}</span>
          <strong>“{brief.recommendedAction}”</strong>
        </section>
      </div>
    </article>
  );
}

function SelectedSignalIntelligenceCard({
  record,
  t,
  createFollowUpHref,
  actionDisabled,
  followUpProminent,
  showEmergingRiskAction,
  showRoadmapAction,
  isMarkingEmergingRisk,
  isPublishingToRoadmap,
  onMarkEmergingRisk,
  onPublishToRoadmap,
  demoOutcome,
}: {
  record: SignalRecord;
  t: TranslationFn;
  createFollowUpHref: string;
  actionDisabled: boolean;
  followUpProminent: boolean;
  showEmergingRiskAction: boolean;
  showRoadmapAction: boolean;
  isMarkingEmergingRisk: boolean;
  isPublishingToRoadmap: boolean;
  onMarkEmergingRisk: () => void;
  onPublishToRoadmap: () => void;
  demoOutcome?: DemoIntelligenceOutcome;
}) {
  const isDemoSignal = isDemoSignalRecord(record);
  const demoScenario = getDemoScenarioIdFromSubmission(record.submission);
  const selectedDemoOutcome = demoOutcome ?? buildDemoIntelligenceOutcome([record], demoScenario);
  const aiSummary = record.submission.aiSummary?.trim() || t("selectedSignalAiSummaryPending");
  const followUp = hasNeedsFollowUp(record.submission)
    ? t("selectedSignalFollowUpRequested")
    : record.submission.priority === "high" || record.submission.severity === "high"
      ? t("selectedSignalFollowUpSuggested")
      : t("selectedSignalFollowUpStable");
  const trendLabel = record.submission.clusterId || record.submission.keywords?.[0] || record.category;

  return (
    <section className="answer-card selected-signal-intelligence-card">
      <div className="signal-detail-group-header">
        <p className="eyebrow">{t("signalIntelligenceEyebrow")}</p>
        <h3>{t("selectedSignalIntelligenceTitle")}</h3>
      </div>
      <div className="selected-signal-intelligence-grid">
        <article>
          <span>{t("selectedSignalTrendDetectionLabel")}</span>
          <strong>{isDemoSignal ? selectedDemoOutcome.topTopic : trendLabel}</strong>
        </article>
        <article>
          <span>{t("selectedSignalAiSummaryLabel")}</span>
          <p>{isDemoSignal ? selectedDemoOutcome.insight : aiSummary}</p>
        </article>
        <article>
          <span>{t("selectedSignalFollowUpLabel")}</span>
          <p>{isDemoSignal ? selectedDemoOutcome.followUpQuestion : followUp}</p>
        </article>
      </div>
      {isDemoSignal ? (
        <article className="demo-signal-outcome-note">
          <span>{t("demoScenarioLabel")}: {DEMO_SIGNAL_SCENARIOS[normalizeDemoScenarioId(demoScenario)].label}</span>
          <strong>{t("demoOutcomeTopTopicValue", { topic: selectedDemoOutcome.topTopic })}</strong>
          <p>{t("demoSignalContributedTo", { contribution: selectedDemoOutcome.contribution })}</p>
        </article>
      ) : null}
      <div
        className={`selected-signal-next-action-grid ${followUpProminent ? "has-primary-action" : "is-quiet"}`}
        aria-label={t("selectedSignalNextActionsLabel")}
      >
        <article className={`selected-signal-next-action-card ${followUpProminent ? "is-primary" : "is-secondary"}`}>
          <span>{t("selectedSignalCreateFollowUpTitle")}</span>
          <p>{isDemoSignal ? t("demoFollowUpCtaDetail") : t("selectedSignalCreateFollowUpDetail")}</p>
          {isDemoSignal || actionDisabled ? (
            <button type="button" className="ghost-button" disabled>
              {isDemoSignal ? t("demoSimulationCreateFollowUpCta") : t("selectedSignalCreateFollowUpCta")}
            </button>
          ) : (
            <Link className="ghost-button" to={createFollowUpHref}>
              {t("selectedSignalCreateFollowUpCta")}
            </Link>
          )}
        </article>
        {showEmergingRiskAction ? (
          <article className="selected-signal-next-action-card is-risk">
            <span>{t("selectedSignalMarkEmergingRiskTitle")}</span>
            <p>{t("selectedSignalMarkEmergingRiskDetail")}</p>
            <button type="button" className="ghost-button" disabled={actionDisabled || isMarkingEmergingRisk} onClick={onMarkEmergingRisk}>
              {isMarkingEmergingRisk ? t("selectedSignalEmergingRiskMarked") : t("selectedSignalMarkEmergingRiskCta")}
            </button>
          </article>
        ) : null}
        {showRoadmapAction ? (
          <article className="selected-signal-next-action-card is-roadmap">
            <span>{t("selectedSignalPublishRoadmapTitle")}</span>
            <p>{t("selectedSignalPublishRoadmapDetail")}</p>
            <button type="button" className="ghost-button" disabled={actionDisabled || isPublishingToRoadmap} onClick={onPublishToRoadmap}>
              {isPublishingToRoadmap ? t("publishedLabel") : t("selectedSignalPublishRoadmapCta")}
            </button>
          </article>
        ) : null}
      </div>
    </section>
  );
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
  signalCountByFormId: Record<string, number>;
  allSignalsCount: number;
  totalUnreadCount: number;
  allSignalNodesLabel: string;
  responseDeadlineLabels: ResponseDeadlineLabels;
  openNodeDirectoryLabel: string;
  onOpenNodeDirectory: () => void;
  onExportAllFormCsv: (formId: string) => void;
  hasAdminAccess: boolean;
  selectedProjectName: string | null;
  selectedProjectId: string;
  projects: Array<{ objectId: string; name: string; formsCount: number; signalsCount: number }>;
  onSelectProject: (projectId: string) => void;
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

  const selectedOption = options.find((option) => option.value === selectedValue);

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
    sortOrder,
    onSortOrderChange,
    searchPlaceholder,
    accessibleForms,
    selectedFormId,
    onSelectForm,
    unreadCountByFormId,
    signalCountByFormId,
    allSignalsCount,
    totalUnreadCount,
    allSignalNodesLabel,
    responseDeadlineLabels,
    openNodeDirectoryLabel,
    onOpenNodeDirectory,
    onExportAllFormCsv,
    hasAdminAccess,
    selectedProjectId,
    projects,
    onSelectProject,
  } = props;
  const sortOptions: MobileFilterMenuOption[] = [
    { value: "default", label: getSortLabel("default", t) },
    { value: "newest", label: getSortLabel("newest", t) },
    { value: "oldest", label: getSortLabel("oldest", t) },
    { value: "priority", label: getSortLabel("priority", t) },
    { value: "unread", label: getSortLabel("unread", t) },
  ];
  const scopeActionLabel =
    viewScope === "project" ? allSignalsScopeLabel : projectSignalsScopeLabel;
  const projectOptions: MobileFilterMenuOption[] = projects.map((project) => ({
    value: project.objectId,
    label: project.name,
    meta: t("projectModalProjectStats", {
      forms: project.formsCount,
      signals: project.signalsCount,
    }),
  }));

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

      {hasAdminAccess && projectOptions.length > 1 ? (
        <div className="mobile-inbox-project-row">
          <MobileFilterMenu
            srLabel={t("selectedProjectLabel")}
            buttonLabel={t("chooseProjectButton")}
            selectedValue={selectedProjectId}
            options={projectOptions}
            onSelect={onSelectProject}
            className="mobile-inbox-project-menu"
          />
        </div>
      ) : null}

      <div className="mobile-inbox-channel-row">
        <SignalChannelSelector
          className="signal-channel-selector-mobile"
          accessibleForms={accessibleForms}
          selectedFormId={selectedFormId}
          onSelectForm={onSelectForm}
          unreadCountByFormId={unreadCountByFormId}
          signalCountByFormId={signalCountByFormId}
          allSignalsCount={allSignalsCount}
          totalUnreadCount={totalUnreadCount}
          activeScopeLabel={activeScopeLabel}
          allSignalNodesLabel={allSignalNodesLabel}
          responseDeadlineLabels={responseDeadlineLabels}
          openNodeDirectoryLabel={openNodeDirectoryLabel}
          onOpenNodeDirectory={onOpenNodeDirectory}
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

interface MobileSignalRowProps {
  record: SignalRecord;
  isSelected: boolean;
  isUnlocked: boolean;
  isDemoJustArrived: boolean;
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
  hideCopy = false,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  open: boolean;
  onToggle: () => void;
  trailing?: ReactNode;
  hideCopy?: boolean;
}) {
  return (
    <button
      type="button"
      className={`workspace-section-toggle ${open ? "is-open" : ""} ${hideCopy ? "has-hidden-copy" : ""}`}
      aria-expanded={open}
      aria-label={title}
      onClick={onToggle}
    >
      {!hideCopy ? (
        <span className="workspace-section-toggle-copy">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <strong>{title}</strong>
          {detail ? <span className="muted">{detail}</span> : null}
        </span>
      ) : null}
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

function LongPressNodeDirectoryButton({
  title,
  unreadCount,
  submissionCount,
  isLegacyDemo,
  isAccessible,
  isOnchain,
  onchainFormId,
  isSelected,
  isLongPressCapable,
  isRegistering,
  isRegisterDisabled,
  canDelete,
  isDeleting,
  t,
  onSelect,
  onRegister,
  onOpenBeacon,
  onDelete,
}: {
  title: string;
  unreadCount: number;
  submissionCount: number;
  isLegacyDemo: boolean;
  isAccessible: boolean;
  isOnchain: boolean;
  onchainFormId?: number;
  isSelected: boolean;
  isLongPressCapable: boolean;
  isRegistering: boolean;
  isRegisterDisabled: boolean;
  canDelete: boolean;
  isDeleting: boolean;
  t: ReturnType<typeof useI18n>["t"];
  onSelect: () => void;
  onRegister: () => void;
  onOpenBeacon: () => void;
  onDelete: () => void;
}) {
  const suppressClickRef = useRef(false);
  const swipeGestureActiveRef = useRef(false);
  const swipePointerIdRef = useRef<number | null>(null);
  const swipeStartPointRef = useRef({ x: 0, y: 0 });
  const [swipeOffset, setSwipeOffset] = useState(0);
  const mobileGestureMode = isLongPressCapable;
  const longPressEnabled = isAccessible && isLongPressCapable && !isOnchain && !isRegisterDisabled;
  const swipeEnabled = isAccessible && mobileGestureMode && canDelete && !isDeleting && !isRegistering;
  const { isHolding, progress, handlers } = useLongPress<HTMLButtonElement>({
    duration: NODE_LONG_PRESS_MS,
    enabled: longPressEnabled,
    moveThreshold: NODE_LONG_PRESS_MOVE_THRESHOLD,
    onComplete: () => {
      suppressClickRef.current = true;
      onRegister();
    },
  });
  const resetSwipe = useCallback(() => {
    swipeGestureActiveRef.current = false;
    swipePointerIdRef.current = null;
    swipeStartPointRef.current = { x: 0, y: 0 };
    setSwipeOffset(0);
  }, []);

  useEffect(() => {
    if (swipeEnabled) {
      return;
    }
    resetSwipe();
  }, [resetSwipe, swipeEnabled]);

  const showOverlay = isHolding || isRegistering;
  const swipeProgress = Math.max(0, Math.min(swipeOffset / NODE_SWIPE_DELETE_THRESHOLD, 1));
  const swipeDeleteReady = swipeProgress >= 1;
  const holdLabel = isRegistering ? t("registerNodeHoldRegistering") : t("registerNodeHoldToRegister");
  const nodeCardStyle =
    showOverlay || swipeOffset > 0
      ? ({
          ...(showOverlay
            ? {
                ["--node-hold-progress" as const]: String(Math.max(progress, isRegistering ? 1 : 0)),
              }
            : {}),
          ...(swipeOffset > 0
            ? {
                ["--node-swipe-progress" as const]: String(swipeProgress),
              }
            : {}),
        } as CSSProperties)
      : undefined;

  return (
    <button
      type="button"
      className={[
        "node-directory-item",
        isSelected ? "is-active" : "",
        longPressEnabled ? "node-card--holdable" : "",
        isHolding ? "node-card--holding" : "",
        isRegistering ? "node-card--registering" : "",
        swipeOffset > 0 ? "node-card--swiping" : "",
        swipeDeleteReady ? "node-card--swipe-armed" : "",
        mobileGestureMode ? "node-card--mobile-gesture" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={!isAccessible}
      aria-label={longPressEnabled ? `${title} - ${holdLabel}` : title}
      style={nodeCardStyle}
      onClick={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (mobileGestureMode) {
          onOpenBeacon();
          return;
        }
        onSelect();
      }}
      onPointerDown={(event) => {
        handlers.onPointerDown(event);
        if (!swipeEnabled || event.pointerType === "mouse" || event.button !== 0) {
          return;
        }
        swipePointerIdRef.current = event.pointerId;
        swipeStartPointRef.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        handlers.onPointerMove(event);
        if (swipePointerIdRef.current !== event.pointerId) {
          return;
        }
        const deltaX = event.clientX - swipeStartPointRef.current.x;
        const deltaY = event.clientY - swipeStartPointRef.current.y;
        if (deltaY <= 0) {
          swipeGestureActiveRef.current = false;
          setSwipeOffset(0);
          return;
        }
        if (Math.abs(deltaX) > NODE_SWIPE_HORIZONTAL_LEEWAY && Math.abs(deltaX) > deltaY) {
          swipeGestureActiveRef.current = false;
          setSwipeOffset(0);
          return;
        }
        if (deltaY < NODE_SWIPE_ACTIVATION_THRESHOLD) {
          setSwipeOffset(0);
          return;
        }
        swipeGestureActiveRef.current = true;
        setSwipeOffset(Math.min(deltaY, NODE_SWIPE_DELETE_THRESHOLD * 1.3));
      }}
      onPointerUp={(event) => {
        const shouldDelete = swipePointerIdRef.current === event.pointerId && swipeDeleteReady;
        const hadSwipeGesture = swipePointerIdRef.current === event.pointerId && swipeGestureActiveRef.current;
        handlers.onPointerUp(event);
        if (swipePointerIdRef.current === event.pointerId) {
          resetSwipe();
        }
        if (hadSwipeGesture) {
          suppressClickRef.current = true;
          event.preventDefault();
          event.stopPropagation();
        }
        if (!shouldDelete) {
          return;
        }
        onDelete();
      }}
      onPointerCancel={(event) => {
        handlers.onPointerCancel(event);
        if (swipePointerIdRef.current === event.pointerId) {
          resetSwipe();
        }
      }}
      onLostPointerCapture={(event) => {
        handlers.onLostPointerCapture(event);
        if (swipePointerIdRef.current === event.pointerId) {
          resetSwipe();
        }
      }}
    >
      <div className="node-directory-item-main">
        <div className="node-directory-item-heading">
          <strong>{title}</strong>
          {unreadCount > 0 ? (
            <span className="node-unread-badge">
              {t("unreadBadge", { count: unreadCount })}
            </span>
          ) : null}
        </div>
        <p className="muted">
          {t("signalsCount", { count: submissionCount })}
          {isLegacyDemo
            ? ` / ${t("legacyDemoForm")}`
            : !isAccessible
              ? ` / ${t("accessDeniedButton")}`
              : ""}
        </p>
        <div className="signal-badge-row signal-badge-row-compact">
          {isOnchain ? (
            <>
              <span className="signal-chip signal-chip-soft">{t("registeredOnSuiLabel")}</span>
              {typeof onchainFormId === "number" ? (
                <span className="signal-chip signal-chip-soft">
                  {t("registryFormIdLabel")}: {onchainFormId}
                </span>
              ) : null}
            </>
          ) : (
            <span className="signal-chip signal-chip-soft">{t("notRegisteredYet")}</span>
          )}
        </div>
      </div>
      {showOverlay ? (
        <div className="node-directory-hold-overlay" aria-hidden="true">
          <div className="sui-hold-ripple">
            <span className="sui-hold-ripple-wave sui-hold-ripple-wave-primary" />
            <span className="sui-hold-ripple-wave sui-hold-ripple-wave-secondary" />
            <span className="sui-hold-ripple-mark">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M12 4.5c3.7 3.05 5.55 5.72 5.55 8.01A5.55 5.55 0 0 1 12 18.06a5.55 5.55 0 0 1-5.55-5.55C6.45 10.22 8.3 7.55 12 4.5Z" />
                <path d="M8.7 13.15a3.3 3.3 0 0 0 6.6 0" />
              </svg>
            </span>
          </div>
          <p className="sui-hold-hint">{holdLabel}</p>
          <span className="sui-hold-progress" />
        </div>
      ) : null}
      {swipeEnabled ? (
        <div className="node-directory-swipe-overlay" aria-hidden="true">
          <DeleteNodeActionIcon />
          <span>{isDeleting ? t("deletingLabel") : t("deleteNode")}</span>
        </div>
      ) : null}
    </button>
  );
}

function MobileSignalRow({
  record,
  isSelected,
  isUnlocked,
  isDemoJustArrived,
  onSelect,
  t,
}: MobileSignalRowProps) {
  const { submission } = record;
  const isDemoSignal = isDemoSignalSubmission(submission);
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
    <button
      type="button"
      className={`mobile-signal-row ${isSelected ? "is-active" : ""} ${submission.status === "unread" ? "is-unread" : "is-read"} ${isDemoJustArrived ? "is-demo-just-arrived" : ""}`}
      aria-current={isSelected ? "true" : undefined}
      aria-label={ariaLabel}
      onClick={onSelect}
    >
      <span className="mobile-signal-row-main">
        <span className="mobile-signal-avatar" aria-hidden="true">
          {getSignalInitials(title)}
          <span className={`mobile-signal-status-dot status-${submission.status}`} />
        </span>

        <span className="mobile-signal-main">
          <span className="mobile-signal-title-line">
            {submission.status === "unread" ? <span className="mobile-unread-dot" aria-hidden="true" /> : null}
            <strong>{title}</strong>
            {isDemoSignal ? <span className="mobile-signal-mini-badge">{t("demoBadgeLabel")}</span> : null}
            {isDemoJustArrived ? (
              <span className="mobile-signal-mini-badge is-just-arrived">{t("demoJustArrivedLabel")}</span>
            ) : null}
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
      </span>

      <span className="mobile-signal-side">
        <time>{formatDate(submission.createdAt)}</time>
        <span className={`mobile-priority-badge priority-${submission.priority}`}>{priorityLabel}</span>
      </span>
    </button>
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
  timelineModel: InboxTimelineModel;
  demoSignalCount: number;
  demoGenerating: boolean;
  demoIngestTarget: 5 | 20 | 100 | null;
  demoArrivalAlert: string | null;
  demoEventFeed: DemoIntelligenceEvent[];
  demoScenario: DemoSignalScenario;
  demoOutcome: DemoIntelligenceOutcome;
  demoIntelligenceViewMode: DemoIntelligenceViewMode;
  latestBrief: IntelligenceBrief | null;
  onOpenDemoBrief?: () => void;
  demoJustArrivedSignalIds: Set<string>;
  hasMoreSignals: boolean;
  onLoadMoreSignals: () => void;
  selectedRecord: SignalRecord | null;
  unlockedSignalId?: string | null;
  onSelectSignal: (record: SignalRecord) => void;
  onQuickAction: (record: SignalRecord, action: QuickActionId) => void;
  searchPlaceholder: string;
  accessibleForms: FormWithCount[];
  selectedFormId: string;
  onSelectForm: (formId: string) => void;
  unreadCountByFormId: Record<string, number>;
  signalCountByFormId: Record<string, number>;
  allSignalsCount: number;
  totalUnreadCount: number;
  allSignalNodesLabel: string;
  responseDeadlineLabels: ResponseDeadlineLabels;
  openNodeDirectoryLabel: string;
  onOpenNodeDirectory: () => void;
  onExportAllFormCsv: (formId: string) => void;
  t: TranslationFn;
  hasAdminAccess: boolean;
  selectedProjectName: string | null;
  selectedProjectId: string;
  projects: Array<{ objectId: string; name: string; formsCount: number; signalsCount: number }>;
  onSelectProject: (projectId: string) => void;
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
  timelineModel,
  demoSignalCount,
  demoGenerating,
  demoIngestTarget,
  demoArrivalAlert,
  demoEventFeed,
  demoScenario,
  demoOutcome,
  demoIntelligenceViewMode,
  latestBrief,
  onOpenDemoBrief,
  demoJustArrivedSignalIds,
  hasMoreSignals,
  onLoadMoreSignals,
  selectedRecord,
  unlockedSignalId,
  onSelectSignal,
  onQuickAction,
  searchPlaceholder,
  accessibleForms,
  selectedFormId,
  onSelectForm,
  unreadCountByFormId,
  signalCountByFormId,
  allSignalsCount,
  totalUnreadCount,
  allSignalNodesLabel,
  responseDeadlineLabels,
  openNodeDirectoryLabel,
  onOpenNodeDirectory,
  onExportAllFormCsv,
  t,
  hasAdminAccess,
  selectedProjectName,
  selectedProjectId,
  projects,
  onSelectProject,
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
        signalCountByFormId={signalCountByFormId}
        allSignalsCount={allSignalsCount}
        totalUnreadCount={totalUnreadCount}
        allSignalNodesLabel={allSignalNodesLabel}
        responseDeadlineLabels={responseDeadlineLabels}
        openNodeDirectoryLabel={openNodeDirectoryLabel}
        onOpenNodeDirectory={onOpenNodeDirectory}
        onExportAllFormCsv={onExportAllFormCsv}
        hasAdminAccess={hasAdminAccess}
        selectedProjectName={selectedProjectName}
        selectedProjectId={selectedProjectId}
        projects={projects}
        onSelectProject={onSelectProject}
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
                isDemoJustArrived={isDemoSignalRecord(record) && demoJustArrivedSignalIds.has(record.submission.id)}
                onSelect={() => onSelectSignal(record)}
                onQuickAction={onQuickAction}
                t={t}
              />
            ))}
        {hasMoreSignals ? (
          <button type="button" className="ghost-button signal-list-load-more" onClick={onLoadMoreSignals}>
            {t("showMoreToggle")}
          </button>
        ) : null}
      </div>

      <InboxTimelineOverview
        model={timelineModel}
        t={t}
        compact
        demoSignalCount={demoSignalCount}
        demoGenerating={demoGenerating}
        demoIngestTarget={demoIngestTarget}
        demoArrivalAlert={demoArrivalAlert}
        demoEventFeed={demoEventFeed}
        demoScenario={demoScenario}
        demoOutcome={demoOutcome}
        demoIntelligenceViewMode={demoIntelligenceViewMode}
        latestBrief={latestBrief}
        onOpenDemoBrief={onOpenDemoBrief}
      />
    </section>
  );
}

export function AdminDashboardPage() {
  const { language, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const wallet = useSuiWallet();
  const mockAdmin = useMockAdminMode(location.search);
  const mockAdminData = useMemo(
    () => (mockAdmin.enabled ? createMockAdminWorkspaceData() : null),
    [mockAdmin.enabled],
  );
  const activeAccountAddress = mockAdminData?.accountAddress ?? wallet.accountAddress;
  const suiClient = useSuiClient();
  const rpc = useRpcInfrastructure();
  const updateSignalStatusTx = useSignAndExecuteTransaction();
  const registerFormTx = useSignAndExecuteTransaction();
  const deleteNodeOnchainTx = useSignAndExecuteTransaction();
  const [loadingRecoveryVisible, setLoadingRecoveryVisible] = useState(false);
  const {
    capabilityProfile: accessCapabilityProfile,
    isPending: isLoadingCapabilities,
    ownedObjects: accessOwnedObjects,
    refetch: refetchAccessControl,
  } = useAccessControl(activeAccountAddress, { enabled: !mockAdmin.enabled });
  const capabilityProfile = mockAdminData?.capabilityProfile ?? accessCapabilityProfile;
  const ownedObjects = mockAdminData?.ownedObjects ?? accessOwnedObjects;
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
  const [isLongPressCapable, setIsLongPressCapable] = useState(false);
  const [isMobileNodeDirectory, setIsMobileNodeDirectory] = useState(false);
  const [projectRecoveryNoticeOpen, setProjectRecoveryNoticeOpen] = useState(false);
  const [projectRecoveryNoticeAcks, setProjectRecoveryNoticeAcks] = useState<Record<string, string>>(
    () => readProjectRecoveryNoticeAcks(),
  );
  const [projectRecoveryNoticeDismissedProjects, setProjectRecoveryNoticeDismissedProjects] = useState<
    Record<string, true>
  >({});
  const [nodeSearch, setNodeSearch] = useState("");
  const [csvExportScope, setCsvExportScope] = useState<ResponsesCsvExportScope>("filtered");
  const [csvSortOrder, setCsvSortOrder] = useState<ResponsesCsvSortOrder>("createdAtDesc");
  const [selectedVersion, setSelectedVersion] = useState<SubmissionVersionFilter>("all");
  const [versionedFormsByFormId, setVersionedFormsByFormId] = useState<Record<string, VersionedFormSchemas>>({});
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
  const [demoSignalScenario, setDemoSignalScenario] = useState<DemoSignalScenario>(DEFAULT_DEMO_SIGNAL_SCENARIO);
  const [demoIntelligenceViewMode, setDemoIntelligenceViewMode] = useState<DemoIntelligenceViewMode>("executive");
  const [demoSignalRecords, setDemoSignalRecords] = useState<SignalRecord[]>([]);
  const [demoSignalsGenerating, setDemoSignalsGenerating] = useState(false);
  const [demoIngestTarget, setDemoIngestTarget] = useState<5 | 20 | 100 | null>(null);
  const [demoBriefAvailable, setDemoBriefAvailable] = useState(false);
  const [demoIntelligenceAlertOpen, setDemoIntelligenceAlertOpen] = useState(false);
  const [demoUnlockAlert, setDemoUnlockAlert] = useState<string | null>(null);
  const [demoArrivalAlert, setDemoArrivalAlert] = useState<string | null>(null);
  const [demoJustArrivedSignalIds, setDemoJustArrivedSignalIds] = useState<Set<string>>(new Set());
  const [demoEventFeed, setDemoEventFeed] = useState<DemoIntelligenceEvent[]>([]);
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
  const isClearingMobileSignalSelectionRef = useRef(false);
  const demoIngestTimerRefs = useRef<number[]>([]);
  const demoArrivalTimerRefs = useRef<number[]>([]);
  const demoUnlockedThresholdsRef = useRef<Set<number>>(new Set());
  const demoEventIdRef = useRef(0);
  const hasAdminAccess = canAdmin(capabilityProfile);
  const isNodeRegistrationBusy = registerFormTx.isPending || registeringFormId !== null;
  const setWorkspaceTab = useCallback(
    (tab: WorkspaceTab) => {
      if (tab === activeWorkspaceTab) {
        return;
      }
      const params = new URLSearchParams(location.search);
      params.set("tab", tab);
      navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
    },
    [activeWorkspaceTab, location.pathname, location.search, navigate],
  );
  const [signalViewScope, setSignalViewScope] = useState<SignalViewScope>(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("scope") === "all" || params.get("form")) {
      return "all";
    }
    return getSelectedProjectIdSnapshot() ? "project" : "all";
  });
  const previousSelectedProjectIdRef = useRef<string | null>(getSelectedProjectIdSnapshot());
  const {
    forms,
    loading,
    submissionsLoading,
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
    visibleSignals: unversionedVisibleSignals,
    selectedRecord: selectedRecordFromInbox,
    applyFormUpdate,
    applyFormRemovals,
    applySubmissionUpdate,
  } = useSignalInboxData({
    accountAddress: activeAccountAddress,
    capabilityProfile,
    sortOrder: signalSortOrder,
    scopeProjectId: getSelectedProjectIdSnapshot(),
    viewScope: signalViewScope,
    mockAdminData,
  });
  const versionCounts = useMemo(
    () => getSubmissionVersionCounts(allSignals.map((record) => record.submission)),
    [allSignals],
  );
  const realVisibleSignals = useMemo(
    () => unversionedVisibleSignals.filter((record) => matchesSubmissionVersion(record.submission, selectedVersion)),
    [selectedVersion, unversionedVisibleSignals],
  );
  const visibleSignals = useMemo(
    () => [...demoSignalRecords, ...realVisibleSignals],
    [demoSignalRecords, realVisibleSignals],
  );
  const inboxTimelineModel = useMemo(
    () => buildInboxTimelineModel(visibleSignals, t),
    [visibleSignals, t],
  );
  const demoSignalCount = demoSignalRecords.length;
  const realSignalCount = realVisibleSignals.length;
  const demoIntelligenceOutcome = useMemo(
    () => buildDemoIntelligenceOutcome(demoSignalRecords, demoSignalScenario),
    [demoSignalRecords, demoSignalScenario],
  );
  const demoIntelligenceBrief = useMemo(
    () => buildDemoIntelligenceBrief(demoSignalRecords, demoSignalScenario),
    [demoSignalRecords, demoSignalScenario],
  );
  const realIntelligenceBrief = useMemo(
    () => buildRealIntelligenceBrief(realVisibleSignals, t),
    [realVisibleSignals, t],
  );
  const latestIntelligenceBrief = demoBriefAvailable ? demoIntelligenceBrief : realIntelligenceBrief;
  const intelligenceDemoSimulationEnabled = demoSignalCount > 0 || demoSignalsGenerating;
  const demoSignalVolume = getDemoSignalVolume(demoSignalCount);
  const isIntelligenceDemoRoute = new URLSearchParams(location.search).get("demo") === "intelligence";
  const selectedRecord =
    isIntelligenceDemoRoute && !selectedSignalId
      ? null
      :
    selectedSignalId && visibleSignals.some((record) => record.submission.id === selectedSignalId)
      ? visibleSignals.find((record) => record.submission.id === selectedSignalId) ?? null
      : selectedRecordFromInbox && matchesSubmissionVersion(selectedRecordFromInbox.submission, selectedVersion)
        ? selectedRecordFromInbox
        : visibleSignals[0] ?? null;
  const selectedRecordIsDemo = isDemoSignalRecord(selectedRecord);
  const [renderedSignalLimit, setRenderedSignalLimit] = useState(INITIAL_SIGNAL_LIST_LIMIT);
  const renderedVisibleSignals = useMemo(
    () => visibleSignals.slice(0, renderedSignalLimit),
    [renderedSignalLimit, visibleSignals],
  );
  const hasMoreRenderedSignals = renderedVisibleSignals.length < visibleSignals.length;
  const inboxSettling = loading || submissionsLoading;
  const [showInitialListSkeleton, setShowInitialListSkeleton] = useState(false);

  useEffect(() => {
    void import("../storage/storageFactory")
      .then(({ retryPendingSubmissionSync }) => retryPendingSubmissionSync({ allowWalletPrompt: false }))
      .catch((error) => {
        console.warn("[admin workspace] pending inbox sync retry failed to start", error);
      });
  }, []);

  useEffect(() => {
    setRenderedSignalLimit(INITIAL_SIGNAL_LIST_LIMIT);
  }, [search, selectedFormId, selectedStreamId, selectedVersion, signalSortOrder, signalViewScope, demoSignalCount]);

  const clearDemoIngestTimers = useCallback(() => {
    demoIngestTimerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
    demoIngestTimerRefs.current = [];
  }, []);

  const clearDemoArrivalTimers = useCallback(() => {
    demoArrivalTimerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
    demoArrivalTimerRefs.current = [];
  }, []);

  const appendDemoEvent = useCallback((type: DemoIntelligenceEventType, count?: number) => {
    demoEventIdRef.current += 1;
    const event: DemoIntelligenceEvent = {
      id: `demo-event-${Date.now()}-${demoEventIdRef.current}`,
      type,
      timestamp: Date.now(),
      count,
    };
    setDemoEventFeed((current) => [...current, event].slice(-24));
  }, []);

  const markDemoSignalsArrived = useCallback(
    (records: SignalRecord[]) => {
      const arrivedIds = records.map((record) => record.submission.id);
      if (arrivedIds.length === 0) {
        return;
      }
      setDemoJustArrivedSignalIds((current) => {
        const next = new Set(current);
        arrivedIds.forEach((id) => next.add(id));
        return next;
      });
      setDemoArrivalAlert(
        arrivedIds.length === 1
          ? t("demoSignalArrivedBody")
          : t("demoSignalsArrivedBody", { count: arrivedIds.length }),
      );
      const alertTimer = window.setTimeout(() => setDemoArrivalAlert(null), 3600);
      const badgeTimer = window.setTimeout(() => {
        setDemoJustArrivedSignalIds((current) => {
          const next = new Set(current);
          arrivedIds.forEach((id) => next.delete(id));
          return next;
        });
      }, 5000);
      demoArrivalTimerRefs.current.push(alertTimer, badgeTimer);
    },
    [t],
  );

  const handleDemoIngestCount = useCallback(
    (nextCount: number, targetCount: 5 | 20 | 100) => {
      if (nextCount >= 5 && !demoUnlockedThresholdsRef.current.has(5)) {
        demoUnlockedThresholdsRef.current.add(5);
        setDemoUnlockAlert(t("intelligenceUnlockTrendUnlocked"));
        setDemoBriefAvailable(true);
        setDemoIntelligenceAlertOpen(true);
        appendDemoEvent("trend_unlocked", 5);
      }
      if (nextCount >= 20 && !demoUnlockedThresholdsRef.current.has(20)) {
        demoUnlockedThresholdsRef.current.add(20);
        setDemoUnlockAlert(t("intelligenceUnlockAiUnlocked"));
        appendDemoEvent("insights_unlocked", 20);
      }
      if (nextCount >= 100 && !demoUnlockedThresholdsRef.current.has(100)) {
        demoUnlockedThresholdsRef.current.add(100);
        setDemoUnlockAlert(t("intelligenceUnlockEvolutionUnlocked"));
        appendDemoEvent("evolution_unlocked", 100);
      }
      if (nextCount >= targetCount) {
        appendDemoEvent("ingest_complete", targetCount);
        const timerId = window.setTimeout(() => setDemoUnlockAlert(null), 1600);
        demoIngestTimerRefs.current.push(timerId);
      }
    },
    [appendDemoEvent, t],
  );

  const handleCancelDemoIngest = useCallback(() => {
    clearDemoIngestTimers();
    setDemoSignalsGenerating(false);
    setDemoIngestTarget(null);
  }, [clearDemoIngestTimers]);

  const handleGenerateDemoSignals = useCallback(
    (targetCount: 5 | 20 | 100) => {
      clearDemoIngestTimers();
      clearDemoArrivalTimers();
      const nextRecords = buildDemoSignalRecords(demoSignalScenario, targetCount);
      const currentCount = demoSignalRecords.length;
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      setDemoSignalsGenerating(true);
      setDemoIngestTarget(targetCount);
      setDemoIntelligenceAlertOpen(false);
      setDemoUnlockAlert(null);
      setDemoArrivalAlert(null);
      setDemoJustArrivedSignalIds(new Set());
      demoUnlockedThresholdsRef.current = new Set([5, 20, 100].filter((threshold) => currentCount >= threshold));

      if (currentCount >= targetCount) {
        setDemoSignalRecords(nextRecords);
        setDemoBriefAvailable(targetCount >= 5);
        setDemoIntelligenceAlertOpen(targetCount >= 5);
        setDemoSignalsGenerating(false);
        setDemoIngestTarget(null);
        return;
      }

      setDemoSignalRecords(nextRecords.slice(0, currentCount));

      const fullPlan =
        targetCount === 5
          ? [1, 2, 3, 4, 5]
          : targetCount === 20
            ? [1, 2, 3, 4, 5, 8, 12, 16, 20]
            : [1, 2, 3, 4, 5, 10, 15, 20, 40, 60, 80, 100];
      const plan = fullPlan.filter((count) => count > currentCount);
      const reducedPlan = [5, 20, targetCount]
        .filter((count, index, counts) => count > currentCount && count <= targetCount && counts.indexOf(count) === index);
      const countsToApply = prefersReducedMotion ? reducedPlan : plan;

      let elapsed = 0;
      let lastAppliedCount = currentCount;
      countsToApply.forEach((count, index) => {
        const delay = prefersReducedMotion
          ? 140
          : targetCount === 5
            ? 250
            : targetCount === 20
              ? count <= 5
                ? 250
                : 360
              : count <= 5
                ? 250
                : count <= 20
                  ? 520
                  : 820;
        elapsed += index === 0 ? 80 : delay;
        const timerId = window.setTimeout(() => {
          const arrivedRecords = nextRecords.slice(lastAppliedCount, count);
          lastAppliedCount = count;
          setDemoSignalRecords(nextRecords.slice(0, count));
          markDemoSignalsArrived(arrivedRecords);
          handleDemoIngestCount(count, targetCount);
          if (count >= targetCount) {
            setDemoSignalsGenerating(false);
            setDemoIngestTarget(null);
          }
        }, elapsed);
        demoIngestTimerRefs.current.push(timerId);
      });

      if (countsToApply.length === 0) {
        setDemoSignalsGenerating(false);
        setDemoIngestTarget(null);
      };
    },
    [clearDemoArrivalTimers, clearDemoIngestTimers, demoSignalRecords.length, demoSignalScenario, handleDemoIngestCount, markDemoSignalsArrived],
  );

  const handleResetDemoSignals = useCallback(() => {
    clearDemoIngestTimers();
    clearDemoArrivalTimers();
    setDemoSignalRecords([]);
    setDemoSignalsGenerating(false);
    setDemoIngestTarget(null);
    setDemoBriefAvailable(false);
    setDemoIntelligenceAlertOpen(false);
    setDemoUnlockAlert(null);
    setDemoArrivalAlert(null);
    setDemoJustArrivedSignalIds(new Set());
    setDemoEventFeed([]);
    demoUnlockedThresholdsRef.current = new Set();
    if (selectedSignalId?.startsWith("demo-signal-")) {
      setSelectedSignalId("");
    }
  }, [clearDemoArrivalTimers, clearDemoIngestTimers, selectedSignalId, setSelectedSignalId]);

  const handleDemoScenarioChange = useCallback((scenario: DemoSignalScenario) => {
    clearDemoIngestTimers();
    clearDemoArrivalTimers();
    setDemoSignalScenario(normalizeDemoScenarioId(scenario));
    setDemoSignalRecords([]);
    setDemoSignalsGenerating(false);
    setDemoIngestTarget(null);
    setDemoBriefAvailable(false);
    setDemoIntelligenceAlertOpen(false);
    setDemoUnlockAlert(null);
    setDemoArrivalAlert(null);
    setDemoJustArrivedSignalIds(new Set());
    setDemoEventFeed([]);
    demoUnlockedThresholdsRef.current = new Set();
    if (selectedSignalId?.startsWith("demo-signal-")) {
      setSelectedSignalId("");
    }
  }, [clearDemoArrivalTimers, clearDemoIngestTimers, selectedSignalId, setSelectedSignalId]);

  useEffect(() => {
    if (!isIntelligenceDemoRoute && (demoSignalRecords.length > 0 || demoSignalsGenerating || demoBriefAvailable)) {
      handleResetDemoSignals();
    }
  }, [demoBriefAvailable, demoSignalRecords.length, demoSignalsGenerating, handleResetDemoSignals, isIntelligenceDemoRoute]);

  useEffect(() => () => {
    clearDemoIngestTimers();
    clearDemoArrivalTimers();
  }, [clearDemoArrivalTimers, clearDemoIngestTimers]);

  useEffect(() => {
    if (!inboxSettling || visibleSignals.length > 0) {
      setShowInitialListSkeleton(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowInitialListSkeleton(true);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [inboxSettling, visibleSignals.length]);

  useEffect(() => {
    startPerf("admin:inbox-render");
    window.requestAnimationFrame(() => {
      endPerf(
        "admin:inbox-render",
        "ok",
        `${renderedVisibleSignals.length}/${visibleSignals.length} signals rendered`,
      );
    });
  }, [renderedVisibleSignals.length, visibleSignals.length]);

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
    deletingProject,
    deleteProjectBlockedReason,
    manualProjectInputRef,
    projectCreateInputRef,
    visibleOnchainForms,
    connectManualProject,
    handleCreateProject,
    handleDeleteProject,
  } = useProjectWorkspace({
    accountAddress: activeAccountAddress,
    capabilityProfile,
    forms,
    loadConsole,
    mockProject: mockAdminData?.project ?? null,
  });

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    const nextTab: WorkspaceTab =
      tab === "review" || tab === "activity" || tab === "insights" || tab === "members" ? tab : "review";
    if (activeWorkspaceTab !== nextTab) {
      setActiveWorkspaceTab(nextTab);
    }
    if (nextTab === "activity") {
      setLocalActivityEvents(listActivityEvents());
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
    addressesMatch(form.ownerAddress, activeAccountAddress),
  );
  const hasProjectManagementAccess =
    hasAdminAccess ||
    hasOwnedAccessibleForms ||
    projects.some(
      (project) =>
        addressesMatch(project.owner, activeAccountAddress) ||
        project.admins.some((adminAddress) => addressesMatch(adminAddress, activeAccountAddress)),
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
    accountAddress: activeAccountAddress,
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
  const accessState = activeAccountAddress ? "allowed" : "denied";
  const privateReviewLabel = t("privateReviewEnabled");
  const sessionStatusLabel = activeAccountAddress ? t("secureSessionActive") : t("secureSessionStandby");

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
    const {
      appendWalrusBlobDeletesToTransaction,
      collectWalrusBlobDeleteObjectIds,
      extractMissingWalrusDeleteObjectIds,
    } = await loadWalrusDeleteModule();
    let walrusBlobObjectIds = collectWalrusBlobDeleteObjectIds(expandedIds);
    const onchainDeleteTargets = [
      ...new Set(
        expandedIds
          .map((formId) => formsById.get(formId))
          .map((form) => (form ? resolveOnchainDeleteTarget(form) : null))
          .filter(isFiniteFormId),
      ),
    ];

    let walrusDeleteHandledInBatch = false;
    const selectedProjectIdForDelete = onchainDeleteTargets.length > 0 ? selectedProject?.objectId ?? null : null;

    if (onchainDeleteTargets.length > 0 || walrusBlobObjectIds.length > 0) {
      if (onchainDeleteTargets.length > 0) {
        if (!selectedProject) {
          throw new Error("Select the linked project before deleting this node.");
        }
        if (selectedProject.signalsCount > 0) {
          throw new Error(t("deleteOnchainFormsNoSignalsOnly"));
        }
      }

      while (true) {
        try {
          const { Transaction } = await loadSuiTransactionModule();
          const { deleteFormOnChain } = await loadProjectRegistryWriteModule();
          let tx = new Transaction();
          if (selectedProjectIdForDelete) {
            for (const onchainFormId of onchainDeleteTargets) {
              tx = deleteFormOnChain({
                projectId: selectedProjectIdForDelete,
                formId: onchainFormId,
                tx,
              });
            }
          }
          tx = appendWalrusBlobDeletesToTransaction({
            transaction: tx,
            blobObjectIds: walrusBlobObjectIds,
            ownerAddress: activeAccountAddress,
          });

          console.info("[DeepSignal Sui write]", {
            action: "delete_signal_node",
            actionLabel: t("deleteFormConfirm"),
            origin: "delete-node-confirmed-button",
            projectId: selectedProjectIdForDelete,
            onchainFormIds: onchainDeleteTargets,
            walrusBlobObjectIds,
          });
          const result = await deleteNodeOnchainTx.mutateAsync({ transaction: tx });
          await suiClient.waitForTransaction({ digest: result.digest });
          walrusDeleteHandledInBatch = walrusBlobObjectIds.length > 0;
          break;
        } catch (error) {
          const missingObjectIds = extractMissingWalrusDeleteObjectIds(error);
          if (missingObjectIds.length > 0) {
            const missingSet = new Set(missingObjectIds);
            const nextWalrusBlobObjectIds = walrusBlobObjectIds.filter(
              (blobObjectId) => !missingSet.has(blobObjectId.toLowerCase()),
            );
            if (nextWalrusBlobObjectIds.length !== walrusBlobObjectIds.length) {
              walrusBlobObjectIds = nextWalrusBlobObjectIds;
              if (walrusBlobObjectIds.length === 0 && onchainDeleteTargets.length === 0) {
                break;
              }
              continue;
            }
          }

          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes("find_form_index")) {
            throw error;
          }
          console.warn("One or more on-chain forms were already absent during node delete. Continuing local cleanup.");
          break;
        }
      }
      if (onchainDeleteTargets.length > 0) {
        await refetchProjects();
      }
    }

    const walletOwnedIds = expandedIds.filter((formId) => {
      const form = formsById.get(formId);
      return addressesMatch(form?.ownerAddress, activeAccountAddress);
    });
    const localCacheOnlyIds = expandedIds.filter((formId) => !walletOwnedIds.includes(formId));

    if (walletOwnedIds.length > 0 && !walrusDeleteHandledInBatch) {
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
              actorAddress: activeAccountAddress,
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

  const openNodeBeacon = useCallback(
    (formId: string) => {
      setSelectedFormId(formId);
      setBeaconFormId(formId);
      setNodeDirectoryOpen(false);
    },
    [setSelectedFormId],
  );

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
      const {
        createFormOnChain,
        createMetadataDigest,
        serializeProjectFormMetadataReference,
      } = await loadProjectRegistryWriteModule();
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
      console.info("[DeepSignal Sui write]", {
        action: "register_signal_node",
        actionLabel: t("registerOnSui"),
        origin: "register-node-button",
        projectId: form.projectId,
        formId: form.id,
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
            actorAddress: activeAccountAddress,
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
    setProjectRecoveryNoticeDismissedProjects((current) => ({
      ...current,
      [selectedProject.objectId]: true,
    }));
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
    if (selectedRecord) {
      setProjectRecoveryNoticeOpen(false);
      return;
    }
    if (projectRecoveryNoticeDismissedProjects[selectedProject.objectId]) {
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
  }, [
    latestProjectRecoveryNoticeAt,
    projectRecoveryNoticeAcks,
    projectRecoveryNoticeDismissedProjects,
    selectedRecord,
    selectedProject,
    shouldExplainProjectRecovery,
  ]);
  const attachmentPreviews = useAttachmentPreviews(detailAttachments, {
    enabled:
      detailAttachments.length > 0 &&
      (!detailAttachments.some((attachment) => attachment.encrypted) || Boolean(detailAnswers)),
    decryptContext: attachmentDecryptContext,
  });
  const selectedRoadmapUrl = selectedRecord
    ? getPublicRoadmapPath(selectedRecord.form.id, selectedRecord.form.manifestBlobId)
    : "";
  const selectedFollowUpCreateHref = selectedRecord
    ? `/create?composer=1&followUpSignal=${encodeURIComponent(selectedRecord.submission.id)}`
    : "/create?composer=1";
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
    selectedRecord?.submission.isEncrypted && !selectedRecordIsDemo && !detailAnswers,
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
      !selectedRecordIsDemo &&
      !isLocalFallbackBlob(selectedRecord.submission.encryptedBlobId ?? selectedRecord.submission.blobId),
  );
  const selectedRecordPayloadState = selectedRecord
    ? getPrivateSignalPayloadState(selectedRecord.submission)
    : "available";
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
  const selectedRecordUnlockDisabledReason = detailAnswers
    ? undefined
    : !selectedRecord?.submission.isEncrypted
      ? t("privateSignalUnlockUnavailable")
      : selectedRecordPayloadState === "missing_onchain_payload_reference"
        ? t("privateSignalPayloadMissingOnchainDisabled")
        : selectedRecordPayloadState === "missing_payload"
          ? t("privateSignalPayloadMissingDisabled")
      : !canAttemptPrivateSignalDecrypt(selectedRecord.form, activeAccountAddress, capabilityProfile)
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
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const coarsePointerQuery = window.matchMedia(COARSE_POINTER_MEDIA_QUERY);
    const mobileWidthQuery = window.matchMedia(MOBILE_REVIEW_MEDIA_QUERY);
    const sync = () => {
      setIsLongPressCapable(coarsePointerQuery.matches || mobileWidthQuery.matches);
      setIsMobileNodeDirectory(mobileWidthQuery.matches);
    };
    sync();
    const attach = (query: MediaQueryList) => {
      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", sync);
        return () => query.removeEventListener("change", sync);
      }
      const legacyQuery = query as MediaQueryList & {
        addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
        removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      };
      legacyQuery.addListener?.(sync);
      return () => legacyQuery.removeListener?.(sync);
    };
    const detachCoarse = attach(coarsePointerQuery);
    const detachWidth = attach(mobileWidthQuery);
    return () => {
      detachCoarse();
      detachWidth();
    };
  }, []);

  useEffect(() => {
    if (selectedSignalIdFromUrl) {
      if (isClearingMobileSignalSelectionRef.current && !selectedSignalId) {
        return;
      }
      if (selectedSignalIdFromUrl !== selectedSignalId) {
        setSelectedSignalId(selectedSignalIdFromUrl);
      }
      return;
    }
    isClearingMobileSignalSelectionRef.current = false;
    if (
      selectedSignalId &&
      typeof window !== "undefined" &&
      window.matchMedia?.(MOBILE_REVIEW_MEDIA_QUERY).matches
    ) {
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
    isClearingMobileSignalSelectionRef.current = true;
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
    : selectedRecordIsDemo
      ? {
          eyebrow: t("demoModeActiveLabel"),
          title: t("demoSignalSelectedTitle"),
          detail: t("demoSignalSelectedDetail"),
          cta: (
            <button type="button" className="ghost-button" onClick={handleResetDemoSignals}>
              {t("demoReset")}
            </button>
          ),
        }
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
                  onClick={() =>
                    void handleRegisterPendingSignals([selectedRecord.submission.id], {
                      actionLabel: t("registerOnSui"),
                      origin: "selected-signal-next-step-button",
                    })
                  }
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
  const emptyInboxActionForm = firstProjectForm ?? firstVisibleForm;

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
    if (isDemoSignalSubmission(nextSubmission)) {
      setDemoSignalRecords((current) =>
        current.map((record) =>
          record.submission.id === nextSubmission.id
            ? {
                ...record,
                submission: {
                  ...nextSubmission,
                  updatedAt: new Date().toISOString(),
                },
              }
            : record,
        ),
      );
      setSelectedSignalId(nextSubmission.id);
      return true;
    }

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
        const onchainStatusModule =
          projectId && typeof normalized.onchainSignalId === "number"
            ? await loadProjectRegistryWriteModule()
            : null;
        const nextOnchainStatus = onchainStatusModule
          ? onchainStatusModule.triageStatusToOnchainStatus(normalized.triageStatus, normalized.status)
          : undefined;
        const needsOnchainSync =
          Boolean(projectId) &&
          typeof normalized.onchainSignalId === "number" &&
          !normalized.pendingOnchainRegistration &&
          nextOnchainStatus !== undefined &&
          normalized.onchainStatus !== nextOnchainStatus;

        if (needsOnchainSync && projectId && nextOnchainStatus && onchainStatusModule) {
          const tx = onchainStatusModule.updateSignalStatusOnChain({
            projectId,
            signalId: normalized.onchainSignalId ?? 0,
            status: nextOnchainStatus,
          });
          console.info("[DeepSignal Sui write]", {
            action: "update_signal_status",
            actionLabel: "Review & Triage save",
            origin: "review-save-status-sync",
            projectId,
            signalId: normalized.id,
            onchainSignalId: normalized.onchainSignalId,
            nextOnchainStatus,
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
      if (isDemoSignalRecord(record)) {
        return;
      }
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

  async function handleMarkSelectedEmergingRisk() {
    if (!selectedRecord || isReviewWorkbenchLocked) {
      return;
    }
    await updateSubmission(
      {
        ...selectedRecord.submission,
        status: "read",
        priority: "high",
        triageStatus:
          selectedRecord.submission.triageStatus === "new"
            ? "investigating"
            : selectedRecord.submission.triageStatus,
        tags: setNeedsFollowUpTag(selectedRecord.submission.tags, true),
      },
      { announce: true },
    );
  }

  async function handlePublishSelectedToRoadmap() {
    if (!selectedRecord || isReviewWorkbenchLocked) {
      return;
    }
    await handleQuickAction(selectedRecord, "publish");
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
      hasAdminAccess || !capabilityProfile.isConfigured || addressesMatch(form.ownerAddress, activeAccountAddress),
    [activeAccountAddress, capabilityProfile.isConfigured, hasAdminAccess],
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
  const showGuidedOnboarding = !inboxSettling && hasAdminAccess && onboardingState !== "ready";
  const selectedFormSubmissionCount = selectedRecord
    ? (submissionsByFormId[selectedRecord.form.id] ?? []).filter((submission) =>
        matchesSubmissionVersion(submission, selectedVersion),
      ).length
    : 0;
  const selectedFormFilteredExportCount = selectedRecord
    ? visibleSignals.filter((record) => record.form.id === selectedRecord.form.id && !isDemoSignalRecord(record)).length
    : 0;
  const selectedFormSelectedExportCount = selectedRecord && !selectedRecordIsDemo ? 1 : 0;
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
  const selectedNeedsFollowUp = selectedRecord ? hasNeedsFollowUp(selectedRecord.submission) : false;
  const selectedHasRiskKeyword = selectedRecord ? hasRiskKeyword(selectedRecord.submission) : false;
  const selectedFollowUpProminent = Boolean(
    selectedRecord &&
      (selectedNeedsFollowUp ||
        selectedRecord.submission.priority === "high" ||
        selectedRecord.submission.severity === "high" ||
        selectedRecord.submission.status === "unread"),
  );
  const selectedShowEmergingRiskAction = Boolean(
    selectedRecord &&
      (selectedRecord.submission.priority === "high" ||
        selectedRecord.submission.severity === "high" ||
        selectedHasRiskKeyword),
  );
  const selectedReviewerNoteUpdatedAt = selectedRecord ? getReviewerNoteUpdatedAt(selectedRecord.submission) : undefined;
  const selectedRecordVersionedForm = selectedRecord
    ? versionedFormsByFormId[selectedRecord.form.id]?.[getSubmissionVersion(selectedRecord.submission)] ?? selectedRecord.form
    : null;
  const selectedSavedReviewer = selectedRecord ? getAssignedReviewer(selectedRecord.submission) ?? "" : "";
  const selectedHasSavedReviewResult = selectedRecord ? hasSavedReviewResult(selectedRecord.submission) : false;
  const selectedSavedReviewerDisplayLabel = useReviewerDisplayLabel(selectedSavedReviewer);
  const selectedPublicDecisionLabel = selectedRecord ? getPublicDecisionLabel(selectedRecord.submission, t) : "";
  const selectedShowRoadmapAction = Boolean(
    selectedRecord && !selectedRecordIsDemo && selectedHasSavedReviewResult && selectedPublicDecisionLabel && selectedRoadmapUrl,
  );
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
        selectedRecord.submission.revokeRequested ? "Revoke requested" : null,
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
      formVersion: selectedVersion,
    };
  }

  function getCsvExportResponses() {
    if (!selectedRecord) {
      return [];
    }
    const allFormResponses = (submissionsByFormId[selectedRecord.form.id] ?? [])
      .map((submission) => normalizeSubmission(submission))
      .filter((submission) => matchesSubmissionVersion(submission, selectedVersion));
    if (csvExportScope === "selected") {
      return allFormResponses.filter((submission) => submission.id === selectedRecord.submission.id);
    }
    if (csvExportScope === "filtered") {
      const filteredResponseIds = new Set(
        visibleSignals
          .filter((record) => record.form.id === selectedRecord.form.id && !isDemoSignalRecord(record))
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

  async function handleOpenCsvExportReview() {
    if (!selectedRecord || csvExportCount === 0) {
      setToast({ tone: "error", message: t("noResponsesMatchCurrentFilters") });
      return;
    }
    const responses = getCsvExportResponses();
    const versionedForms = await loadVersionedFormSchemas(selectedRecord.form);
    const options: ExportResponsesToCsvOptions = {
      language,
      now: new Date(),
      scope: csvExportScope,
      sortOrder: csvSortOrder,
      excludedPiiFields: excludedCsvPiiFields,
      exportedBy: activeAccountAddress ?? "",
      filterSnapshot: getCsvFilterSnapshot(),
      responseOverrides: getCsvResponseOverrides(),
      versionedForms,
    };
    const { buildExportMetadata } = await loadCsvExportModule();
    const metadata = buildExportMetadata(selectedRecord.form, responses, options);
    setPendingCsvExportForm(selectedRecord.form);
    setPendingCsvExportResponses(responses);
    setPendingCsvExportMetadata(metadata);
    setPendingCsvExportOptions({ ...options, metadata });
  }

  async function handleOpenFormAllCsvExportReview(formId: string) {
    const form = accessibleForms.find((item) => item.id === formId);
    if (!form) {
      return;
    }
    const responses = (submissionsByFormId[formId] ?? []).map((submission) => normalizeSubmission(submission));
    if (responses.length === 0) {
      setToast({ tone: "error", message: t("noResponsesMatchCurrentFilters") });
      return;
    }
    const versionedForms = await loadVersionedFormSchemas(form);
    const options: ExportResponsesToCsvOptions = {
      language,
      now: new Date(),
      scope: "all",
      sortOrder: csvSortOrder,
      excludedPiiFields: excludedCsvPiiFields,
      exportedBy: activeAccountAddress ?? "",
      filterSnapshot: {
        searchQuery: "",
        status: undefined,
        priority: undefined,
        tags: [],
        triageStatus: undefined,
        dateRange: {},
        formVersion: "all",
      },
      versionedForms,
    };
    const { buildExportMetadata } = await loadCsvExportModule();
    const metadata = buildExportMetadata(form, responses, options);
    setPendingCsvExportForm(form);
    setPendingCsvExportResponses(responses);
    setPendingCsvExportMetadata(metadata);
    setPendingCsvExportOptions({ ...options, metadata });
  }

  async function handleToggleCsvPiiField(field: ExportPiiField) {
    const { buildExportMetadata } = await loadCsvExportModule();
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

  async function handleConfirmCsvExport() {
    if (!pendingCsvExportForm || !pendingCsvExportOptions) {
      return;
    }
    try {
      const { exportResponsesToCsv } = await loadCsvExportModule();
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
          canAttemptPrivateSignalDecrypt(record.form, activeAccountAddress, capabilityProfile),
      ),
    [activeAccountAddress, capabilityProfile, decryptedSignalsById, visibleSignals],
  );
  const lockedVisibleSignalsCount = visibleSignals.filter(
    (record) => record.submission.isEncrypted && !decryptedSignalsById[record.submission.id],
  ).length;
  const shouldPrepareInsights = activeWorkspaceTab === "insights" && hasAdminAccess;
  const insightsRecords = useMemo(
    () => {
      if (!shouldPrepareInsights) {
        return [];
      }
      const scopedRecords = selectedFormId === "all"
        ? allSignals
        : allSignals.filter((record) => record.form.id === selectedFormId);
      return scopedRecords.filter((record) => matchesSubmissionVersion(record.submission, selectedVersion));
    },
    [allSignals, selectedFormId, selectedVersion, shouldPrepareInsights],
  );
  useEffect(() => {
    if (!shouldPrepareInsights || insightsRecords.length === 0) {
      return;
    }
    let cancelled = false;
    const formsToLoad = Array.from(
      new Map(insightsRecords.map((record) => [record.form.id, record.form])).values(),
    ).filter((form) => !versionedFormsByFormId[form.id]);
    if (formsToLoad.length === 0) {
      return;
    }

    void Promise.all(
      formsToLoad.map(async (form) => ({
        formId: form.id,
        schemas: await loadVersionedFormSchemas(form),
      })),
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      setVersionedFormsByFormId((current) => ({
        ...current,
        ...Object.fromEntries(entries.map((entry) => [entry.formId, entry.schemas])),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [insightsRecords, shouldPrepareInsights, versionedFormsByFormId]);
  const insightsCounts = useMemo(
    () =>
      insightsRecords.reduce(
        (counts, record) => ({
          unread: counts.unread + (record.submission.status === "unread" ? 1 : 0),
          needsReview: counts.needsReview + (record.submission.status !== "archived" ? 1 : 0),
          encrypted: counts.encrypted + (record.submission.isEncrypted ? 1 : 0),
        }),
        { unread: 0, needsReview: 0, encrypted: 0 },
      ),
    [insightsRecords],
  );
  const signalCountByFormId = useMemo(() => {
    const counts: Record<string, number> = {};
    accessibleForms.forEach((form) => {
      counts[form.id] = 0;
    });
    allSignals.forEach((record) => {
      counts[record.form.id] = (counts[record.form.id] ?? 0) + 1;
    });
    return counts;
  }, [accessibleForms, allSignals]);
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
        submissionCount: signalCountByFormId[form.id] ?? 0,
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
    signalCountByFormId,
    signalIndex.counts.unread,
    t,
    unreadCountByFormId,
  ]);

  const deletableNodeIds = useMemo(
    () => nodeDirectoryItems.filter((item) => item.id !== "all" && item.canDelete).map((item) => item.id),
    [nodeDirectoryItems],
  );

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

  return (
    <AdminAccessGate
      hasWallet={Boolean(activeAccountAddress)}
      access={accessState}
      deniedBody={capabilityProfile.isConfigured ? t("reviewConsoleCapabilityRequirement") : undefined}
    >
      <section className="stack">
        <AdminToast toast={toast} />
        {mockAdmin.enabled ? <div className="mock-admin-badge">MOCK ADMIN</div> : null}
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
            deleteProjectDisabledReason={deleteProjectBlockedReason}
            deletingProject={deletingProject}
            onDeleteProject={() => void handleDeleteProject()}
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

        {hasAdminAccess && (!showGuidedOnboarding || selectedProject) ? (
          <AdminWorkspaceTabs activeTab={activeWorkspaceTab} onSelectTab={setWorkspaceTab} />
        ) : null}

        {activeWorkspaceTab === "members" && hasAdminAccess ? (
          <ProjectMemberManagementSection
            selectedProject={selectedProject}
            onRefreshProjects={refetchProjects}
          />
        ) : showGuidedOnboarding ? (
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
          <Suspense fallback={<WorkspaceInsightsFallback />}>
            <LazyWorkspaceInsights
              totalSignals={insightsRecords.length}
              unreadSignals={insightsCounts.unread}
              needsReviewSignals={insightsCounts.needsReview}
              encryptedSignals={insightsCounts.encrypted}
              records={insightsRecords}
              unlockedSignalsById={decryptedSignalsById}
              versionedFormsByFormId={versionedFormsByFormId}
            />
          </Suspense>
        ) : !inboxSettling && accessibleForms.length === 0 &&
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
            emptyContent={showInitialListSkeleton ? (
              <InboxListSkeleton compact />
            ) : inboxSettling ? null : (
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
            visibleSignals={renderedVisibleSignals}
            timelineModel={inboxTimelineModel}
            demoSignalCount={demoSignalRecords.length}
            demoGenerating={demoSignalsGenerating}
            demoIngestTarget={demoIngestTarget}
            demoArrivalAlert={demoArrivalAlert}
            demoEventFeed={demoEventFeed}
            demoScenario={demoSignalScenario}
            demoOutcome={demoIntelligenceOutcome}
            demoIntelligenceViewMode={demoIntelligenceViewMode}
            latestBrief={latestIntelligenceBrief}
            onOpenDemoBrief={demoBriefAvailable ? () => setDemoIntelligenceAlertOpen(true) : undefined}
            demoJustArrivedSignalIds={demoJustArrivedSignalIds}
            hasMoreSignals={hasMoreRenderedSignals}
            onLoadMoreSignals={() => setRenderedSignalLimit((current) => current + SIGNAL_LIST_PAGE_SIZE)}
            selectedRecord={hasExplicitSelectedRecord ? selectedRecord : null}
            unlockedSignalId={detailAnswers && selectedRecord ? selectedRecord.submission.id : null}
            onSelectSignal={handleSelectMobileSignal}
            onQuickAction={handleQuickAction}
            searchPlaceholder={t("searchSignalsPlaceholder")}
            accessibleForms={accessibleForms}
            selectedFormId={selectedFormId}
            onSelectForm={setSelectedFormId}
            unreadCountByFormId={unreadCountByFormId}
            signalCountByFormId={signalCountByFormId}
            allSignalsCount={allSignals.length}
            totalUnreadCount={signalIndex.counts.unread}
            allSignalNodesLabel={t("allSignalNodes")}
            responseDeadlineLabels={responseDeadlineLabels}
            openNodeDirectoryLabel={t("openNodeDirectory")}
            onOpenNodeDirectory={() => setNodeDirectoryOpen(true)}
            onExportAllFormCsv={handleOpenFormAllCsvExportReview}
            t={t}
            hasAdminAccess={hasAdminAccess}
            selectedProjectName={selectedProject?.name ?? null}
            selectedProjectId={selectedProjectId}
            projects={projects}
            onSelectProject={selectProject}
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
                  signalCountByFormId={signalCountByFormId}
                  allSignalsCount={allSignals.length}
                  totalUnreadCount={signalIndex.counts.unread}
                  activeScopeLabel={activeScopeLabel}
                  allSignalNodesLabel={t("allSignalNodes")}
                  responseDeadlineLabels={responseDeadlineLabels}
                  openNodeDirectoryLabel={t("openNodeDirectory")}
                  onOpenNodeDirectory={() => setNodeDirectoryOpen(true)}
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
                    {versionCounts.length > 1 ? (
                      <label className="review-sort-control">
                        <span className="sr-only">Form version</span>
                        <select
                          value={selectedVersion}
                          onChange={(event) => {
                            const value = event.target.value;
                            setSelectedVersion(value === "all" ? "all" : Number(value));
                            setSelectedSignalId("");
                          }}
                          aria-label="Form version"
                        >
                          <option value="all">All versions</option>
                          {versionCounts.map(([version, count]) => (
                            <option key={version} value={version}>
                              v{version} ({count})
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
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
              <InboxTimelineOverview
                model={inboxTimelineModel}
                t={t}
                compact
                demoSignalCount={demoSignalCount}
                realSignalCount={realSignalCount}
                demoGenerating={demoSignalsGenerating}
                demoIngestTarget={demoIngestTarget}
                demoArrivalAlert={demoArrivalAlert}
                demoEventFeed={demoEventFeed}
                demoScenario={demoSignalScenario}
                demoOutcome={demoIntelligenceOutcome}
                demoIntelligenceViewMode={demoIntelligenceViewMode}
                latestBrief={latestIntelligenceBrief}
                onOpenDemoBrief={demoBriefAvailable ? () => setDemoIntelligenceAlertOpen(true) : undefined}
              />
              {hasAdminAccess ? (
                <section className="answer-card answer-card-plain optional-proof-queue-panel">
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
                        aria-label={
                          registeringSignalIds.length > 0
                            ? t("registeringOnSui")
                            : t("registerSelectedOnSui", { count: selectedPendingVisibleCount })
                        }
                        title={
                          registeringSignalIds.length > 0
                            ? t("registeringOnSui")
                            : t("registerSelectedOnSui", { count: selectedPendingVisibleCount })
                        }
                        disabled={selectedPendingSignalIds.length === 0 || registeringSignalIds.length > 0}
                        onClick={() =>
                          void handleRegisterPendingSignals(undefined, {
                            actionLabel: t("registerSelectedOnSui", { count: selectedPendingVisibleCount }),
                            origin: "pending-sui-bulk-register-button",
                          })
                        }
                      >
                        <span className="sui-register-mark" aria-hidden="true">SUI</span>
                        <span className="sui-register-count" aria-hidden="true">
                          {registeringSignalIds.length > 0 ? "..." : selectedPendingVisibleCount}
                        </span>
                      </button>
                    </div>
                  </div>
                  <p className="muted">{t("optionalProofQueueBody")}</p>
                </section>
              ) : null}

              {showInitialListSkeleton && visibleSignals.length === 0 ? (
                <InboxListSkeleton />
              ) : visibleSignals.length === 0 && !inboxSettling ? (
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
                    {selectedProject && selectedProjectForms.length === 0 ? (
                      <CreateFormLink className="primary-button">
                        {t("createSignalForm")}
                      </CreateFormLink>
                    ) : emptyInboxActionForm ? (
                      <>
                        <Link
                          className="primary-button"
                          to={getPublicFormPath(emptyInboxActionForm.id, emptyInboxActionForm.manifestBlobId)}
                        >
                          {t("openPublicLink")}
                        </Link>
                        <Link
                          className="ghost-button"
                          to={getPublicFormPath(emptyInboxActionForm.id, emptyInboxActionForm.manifestBlobId)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("sendTestSignal")}
                        </Link>
                      </>
                    ) : null
                    }
                  </div>
                </EmptyState>
              ) : visibleSignals.length > 0 ? (
                <div className="signal-list">
                  {renderedVisibleSignals.map((record) => {
                    const { form, submission } = record;
                    const persistenceState = getSignalPersistenceState(submission);
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
                    const isDemoSignal = isDemoSignalSubmission(submission);
                    const isPendingSui = Boolean(submission.pendingOnchainRegistration);
                    const isSelectedForSui = selectedPendingSignalIds.includes(submission.id);
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
                    const cardIntelligence = buildSignalCardIntelligence(record);
                    return (
                      <SignalCard
                        key={submission.id}
                        ref={(node) => {
                          signalCardRefs.current[submission.id] = node;
                        }}
                        t={t}
                        submission={submission}
                        formTitle={form.title}
                        subject={subject}
                        preview={preview}
                        triageStatusLabel={getTriageStatusLabel(submission.triageStatus)}
                        priorityLabel={priorityLabel}
                        lockStateLabel={lockStateLabel}
                        readStateLabel={readStateLabel}
                        persistenceLabel={persistenceLabel}
                        persistenceState={persistenceState}
                        urgencyScoreLabel={`${cardIntelligence.urgencyLabel} ${cardIntelligence.urgencyScore}`}
                        signalTypeLabel={cardIntelligence.signalTypeLabel}
                        analystTypeLabel={cardIntelligence.analystTypeLabel}
                        shortSummary={cardIntelligence.shortSummary}
                        evidenceQuote={cardIntelligence.evidenceQuote}
                        recommendedAction={cardIntelligence.recommendedAction}
                        isSelectedSignal={isSelectedSignal}
                        isPendingSui={isPendingSui}
                        isSelectedForSui={isSelectedForSui}
                        isAnonymousSignal={isAnonymousSignal}
                        isUnlockedSignal={isUnlockedSignal}
                        isOnchainRecoverySnapshot={isOnchainRecoverySnapshot}
                        isDemoSignal={isDemoSignal}
                        isDemoJustArrived={isDemoSignal && demoJustArrivedSignalIds.has(submission.id)}
                        hasPayloadIssue={hasPayloadIssue}
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
                          void handleRegisterPendingSignals([submission.id], {
                            actionLabel: t("registerOnSui"),
                            origin: "signal-card-register-button",
                          });
                        }}
                      />
                    );
                  })}
                  {hasMoreRenderedSignals ? (
                    <button
                      type="button"
                      className="ghost-button signal-list-load-more"
                      onClick={() => setRenderedSignalLimit((current) => current + SIGNAL_LIST_PAGE_SIZE)}
                    >
                      {t("showMoreToggle")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>

            <article ref={signalDetailPanelRef} className="panel signal-detail-column">
              {!selectedRecord ? (
                <SignalIntelligenceCenter
                  model={inboxTimelineModel}
                  t={t}
                  demoSimulationEnabled={intelligenceDemoSimulationEnabled}
                  demoControlsEnabled={isIntelligenceDemoRoute}
                  demoSignalVolume={demoSignalVolume}
                  demoScenario={demoSignalScenario}
                  demoSignalCount={demoSignalCount}
                  realSignalCount={realSignalCount}
                  demoOutcome={demoIntelligenceOutcome}
                  intelligenceBrief={demoIntelligenceBrief}
                  demoIntelligenceViewMode={demoIntelligenceViewMode}
                  demoGenerating={demoSignalsGenerating}
                  demoIngestTarget={demoIngestTarget}
                  demoUnlockAlert={demoUnlockAlert}
                  onDemoIntelligenceViewModeChange={setDemoIntelligenceViewMode}
                  onDemoScenarioChange={handleDemoScenarioChange}
                  onGenerateDemoSignals={handleGenerateDemoSignals}
                  onCancelDemoIngest={handleCancelDemoIngest}
                  onResetDemoSignals={handleResetDemoSignals}
                />
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
                      {selectedRecordIsDemo ? (
                        <span className="signal-chip signal-chip-soft demo-signal-detail-badge">{t("demoSignalNotStoredLabel")}</span>
                      ) : null}
                    </div>
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

                  <div
                    className={`signal-detail-sections review-primary-sections ${
                      selectedRecordNeedsDecrypt ? "" : "is-review-ready"
                    }`}
                  >
                    <section className="answer-card original-signal-section">
                      <WorkspaceSectionToggle
                        title={t("feedbackBodyLabel")}
                        open={detailSectionsState.originalSignalOpen}
                        onToggle={() =>
                          setDetailSectionOpen("originalSignalOpen", !detailSectionsState.originalSignalOpen)
                        }
                        trailing={
                          detailAnswers ? (
                            <span className="signal-chip signal-chip-soft">{t("privateSignalUnlockedStatus")}</span>
                          ) : null
                        }
                      />
                      {detailSectionsState.originalSignalOpen ? (
                        <>
                          <div className="original-signal-block original-signal-body-block">
                            <div className="section-row">
                              <div>
                                <h4>{t("submittedFeedbackTitle")}</h4>
                              </div>
                            </div>
                          {detailAnswers ? (
                            <div className="stack">
                              {detailLegacyUnencrypted ? (
                                <p className="warning-text">{t("legacyUnencryptedResponse")}</p>
                              ) : (
                                <div className="signal-badge-row signal-badge-row-compact original-signal-proof-row">
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
                              {(selectedRecordVersionedForm ?? selectedRecord.form).fields
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
                                {detailAttachments.length > 0 ? (
                                  <div className="locked-signal-attachment-state">
                                    <span className="signal-chip signal-chip-soft">{t("attachments")}</span>
                                    <span>{t("attachmentsHiddenUntilUnlocked")}</span>
                                  </div>
                                ) : null}
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
                          {!isReviewerFocusMode && !selectedRecordNeedsDecrypt ? (
                            <div className="original-signal-block">
                              <WorkspaceSectionToggle
                                eyebrow={t("attachments")}
                                title={t("attachments")}
                                detail={
                                  detailAttachments.length === 0
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
                                detailAttachments.length === 0 ? (
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
                    <SelectedSignalIntelligenceCard
                      record={selectedRecord}
                      t={t}
                      createFollowUpHref={selectedFollowUpCreateHref}
                      actionDisabled={saving || isReviewWorkbenchLocked || selectedRecordIsDemo}
                      followUpProminent={selectedFollowUpProminent}
                      showEmergingRiskAction={!selectedRecordIsDemo && selectedShowEmergingRiskAction}
                      showRoadmapAction={selectedShowRoadmapAction}
                      demoOutcome={demoIntelligenceOutcome}
                      isMarkingEmergingRisk={
                        hasNeedsFollowUp(selectedRecord.submission) && selectedRecord.submission.priority === "high"
                      }
                      isPublishingToRoadmap={isSelectedRecordOnRoadmap}
                      onMarkEmergingRisk={() => void handleMarkSelectedEmergingRisk()}
                      onPublishToRoadmap={() => void handlePublishSelectedToRoadmap()}
                    />
                    <SignalTimelineSection
                      open={detailSectionsState.signalTimelineOpen}
                      onToggle={() => setDetailSectionOpen("signalTimelineOpen", !detailSectionsState.signalTimelineOpen)}
                      entries={selectedSignalTimelineEntries}
                      currentState={selectedSignalTimelineCurrentState}
                      timelineNow={timelineNow}
                      getPhaseLabel={getTimelinePhaseLabel}
                    />

                    {!selectedRecordIsDemo ? (
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
                      onExportJson={() =>
                        exportSubmissionJson(selectedRecordVersionedForm ?? selectedRecord.form, selectedRecord.submission)
                      }
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
                        void handleRegisterPendingSignals([selectedRecord.submission.id], {
                          actionLabel: t("registerOnSui"),
                          origin: "signal-detail-register-button",
                        });
                      }}
                      detailLegacyUnencrypted={detailLegacyUnencrypted}
                      detailAnswersPresent={Boolean(detailAnswers)}
                      hasAdminAccess={hasAdminAccess}
                      selectedRecordStoredOnWalrus={selectedRecordStoredOnWalrus}
                      privateReviewLabel={privateReviewLabel}
                      responseDeadlineValue={formatResponseDeadline(selectedRecord.form.responseDeadline, responseDeadlineLabels)}
                      walletAccessValue={getWalletAccessLabel(selectedRecord.form, activeAccountAddress)}
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
                      canDecrypt={Boolean(activeAccountAddress)}
                      relatedSignals={relatedSignals}
                      selectedSignalId={selectedSignalId}
                      onSelectRelatedRecord={(record) => {
                        if (decryptInFlightRef.current) {
                          return;
                        }
                        handleSelectDesktopSignal(record.submission.id, { scrollIntoView: true });
                      }}
                    />
                    ) : null}
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
        selectedRecordForm={selectedRecordVersionedForm}
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
        walletAccountAddress={activeAccountAddress}
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
      {demoIntelligenceAlertOpen && intelligenceDemoSimulationEnabled && demoBriefAvailable ? (
        <div className="node-directory-overlay" role="dialog" aria-modal="true" aria-labelledby="intelligence-alert-title">
          <div className="node-directory-backdrop" onClick={() => setDemoIntelligenceAlertOpen(false)} />
          <section className="panel glow-panel node-directory-panel intelligence-alert-modal">
            <div className="signal-detail-heading node-directory-heading">
              <div>
                <p className="eyebrow">{t("intelligenceAlertEyebrow")}</p>
                <h2 id="intelligence-alert-title">{t("intelligenceAlertTitle")}</h2>
                <p className="muted">{t("intelligenceAlertBody")}</p>
              </div>
              <button
                type="button"
                className="review-session-close-button"
                aria-label={t("intelligenceAlertMinimize")}
                title={t("intelligenceAlertMinimize")}
                onClick={() => setDemoIntelligenceAlertOpen(false)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </svg>
              </button>
            </div>
            {demoSignalsGenerating && demoIngestTarget ? (
              <div className="intelligence-alert-receiving" role="status" aria-live="polite">
                <span>{t("intelligenceAlertReceiving", { count: demoSignalCount, target: demoIngestTarget })}</span>
                <span className="demo-ingest-progress-track">
                  <span
                    className="demo-ingest-progress-fill"
                    style={{ width: `${Math.min(100, Math.round((demoSignalCount / demoIngestTarget) * 100))}%` }}
                  />
                </span>
              </div>
            ) : null}
            <ExecutiveBriefCard
              t={t}
              brief={demoIntelligenceBrief}
              demoSignalCount={demoSignalCount}
              realSignalCount={realSignalCount}
              mixLabel={t("demoSignalMixLabel", { demo: demoSignalCount, real: realSignalCount })}
            />
            <div className="intelligence-alert-actions">
              <button type="button" className="primary-button" onClick={() => setDemoIntelligenceAlertOpen(false)}>
                {t("intelligenceAlertViewSignals")}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setDemoIntelligenceViewMode("developer");
                  setDemoIntelligenceAlertOpen(false);
                }}
              >
                {t("intelligenceAlertDeveloperDetails")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {showShortcutHelp ? (
        <div className="node-directory-overlay" role="dialog" aria-modal="true" aria-labelledby="shortcut-help-title">
          <div className="node-directory-backdrop" onClick={() => setShowShortcutHelp(false)} />
          <section className="panel glow-panel node-directory-panel shortcut-help-panel">
            <div className="signal-detail-heading node-directory-heading">
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
            <div className="signal-detail-heading node-directory-heading">
              <div>
                <p className="eyebrow">{t("signalNodesTitle")}</p>
                <h2>{t("nodeDirectoryTitle")}</h2>
                <p className="muted">{t("nodeDirectoryDescription")}</p>
              </div>
              <button
                type="button"
                className="review-session-close-button"
                aria-label={t("closeLabel")}
                title={t("closeLabel")}
                onClick={() => setNodeDirectoryOpen(false)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="node-directory-toolbar">
              <input
                value={nodeSearch}
                onChange={(event) => setNodeSearch(event.target.value)}
                placeholder={t("searchNodesPlaceholder")}
              />
              <div className="node-directory-toolbar-actions node-directory-toolbar-actions--bulk-delete">
                {deletableNodeIds.length > 0 ? (
                  <button
                    type="button"
                    className="ghost-button node-directory-delete"
                    onClick={() => void handleDeleteVisibleNodes(deletableNodeIds)}
                    disabled={deletingVisibleNodes || deletableNodeIds.length === 0}
                  >
                    {deletingVisibleNodes ? t("deletingLabel") : t("bulkDeleteNodes", { count: deletableNodeIds.length })}
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
                    {item.id === "all" ? (
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
                          <p className="muted">{t("signalsCount", { count: item.submissionCount })}</p>
                        </div>
                      </button>
                    ) : (
                      <LongPressNodeDirectoryButton
                        title={item.title}
                        unreadCount={item.unreadCount}
                        submissionCount={item.submissionCount}
                        isLegacyDemo={item.isLegacyDemo}
                        isAccessible={item.isAccessible}
                        isOnchain={item.isOnchain}
                        onchainFormId={item.onchainFormId}
                        isSelected={isSelected}
                        isLongPressCapable={isLongPressCapable}
                        isRegistering={registeringFormId === item.id}
                        isRegisterDisabled={item.isOnchain || isNodeRegistrationBusy || deletingVisibleNodes}
                        canDelete={item.canDelete}
                        isDeleting={deletingFormId === item.id}
                        t={t}
                        onSelect={() => {
                          setSelectedFormId(item.id);
                          setNodeDirectoryOpen(false);
                        }}
                        onRegister={() => void handleRegisterNodeOnSui(item.id)}
                        onOpenBeacon={() => openNodeBeacon(item.id)}
                        onDelete={() => void handleDelete(item.id)}
                      />
                    )}
                    {item.id !== "all" && item.isAccessible && !isMobileNodeDirectory ? (
                      <div className="node-directory-actions">
                        <button
                          type="button"
                          className="ghost-button node-directory-action-button"
                          onClick={() => openNodeBeacon(item.id)}
                        >
                          <OpenBeaconActionIcon />
                          <span className="node-directory-action-label">{t("openSignalBeacon")}</span>
                        </button>
                        {item.canRegisterOnSui ? (
                          <button
                            type="button"
                            className="ghost-button node-directory-action-button"
                            onClick={() => void handleRegisterNodeOnSui(item.id)}
                            disabled={isNodeRegistrationBusy || deletingVisibleNodes}
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
                    {item.id !== "all" && item.isAccessible && isMobileNodeDirectory && shouldShowRegistrationFeedback && registrationFeedback ? (
                      <p className={`node-directory-feedback is-${registrationFeedback.tone}`}>
                        {registrationFeedback.message}
                      </p>
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
            <div className="signal-detail-heading node-directory-heading">
              <div>
                <p className="eyebrow">{t("signalBeaconLabel")}</p>
                <h2>{selectedBeaconForm.title}</h2>
                <p className="muted">{t("signalBeaconFromNodeDescription")}</p>
              </div>
              <button
                type="button"
                className="review-session-close-button"
                aria-label={t("closeLabel")}
                title={t("closeLabel")}
                onClick={() => setBeaconFormId(null)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </svg>
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
