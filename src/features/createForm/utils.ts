import { makeId } from "../../lib/utils";
import type { FieldType, FormField, FormPurpose, FormSchema, FormSection } from "./types";

export function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function createField(type: FieldType = "shortText", sectionId?: string): FormField {
  return {
    id: makeId("field"),
    type,
    label: "",
    required: false,
    sensitive: false,
    visibility: "public",
    adminOnly: false,
    sectionId,
    options: type === "dropdown" || type === "checkbox" ? ["Option 1", "Option 2"] : undefined,
  };
}

export function cloneField(field: FormField): FormField {
  return {
    ...field,
    id: makeId("field"),
    options: field.options ? [...field.options] : undefined,
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
  createOnSui: boolean,
  encryptSubmissions: boolean,
  sections: FormSection[],
) {
  return JSON.stringify({
    title,
    description,
    purpose,
    createOnSui,
    encryptSubmissions,
    sections: sections.map((section) => ({
      title: section.title,
      description: section.description ?? "",
    })),
    fields: fields.map((field) => ({
      type: field.type,
      label: field.label,
      required: field.required,
      sensitive: field.sensitive,
      sectionId: field.sectionId ?? "",
      adminOnly: Boolean(field.adminOnly),
      visibility: field.visibility ?? "public",
      validationHint: field.validationHint ?? "",
      options: field.options ?? [],
    })),
  });
}

export function buildFormSchema(args: {
  title: string;
  description: string;
  fields: FormField[];
  sections: FormSection[];
  purpose: FormPurpose;
  ownerAddress: string;
  projectId?: string;
  projectName?: string;
  encryptSubmissions: boolean;
}): FormSchema {
  return {
    id: makeId("form"),
    title: args.title.trim(),
    description: args.description.trim(),
    fields: args.fields.map((field) => ({
      ...field,
      label: field.label.trim(),
      validationHint: field.validationHint?.trim() || undefined,
      options:
        field.type === "dropdown" || field.type === "checkbox"
          ? (field.options ?? []).map((option) => option.trim()).filter(Boolean)
          : undefined,
    })),
    sections: args.sections
      .map((section) => ({
        ...section,
        title: section.title.trim(),
        description: section.description?.trim() || undefined,
      }))
      .filter((section) => section.title),
    purpose: args.purpose,
    createdAt: new Date().toISOString(),
    ownerAddress: args.ownerAddress,
    isOnchain: false,
    projectId: args.projectId,
    projectName: args.projectName,
    encryptSubmissions: args.encryptSubmissions,
    registrationMode: "walrus",
  };
}
