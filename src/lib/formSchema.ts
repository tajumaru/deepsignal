import { hasChoiceOptions, isAttachmentFieldType, isConfirmationCheckboxField, normalizeFieldType } from "./fieldTypes";
import { normalizeFormVisibility } from "./explore";
import { normalizeActivityEvent } from "./activityLog";
import { normalizeFormPurpose } from "./formTemplates";
import { normalizeLogicGroup, sanitizeConditionalLogicFields } from "../utils/formLogic";
import type { FormField, FormIdentityPolicy, FormSchema, FormSection } from "../types";

function normalizeFormIdentityPolicy(identityPolicy: unknown): FormIdentityPolicy {
  return identityPolicy === "wallet_required" ? "wallet_required" : "anonymous_allowed";
}

export function createEmptyAnswer(field: FormField) {
  const fieldType = normalizeFieldType(field.type);
  if (fieldType === "checkbox" || isAttachmentFieldType(fieldType)) {
    return [] as string[];
  }
  if (fieldType === "matrix") {
    return {} as Record<string, string>;
  }
  if (isConfirmationCheckboxField(fieldType)) {
    return false;
  }
  return "";
}

export function normalizeForm(raw: FormSchema | (Record<string, unknown> & { id: string })) {
  const rawFields = Array.isArray(raw.fields) ? (raw.fields as FormField[]) : [];
  const defaultMatrixRows = ["UI", "UX", "Performance"];
  const defaultMatrixColumns = ["Poor", "Okay", "Good"];
  const visibility = normalizeFormVisibility(raw.visibility, raw.publicExplore);

  return {
    ...raw,
    title: typeof raw.title === "string" ? raw.title : "",
    description: typeof raw.description === "string" ? raw.description : "",
    fields: sanitizeConditionalLogicFields(
      rawFields.map((field) => {
        const fieldType = normalizeFieldType(field.type);
        return {
          ...field,
          type: fieldType,
          options: hasChoiceOptions(fieldType)
            ? Array.isArray(field.options)
              ? field.options.map((option) => String(option))
              : []
            : undefined,
          rows:
            fieldType === "matrix"
              ? (Array.isArray(field.rows) ? field.rows : defaultMatrixRows).map((row) => String(row).trim()).filter(Boolean)
              : undefined,
          columns:
            fieldType === "matrix"
              ? (Array.isArray(field.columns) ? field.columns : defaultMatrixColumns).map((column) => String(column).trim()).filter(Boolean)
              : undefined,
          selectionMode: fieldType === "matrix" ? "single" : undefined,
          visibilityRules: normalizeLogicGroup(field.visibilityRules),
          requiredRules: normalizeLogicGroup(field.requiredRules),
        };
      }),
    ),
    sections: Array.isArray(raw.sections) ? (raw.sections as FormSection[]) : [],
    purpose: normalizeFormPurpose(raw.purpose),
    visibility,
    identityPolicy: normalizeFormIdentityPolicy(raw.identityPolicy),
    publicExplore: raw.publicExplore === true || visibility === "public",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    ownerAddress: typeof raw.ownerAddress === "string" ? raw.ownerAddress : undefined,
    creationMode: raw.creationMode === "guest" || raw.creationMode === "admin" ? raw.creationMode : undefined,
    projectId: typeof raw.projectId === "string" ? raw.projectId : undefined,
    projectName: typeof raw.projectName === "string" ? raw.projectName : undefined,
    responseDeadline:
      typeof raw.responseDeadline === "number"
        ? raw.responseDeadline
        : typeof raw.responseDeadline === "string"
          ? Number(raw.responseDeadline)
          : null,
    responseDeadlineMode:
      raw.responseDeadlineMode === "relative"
        ? "relative"
        : raw.responseDeadlineMode === "custom"
          ? "custom"
          : "none",
    onchainFormId:
      typeof raw.onchainFormId === "number"
        ? raw.onchainFormId
        : typeof raw.onchainFormId === "string"
          ? Number(raw.onchainFormId)
          : undefined,
    formMetadataDigest: typeof raw.formMetadataDigest === "string" ? raw.formMetadataDigest : undefined,
    registrationMode: raw.registrationMode === "sui" ? "sui" : "walrus",
    activityEvents: Array.isArray(raw.activityEvents)
      ? raw.activityEvents
          .map((event) => normalizeActivityEvent(event as Record<string, unknown>))
          .filter((event): event is NonNullable<ReturnType<typeof normalizeActivityEvent>> => Boolean(event))
      : undefined,
  } satisfies FormSchema;
}
