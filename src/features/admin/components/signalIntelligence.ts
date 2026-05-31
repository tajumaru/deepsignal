import { formatAnswerText } from "../../../lib/answerFormatting";
import { getSubmissionRespondentMeta, isVerifiedSignal } from "../../../lib/respondentMeta";
import type { useI18n } from "../../../i18n";
import type { Submission, SubmissionLocation } from "../../../types";
import type { SignalRecord } from "../hooks/useSignalInboxData";
import type { ResolvedAnalysisProfile } from "./analysisProfiles";
import {
  getAnalystTypeLabel,
  getAnalysisSignalTypeLabel,
  resolveAnalystTypeForForm,
  resolveSignalTypeForForm,
} from "./analysisProfiles";

type TranslationFn = ReturnType<typeof useI18n>["t"];

export interface SignalCardIntelligence {
  urgencyScore: number;
  urgencyLabel: string;
  signalTypeLabel: string;
  analystTypeLabel: string;
  shortSummary: string;
  evidenceQuote: string;
  recommendedAction: string;
  emotionalTone: string;
  verifiedLabel: string;
  locationLabel: string | null;
}

export interface AnalysisSummaryEntry {
  id: string;
  label: string;
  value: string;
  detail?: string;
}

export interface AnalysisOverviewCard {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone?: "alert" | "cluster";
}

export interface WorkspaceAnalysisExperience {
  summaryEntries: AnalysisSummaryEntry[];
  overviewCards: AnalysisOverviewCard[];
  executiveLines: string[];
}

function compact(text: string, maxLength = 160) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function firstReadableAnswer(record: SignalRecord) {
  const knownFieldIds = new Set<string>();
  for (const field of record.form.fields) {
    knownFieldIds.add(field.id);
    const answer = compact(formatAnswerText(field, record.submission.answers?.[field.id], "en"), 180);
    if (answer && answer.toLowerCase() !== "no answer") {
      return answer;
    }
  }
  for (const [fieldId, value] of Object.entries(record.submission.answers ?? {})) {
    if (knownFieldIds.has(fieldId)) {
      continue;
    }
    const answer = compact(formatAnswerText(undefined, value, "en"), 180);
    if (answer && answer.toLowerCase() !== "no answer") {
      return answer;
    }
  }
  return "";
}

function translate(t: TranslationFn | undefined, key: string, fallback: string, params?: Record<string, string | number>) {
  return t ? t(key, params) : fallback;
}

function getEvidenceQuote(record: SignalRecord, t?: TranslationFn) {
  const text =
    firstReadableAnswer(record) ||
    record.submission.subjectPreview ||
    record.submission.aiSummary ||
    translate(t, "signalContentUnavailable", "Signal content unavailable.");
  return compact(text, 144);
}

function findLocation(submission: Submission) {
  return submission.location ?? submission.publicPayload?.location ?? null;
}

function formatLocation(location: SubmissionLocation | null) {
  if (!location) {
    return null;
  }
  return `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`;
}

function getEmotionLabel(emotion?: string, t?: TranslationFn) {
  if (!emotion) {
    return translate(t, "emotionMixedLabel", "Mixed");
  }
  const normalized = emotion.replace(/[_-]/g, " ").trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildUrgencyScore(submission: Submission) {
  let score = 20;
  if (submission.priority === "high" || submission.severity === "high") {
    score += 38;
  } else if (submission.priority === "medium" || submission.severity === "medium") {
    score += 20;
  }
  if (submission.status === "unread") {
    score += 10;
  }
  if (submission.triageStatus === "new") {
    score += 12;
  } else if (submission.triageStatus === "investigating") {
    score += 6;
  }
  if (typeof submission.ratingValue === "number") {
    score += submission.ratingValue * 4;
  }
  if (/urgent|panic|fear|angry|frustrated|distress|critical/i.test(submission.emotion ?? "")) {
    score += 10;
  }
  return Math.max(0, Math.min(100, score));
}

function getUrgencyBand(score: number, t?: TranslationFn) {
  if (score >= 75) {
    return translate(t, "urgencyBandCritical", "Critical");
  }
  if (score >= 55) {
    return translate(t, "urgencyBandElevated", "Elevated");
  }
  if (score >= 35) {
    return translate(t, "urgencyBandMonitor", "Monitor");
  }
  return translate(t, "urgencyBandLow", "Low");
}

function getTopKeywords(record: SignalRecord) {
  return [...new Set((record.submission.keywords ?? []).filter(Boolean))].slice(0, 3);
}

function getLocalizedSignalTypeLabel(signalType: ReturnType<typeof resolveSignalTypeForForm>, t?: TranslationFn) {
  return translate(t, `analysisSignalType_${signalType}`, getAnalysisSignalTypeLabel(signalType));
}

function getLocalizedAnalystTypeLabel(analystType: ReturnType<typeof resolveAnalystTypeForForm>, t?: TranslationFn) {
  return translate(t, `analysisAnalystType_${analystType}`, getAnalystTypeLabel(analystType));
}

function buildRecommendedAction(record: SignalRecord, score: number, t?: TranslationFn) {
  const signalType = resolveSignalTypeForForm(record.form);
  const analystType = resolveAnalystTypeForForm(record.form, signalType);

  if (signalType === "disaster") {
    return score >= 75
      ? translate(t, "signalActionDisasterCritical", "Validate the location cluster and route urgent help needs now.")
      : translate(t, "signalActionDisasterMonitor", "Check who has not responded and confirm whether the cluster is expanding.");
  }
  if (signalType === "internal_report") {
    return score >= 75
      ? translate(t, "signalActionInternalReportCritical", "Escalate to the owning lead and preserve evidence before this splits into side channels.")
      : translate(t, "signalActionInternalReportMonitor", "Group this with the same team theme and assign one reviewer.");
  }
  if (signalType === "feedback" || signalType === "product_voice") {
    return analystType === "product"
      ? translate(t, "signalActionProductFeedback", "Merge this into the dominant friction theme and translate it into one product action.")
      : translate(t, "signalActionFeedbackCluster", "Acknowledge the request and check if it repeats across the same cluster.");
  }
  if (signalType === "community") {
    return translate(t, "signalActionCommunity", "Compare mood and participation trend before deciding whether this is momentum or drift.");
  }
  if (signalType === "incident") {
    return score >= 75
      ? translate(t, "signalActionIncidentCritical", "Escalate the highest-severity cluster and confirm the blast radius.")
      : translate(t, "signalActionIncidentMonitor", "Check recurrence risk and tag the affected area for follow-up.");
  }
  return translate(t, "signalActionDefault", "Review the strongest evidence signal first and keep the next operator move explicit.");
}

export function buildSignalCardIntelligence(record: SignalRecord, t?: TranslationFn): SignalCardIntelligence {
  const urgencyScore = buildUrgencyScore(record.submission);
  const signalType = resolveSignalTypeForForm(record.form);
  const analystType = resolveAnalystTypeForForm(record.form, signalType);
  const respondentMeta = getSubmissionRespondentMeta(record.submission);
  const keywords = getTopKeywords(record);

  return {
    urgencyScore,
    urgencyLabel: getUrgencyBand(urgencyScore, t),
    signalTypeLabel: getLocalizedSignalTypeLabel(signalType, t),
    analystTypeLabel: getLocalizedAnalystTypeLabel(analystType, t),
    shortSummary: compact(
      record.submission.aiSummary ||
      firstReadableAnswer(record) ||
      record.submission.subjectPreview ||
      translate(t, "signalPendingAnalysis", "Signal pending analysis."),
      112,
    ),
    evidenceQuote: getEvidenceQuote(record, t),
    recommendedAction: buildRecommendedAction(record, urgencyScore, t),
    emotionalTone: getEmotionLabel(record.submission.emotion, t),
    verifiedLabel: isVerifiedSignal(record.submission)
      ? translate(t, "verifiedLabel", "Verified")
      : respondentMeta.isAnonymous
        ? translate(t, "anonymousLabel", "Anonymous")
        : translate(t, "unverifiedLabel", "Unverified"),
    locationLabel: formatLocation(findLocation(record.submission)) ?? record.submission.clusterId ?? keywords[0] ?? null,
  };
}

function collectThemeCounts(records: SignalRecord[]) {
  const counts = new Map<string, number>();
  records.forEach((record) => {
    const terms = [
      ...(record.submission.keywords ?? []),
      record.submission.clusterId ?? "",
      record.form.projectName ?? "",
    ]
      .map((value) => value.trim())
      .filter((value) => value.length > 2);
    terms.forEach((term) => counts.set(term, (counts.get(term) ?? 0) + 1));
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function countLocations(records: SignalRecord[]) {
  const counts = new Map<string, number>();
  records.forEach((record) => {
    const location = formatLocation(findLocation(record.submission));
    if (location) {
      counts.set(location, (counts.get(location) ?? 0) + 1);
    }
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function getAverageUrgency(records: SignalRecord[]) {
  if (records.length === 0) {
    return 0;
  }
  const total = records.reduce((sum, record) => sum + buildUrgencyScore(record.submission), 0);
  return Math.round(total / records.length);
}

function getConfidenceLabel(records: SignalRecord[], encryptedWaitingCount: number) {
  const coverage = records.length === 0 ? 0 : Math.round(((records.length - encryptedWaitingCount) / records.length) * 100);
  if (records.length >= 8 && coverage >= 80) {
    return { value: "High", detail: `${coverage}% readable evidence across ${records.length} signals.` };
  }
  if (records.length >= 4 && coverage >= 55) {
    return { value: "Moderate", detail: `${coverage}% readable evidence with some locked or sparse signals.` };
  }
  return { value: "Low", detail: "Evidence is limited by volume, encryption coverage, or sparse metadata." };
}

function getTrendLabel(records: SignalRecord[]) {
  if (records.length < 2) {
    return "Early";
  }
  const ordered = [...records].sort((left, right) => Date.parse(left.submission.createdAt) - Date.parse(right.submission.createdAt));
  const midpoint = Math.floor(ordered.length / 2);
  const firstHalf = ordered.slice(0, Math.max(1, midpoint));
  const secondHalf = ordered.slice(Math.max(1, midpoint));
  if (secondHalf.length > firstHalf.length) {
    return "Rising";
  }
  if (secondHalf.length < firstHalf.length) {
    return "Cooling";
  }
  return "Steady";
}

export function buildWorkspaceAnalysisExperience(input: {
  records: SignalRecord[];
  profile: ResolvedAnalysisProfile;
  encryptedWaitingCount: number;
  anomalyCount: number;
  topClusterLabel: string;
}) : WorkspaceAnalysisExperience {
  const { records, profile, encryptedWaitingCount, anomalyCount, topClusterLabel } = input;
  const averageUrgency = getAverageUrgency(records);
  const topThemes = collectThemeCounts(records).slice(0, 3);
  const topLocations = countLocations(records).slice(0, 1);
  const topEvidence = records
    .map((record) => ({ record, urgency: buildUrgencyScore(record.submission) }))
    .sort((left, right) => right.urgency - left.urgency)[0]?.record;
  const confidence = getConfidenceLabel(records, encryptedWaitingCount);
  const signalType = profile.signalType;
  const analystType = profile.analystType;

  const whatHappened = topClusterLabel && topClusterLabel !== "No dominant cluster yet"
    ? `${records.length} signals are clustering around ${topClusterLabel.toLowerCase()}.`
    : `${records.length} signals are active with no single cluster fully dominant yet.`;

  const keyRisk =
    signalType === "disaster"
      ? "Missing responses or tight location clustering can hide unmet safety needs."
      : signalType === "internal_report"
        ? "Escalation may spread privately before one owner captures the pattern."
        : signalType === "feedback" || signalType === "product_voice"
          ? "Repeated friction can be misread as one-off noise if it stays buried in the inbox."
          : signalType === "community"
            ? "Participation drift can look calm right before disengagement becomes visible."
            : "A dominant signal cluster may expand faster than the current review pace.";

  const whyItMatters =
    analystType === "executive"
      ? `Impact is concentrated in ${profile.signalType === "feedback" ? "customer friction" : "operational decision pressure"}, and a reviewer needs one clear decision path.`
      : analystType === "product"
        ? "The value here is not the raw responses. It is the repeated friction and feature opportunity they reveal."
        : analystType === "community"
          ? "Mood and participation movement matter because disengagement often appears before explicit complaints."
          : analystType === "operations"
            ? "This matters because response order and assignment clarity determine whether the queue shrinks or compounds."
            : profile.whyItMatters;

  const summaryEntries: AnalysisSummaryEntry[] = [
    { id: "what", label: "What happened", value: whatHappened },
    { id: "why", label: "Why it matters", value: whyItMatters },
    { id: "urgency", label: "Urgency level", value: `${getUrgencyBand(averageUrgency)} (${averageUrgency}/100)`, detail: `${anomalyCount} anomaly signals in the current view.` },
    { id: "risk", label: "Key risk", value: keyRisk },
    { id: "next", label: "Recommended next action", value: profile.highlightedAction },
    { id: "confidence", label: "Confidence / data quality", value: confidence.value, detail: confidence.detail },
  ];

  const overviewCards: AnalysisOverviewCard[] = [
    {
      id: "urgency-score",
      label: "Urgency Score",
      value: `${averageUrgency}/100`,
      detail: `${getUrgencyBand(averageUrgency)} pressure across the visible signal set.`,
      tone: averageUrgency >= 60 ? "alert" : "cluster",
    },
    {
      id: "emotional-tone",
      label: "Emotional Tone",
      value: getEmotionLabel(records[0]?.submission.emotion),
      detail: records.filter((record) => /urgent|frustrated|angry|concerned/i.test(record.submission.emotion ?? "")).length > 0
        ? "High-intensity language is visible in the current stream."
        : "No dominant high-intensity emotional pattern is standing out.",
      tone: records.some((record) => /urgent|frustrated|angry|concerned/i.test(record.submission.emotion ?? "")) ? "alert" : "cluster",
    },
    {
      id: "top-themes",
      label: "Top Themes",
      value: topThemes.map(([theme]) => theme).join(" / ") || "No repeated themes yet",
      detail: topThemes.length > 0 ? `${topThemes[0]?.[1] ?? 0} signals reinforce the leading theme.` : "Themes will appear as repeated keywords accumulate.",
    },
    {
      id: "anomaly-signals",
      label: "Anomaly Signals",
      value: anomalyCount.toLocaleString(),
      detail: anomalyCount > 0 ? "Recent intake moved outside the local baseline." : "No anomaly spike detected in the current window.",
      tone: anomalyCount > 0 ? "alert" : "cluster",
    },
    {
      id: "recommended-actions",
      label: "Recommended Actions",
      value: profile.recommendedActions[0]?.title ?? profile.highlightedAction,
      detail: profile.recommendedActions[1]?.title ?? "No secondary action queued.",
      tone: "cluster",
    },
    {
      id: "evidence-signals",
      label: "Evidence Signals",
      value: topEvidence ? compact(topEvidence.submission.subjectPreview || topEvidence.submission.aiSummary || topEvidence.submission.id, 48) : "No evidence yet",
      detail: topEvidence ? `"${getEvidenceQuote(topEvidence)}"` : "Evidence quotes appear when readable signal content is available.",
      tone: topEvidence ? "alert" : "cluster",
    },
    {
      id: "trend-timeline",
      label: "Trend / Timeline",
      value: getTrendLabel(records),
      detail: `${records.length} signals shape the current trend window.`,
      tone: getTrendLabel(records) === "Rising" ? "alert" : "cluster",
    },
  ];

  if (topLocations[0]) {
    overviewCards.push({
      id: "location-cluster",
      label: "Location Cluster",
      value: topLocations[0][0],
      detail: `${topLocations[0][1]} signals are concentrated in the same location band.`,
      tone: topLocations[0][1] >= 2 ? "alert" : "cluster",
    });
  }

  const executiveLines = [
    `${profile.label}: ${whatHappened}`,
    `Impact: ${keyRisk}`,
    `Decision needed: ${profile.highlightedAction}`,
  ];

  return { summaryEntries, overviewCards, executiveLines };
}
