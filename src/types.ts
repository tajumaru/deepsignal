export type FieldType =
  | "shortText"
  | "longText"
  | "markdown"
  | "date"
  | "dropdown"
  | "checkbox"
  | "matrix"
  | "country_select"
  | "confirmation"
  | "rating"
  | "emotionRating"
  | "url"
  | "walletAddress"
  | "screenshot"
  | "video"
  | "voice";

export type FormPurpose = "bug" | "feature" | "survey" | "custom";
export type AnalysisProfileId =
  | "customer_feedback"
  | "ai_agent_log"
  | "incident_report"
  | "governance_signal"
  | "general_signal";
export type AnalysisSignalType =
  | "feedback"
  | "product_voice"
  | "agent_log"
  | "operation"
  | "incident"
  | "internal_report"
  | "disaster"
  | "safety"
  | "governance"
  | "community"
  | "generic";
export type AnalystType =
  | "risk"
  | "operations"
  | "product"
  | "community"
  | "executive";
export type AnalysisType =
  | "summary"
  | "risk"
  | "trend"
  | "action"
  | "sentiment"
  | "urgency"
  | "anomaly"
  | "silence"
  | "velocity";
export type FormVisibility = "private" | "unlisted" | "public";
export type FormIdentityPolicy = "anonymous_allowed" | "wallet_required";
export type FormLocationRequirement = "optional" | "required";
export type FormHeaderImagePosition = "center" | "top" | "bottom";
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
export type ActivityActorRole = "owner" | "admin" | "unknown";
export type ActivityAction =
  | "form_created"
  | "form_published"
  | "form_updated"
  | "form_archived";

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
  rows?: string[];
  columns?: string[];
  selectionMode?: "single";
  conditionalParentId?: string;
  conditionalValue?: string;
  visibilityRules?: ConditionalLogicGroup;
  requiredRules?: ConditionalLogicGroup;
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
}

export interface FormHeaderImage {
  url: string;
  alt?: string;
  position?: FormHeaderImagePosition;
  source?: "url" | "upload";
  fileName?: string;
}

export interface FormHeaderLogo {
  url: string;
  alt?: string;
  source?: "url" | "upload";
  fileName?: string;
}

export interface FormSchema {
  id: string;
  title: string;
  description: string;
  headerImage?: FormHeaderImage;
  headerLogo?: FormHeaderLogo;
  fields: FormField[];
  sections?: FormSection[];
  purpose?: FormPurpose;
  analysisProfileId?: AnalysisProfileId;
  signalType?: AnalysisSignalType;
  analystType?: AnalystType;
  analysisType?: AnalysisType;
  visibility?: FormVisibility;
  identityPolicy?: FormIdentityPolicy;
  publicExplore?: boolean;
  locationRequirement?: FormLocationRequirement;
  createdAt: string;
  updatedAt?: string;
  ownerAddress?: string;
  creationMode?: "admin" | "guest";
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
  walrusActualCost?: WalrusActualCost;
  tatumStorage?: TatumStorageRecord;
  activityEvents?: ActivityEvent[];
}

export interface SubmissionLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  source: "browser_geolocation";
}

export interface WalrusActualCost {
  wal?: number;
  storageWal?: number;
  writeWal?: number;
  sui?: number;
  source: "publisher" | "sdk-storage-cost" | "sdk-storage-cost-and-register-gas";
}

export type WalrusNetwork = "testnet" | "mainnet";
export type TatumStorageStatus = "PENDING" | "UPLOADING" | "CERTIFIED" | "FAILED" | string;

export interface TatumStorageRecord {
  jobId?: string;
  blobId?: string;
  fileId?: string;
  status?: TatumStorageStatus;
  downloadUrl?: string;
}

export interface WalrusBlobProof {
  blobId: string;
  objectId?: string;
  size?: number;
  epoch?: number;
  network: WalrusNetwork;
}

export interface SignalManifest {
  version: number;
  formId: string;
  createdAt: string;
  updatedAt: string;
  formBlobId: string;
  headerImage?: FormHeaderImage;
  headerLogo?: FormHeaderLogo;
  submissions: Array<{
    submissionId: string;
    blobId: string;
    createdAt: string;
  }>;
}

export interface ActivityEvent {
  id: string;
  formId: string;
  formTitleSnapshot: string;
  actorAddress: string;
  actorRole: ActivityActorRole;
  action: ActivityAction;
  createdAt: string;
  txDigest?: string;
}

export interface SubmissionAttachment {
  fieldId: string;
  type: "image" | "video" | "audio" | "document";
  blobId: string;
  name: string;
  size: number;
  storage?: "blob" | "inline";
  // For blob attachments, this means the blob payload is encrypted. For inline
  // private attachments, it means the bytes are contained in the encrypted
  // submission envelope rather than encrypted as a standalone attachment.
  encrypted?: boolean;
  originalName?: string;
  originalType?: string;
  encoding?: "seal-base64-v1";
  inlineData?: string;
  walrusProof?: WalrusBlobProof;
  tatumStorage?: TatumStorageRecord;
}

export interface VoiceAnswerValue {
  kind: "voice";
  audioUrl?: string;
  audioBlobId?: string;
  duration: number;
  mimeType: string;
  transcript?: string;
  fileName?: string;
  size?: number;
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
  walrusProof?: WalrusBlobProof;
  tatumStorage?: TatumStorageRecord;
  error?: string;
}

export interface SubmissionPublicPayload {
  answers?: Record<string, unknown>;
  attachments?: SubmissionAttachment[];
  subjectPreview?: string;
  ratingValue?: number;
  location?: SubmissionLocation;
}

export interface RespondentMeta {
  walletAddress?: string;
  chain: "sui";
  sessionId?: string;
  submittedAt: string;
  isAnonymous: boolean;
  identityKind?: "anonymous" | "sui_wallet" | "zklogin";
  identityProvider?: "google";
  verifiedAddress?: string;
  zkLogin?: {
    iss: string;
    aud?: string;
    address: string;
    legacyAddress?: false;
    subHash?: string;
  };
}

export interface Submission {
  id: string;
  formId: string;
  projectId?: string;
  answers: Record<string, unknown>;
  attachments: SubmissionAttachment[];
  location?: SubmissionLocation;
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
  encryptedWalrusProof?: WalrusBlobProof;
  encryptedPayload?: string;
  receiptBlobId?: string;
  sealIdentity?: string;
  onchainSignalId?: number;
  signalReceiptMetadataDigest?: string;
  onchainStatus?: "new" | "triaged" | "archived";
  pendingOnchainRegistration?: boolean;
  answerBlobId?: string;
  remoteIndexBlobId?: string;
  remoteIndexTarget?: string;
  remoteIndexUpdated?: boolean;
  remoteIndexReadBack?: boolean;
  ownerReadable?: boolean;
  remoteSyncStatus?: "remote_synced" | "sync_pending" | "local_only";
  subjectPreview?: string;
  ratingValue?: number;
  createdAt: string;
  updatedAt: string;
  blobId?: string;
  walrusProof?: WalrusBlobProof;
  tatumStorage?: TatumStorageRecord;
}

export interface EncryptedSubmissionRecord extends Omit<
  Submission,
  "answers" | "attachments" | "location" | "publicPayload" | "metadata" | "encryptedPayload" | "aiSummary" | "keywords" | "embedding"
> {
  isEncrypted: true;
  answers: Record<string, never>;
  attachments: SubmissionAttachment[];
  location?: undefined;
  publicPayload?: {
    attachments?: SubmissionAttachment[];
    subjectPreview?: string;
    ratingValue?: number;
    location?: undefined;
  };
  metadata?: Record<string, never>;
  encryptedBlobId: string;
  encryptedPayload?: string;
  aiSummary?: undefined;
  keywords?: undefined;
  embedding?: undefined;
}

export interface StorageAdapter {
  saveForm(
    form: FormSchema,
  ): Promise<{ id: string; blobId?: string; manifestBlobId?: string; walrusActualCost?: WalrusActualCost; tatumStorage?: TatumStorageRecord }>;
  getForm(id: string): Promise<FormSchema | null>;
  listForms(): Promise<FormSchema[]>;
  deleteForm(id: string): Promise<void>;
  deleteForms(ids: string[]): Promise<void>;
  saveSubmission(
    submission: Submission,
  ): Promise<{
    id: string;
    blobId?: string;
    answerBlobId?: string;
    remoteIndexBlobId?: string;
    remoteIndexTarget?: string;
    remoteIndexUpdated?: boolean;
    remoteIndexReadBack?: boolean;
    ownerReadable?: boolean;
    remoteSyncStatus?: "remote_synced" | "sync_pending" | "local_only";
    walrusProof?: WalrusBlobProof;
    tatumStorage?: TatumStorageRecord;
  }>;
  saveEncryptedSubmission?(
    submission: Submission,
  ): Promise<{
    id: string;
    blobId?: string;
    encryptedBlobId?: string;
    answerBlobId?: string;
    remoteIndexBlobId?: string;
    remoteIndexTarget?: string;
    remoteIndexUpdated?: boolean;
    remoteIndexReadBack?: boolean;
    ownerReadable?: boolean;
    remoteSyncStatus?: "remote_synced" | "sync_pending" | "local_only";
    walrusProof?: WalrusBlobProof;
    tatumStorage?: TatumStorageRecord;
  }>;
  listSubmissions(formId: string): Promise<Submission[]>;
  updateSubmission(submission: Submission): Promise<void>;
  saveEncryptedPayload(payload: string): Promise<{ blobId: string; walrusProof?: WalrusBlobProof; tatumStorage?: TatumStorageRecord }>;
  readEncryptedPayload(blobId: string): Promise<string | null>;
  uploadFile(file: File): Promise<{ blobId: string; url?: string; walrusProof?: WalrusBlobProof; tatumStorage?: TatumStorageRecord }>;
  readFileBlob(blobId: string): Promise<Blob | null>;
  readFileText(blobId: string): Promise<string | null>;
}

export interface SealEncryptContext {
  projectId?: string;
  ownerAddress?: string;
}

export interface SealDecryptContext {
  walletAddress?: string;
  signPersonalMessage?: (message: Uint8Array) => Promise<string>;
  projectId?: string;
  ownerAddress?: string;
  suiClient?: unknown;
  reviewerCapId?: string;
  ownedCapabilityObjects?: Array<{
    type: string;
    objectId: string;
    registryId?: string;
  }>;
  onStatusChange?: (
    status:
      | "loading_seal_runtime"
      | "validating_access_policy"
      | "waiting_wallet_approval"
      | "decrypting_encrypted_payload"
      | "signal_unlocked",
  ) => void;
}

export interface SealAdapter {
  encrypt(value: string, context?: SealEncryptContext): Promise<string>;
  decrypt(value: string, context?: SealDecryptContext): Promise<string>;
}
