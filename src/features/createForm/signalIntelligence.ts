import type { FieldType, FormBuilderValues, FormField, FormIdentityPolicy, FormSection, FormVisibility } from "./types";

export type SignalIntelligenceTone = "warning" | "suggestion" | "strength";

export type SignalIntelligenceMessageKey =
  | "responseFatigueManyBlocks"
  | "responseFatigueRequiredRatio"
  | "reflectionGap"
  | "privacySealSuggestion"
  | "identityFriction"
  | "narrativeShortText"
  | "narrativeShallowChoice"
  | "publishReadinessStrong"
  | "privacyPostureStrong"
  | "reflectionDepthStrong";

export interface SignalIntelligenceItem {
  id: SignalIntelligenceMessageKey;
  tone: SignalIntelligenceTone;
}

export interface SignalDraftAnalysis {
  score: number;
  warnings: SignalIntelligenceItem[];
  suggestions: SignalIntelligenceItem[];
  strengths: SignalIntelligenceItem[];
  metrics: {
    fieldCount: number;
    requiredRatio: number;
    hasReflectionBlock: boolean;
    hasSensitiveLanguage: boolean;
  };
}

type SignalDraftAnalysisInput = Pick<
  FormBuilderValues,
  "title" | "description" | "fields" | "sections" | "visibility" | "identityPolicy" | "encryptSubmissions"
>;

const reflectionFieldTypes: FieldType[] = ["longText", "markdown"];
const shallowFieldTypes: FieldType[] = ["rating", "checkbox", "dropdown"];
const reflectionWords = ["why", "feel", "reflection", "improve", "change"];
const sensitiveWords = [
  "private",
  "anonymous",
  "identity",
  "wallet",
  "email",
  "personal",
  "complaint",
  "report",
  "feedback",
];

function normalizeText(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function collectDraftText(input: SignalDraftAnalysisInput) {
  const fieldText = (input.fields ?? []).flatMap((field) => [
    field.label,
    field.helpText,
    field.placeholder,
    ...(field.options ?? []),
    ...(field.rows ?? []),
    ...(field.columns ?? []),
  ]);
  const sectionText = (input.sections ?? []).flatMap((section: FormSection) => [section.title, section.description]);
  return [input.title, input.description, ...fieldText, ...sectionText].map(normalizeText).join(" ");
}

function hasAnyWord(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function createItem(id: SignalIntelligenceMessageKey, tone: SignalIntelligenceTone): SignalIntelligenceItem {
  return { id, tone };
}

export function analyzeSignalDraft(values: SignalDraftAnalysisInput): SignalDraftAnalysis {
  const fields: FormField[] = values.fields ?? [];
  const fieldCount = fields.length;
  const requiredCount = fields.filter((field) => Boolean(field.required)).length;
  const requiredRatio = fieldCount > 0 ? requiredCount / fieldCount : 0;
  const draftText = collectDraftText(values);
  const hasReflectionText = hasAnyWord(draftText, reflectionWords);
  const hasSensitiveLanguage = hasAnyWord(draftText, sensitiveWords);
  const hasReflectionBlock = fields.some((field) => reflectionFieldTypes.includes(field.type)) || hasReflectionText;
  const longTextCount = fields.filter((field) => reflectionFieldTypes.includes(field.type)).length;
  const shortTextCount = fields.filter((field) => field.type === "shortText").length;
  const shallowCount = fields.filter((field) => shallowFieldTypes.includes(field.type)).length;
  const titleReady = Boolean(values.title?.trim());
  const descriptionReady = Boolean(values.description?.trim());
  const privacySelected = Boolean(values.visibility as FormVisibility) && Boolean(values.identityPolicy as FormIdentityPolicy);

  const warnings: SignalIntelligenceItem[] = [];
  const suggestions: SignalIntelligenceItem[] = [];
  const strengths: SignalIntelligenceItem[] = [];

  if (fieldCount >= 8) {
    warnings.push(createItem("responseFatigueManyBlocks", "warning"));
  }
  if (requiredRatio > 0.7) {
    warnings.push(createItem("responseFatigueRequiredRatio", "warning"));
  }
  if (!hasReflectionBlock) {
    suggestions.push(createItem("reflectionGap", "suggestion"));
  }
  if (hasSensitiveLanguage && !values.encryptSubmissions) {
    suggestions.push(createItem("privacySealSuggestion", "suggestion"));
  }
  if (values.identityPolicy === "wallet_required" && fieldCount >= 6) {
    warnings.push(createItem("identityFriction", "warning"));
  }
  if (fieldCount > 0 && shortTextCount === fieldCount && longTextCount === 0) {
    suggestions.push(createItem("narrativeShortText", "suggestion"));
  }
  if (fieldCount > 0 && shallowCount / fieldCount > 0.6 && longTextCount === 0) {
    suggestions.push(createItem("narrativeShallowChoice", "suggestion"));
  }
  if (titleReady && descriptionReady && fieldCount > 0 && privacySelected && requiredRatio <= 0.7) {
    strengths.push(createItem("publishReadinessStrong", "strength"));
  }
  if (values.encryptSubmissions || values.identityPolicy === "anonymous_allowed") {
    strengths.push(createItem("privacyPostureStrong", "strength"));
  }
  if (hasReflectionBlock) {
    strengths.push(createItem("reflectionDepthStrong", "strength"));
  }

  const score = clampScore(
    64 +
      (titleReady ? 8 : 0) +
      (descriptionReady ? 8 : 0) +
      (fieldCount > 0 ? 8 : 0) +
      (privacySelected ? 6 : 0) +
      (hasReflectionBlock ? 6 : 0) +
      (values.encryptSubmissions ? 4 : 0) -
      warnings.length * 10 -
      suggestions.length * 5,
  );

  return {
    score,
    warnings,
    suggestions,
    strengths,
    metrics: {
      fieldCount,
      requiredRatio,
      hasReflectionBlock,
      hasSensitiveLanguage,
    },
  };
}
