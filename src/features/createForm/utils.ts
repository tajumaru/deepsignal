import { sanitizeConditionalLogicFields } from "../../utils/formLogic";
import { hasChoiceOptions, isConfirmationCheckboxField } from "../../lib/fieldTypes";
import { makeId } from "../../lib/utils";
import { normalizeFormVisibility } from "../../lib/explore";
import type {
  FieldType,
  FormField,
  FormIdentityPolicy,
  FormPurpose,
  FormSchema,
  FormSection,
  ResponseDeadlinePreset,
} from "./types";

export const CREATE_FORM_DRAFT_STORAGE_KEY = "deepsignal:create-form-draft:v1";

export function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function createField(type: FieldType = "shortText", sectionId?: string): FormField {
  const isConfirmation = isConfirmationCheckboxField(type);
  return {
    id: makeId("field"),
    type: isConfirmation ? "confirmation" : type,
    label: isConfirmation ? "Consent / confirmation" : "",
    required: false,
    sensitive: false,
    visibility: "public",
    adminOnly: false,
    sectionId,
    placeholder: isConfirmation ? "I confirm this information is accurate" : "",
    helpText: "",
    options: hasChoiceOptions(type) ? ["Option 1", "Option 2"] : undefined,
    conditionalParentId: undefined,
    conditionalValue: undefined,
  };
}

export function cloneField(field: FormField): FormField {
  return {
    ...field,
    id: makeId("field"),
    options: field.options ? [...field.options] : undefined,
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
      type: field.type,
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
  fields: FormField[];
  sections: FormSection[];
  purpose: FormPurpose;
  visibility: NonNullable<FormSchema["visibility"]>;
  identityPolicy: FormIdentityPolicy;
  ownerAddress: string;
  projectId?: string;
  projectName?: string;
  encryptSubmissions: boolean;
  responseDeadline?: number | null;
  responseDeadlineMode?: "none" | "relative" | "custom";
}): FormSchema {
  return {
    id: makeId("form"),
    title: args.title.trim(),
    description: args.description.trim(),
    fields: sanitizeConditionalLogicFields(args.fields).map((field) => ({
      ...field,
      label: field.label.trim(),
      placeholder: field.placeholder?.trim() || undefined,
      helpText: field.helpText?.trim() || undefined,
      validationHint: field.validationHint?.trim() || undefined,
      options: hasChoiceOptions(field.type) ? (field.options ?? []).map((option) => option.trim()).filter(Boolean) : undefined,
    })),
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
    isOnchain: false,
    projectId: args.projectId,
    projectName: args.projectName,
    encryptSubmissions: args.encryptSubmissions,
    responseDeadline: args.responseDeadline ?? null,
    responseDeadlineMode: args.responseDeadlineMode ?? "none",
    registrationMode: "walrus",
  };
}
