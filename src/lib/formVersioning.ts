import { hasChoiceOptions, isMatrixFieldType, normalizeFieldType } from "./fieldTypes";
import { normalizeLogicGroup, sanitizeConditionalLogicFields } from "../utils/formLogic";
import type { FormField, FormSchema, FormSection } from "../types";

export const DEFAULT_FORM_VERSION = 1;
export const LEGACY_SCHEMA_HASH = "schema:legacy-v1";

export type FormEditClassification = "none" | "light" | "structural" | "mixed";

export interface FormEditDiff {
  classification: FormEditClassification;
  lightFields: string[];
  structuralFields: string[];
}

type FormVersioningInput = Partial<FormSchema> & {
  id: string;
  fields?: FormField[];
  sections?: FormSection[];
};

const LIGHT_EDIT_KEYS = [
  "title",
  "description",
  "headerImage",
  "headerLogo",
  "visibility",
  "publicExplore",
  "responseDeadline",
  "responseDeadlineMode",
] as const;

const STRUCTURAL_EDIT_KEYS = ["fields", "sections"] as const;

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, sortObjectKeys(entryValue)]),
  );
}

function stableStringify(value: unknown) {
  return JSON.stringify(sortObjectKeys(value));
}

function hashString(value: string) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

function normalizeTextList(value: string[] | undefined) {
  return (value ?? []).map((item) => String(item).trim()).filter(Boolean);
}

function getStructuralFieldShape(field: FormField) {
  const type = normalizeFieldType(field.type);
  return {
    id: field.id,
    type,
    label: field.label.trim(),
    required: Boolean(field.required),
    sensitive: Boolean(field.sensitive),
    sectionId: field.sectionId ?? "",
    validationHint: field.validationHint?.trim() ?? "",
    visibility: field.visibility ?? "public",
    adminOnly: Boolean(field.adminOnly),
    options: hasChoiceOptions(type) ? normalizeTextList(field.options) : [],
    rows: isMatrixFieldType(type) ? normalizeTextList(field.rows) : [],
    columns: isMatrixFieldType(type) ? normalizeTextList(field.columns) : [],
    selectionMode: isMatrixFieldType(type) ? field.selectionMode ?? "single" : undefined,
    conditionalParentId: field.conditionalParentId ?? "",
    conditionalValue: field.conditionalValue ?? "",
    visibilityRules: normalizeLogicGroup(field.visibilityRules),
    requiredRules: normalizeLogicGroup(field.requiredRules),
  };
}

function getStructuralSectionShape(section: FormSection) {
  return {
    id: section.id,
    title: section.title.trim(),
    description: section.description?.trim() ?? "",
  };
}

export function getFormStructuralShape(form: FormVersioningInput) {
  return {
    fields: sanitizeConditionalLogicFields(form.fields ?? []).map((field) => getStructuralFieldShape(field)),
    sections: (form.sections ?? []).map((section) => getStructuralSectionShape(section)),
  };
}

export function computeSchemaHash(form: FormVersioningInput) {
  return `schema:v1:${hashString(stableStringify(getFormStructuralShape(form)))}`;
}

function valuesEqual(left: unknown, right: unknown) {
  return stableStringify(left) === stableStringify(right);
}

export function classifyFormEdit(previousForm: FormVersioningInput, nextForm: FormVersioningInput): FormEditDiff {
  const lightFields = LIGHT_EDIT_KEYS.filter((key) => !valuesEqual(previousForm[key], nextForm[key]));
  const structuralFields = STRUCTURAL_EDIT_KEYS.filter((key) => {
    if (key === "fields") {
      return !valuesEqual(getFormStructuralShape(previousForm).fields, getFormStructuralShape(nextForm).fields);
    }
    return !valuesEqual(getFormStructuralShape(previousForm).sections, getFormStructuralShape(nextForm).sections);
  });

  const classification =
    structuralFields.length > 0 && lightFields.length > 0
      ? "mixed"
      : structuralFields.length > 0
        ? "structural"
        : lightFields.length > 0
          ? "light"
          : "none";

  return {
    classification,
    lightFields: [...lightFields],
    structuralFields: [...structuralFields],
  };
}

export function isStructuralFormEdit(previousForm: FormVersioningInput, nextForm: FormVersioningInput) {
  const diff = classifyFormEdit(previousForm, nextForm);
  return diff.classification === "structural" || diff.classification === "mixed";
}

export function resolveFormVersion(raw: unknown) {
  const record = raw && typeof raw === "object" ? raw as { formVersion?: unknown } : {};
  const version =
    typeof record.formVersion === "number"
      ? record.formVersion
      : typeof record.formVersion === "string"
        ? Number(record.formVersion)
        : DEFAULT_FORM_VERSION;
  return Number.isFinite(version) && version > 0 ? Math.floor(version) : DEFAULT_FORM_VERSION;
}
