export type FieldType =
  | "shortText"
  | "longText"
  | "dropdown"
  | "checkbox"
  | "rating"
  | "url"
  | "screenshot"
  | "video";

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  sensitive: boolean;
  options?: string[];
}

export interface FormSchema {
  id: string;
  title: string;
  description: string;
  fields: FormField[];
  createdAt: string;
  ownerAddress?: string;
  isOnchain?: boolean;
  encryptSubmissions?: boolean;
  blobId?: string;
}

export interface SubmissionAttachment {
  fieldId: string;
  type: "image" | "video";
  blobId: string;
  name: string;
  size: number;
}

export interface Submission {
  id: string;
  formId: string;
  answers: Record<string, unknown>;
  attachments: SubmissionAttachment[];
  status: "unread" | "read" | "archived";
  priority: "low" | "medium" | "high";
  tags: string[];
  notes: string;
  isEncrypted: boolean;
  encryptedBlobId?: string;
  subjectPreview?: string;
  ratingValue?: number;
  createdAt: string;
  blobId?: string;
}

export interface StorageAdapter {
  saveForm(form: FormSchema): Promise<{ id: string; blobId?: string }>;
  getForm(id: string): Promise<FormSchema | null>;
  listForms(): Promise<FormSchema[]>;
  deleteForm(id: string): Promise<void>;
  saveSubmission(submission: Submission): Promise<{ id: string; blobId?: string }>;
  listSubmissions(formId: string): Promise<Submission[]>;
  updateSubmission(submission: Submission): Promise<void>;
  saveEncryptedPayload(payload: string): Promise<{ blobId: string }>;
  readEncryptedPayload(blobId: string): Promise<string | null>;
  uploadFile(file: File): Promise<{ blobId: string; url?: string }>;
}

export interface SealAdapter {
  encrypt(value: string): Promise<string>;
  decrypt(value: string): Promise<string>;
}
