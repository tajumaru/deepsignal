import type { FormSchema, Submission } from "../types";
import { downloadTextFile, flattenAnswer } from "./utils";

export function exportSubmissionJson(form: FormSchema, submission: Submission) {
  downloadTextFile(
    `deepsignal-${form.id}-${submission.id}.json`,
    JSON.stringify({ form, submission }, null, 2),
    "application/json",
  );
}

export function exportSubmissionsCsv(form: FormSchema, submissions: Submission[]) {
  const columns = [
    "submissionId",
    "createdAt",
    "status",
    "priority",
    ...form.fields.map((field) => field.label),
  ];

  const rows = submissions.map((submission) => {
    const base = [
      submission.id,
      submission.createdAt,
      submission.status,
      submission.priority,
    ];
    const answers = form.fields.map((field) => flattenAnswer(submission.answers[field.id]));
    return [...base, ...answers];
  });

  const csv = [columns, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");

  downloadTextFile(`deepsignal-${form.id}-submissions.csv`, csv, "text/csv;charset=utf-8");
}

export function exportSummaryJson(form: FormSchema, summary: unknown) {
  downloadTextFile(
    `deepsignal-${form.id}-survey-summary.json`,
    JSON.stringify(summary, null, 2),
    "application/json",
  );
}
