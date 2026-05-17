import type { FormPurpose, FormSchema, FormVisibility } from "../types";

export type ExploreCategory = "All" | "Bug" | "Feature" | "Survey" | "Application";
export type ExploreTabKey = "trending" | "recent" | "active" | "ai";
export type ExplorePreviewLabels = {
  category: string;
  freshActivity: string;
  activeFlow: string;
  quietStream: string;
  highVolume: string;
  steadyTraffic: string;
  earlyCluster: string;
  awaitingFirstSignal: string;
  prefix: string;
  channelSuffix: string;
};

export function normalizeFormVisibility(value: unknown, publicExplore?: unknown): FormVisibility {
  if (value === "private" || value === "unlisted" || value === "public") {
    return value;
  }
  if (publicExplore === true) {
    return "public";
  }
  return "unlisted";
}

export function isFormPubliclyExplorable(form: Pick<FormSchema, "visibility" | "publicExplore">) {
  return normalizeFormVisibility(form.visibility, form.publicExplore) === "public" || form.publicExplore === true;
}

export function getExploreCategory(form: Pick<FormSchema, "purpose" | "title" | "description">): ExploreCategory {
  if (form.purpose === "bug") {
    return "Bug";
  }
  if (form.purpose === "feature") {
    return "Feature";
  }
  if (form.purpose === "survey") {
    return "Survey";
  }

  const haystack = `${form.title} ${form.description}`.toLowerCase();
  if (/\b(apply|application|candidate|grant|request access)\b/.test(haystack)) {
    return "Application";
  }
  if (/\b(bug|crash|issue|error)\b/.test(haystack)) {
    return "Bug";
  }
  if (/\b(feature|request|idea)\b/.test(haystack)) {
    return "Feature";
  }
  if (/\b(survey|research|poll|questionnaire)\b/.test(haystack)) {
    return "Survey";
  }
  return "Application";
}

export function buildExploreAiPreview(args: {
  category: ExploreCategory;
  signalCount: number;
  updatedAt: string;
  labels?: ExplorePreviewLabels;
}) {
  const ageMs = Date.now() - new Date(args.updatedAt).getTime();
  const hours = Number.isFinite(ageMs) ? ageMs / (1000 * 60 * 60) : Number.POSITIVE_INFINITY;
  const labels = args.labels ?? {
    category: args.category,
    freshActivity: "Fresh activity detected.",
    activeFlow: "Signal flow remains active.",
    quietStream: "Quiet stream, ready for new input.",
    highVolume: "High-volume relay.",
    steadyTraffic: "Steady contributor traffic.",
    earlyCluster: "Early signal cluster forming.",
    awaitingFirstSignal: "Beacon is live and awaiting first signal.",
    prefix: "AI Insight:",
    channelSuffix: "channel.",
  };
  const freshness =
    hours < 12 ? labels.freshActivity : hours < 72 ? labels.activeFlow : labels.quietStream;

  const intensity =
    args.signalCount >= 25
      ? labels.highVolume
      : args.signalCount >= 10
        ? labels.steadyTraffic
        : args.signalCount >= 1
          ? labels.earlyCluster
          : labels.awaitingFirstSignal;

  return `${labels.prefix} ${labels.category}${labels.channelSuffix ? ` ${labels.channelSuffix}` : ""} ${intensity} ${freshness}`;
}

export function getPurposeLabel(purpose?: FormPurpose) {
  switch (purpose) {
    case "bug":
      return "Bug Report";
    case "feature":
      return "Feature Request";
    case "survey":
      return "Survey";
    default:
      return "Application";
  }
}
