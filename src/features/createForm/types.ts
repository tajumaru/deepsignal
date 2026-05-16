import type { MutableRefObject } from "react";
import { useI18n } from "../../i18n";
import { createFormOnChain } from "../../lib/projectRegistry";
import type {
  FieldType,
  FormField,
  FormHeaderImage,
  FormHeaderLogo,
  FormHeaderImagePosition,
  FormIdentityPolicy,
  FormPurpose,
  FormSchema,
  FormSection,
  FormVisibility,
} from "../../types";

export type {
  FieldType,
  FormField,
  FormHeaderImage,
  FormHeaderLogo,
  FormHeaderImagePosition,
  FormIdentityPolicy,
  FormPurpose,
  FormSchema,
  FormSection,
  FormVisibility,
};

export type PublishStageKey = "encoding" | "encrypting" | "sending" | "stored" | "registering" | "active";
export type BuilderStepKey = "template" | "info" | "fields" | "publish";
export type MobileBuilderPane = "editor" | "preview";
export type ResponseDeadlinePreset = "none" | "1h" | "24h" | "7d" | "30d" | "custom";

export interface PublishPhase {
  key: PublishStageKey;
  label: string;
  detail: string;
}

export interface BuilderStep {
  key: BuilderStepKey;
  title: string;
  description: string;
}

export interface ProjectOption {
  objectId: string;
  name: string;
  formsCount: number;
}

export interface TranslateParams {
  [key: string]: string | number;
}

export type Translate = ReturnType<typeof useI18n>["t"];

export interface FormBuilderValues {
  selectedTemplateKey: string;
  title: string;
  description: string;
  headerImage: {
    url: string;
    alt: string;
    position: FormHeaderImagePosition;
    source: "url" | "upload";
    fileName: string;
  };
  headerLogo: {
    url: string;
    alt: string;
    source: "url" | "upload";
    fileName: string;
  };
  fields: FormField[];
  sections: FormSection[];
  purpose: FormPurpose;
  visibility: FormVisibility;
  identityPolicy: FormIdentityPolicy;
  encryptSubmissions: boolean;
  responseDeadlinePreset: ResponseDeadlinePreset;
  responseDeadlineCustomAt: string;
  currentStep: BuilderStepKey;
  mobilePane: MobileBuilderPane;
  fieldTypePickerOpen: boolean;
  activeFieldId: string;
  draggedFieldId: string | null;
  dragOverFieldId: string | null;
  dragOverPlacement: "before" | "after" | null;
  selectedProjectId: string;
  projectState: string;
}

export type DraftSaveState = "idle" | "saving" | "saved" | "restored";

export interface FieldsStepValidationResult {
  isValid: boolean;
  error: string;
  fieldId?: string;
  relatedFieldIds?: string[];
}

export interface FormBuilderRefs {
  labelRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  fieldCardRefs: MutableRefObject<Record<string, HTMLElement | null>>;
}

export interface IntentDraftBlock {
  type: FieldType;
  label: string;
  helpText?: string;
  placeholder?: string;
  required?: boolean;
  sectionTitle?: string;
  options?: string[];
}

export interface IntentDraft {
  title: string;
  description: string;
  sections: Array<{
    title: string;
    description?: string;
  }>;
  blocks: IntentDraftBlock[];
}

export interface PublishOverlayState {
  open: boolean;
  stageIndex: number;
  blobId: string;
  typedBlobId: string;
  linkCopied: boolean;
  blobCopied: boolean;
  storageMode: "walrus" | "local";
  resultNote: string;
  activeStageStatus: string;
  activeStageDetail: string;
}

export interface PreparedPublishForm extends FormSchema {
  blobId?: string;
  manifestBlobId?: string;
  formMetadataDigest?: string;
  onchainFormId?: number;
}

export type CreateFormTransaction = ReturnType<typeof createFormOnChain>;

export interface TransactionConfirmationEvent {
  type?: string;
  parsedJson?: unknown;
}

export interface TransactionConfirmation {
  events?: TransactionConfirmationEvent[] | null;
}
