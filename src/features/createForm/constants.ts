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

export const initialTemplate = getTemplateDefinition(defaultComposerTemplateKey);
export const initialFields = createTemplateFields(initialTemplate);
export const initialSections = [];

export const INITIAL_DRAFT_SNAPSHOT = serializeDraft(
  initialTemplate.title,
  initialTemplate.description,
  initialFields,
  initialTemplate.purpose,
  "unlisted",
  "anonymous_allowed",
  false,
  true,
  initialSections,
  "none",
  "",
);
