import { hasChoiceOptions, isAttachmentFieldType, isConfirmationCheckboxField, normalizeFieldType } from "./fieldTypes";
import { normalizeFormVisibility } from "./explore";
import { normalizeActivityEvent } from "./activityLog";
import { computeSchemaHash, resolveFormVersion } from "./formVersioning";
import { normalizeFormPurpose } from "./formTemplates";
import { normalizeFieldProcessingPolicy } from "./signalProcessing";
import { normalizeLogicGroup, sanitizeConditionalLogicFields } from "../utils/formLogic";
import type {
  AnalysisProfileId,
  AnalysisSignalType,
  AnalystType,
  AnalysisType,
  FormField,
  FormIdentityPolicy,
  FormLocationRequirement,
  FormSchema,
  FormSection,
} from "../types";

function normalizeFormIdentityPolicy(identityPolicy: unknown): FormIdentityPolicy {
  return identityPolicy === "wallet_required" ? "wallet_required" : "anonymous_allowed";
}

function normalizeFormLocationRequirement(locationRequirement: unknown): FormLocationRequirement | undefined {
  return locationRequirement === "required" || locationRequirement === "optional" ? locationRequirement : undefined;
}

function normalizeAnalysisProfileId(analysisProfileId: unknown): AnalysisProfileId | undefined {
  return analysisProfileId === "customer_feedback" ||
    analysisProfileId === "ai_agent_log" ||
    analysisProfileId === "incident_report" ||
    analysisProfileId === "governance_signal" ||
    analysisProfileId === "general_signal"
    ? analysisProfileId
    : undefined;
}

function normalizeSignalType(signalType: unknown): AnalysisSignalType | undefined {
  return signalType === "feedback" ||
    signalType === "product_voice" ||
    signalType === "agent_log" ||
    signalType === "operation" ||
    signalType === "incident" ||
    signalType === "internal_report" ||
    signalType === "disaster" ||
    signalType === "safety" ||
    signalType === "governance" ||
    signalType === "community" ||
    signalType === "generic"
    ? signalType
    : undefined;
}

function normalizeAnalystType(analystType: unknown): AnalystType | undefined {
  return analystType === "risk" ||
    analystType === "operations" ||
    analystType === "product" ||
    analystType === "community" ||
    analystType === "executive"
    ? analystType
    : undefined;
}

function normalizeAnalysisType(analysisType: unknown): AnalysisType | undefined {
  return analysisType === "summary" ||
    analysisType === "risk" ||
    analysisType === "trend" ||
    analysisType === "action" ||
    analysisType === "sentiment" ||
    analysisType === "urgency" ||
    analysisType === "anomaly" ||
    analysisType === "silence" ||
    analysisType === "velocity"
    ? analysisType
    : undefined;
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

  const normalizedForm = {
    ...raw,
    baseFormId: typeof raw.baseFormId === "string" ? raw.baseFormId : raw.id,
    formVersion: resolveFormVersion(raw),
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
          processingPolicy: normalizeFieldProcessingPolicy(field.processingPolicy),
          visibilityRules: normalizeLogicGroup(field.visibilityRules),
          requiredRules: normalizeLogicGroup(field.requiredRules),
        };
      }),
    ),
    sections: Array.isArray(raw.sections) ? (raw.sections as FormSection[]) : [],
    purpose: normalizeFormPurpose(raw.purpose),
    analysisProfileId: normalizeAnalysisProfileId(raw.analysisProfileId),
    signalType: normalizeSignalType(raw.signalType),
    analystType: normalizeAnalystType(raw.analystType),
    analysisType: normalizeAnalysisType(raw.analysisType),
    visibility,
    identityPolicy: normalizeFormIdentityPolicy(raw.identityPolicy),
    locationRequirement: normalizeFormLocationRequirement(raw.locationRequirement),
    publicExplore: raw.publicExplore === true || visibility === "public",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    ownerAddress: typeof raw.ownerAddress === "string" ? raw.ownerAddress : undefined,
    creationMode: raw.creationMode === "guest" || raw.creationMode === "admin" ? raw.creationMode : undefined,
    projectId: typeof raw.projectId === "string" ? raw.projectId : undefined,
    projectName: typeof raw.projectName === "string" ? raw.projectName : undefined,
    responseOpenAt:
      typeof raw.responseOpenAt === "number"
        ? raw.responseOpenAt
        : typeof raw.responseOpenAt === "string"
          ? Number(raw.responseOpenAt)
          : null,
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
  } satisfies Omit<FormSchema, "schemaHash"> & { schemaHash?: string };

  return {
    ...normalizedForm,
    schemaHash:
      typeof raw.schemaHash === "string" && raw.schemaHash.trim()
        ? raw.schemaHash
        : computeSchemaHash(normalizedForm),
  } satisfies FormSchema;
}
