import type { FormPurpose, FormSchema, FormVisibility } from "../types";

export type ExploreCategory = "All" | "Bug" | "Feature" | "Survey" | "Application";
export type ExploreTabKey = "trending" | "recent" | "active" | "ai";

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
}) {
  const ageMs = Date.now() - new Date(args.updatedAt).getTime();
  const hours = Number.isFinite(ageMs) ? ageMs / (1000 * 60 * 60) : Number.POSITIVE_INFINITY;
  const freshness =
    hours < 12 ? "Fresh activity detected." : hours < 72 ? "Signal flow remains active." : "Quiet stream, ready for new input.";

  const intensity =
    args.signalCount >= 25
      ? "High-volume relay."
      : args.signalCount >= 10
        ? "Steady contributor traffic."
        : args.signalCount >= 1
          ? "Early signal cluster forming."
          : "Beacon is live and awaiting first signal.";

  return `AI Insight: ${args.category} channel. ${intensity} ${freshness}`;
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
