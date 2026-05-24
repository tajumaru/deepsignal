import type { CriticalFailure } from "../../../../lib/criticalFailure";
import type { WalrusCostEstimate } from "../../../../storage/walrusCostEstimate";
import type { WalrusFailureDetails } from "../../../../storage/walrusDiagnostics";
import type { SignalDraftAnalysis } from "../../signalIntelligence";
import type { FieldType, FormBuilderValues, FormField, FormSection, PreparedPublishForm } from "../../types";

export interface MirrorPreviewPanelProps {
  values: FormBuilderValues;
  activeFieldId?: string;
  isReadyToPublish?: boolean;
  publishedStatus?: "preview" | "published";
  surface?: "builder" | "publish";
  savedForm?: PreparedPublishForm | null;
  publicUrl?: string;
  publicPath?: string;
  storageRuntimeMode?: string;
  storageRuntimeNotice?: string;
  storageRuntimeDiagnostics?: WalrusFailureDetails | null;
  walrusCostEstimate?: WalrusCostEstimate | null;
  saving?: boolean;
  registeringOnSui?: boolean;
  publishError?: string;
  publishFailure?: CriticalFailure | null;
  onCopyLink?: () => void;
}

export interface MirrorPreviewState {
  activeField?: FormField;
  activeFieldIndex: number;
  activeSectionName: string;
  activeBranchInfo: string;
  fieldCount: number;
  requiredCount: number;
  title: string;
  description: string;
  titleFallback: string;
  descriptionFallback: string;
  markdownSupported: boolean;
  mediaSupported: boolean;
  hasConditionalLogic: boolean;
  isPrivate: boolean;
  isReadyToPublish: boolean;
  publishedStatus: "preview" | "published";
  visibilityLabel: string;
  identityPolicyLabel: string;
  signalModeLabel: string;
}

export interface MirrorRuntimeState {
  savedForm?: PreparedPublishForm | null;
  publicUrl?: string;
  publicPath?: string;
  storageRuntimeMode?: string;
  storageRuntimeNotice?: string;
  storageRuntimeDiagnostics?: WalrusFailureDetails | null;
  walrusCostEstimate?: WalrusCostEstimate | null;
  saving: boolean;
  registeringOnSui: boolean;
  publishError?: string;
  publishFailure?: CriticalFailure | null;
  onCopyLink?: () => void;
}

export interface MirrorBadge {
  label: string;
  tone?: "default" | "active" | "private" | "media" | "warning";
}

export type SignalObjectStatus = "draft" | "ready" | "publishing" | "published" | "failed";

export interface TimelineStep {
  label: string;
  detail: string;
  complete: boolean;
  active?: boolean;
  statusLabel: string;
}

export interface MirrorPreviewModel {
  state: MirrorPreviewState;
  runtime: MirrorRuntimeState;
  timelineSteps: TimelineStep[];
  intelligence: SignalDraftAnalysis;
}

export type TranslationFn = (key: string, params?: Record<string, string | number>) => string;

export type { FieldType, FormBuilderValues, FormField, FormSection, SignalDraftAnalysis };
