import type { MutableRefObject } from "react";
import { useI18n } from "../../i18n";
import { createFormOnChain } from "../../lib/projectRegistry";
import type { FieldType, FormField, FormPurpose, FormSchema, FormSection, FormVisibility } from "../../types";

export type { FieldType, FormField, FormPurpose, FormSchema, FormSection, FormVisibility };

export type PublishStageKey = "encoding" | "encrypting" | "sending" | "stored" | "registering" | "active";
export type BuilderStepKey = "template" | "info" | "fields" | "publish";
export type MobileBuilderPane = "editor" | "preview";

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
  fields: FormField[];
  sections: FormSection[];
  purpose: FormPurpose;
  visibility: FormVisibility;
  encryptSubmissions: boolean;
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

export interface FormBuilderRefs {
  labelRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  fieldCardRefs: MutableRefObject<Record<string, HTMLElement | null>>;
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
