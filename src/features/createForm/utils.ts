import { sanitizeConditionalLogicFields } from "../../utils/formLogic";
import { hasChoiceOptions, isConfirmationCheckboxField, isMatrixFieldType, normalizeFieldType } from "../../lib/fieldTypes";
import { makeId } from "../../lib/utils";
import { normalizeFormVisibility } from "../../lib/explore";
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
  ResponseDeadlinePreset,
} from "./types";

export const CREATE_FORM_DRAFT_STORAGE_KEY = "deepsignal:create-form-draft:v1";
export const CREATE_FORM_GUEST_DRAFT_STORAGE_KEY = "deepsignal:create-form-guest-draft:v1";

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
    source?: "url" | "upload";
    fileName?: string;
  },
  fields: FormField[],
  purpose: FormPurpose,
  visibility: FormSchema["visibility"],
  identityPolicy: FormIdentityPolicy,
  createOnSui: boolean,
  encryptSubmissions: boolean,
  sections: FormSection[],
  responseDeadlinePreset: ResponseDeadlinePreset,
  responseDeadlineCustomAt: string,
) {
  return JSON.stringify({
    title,
    description,
    headerImage,
    headerLogo,
    purpose,
    visibility: normalizeFormVisibility(visibility),
    identityPolicy,
    createOnSui,
    encryptSubmissions,
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
    source?: "url" | "upload";
    fileName?: string;
  };
  fields: FormField[];
  sections: FormSection[];
  purpose: FormPurpose;
  visibility: NonNullable<FormSchema["visibility"]>;
  identityPolicy: FormIdentityPolicy;
  ownerAddress: string;
  creationMode: NonNullable<FormSchema["creationMode"]>;
  projectId?: string;
  projectName?: string;
  encryptSubmissions: boolean;
  responseDeadline?: number | null;
  responseDeadlineMode?: "none" | "relative" | "custom";
}): FormSchema {
  const normalizedHeaderImage = normalizeHeaderImage(args.headerImage);
  const normalizedHeaderLogo = normalizeHeaderLogo(args.headerLogo);
  return {
    id: makeId("form"),
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
    visibility: args.visibility,
    identityPolicy: args.identityPolicy,
    publicExplore: args.visibility === "public",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ownerAddress: args.ownerAddress,
    creationMode: args.creationMode,
    isOnchain: false,
    projectId: args.projectId,
    projectName: args.projectName,
    encryptSubmissions: args.encryptSubmissions,
    responseDeadline: args.responseDeadline ?? null,
    responseDeadlineMode: args.responseDeadlineMode ?? "none",
    registrationMode: "walrus",
  };
}

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
    source?: "url" | "upload";
    fileName?: string;
  },
): FormHeaderLogo | undefined {
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
