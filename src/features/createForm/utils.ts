import { sanitizeConditionalLogicFields } from "../../utils/formLogic";
import { hasChoiceOptions, isConfirmationCheckboxField, isMatrixFieldType, normalizeFieldType } from "../../lib/fieldTypes";
import {
  createDefaultNftGate,
  CUSTOM_NFT_PRESET_ID,
  getIdentityPolicyForAccessMode,
  normalizeFormAccessMode,
  normalizeFormNftGate,
} from "../../lib/formAccess";
import { makeId } from "../../lib/utils";
import { normalizeFormVisibility } from "../../lib/explore";
import { computeSchemaHash } from "../../lib/formVersioning";
import { normalizeFieldProcessingPolicy } from "../../lib/signalProcessing";
import type {
  AnalysisProfileId,
  AnalysisSignalType,
  AnalysisType,
  AnalystType,
  FieldType,
  FormField,
  FormAccessMode,
  FormHeaderImage,
  FormHeaderLogo,
  FormHeaderImagePosition,
  FormIdentityPolicy,
  FormLocationRequirement,
  FormNftGate,
  FormPurpose,
  FormSchema,
  FormSection,
  SignalProcessingMode,
  ResponseDeadlinePreset,
} from "./types";

export const CREATE_FORM_DRAFT_STORAGE_KEY = "deepsignal:create-form-draft:v1";
export const CREATE_FORM_GUEST_DRAFT_STORAGE_KEY = "deepsignal:create-form-guest-draft:v1";

export interface ParsedCreateFormDraft {
  selectedTemplateKey?: string;
  title?: string;
  description?: string;
  headerImage?: Partial<FormHeaderImage> & {
    source?: "url" | "upload";
    fileName?: string;
  };
  headerLogo?: Partial<FormHeaderLogo> & {
    source?: "none" | "url" | "upload";
    fileName?: string;
  };
  fields?: FormField[];
  sections?: FormSection[];
  purpose?: FormPurpose;
  analysisProfileId?: AnalysisProfileId;
  signalType?: AnalysisSignalType;
  analystType?: AnalystType;
  analysisType?: AnalysisType;
  visibility?: FormSchema["visibility"];
  identityPolicy?: FormIdentityPolicy;
  accessMode?: FormAccessMode;
  nftGate?: FormNftGate;
  locationRequirement?: FormLocationRequirement;
  processingMode?: SignalProcessingMode;
  encryptSubmissions?: boolean;
  responseOpenAtCustom?: string;
  responseDeadlinePreset?: ResponseDeadlinePreset;
  responseDeadlineCustomAt?: string;
  currentStep?: "template" | "info" | "fields" | "publish";
  selectedProjectId?: string;
  projectState?: string;
}

export type StoredCreateFormDraftParseResult =
  | { status: "valid"; draft: ParsedCreateFormDraft }
  | { status: "invalid"; reason: string };

export function parseStoredCreateFormDraft(rawDraft: string): StoredCreateFormDraftParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawDraft);
  } catch {
    return {
      status: "invalid",
      reason: "Draft JSON could not be parsed.",
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      status: "invalid",
      reason: "Draft payload is not an object.",
    };
  }

  const draft = parsed as ParsedCreateFormDraft;
  if (!Array.isArray(draft.fields) || draft.fields.length === 0) {
    return {
      status: "invalid",
      reason: "Draft payload does not contain any fields.",
    };
  }

  return {
    status: "valid",
    draft,
  };
}

export function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

interface CreateFieldLabels {
  confirmationLabel?: string;
  confirmationPlaceholder?: string;
  options?: string[];
}

const DEFAULT_MATRIX_ROWS = ["UI", "UX", "Performance"];
const DEFAULT_MATRIX_COLUMNS = ["Poor", "Okay", "Good"];

export function createField(type: FieldType = "shortText", sectionId?: string, labels: CreateFieldLabels = {}): FormField {
  const normalizedType = normalizeFieldType(type);
  const isConfirmation = isConfirmationCheckboxField(normalizedType);
  return {
    id: makeId("field"),
    type: normalizedType,
    label: isConfirmation ? labels.confirmationLabel ?? "Consent / confirmation" : "",
    required: false,
    sensitive: false,
    processingPolicy: "auto",
    visibility: "public",
    adminOnly: false,
    sectionId,
    placeholder: isConfirmation ? labels.confirmationPlaceholder ?? "I confirm this information is accurate" : "",
    helpText: "",
    options: hasChoiceOptions(normalizedType) ? labels.options ?? ["Option 1", "Option 2"] : undefined,
    rows: isMatrixFieldType(normalizedType) ? [...DEFAULT_MATRIX_ROWS] : undefined,
    columns: isMatrixFieldType(normalizedType) ? [...DEFAULT_MATRIX_COLUMNS] : undefined,
    selectionMode: isMatrixFieldType(normalizedType) ? "single" : undefined,
    conditionalParentId: undefined,
    conditionalValue: undefined,
  };
}

export function cloneField(field: FormField): FormField {
  return {
    ...field,
    id: makeId("field"),
    options: field.options ? [...field.options] : undefined,
    rows: field.rows ? [...field.rows] : undefined,
    columns: field.columns ? [...field.columns] : undefined,
    visibilityRules: field.visibilityRules
      ? {
          logic: field.visibilityRules.logic,
          conditions: field.visibilityRules.conditions.map((condition) => ({ ...condition })),
        }
      : undefined,
    requiredRules: field.requiredRules
      ? {
          logic: field.requiredRules.logic,
          conditions: field.requiredRules.conditions.map((condition) => ({ ...condition })),
        }
      : undefined,
  };
}

export function createSection(title = ""): FormSection {
  return {
    id: makeId("section"),
    title,
    description: "",
  };
}

export function serializeDraft(
  title: string,
  description: string,
  headerImage: {
    url: string;
    alt: string;
    position: FormHeaderImagePosition;
    source?: "url" | "upload";
    fileName?: string;
  },
  headerLogo: {
    url: string;
    alt: string;
    source?: "none" | "url" | "upload";
    fileName?: string;
  },
  fields: FormField[],
  purpose: FormPurpose,
  analysisProfileId: AnalysisProfileId | undefined,
  signalType: AnalysisSignalType | undefined,
  analystType: AnalystType | undefined,
  analysisType: AnalysisType | undefined,
  visibility: FormSchema["visibility"],
  identityPolicy: FormIdentityPolicy,
  accessMode: FormAccessMode,
  nftGate: FormNftGate,
  locationRequirement: FormLocationRequirement,
  processingMode: SignalProcessingMode,
  createOnSui: boolean,
  encryptSubmissions: boolean,
  sections: FormSection[],
  responseOpenAtCustom: string,
  responseDeadlinePreset: ResponseDeadlinePreset,
  responseDeadlineCustomAt: string,
) {
  return JSON.stringify({
    title,
    description,
    headerImage,
    headerLogo,
    purpose,
    analysisProfileId,
    signalType,
    analystType,
    analysisType,
    visibility: normalizeFormVisibility(visibility),
    identityPolicy,
    accessMode,
    nftGate,
    locationRequirement,
    processingMode,
    createOnSui,
    encryptSubmissions,
    responseOpenAtCustom,
    responseDeadlinePreset,
    responseDeadlineCustomAt,
    sections: sections.map((section) => ({
      title: section.title,
      description: section.description ?? "",
    })),
    fields: sanitizeConditionalLogicFields(fields).map((field) => ({
      type: normalizeFieldType(field.type),
      label: field.label,
      required: field.required,
      sensitive: field.sensitive,
      sectionId: field.sectionId ?? "",
      placeholder: field.placeholder ?? "",
      helpText: field.helpText ?? "",
      adminOnly: Boolean(field.adminOnly),
      visibility: field.visibility ?? "public",
      validationHint: field.validationHint ?? "",
      processingPolicy: normalizeFieldProcessingPolicy(field.processingPolicy),
      options: field.options ?? [],
      rows: field.rows ?? [],
      columns: field.columns ?? [],
      selectionMode: field.selectionMode,
      conditionalParentId: field.conditionalParentId ?? "",
      conditionalValue: field.conditionalValue ?? "",
      visibilityRules: field.visibilityRules,
      requiredRules: field.requiredRules,
    })),
  });
}

export function buildFormSchema(args: {
  title: string;
  description: string;
  headerImage: {
    url: string;
    alt: string;
    position: FormHeaderImagePosition;
    source?: "url" | "upload";
    fileName?: string;
  };
  headerLogo: {
    url: string;
    alt: string;
    source?: "none" | "url" | "upload";
    fileName?: string;
  };
  fields: FormField[];
  sections: FormSection[];
  purpose: FormPurpose;
  analysisProfileId?: AnalysisProfileId;
  signalType?: AnalysisSignalType;
  analystType?: AnalystType;
  analysisType?: AnalysisType;
  visibility: NonNullable<FormSchema["visibility"]>;
  identityPolicy: FormIdentityPolicy;
  accessMode: FormAccessMode;
  nftGate: FormNftGate;
  locationRequirement: FormLocationRequirement;
  processingMode: SignalProcessingMode;
  ownerAddress: string;
  creationMode: NonNullable<FormSchema["creationMode"]>;
  projectId?: string;
  projectName?: string;
  encryptSubmissions: boolean;
  responseOpenAt?: number | null;
  responseDeadline?: number | null;
  responseDeadlineMode?: "none" | "relative" | "custom";
}): FormSchema {
  const normalizedHeaderImage = normalizeHeaderImage(args.headerImage);
  const normalizedHeaderLogo = normalizeHeaderLogo(args.headerLogo);
  const normalizedAccessMode = normalizeFormAccessMode(args.accessMode, args.identityPolicy);
  const normalizedNftGate = normalizeFormNftGate(args.nftGate, normalizedAccessMode);
  const formWithoutHash = {
    id: makeId("form"),
    baseFormId: "",
    formVersion: 1,
    title: args.title.trim(),
    description: args.description.trim(),
    headerImage: normalizedHeaderImage,
    headerLogo: normalizedHeaderLogo,
    fields: sanitizeConditionalLogicFields(args.fields).map((field) => {
      const fieldType = normalizeFieldType(field.type);
      return {
        ...field,
        type: fieldType,
        label: field.label.trim(),
        placeholder: field.placeholder?.trim() || undefined,
        helpText: field.helpText?.trim() || undefined,
        validationHint: field.validationHint?.trim() || undefined,
        processingPolicy: normalizeFieldProcessingPolicy(field.processingPolicy),
        options: hasChoiceOptions(fieldType) ? (field.options ?? []).map((option) => option.trim()).filter(Boolean) : undefined,
        rows: isMatrixFieldType(fieldType)
          ? (field.rows ?? DEFAULT_MATRIX_ROWS).map((row) => row.trim()).filter(Boolean)
          : undefined,
        columns: isMatrixFieldType(fieldType)
          ? (field.columns ?? DEFAULT_MATRIX_COLUMNS).map((column) => column.trim()).filter(Boolean)
          : undefined,
        selectionMode: isMatrixFieldType(fieldType) ? "single" : undefined,
      };
    }),
    sections: args.sections
      .map((section) => ({
        ...section,
        title: section.title.trim(),
        description: section.description?.trim() || undefined,
      }))
      .filter((section) => section.title),
    purpose: args.purpose,
    analysisProfileId: args.analysisProfileId,
    signalType: args.signalType,
    analystType: args.analystType,
    analysisType: args.analysisType,
    visibility: args.visibility,
    identityPolicy: getIdentityPolicyForAccessMode(normalizedAccessMode),
    accessMode: normalizedAccessMode,
    nftGate: normalizedNftGate,
    locationRequirement: args.locationRequirement,
    processingMode: args.processingMode,
    publicExplore: args.visibility === "public",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ownerAddress: args.ownerAddress,
    creationMode: args.creationMode,
    isOnchain: false,
    projectId: args.projectId,
    projectName: args.projectName,
    encryptSubmissions: args.encryptSubmissions,
    responseOpenAt: args.responseOpenAt ?? null,
    responseDeadline: args.responseDeadline ?? null,
    responseDeadlineMode: args.responseDeadlineMode ?? "none",
    registrationMode: "walrus",
  } satisfies Omit<FormSchema, "schemaHash">;

  return {
    ...formWithoutHash,
    baseFormId: formWithoutHash.id,
    schemaHash: computeSchemaHash(formWithoutHash),
  };
}

export { createDefaultNftGate, CUSTOM_NFT_PRESET_ID };

export function normalizeHeaderImage(
  headerImage?: {
    url?: string;
    alt?: string;
    position?: FormHeaderImagePosition;
    source?: "url" | "upload";
    fileName?: string;
  },
): FormHeaderImage | undefined {
  const url = headerImage?.url?.trim();
  if (!url) {
    return undefined;
  }
  return {
    url,
    alt: headerImage?.alt?.trim() || undefined,
    position: headerImage?.position ?? "center",
    source: headerImage?.source ?? "url",
    fileName: headerImage?.fileName?.trim() || undefined,
  };
}

export function normalizeHeaderLogo(
  headerLogo?: {
    url?: string;
    alt?: string;
    source?: "none" | "url" | "upload";
    fileName?: string;
  },
): FormHeaderLogo | undefined {
  if (headerLogo?.source === "none") {
    return {
      url: "",
      source: "none",
    };
  }
  const url = headerLogo?.url?.trim();
  if (!url) {
    return undefined;
  }
  return {
    url,
    alt: headerLogo?.alt?.trim() || undefined,
    source: headerLogo?.source ?? "url",
    fileName: headerLogo?.fileName?.trim() || undefined,
  };
}
