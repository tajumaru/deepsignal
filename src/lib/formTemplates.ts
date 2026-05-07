import { makeId } from "./utils";
import type { FieldType, FormField, FormPurpose, SubmissionCategory } from "../types";

export interface FormTemplateDefinition {
  key: string;
  purpose: FormPurpose;
  emoji: string;
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

export const defaultComposerTemplateKey = "feedback";

export const formTemplates: FormTemplateDefinition[] = [
  {
    key: "bug",
    purpose: "bug",
    emoji: "\uD83D\uDC1E",
    label: "Bug Report",
    title: "Bug Report",
    description: "Share the issue, how to reproduce it, and any proof that helps us fix it fast.",
    fields: [
      { type: "shortText", label: "Bug title", required: true },
      { type: "longText", label: "What happened?", required: true },
      { type: "longText", label: "How can we reproduce it?", required: true },
      {
        type: "dropdown",
        label: "Severity",
        required: true,
        options: ["Low", "Medium", "High", "Critical"],
      },
      { type: "screenshot", label: "Screenshot" },
    ],
  },
  {
    key: "feature",
    purpose: "feature",
    emoji: "\uD83D\uDCA1",
    label: "Feature Request",
    title: "Feature Request",
    description: "Collect clear product ideas without making people over-explain.",
    fields: [
      { type: "shortText", label: "Feature idea", required: true },
      { type: "longText", label: "What problem would this solve?", required: true },
      { type: "longText", label: "What would a good outcome look like?" },
      {
        type: "dropdown",
        label: "Priority",
        required: true,
        options: ["Nice to have", "Important", "Critical"],
      },
    ],
  },
  {
    key: "feedback",
    purpose: "custom",
    emoji: "\u2B50",
    label: "Feedback",
    title: "Product Feedback",
    description: "A lightweight form for quick opinions, reactions, and ideas.",
    fields: [
      { type: "longText", label: "What should we improve?", required: true },
      { type: "longText", label: "What already feels good?" },
      { type: "rating", label: "Overall experience" },
    ],
  },
  {
    key: "survey",
    purpose: "survey",
    emoji: "\uD83D\uDCCB",
    label: "Survey",
    title: "Quick Survey",
    description: "Measure sentiment fast, then dig into what worked and what did not.",
    fields: [
      {
        type: "rating",
        label: "How was your experience?",
        required: true,
      },
      {
        type: "checkbox",
        label: "What did you use?",
        options: ["Search", "Forms", "Dashboard", "Notifications"],
      },
      { type: "longText", label: "Anything confusing or missing?" },
    ],
  },
  {
    key: "playtest",
    purpose: "survey",
    emoji: "\uD83C\uDFAE",
    label: "Playtest Feedback",
    title: "Playtest Feedback",
    description: "Capture reactions from a fresh play session while the details are still vivid.",
    fields: [
      { type: "shortText", label: "Build or version played" },
      { type: "longText", label: "What moment stood out most?", required: true },
      { type: "longText", label: "Where did you get stuck or frustrated?" },
      { type: "rating", label: "Fun score" },
      { type: "video", label: "Clip or capture" },
    ],
  },
  {
    key: "beta",
    purpose: "bug",
    emoji: "\uD83E\uDDEA",
    label: "Beta Test",
    title: "Beta Test Feedback",
    description: "A practical template for testers sending blockers, rough edges, and environment context.",
    fields: [
      { type: "shortText", label: "Quick summary", required: true },
      { type: "longText", label: "What broke or felt off?", required: true },
      { type: "shortText", label: "Device / OS / Browser" },
      {
        type: "dropdown",
        label: "Impact",
        required: true,
        options: ["Minor", "Annoying", "Blocking"],
      },
      { type: "screenshot", label: "Screenshot" },
    ],
  },
  {
    key: "custom",
    purpose: "custom",
    emoji: "\u2728",
    label: "Start from Sample",
    title: "New Signal",
    description: "Start with a sample question so the page never feels empty.",
    fields: [{ type: "longText", label: "What should we improve?", required: true }],
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
      field.type === "dropdown" || field.type === "checkbox"
        ? [...(field.options ?? ["Option 1", "Option 2"])]
        : undefined,
  }));
}

export function getTemplateDefinition(templateKey: string) {
  return (
    formTemplates.find((template) => template.key === templateKey) ??
    formTemplates.find((template) => template.key === defaultComposerTemplateKey) ??
    formTemplates[0]
  );
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
    const severityField = fields.find((field) => field.label === "Severity" || field.label === "Impact");
    const severity = String(answers[severityField?.id ?? ""] ?? "").toLowerCase();
    if (severity === "critical" || severity === "high" || severity === "blocking") {
      return "high";
    }
    if (severity === "medium" || severity === "annoying") {
      return "medium";
    }
    if (severity === "low" || severity === "minor") {
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
