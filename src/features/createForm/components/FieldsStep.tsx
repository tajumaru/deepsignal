import { useEffect, useMemo, useState, type DragEvent } from "react";
import { FormFieldEditor } from "../../../components/FormFieldEditor";
import { getConditionalChildFields, getOrderedFields } from "../../../utils/formLogic";
import type { DisplayMode, FieldType, FormBuilderRefs, FormField, FormSection, Translate } from "../types";
import { StepNavigationActions } from "./StepNavigationActions";

interface FieldsStepProps {
  t: Translate;
  title: string;
  description: string;
  fields: FormField[];
  sections: FormSection[];
  encryptSubmissions: boolean;
  activeFieldId: string;
  draggedFieldId: string | null;
  dragOverFieldId: string | null;
  dragOverPlacement: "before" | "after" | null;
  refs: FormBuilderRefs;
  setActiveFieldId: (fieldId: string) => void;
  setDraggedFieldId: (fieldId: string | null) => void;
  setDragOverFieldId: (fieldId: string | null) => void;
  setDragOverPlacement: (placement: "before" | "after" | null) => void;
  onAddSection: (preset?: string) => FormSection;
  onUpdateSection: (sectionId: string, patch: Partial<FormSection>) => void;
  onRemoveSection: (sectionId: string) => void;
  onUpdateField: (index: number, field: FormField) => void;
  onRemoveField: (fieldId: string) => void;
  onDuplicateField: (fieldId: string) => void;
  onInsertConditionalField: (fieldId: string) => void;
  onInsertField: (type: FieldType, afterIndex?: number, sectionId?: string) => void;
  onReorderFields: (sourceId: string, targetId: string, placement?: "before" | "after") => void;
  onOpenFieldTypePicker: () => void;
  onBack: () => void;
  onContinue: () => void;
  displayMode?: DisplayMode;
}

type LibraryTitleKey =
  | "libraryShortText"
  | "libraryLongText"
  | "libraryRichText"
  | "libraryDate"
  | "libraryDropdown"
  | "libraryCheckboxes"
  | "libraryMatrix"
  | "libraryCountrySelect"
  | "libraryConfirmationCheckbox"
  | "libraryScreenshotUpload"
  | "libraryVideoUpload"
  | "libraryVoiceAnswer"
  | "libraryUrl"
  | "libraryStarRating"
  | "libraryEmotionRating"
  | "libraryWalletAddress"
  | "libraryEvidenceUploadTitle"
  | "libraryVoiceFeedbackTitle"
  | "libraryLocationSignalTitle";

type LibraryCategoryKey =
  | "libraryCategoryPopular"
  | "libraryCategoryCollect"
  | "libraryCategoryMeasure"
  | "libraryCategoryMedia"
  | "libraryCategoryContext"
  | "libraryCategoryChoices";

type LibraryPreviewKind =
  | "shortText"
  | "longText"
  | "markdown"
  | "date"
  | "dropdown"
  | "checkbox"
  | "matrix"
  | "location"
  | "confirmation"
  | "upload"
  | "video"
  | "voice"
  | "url"
  | "rating"
  | "emotion"
  | "wallet";

type LibraryIconName =
  | "message"
  | "file"
  | "sparkles"
  | "calendar"
  | "chevronList"
  | "checkSquare"
  | "grid"
  | "mapPin"
  | "shieldCheck"
  | "upload"
  | "video"
  | "mic"
  | "link"
  | "star"
  | "heartPulse"
  | "wallet";

interface LibraryBlock {
  id: string;
  type: FieldType;
  category: LibraryCategoryKey;
  iconName: LibraryIconName;
  titleKey: LibraryTitleKey;
  subtitleKey: string;
  previewKind: LibraryPreviewKind;
  mirrorTitle: string;
  mirrorBody: string;
  mirrorKind: "question" | "media" | "identity" | "markdown" | "choice" | "attachment";
  featured?: boolean;
}

const libraryBlocks: LibraryBlock[] = [
  {
    id: "popular-emotion",
    type: "emotionRating",
    category: "libraryCategoryPopular",
    iconName: "heartPulse",
    titleKey: "libraryEmotionRating",
    subtitleKey: "librarySubtitleEmotionSignal",
    previewKind: "emotion",
    mirrorTitle: "Emotion Block",
    mirrorBody: "Facial sentiment pulse",
    mirrorKind: "question",
    featured: true,
  },
  {
    id: "popular-rating",
    type: "rating",
    category: "libraryCategoryPopular",
    iconName: "star",
    titleKey: "libraryStarRating",
    subtitleKey: "librarySubtitleRatingSignal",
    previewKind: "rating",
    mirrorTitle: "Sentiment Block",
    mirrorBody: "Quick intensity rating",
    mirrorKind: "question",
    featured: true,
  },
  {
    id: "popular-evidence",
    type: "screenshot",
    category: "libraryCategoryPopular",
    iconName: "upload",
    titleKey: "libraryEvidenceUploadTitle",
    subtitleKey: "librarySubtitleEvidenceUpload",
    previewKind: "upload",
    mirrorTitle: "Evidence Block",
    mirrorBody: "Image evidence upload",
    mirrorKind: "media",
    featured: true,
  },
  {
    id: "popular-voice",
    type: "voice",
    category: "libraryCategoryPopular",
    iconName: "mic",
    titleKey: "libraryVoiceFeedbackTitle",
    subtitleKey: "librarySubtitleVoiceFeedback",
    previewKind: "voice",
    mirrorTitle: "Voice Block",
    mirrorBody: "Spoken signal capture",
    mirrorKind: "media",
    featured: true,
  },
  {
    id: "popular-location",
    type: "country_select",
    category: "libraryCategoryPopular",
    iconName: "mapPin",
    titleKey: "libraryLocationSignalTitle",
    subtitleKey: "librarySubtitleLocationSignal",
    previewKind: "location",
    mirrorTitle: "Location Block",
    mirrorBody: "Responder region signal",
    mirrorKind: "identity",
    featured: true,
  },
  {
    id: "collect-short",
    type: "shortText",
    category: "libraryCategoryCollect",
    iconName: "message",
    titleKey: "libraryShortText",
    subtitleKey: "librarySubtitleShortText",
    previewKind: "shortText",
    mirrorTitle: "Question Block",
    mirrorBody: "Single signal prompt",
    mirrorKind: "question",
  },
  {
    id: "collect-long",
    type: "longText",
    category: "libraryCategoryCollect",
    iconName: "file",
    titleKey: "libraryLongText",
    subtitleKey: "librarySubtitleLongText",
    previewKind: "longText",
    mirrorTitle: "Reflection Block",
    mirrorBody: "Long-form signal context",
    mirrorKind: "question",
  },
  {
    id: "collect-rich",
    type: "markdown",
    category: "libraryCategoryCollect",
    iconName: "sparkles",
    titleKey: "libraryRichText",
    subtitleKey: "librarySubtitleRichText",
    previewKind: "markdown",
    mirrorTitle: "Markdown Block",
    mirrorBody: "Formatted narrative copy",
    mirrorKind: "markdown",
  },
  {
    id: "measure-rating",
    type: "rating",
    category: "libraryCategoryMeasure",
    iconName: "star",
    titleKey: "libraryStarRating",
    subtitleKey: "librarySubtitleRatingSignal",
    previewKind: "rating",
    mirrorTitle: "Sentiment Block",
    mirrorBody: "Quick intensity rating",
    mirrorKind: "question",
  },
  {
    id: "measure-emotion",
    type: "emotionRating",
    category: "libraryCategoryMeasure",
    iconName: "heartPulse",
    titleKey: "libraryEmotionRating",
    subtitleKey: "librarySubtitleEmotionSignal",
    previewKind: "emotion",
    mirrorTitle: "Emotion Block",
    mirrorBody: "Facial sentiment pulse",
    mirrorKind: "question",
  },
  {
    id: "measure-matrix",
    type: "matrix",
    category: "libraryCategoryMeasure",
    iconName: "grid",
    titleKey: "libraryMatrix",
    subtitleKey: "librarySubtitleMatrix",
    previewKind: "matrix",
    mirrorTitle: "Matrix Block",
    mirrorBody: "Structured comparison",
    mirrorKind: "choice",
  },
  {
    id: "media-upload",
    type: "screenshot",
    category: "libraryCategoryMedia",
    iconName: "upload",
    titleKey: "libraryEvidenceUploadTitle",
    subtitleKey: "librarySubtitleEvidenceUpload",
    previewKind: "upload",
    mirrorTitle: "Evidence Block",
    mirrorBody: "Image evidence upload",
    mirrorKind: "media",
  },
  {
    id: "media-video",
    type: "video",
    category: "libraryCategoryMedia",
    iconName: "video",
    titleKey: "libraryVideoUpload",
    subtitleKey: "librarySubtitleVideoUpload",
    previewKind: "video",
    mirrorTitle: "Video Block",
    mirrorBody: "Motion evidence upload",
    mirrorKind: "media",
  },
  {
    id: "media-voice",
    type: "voice",
    category: "libraryCategoryMedia",
    iconName: "mic",
    titleKey: "libraryVoiceFeedbackTitle",
    subtitleKey: "librarySubtitleVoiceFeedback",
    previewKind: "voice",
    mirrorTitle: "Voice Block",
    mirrorBody: "Spoken signal capture",
    mirrorKind: "media",
  },
  {
    id: "context-date",
    type: "date",
    category: "libraryCategoryContext",
    iconName: "calendar",
    titleKey: "libraryDate",
    subtitleKey: "librarySubtitleDate",
    previewKind: "date",
    mirrorTitle: "Timeline Block",
    mirrorBody: "Capture a date marker",
    mirrorKind: "question",
  },
  {
    id: "context-location",
    type: "country_select",
    category: "libraryCategoryContext",
    iconName: "mapPin",
    titleKey: "libraryLocationSignalTitle",
    subtitleKey: "librarySubtitleLocationSignal",
    previewKind: "location",
    mirrorTitle: "Location Block",
    mirrorBody: "Responder region signal",
    mirrorKind: "identity",
  },
  {
    id: "choices-dropdown",
    type: "dropdown",
    category: "libraryCategoryChoices",
    iconName: "chevronList",
    titleKey: "libraryDropdown",
    subtitleKey: "librarySubtitleDropdown",
    previewKind: "dropdown",
    mirrorTitle: "Choice Block",
    mirrorBody: "Single-select branch",
    mirrorKind: "choice",
  },
  {
    id: "choices-checkbox",
    type: "checkbox",
    category: "libraryCategoryChoices",
    iconName: "checkSquare",
    titleKey: "libraryCheckboxes",
    subtitleKey: "librarySubtitleCheckboxes",
    previewKind: "checkbox",
    mirrorTitle: "Multi Choice Block",
    mirrorBody: "Multi-select signal",
    mirrorKind: "choice",
  },
  {
    id: "choices-confirmation",
    type: "confirmation",
    category: "libraryCategoryChoices",
    iconName: "shieldCheck",
    titleKey: "libraryConfirmationCheckbox",
    subtitleKey: "librarySubtitleConfirmation",
    previewKind: "confirmation",
    mirrorTitle: "Consent Block",
    mirrorBody: "Explicit confirmation",
    mirrorKind: "identity",
  },
  {
    id: "context-reference",
    type: "url",
    category: "libraryCategoryContext",
    iconName: "link",
    titleKey: "libraryUrl",
    subtitleKey: "librarySubtitleUrl",
    previewKind: "url",
    mirrorTitle: "Reference Block",
    mirrorBody: "Link external context",
    mirrorKind: "attachment",
  },
  {
    id: "context-wallet",
    type: "walletAddress",
    category: "libraryCategoryContext",
    iconName: "wallet",
    titleKey: "libraryWalletAddress",
    subtitleKey: "librarySubtitleWalletAddress",
    previewKind: "wallet",
    mirrorTitle: "Wallet Block",
    mirrorBody: "Validated SUI address",
    mirrorKind: "identity",
  },
];

const libraryCategoryOrder: LibraryCategoryKey[] = [
  "libraryCategoryPopular",
  "libraryCategoryCollect",
  "libraryCategoryMeasure",
  "libraryCategoryMedia",
  "libraryCategoryContext",
  "libraryCategoryChoices",
];

const signalFlowPresets = ["Introduction", "Context", "Experience", "Reflection", "Identity"];
const mirrorIntentActions: Array<{ label: string; detail: string; type: FieldType; section?: string }> = [
  { label: "Collect intent", detail: "Core private signal", type: "longText", section: "Signal" },
  { label: "Allow evidence", detail: "Attachment lane", type: "screenshot", section: "Evidence" },
  { label: "Add priority", detail: "Review triage", type: "dropdown", section: "Triage" },
  { label: "Optional identity", detail: "Responder context", type: "country_select", section: "Identity" },
];

function SignalLibraryIcon({ name }: { name: LibraryIconName }) {
  const commonProps = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "message":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path {...commonProps} d="M6 7.5h12a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3v-3H6A2.5 2.5 0 0 1 3.5 15v-5A2.5 2.5 0 0 1 6 7.5Z" />
          <path {...commonProps} d="M8.5 11.5h7" />
          <path {...commonProps} d="M8.5 14.5h4.5" />
        </svg>
      );
    case "file":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path {...commonProps} d="M8 4.75h7l4 4v10.5A2.25 2.25 0 0 1 16.75 21h-8.5A2.25 2.25 0 0 1 6 18.75V7A2.25 2.25 0 0 1 8.25 4.75Z" />
          <path {...commonProps} d="M15 4.75v4h4" />
          <path {...commonProps} d="M9.25 12h5.75" />
          <path {...commonProps} d="M9.25 15h5.75" />
        </svg>
      );
    case "sparkles":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path {...commonProps} d="m12 4 1.4 3.8L17 9.2l-3.6 1.3L12 14.5l-1.4-4L7 9.2l3.6-1.4L12 4Z" />
          <path {...commonProps} d="m18 14.5.85 2.1L21 17.5l-2.15.85L18 20.5l-.85-2.15L15 17.5l2.15-.9.85-2.1Z" />
          <path {...commonProps} d="m6.5 14 .7 1.7 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.7Z" />
        </svg>
      );
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect {...commonProps} x="4.5" y="6.5" width="15" height="13" rx="2.5" />
          <path {...commonProps} d="M8 4.75v3.5M16 4.75v3.5M4.5 10.5h15M8.25 14h2.5M13.25 14h2.5M8.25 17h2.5" />
        </svg>
      );
    case "chevronList":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path {...commonProps} d="M6 8h8M6 12h8M6 16h8" />
          <path {...commonProps} d="m16 10 2 2 2-2" />
        </svg>
      );
    case "checkSquare":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect {...commonProps} x="4.5" y="4.5" width="15" height="15" rx="2.75" />
          <path {...commonProps} d="m8.25 12.25 2.25 2.25 5.25-5.25" />
        </svg>
      );
    case "grid":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect {...commonProps} x="5" y="5" width="5" height="5" rx="1.1" />
          <rect {...commonProps} x="14" y="5" width="5" height="5" rx="1.1" />
          <rect {...commonProps} x="5" y="14" width="5" height="5" rx="1.1" />
          <rect {...commonProps} x="14" y="14" width="5" height="5" rx="1.1" />
        </svg>
      );
    case "mapPin":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path {...commonProps} d="M12 20.5s5-5 5-9.2a5 5 0 1 0-10 0c0 4.2 5 9.2 5 9.2Z" />
          <circle {...commonProps} cx="12" cy="11.25" r="1.9" />
        </svg>
      );
    case "shieldCheck":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path {...commonProps} d="M12 4.5c2.3 1.8 4.95 2.55 7 2.8v5.45c0 4.2-2.6 6.95-7 8.75-4.4-1.8-7-4.55-7-8.75V7.3c2.05-.25 4.7-1 7-2.8Z" />
          <path {...commonProps} d="m9.2 12.45 1.8 1.8 3.8-4.05" />
        </svg>
      );
    case "upload":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path {...commonProps} d="M12 15.5v-7m0 0-3.2 3.2M12 8.5l3.2 3.2M4.5 17.25h15" />
        </svg>
      );
    case "video":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect {...commonProps} x="4.5" y="7" width="11.5" height="10" rx="2.25" />
          <path {...commonProps} d="m16 11 3.75-2.25v6.5L16 13" />
        </svg>
      );
    case "mic":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect {...commonProps} x="9" y="4.5" width="6" height="10" rx="3" />
          <path {...commonProps} d="M6.75 11.75a5.25 5.25 0 0 0 10.5 0M12 17v3.5M9 20.5h6" />
        </svg>
      );
    case "link":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path {...commonProps} d="M10.15 13.85 8.2 15.8a3 3 0 1 1-4.25-4.25l2.7-2.7A3 3 0 0 1 10.9 10.2M13.85 10.15 15.8 8.2a3 3 0 1 1 4.25 4.25l-2.7 2.7a3 3 0 0 1-4.25-1.35m-3.35 3.45 4.5-4.5" />
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path {...commonProps} d="m12 4.75 2.15 4.4 4.85.7-3.5 3.4.85 4.75L12 15.95l-4.35 2.05.85-4.75-3.5-3.4 4.85-.7L12 4.75Z" />
        </svg>
      );
    case "heartPulse":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path {...commonProps} d="M12 19.75s-6.5-3.85-6.5-8.6A3.65 3.65 0 0 1 12 8.5a3.65 3.65 0 0 1 6.5 2.65c0 4.75-6.5 8.6-6.5 8.6Z" />
          <path {...commonProps} d="M8.5 12h2l1.1-2.1 1.3 4.2 1.1-2.1h1.5" />
        </svg>
      );
    case "wallet":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path {...commonProps} d="M6 7.25h10.5A2.5 2.5 0 0 1 19 9.75v6.5a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 16.25v-6.5A2.5 2.5 0 0 1 6 7.25Zm10.25 4h3.25v3.5h-3.25a1.75 1.75 0 0 1 0-3.5Z" />
          <circle {...commonProps} cx="16.35" cy="13" r=".45" />
          <path {...commonProps} d="M6 7.25V6.8A1.8 1.8 0 0 1 7.8 5h8.7" />
        </svg>
      );
  }
}

function LibraryPreview({ kind, compact = false }: { kind: LibraryPreviewKind; compact?: boolean }) {
  switch (kind) {
    case "shortText":
      return <div className="composer-library-preview is-short-text" aria-hidden="true" />;
    case "longText":
      return (
        <div className="composer-library-preview is-long-text" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      );
    case "markdown":
      return (
        <div className="composer-library-preview is-markdown" aria-hidden="true">
          <span>Aa</span>
          <span>B</span>
          <span>•</span>
        </div>
      );
    case "date":
      return (
        <div className="composer-library-preview is-date" aria-hidden="true">
          <span>YYYY</span>
          <span>MM</span>
          <span>DD</span>
        </div>
      );
    case "dropdown":
      return (
        <div className="composer-library-preview is-dropdown" aria-hidden="true">
          <span>Choose signal</span>
          <span>▾</span>
        </div>
      );
    case "checkbox":
      return (
        <div className="composer-library-preview is-checkbox" aria-hidden="true">
          <span>□ Option A</span>
          <span>□ Option B</span>
        </div>
      );
    case "matrix":
      return (
        <div className="composer-library-preview is-matrix" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      );
    case "location":
      return (
        <div className="composer-library-preview is-location" aria-hidden="true">
          <span className="composer-library-preview-pin" />
          <span className="composer-library-preview-path" />
        </div>
      );
    case "confirmation":
      return (
        <div className="composer-library-preview is-confirmation" aria-hidden="true">
          <span>✓</span>
          <span>Confirm</span>
        </div>
      );
    case "upload":
      return (
        <div className="composer-library-preview is-upload" aria-hidden="true">
          <span>Drop evidence</span>
        </div>
      );
    case "video":
      return (
        <div className="composer-library-preview is-video" aria-hidden="true">
          <span className="composer-library-preview-play" />
        </div>
      );
    case "voice":
      return (
        <div className="composer-library-preview is-voice" aria-hidden="true">
          {Array.from({ length: compact ? 4 : 6 }, (_, index) => (
            <span key={`voice-${index}`} />
          ))}
        </div>
      );
    case "url":
      return (
        <div className="composer-library-preview is-url" aria-hidden="true">
          <span>https://</span>
        </div>
      );
    case "rating":
      return (
        <div className="composer-library-preview is-rating" aria-hidden="true">
          <span>★</span>
          <span>★</span>
          <span>★</span>
          <span>★</span>
          <span>☆</span>
        </div>
      );
    case "emotion":
      return (
        <div className="composer-library-preview is-emotion" aria-hidden="true">
          {Array.from({ length: compact ? 2 : 3 }, (_, index) => (
            <span key={`emotion-${index}`}>{["◔", "◕", "◡"][index] ?? "◔"}</span>
          ))}
        </div>
      );
    case "wallet":
      return (
        <div className="composer-library-preview is-wallet" aria-hidden="true">
          <span>0x1f...8c</span>
        </div>
      );
  }
}

function renderLibraryCardLabel(t: Translate, block: LibraryBlock, isMirrorPresentation: boolean) {
  return isMirrorPresentation ? block.mirrorTitle : t(block.titleKey);
}

function renderLibraryCardBody(t: Translate, block: LibraryBlock, isMirrorPresentation: boolean) {
  return isMirrorPresentation ? block.mirrorBody : t(block.subtitleKey);
}

export function FieldsStep({
  t,
  title,
  description,
  fields,
  sections,
  encryptSubmissions,
  activeFieldId,
  draggedFieldId,
  dragOverFieldId,
  dragOverPlacement,
  refs,
  setActiveFieldId,
  setDraggedFieldId,
  setDragOverFieldId,
  setDragOverPlacement,
  onAddSection,
  onUpdateSection,
  onRemoveSection,
  onUpdateField,
  onRemoveField,
  onDuplicateField,
  onInsertConditionalField,
  onInsertField,
  onReorderFields,
  onOpenFieldTypePicker,
  onBack,
  onContinue,
  displayMode = "classic",
}: FieldsStepProps) {
  const [expandedFieldId, setExpandedFieldId] = useState(fields[0]?.id ?? "");
  const [activeLibraryType, setActiveLibraryType] = useState<FieldType | null>(null);
  const [draggingLibraryType, setDraggingLibraryType] = useState<FieldType | null>(null);
  const [canvasLibraryDragOver, setCanvasLibraryDragOver] = useState(false);
  const [isMobileBuilderMode, setIsMobileBuilderMode] = useState(false);
  const isMirrorPresentation = displayMode === "mirror";

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 430px)");
    const syncViewport = () => setIsMobileBuilderMode(mediaQuery.matches);
    syncViewport();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  useEffect(() => {
    if (!fields.length) {
      setExpandedFieldId("");
      return;
    }
    if (!fields.some((field) => field.id === expandedFieldId)) {
      setExpandedFieldId(fields[0]?.id ?? "");
    }
  }, [expandedFieldId, fields]);

  useEffect(() => {
    if (!isMobileBuilderMode || !activeFieldId || !fields.some((field) => field.id === activeFieldId)) {
      return;
    }
    setExpandedFieldId(activeFieldId);
  }, [activeFieldId, fields, isMobileBuilderMode]);

  const orderedFields = useMemo(() => getOrderedFields(fields), [fields]);
  const unsectionedFields = useMemo(
    () => orderedFields.filter((field) => !field.sectionId && !field.conditionalParentId),
    [orderedFields],
  );
  const sectionGroups = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        fields: orderedFields.filter((field) => field.sectionId === section.id && !field.conditionalParentId),
      })),
    [orderedFields, sections],
  );
  const librarySections = useMemo(
    () =>
      libraryCategoryOrder.map((category) => ({
        category,
        items: libraryBlocks.filter((block) => block.category === category),
      })),
    [],
  );
  const availableLibraryCount = useMemo(() => new Set(libraryBlocks.map((block) => block.type)).size, []);
  const compactLibraryPreview = isMobileBuilderMode;

  function addLibraryBlock(type: FieldType, sectionId?: string) {
    setActiveLibraryType(type);
    onInsertField(type, undefined, sectionId);
  }

  function handleLibraryDragStart(event: DragEvent<HTMLElement>, type: FieldType) {
    if (isMobileBuilderMode) {
      return;
    }
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", type);
    setActiveLibraryType(type);
    setDraggingLibraryType(type);
  }

  function handleLibraryDragEnd() {
    setDraggingLibraryType(null);
    setCanvasLibraryDragOver(false);
  }

  function handleCanvasLibraryDragOver(event: DragEvent<HTMLElement>) {
    if (isMobileBuilderMode || !draggingLibraryType) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setCanvasLibraryDragOver(true);
  }

  function handleCanvasLibraryDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setCanvasLibraryDragOver(false);
    }
  }

  function handleCanvasLibraryDrop(event: DragEvent<HTMLElement>, sectionId?: string) {
    if (isMobileBuilderMode || !draggingLibraryType) {
      return;
    }
    event.preventDefault();
    addLibraryBlock(draggingLibraryType, sectionId);
    setDraggingLibraryType(null);
    setCanvasLibraryDragOver(false);
  }

  function sharedCardHandlers(field: FormField) {
    return {
      rootRef(node: HTMLElement | null) {
        refs.fieldCardRefs.current[field.id] = node;
      },
      labelRef(node: HTMLInputElement | null) {
        refs.labelRefs.current[field.id] = node;
      },
      onToggleExpand() {
        setExpandedFieldId((current) => (current === field.id ? "" : field.id));
      },
      onFocus() {
        setActiveFieldId(field.id);
        setExpandedFieldId(field.id);
      },
      onDragStart(event: DragEvent<HTMLElement>) {
        if (isMobileBuilderMode) {
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        setDraggedFieldId(field.id);
      },
      onDragEnd() {
        setDraggedFieldId(null);
        setDragOverFieldId(null);
        setDragOverPlacement(null);
      },
      onDragOver(event: DragEvent<HTMLElement>) {
        if (isMobileBuilderMode) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const bounds = event.currentTarget.getBoundingClientRect();
        const placement = event.clientY - bounds.top > bounds.height / 2 ? "after" : "before";
        setDragOverFieldId(field.id);
        setDragOverPlacement(placement);
      },
      onDrop(event: DragEvent<HTMLElement>) {
        if (isMobileBuilderMode) {
          return;
        }
        event.preventDefault();
        if (draggedFieldId) {
          onReorderFields(draggedFieldId, field.id, dragOverPlacement ?? "before");
        }
        setDraggedFieldId(null);
        setDragOverFieldId(null);
        setDragOverPlacement(null);
      },
    };
  }

  function getMoveTargets(fieldId: string) {
    const currentIndex = orderedFields.findIndex((item) => item.id === fieldId);
    return {
      nextField: currentIndex >= 0 ? orderedFields[currentIndex + 1] ?? null : null,
      previousField: currentIndex > 0 ? orderedFields[currentIndex - 1] ?? null : null,
    };
  }

  function renderFieldNode(field: FormField, index: number) {
    const conditionalChildren = getConditionalChildFields(fields, field.id);
    const handlers = sharedCardHandlers(field);
    const { nextField, previousField } = getMoveTargets(field.id);

    return (
      <div key={field.id} className="composer-question-node">
        <FormFieldEditor
          canMoveDown={Boolean(nextField && isMobileBuilderMode)}
          canMoveUp={Boolean(previousField && isMobileBuilderMode)}
          compactMobileMode={isMobileBuilderMode}
          field={field}
          fields={fields}
          index={index}
          sections={sections}
          isDragging={draggedFieldId === field.id}
          isExpanded={expandedFieldId === field.id}
          presentation={displayMode}
          dropIndicator={dragOverFieldId === field.id ? dragOverPlacement : null}
          onChange={(nextField) => onUpdateField(index, nextField)}
          onRemove={() => onRemoveField(field.id)}
          onDuplicate={() => onDuplicateField(field.id)}
          onAddBelow={() => onInsertField(field.type, index, field.sectionId)}
          onAddConditionalQuestion={() => onInsertConditionalField(field.id)}
          rootRef={handlers.rootRef}
          labelRef={handlers.labelRef}
          onToggleExpand={handlers.onToggleExpand}
          onFocus={handlers.onFocus}
          onDragStart={handlers.onDragStart}
          onDragEnd={handlers.onDragEnd}
          onDragOver={handlers.onDragOver}
          onDrop={handlers.onDrop}
          onMoveDown={nextField ? () => onReorderFields(field.id, nextField.id, "after") : undefined}
          onMoveUp={previousField ? () => onReorderFields(field.id, previousField.id, "before") : undefined}
        />

        {conditionalChildren.map((child) => {
          const childIndex = fields.findIndex((item) => item.id === child.id);
          const childHandlers = sharedCardHandlers(child);
          const childMoveTargets = getMoveTargets(child.id);
          return (
            <div key={child.id} className="composer-conditional-branch">
              <div className="composer-conditional-branch-label">
                <span className="composer-conditional-branch-arrow">{"->"}</span>
                <span>{child.conditionalValue ? t("conditionalBranchLabel", { value: child.conditionalValue }) : t("conditionalQuestionNeedsValue")}</span>
              </div>
              <FormFieldEditor
                canMoveDown={Boolean(childMoveTargets.nextField && isMobileBuilderMode)}
                canMoveUp={Boolean(childMoveTargets.previousField && isMobileBuilderMode)}
                compactMobileMode={isMobileBuilderMode}
                field={child}
                fields={fields}
                index={childIndex}
                sections={sections}
                isDragging={draggedFieldId === child.id}
                isExpanded={expandedFieldId === child.id}
                presentation={displayMode}
                dropIndicator={dragOverFieldId === child.id ? dragOverPlacement : null}
                onChange={(nextField) => onUpdateField(childIndex, nextField)}
                onRemove={() => onRemoveField(child.id)}
                onDuplicate={() => onDuplicateField(child.id)}
                onAddBelow={() => onInsertField(child.type, childIndex, child.sectionId)}
                onAddConditionalQuestion={() => undefined}
                rootRef={childHandlers.rootRef}
                labelRef={childHandlers.labelRef}
                onToggleExpand={childHandlers.onToggleExpand}
                onFocus={childHandlers.onFocus}
                onDragStart={childHandlers.onDragStart}
                onDragEnd={childHandlers.onDragEnd}
                onDragOver={childHandlers.onDragOver}
                onDrop={childHandlers.onDrop}
                onMoveDown={
                  childMoveTargets.nextField ? () => onReorderFields(child.id, childMoveTargets.nextField!.id, "after") : undefined
                }
                onMoveUp={
                  childMoveTargets.previousField
                    ? () => onReorderFields(child.id, childMoveTargets.previousField!.id, "before")
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
    );
  }

  function addMirrorIntentAction(action: (typeof mirrorIntentActions)[number]) {
    const section = action.section
      ? sections.find((item) => item.title === action.section) ?? onAddSection(action.section)
      : undefined;
    onInsertField(action.type, undefined, section?.id);
  }

  return (
    <section
      className={`composer-builder-grid composer-builder-grid-composer ${isMirrorPresentation ? "signal-composition-studio" : ""} ${
        isMobileBuilderMode ? "is-mobile-builder-mode" : ""
      }`}
    >
      <aside className="composer-builder-column composer-library-column">
        <section className="panel composer-section-card composer-library-panel">
          <div className="composer-pane-heading">
            <div>
              <p className="eyebrow">{isMirrorPresentation ? "Intent Controls" : "Step 3"}</p>
              <h2>{isMirrorPresentation ? "Signal Shape" : isMobileBuilderMode ? "部品を追加" : t("signalComponentPickerTitle")}</h2>
              {isMobileBuilderMode ? (
                <details className="composer-mobile-builder-intro">
                  <summary>{t("signalComponentPickerSummaryCount", { count: availableLibraryCount })}</summary>
                  <p className="muted">{isMirrorPresentation ? "Choose the channel behavior before editing individual blocks." : t("signalComponentPickerBody")}</p>
                </details>
              ) : (
                <p className="muted">
                  {isMirrorPresentation ? "Choose the channel behavior before editing individual blocks." : t("signalComponentPickerBody")}
                </p>
              )}
            </div>
            <button type="button" className="ghost-button composer-pane-heading-action" onClick={() => onAddSection()}>
              {isMirrorPresentation ? "Add Flow" : t("addSection")}
            </button>
          </div>

          {isMirrorPresentation ? (
            <div className="mirror-intent-action-grid" aria-label="Intent controls">
              {mirrorIntentActions.map((action) => (
                <button key={action.label} type="button" className="mirror-intent-action" onClick={() => addMirrorIntentAction(action)}>
                  <strong>{action.label}</strong>
                  <span>{action.detail}</span>
                </button>
              ))}
            </div>
          ) : null}

          {isMirrorPresentation ? (
            <div className="signal-flow-presets" aria-label="Narrative flow presets">
              {signalFlowPresets.map((preset) => (
                <button key={preset} type="button" className="signal-flow-preset" onClick={() => onAddSection(preset)}>
                  {preset}
                </button>
              ))}
            </div>
          ) : null}

          <div
            className={`composer-library-summary ${isMobileBuilderMode ? "is-mobile-hidden" : ""}`}
            aria-label={t("signalComponentPickerSummaryAria", { count: availableLibraryCount })}
          >
            <strong>{t("signalComponentPickerSummaryTitle")}</strong>
            <span>{t("signalComponentPickerSummaryCount", { count: availableLibraryCount })}</span>
          </div>

          <div className="composer-library-scroll">
            <div className="composer-library-list">
              {librarySections.map((section) => (
                <section key={section.category} className="composer-library-category">
                  <div className="composer-library-category-header">
                    <strong>{t(section.category)}</strong>
                  </div>
                  <div className="composer-library-category-grid">
                    {section.items.map((block) => {
                      const isDragging = draggingLibraryType === block.type;
                      const isSelected = activeLibraryType === block.type;
                      return (
                        isMobileBuilderMode ? (
                          <div
                            key={block.id}
                            className={`composer-library-card is-mobile-compact ${isMirrorPresentation ? `signal-block-palette-card is-${block.mirrorKind}` : ""} ${
                              block.featured ? "is-featured" : ""
                            } ${isSelected ? "is-selected" : ""}`}
                          >
                            <span className="composer-library-card-icon" aria-hidden="true">
                              <SignalLibraryIcon name={block.iconName} />
                            </span>
                            <span className="composer-library-card-copy">
                              <span className="composer-library-card-topline">
                                <strong>{renderLibraryCardLabel(t, block, isMirrorPresentation)}</strong>
                              </span>
                              <small className="muted">{renderLibraryCardBody(t, block, isMirrorPresentation)}</small>
                              <span className="composer-library-card-meta">
                                <span className="composer-library-add-pill">{t("addQuestion")}</span>
                              </span>
                            </span>
                            <button type="button" className="primary-button composer-library-add-button" onClick={() => addLibraryBlock(block.type)}>
                              追加
                            </button>
                          </div>
                        ) : (
                          <button
                            key={block.id}
                            type="button"
                            draggable
                            className={`composer-library-card ${isMirrorPresentation ? `signal-block-palette-card is-${block.mirrorKind}` : ""} ${
                              block.featured ? "is-featured" : ""
                            } ${isSelected ? "is-selected" : ""} ${isDragging ? "is-dragging" : ""}`}
                            onClick={() => addLibraryBlock(block.type)}
                            onDragStart={(event) => handleLibraryDragStart(event, block.type)}
                            onDragEnd={handleLibraryDragEnd}
                          >
                            <span className="composer-library-card-icon" aria-hidden="true">
                              <SignalLibraryIcon name={block.iconName} />
                            </span>
                            <span className="composer-library-card-copy">
                              <span className="composer-library-card-topline">
                                <strong>{renderLibraryCardLabel(t, block, isMirrorPresentation)}</strong>
                              </span>
                              <small className="muted">{renderLibraryCardBody(t, block, isMirrorPresentation)}</small>
                              <LibraryPreview kind={block.previewKind} compact={compactLibraryPreview} />
                              <span className="composer-library-card-meta">
                                <span className="composer-library-drag-label">
                                  {isDragging ? t("libraryCreatingSignal") : t("libraryDragToCanvas")}
                                </span>
                              </span>
                            </span>
                          </button>
                        )
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <span className="composer-library-swipe-cue" aria-hidden="true" />
          </div>

          <div className="composer-library-footer">
            <p className="muted">{isMirrorPresentation ? "Private signal received -> ready for review." : t("conditionalShortcutHint")}</p>
            <button type="button" className="ghost-button" onClick={onOpenFieldTypePicker}>
              {isMirrorPresentation ? "More Blocks" : t("libraryMoreComponents")}
            </button>
          </div>
        </section>
      </aside>

      <div className="composer-builder-column composer-editor-column">
        <section className={`panel composer-section-card composer-step-card composer-canvas-panel ${isMobileBuilderMode ? "is-mobile-builder-mode" : ""}`}>
          <div className="composer-pane-heading composer-question-header">
            <div>
              <p className="eyebrow">{isMirrorPresentation ? "Composition Canvas" : t("liveCanvas")}</p>
              <h2>{isMirrorPresentation ? "Signal Flow" : t("fields")}</h2>
              <p className="muted">
                {isMirrorPresentation
                  ? `${fields.length} block${fields.length === 1 ? "" : "s"} / ${encryptSubmissions ? "sealed signal" : "open signal"}`
                  : `${t("questionCount", { count: fields.length })} / ${encryptSubmissions ? t("signalModePrivate") : t("signalModeOpen")}`}
              </p>
            </div>
            <div className="composer-canvas-header-actions">
              <button type="button" className="ghost-button" onClick={() => onAddSection()}>
                {isMirrorPresentation ? "Add Flow" : t("addSection")}
              </button>
              <button type="button" className="primary-button composer-add-question-button" onClick={onOpenFieldTypePicker}>
                + {isMirrorPresentation ? "Compose Block" : t("addQuestion")}
              </button>
            </div>
          </div>

          <div className="composer-canvas-intro">
            <strong>{title.trim() || t("untitledForm")}</strong>
            <p className="muted">{description.trim() || (isMirrorPresentation ? "Currently shaping signal node." : t("liveCanvasBody"))}</p>
            {isMirrorPresentation ? (
              <span className="signal-node-status">
                Currently shaping signal node: {expandedFieldId ? `B${fields.findIndex((field) => field.id === expandedFieldId) + 1}` : "none selected"}
              </span>
            ) : null}
          </div>

          <div
            className={`stack composer-question-stack ${canvasLibraryDragOver ? "is-library-drag-over" : ""}`}
            onDragOver={handleCanvasLibraryDragOver}
            onDragLeave={handleCanvasLibraryDragLeave}
            onDrop={handleCanvasLibraryDrop}
          >
            {unsectionedFields.map((field) => renderFieldNode(field, fields.findIndex((item) => item.id === field.id)))}

            {sectionGroups.map((section) => (
              <section
                key={section.id}
                className={`composer-inline-section composer-canvas-section ${canvasLibraryDragOver ? "is-library-drop-target" : ""}`}
                onDragOver={handleCanvasLibraryDragOver}
                onDragLeave={handleCanvasLibraryDragLeave}
                onDrop={(event) => handleCanvasLibraryDrop(event, section.id)}
              >
                <div className="composer-inline-section-header">
                  <div className="composer-inline-section-rule" aria-hidden="true" />
                  <div className="composer-inline-section-main">
                    <input
                      className="composer-inline-section-title"
                      value={section.title}
                      onChange={(event) => onUpdateSection(section.id, { title: event.target.value })}
                      placeholder={t("untitledSection")}
                    />
                    <span className="question-card-type">
                      {isMirrorPresentation ? `${section.fields.length} block${section.fields.length === 1 ? "" : "s"}` : t("questionCount", { count: section.fields.length })}
                    </span>
                  </div>
                  <button type="button" className="danger-button" onClick={() => onRemoveSection(section.id)}>
                    {t("remove")}
                  </button>
                </div>

                <input
                  className="composer-inline-section-description"
                  value={section.description ?? ""}
                  onChange={(event) => onUpdateSection(section.id, { description: event.target.value })}
                  placeholder={t("sectionDescriptionPlaceholder")}
                />

                {section.fields.length > 0 ? (
                  <div className="stack composer-question-stack">
                    {section.fields.map((field) => renderFieldNode(field, fields.findIndex((item) => item.id === field.id)))}
                  </div>
                ) : (
                  <div className="composer-section-empty">
                    <p className="muted composer-inline-empty">
                      {isMirrorPresentation ? "This flow is ready for a composed block." : t("sectionEmptyQuestions")}
                    </p>
                    <button type="button" className="ghost-button" onClick={() => onInsertField("shortText", undefined, section.id)}>
                      + {isMirrorPresentation ? "Compose Block" : t("addQuestion")}
                    </button>
                  </div>
                )}
              </section>
            ))}
          </div>

          {fields.length === 0 ? (
            <section
              className={`composer-empty-canvas ${canvasLibraryDragOver ? "is-library-drag-over" : ""}`}
              onDragOver={handleCanvasLibraryDragOver}
              onDragLeave={handleCanvasLibraryDragLeave}
              onDrop={handleCanvasLibraryDrop}
            >
              <p className="eyebrow">{t("emptyCanvasEyebrow")}</p>
              <strong>{t("emptyCanvasTitle")}</strong>
              <p className="muted">{t("emptyCanvasBody")}</p>
              <div className="composer-empty-canvas-quick-add" role="group" aria-label={t("emptyCanvasQuickAddAria")}>
                {[
                  { type: "longText" as const, key: "emptyCanvasQuickFeedback" },
                  { type: "rating" as const, key: "emptyCanvasQuickRating" },
                  { type: "screenshot" as const, key: "emptyCanvasQuickEvidence" },
                  { type: "voice" as const, key: "emptyCanvasQuickVoice" },
                  { type: "country_select" as const, key: "emptyCanvasQuickLocation" },
                ].map((item) => (
                  <button key={item.key} type="button" className="ghost-button" onClick={() => addLibraryBlock(item.type)}>
                    {t(item.key)}
                  </button>
                ))}
              </div>
              <button type="button" className="primary-button" onClick={() => addLibraryBlock("shortText")}>
                + {isMirrorPresentation ? "Start Signal Block" : t("emptyCanvasPrimaryAction")}
              </button>
            </section>
          ) : null}

          <StepNavigationActions t={t} onBack={onBack} onContinue={onContinue} />
        </section>
      </div>
    </section>
  );
}
