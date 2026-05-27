import { flattenAnswer } from "./utils";
import { EMOTION_SCALE_OPTIONS, type EmotionScaleValue } from "./emotionScale";
import { getSubmissionVersion } from "./submissionVersioning";
import type { VersionedFormSchemas } from "./formVersionSchemas";
import type { FormField, FormSchema, Submission } from "../types";

function countAnswer(map: Record<string, number>, value: string) {
  if (!value) {
    return;
  }
  map[value] = (map[value] ?? 0) + 1;
}

function isYesNoField(field: FormField) {
  const options = (field.options ?? []).map((option) => option.trim().toLowerCase());
  return options.length === 2 && options.includes("yes") && options.includes("no");
}

interface EmotionSummaryItem {
  value: EmotionScaleValue;
  emoji: string;
  labelKey: (typeof EMOTION_SCALE_OPTIONS)[number]["labelKey"];
  count: number;
  percent: number;
}

interface EmotionSummaryField {
  fieldId: string;
  fieldLabel: string;
  responses: number;
  dominantValue: EmotionScaleValue | null;
  items: EmotionSummaryItem[];
}

export function buildSurveySummary(form: FormSchema, submissions: Submission[]) {
  const availableSubmissions = submissions.filter(
    (submission) => submission.category === "survey" && !submission.isEncrypted,
  );
  const encryptedPending = submissions.filter(
    (submission) => submission.category === "survey" && submission.isEncrypted,
  ).length;

  const ratingField = form.fields.find((field) => field.type === "rating");
  const ratingValues = availableSubmissions
    .map((submission) => {
      const raw =
        ratingField && submission.answers
          ? Number(submission.answers[ratingField.id] ?? submission.ratingValue ?? 0)
          : Number(submission.ratingValue ?? 0);
      return Number.isFinite(raw) && raw > 0 ? raw : null;
    })
    .filter((value): value is number => value !== null);

  const choiceCounts: Record<string, Record<string, number>> = {};
  const yesNoDistributions: Record<string, Record<string, number>> = {};
  const emotionDistributions: EmotionSummaryField[] = [];

  for (const field of form.fields) {
    if (field.type === "emotionRating") {
      const counts = new Map<EmotionScaleValue, number>();
      for (const option of EMOTION_SCALE_OPTIONS) {
        counts.set(option.value, 0);
      }

      for (const submission of availableSubmissions) {
        const rawValue = submission.answers[field.id];
        const numericValue = typeof rawValue === "number" ? rawValue : typeof rawValue === "string" ? Number(rawValue) : NaN;
        const option = EMOTION_SCALE_OPTIONS.find((candidate) => candidate.value === numericValue);
        if (option) {
          counts.set(option.value, (counts.get(option.value) ?? 0) + 1);
        }
      }

      const responses = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
      if (responses > 0) {
        const items = EMOTION_SCALE_OPTIONS.map((option) => {
          const count = counts.get(option.value) ?? 0;
          return {
            value: option.value,
            emoji: option.emoji,
            labelKey: option.labelKey,
            count,
            percent: Math.round((count / responses) * 100),
          };
        });
        const dominantItem = [...items].sort((left, right) => right.count - left.count || right.value - left.value)[0];
        emotionDistributions.push({
          fieldId: field.id,
          fieldLabel: field.label,
          responses,
          dominantValue: dominantItem?.count ? dominantItem.value : null,
          items,
        });
      }
      continue;
    }

    if (field.type !== "dropdown" && field.type !== "checkbox") {
      continue;
    }

    const answerCounts: Record<string, number> = {};
    for (const submission of availableSubmissions) {
      const value = submission.answers[field.id];
      if (Array.isArray(value)) {
        value.forEach((item) => countAnswer(answerCounts, flattenAnswer(item)));
      } else {
        countAnswer(answerCounts, flattenAnswer(value));
      }
    }

    if (Object.keys(answerCounts).length === 0) {
      continue;
    }

    if (isYesNoField(field)) {
      yesNoDistributions[field.label] = answerCounts;
    } else {
      choiceCounts[field.label] = answerCounts;
    }
  }

  return {
    submissionCount: availableSubmissions.length,
    encryptedPendingCount: encryptedPending,
    averageRating:
      ratingValues.length === 0
        ? null
        : Number((ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length).toFixed(2)),
    choiceCounts,
    yesNoDistributions,
    emotionDistributions,
  };
}

export function buildVersionedSurveySummary(
  form: FormSchema,
  submissions: Submission[],
  versionedForms: VersionedFormSchemas = {},
) {
  const versions = Array.from(new Set(submissions.map((submission) => getSubmissionVersion(submission)))).sort(
    (left, right) => left - right,
  );
  if (versions.length <= 1) {
    return buildSurveySummary(versionedForms[versions[0]] ?? form, submissions);
  }

  const summaries = versions.map((version) => {
    const versionSubmissions = submissions.filter((submission) => getSubmissionVersion(submission) === version);
    return {
      version,
      summary: buildSurveySummary(versionedForms[version] ?? form, versionSubmissions),
    };
  });
  const submissionCount = summaries.reduce((sum, entry) => sum + entry.summary.submissionCount, 0);
  const encryptedPendingCount = summaries.reduce((sum, entry) => sum + entry.summary.encryptedPendingCount, 0);
  const ratingTotal = summaries.reduce(
    (sum, entry) => sum + (entry.summary.averageRating ?? 0) * entry.summary.submissionCount,
    0,
  );
  const ratingCount = summaries.reduce(
    (sum, entry) => sum + (entry.summary.averageRating == null ? 0 : entry.summary.submissionCount),
    0,
  );

  return {
    submissionCount,
    encryptedPendingCount,
    averageRating: ratingCount === 0 ? null : Number((ratingTotal / ratingCount).toFixed(2)),
    choiceCounts: Object.fromEntries(
      summaries.flatMap((entry) =>
        Object.entries(entry.summary.choiceCounts).map(([label, counts]) => [`v${entry.version}: ${label}`, counts]),
      ),
    ),
    yesNoDistributions: Object.fromEntries(
      summaries.flatMap((entry) =>
        Object.entries(entry.summary.yesNoDistributions).map(([label, counts]) => [`v${entry.version}: ${label}`, counts]),
      ),
    ),
    emotionDistributions: summaries.flatMap((entry) =>
      entry.summary.emotionDistributions.map((distribution) => ({
        ...distribution,
        fieldLabel: `v${entry.version}: ${distribution.fieldLabel}`,
      })),
    ),
  };
}
