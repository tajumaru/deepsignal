import { EMOTION_SCALE_OPTIONS } from "../../../../lib/emotionScale";
import { getOrderedFields } from "../../../../utils/formLogic";
import type { SignalDraftAnalysis, SignalIntelligenceItem } from "../../signalIntelligence";
import type { FormBuilderValues, FormField } from "../../types";
import type { MirrorBadge, MirrorPreviewState, MirrorRuntimeState, SignalObjectStatus, TimelineStep, TranslationFn } from "./types";

export const mediaFieldTypes = ["screenshot", "video", "voice"] as const;

export function displayValue(value: string | number | null | undefined, fallback: string) {
  if (value === null || value === undefined) {
    return fallback;
  }
  const text = String(value).trim();
  return text || fallback;
}

export function formatBytesCompact(value: number | undefined) {
  if (!value || value <= 0) {
    return "";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function getSectionName(field: FormField | undefined, sections: FormBuilderValues["sections"], fallback: string) {
  if (!field?.sectionId) {
    return fallback;
  }
  const section = sections?.find((candidate) => candidate.id === field.sectionId);
  return section?.title?.trim() || fallback;
}

function getBranchInfo(field: FormField | undefined, fields: FormField[], t: TranslationFn) {
  if (!field?.conditionalParentId) {
    return t("mirrorPrimarySignalPath");
  }
  const parent = fields.find((candidate) => candidate.id === field.conditionalParentId);
  const parentLabel = parent?.label?.trim() || t("mirrorParentSignalNode");
  return field.conditionalValue
    ? t("mirrorBranchFromWithValue", { parent: parentLabel, value: field.conditionalValue })
    : t("mirrorBranchFromParent", { parent: parentLabel });
}

function supportsMarkdown(field?: FormField) {
  return field?.type === "markdown" || field?.type === "longText";
}

function supportsMedia(field?: FormField) {
  return field ? mediaFieldTypes.includes(field.type as (typeof mediaFieldTypes)[number]) : false;
}

function hasConditionalLogic(field?: FormField) {
  return Boolean(
    field?.conditionalParentId ||
      field?.conditionalValue ||
      field?.visibilityRules?.conditions.length ||
      field?.requiredRules?.conditions.length,
  );
}

export function getFieldPreviewHint(field: FormField | undefined, fallback: string) {
  if (!field) {
    return fallback;
  }
  if (field.placeholder?.trim()) {
    return field.placeholder.trim();
  }
  if (field.helpText?.trim()) {
    return field.helpText.trim();
  }
  return fallback;
}

export function createPreviewState(
  values: FormBuilderValues,
  activeFieldId: string | undefined,
  titleFallback: string,
  descriptionFallback: string,
  isReadyToPublish: boolean,
  publishedStatus: "preview" | "published",
  t: TranslationFn,
): MirrorPreviewState {
  const orderedFields = getOrderedFields(values.fields ?? []);
  const resolvedActiveFieldId = activeFieldId || values.activeFieldId;
  const activeField = orderedFields.find((field) => field.id === resolvedActiveFieldId) ?? orderedFields[0];
  const activeFieldIndex = activeField ? orderedFields.findIndex((field) => field.id === activeField.id) : -1;
  const isPrivate = Boolean(values.encryptSubmissions);
  const visibilityLabel =
    values.visibility === "public"
      ? t("mirrorVisibilityPublicSignal")
      : values.visibility === "unlisted"
        ? t("mirrorVisibilityLinkOnly")
        : t("mirrorVisibilityPrivateDraft");
  const identityPolicyLabel =
    values.identityPolicy === "wallet_required" ? t("mirrorIdentityVerified") : t("mirrorIdentityOptional");

  return {
    activeField,
    activeFieldIndex,
    activeSectionName: getSectionName(activeField, values.sections, t("mirrorUnsectionedFlow")),
    activeBranchInfo: getBranchInfo(activeField, orderedFields, t),
    fieldCount: orderedFields.length,
    requiredCount: orderedFields.filter((field) => field.required).length,
    title: values.title?.trim() || titleFallback,
    description: values.description?.trim() || descriptionFallback,
    titleFallback,
    descriptionFallback,
    markdownSupported: supportsMarkdown(activeField),
    mediaSupported: supportsMedia(activeField),
    hasConditionalLogic: hasConditionalLogic(activeField),
    isPrivate,
    isReadyToPublish,
    publishedStatus,
    visibilityLabel,
    identityPolicyLabel,
    signalModeLabel: isPrivate ? t("mirrorProtectedSignal") : visibilityLabel,
  };
}

export function getSignalObjectStatus(
  state: MirrorPreviewState,
  runtime: Pick<MirrorRuntimeState, "savedForm" | "saving" | "registeringOnSui" | "publishError" | "publishFailure">,
): SignalObjectStatus {
  if (runtime.publishFailure || runtime.publishError?.trim()) {
    return "failed";
  }
  if (runtime.saving || runtime.registeringOnSui) {
    return "publishing";
  }
  if (runtime.savedForm) {
    return "published";
  }
  if (state.isReadyToPublish) {
    return "ready";
  }
  return "draft";
}

export function getStatusCopy(status: SignalObjectStatus, t: TranslationFn) {
  switch (status) {
    case "ready":
      return { label: t("mirrorStatusReady"), body: t("mirrorStatusReadyBody") };
    case "publishing":
      return { label: t("mirrorStatusPublishing"), body: t("mirrorStatusPublishingBody") };
    case "published":
      return { label: t("mirrorStatusPublished"), body: t("mirrorStatusPublishedBody") };
    case "failed":
      return { label: t("mirrorStatusFailed"), body: t("mirrorStatusFailedBody") };
    default:
      return { label: t("mirrorStatusDraft"), body: t("mirrorStatusDraftBody") };
  }
}

function isWalrusReady(runtime: MirrorRuntimeState) {
  return (
    Boolean(runtime.savedForm?.blobId) ||
    runtime.storageRuntimeMode === "walrus" ||
    runtime.storageRuntimeMode === "remote" ||
    runtime.walrusCostEstimate?.status === "ready"
  );
}

function isSuiRegistered(runtime: MirrorRuntimeState) {
  return Boolean(runtime.savedForm?.onchainFormId);
}

export function createTimelineSteps(
  state: MirrorPreviewState,
  values: FormBuilderValues,
  runtime: MirrorRuntimeState,
  t: TranslationFn,
): TimelineStep[] {
  const hasDraft = Boolean(values.title?.trim() && state.fieldCount > 0);
  const privacyConfigured =
    Boolean(values.visibility) &&
    Boolean(values.identityPolicy) &&
    typeof values.encryptSubmissions === "boolean";
  const walrusReady = isWalrusReady(runtime);
  const suiRegistered = isSuiRegistered(runtime);

  return [
    {
      label: t("mirrorTimelineDraftComposed"),
      detail: t("mirrorTimelineDraftComposedDetail"),
      complete: hasDraft,
      active: !hasDraft,
      statusLabel: hasDraft ? t("mirrorTimelineStatusStable") : t("mirrorTimelineStatusPending"),
    },
    {
      label: t("mirrorTimelineSchemaValidated"),
      detail: t("mirrorTimelineSchemaValidatedDetail"),
      complete: state.isReadyToPublish,
      active: hasDraft && !state.isReadyToPublish,
      statusLabel: state.isReadyToPublish ? t("mirrorTimelineStatusReady") : t("mirrorTimelineStatusNeedsWork"),
    },
    {
      label: t("mirrorTimelinePrivacyConfigured"),
      detail: t("mirrorTimelinePrivacyConfiguredDetail"),
      complete: privacyConfigured,
      active: hasDraft && !privacyConfigured,
      statusLabel: privacyConfigured ? t("mirrorTimelineStatusProtected") : t("mirrorTimelineStatusPending"),
    },
    {
      label: t("mirrorTimelineWalrusReady"),
      detail: t("mirrorTimelineWalrusReadyDetail"),
      complete: walrusReady,
      active: state.isReadyToPublish && !walrusReady,
      statusLabel: walrusReady ? t("mirrorTimelineStatusImmutable") : t("mirrorTimelineStatusBuffered"),
    },
    {
      label: t("mirrorTimelineSignalPublished"),
      detail: t("mirrorTimelineSignalPublishedDetail"),
      complete: suiRegistered || Boolean(runtime.savedForm),
      active: (runtime.saving || runtime.registeringOnSui) && !suiRegistered,
      statusLabel: suiRegistered ? t("mirrorTimelineStatusVerified") : t("mirrorTimelineStatusPending"),
    },
  ];
}

export function createMetadataBadges(state: MirrorPreviewState, t: TranslationFn): MirrorBadge[] {
  return [
    {
      label: state.publishedStatus === "published" ? t("mirrorPublishedSignal") : t("mirrorPreviewOnly"),
      tone: state.publishedStatus === "published" ? "active" : "warning",
    },
    { label: state.isPrivate ? t("mirrorProtectedSignal") : state.signalModeLabel, tone: state.isPrivate ? "private" : "active" },
    { label: state.identityPolicyLabel },
    { label: state.isReadyToPublish ? t("mirrorReadyToPublish") : t("mirrorReviewInProgress"), tone: state.isReadyToPublish ? "active" : "warning" },
    { label: state.activeField ? t("mirrorBlockMirrorReady") : t("mirrorNoBlockYet"), tone: state.activeField ? "active" : "warning" },
    { label: state.activeField?.required ? t("mirrorResponseRequired") : t("mirrorOptionalResponse") },
    { label: state.markdownSupported ? t("mirrorRichTextEnabled") : t("mirrorSimpleTextInput") },
    { label: state.mediaSupported ? t("mirrorMediaUploadEnabled") : t("mirrorTextOnlyBlock"), tone: state.mediaSupported ? "media" : "default" },
    { label: state.hasConditionalLogic ? t("mirrorAdaptivePath") : t("mirrorStepByStepFlow") },
  ];
}

export function getIntelligenceMessage(item: SignalIntelligenceItem, t: TranslationFn) {
  const messageById: Record<SignalIntelligenceItem["id"], string> = {
    responseFatigueManyBlocks: t("mirrorIntelligenceItem_responseFatigueManyBlocks"),
    responseFatigueRequiredRatio: t("mirrorIntelligenceItem_responseFatigueRequiredRatio"),
    reflectionGap: t("mirrorIntelligenceItem_reflectionGap"),
    privacySealSuggestion: t("mirrorIntelligenceItem_privacySealSuggestion"),
    identityFriction: t("mirrorIntelligenceItem_identityFriction"),
    narrativeShortText: t("mirrorIntelligenceItem_narrativeShortText"),
    narrativeShallowChoice: t("mirrorIntelligenceItem_narrativeShallowChoice"),
    publishReadinessStrong: t("mirrorIntelligenceItem_publishReadinessStrong"),
    privacyPostureStrong: t("mirrorIntelligenceItem_privacyPostureStrong"),
    reflectionDepthStrong: t("mirrorIntelligenceItem_reflectionDepthStrong"),
  };
  return messageById[item.id];
}

export function getScoreLabel(score: number, t: TranslationFn) {
  if (score >= 86) {
    return t("mirrorIntelligenceScoreStrong");
  }
  if (score >= 70) {
    return t("mirrorIntelligenceScoreNeedsReview");
  }
  return t("mirrorIntelligenceScoreWeak");
}

export function getResponseFatigueLabel(analysis: SignalDraftAnalysis, t: TranslationFn) {
  if (analysis.metrics.fieldCount >= 8 || analysis.metrics.requiredRatio > 0.7) {
    return t("mirrorIntelligenceRiskHigh");
  }
  if (analysis.metrics.fieldCount >= 5 || analysis.metrics.requiredRatio > 0.5) {
    return t("mirrorIntelligenceRiskMedium");
  }
  return t("mirrorIntelligenceRiskLow");
}

export function getPrivacyPostureLabel(isPrivate: boolean, analysis: SignalDraftAnalysis, t: TranslationFn) {
  if (isPrivate) {
    return t("mirrorIntelligencePrivacySealed");
  }
  if (analysis.metrics.hasSensitiveLanguage) {
    return t("mirrorIntelligencePrivacyExposed");
  }
  return t("mirrorIntelligencePrivacyOpen");
}

export function getTopRecommendation(analysis: SignalDraftAnalysis, t: TranslationFn) {
  return analysis.suggestions[0]
    ? getIntelligenceMessage(analysis.suggestions[0], t)
    : analysis.warnings[0]
      ? getIntelligenceMessage(analysis.warnings[0], t)
      : t("mirrorIntelligenceNoImmediateAction");
}

export function getBiggestFriction(analysis: SignalDraftAnalysis, t: TranslationFn) {
  return analysis.warnings[0]
    ? getIntelligenceMessage(analysis.warnings[0], t)
    : analysis.suggestions[0]
      ? getIntelligenceMessage(analysis.suggestions[0], t)
      : t("mirrorIntelligenceNoFriction");
}

export function getPrimaryReadinessAction(state: MirrorPreviewState, analysis: SignalDraftAnalysis, t: TranslationFn) {
  if (state.title === state.titleFallback) {
    return t("mirrorActionNameSignal");
  }
  if (state.fieldCount === 0) {
    return t("mirrorActionAddFirstBlock");
  }
  if (!analysis.metrics.hasReflectionBlock) {
    return t("mirrorActionAddReflection");
  }
  if (analysis.metrics.hasSensitiveLanguage && !state.isPrivate) {
    return t("mirrorActionEnableSeal");
  }
  if (analysis.metrics.requiredRatio > 0.7) {
    return t("mirrorActionReduceRequired");
  }
  if (!state.isReadyToPublish) {
    return t("mirrorActionReviewFlow");
  }
  return t("mirrorActionReadyToLaunch");
}

export function getReadinessChecks(state: MirrorPreviewState, analysis: SignalDraftAnalysis, t: TranslationFn) {
  return [
    [t("mirrorReadinessIntentNamed"), state.title !== state.titleFallback],
    [t("mirrorReadinessSignalPathOpen"), state.fieldCount > 0],
    [t("mirrorReadinessReflectionPresent"), analysis.metrics.hasReflectionBlock],
    [t("mirrorReadinessAccessPostureSet"), Boolean(state.signalModeLabel)],
    [t("mirrorReadinessReadyForIntake"), state.isReadyToPublish],
  ] as const;
}

export function getWalrusState(runtime: MirrorRuntimeState, t: TranslationFn) {
  if (runtime.savedForm?.blobId) {
    return {
      label: t("mirrorWalrusStateStored"),
      body: t("mirrorWalrusStateStoredBody"),
      tone: "active",
    } as const;
  }
  if (runtime.saving) {
    return {
      label: t("mirrorWalrusStateSealing"),
      body: t("mirrorWalrusStateSealingBody"),
      tone: "active",
    } as const;
  }
  if (isWalrusReady(runtime)) {
    return {
      label: t("mirrorWalrusStatePrepared"),
      body: t("mirrorWalrusStatePreparedBody"),
      tone: "default",
    } as const;
  }
  return {
    label: t("mirrorWalrusStateLocal"),
    body: t("mirrorWalrusStateLocalBody"),
    tone: "warning",
  } as const;
}

export function getSuiState(runtime: MirrorRuntimeState, t: TranslationFn) {
  if (runtime.savedForm?.onchainFormId) {
    return {
      label: t("mirrorSuiStateRegistered"),
      body: t("mirrorSuiStateRegisteredBody"),
      tone: "active",
    } as const;
  }
  if (runtime.registeringOnSui) {
    return {
      label: t("mirrorSuiStateRegistering"),
      body: t("mirrorSuiStateRegisteringBody"),
      tone: "default",
    } as const;
  }
  if (runtime.savedForm) {
    return {
      label: t("mirrorSuiStateAwaiting"),
      body: t("mirrorSuiStateAwaitingBody"),
      tone: "warning",
    } as const;
  }
  return {
    label: t("mirrorSuiStateDraft"),
    body: t("mirrorSuiStateDraftBody"),
    tone: "warning",
  } as const;
}

export function getNodePreviewArtifacts(field: FormField | undefined) {
  const options = field?.options?.filter((option) => option.trim()) ?? [];
  const matrixRows = field?.rows?.filter((row) => row.trim()) ?? [];
  const matrixColumns = field?.columns?.filter((column) => column.trim()) ?? [];
  const emotionPreview = EMOTION_SCALE_OPTIONS.map((option) => option.emoji).join(" ");

  return { options, matrixRows, matrixColumns, emotionPreview };
}
