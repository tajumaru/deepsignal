import { makeId } from "./utils";
import type { FieldType, FormField, FormPurpose, FormSection, SubmissionCategory } from "../types";

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
    placeholder?: string;
    helpText?: string;
    validationHint?: string;
  }>;
}

export interface SmartTemplateDefinition {
  key: string;
  label: string;
  description: string;
  sections: Array<{
    key: string;
    title: string;
    description?: string;
  }>;
  fields: Array<{
    type: FieldType;
    label: string;
    sectionKey?: string;
    required?: boolean;
    sensitive?: boolean;
    options?: string[];
    placeholder?: string;
    helpText?: string;
    validationHint?: string;
  }>;
}

export const defaultComposerTemplateKey = "feedback";

export const formTemplates: FormTemplateDefinition[] = [
  {
    key: "bug",
    purpose: "bug",
    emoji: "\uD83D\uDCE1",
    label: "Signal Intake",
    title: "Signal Intake",
    description: "Send a quick signal with screenshots, clips, and automatically attached device context.",
    fields: [
      { type: "shortText", label: "何が起きた？", required: true, placeholder: "例: iPhoneで送信ボタンが押せない" },
      { type: "longText", label: "何が起きたか教えてください", placeholder: "スクリーンショットだけでもOK" },
      { type: "screenshot", label: "Screenshot / Video" },
      { type: "longText", label: "どうすると起きる？", placeholder: "例: Form作成後、Submitを押した時" },
      {
        type: "dropdown",
        label: "Impact",
        required: true,
        options: ["Minor", "Serious", "Blocking"],
      },
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
      { type: "longText", label: "What problem would this solve?", required: true, placeholder: "What is hard or slow today?" },
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
  {
    key: "blank",
    purpose: "custom",
    emoji: "\u25A1",
    label: "Blank",
    title: "Untitled signal",
    description: "Start from a blank composer and shape every section yourself.",
    fields: [],
  },
];

export function createTemplateFields(template: FormTemplateDefinition): FormField[] {
  return template.fields.map((field) => ({
    id: makeId("field"),
    type: field.type,
    label: field.label,
    required: Boolean(field.required),
    sensitive: Boolean(field.sensitive),
    placeholder: field.placeholder,
    helpText: field.helpText,
    validationHint: field.validationHint,
    options:
      field.type === "dropdown" || field.type === "checkbox"
        ? [...(field.options ?? ["Option 1", "Option 2"])]
        : undefined,
  }));
}

export const smartComposerTemplates: SmartTemplateDefinition[] = [
  {
    key: "bugReport",
    label: "Signal Intake",
    description: "Collect a low-friction bug signal with media first and automatic context.",
    sections: [
      { key: "signal", title: "Signal" },
      { key: "media", title: "Evidence" },
      { key: "context", title: "Context" },
    ],
    fields: [
      { type: "shortText", label: "何が起きた？", required: true, sectionKey: "signal", placeholder: "例: iPhoneで送信ボタンが押せない" },
      { type: "longText", label: "何が起きたか教えてください", sectionKey: "signal", placeholder: "スクリーンショットだけでもOK" },
      { type: "screenshot", label: "Screenshot / Video", sectionKey: "media" },
      { type: "longText", label: "どうすると起きる？", sectionKey: "context", placeholder: "例: Form作成後、Submitを押した時" },
      { type: "dropdown", label: "Impact", required: true, sectionKey: "context", options: ["Minor", "Serious", "Blocking"] },
    ],
  },
  {
    key: "featureRequest",
    label: "Feature Request",
    description: "Capture the problem, the desired outcome, and supporting context.",
    sections: [
      { key: "problem", title: "Problem" },
      { key: "proposal", title: "Proposal" },
      { key: "proof", title: "Proof" },
    ],
    fields: [
      { type: "shortText", label: "Feature idea", required: true, sectionKey: "problem" },
      { type: "longText", label: "What is hard today?", required: true, sectionKey: "problem" },
      { type: "longText", label: "What should the improved flow look like?", sectionKey: "proposal" },
      { type: "dropdown", label: "Priority", sectionKey: "proposal", options: ["Nice to have", "Important", "Critical"] },
      { type: "url", label: "Reference issue or doc", sectionKey: "proof", placeholder: "https://..." },
    ],
  },
  {
    key: "grantApplication",
    label: "Grant Application",
    description: "Create a concise intake for project background, request, and links.",
    sections: [
      { key: "team", title: "Team" },
      { key: "project", title: "Project" },
      { key: "request", title: "Request" },
    ],
    fields: [
      { type: "shortText", label: "Team name", required: true, sectionKey: "team" },
      { type: "url", label: "Project URL", required: true, sectionKey: "team", placeholder: "https://..." },
      { type: "longText", label: "What are you building?", required: true, sectionKey: "project" },
      { type: "longText", label: "Why now?", sectionKey: "project" },
      { type: "shortText", label: "Funding request", required: true, sectionKey: "request", placeholder: "Amount, token, or budget range" },
      { type: "longText", label: "How will the funds be used?", required: true, sectionKey: "request" },
    ],
  },
  {
    key: "eventSurvey",
    label: "Event Survey",
    description: "Gather fast sentiment and deeper session feedback after an event.",
    sections: [
      { key: "experience", title: "Experience" },
      { key: "sessions", title: "Sessions" },
      { key: "followup", title: "Follow-up" },
    ],
    fields: [
      { type: "rating", label: "Overall event experience", required: true, sectionKey: "experience" },
      { type: "checkbox", label: "Which parts did you join?", sectionKey: "sessions", options: ["Talks", "Workshop", "Office hours", "Networking"] },
      { type: "longText", label: "What stood out most?", sectionKey: "sessions" },
      { type: "longText", label: "What should improve next time?", sectionKey: "followup" },
    ],
  },
  {
    key: "communityFeedback",
    label: "Community Feedback",
    description: "A lightweight structure for ongoing community input and moderation signals.",
    sections: [
      { key: "signal", title: "Signal" },
      { key: "context", title: "Context" },
      { key: "followup", title: "Follow-up" },
    ],
    fields: [
      { type: "shortText", label: "Feedback summary", required: true, sectionKey: "signal" },
      { type: "longText", label: "What happened or what should change?", required: true, sectionKey: "signal" },
      { type: "checkbox", label: "Category", sectionKey: "context", options: ["Product", "Community", "Moderation", "Events"] },
      { type: "url", label: "Relevant link", sectionKey: "context", placeholder: "https://..." },
      { type: "shortText", label: "How can we follow up?", sectionKey: "followup", sensitive: true, helpText: "Use this for private contact details only when needed." },
    ],
  },
];

export function createSmartTemplateBundle(template: SmartTemplateDefinition): {
  sections: FormSection[];
  fields: FormField[];
} {
  const sections = template.sections.map((section) => ({
    id: makeId("section"),
    title: section.title,
    description: section.description,
  }));
  const sectionMap = new Map(template.sections.map((section, index) => [section.key, sections[index]?.id]));

  const fields = template.fields.map((field) => ({
    id: makeId("field"),
    type: field.type,
    label: field.label,
    required: Boolean(field.required),
    sensitive: Boolean(field.sensitive),
    sectionId: field.sectionKey ? sectionMap.get(field.sectionKey) : undefined,
    placeholder: field.placeholder,
    helpText: field.helpText,
    validationHint: field.validationHint,
    options:
      field.type === "dropdown" || field.type === "checkbox"
        ? [...(field.options ?? ["Option 1", "Option 2"])]
        : undefined,
  }));

  return { sections, fields };
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
    if (severity === "medium" || severity === "annoying" || severity === "serious") {
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
