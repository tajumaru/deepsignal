import type { Language } from "../../i18n";
import { createTemplateFields, defaultComposerTemplateKey, getTemplateDefinition } from "../../lib/formTemplates";
import type { BuilderStep, PublishPhase } from "./types";
import { serializeDraft } from "./utils";

export const showWalrusDiagnostics = String(import.meta.env.VITE_REQUIRE_WALRUS || "").toLowerCase() === "true";

export const publishPhases: PublishPhase[] = [
  { key: "encoding", label: "[ Encoding signal ]", detail: "Normalizing structure for deep transit." },
  { key: "encrypting", label: "[ Encrypting payload ]", detail: "Reducing surface noise before release." },
  { key: "sending", label: "[ Sending to Walrus ]", detail: "Handing the signal to the abyssal network." },
  { key: "stored", label: "[ Blob stored ]", detail: "Immutable blob registered for observation." },
  {
    key: "registering",
    label: "[ Queueing Sui registration ]",
    detail: "Sui registration is deferred so you can publish first and register later only when needed.",
  },
  { key: "active", label: "[ Signal active ]", detail: "Passive monitoring has started." },
];

export const builderSteps: BuilderStep[] = [
  { key: "template", title: "Step 1", description: "Pick a starting point" },
  { key: "info", title: "Step 2", description: "Basic info" },
  { key: "fields", title: "Step 3", description: "Fields" },
  { key: "publish", title: "Step 4", description: "Preview / Publish" },
];

export function getInitialTemplate(language: Language = "en") {
  return getTemplateDefinition(defaultComposerTemplateKey, language);
}

export function getInitialFields(language: Language = "en") {
  return createTemplateFields(getInitialTemplate(language));
}

export const initialTemplate = getInitialTemplate();
export const initialFields = getInitialFields();
export const initialSections = [];

export function createInitialDraftSnapshot(language: Language = "en") {
  const template = getInitialTemplate(language);
  const fields = getInitialFields(language);
  return serializeDraft(
    template.title,
    template.description,
    { url: "", alt: "", position: "center", source: "url", fileName: "" },
    { url: "", alt: "", source: "url", fileName: "" },
    fields,
    template.purpose,
    template.analysis?.analysisProfileId,
    template.analysis?.signalType,
    template.analysis?.analystType,
    template.analysis?.analysisType,
    "unlisted",
    "anonymous_allowed",
    "optional",
    template.automation?.processingMode ?? "review_required",
    false,
    true,
    initialSections,
    "",
    "none",
    "",
  );
}

export const INITIAL_DRAFT_SNAPSHOT = createInitialDraftSnapshot();
