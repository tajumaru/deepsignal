import { makeId } from "./utils";
import type { FieldType, FormField, FormPurpose, SubmissionCategory } from "../types";

export interface FormTemplateDefinition {
  id: FormPurpose;
  label: string;
  title: string;
  description: string;
  fields: Array<{
    type: FieldType;
    label: string;
    required?: boolean;
    sensitive?: boolean;
    options?: string[];
  }>;
}

export const formTemplates: FormTemplateDefinition[] = [
  {
    id: "bug",
    label: "Capture a Bug Signal",
    title: "Bug Report",
    description: "Collect reproducible bug reports with environment details and evidence.",
    fields: [
      { type: "shortText", label: "Title / Summary", required: true },
      { type: "longText", label: "What happened?", required: true },
      { type: "longText", label: "Steps to reproduce", required: true },
      { type: "longText", label: "Expected behavior", required: true },
      { type: "longText", label: "Actual behavior", required: true },
      {
        type: "dropdown",
        label: "Severity",
        required: true,
        options: ["Low", "Medium", "High", "Critical"],
      },
      { type: "shortText", label: "Environment / Device / Browser" },
      { type: "screenshot", label: "Screenshot" },
      { type: "video", label: "Video" },
      { type: "url", label: "Related URL" },
    ],
  },
  {
    id: "feature",
    label: "Request a New Signal",
    title: "Feature Request",
    description: "Capture product ideas, the problem behind them, and the desired outcome.",
    fields: [
      { type: "shortText", label: "Feature title", required: true },
      { type: "longText", label: "Problem to solve", required: true },
      { type: "longText", label: "Proposed solution", required: true },
      { type: "longText", label: "Use case", required: true },
      {
        type: "dropdown",
        label: "Priority",
        required: true,
        options: ["Nice to have", "Important", "Critical"],
      },
      { type: "url", label: "Related URL" },
    ],
  },
  {
    id: "survey",
    label: "Run a Survey Pulse",
    title: "Survey",
    description: "Measure satisfaction, capture what worked, and learn what needs attention.",
    fields: [
      { type: "rating", label: "Overall rating", required: true },
      { type: "longText", label: "What did you like?" },
      { type: "longText", label: "What was confusing?" },
      {
        type: "checkbox",
        label: "Which features did you use?",
        options: ["Search", "Dashboard", "Forms", "Notifications"],
      },
      {
        type: "dropdown",
        label: "Would you recommend this?",
        options: ["Yes", "No"],
        required: true,
      },
      { type: "longText", label: "Additional comments" },
    ],
  },
  {
    id: "custom",
    label: "Custom Signal Form",
    title: "",
    description: "",
    fields: [{ type: "shortText", label: "", options: undefined }],
  },
];

export function createTemplateFields(template: FormTemplateDefinition): FormField[] {
  return template.fields.map((field) => ({
    id: makeId("field"),
    type: field.type,
    label: field.label,
    required: Boolean(field.required),
    sensitive: Boolean(field.sensitive),
    options:
      field.type === "dropdown" || field.type === "checkbox" ? [...(field.options ?? [""])] : undefined,
  }));
}

export function getTemplateDefinition(purpose: FormPurpose) {
  return formTemplates.find((template) => template.id === purpose) ?? formTemplates[3];
}

export function normalizeFormPurpose(purpose: unknown): FormPurpose {
  return purpose === "bug" || purpose === "feature" || purpose === "survey" || purpose === "custom"
    ? purpose
    : "custom";
}

export function getSubmissionCategoryFromPurpose(purpose?: FormPurpose): SubmissionCategory {
  switch (purpose) {
    case "bug":
    case "feature":
    case "survey":
      return purpose;
    default:
      return "general";
  }
}

export function inferPriorityFromTemplateAnswers(
  purpose: FormPurpose,
  fields: FormField[],
  answers: Record<string, unknown>,
): "low" | "medium" | "high" {
  if (purpose === "bug") {
    const severityField = fields.find((field) => field.label === "Severity");
    const severity = String(answers[severityField?.id ?? ""] ?? "").toLowerCase();
    if (severity === "critical" || severity === "high") {
      return "high";
    }
    if (severity === "medium") {
      return "medium";
    }
    if (severity === "low") {
      return "low";
    }
  }

  if (purpose === "feature") {
    const priorityField = fields.find((field) => field.label === "Priority");
    const priority = String(answers[priorityField?.id ?? ""] ?? "").toLowerCase();
    if (priority === "critical") {
      return "high";
    }
    if (priority === "important") {
      return "medium";
    }
    if (priority === "nice to have") {
      return "low";
    }
  }

  return "medium";
}
