export type FieldType =
  | "shortText"
  | "longText"
  | "dropdown"
  | "checkbox"
  | "rating"
  | "url"
  | "screenshot"
  | "video";

export type FormPurpose = "bug" | "feature" | "survey" | "custom";
export type FormVisibility = "private" | "unlisted" | "public";
export type FormIdentityPolicy = "anonymous_allowed" | "wallet_required";
export type SubmissionCategory = "bug" | "feature" | "survey" | "general";
export type SubmissionPriority = "low" | "medium" | "high";
export type SignalSeverity = "low" | "medium" | "high";
export type ConditionalLogicOperator =
  | "equals"
  | "notEquals"
  | "contains"
  | "greaterThan"
  | "lessThan"
  | "isEmpty"
  | "isNotEmpty";
export type ConditionalLogicMode = "all" | "any";
export type SubmissionTriageStatus =
  | "new"
  | "investigating"
  | "planned"
  | "in_progress"
  | "fixed"
  | "closed";

export interface ConditionalLogicCondition {
  fieldId: string;
  operator: ConditionalLogicOperator;
  value?: string;
}

export interface ConditionalLogicGroup {
  logic: ConditionalLogicMode;
  conditions: ConditionalLogicCondition[];
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  sensitive: boolean;
  sectionId?: string;
  placeholder?: string;
  helpText?: string;
  validationHint?: string;
  visibility?: "public" | "admin";
  adminOnly?: boolean;
  options?: string[];
  visibilityRules?: ConditionalLogicGroup;
  requiredRules?: ConditionalLogicGroup;
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
}

export interface FormSchema {
  id: string;
  title: string;
  description: string;
  fields: FormField[];
  sections?: FormSection[];
  purpose?: FormPurpose;
  visibility?: FormVisibility;
  identityPolicy?: FormIdentityPolicy;
  publicExplore?: boolean;
  createdAt: string;
  updatedAt?: string;
  ownerAddress?: string;
  isOnchain?: boolean;
  encryptSubmissions?: boolean;
  responseDeadline?: number | null;
  responseDeadlineMode?: "none" | "relative" | "custom";
  projectId?: string;
  projectName?: string;
  onchainFormId?: number;
  formMetadataDigest?: string;
  registrationMode?: "walrus" | "sui";
  blobId?: string;
  manifestBlobId?: string;
}

export interface SignalManifest {
  version: number;
  formId: string;
  createdAt: string;
  updatedAt: string;
  formBlobId: string;
  submissions: Array<{
    submissionId: string;
    blobId: string;
    createdAt: string;
  }>;
}

export interface SubmissionAttachment {
  fieldId: string;
  type: "image" | "video" | "document";
  blobId: string;
  name: string;
  size: number;
  storage?: "blob" | "inline";
  encrypted?: boolean;
  originalName?: string;
  originalType?: string;
  encoding?: "seal-base64-v1";
  inlineData?: string;
}

export interface UploadedAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  previewUrl?: string;
  status: "pending" | "uploading" | "uploaded" | "failed";
  progress: number;
  walrusBlobId?: string;
  error?: string;
}

export interface SubmissionPublicPayload {
  answers?: Record<string, unknown>;
  attachments?: SubmissionAttachment[];
}

export interface RespondentMeta {
  walletAddress?: string;
  chain: "sui";
  sessionId?: string;
  submittedAt: string;
  isAnonymous: boolean;
}

export interface Submission {
  id: string;
  formId: string;
  answers: Record<string, unknown>;
  attachments: SubmissionAttachment[];
  publicPayload?: SubmissionPublicPayload;
  respondentMeta?: RespondentMeta;
  metadata?: Record<string, unknown>;
  category?: SubmissionCategory;
  aiSummary?: string;
  severity?: SignalSeverity;
  emotion?: string;
  keywords?: string[];
  embedding?: number[];
  clusterId?: string;
  status: "unread" | "read" | "archived";
  priority: SubmissionPriority;
  triageStatus: SubmissionTriageStatus;
  tags: string[];
  notes: string;
  contributorId?: string;
  responderSignature?: string;
  responderSignedBytes?: string;
  responderSignedAt?: string;
  signalValue?: number;
  githubIssueUrl?: string;
  githubPrUrl?: string;
  isEncrypted: boolean;
  encryptedBlobId?: string;
  encryptedPayload?: string;
  receiptBlobId?: string;
  sealIdentity?: string;
  onchainSignalId?: number;
  signalReceiptMetadataDigest?: string;
  onchainStatus?: "new" | "triaged" | "archived";
  pendingOnchainRegistration?: boolean;
  subjectPreview?: string;
  ratingValue?: number;
  createdAt: string;
  updatedAt: string;
  blobId?: string;
}

export interface StorageAdapter {
  saveForm(form: FormSchema): Promise<{ id: string; blobId?: string; manifestBlobId?: string }>;
  getForm(id: string): Promise<FormSchema | null>;
  listForms(): Promise<FormSchema[]>;
  deleteForm(id: string): Promise<void>;
  deleteForms(ids: string[]): Promise<void>;
  saveSubmission(submission: Submission): Promise<{ id: string; blobId?: string }>;
  listSubmissions(formId: string): Promise<Submission[]>;
  updateSubmission(submission: Submission): Promise<void>;
  saveEncryptedPayload(payload: string): Promise<{ blobId: string }>;
  readEncryptedPayload(blobId: string): Promise<string | null>;
  uploadFile(file: File): Promise<{ blobId: string; url?: string }>;
  readFileBlob(blobId: string): Promise<Blob | null>;
  readFileText(blobId: string): Promise<string | null>;
}

export interface SealEncryptContext {
  projectId?: string;
}

export interface SealDecryptContext {
  walletAddress?: string;
  signPersonalMessage?: (message: Uint8Array) => Promise<string>;
  projectId?: string;
  suiClient?: unknown;
  onStatusChange?: (status: "waiting_wallet_approval" | "decrypting_private_signal" | "finishing") => void;
}

export interface SealAdapter {
  encrypt(value: string, context?: SealEncryptContext): Promise<string>;
  decrypt(value: string, context?: SealDecryptContext): Promise<string>;
}
