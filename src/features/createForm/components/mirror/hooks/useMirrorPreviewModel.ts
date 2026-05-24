import { useMemo } from "react";
import { useI18n } from "../../../../../i18n";
import { analyzeSignalDraft } from "../../../signalIntelligence";
import type { MirrorPreviewModel, MirrorPreviewPanelProps, MirrorRuntimeState } from "../types";
import { createPreviewState, createTimelineSteps } from "../utils";

export function useMirrorPreviewModel({
  values,
  activeFieldId,
  isReadyToPublish = false,
  publishedStatus = "preview",
  savedForm = null,
  publicUrl = "",
  publicPath = "",
  storageRuntimeMode,
  storageRuntimeNotice,
  storageRuntimeDiagnostics = null,
  walrusCostEstimate = null,
  saving = false,
  registeringOnSui = false,
  publishError = "",
  publishFailure = null,
  onCopyLink,
}: MirrorPreviewPanelProps): MirrorPreviewModel {
  const { t } = useI18n();

  const state = useMemo(
    () => createPreviewState(values, activeFieldId, t("untitledForm"), t("publicDefaultBody"), isReadyToPublish, publishedStatus, t),
    [activeFieldId, isReadyToPublish, publishedStatus, t, values],
  );

  const runtime = useMemo<MirrorRuntimeState>(
    () => ({
      savedForm,
      publicUrl,
      publicPath,
      storageRuntimeMode,
      storageRuntimeNotice,
      storageRuntimeDiagnostics,
      walrusCostEstimate,
      saving,
      registeringOnSui,
      publishError,
      publishFailure,
      onCopyLink,
    }),
    [
      onCopyLink,
      publicPath,
      publicUrl,
      publishError,
      publishFailure,
      registeringOnSui,
      savedForm,
      saving,
      storageRuntimeDiagnostics,
      storageRuntimeMode,
      storageRuntimeNotice,
      walrusCostEstimate,
    ],
  );

  const timelineSteps = useMemo(() => createTimelineSteps(state, values, runtime, t), [runtime, state, t, values]);
  const intelligence = useMemo(() => analyzeSignalDraft(values), [values]);

  return { state, runtime, timelineSteps, intelligence };
}
