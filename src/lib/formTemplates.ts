import { makeId } from "./utils";
import type { Language } from "../i18n";
import type {
  AnalysisProfileId,
  AnalysisSignalType,
  AnalysisType,
  AnalystType,
  FieldType,
  FormField,
  FormIdentityPolicy,
  FormLocationRequirement,
  FormPurpose,
  FormSection,
  FormVisibility,
  SignalFieldProcessingPolicy,
  SignalProcessingMode,
  SubmissionCategory,
} from "../types";

export type SignalTypeKey = "secure" | "anonymous" | "location" | "testing" | "incident" | "feedback";

export interface TemplateSignalType {
  key: SignalTypeKey;
  icon: string;
  label: string;
}

export interface TemplateCapabilityBadge {
  icon: string;
  label: string;
}

export type TemplateLibrarySection = "quick" | "advanced" | "custom";

export interface TemplateAutomationPreset {
  visibility?: FormVisibility;
  identityPolicy?: FormIdentityPolicy;
  locationRequirement?: FormLocationRequirement;
  processingMode?: SignalProcessingMode;
  encryptSubmissions?: boolean;
}

export interface TemplateAnalysisPreset {
  analysisProfileId?: AnalysisProfileId;
  signalType?: AnalysisSignalType;
  analystType?: AnalystType;
  analysisType?: AnalysisType;
}

export interface FormTemplateDefinition {
  key: string;
  purpose: FormPurpose;
  emoji: string;
  label: string;
  title: string;
  description: string;
  librarySection: TemplateLibrarySection;
  signalTypes: TemplateSignalType[];
  cardBadges: TemplateCapabilityBadge[];
  capabilities: TemplateCapabilityBadge[];
  automation?: TemplateAutomationPreset;
  analysis?: TemplateAnalysisPreset;
  featured?: {
    eyebrow: string;
    title: string;
    description: string;
    poweredBy: string;
  };
  fields: Array<{
    type: FieldType;
    label: string;
    required?: boolean;
    sensitive?: boolean;
    options?: string[];
    placeholder?: string;
    helpText?: string;
    validationHint?: string;
    processingPolicy?: SignalFieldProcessingPolicy;
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
    processingPolicy?: SignalFieldProcessingPolicy;
  }>;
}

export const defaultComposerTemplateKey = "encrypted-report";

type TemplateFieldDefinition = FormTemplateDefinition["fields"][number];

const TEMPLATE_AGGREGATE_FIELD_TYPES = new Set<FieldType>([
  "checkbox",
  "confirmation",
  "country_select",
  "date",
  "dropdown",
  "emotionRating",
  "matrix",
  "rating",
]);

function inferTemplateFieldProcessingPolicy(
  template: Pick<FormTemplateDefinition, "automation">,
  field: Pick<TemplateFieldDefinition, "type" | "sensitive" | "processingPolicy">,
): SignalFieldProcessingPolicy {
  if (field.processingPolicy) {
    return field.processingPolicy;
  }
  if (field.sensitive) {
    return "review";
  }
  if (template.automation?.processingMode === "auto_process" || template.automation?.processingMode === "hybrid") {
    return TEMPLATE_AGGREGATE_FIELD_TYPES.has(field.type) ? "aggregate" : "review";
  }
  return "auto";
}

type LocalizedTemplateOverride = {
  title?: string;
  description?: string;
  fields?: Array<
    Partial<Pick<TemplateFieldDefinition, "label" | "placeholder" | "helpText" | "validationHint" | "options">>
  >;
};

const localizedTemplateOverrides: Partial<Record<Language, Record<string, LocalizedTemplateOverride>>> = {
  ja: {
    "encrypted-report": {
      title: "セキュアインシデント報告",
      description: "機密性の高いインシデント報告のための暗号化 intake です。",
      fields: [
        { label: "インシデント概要", placeholder: "いま対応が必要なことは何ですか？" },
        { label: "何が起きましたか？", placeholder: "対応に必要な事実だけを書いてください。" },
        { label: "現在のリスクは何ですか？", placeholder: "影響を受けている人、システム、緊急度のメモ" },
        { label: "証跡 / メディア" },
        { label: "重大度", options: ["監視", "調査", "重大"] },
      ],
    },
    bug: {
      title: "インシデント報告",
      description: "不具合、影響、証跡をすばやく集めます。",
      fields: [
        { label: "何が起きましたか？", placeholder: "例: iPhone で Submit を押せません" },
        { label: "発生内容を教えてください", placeholder: "スクリーンショットだけでも大丈夫です" },
        { label: "スクリーンショット / 動画" },
        { label: "何をすると発生しますか？", placeholder: "例: フォーム作成後に Submit を押すと発生" },
        { label: "影響度", options: ["軽微", "深刻", "ブロッカー"] },
      ],
    },
    feature: {
      title: "アイデア Drop",
      description: "大げさな手順なしで製品アイデアを集めます。",
      fields: [
        { label: "機能アイデア" },
        { label: "どんな課題を解決しますか？", placeholder: "いま何が難しい、または遅いですか？" },
        { label: "理想の結果はどのようなものですか？" },
        { label: "優先度", options: ["あると良い", "重要", "最重要"] },
      ],
    },
    feedback: {
      title: "クイックリアクション",
      description: "短い反応や軽い感想をすばやく集めます。",
      fields: [
        { label: "どこを改善すべきですか？" },
        { label: "すでに良いと感じる点は何ですか？" },
        { label: "全体の体験" },
      ],
    },
    survey: {
      title: "パルスチェック",
      description: "短いパルス調査で温度感を測ります。",
      fields: [
        { label: "体験はいかがでしたか？" },
        { label: "何を使いましたか？", options: ["検索", "フォーム", "ダッシュボード", "通知"] },
        { label: "わかりにくい点や不足している点はありますか？" },
      ],
    },
    playtest: {
      title: "セッション振り返り",
      description: "進行中セッションの新鮮な反応を集めます。",
      fields: [
        { label: "プレイしたビルド / バージョン" },
        { label: "もっとも印象に残った瞬間は？" },
        { label: "どこで詰まりましたか、またはストレスを感じましたか？" },
        { label: "楽しさスコア" },
        { label: "クリップ / キャプチャ" },
      ],
    },
    beta: {
      title: "フィールドテスト",
      description: "現場で見つかったブロッカーや粗さを集めます。",
      fields: [
        { label: "概要" },
        { label: "何が壊れていた、または違和感がありましたか？" },
        { label: "端末 / OS / ブラウザ" },
        { label: "影響度", options: ["軽微", "気になる", "ブロッカー"] },
        { label: "スクリーンショット" },
      ],
    },
    "anonymous-drop": {
      title: "匿名 Drop",
      description: "ウォレット不要、身元不要。signal だけを届けます。",
      fields: [
        { label: "何を見えるようにすべきですか？" },
        { label: "signal を共有してください", placeholder: "重要な文脈だけを残してください。" },
        { label: "任意の証跡" },
      ],
    },
    "disaster-checkin": {
      title: "災害チェックイン",
      description: "必要に応じて位置情報つきで緊急状況を共有します。",
      fields: [
        { label: "現在の状況", placeholder: "安全、支援が必要、足止め中、避難中 など" },
        { label: "どのような支援が必要ですか？", placeholder: "物資、移動、連絡、医療、避難所 など" },
        { label: "最寄りの目印 / チェックポイント", placeholder: "GPS が使えない場合のテキスト補足" },
        { label: "このチェックインが対応者にレビューされる可能性を理解しました" },
      ],
    },
    custom: {
      title: "新しい signal",
      description: "1つの問いから始めて、あとから flow を整えます。",
      fields: [{ label: "どこを改善すべきですか？" }],
    },
    blank: {
      title: "無題のシグナル",
      description: "白紙のキャンバスから signal flow を組み立てます。",
    },
  },
};

export const formTemplates: FormTemplateDefinition[] = [
  {
    key: "encrypted-report",
    purpose: "bug",
    emoji: "\uD83D\uDD10",
    label: "Encrypted Report",
    title: "Secure Incident Report",
    description: "Encrypted intake for sensitive incident reports.",
    librarySection: "advanced",
    signalTypes: [
      { key: "secure", icon: "\uD83D\uDD12", label: "Secure" },
      { key: "incident", icon: "\uD83D\uDEA8", label: "Incident" },
    ],
    cardBadges: [
      { icon: "\uD83D\uDD12", label: "Secure" },
      { icon: "\uD83D\uDC38", label: "Walrus-backed" },
    ],
    capabilities: [
      { icon: "\uD83D\uDD12", label: "Seal encrypted" },
      { icon: "\uD83D\uDD76", label: "Optional anonymous" },
      { icon: "\uD83D\uDC38", label: "Walrus-backed" },
    ],
    automation: {
      visibility: "unlisted",
      identityPolicy: "anonymous_allowed",
      locationRequirement: "optional",
      processingMode: "review_required",
      encryptSubmissions: true,
    },
    analysis: {
      analysisProfileId: "incident_report",
      signalType: "incident",
      analystType: "risk",
      analysisType: "risk",
    },
    featured: {
      eyebrow: "Featured signal",
      title: "Secure Incident Report",
      description: "Lead with a hardened intake for encrypted evidence, rapid triage, and responder-safe reporting.",
      poweredBy: "WALRUS SEAL",
    },
    fields: [
      { type: "shortText", label: "Incident summary", required: true, placeholder: "What needs attention right now?" },
      { type: "longText", label: "What happened?", required: true, sensitive: true, placeholder: "Only the details responders need to act." },
      { type: "longText", label: "What is the current risk?", placeholder: "People affected, systems impacted, or urgency notes" },
      { type: "screenshot", label: "Evidence / media" },
      {
        type: "dropdown",
        label: "Severity",
        required: true,
        options: ["Monitor", "Investigate", "Critical"],
      },
    ],
  },
  {
    key: "bug",
    purpose: "bug",
    emoji: "\uD83D\uDEA8",
    label: "Incident Report",
    title: "Incident Report",
    description: "Capture breakage, impact, and evidence.",
    librarySection: "quick",
    signalTypes: [{ key: "incident", icon: "\uD83D\uDEA8", label: "Incident" }],
    cardBadges: [
      { icon: "\uD83D\uDEA8", label: "Incident" },
      { icon: "\uD83D\uDCF7", label: "Media-ready" },
    ],
    capabilities: [
      { icon: "\uD83D\uDCF7", label: "Media-ready" },
      { icon: "\u26A1", label: "Quick response" },
      { icon: "\uD83D\uDD12", label: "Encrypted" },
    ],
    automation: {
      identityPolicy: "anonymous_allowed",
      locationRequirement: "optional",
      processingMode: "review_required",
      encryptSubmissions: true,
    },
    analysis: {
      analysisProfileId: "incident_report",
      signalType: "incident",
      analystType: "operations",
      analysisType: "urgency",
    },
    fields: [
      { type: "shortText", label: "What happened?", required: true, placeholder: "Example: I cannot tap Submit on iPhone" },
      { type: "longText", label: "Tell us what happened", placeholder: "A screenshot alone is okay" },
      { type: "screenshot", label: "Screenshot / Video" },
      { type: "longText", label: "What triggers it?", placeholder: "Example: after creating a form, when I tap Submit" },
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
    label: "Idea Drop",
    title: "Idea Drop",
    description: "Collect product ideas without heavy ceremony.",
    librarySection: "quick",
    signalTypes: [{ key: "feedback", icon: "\uD83D\uDCA1", label: "Feedback" }],
    cardBadges: [
      { icon: "\uD83D\uDCA1", label: "Ideas" },
      { icon: "\u26A1", label: "Quick response" },
    ],
    capabilities: [
      { icon: "\u26A1", label: "Quick response" },
      { icon: "\uD83E\uDDE0", label: "Structured prompts" },
      { icon: "\uD83D\uDC38", label: "Walrus-backed" },
    ],
    automation: {
      identityPolicy: "anonymous_allowed",
      locationRequirement: "optional",
      processingMode: "hybrid",
      encryptSubmissions: false,
    },
    analysis: {
      analysisProfileId: "customer_feedback",
      signalType: "product_voice",
      analystType: "product",
      analysisType: "action",
    },
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
    label: "Quick Reaction",
    title: "Quick Reaction",
    description: "Gather fast reactions and lightweight sentiment.",
    librarySection: "quick",
    signalTypes: [{ key: "feedback", icon: "\u2728", label: "Feedback" }],
    cardBadges: [
      { icon: "\u26A1", label: "Quick response" },
      { icon: "\uD83D\uDD76", label: "Anonymous-ready" },
    ],
    capabilities: [
      { icon: "\u26A1", label: "Quick response" },
      { icon: "\uD83D\uDD76", label: "Anonymous-ready" },
      { icon: "\uD83D\uDCF1", label: "Mobile friendly" },
    ],
    automation: {
      identityPolicy: "anonymous_allowed",
      locationRequirement: "optional",
      processingMode: "hybrid",
      encryptSubmissions: false,
    },
    analysis: {
      analysisProfileId: "customer_feedback",
      signalType: "feedback",
      analystType: "product",
      analysisType: "sentiment",
    },
    fields: [
      { type: "longText", label: "What should we improve?", required: true },
      { type: "longText", label: "What already feels good?" },
      { type: "rating", label: "Overall experience" },
    ],
  },
  {
    key: "survey",
    purpose: "survey",
    emoji: "\uD83D\uDCCA",
    label: "Pulse Check",
    title: "Pulse Check",
    description: "Measure sentiment with a fast pulse survey.",
    librarySection: "quick",
    signalTypes: [{ key: "feedback", icon: "\uD83D\uDCCA", label: "Feedback" }],
    cardBadges: [
      { icon: "\uD83D\uDCCA", label: "Pulse" },
      { icon: "\u26A1", label: "Quick response" },
    ],
    capabilities: [
      { icon: "\uD83D\uDCCA", label: "Trend-ready" },
      { icon: "\u26A1", label: "Quick response" },
      { icon: "\uD83D\uDCE6", label: "Lightweight rollout" },
    ],
    automation: {
      identityPolicy: "anonymous_allowed",
      locationRequirement: "optional",
      processingMode: "auto_process",
      encryptSubmissions: false,
    },
    analysis: {
      analysisProfileId: "customer_feedback",
      signalType: "feedback",
      analystType: "product",
      analysisType: "trend",
    },
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
    label: "Session Debrief",
    title: "Session Debrief",
    description: "Capture fresh reactions from active sessions.",
    librarySection: "advanced",
    signalTypes: [{ key: "testing", icon: "\uD83E\uDDEA", label: "Testing" }],
    cardBadges: [
      { icon: "\uD83E\uDDEA", label: "Testing" },
      { icon: "\uD83C\uDFAE", label: "Session-ready" },
    ],
    capabilities: [
      { icon: "\uD83C\uDFAE", label: "Session-ready" },
      { icon: "\uD83D\uDCF7", label: "Media-ready" },
      { icon: "\u26A1", label: "Quick response" },
    ],
    automation: {
      identityPolicy: "anonymous_allowed",
      locationRequirement: "optional",
      processingMode: "hybrid",
      encryptSubmissions: true,
    },
    analysis: {
      analysisProfileId: "customer_feedback",
      signalType: "product_voice",
      analystType: "product",
      analysisType: "trend",
    },
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
    label: "Field Test",
    title: "Field Test",
    description: "Collect blockers and rough edges in the field.",
    librarySection: "advanced",
    signalTypes: [{ key: "testing", icon: "\uD83E\uDDEA", label: "Testing" }],
    cardBadges: [
      { icon: "\uD83E\uDDEA", label: "Testing" },
      { icon: "\uD83D\uDD12", label: "Encrypted" },
    ],
    capabilities: [
      { icon: "\uD83D\uDD0D", label: "Environment context" },
      { icon: "\uD83D\uDD12", label: "Encrypted" },
      { icon: "\uD83D\uDCF7", label: "Media-ready" },
    ],
    automation: {
      identityPolicy: "anonymous_allowed",
      locationRequirement: "optional",
      processingMode: "review_required",
      encryptSubmissions: true,
    },
    analysis: {
      analysisProfileId: "incident_report",
      signalType: "operation",
      analystType: "operations",
      analysisType: "anomaly",
    },
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
    key: "anonymous-drop",
    purpose: "custom",
    emoji: "\uD83D\uDD76",
    label: "Anonymous Drop",
    title: "Anonymous Drop",
    description: "No wallet. No identity. Just signal.",
    librarySection: "advanced",
    signalTypes: [{ key: "anonymous", icon: "\uD83D\uDD76", label: "Anonymous" }],
    cardBadges: [
      { icon: "\uD83D\uDD76", label: "Anonymous" },
      { icon: "\u26A1", label: "Guest mode" },
    ],
    capabilities: [
      { icon: "\uD83D\uDD76", label: "Anonymous" },
      { icon: "\u26A1", label: "Guest mode" },
      { icon: "\uD83D\uDD10", label: "Metadata minimized" },
    ],
    automation: {
      visibility: "public",
      identityPolicy: "anonymous_allowed",
      locationRequirement: "optional",
      processingMode: "review_required",
      encryptSubmissions: true,
    },
    analysis: {
      analysisProfileId: "general_signal",
      signalType: "internal_report",
      analystType: "risk",
      analysisType: "risk",
    },
    fields: [
      { type: "shortText", label: "What should be seen?", required: true },
      { type: "longText", label: "Share the signal", required: true, sensitive: true, placeholder: "Leave only the context that matters." },
      { type: "screenshot", label: "Optional evidence" },
    ],
  },
  {
    key: "disaster-checkin",
    purpose: "custom",
    emoji: "\uD83D\uDCCD",
    label: "Disaster Check-in",
    title: "Disaster Check-in",
    description: "Share emergency status with optional location.",
    librarySection: "advanced",
    signalTypes: [
      { key: "location", icon: "\uD83D\uDCCD", label: "Location" },
      { key: "secure", icon: "\uD83D\uDD12", label: "Secure" },
    ],
    cardBadges: [
      { icon: "\uD83D\uDCCD", label: "Location" },
      { icon: "\uD83D\uDD12", label: "Encrypted" },
    ],
    capabilities: [
      { icon: "\uD83D\uDCCD", label: "GPS ready" },
      { icon: "\uD83D\uDD12", label: "Encrypted" },
      { icon: "\u23F3", label: "Time-sensitive" },
    ],
    automation: {
      visibility: "unlisted",
      identityPolicy: "anonymous_allowed",
      locationRequirement: "required",
      processingMode: "review_required",
      encryptSubmissions: true,
    },
    analysis: {
      analysisProfileId: "incident_report",
      signalType: "disaster",
      analystType: "risk",
      analysisType: "urgency",
    },
    fields: [
      { type: "shortText", label: "Current status", required: true, placeholder: "Safe, need support, blocked, evacuating" },
      { type: "longText", label: "What help is needed?", placeholder: "Supplies, transport, contact, medical, shelter" },
      { type: "shortText", label: "Nearest landmark / checkpoint", placeholder: "Optional text fallback if GPS is unavailable" },
      { type: "confirmation", label: "I understand this check-in may be reviewed by responders", required: true },
    ],
  },
  {
    key: "custom",
    purpose: "custom",
    emoji: "\u2728",
    label: "Guided Signal",
    title: "New Signal",
    description: "Start with one prompt, then shape your flow.",
    librarySection: "custom",
    signalTypes: [{ key: "feedback", icon: "\u2728", label: "Feedback" }],
    cardBadges: [
      { icon: "\u2728", label: "Fast scaffold" },
      { icon: "\u2699", label: "Flexible setup" },
    ],
    capabilities: [
      { icon: "\u2728", label: "Fast scaffold" },
      { icon: "\u2699", label: "Flexible setup" },
      { icon: "\uD83D\uDC38", label: "Walrus-backed" },
    ],
    automation: {
      identityPolicy: "anonymous_allowed",
      locationRequirement: "optional",
      processingMode: "review_required",
      encryptSubmissions: true,
    },
    analysis: {
      analysisProfileId: "general_signal",
      signalType: "generic",
      analystType: "operations",
      analysisType: "summary",
    },
    fields: [{ type: "longText", label: "What should we improve?", required: true }],
  },
  {
    key: "blank",
    purpose: "custom",
    emoji: "\u2728",
    label: "Start From Scratch",
    title: "Untitled signal",
    description: "Build a signal flow from a blank canvas.",
    librarySection: "custom",
    signalTypes: [{ key: "feedback", icon: "\u2728", label: "Feedback" }],
    cardBadges: [
      { icon: "\u2728", label: "Blank canvas" },
      { icon: "\u2699", label: "Full control" },
    ],
    capabilities: [
      { icon: "\u2728", label: "Blank canvas" },
      { icon: "\u2699", label: "Full control" },
      { icon: "\uD83D\uDCE6", label: "Lightweight" },
    ],
    automation: {
      identityPolicy: "anonymous_allowed",
      locationRequirement: "optional",
      processingMode: "review_required",
      encryptSubmissions: true,
    },
    analysis: {
      analysisProfileId: "general_signal",
      signalType: "generic",
      analystType: "operations",
      analysisType: "summary",
    },
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
    processingPolicy: inferTemplateFieldProcessingPolicy(template, field),
    options:
      field.type === "dropdown" || field.type === "checkbox"
        ? [...(field.options ?? ["Option 1", "Option 2"])]
        : undefined,
  }));
}

export const smartComposerTemplates: SmartTemplateDefinition[] = [
  {
    key: "bugReport",
    label: "Bug Report",
    description: "Collect a low-friction bug signal with media first and automatic context.",
    sections: [
      { key: "signal", title: "Signal" },
      { key: "media", title: "Evidence" },
      { key: "context", title: "Context" },
    ],
    fields: [
      { type: "shortText", label: "What happened?", required: true, sectionKey: "signal", placeholder: "Example: I cannot tap Submit on iPhone" },
      { type: "longText", label: "Tell us what happened", sectionKey: "signal", placeholder: "A screenshot alone is okay" },
      { type: "screenshot", label: "Screenshot / Video", sectionKey: "media" },
      { type: "longText", label: "What triggers it?", sectionKey: "context", placeholder: "Example: after creating a form, when I tap Submit" },
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
    processingPolicy: field.processingPolicy,
    options:
      field.type === "dropdown" || field.type === "checkbox"
        ? [...(field.options ?? ["Option 1", "Option 2"])]
        : undefined,
  }));

  return { sections, fields };
}

function localizeTemplateDefinition(template: FormTemplateDefinition, language: Language): FormTemplateDefinition {
  const override = localizedTemplateOverrides[language]?.[template.key];
  if (!override) {
    return {
      ...template,
      fields: template.fields.map((field) => ({
        ...field,
        options: field.options ? [...field.options] : undefined,
      })),
    };
  }

  return {
    ...template,
    title: override.title ?? template.title,
    description: override.description ?? template.description,
    fields: template.fields.map((field, index) => {
      const fieldOverride = override.fields?.[index];
      return {
        ...field,
        ...fieldOverride,
        options: fieldOverride?.options ? [...fieldOverride.options] : field.options ? [...field.options] : undefined,
      };
    }),
  };
}

export function getTemplateDefinition(templateKey: string, language: Language = "en") {
  const template =
    formTemplates.find((item) => item.key === templateKey) ??
    formTemplates.find((item) => item.key === defaultComposerTemplateKey) ??
    formTemplates[0];

  return localizeTemplateDefinition(template, language);
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
