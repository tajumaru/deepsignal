import type { FieldType, FormField, FormSchema, SignalFieldProcessingPolicy, Submission } from "../types";

const AGGREGATE_FIELD_TYPES = new Set<FieldType>([
  "checkbox",
  "confirmation",
  "country_select",
  "date",
  "dropdown",
  "emotionRating",
  "matrix",
  "rating",
]);

export function getSignalProcessingMode(form?: Pick<FormSchema, "processingMode">, submission?: Pick<Submission, "processingMode">) {
  return submission?.processingMode ?? form?.processingMode ?? "review_required";
}

export function normalizeFieldProcessingPolicy(policy: unknown): SignalFieldProcessingPolicy {
  return policy === "aggregate" || policy === "review" || policy === "auto" ? policy : "auto";
}

export function isAggregateInsightField(field: FormField) {
  if (field.sensitive) {
    return false;
  }
  const policy = normalizeFieldProcessingPolicy(field.processingPolicy);
  if (policy === "aggregate") {
    return true;
  }
  if (policy === "review") {
    return false;
  }
  return AGGREGATE_FIELD_TYPES.has(field.type);
}

export function buildSubmissionInsightPayload(
  form: Pick<FormSchema, "fields" | "processingMode" | "encryptSubmissions">,
  submission: Pick<Submission, "answers" | "isEncrypted" | "insightPayload">,
  generatedAt: string,
): Submission["insightPayload"] {
  if (submission.insightPayload) {
    return submission.insightPayload;
  }
  if (form.encryptSubmissions || submission.isEncrypted) {
    return undefined;
  }

  const answers: Record<string, unknown> = {};
  const fieldIds: string[] = [];
  const redactedFieldIds: string[] = [];
  const processingMode = getSignalProcessingMode(form);

  form.fields.forEach((field) => {
    const hasAnswer = Object.prototype.hasOwnProperty.call(submission.answers, field.id);
    if (!hasAnswer) {
      return;
    }
    if (processingMode === "review_required" || !isAggregateInsightField(field)) {
      redactedFieldIds.push(field.id);
      return;
    }
    answers[field.id] = submission.answers[field.id];
    fieldIds.push(field.id);
  });

  if (fieldIds.length === 0 && redactedFieldIds.length === 0) {
    return undefined;
  }

  return {
    answers,
    fieldIds,
    redactedFieldIds,
    generatedAt,
  };
}

export function getInsightAnswers(submission: Submission) {
  return submission.insightPayload?.answers ?? submission.answers;
}
