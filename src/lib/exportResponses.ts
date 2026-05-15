import type { Language } from "../i18n";
import type { FormSchema, Submission } from "../types";
import { formatAnswerText } from "./answerFormatting";
import { getSubmissionRespondentMeta } from "./respondentMeta";
import { downloadTextFile } from "./utils";

const PRIVATE_EXPORT_CONFIRMATION =
  "This export may include private or decrypted response data. Only export if you are authorized to handle this data.";

interface ResponseExportOverride {
  answers?: Record<string, unknown>;
  attachments?: Submission["attachments"];
}

export interface ExportResponsesToCsvOptions {
  language?: Language;
  now?: Date;
  responseOverrides?: Record<string, ResponseExportOverride>;
}

interface ResponseExportRowSource {
  submission: Submission;
  answers: Record<string, unknown>;
  hasUnlockedAnswers: boolean;
}

function answerLooksEncrypted(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "encrypted" in value &&
    (value as { encrypted?: unknown }).encrypted === true
  );
}

function exportMayIncludePrivateData(submissions: Submission[], overrides?: Record<string, ResponseExportOverride>) {
  return submissions.some((submission) => {
    const override = overrides?.[submission.id];
    const answers = override?.answers ?? submission.answers ?? {};
    return (
      submission.isEncrypted ||
      Object.keys(answers).length > 0 ||
      (override?.attachments ?? submission.attachments ?? []).length > 0 ||
      Object.values(answers).some(answerLooksEncrypted)
    );
  });
}

function confirmPrivateExport(submissions: Submission[], overrides?: Record<string, ResponseExportOverride>) {
  if (!exportMayIncludePrivateData(submissions, overrides)) {
    return true;
  }
  if (typeof window === "undefined") {
    return true;
  }
  return window.confirm(PRIVATE_EXPORT_CONFIRMATION);
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function getResponsesCsvFilename(formId: string, now = new Date()) {
  const year = now.getFullYear();
  const month = padDatePart(now.getMonth() + 1);
  const day = padDatePart(now.getDate());
  const hours = padDatePart(now.getHours());
  const minutes = padDatePart(now.getMinutes());
  return `deepsignal-${formId}-responses-${year}${month}${day}-${hours}${minutes}.csv`;
}

function makeUniqueHeaders(headers: string[]) {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    const normalized = header.trim() || "Untitled question";
    const nextCount = (seen.get(normalized) ?? 0) + 1;
    seen.set(normalized, nextCount);
    return nextCount === 1 ? normalized : `${normalized} (${nextCount})`;
  });
}

function escapeCsvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function formatAnswerForCsv(
  field: FormSchema["fields"][number],
  rowSource: ResponseExportRowSource,
  language: Language,
) {
  const value = rowSource.answers[field.id];
  if (answerLooksEncrypted(value)) {
    return "[encrypted]";
  }
  if (value === undefined && rowSource.submission.isEncrypted && !rowSource.hasUnlockedAnswers) {
    return "[encrypted]";
  }
  return formatAnswerText(field, value, language);
}

export function buildResponsesCsv(
  form: FormSchema,
  responses: Submission[],
  options: ExportResponsesToCsvOptions = {},
) {
  const language = options.language ?? "en";
  const questionHeaders = makeUniqueHeaders(form.fields.map((field) => field.label || field.id));
  const columns = [
    "responseId",
    "submittedAt",
    "walletAddress",
    "respondentAddress",
    "isAnonymous",
    "walrusBlobId",
    "storageBlobId",
    ...questionHeaders,
  ];

  const rows = responses.map((submission) => {
    const override = options.responseOverrides?.[submission.id];
    const answers = override?.answers ?? submission.answers ?? {};
    const hasUnlockedAnswers = Boolean(override?.answers);
    const respondentMeta = getSubmissionRespondentMeta(submission);
    const respondentAddress = respondentMeta.isAnonymous ? "" : respondentMeta.walletAddress ?? "";
    const storageBlobId = submission.blobId ?? submission.encryptedBlobId ?? submission.receiptBlobId ?? "";
    const walrusBlobId = submission.blobId ?? submission.encryptedBlobId ?? "";

    return [
      submission.id,
      respondentMeta.submittedAt,
      respondentAddress,
      respondentAddress,
      respondentMeta.isAnonymous ? "true" : "false",
      walrusBlobId,
      storageBlobId,
      ...form.fields.map((field) =>
        formatAnswerForCsv(field, { submission, answers, hasUnlockedAnswers }, language),
      ),
    ];
  });

  return [columns, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
}

export function exportResponsesToCsv(
  form: FormSchema,
  responses: Submission[],
  options: ExportResponsesToCsvOptions = {},
) {
  if (!confirmPrivateExport(responses, options.responseOverrides)) {
    return;
  }
  const csv = `\uFEFF${buildResponsesCsv(form, responses, options)}`;
  downloadTextFile(getResponsesCsvFilename(form.id, options.now), csv, "text/csv;charset=utf-8");
}
