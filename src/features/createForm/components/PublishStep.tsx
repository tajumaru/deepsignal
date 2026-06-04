import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { BlobLink } from "../../../components/BlobLink";
import { CriticalFailurePanel } from "../../../components/CriticalFailurePanel";
import { ShareCard } from "../../../components/ShareCard";
import { SignalMetaRow } from "../../../components/SignalMetaChip";
import { SuiAddressDisplay } from "../../../components/SuiAddressDisplay";
import { hasInconsistentPublishState, type CriticalFailure } from "../../../lib/criticalFailure";
import {
  CUSTOM_NFT_PRESET_ID,
  getNftGatePresetLabel,
  PRIME_MACHIN_PRESET_ID,
  PRIME_MACHIN_STRUCT_TYPE,
  TALLY_PRESET_ID,
} from "../../../lib/formAccess";
import { LivePreview } from "../../../components/formBuilder/LivePreview";
import { useOwnedSuiObjects } from "../../../hooks/useOwnedSuiObjects";
import { isLocalFallbackBlob } from "../../../lib/proof";
import { toDateTimeLocalValue } from "../../../lib/responseDeadline";
import { SUI_NETWORK } from "../../../lib/sui";
import type { WalrusCostEstimate } from "../../../storage/walrusCostEstimate";
import { formatWalrusFailureStage, type WalrusFailureDetails } from "../../../storage/walrusDiagnostics";
import type { EncryptionReadinessWarning } from "../encryptionReadiness";
import { StepNavigationActions } from "./StepNavigationActions";
import type {
  AnalysisProfileId,
  AnalysisSignalType,
  AnalysisType,
  AnalystType,
  FormField,
  FormAccessMode,
  FormHeaderImage,
  FormHeaderLogo,
  FormIdentityPolicy,
  FormLocationRequirement,
  FormNftGate,
  FormSection,
  FormVisibility,
  DisplayMode,
  MobileBuilderPane,
  PreparedPublishForm,
  ProjectOption,
  ResponseDeadlinePreset,
  Translate,
} from "../types";

interface PublishStepProps {
  t: Translate;
  language: "en" | "ja";
  saving: boolean;
  registeringOnSui: boolean;
  error: string;
  failure: CriticalFailure | null;
  diagnosticsCopied: boolean;
  savedForm: PreparedPublishForm | null;
  title: string;
  description: string;
  headerImage: FormHeaderImage | {
    url: string;
    alt: string;
    position: FormHeaderImage["position"];
    source?: "url" | "upload";
    fileName?: string;
  };
  headerLogo: FormHeaderLogo | {
    url: string;
    alt: string;
    source?: "none" | "url" | "upload";
    fileName?: string;
  };
  fields: FormField[];
  sections: FormSection[];
  analysisProfileId?: AnalysisProfileId;
  signalType?: AnalysisSignalType;
  analystType?: AnalystType;
  analysisType?: AnalysisType;
  visibility: FormVisibility;
  identityPolicy: FormIdentityPolicy;
  accessMode: FormAccessMode;
  nftGate: FormNftGate;
  locationRequirement: FormLocationRequirement;
  encryptSubmissions: boolean;
  responseOpenAtCustom: string;
  responseDeadlinePreset: ResponseDeadlinePreset;
  responseDeadlineCustomAt: string;
  mobilePane: MobileBuilderPane;
  isReadyToPublish: boolean;
  publicPath: string;
  publicUrl: string;
  publishChecks: string[];
  encryptionWarnings: EncryptionReadinessWarning[];
  showPublishSuccessView: boolean;
  showWalrusDiagnostics: boolean;
  isGuestDraftMode: boolean;
  isConnected: boolean;
  currentWalletName?: string;
  accountAddress?: string;
  storageMode: string;
  uploadRelayUrl: string;
  storageRuntimeMode: string;
  storageRuntimeNotice?: string;
  storageRuntimeDiagnostics?: WalrusFailureDetails | null;
  walrusCostEstimate: WalrusCostEstimate | null;
  displayMode?: DisplayMode;
  canManageProjects: boolean;
  selectedProjectId: string;
  selectedProject: ProjectOption | null;
  projects: ProjectOption[];
  projectState: string;
  selectedTemplateKey: string;
  onSetMobilePane: (pane: MobileBuilderPane) => void;
  onSelectProject: (projectId: string) => void;
  onChangeVisibility: (value: FormVisibility) => void;
  onChangeIdentityPolicy: (value: FormIdentityPolicy) => void;
  onChangeAccessMode: (value: FormAccessMode) => void;
  onChangeNftGatePreset: (value: FormNftGate["presetId"]) => void;
  onChangeNftGate: (value: Partial<FormNftGate>) => void;
  onChangeLocationRequirement: (value: FormLocationRequirement) => void;
  onToggleEncryptSubmissions: (value: boolean) => void;
  onChangeResponseOpenAtCustom: (value: string) => void;
  onChangeResponseDeadlinePreset: (value: ResponseDeadlinePreset) => void;
  onChangeResponseDeadlineCustomAt: (value: string) => void;
  onRegisterOnSui: () => void;
  onCopyDiagnostics: () => void;
  onBack: () => void;
}

function RoutingIcon({ type }: { type: "registry" | "visibility" | "identity" | "encryption" }) {
  if (type === "registry") {
    return (
      <svg viewBox="0 0 48 48" role="img" aria-hidden="true" focusable="false">
        <path d="M11 31.5 24 39l13-7.5V16.5L24 9l-13 7.5v15Z" />
        <path d="m11 16.5 13 7.5 13-7.5M24 24v15" />
        <path d="M16.5 29.2 24 33.5l7.5-4.3" />
      </svg>
    );
  }

  if (type === "visibility") {
    return (
      <svg viewBox="0 0 48 48" role="img" aria-hidden="true" focusable="false">
        <path d="M7.5 24s6-10 16.5-10 16.5 10 16.5 10-6 10-16.5 10S7.5 24 7.5 24Z" />
        <path d="M24 18.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z" />
        <path d="M35.5 12.5 39 9m-26.5 3.5L9 9" />
      </svg>
    );
  }

  if (type === "identity") {
    return (
      <svg viewBox="0 0 48 48" role="img" aria-hidden="true" focusable="false">
        <path d="M24 25.5c5 0 9-4 9-9s-4-9-9-9-9 4-9 9 4 9 9 9Z" />
        <path d="M10 41c1.7-7 7-11.5 14-11.5S36.3 34 38 41" />
        <path d="M31 31.5 35 36l6-8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" role="img" aria-hidden="true" focusable="false">
      <path d="M15 21v-5a9 9 0 0 1 18 0v5" />
      <path d="M12 21h24v18H12V21Z" />
      <path d="M24 28v5" />
      <path d="M19 38h10" />
    </svg>
  );
}

function SignalPrivacyIcon({ locked }: { locked: boolean }) {
  if (!locked) {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
        <path d="M7 10V7.8a5 5 0 0 1 9.2-2.7" />
        <path d="M6 10h12v9H6v-9Z" />
        <path d="M12 13.3v2.4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <path d="M6 10h12v9H6v-9Z" />
      <path d="M12 13.3v2.4" />
    </svg>
  );
}

function AccessModeGlyph({ mode }: { mode: FormAccessMode }) {
  if (mode === "wallet_required") {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
        <path d="M4.5 7.5h12a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1-2.5 2.5h-12A2.5 2.5 0 0 1 2 16V10a2.5 2.5 0 0 1 2.5-2.5Z" />
        <path d="M15.5 12h4.5v3.2h-4.5A1.6 1.6 0 0 1 13.9 13.6v0A1.6 1.6 0 0 1 15.5 12Z" />
        <path d="M6.5 7.5V6.8A2.8 2.8 0 0 1 9.3 4h7.2" />
      </svg>
    );
  }

  if (mode === "nft_required") {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
        <path d="M12 3.5 18.5 6v5.2c0 4.1-2.6 7.7-6.5 9.3-3.9-1.6-6.5-5.2-6.5-9.3V6L12 3.5Z" />
        <path d="M9.5 12.2 11.2 14l3.6-4.1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5a13.8 13.8 0 0 1 0 17" />
      <path d="M12 3.5a13.8 13.8 0 0 0 0 17" />
    </svg>
  );
}

function VisibilityGlyph({ mode }: { mode: FormVisibility }) {
  if (mode === "private") {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
        <path d="M12 4.2 18 6.6v4.8c0 3.8-2.4 7.1-6 8.5-3.6-1.4-6-4.7-6-8.5V6.6l6-2.4Z" />
        <path d="M9.8 11.8 11.4 13.5l3.2-3.6" />
      </svg>
    );
  }

  if (mode === "unlisted") {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
        <path d="M9.2 8.8 7.4 10.6a2.8 2.8 0 0 0 0 4l2 2a2.8 2.8 0 0 0 4 0l1.8-1.8" />
        <path d="m10.2 13.8 3.6-3.6" />
        <path d="M14.8 15.2 16.6 13.4a2.8 2.8 0 0 0 0-4l-2-2a2.8 2.8 0 0 0-4 0L8.8 9.2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5a13.8 13.8 0 0 1 0 17" />
      <path d="M12 3.5a13.8 13.8 0 0 0 0 17" />
    </svg>
  );
}

function getDateTimePlaceholder(language: "en" | "ja") {
  return language === "ja" ? "年/月/日 --:--" : "MM/DD/YYYY --:--";
}

const analysisProfileLabelKeys: Record<AnalysisProfileId, string> = {
  customer_feedback: "analysisProfileCustomerFeedback",
  ai_agent_log: "analysisProfileAiAgentLog",
  incident_report: "analysisProfileIncidentReport",
  governance_signal: "analysisProfileGovernanceSignal",
  general_signal: "analysisProfileGeneralSignal",
};

const signalTypeLabelKeys: Record<AnalysisSignalType, string> = {
  feedback: "analysisSignalTypeFeedback",
  product_voice: "analysisSignalTypeProductVoice",
  agent_log: "analysisSignalTypeAgentLog",
  operation: "analysisSignalTypeOperation",
  incident: "analysisSignalTypeIncident",
  internal_report: "analysisSignalTypeInternalReport",
  disaster: "analysisSignalTypeDisaster",
  safety: "analysisSignalTypeSafety",
  governance: "analysisSignalTypeGovernance",
  community: "analysisSignalTypeCommunity",
  generic: "analysisSignalTypeGeneric",
};

const analystTypeLabelKeys: Record<AnalystType, string> = {
  risk: "analysisAnalystTypeRisk",
  operations: "analysisAnalystTypeOperations",
  product: "analysisAnalystTypeProduct",
  community: "analysisAnalystTypeCommunity",
  executive: "analysisAnalystTypeExecutive",
};

const analysisTypeLabelKeys: Record<AnalysisType, string> = {
  summary: "analysisTypeSummary",
  risk: "analysisTypeRisk",
  trend: "analysisTypeTrend",
  action: "analysisTypeAction",
  sentiment: "analysisTypeSentiment",
  urgency: "analysisTypeUrgency",
  anomaly: "analysisTypeAnomaly",
  silence: "analysisTypeSilence",
  velocity: "analysisTypeVelocity",
};

function getLensProfileLabel(t: Translate, profileId?: AnalysisProfileId) {
  return profileId ? t(analysisProfileLabelKeys[profileId]) : t("publishLensInferredProfile");
}

function getSignalTypeLabel(t: Translate, signalType?: AnalysisSignalType) {
  return signalType ? t(signalTypeLabelKeys[signalType]) : t("publishLensInferredSignal");
}

function getAnalystTypeLabel(t: Translate, analystType?: AnalystType) {
  return analystType ? t(analystTypeLabelKeys[analystType]) : t("analysisAnalystTypeOperations");
}

function getAnalysisTypeLabel(t: Translate, analysisType?: AnalysisType) {
  return analysisType ? t(analysisTypeLabelKeys[analysisType]) : t("analysisTypeSummary");
}

function getLensActionCopy(t: Translate, signalType?: AnalysisSignalType, analysisType?: AnalysisType) {
  if (signalType === "disaster") {
    return t("publishLensActionDisaster");
  }
  if (signalType === "incident") {
    return t("publishLensActionIncident");
  }
  if (signalType === "feedback") {
    return t("publishLensActionFeedback");
  }
  if (signalType === "product_voice") {
    return t("publishLensActionProductVoice");
  }
  if (signalType === "operation" || signalType === "agent_log" || analysisType === "anomaly") {
    return t("publishLensActionOperations");
  }
  if (signalType === "internal_report") {
    return t("publishLensActionInternalReport");
  }
  return t("publishLensActionDefault");
}

export function PublishStep({
  t,
  language,
  saving,
  registeringOnSui,
  error,
  failure,
  diagnosticsCopied,
  savedForm,
  title,
  description,
  headerImage,
  headerLogo,
  fields,
  sections,
  analysisProfileId,
  signalType,
  analystType,
  analysisType,
  visibility,
  identityPolicy,
  accessMode,
  nftGate,
  locationRequirement,
  encryptSubmissions,
  responseOpenAtCustom,
  responseDeadlinePreset,
  responseDeadlineCustomAt,
  mobilePane,
  isReadyToPublish,
  publicPath,
  publicUrl,
  encryptionWarnings,
  showPublishSuccessView,
  showWalrusDiagnostics,
  isGuestDraftMode,
  isConnected,
  currentWalletName,
  accountAddress,
  storageMode,
  uploadRelayUrl,
  storageRuntimeMode,
  storageRuntimeNotice,
  storageRuntimeDiagnostics,
  walrusCostEstimate,
  displayMode = "classic",
  canManageProjects,
  selectedProjectId,
  selectedProject,
  projects,
  projectState,
  selectedTemplateKey,
  onSetMobilePane,
  onSelectProject,
  onChangeVisibility,
  onChangeIdentityPolicy,
  onChangeAccessMode,
  onChangeNftGatePreset,
  onChangeNftGate,
  onChangeLocationRequirement,
  onToggleEncryptSubmissions,
  onChangeResponseOpenAtCustom,
  onChangeResponseDeadlinePreset,
  onChangeResponseDeadlineCustomAt,
  onRegisterOnSui,
  onCopyDiagnostics,
  onBack,
}: PublishStepProps) {
  void publicPath;
  void publicUrl;
  void identityPolicy;
  void onChangeIdentityPolicy;
  const isRegisteredOnSui = Boolean(savedForm?.isOnchain && typeof savedForm.onchainFormId === "number");
  const isMirrorMode = displayMode === "mirror";
  const hideLivePreview = isMirrorMode;
  const isLocalOnlyForm = Boolean(savedForm?.blobId && isLocalFallbackBlob(savedForm.blobId));
  const showFocusedSuccessCard = Boolean(savedForm && showPublishSuccessView);
  const beaconScrollRef = useRef<HTMLDivElement | null>(null);
  const shouldShowWalrusDiagnostics =
    showWalrusDiagnostics ||
    Boolean(storageRuntimeNotice) ||
    Boolean(storageRuntimeDiagnostics);
  const storageModeLabel = savedForm
    ? isLocalOnlyForm
      ? t("localMode")
      : t("walrusMode")
    : t("localWalrusMode");
  const visibleSelectedProject = canManageProjects ? selectedProject : null;
  const showLocationRequirementControls = selectedTemplateKey === "disaster-checkin";
  const publishReadyBody = isGuestDraftMode ? t("guestDraftPublishBody") : t("publishReadyBody");
  const selectedNftPresetId = nftGate.presetId ?? CUSTOM_NFT_PRESET_ID;
  const collectionPresetLabel = getNftGatePresetLabel(selectedNftPresetId);
  const selectedNftPresetArt =
    selectedNftPresetId === PRIME_MACHIN_PRESET_ID
      ? "/nft/prime.avif"
      : selectedNftPresetId === TALLY_PRESET_ID
        ? "/nft/tally.webp"
        : "";
  const [ownedTypesCopied, setOwnedTypesCopied] = useState(false);
  const dateTimeInputLang = language === "ja" ? "ja-JP" : "en-US";
  const dateTimePlaceholder = getDateTimePlaceholder(language);
  const lensProfileLabel = getLensProfileLabel(t, analysisProfileId);
  const lensSignalLabel = getSignalTypeLabel(t, signalType);
  const lensOperatorLabel = getAnalystTypeLabel(t, analystType);
  const lensAnalysisLabel = getAnalysisTypeLabel(t, analysisType);
  const deadlineOptions: Array<{ value: ResponseDeadlinePreset; label: string }> = [
    { value: "none", label: t("responseDeadlineNone") },
    { value: "1h", label: t("responseDeadlineOneHour") },
    { value: "24h", label: t("responseDeadlineTwentyFourHours") },
    { value: "7d", label: t("responseDeadlineSevenDays") },
    { value: "30d", label: t("responseDeadlineThirtyDays") },
    { value: "custom", label: t("responseDeadlineCustom") },
  ];
  const accessControlOptions: Array<{
    value: FormAccessMode;
    label: string;
    description: string;
  }> = [
    {
      value: "public",
      label: "Public",
      description: "Anyone with the link can view and submit",
    },
    {
      value: "wallet_required",
      label: "Wallet Required",
      description: "Connected wallet required",
    },
    {
      value: "nft_required",
      label: "NFT Holders Only",
      description: "Only holders of a selected NFT can view and submit",
    },
  ];
  const nftDiagnostics = useOwnedSuiObjects(accountAddress, {
    enabled: accessMode === "nft_required" && Boolean(accountAddress),
  });
  const discoveredOwnedTypes = useMemo(() => {
    const uniqueTypes = new Set<string>();
    for (const entry of nftDiagnostics.data ?? []) {
      const type = entry.data?.type?.trim();
      if (type) {
        uniqueTypes.add(type);
      }
    }
    return [...uniqueTypes].sort((left, right) => left.localeCompare(right));
  }, [nftDiagnostics.data]);
  const activeStructType = nftGate.structType.trim();
  const matchedOwnedObjects = useMemo(() => {
    if (!activeStructType) {
      return 0;
    }
    return (nftDiagnostics.data ?? []).filter((entry) => entry.data?.type?.trim() === activeStructType).length;
  }, [activeStructType, nftDiagnostics.data]);
  const nftDiagnosticsError =
    nftDiagnostics.error instanceof Error ? nftDiagnostics.error.message : nftDiagnostics.error ? String(nftDiagnostics.error) : "";

  function formatBytes(bytes: number) {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatTokenAmount(value: number | null, symbol: "WAL" | "SUI") {
    if (value === null) {
      return t("walrusCostUnavailable");
    }
    const decimals = value < 0.1 ? 3 : value < 10 ? 2 : 1;
    return `~${value.toFixed(decimals)} ${symbol}`;
  }

  function formatActualTokenAmount(value: number, symbol: "WAL" | "SUI") {
    const decimals = value < 0.1 ? 3 : value < 10 ? 2 : 1;
    return `${value.toFixed(decimals)} ${symbol}`;
  }

  function getWalrusCostEstimateNote(estimate: WalrusCostEstimate) {
    if (estimate.status === "local-fallback") {
      return t("walrusCostLocalFallbackNote");
    }
    if (estimate.status === "relay-unavailable") {
      return t("walrusCostRelayUnavailableNote");
    }
    return estimate.storageMode === "publisher"
      ? t("walrusCostPublisherNote")
      : t("walrusCostRelayNote");
  }

  function getWalrusCostEstimateStatusLabel(estimate: WalrusCostEstimate) {
    if (estimate.status === "ready") {
      return t("walrusCostEstimateReady");
    }
    if (estimate.status === "local-fallback") {
      return t("storageLocalFallback");
    }
    return t("walrusCostEstimatePartial");
  }
  function getEncryptionWarningMessage(warning: EncryptionReadinessWarning) {
    switch (warning.kind) {
      case "project-missing":
        return t("encryptionProjectMissing");
      case "seal-env-incomplete":
        return t("encryptionSealIncomplete");
      case "walrus-write-unavailable":
        return t("encryptionWalrusWriteUnavailable");
      case "network-mismatch":
        return t("encryptionNetworkMismatch", {
          endpoint: warning.endpoint ?? "",
          detectedNetwork: warning.detectedNetwork ?? "",
          configuredNetwork: warning.configuredNetwork ?? "",
        });
      default:
        return warning.message;
    }
  }

  useEffect(() => {
    if (!showFocusedSuccessCard || !savedForm?.manifestBlobId) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      beaconScrollRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
    return () => window.clearTimeout(timeoutId);
  }, [savedForm?.manifestBlobId, showFocusedSuccessCard]);

  function triggerWalletReconnect() {
    const walletButton = document.querySelector<HTMLButtonElement>(".wallet-connect-shell button");
    walletButton?.click();
    walletButton?.focus();
  }

  function focusPublishButton() {
    const publishButton = document.querySelector<HTMLButtonElement>(".publish-cta-button");
    publishButton?.focus();
  }

  async function copyOwnedObjectTypes() {
    if (!discoveredOwnedTypes.length || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(discoveredOwnedTypes.join("\n"));
      setOwnedTypesCopied(true);
      window.setTimeout(() => setOwnedTypesCopied(false), 1500);
    } catch {
      setOwnedTypesCopied(false);
    }
  }

  function applyOwnedObjectType(nextStructType: string) {
    if (nextStructType === PRIME_MACHIN_STRUCT_TYPE) {
      onChangeNftGatePreset(PRIME_MACHIN_PRESET_ID);
      return;
    }
    onChangeNftGatePreset(CUSTOM_NFT_PRESET_ID);
    onChangeNftGate({
      structType: nextStructType,
      collectionLabel: undefined,
    });
  }

  const failureActions =
    failure?.kind === "wallet_disconnected"
      ? [{ key: "reconnect", label: t("reconnectWallet"), onClick: triggerWalletReconnect }]
      : failure?.kind === "registry_failed"
        ? [{ key: "retry-registry", label: t("retryRegistryStep"), onClick: onRegisterOnSui, disabled: registeringOnSui }]
        : failure?.retryable
          ? [{ key: "retry", label: t("retryLabel"), onClick: focusPublishButton }]
          : [];
  const failureGuidance = failure
    ? hasInconsistentPublishState(failure)
      ? t("publishIncompleteStateGuidance")
      : failure.uploadSucceeded && !failure.registryUpdated
        ? t("publishRecoveryPartialGuidance")
        : failure.noDataSubmitted
          ? t("publishFailedNoDataGuidance")
          : undefined
    : undefined;

  return (
    <section
      className={`composer-builder-grid composer-builder-grid-preview ${hideLivePreview ? "is-mirror-publish" : ""} ${
        showFocusedSuccessCard ? "is-focused-success" : ""
      }`}
    >
      {!showFocusedSuccessCard && !hideLivePreview ? (
        <div className="composer-mobile-tabs" role="tablist" aria-label="Builder view">
          <button type="button" className={`composer-mobile-tab ${mobilePane === "editor" ? "is-active" : ""}`} onClick={() => onSetMobilePane("editor")}>
            {t("editorTab")}
          </button>
          <button type="button" className={`composer-mobile-tab ${mobilePane === "preview" ? "is-active" : ""}`} onClick={() => onSetMobilePane("preview")}>
            {t("previewTab")}
          </button>
        </div>
      ) : null}

      <div className={`composer-builder-column composer-editor-column ${!hideLivePreview && mobilePane === "preview" ? "is-hidden-mobile" : ""}`}>
        <section className="panel composer-section-card composer-publish-panel composer-step-card">
          <div className="section-row">
            <div>
              <p className="eyebrow">Step 4</p>
              <h2>{savedForm ? t("formPublished") : t("publishReadyTitle")}</h2>
              <p className="muted">{savedForm ? t("publishSavedModeBody") : publishReadyBody}</p>
            </div>
            {!savedForm ? (
              <div className="publish-action-stack">
                {walrusCostEstimate ? (
                  <div
                    className={`publish-cost-inline is-${walrusCostEstimate.status}`}
                    title={getWalrusCostEstimateNote(walrusCostEstimate)}
                    aria-label={`${t("walrusCostEstimateTitle")}: ${getWalrusCostEstimateStatusLabel(walrusCostEstimate)}`}
                  >
                    <span>{t("walrusCostEstimateEyebrow")}</span>
                    <strong>{formatTokenAmount(walrusCostEstimate.estimatedWal, "WAL")}</strong>
                    <small>{formatTokenAmount(walrusCostEstimate.estimatedSui, "SUI")}</small>
                    <small>{formatBytes(walrusCostEstimate.payloadBytes)}</small>
                  </div>
                ) : null}
                <button
                  type="submit"
                  className="primary-button publish-cta-button"
                  disabled={saving || !isReadyToPublish}
                >
                  {saving ? t("builderSaving") : t("builderSave")}
                </button>
              </div>
            ) : null}
          </div>

          {!savedForm ? (
            <div className="publish-quick-controls">
              <section className="publish-visibility-quick-switch" aria-label={t("formVisibilityLabel")}>
                <span className="publish-visibility-label">{t("visibilityTitle")}</span>
                <div className="publish-quick-card-grid publish-quick-card-grid-three">
                  {([
                    ["private", t("visibilityPrivate")],
                    ["unlisted", t("visibilityUnlisted")],
                    ["public", t("visibilityPublicExplore")],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`publish-visibility-chip publish-quick-choice-card is-${value} ${visibility === value ? "is-active" : ""}`}
                      onClick={() => onChangeVisibility(value)}
                      aria-pressed={visibility === value}
                    >
                      <span className="publish-quick-choice-icon" aria-hidden="true">
                        <VisibilityGlyph mode={value} />
                      </span>
                      <span className="publish-quick-choice-copy">
                        <strong>{label}</strong>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="publish-seal-quick-switch" aria-label={t("encryptSubmissions")}>
                <span className="publish-visibility-label">{t("privateSignalEyebrow")}</span>
                <button
                  type="button"
                  className={`publish-seal-toggle publish-quick-choice-card ${encryptSubmissions ? "is-locked" : "is-open"}`}
                  onClick={() => onToggleEncryptSubmissions(!encryptSubmissions)}
                  aria-pressed={encryptSubmissions}
                  title={encryptSubmissions ? t("encryptSubmissionsReviewHelp") : t("openFormEncryptionHelp")}
                >
                  <span className="publish-quick-choice-icon" aria-hidden="true">
                    <SignalPrivacyIcon locked={encryptSubmissions} />
                  </span>
                  <span className="publish-quick-choice-copy">
                    <strong>{encryptSubmissions ? "Seal on" : "Open"}</strong>
                  </span>
                </button>
              </section>
              <div className="publish-visibility-quick-switch publish-response-window-card" aria-label={t("responseWindowTitle")}>
                <span className="publish-visibility-label">{t("responseWindowTitle")}</span>
                <div className="publish-response-window-grid">
                  <label>
                    <span>{t("responseOpenAtLabel")}</span>
                    <span className={`publish-datetime-shell${responseOpenAtCustom ? "" : " is-empty"}`}>
                      <input
                        type="datetime-local"
                        className={`publish-datetime-input${responseOpenAtCustom ? "" : " is-empty"}`}
                        lang={dateTimeInputLang}
                        value={responseOpenAtCustom}
                        onChange={(event) => onChangeResponseOpenAtCustom(event.target.value)}
                      />
                      {!responseOpenAtCustom ? <span className="publish-datetime-placeholder">{dateTimePlaceholder}</span> : null}
                    </span>
                  </label>
                  <label>
                    <span>{t("responseDeadlineLabel")}</span>
                    <select
                      value={responseDeadlinePreset}
                      onChange={(event) => {
                        const nextPreset = event.target.value as ResponseDeadlinePreset;
                        onChangeResponseDeadlinePreset(nextPreset);
                        if (nextPreset === "custom" && !responseDeadlineCustomAt) {
                          onChangeResponseDeadlineCustomAt(toDateTimeLocalValue(Date.now() + 60 * 60 * 1000));
                        }
                      }}
                    >
                      {deadlineOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {responseDeadlinePreset === "custom" ? (
                    <label className="publish-response-window-custom-deadline">
                      <span>{t("responseDeadlineCustomAt")}</span>
                      <span className={`publish-datetime-shell${responseDeadlineCustomAt ? "" : " is-empty"}`}>
                        <input
                          type="datetime-local"
                          className={`publish-datetime-input${responseDeadlineCustomAt ? "" : " is-empty"}`}
                          lang={dateTimeInputLang}
                          value={responseDeadlineCustomAt}
                          min={toDateTimeLocalValue(Date.now() + 60 * 1000)}
                          onChange={(event) => onChangeResponseDeadlineCustomAt(event.target.value)}
                        />
                        {!responseDeadlineCustomAt ? (
                          <span className="publish-datetime-placeholder">{dateTimePlaceholder}</span>
                        ) : null}
                      </span>
                    </label>
                  ) : null}
                </div>
                <p className="muted">{t("responseDeadlineHelp")}</p>
              </div>
              {showLocationRequirementControls ? (
                <div className="publish-identity-quick-switch" aria-label={t("locationRequirementTitle")}>
                  <span className="publish-visibility-label">{t("locationRequirementTitle")}</span>
                  <button
                    type="button"
                    className={`publish-identity-toggle is-${locationRequirement}`}
                    onClick={() =>
                      onChangeLocationRequirement(locationRequirement === "required" ? "optional" : "required")
                    }
                    aria-pressed={locationRequirement === "required"}
                    title={t("locationRequirementHelp")}
                  >
                    <span>{locationRequirement === "required" ? t("locationRequirementRequired") : t("locationRequirementOptional")}</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {!showFocusedSuccessCard ? (
            <section className="panel composer-settings-card composer-settings-card-visual publish-access-panel">
              <div className="section-row composer-settings-visual-heading">
                <span className="composer-settings-visual-icon composer-settings-visual-icon-identity">
                  <RoutingIcon type="identity" />
                </span>
                <div>
                  <p className="eyebrow">{t("responderIdentityEyebrow")}</p>
                  <h3>{t("publishAccessSettingsTitle")}</h3>
                  <p className="muted">{t("publishAccessSettingsDescription")}</p>
                </div>
              </div>
              <div className="publish-access-layout">
                <div className="publish-access-main">
                  <section className="publish-access-block" aria-label="access-control-panel">
                    <div className="publish-access-block-heading">
                      <div>
                        <h4>{t("publishAccessControlTitle")}</h4>
                        <p className="muted">{t("publishAccessControlDescription")}</p>
                      </div>
                      <span className="publish-access-badge">{t("requiredLabel")}</span>
                    </div>
                    <fieldset className="composer-radio-field">
                      <legend className="sr-only">{t("navAccess")}</legend>
                      <div className="composer-radio-options composer-radio-options-three publish-access-card-grid">
                        {accessControlOptions.map((option) => (
                          <label
                            key={option.value}
                            className={`composer-radio-option composer-radio-option-stacked publish-access-card publish-access-card-${option.value}${accessMode === option.value ? " is-selected" : ""}`}
                          >
                            <input
                              type="radio"
                              name="submissionAccess"
                              value={option.value}
                              checked={accessMode === option.value}
                              onChange={() => onChangeAccessMode(option.value)}
                            />
                            <span className="publish-access-card-icon" aria-hidden="true">
                              <AccessModeGlyph mode={option.value} />
                            </span>
                            <span>
                              <strong>
                                {option.value === "public"
                                  ? t("publishAccessModePublic")
                                  : option.value === "wallet_required"
                                    ? t("publishAccessModeWallet")
                                    : t("publishAccessModeNft")}
                              </strong>
                              <small>
                                {option.value === "public"
                                  ? t("publishAccessModePublicDescription")
                                  : option.value === "wallet_required"
                                    ? t("publishAccessModeWalletDescriptionLong")
                                    : t("publishAccessModeNftDescriptionLong")}
                              </small>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    {accessMode === "nft_required" ? (
                      <div className="publish-access-note" role="note">
                        <span className="publish-access-note-icon" aria-hidden="true">
                          i
                        </span>
                        <p>{t("publishAccessNftNote")}</p>
                      </div>
                    ) : null}
                  </section>

                  {accessMode === "nft_required" ? (
                    <section className="publish-access-block publish-nft-settings" aria-label="nft-gate-settings">
                      <div className="publish-access-block-heading">
                        <div>
                          <h4>{t("publishNftSettingsTitle")}</h4>
                          <p className="muted">{t("publishNftSettingsDescription")}</p>
                        </div>
                        <span className="publish-access-badge publish-access-badge-accent">{t("publishNftSettingsActiveBadge")}</span>
                      </div>
                      <label>
                        <span>{t("publishNftCollectionPresetLabel")}</span>
                        <span className={`publish-nft-preset-select-shell${selectedNftPresetArt ? " has-collection-art" : ""}`}>
                          {selectedNftPresetArt ? (
                            <img
                              className="publish-nft-preset-art"
                              src={selectedNftPresetArt}
                              alt=""
                              aria-hidden="true"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : null}
                          <select
                            value={selectedNftPresetId}
                            className={selectedNftPresetArt ? "has-collection-art" : undefined}
                            onChange={(event) => onChangeNftGatePreset(event.target.value as FormNftGate["presetId"])}
                          >
                            <option value={PRIME_MACHIN_PRESET_ID}>Prime Machin Holders</option>
                            <option value={TALLY_PRESET_ID}>Tally Holders</option>
                            <option value={CUSTOM_NFT_PRESET_ID}>Custom Struct Type</option>
                          </select>
                        </span>
                      </label>
                      <p className="publish-nft-hint">
                        {selectedNftPresetId === PRIME_MACHIN_PRESET_ID
                          ? t("publishNftPrimePresetHint")
                          : selectedNftPresetId === TALLY_PRESET_ID
                            ? t("publishNftTallyPresetHint")
                          : t("publishNftCustomPresetHint")}
                      </p>
                      <label>
                        <span>{t("publishNftStructTypeLabel")}</span>
                        <input
                          type="text"
                          value={nftGate.structType}
                          onChange={(event) => onChangeNftGate({ structType: event.target.value })}
                          placeholder="0x...::collection::PrimeMachin"
                        />
                      </label>
                      <div className="publish-nft-count-row">
                        <label>
                          <span>{t("publishNftRequiredCountLabel")}</span>
                          <div className="publish-nft-count-control">
                            <button
                              type="button"
                              onClick={() =>
                                onChangeNftGate({ requiredCount: Math.max(1, nftGate.requiredCount - 1) })
                              }
                              aria-label="Decrease required NFT count"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={nftGate.requiredCount}
                              onChange={(event) =>
                                onChangeNftGate({ requiredCount: Math.max(1, Number(event.target.value) || 1) })
                              }
                            />
                            <button
                              type="button"
                              onClick={() => onChangeNftGate({ requiredCount: nftGate.requiredCount + 1 })}
                              aria-label="Increase required NFT count"
                            >
                              +
                            </button>
                          </div>
                        </label>
                        <p className="muted">{t("publishNftRequiredCountHelp")}</p>
                      </div>
                      <div className="publish-nft-toggle-grid">
                        <label className="publish-nft-toggle-card">
                          <input
                            type="checkbox"
                            checked={nftGate.gateViewing}
                            onChange={(event) => onChangeNftGate({ gateViewing: event.target.checked })}
                          />
                          <span>
                            <strong>{t("publishNftGateViewingTitle")}</strong>
                            <small>{t("publishNftGateViewingDescription")}</small>
                          </span>
                        </label>
                        <label className="publish-nft-toggle-card">
                          <input
                            type="checkbox"
                            checked={nftGate.gateSubmission}
                            onChange={(event) => onChangeNftGate({ gateSubmission: event.target.checked })}
                          />
                          <span>
                            <strong>{t("publishNftGateSubmissionTitle")}</strong>
                            <small>{t("publishNftGateSubmissionDescription")}</small>
                          </span>
                        </label>
                      </div>
                      <details className="publish-nft-diagnostics collapsible-detail-card" aria-label="nft-owned-object-diagnostics">
                        <summary className="publish-nft-diagnostics-summary-toggle">
                          <div className="publish-access-block-heading">
                            <div>
                              <h4>{t("publishNftDiagnosticsTitle")}</h4>
                              <p className="muted">{t("publishNftDiagnosticsDescription")}</p>
                            </div>
                            <span className="publish-access-badge">{nftGate.network}</span>
                          </div>
                        </summary>
                        {!accountAddress ? (
                          <p className="muted">{t("publishNftDiagnosticsConnectPrompt")}</p>
                        ) : nftDiagnostics.isLoading ? (
                          <p className="muted">{t("publishNftDiagnosticsChecking")}</p>
                        ) : nftDiagnosticsError ? (
                          <p className="error-text">{nftDiagnosticsError || t("publishNftDiagnosticsErrorFallback")}</p>
                        ) : (
                          <>
                            <div
                              className="publish-nft-diagnostic-summary"
                              role="list"
                              aria-label={t("publishNftDiagnosticsSummaryLabel")}
                            >
                              <span className="publish-nft-diagnostic-stat" role="listitem">
                                <small>{t("publishNftDiagnosticsOwnedObjectsLabel")}</small>
                                <strong>{nftDiagnostics.data?.length ?? 0}</strong>
                              </span>
                              <span className="publish-nft-diagnostic-stat" role="listitem">
                                <small>{t("publishNftDiagnosticsDiscoveredTypesLabel")}</small>
                                <strong>{discoveredOwnedTypes.length}</strong>
                              </span>
                              <span className="publish-nft-diagnostic-stat" role="listitem">
                                <small>{t("publishNftDiagnosticsMatchingObjectsLabel")}</small>
                                <strong>{matchedOwnedObjects}</strong>
                              </span>
                            </div>
                            <div
                              className={`publish-nft-diagnostic-status${
                                !activeStructType
                                  ? " is-neutral"
                                  : matchedOwnedObjects > 0
                                    ? " is-match"
                                    : " is-missing"
                              }`}
                            >
                              <strong>
                                {!activeStructType
                                  ? t("publishNftDiagnosticsNoStructTypeTitle")
                                  : matchedOwnedObjects > 0
                                    ? t("publishNftDiagnosticsStructTypeMatchedTitle")
                                    : t("publishNftDiagnosticsStructTypeMissingTitle")}
                              </strong>
                              <small>
                                {!activeStructType
                                  ? t("publishNftDiagnosticsNoStructTypeBody")
                                  : matchedOwnedObjects > 0
                                    ? t("publishNftDiagnosticsStructTypeMatchedBody")
                                    : t("publishNftDiagnosticsStructTypeMissingBody")}
                              </small>
                            </div>
                            {discoveredOwnedTypes.length ? (
                              <>
                                <div className="publish-nft-diagnostic-actions">
                                  <p className="muted">{t("publishNftDiagnosticsDiscoveredTypesHelp")}</p>
                                  <button type="button" className="ghost-button" onClick={() => void copyOwnedObjectTypes()}>
                                    {ownedTypesCopied ? t("copiedLabel") : t("publishNftDiagnosticsCopyTypes")}
                                  </button>
                                </div>
                                <div className="publish-nft-diagnostic-list">
                                  {discoveredOwnedTypes.map((type) => (
                                    <div key={type} className="publish-nft-diagnostic-item">
                                      <code>{type}</code>
                                      <div className="publish-nft-diagnostic-item-actions">
                                        {type === activeStructType ? (
                                          <span className="signal-chip signal-chip-success">{t("publishNftDiagnosticsActiveTypeBadge")}</span>
                                        ) : null}
                                        <button
                                          type="button"
                                          className="ghost-button"
                                          onClick={() => applyOwnedObjectType(type)}
                                        >
                                          {t("publishNftDiagnosticsUseType")}
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <p className="muted">{t("publishNftDiagnosticsNoOwnedTypes")}</p>
                            )}
                          </>
                        )}
                      </details>
                      <p className="publish-nft-footnote">{t("publishNftFootnote")}</p>
                    </section>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          <p className="wallet-inline-note">
            {t("formOwnerLabel")}:{" "}
            {accountAddress ? (
              <SuiAddressDisplay address={accountAddress} className="wallet-inline-address" showTooltip />
            ) : (
              t("walletPublishHint")
            )}
          </p>
          {isGuestDraftMode && !savedForm ? (
            <p className="wallet-inline-note">{t("guestDraftPublishWalletRequired")}</p>
          ) : null}

          {!savedForm ? (
            <section className="publish-signal-lens-card" aria-label={t("publishLensAriaLabel")}>
              <div>
                <p className="eyebrow">{t("publishLensEyebrow")}</p>
                <h3>{lensProfileLabel}</h3>
                <p>{getLensActionCopy(t, signalType, analysisType)}</p>
              </div>
              <div className="publish-signal-lens-grid">
                <span>
                  <small>{t("publishLensSignalLabel")}</small>
                  <strong>{lensSignalLabel}</strong>
                </span>
                <span>
                  <small>{t("publishLensOperatorLabel")}</small>
                  <strong>{lensOperatorLabel}</strong>
                </span>
                <span>
                  <small>{t("publishLensAnalysisLabel")}</small>
                  <strong>{lensAnalysisLabel}</strong>
                </span>
              </div>
            </section>
          ) : null}

          {shouldShowWalrusDiagnostics ? (
            <section className="answer-card answer-card-plain publish-diagnostics-card">
              <div className="section-row publish-diagnostics-header">
                <div>
                  <p className="eyebrow">Walrus Runtime</p>
                  <h3>{t("publishDiagnosticsTitle")}</h3>
                </div>
              </div>
              <div className="metadata-list publish-diagnostics-list">
                <div className="metadata-row">
                  <span>{t("walletLabel")}</span>
                  <strong>{isConnected ? currentWalletName ?? t("connected") : t("notConnected")}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("addressLabel")}</span>
                  {accountAddress ? (
                    <SuiAddressDisplay address={accountAddress} className="wallet-inline-address" showTooltip />
                  ) : (
                    <strong>{t("notConnected")}</strong>
                  )}
                </div>
                <div className="metadata-row">
                  <span>{t("networkLabel")}</span>
                  <strong>{SUI_NETWORK}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("storageModeDetailLabel")}</span>
                  <strong>{storageMode}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("uploadRelayLabel")}</span>
                  <strong>{uploadRelayUrl || t("notConfigured")}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("runtimeStateLabel")}</span>
                  <strong>{storageRuntimeMode}</strong>
                </div>
                {storageRuntimeNotice ? (
                  <div className="metadata-row">
                    <span>{t("walrusNoticeLabel")}</span>
                    <strong>{storageRuntimeNotice}</strong>
                  </div>
                ) : null}
                {storageRuntimeDiagnostics ? (
                  <div className="metadata-row">
                    <span>{t("walrusStageLabel")}</span>
                    <strong>{formatWalrusFailureStage(storageRuntimeDiagnostics.stage)}</strong>
                  </div>
                ) : null}
                {storageRuntimeDiagnostics?.digest ? (
                  <div className="metadata-row">
                    <span>{t("txDigestLabel")}</span>
                    <strong>{storageRuntimeDiagnostics.digest}</strong>
                  </div>
                ) : null}
                {storageRuntimeDiagnostics?.lastRpcError ? (
                  <div className="metadata-row">
                    <span>{t("lastRpcErrorLabel")}</span>
                    <strong>{storageRuntimeDiagnostics.lastRpcError}</strong>
                  </div>
                ) : null}
                {storageRuntimeDiagnostics?.source ? (
                  <div className="metadata-row">
                    <span>Failure source</span>
                    <strong>{storageRuntimeDiagnostics.source}</strong>
                  </div>
                ) : null}
                {typeof storageRuntimeDiagnostics?.status === "number" ? (
                  <div className="metadata-row">
                    <span>HTTP status</span>
                    <strong>{storageRuntimeDiagnostics.status}</strong>
                  </div>
                ) : null}
                {storageRuntimeDiagnostics?.errorName ? (
                  <div className="metadata-row">
                    <span>Error class</span>
                    <strong>{storageRuntimeDiagnostics.errorName}</strong>
                  </div>
                ) : null}
                {storageRuntimeDiagnostics?.causeMessage ? (
                  <div className="metadata-row">
                    <span>Cause</span>
                    <strong>{storageRuntimeDiagnostics.causeMessage}</strong>
                  </div>
                ) : null}
                {storageRuntimeDiagnostics?.url ? (
                  <div className="metadata-row">
                    <span>Request URL</span>
                    <strong>{storageRuntimeDiagnostics.url}</strong>
                  </div>
                ) : null}
                {storageRuntimeDiagnostics?.responseBody ? (
                  <div className="metadata-row">
                    <span>Response body</span>
                    <strong>{storageRuntimeDiagnostics.responseBody}</strong>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {!shouldShowWalrusDiagnostics && storageRuntimeNotice ? (
            <section className="answer-card composer-friendly-storage-notice">
              <div className="metadata-row">
                <span>{t("storageNoticeLabel")}</span>
                <strong>{t("localStorageNoticeBody")}</strong>
              </div>
            </section>
          ) : null}

          {!showFocusedSuccessCard ? (
            <details className="composer-advanced-settings">
              <summary>{t("advanced")}</summary>
              <div className="stack composer-advanced-grid">
                <section className="panel composer-settings-card composer-settings-card-visual">
                  <div className="section-row composer-settings-visual-heading">
                    <span className="composer-settings-visual-icon composer-settings-visual-icon-registry">
                      <RoutingIcon type="registry" />
                    </span>
                    <div>
                      <p className="eyebrow">{t("projectRoutingEyebrow")}</p>
                      <h3>{t("signalRegistryTitle")}</h3>
                    </div>
                  </div>
                  <label>
                    <span>{canManageProjects ? t("selectedProjectLabel") : t("storageRouteLabel")}</span>
                    <select
                      value={canManageProjects ? selectedProjectId : ""}
                      onChange={(event) => onSelectProject(event.target.value)}
                      disabled={!canManageProjects}
                    >
                      <option value="">Walrus</option>
                      {canManageProjects
                        ? projects.map((project) => (
                            <option key={project.objectId} value={project.objectId}>
                              {project.name}
                            </option>
                          ))
                        : null}
                    </select>
                  </label>
                  <p className="muted">
                    {visibleSelectedProject
                      ? t("projectRoutingSelectedHelp", { name: visibleSelectedProject.name })
                      : t("projectRoutingWalrusHelp")}
                  </p>
                  {canManageProjects && projectState ? <p className="muted">{projectState}</p> : null}
                  {canManageProjects ? <p className="muted">{t("suiRegistrationDeferredNotice")}</p> : null}
                </section>

                {showLocationRequirementControls ? (
                  <section className="panel composer-settings-card composer-settings-card-visual">
                    <div className="section-row composer-settings-visual-heading">
                      <span className="composer-settings-visual-icon composer-settings-visual-icon-identity">
                        <RoutingIcon type="identity" />
                      </span>
                      <div>
                        <p className="eyebrow">{t("locationRequirementEyebrow")}</p>
                        <h3>{t("locationRequirementTitle")}</h3>
                      </div>
                    </div>
                    <fieldset className="composer-radio-field">
                      <legend>{t("locationRequirementLabel")}</legend>
                      <div className="composer-radio-options">
                        {([
                          ["optional", t("locationRequirementOptional")],
                          ["required", t("locationRequirementRequired")],
                        ] as const).map(([value, label]) => (
                          <label
                            key={value}
                            className={`composer-radio-option${locationRequirement === value ? " is-selected" : ""}`}
                          >
                            <input
                              type="radio"
                              name="locationRequirement"
                              value={value}
                              checked={locationRequirement === value}
                              onChange={() => onChangeLocationRequirement(value)}
                            />
                            <span className="composer-radio-mark" aria-hidden="true" />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <p className="muted">{t("locationRequirementHelp")}</p>
                  </section>
                ) : null}
                {shouldShowWalrusDiagnostics ? (
                  <section className="panel composer-settings-card">
                    <div className="section-row">
                      <div>
                        <p className="eyebrow">{t("proofBackedRoutingEyebrow")}</p>
                        <h3>{t("storageAndSignatureTitle")}</h3>
                      </div>
                    </div>
                    <div className="composer-capability-list muted">
                      <p>{t("walrusStorageLine")}</p>
                      <p>{t("suiSignatureLine")}</p>
                    </div>
                  </section>
                ) : null}
              </div>
            </details>
          ) : null}

          {error ? <p className="error-text">{error}</p> : null}
          {failure && failure.kind !== "wallet_rejected" ? (
            <CriticalFailurePanel
              failure={failure}
              title={t("publishRecoveryTitle")}
              copyLabel={t("copyDiagnostics")}
              copiedLabel={t("diagnosticsCopied")}
              guidance={failureGuidance}
              copied={diagnosticsCopied}
              actions={failureActions}
              onCopyDiagnostics={onCopyDiagnostics}
            />
          ) : null}

          {savedForm ? (
            <div className={`success-card composer-success-card ${showFocusedSuccessCard ? "is-focused-success" : ""}`}>
              <div className="composer-success-header">
                <div>
                  <p className="eyebrow">{t("observationRelay")}</p>
                  <h3>{t("signalActiveTitle")}</h3>
                  <p className="muted">{storageModeLabel}</p>
                </div>
                <span className="composer-live-pill">{t("observing")}</span>
              </div>

              <section className="answer-card contest-share-ready-card">
                <div className="section-row">
                  <div>
                    <p className="eyebrow">Step 3</p>
                    <h4>{isLocalOnlyForm ? t("localPreviewOnly") : t("sharePublicLink")}</h4>
                  </div>
                  <span className="signal-chip signal-chip-accent">{isLocalOnlyForm ? t("sameBrowserOnly") : t("anonymousReady")}</span>
                </div>
                <p className="muted">
                  {isLocalOnlyForm
                    ? t("localPreviewOnlyBody")
                    : t("sharePublicLinkBody")}
                </p>
                {savedForm.manifestBlobId ? (
                  <div ref={beaconScrollRef}>
                    <ShareCard
                      formId={savedForm.id}
                      blobId={savedForm.blobId}
                      createdAt={savedForm.createdAt}
                      manifestBlobId={savedForm.manifestBlobId}
                    />
                  </div>
                ) : (
                  <section className="answer-card">
                    <p className="eyebrow">{isLocalOnlyForm ? t("crossDeviceShareBlocked") : t("shareReady")}</p>
                    <h4>{isLocalOnlyForm ? t("walrusPublishRequiredBeforeSharing") : t("qrSharingUnavailable")}</h4>
                    <p className="muted">
                      {isLocalOnlyForm
                        ? t("republishAfterWalrus")
                        : t("localFallbackQrUnavailable")}
                    </p>
                  </section>
                )}
              </section>

              <div className="composer-link-grid">
                {isLocalOnlyForm ? (
                  <p className="warning-text">
                    {t("doNotShareLocalUrl")}
                  </p>
                ) : null}
                {!showFocusedSuccessCard ? (
                  <>
                    <p>
                      {t("adminPage")}: <Link to={`/dashboard?tab=review&form=${encodeURIComponent(savedForm.id)}`}>{t("adminPageCta")}</Link>
                    </p>
                    <div className="metadata-list">
                      <div className="metadata-row">
                        <span>{t("formStorageModeLabel")}</span>
                        <strong>{storageModeLabel}</strong>
                      </div>
                      {savedForm.walrusActualCost?.wal ? (
                        <div className="metadata-row">
                          <span>{t("walrusCostActualWalLabel")}</span>
                          <strong>{formatActualTokenAmount(savedForm.walrusActualCost.wal, "WAL")}</strong>
                        </div>
                      ) : null}
                      {savedForm.walrusActualCost?.sui ? (
                        <div className="metadata-row">
                          <span>{t("walrusCostActualSuiLabel")}</span>
                          <strong>{formatActualTokenAmount(savedForm.walrusActualCost.sui, "SUI")}</strong>
                        </div>
                      ) : null}
                      <div className="metadata-row">
                        <span>{t("suiRegistrationStateLabel")}</span>
                        <strong>{isRegisteredOnSui ? t("suiRegistrationStateRegistered") : t("suiRegistrationStateOptional")}</strong>
                      </div>
                      {!isRegisteredOnSui ? (
                        <div className="metadata-row">
                          <span>{t("suiRegistrationHintLabel")}</span>
                          <strong>{t("suiRegistrationHintBody")}</strong>
                        </div>
                      ) : null}
                      {savedForm.projectId && isRegisteredOnSui ? (
                        <SignalMetaRow label={t("projectLabel")} type="registry" value={savedForm.projectId} />
                      ) : null}
                      {isRegisteredOnSui ? (
                        <div className="metadata-row">
                          <span>{t("registryFormId")}</span>
                          <strong>{savedForm.onchainFormId}</strong>
                        </div>
                      ) : null}
                      <SignalMetaRow label={t("walrusBlobId")} type="blob" value={savedForm.blobId}>
                        <BlobLink blobId={savedForm.blobId} />
                      </SignalMetaRow>
                      {savedForm.manifestBlobId ? (
                        <SignalMetaRow label={t("manifestBlobId")} type="manifest" value={savedForm.manifestBlobId}>
                          <BlobLink blobId={savedForm.manifestBlobId} label={t("verifyManifestOnWalrus")} />
                          <Link to={`/m/${savedForm.manifestBlobId}`}>{t("restoreLink")}</Link>
                        </SignalMetaRow>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>

              {savedForm.projectId && !isRegisteredOnSui && !showFocusedSuccessCard ? (
                <section className="answer-card sui-optional-card">
                  <p className="eyebrow">{t("optionalSuiStep")}</p>
                  <h4>{t("registerOnSuiTitle")}</h4>
                  <p className="muted">{t("registerOnSuiBody")}</p>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={onRegisterOnSui}
                      disabled={registeringOnSui}
                    >
                      {registeringOnSui ? t("registeringOnSui") : t("registerOnSui")}
                    </button>
                    <span className="muted">{t("registerOnSuiHint")}</span>
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <p className="muted">{t("saveFormHint")}</p>
          )}

          {!showFocusedSuccessCard ? (
            <StepNavigationActions t={t} onBack={onBack} />
          ) : null}
        </section>
      </div>

      {!showFocusedSuccessCard && !hideLivePreview ? (
        <div className={`composer-builder-column composer-preview-column ${mobilePane === "editor" ? "is-hidden-mobile" : ""}`}>
          <LivePreview
            title={title}
            description={description}
            headerImage={headerImage}
            headerLogo={headerLogo}
            fields={fields}
            sections={sections}
          />
        </div>
      ) : null}
    </section>
  );
}
