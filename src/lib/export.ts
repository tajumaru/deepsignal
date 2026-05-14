import type { FormSchema, Submission } from "../types";
import { formatAnswerText } from "./answerFormatting";
import { getSubmissionRespondentMeta } from "./respondentMeta";
import { downloadTextFile } from "./utils";

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
    "triageStatus",
    "priority",
    "signalValue",
    "contributorId",
    "walletAddress",
    "isAnonymous",
    "chain",
    "tags",
    "notes",
    "githubIssueUrl",
    "githubPrUrl",
    ...form.fields.map((field) => field.label),
  ];

  const rows = submissions.map((submission) => {
    const respondentMeta = getSubmissionRespondentMeta(submission);
    const base = [
      submission.id,
      submission.createdAt,
      submission.status,
      submission.triageStatus,
      submission.priority,
      submission.signalValue ?? "",
      submission.contributorId ?? "",
      respondentMeta.walletAddress ?? "",
      respondentMeta.isAnonymous ? "yes" : "no",
      respondentMeta.chain,
      submission.tags.join("|"),
      submission.notes,
      submission.githubIssueUrl ?? "",
      submission.githubPrUrl ?? "",
    ];
    const answers = form.fields.map((field) => formatAnswerText(field, submission.answers[field.id], "en"));
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
