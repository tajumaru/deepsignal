import type { Language } from "../i18n";
import type { FormSchema, SignalProcessingMode, Submission } from "../types";
import { formatAnswerText } from "./answerFormatting";
import { sanitizeCsvCell } from "./csv";
import { getSubmissionRespondentMeta } from "./respondentMeta";
import { getInsightAnswers } from "./signalProcessing";
import { getSubmissionVersion } from "./submissionVersioning";
import type { VersionedFormSchemas } from "./formVersionSchemas";
import { downloadTextFile } from "./utils";

const CSV_MIME_TYPE = "text/csv;charset=utf-8";
const CSV_BOM = "\uFEFF";
const EXPORT_AUDIT_LOG_KEY = "deepsignal.exportAuditLog.v1";
const MAX_AUDIT_LOG_ENTRIES = 100;

export { sanitizeCsvCell } from "./csv";

interface ResponseExportOverride {
  answers?: Record<string, unknown>;
  attachments?: Submission["attachments"];
}

export type ResponsesCsvSortOrder = "createdAtDesc" | "createdAtAsc";
export type ResponsesCsvExportScope = "filtered" | "all" | "selected";
export type ResponsesCsvProcessingScope = "review" | "aggregate";
export type ExportPiiField = "respondentAddress" | "walletAddress" | "notes" | "attachments" | "decryptedAnswers";

export interface ExportFilterSnapshot {
  searchQuery?: string;
  status?: string;
  priority?: string;
  tags?: string[];
  triageStatus?: string;
  processingMode?: "all" | SignalProcessingMode;
  dateRange?: {
    from?: string;
    to?: string;
  };
  formVersion?: "all" | number;
}

export interface ExportResponsesToCsvOptions {
  language?: Language;
  now?: Date;
  responseOverrides?: Record<string, ResponseExportOverride>;
  sortOrder?: ResponsesCsvSortOrder;
  scope?: ResponsesCsvExportScope;
  processingScope?: ResponsesCsvProcessingScope;
  excludedPiiFields?: ExportPiiField[];
  exportedBy?: string;
  filterSnapshot?: ExportFilterSnapshot;
  metadata?: ExportMetadata;
  versionedForms?: VersionedFormSchemas;
}

export interface ExportMetadata {
  title: "DeepSignal Export";
  exportedAt: string;
  formId: string;
  formTitle: string;
  responseCount: number;
  filterMode: ResponsesCsvExportScope;
  processingScope: ResponsesCsvProcessingScope;
  exportedBy: string;
  includedDecryptedData: boolean;
  includedAttachmentInfo: boolean;
  filterSnapshot: ExportFilterSnapshot;
  columns: string[];
}

export interface ExportAuditLogEntry {
  id: string;
  exportedAt: string;
  formId: string;
  responseCount: number;
  filterMode: ResponsesCsvExportScope;
  exportedBy: string;
  includedDecryptedData: boolean;
  filterSnapshot: ExportFilterSnapshot;
}

interface ResponseExportRowSource {
  submission: Submission;
  answers: Record<string, unknown>;
}

interface QuestionColumn {
  header: string;
  version: number;
  field: FormSchema["fields"][number];
}

function answerLooksEncrypted(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "encrypted" in value &&
    (value as { encrypted?: unknown }).encrypted === true
  );
}

function hasUnlockedAnswerOverride(overrides?: Record<string, ResponseExportOverride>) {
  return Object.values(overrides ?? {}).some((override) => Boolean(override.answers));
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function slugifyCsvFilenamePart(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "responses"
  );
}

export function getResponsesCsvFilename(formTitle: string, now = new Date()) {
  const year = now.getFullYear();
  const month = padDatePart(now.getMonth() + 1);
  const day = padDatePart(now.getDate());
  const hours = padDatePart(now.getHours());
  const minutes = padDatePart(now.getMinutes());
  return `deepsignal-${slugifyCsvFilenamePart(formTitle)}-${year}${month}${day}-${hours}${minutes}.csv`;
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

function getVersionsInResponses(form: FormSchema, responses: Submission[], versionedForms?: VersionedFormSchemas) {
  const versions = Array.from(new Set(responses.map((submission) => getSubmissionVersion(submission))));
  if (versions.length === 0) {
    versions.push(getSubmissionVersion({ formVersion: form.formVersion }));
  }
  return versions.sort((left, right) => left - right).map((version) => ({
    version,
    form: versionedForms?.[version] ?? form,
  }));
}

function buildQuestionColumns(
  form: FormSchema,
  responses: Submission[],
  options: ExportResponsesToCsvOptions = {},
): QuestionColumn[] {
  const versionForms = getVersionsInResponses(form, responses, options.versionedForms);
  const includeVersionPrefix = versionForms.length > 1;
  const columns = versionForms.flatMap(({ version, form: versionForm }) =>
    versionForm.fields.map((field) => ({
      header: includeVersionPrefix ? `v${version}: ${field.label || field.id}` : field.label || field.id,
      version,
      field,
    })),
  );
  const uniqueHeaders = makeUniqueHeaders(columns.map((column) => column.header));
  return columns.map((column, index) => ({ ...column, header: uniqueHeaders[index] }));
}

function getSubmissionTime(submission: Submission) {
  const time = new Date(submission.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortResponsesByCreatedAt(responses: Submission[], sortOrder: ResponsesCsvSortOrder) {
  const direction = sortOrder === "createdAtAsc" ? 1 : -1;
  return [...responses].sort((left, right) => {
    const timeDelta = (getSubmissionTime(left) - getSubmissionTime(right)) * direction;
    return timeDelta || left.id.localeCompare(right.id) * direction;
  });
}

function isExcluded(excludedFields: ExportPiiField[] | undefined, field: ExportPiiField) {
  return excludedFields?.includes(field) ?? false;
}

function getProcessingScope(form: FormSchema, options: ExportResponsesToCsvOptions): ResponsesCsvProcessingScope {
  return options.processingScope ?? (form.processingMode === "auto_process" ? "aggregate" : "review");
}

function isAggregateExport(form: FormSchema, options: ExportResponsesToCsvOptions) {
  return getProcessingScope(form, options) === "aggregate";
}

function isRespondentAddressExcluded(excludedFields: ExportPiiField[] | undefined) {
  return isExcluded(excludedFields, "respondentAddress") || isExcluded(excludedFields, "walletAddress");
}

function formatAttachmentsForCsv(attachments: Submission["attachments"]) {
  return attachments
    .map((attachment) => {
      const fileName = attachment.originalName ?? attachment.name;
      const mimeType = attachment.originalType ?? attachment.type;
      const size = Number.isFinite(attachment.size) ? `${attachment.size} bytes` : "";
      return [
        `fileName=${fileName}`,
        `blobId=${attachment.blobId}`,
        `mimeType=${mimeType}`,
        `size=${size}`,
      ].join("; ");
    })
    .join(" | ");
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
  if (value === undefined && rowSource.submission.isEncrypted) {
    return "[encrypted]";
  }
  return formatAnswerText(field, value, language);
}

export function buildColumns(
  form: FormSchema,
  responses: Submission[] = [],
  options: ExportResponsesToCsvOptions = {},
) {
  const questionHeaders = buildQuestionColumns(form, responses, options).map((column) => column.header);
  const aggregateExport = isAggregateExport(form, options);
  const columns = [
    "formTitle",
    "exportedAt",
    "responseCount",
    "responseId",
    "processingMode",
    "processingScope",
    "formVersion",
    "schemaHash",
    "formBlobId",
    "manifestBlobId",
    "submittedAt",
    "createdAt",
  ];

  if (!aggregateExport && !isRespondentAddressExcluded(options.excludedPiiFields)) {
    columns.push("respondentAddress");
  }

  columns.push("respondentIdentity", "identityProvider", "isAnonymous", "walrusBlobId", "storageBlobId");

  if (!aggregateExport && !isExcluded(options.excludedPiiFields, "attachments")) {
    columns.push("attachments");
  }

  if (!aggregateExport) {
    columns.push("tags", "priority", "triageStatus", "status");
  }

  if (!aggregateExport && !isExcluded(options.excludedPiiFields, "notes")) {
    columns.push("notes");
  }

  columns.push(...questionHeaders);
  return columns;
}

export function buildExportMetadata(
  form: FormSchema,
  responses: Submission[],
  options: ExportResponsesToCsvOptions = {},
): ExportMetadata {
  const exportedAt = (options.now ?? new Date()).toISOString();
  const excludedPiiFields = options.excludedPiiFields ?? [];
  const processingScope = getProcessingScope(form, options);
  return {
    title: "DeepSignal Export",
    exportedAt,
    formId: form.id,
    formTitle: form.title,
    responseCount: responses.length,
    filterMode: options.scope ?? "all",
    processingScope,
    exportedBy: options.exportedBy ?? "",
    includedDecryptedData:
      !excludedPiiFields.includes("decryptedAnswers") && hasUnlockedAnswerOverride(options.responseOverrides),
    includedAttachmentInfo: !excludedPiiFields.includes("attachments"),
    filterSnapshot: options.filterSnapshot ?? {},
    columns: buildColumns(form, responses, options),
  };
}

export function buildRows(
  form: FormSchema,
  responses: Submission[],
  metadata: ExportMetadata,
  options: ExportResponsesToCsvOptions = {},
) {
  const language = options.language ?? "en";
  const sortedResponses = sortResponsesByCreatedAt(responses, options.sortOrder ?? "createdAtDesc");
  const aggregateExport = isAggregateExport(form, options);
  const omitRespondentAddress = isRespondentAddressExcluded(options.excludedPiiFields);
  const omitAttachments = isExcluded(options.excludedPiiFields, "attachments");
  const omitNotes = isExcluded(options.excludedPiiFields, "notes");
  const omitDecryptedAnswers = isExcluded(options.excludedPiiFields, "decryptedAnswers");
  const questionColumns = buildQuestionColumns(form, responses, options);

  return sortedResponses.map((submission) => {
    const override = options.responseOverrides?.[submission.id];
    const answers = aggregateExport
      ? getInsightAnswers(submission)
      : omitDecryptedAnswers
        ? submission.answers ?? {}
        : override?.answers ?? submission.answers ?? {};
    const attachments = override?.attachments ?? submission.attachments ?? [];
    const respondentMeta = getSubmissionRespondentMeta(submission);
    const respondentAddress = respondentMeta.isAnonymous ? "" : respondentMeta.verifiedAddress ?? respondentMeta.walletAddress ?? "";
    const respondentIdentity =
      respondentMeta.identityKind === "zklogin"
        ? "zklogin"
        : respondentMeta.isAnonymous
          ? "anonymous"
          : "sui_wallet";
    const identityProvider = respondentMeta.identityKind === "zklogin" ? respondentMeta.identityProvider ?? "" : "";
    const storageBlobId = submission.blobId ?? submission.encryptedBlobId ?? submission.receiptBlobId ?? "";
    const walrusBlobId = submission.blobId ?? submission.encryptedBlobId ?? "";
    const row = [
      form.title,
      metadata.exportedAt,
      metadata.responseCount,
      submission.id,
      submission.processingMode ?? form.processingMode ?? "review_required",
      metadata.processingScope,
      getSubmissionVersion(submission),
      submission.schemaHash ?? "",
      submission.formBlobId ?? "",
      submission.manifestBlobId ?? "",
      respondentMeta.submittedAt,
      submission.createdAt,
    ];

    if (!aggregateExport && !omitRespondentAddress) {
      row.push(respondentAddress);
    }

    row.push(
      respondentIdentity,
      identityProvider,
      respondentMeta.isAnonymous ? "true" : "false",
      walrusBlobId,
      storageBlobId,
    );

    if (!aggregateExport && !omitAttachments) {
      row.push(formatAttachmentsForCsv(attachments));
    }

    if (!aggregateExport) {
      row.push(submission.tags.join("; "), submission.priority, submission.triageStatus, submission.status);
    }

    if (!aggregateExport && !omitNotes) {
      row.push(submission.notes);
    }

    const submissionVersion = getSubmissionVersion(submission);
    row.push(
      ...questionColumns.map((column) =>
        column.version === submissionVersion
          ? formatAnswerForCsv(column.field, { submission, answers }, language)
          : "",
      ),
    );
    return row;
  });
}

export function buildResponsesCsv(
  form: FormSchema,
  responses: Submission[],
  options: ExportResponsesToCsvOptions = {},
) {
  const metadata = options.metadata ?? buildExportMetadata(form, responses, options);
  const rows = buildRows(form, responses, metadata, options);
  return [metadata.columns, ...rows]
    .map((row) => row.map(sanitizeCsvCell).join(","))
    .join("\r\n");
}

export function buildCsvFile(form: FormSchema, responses: Submission[], options: ExportResponsesToCsvOptions = {}) {
  return `${CSV_BOM}${buildResponsesCsv(form, responses, options)}`;
}

export function downloadCsv(filename: string, contents: string) {
  downloadTextFile(filename, contents, CSV_MIME_TYPE);
}

function makeAuditId(metadata: ExportMetadata) {
  return `${metadata.formId}-${metadata.exportedAt}-${metadata.responseCount}`;
}

export function recordExportAuditLog(metadata: ExportMetadata) {
  if (typeof window === "undefined") {
    return null;
  }
  const entry: ExportAuditLogEntry = {
    id: makeAuditId(metadata),
    exportedAt: metadata.exportedAt,
    formId: metadata.formId,
    responseCount: metadata.responseCount,
    filterMode: metadata.filterMode,
    exportedBy: metadata.exportedBy,
    includedDecryptedData: metadata.includedDecryptedData,
    filterSnapshot: metadata.filterSnapshot,
  };

  try {
    const raw = window.localStorage.getItem(EXPORT_AUDIT_LOG_KEY);
    const current = raw ? (JSON.parse(raw) as ExportAuditLogEntry[]) : [];
    const next = [entry, ...(Array.isArray(current) ? current : [])].slice(0, MAX_AUDIT_LOG_ENTRIES);
    window.localStorage.setItem(EXPORT_AUDIT_LOG_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("Failed to persist export audit log", error);
  }
  // This is intentionally a local audit sink for the MVP. Future production
  // operators can mirror this entry to on-chain, Walrus, or server audit trails.
  return entry;
}

export function getExportAuditLog() {
  if (typeof window === "undefined") {
    return [] as ExportAuditLogEntry[];
  }
  try {
    const raw = window.localStorage.getItem(EXPORT_AUDIT_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ExportAuditLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function exportResponsesToCsv(
  form: FormSchema,
  responses: Submission[],
  options: ExportResponsesToCsvOptions = {},
) {
  const metadata = options.metadata ?? buildExportMetadata(form, responses, options);
  const csv = buildCsvFile(form, responses, { ...options, metadata });
  const filename = getResponsesCsvFilename(form.title || form.id, options.now);
  downloadCsv(filename, csv);
  const auditEntry = recordExportAuditLog(metadata);
  return { exported: true, filename, responseCount: responses.length, metadata, auditEntry };
}
