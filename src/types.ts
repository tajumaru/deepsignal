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
export type SubmissionCategory = "bug" | "feature" | "survey" | "general";
export type SubmissionPriority = "low" | "medium" | "high";
export type SignalSeverity = "low" | "medium" | "high";
export type SubmissionTriageStatus =
  | "new"
  | "investigating"
  | "planned"
  | "in_progress"
  | "fixed"
  | "closed";

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  sensitive: boolean;
  sectionId?: string;
  validationHint?: string;
  visibility?: "public" | "admin";
  adminOnly?: boolean;
  options?: string[];
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
  createdAt: string;
  ownerAddress?: string;
  isOnchain?: boolean;
  encryptSubmissions?: boolean;
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
  type: "image" | "video";
  blobId: string;
  name: string;
  size: number;
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
}

export interface SealEncryptContext {
  projectId?: string;
}

export interface SealDecryptContext {
  walletAddress?: string;
  signPersonalMessage?: (message: Uint8Array) => Promise<string>;
  projectId?: string;
  suiClient?: unknown;
}

export interface SealAdapter {
  encrypt(value: string, context?: SealEncryptContext): Promise<string>;
  decrypt(value: string, context?: SealDecryptContext): Promise<string>;
}
