import type { FormSchema, Submission } from "../types";
import { formatAnswerText } from "./answerFormatting";
import { parseRealSealEnvelope } from "../crypto/sealPayload";
import { getSubmissionRespondentMeta } from "./respondentMeta";
import { downloadTextFile } from "./utils";

export type ExportEncryptionStatus = "seal_encrypted" | "legacy_unencrypted" | "public";

const PRIVATE_EXPORT_CONFIRMATION =
  "This export may include private or decrypted response data. Only export if you are authorized to handle this data.";

function answerLooksEncrypted(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "encrypted" in value &&
    (value as { encrypted?: unknown }).encrypted === true
  );
}

export function getSubmissionEncryptionStatus(submission: Submission): ExportEncryptionStatus {
  if (submission.isEncrypted) {
    if (submission.encryptedPayload && !parseRealSealEnvelope(submission.encryptedPayload)) {
      return "legacy_unencrypted";
    }
    return "seal_encrypted";
  }

  if (Object.values(submission.answers ?? {}).some(answerLooksEncrypted)) {
    return "seal_encrypted";
  }

  return "public";
}

function exportMayIncludePrivateData(submissions: Submission[]) {
  return submissions.some((submission) => {
    const hasAnswers = Object.keys(submission.answers ?? {}).length > 0;
    const hasAttachmentsMetadata = submission.attachments.length > 0;
    return (
      submission.isEncrypted ||
      getSubmissionEncryptionStatus(submission) === "legacy_unencrypted" ||
      Object.values(submission.answers ?? {}).some(answerLooksEncrypted) ||
      hasAnswers ||
      hasAttachmentsMetadata
    );
  });
}

function confirmPrivateExport(submissions: Submission[]) {
  if (!exportMayIncludePrivateData(submissions)) {
    return true;
  }
  if (typeof window === "undefined") {
    return true;
  }
  return window.confirm(PRIVATE_EXPORT_CONFIRMATION);
}

function getFormattedSubmissionAnswers(form: FormSchema, submission: Submission) {
  return Object.fromEntries(
    form.fields.map((field) => [
      field.id,
      {
        label: field.label,
        value: formatAnswerText(field, submission.answers[field.id], "en"),
      },
    ]),
  );
}

export function exportSubmissionJson(form: FormSchema, submission: Submission) {
  if (!confirmPrivateExport([submission])) {
    return;
  }
  const encryptionStatus = getSubmissionEncryptionStatus(submission);
  downloadTextFile(
    `deepsignal-${form.id}-${submission.id}.json`,
    JSON.stringify(
      {
        form,
        submission: {
          ...submission,
          formattedAnswers: getFormattedSubmissionAnswers(form, submission),
          metadata: {
            ...(submission.metadata ?? {}),
            encryptionStatus,
          },
        },
        metadata: {
          encryptionStatus,
          includesAttachmentsMetadata: submission.attachments.length > 0,
          privateDataWarning: PRIVATE_EXPORT_CONFIRMATION,
        },
      },
      null,
      2,
    ),
    "application/json",
  );
}

export function exportSubmissionsCsv(form: FormSchema, submissions: Submission[]) {
  if (!confirmPrivateExport(submissions)) {
    return;
  }
  const columns = [
    "submissionId",
    "encryptionStatus",
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
      getSubmissionEncryptionStatus(submission),
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
