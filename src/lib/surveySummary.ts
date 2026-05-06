import { flattenAnswer } from "./utils";
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

  for (const field of form.fields) {
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
  };
}
