import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { BlobLink } from "../../../components/BlobLink";
import { CriticalFailurePanel } from "../../../components/CriticalFailurePanel";
import { ShareCard } from "../../../components/ShareCard";
import { SignalMetaRow } from "../../../components/SignalMetaChip";
import { SuiAddressDisplay } from "../../../components/SuiAddressDisplay";
import { hasInconsistentPublishState, type CriticalFailure } from "../../../lib/criticalFailure";
import { LivePreview } from "../../../components/formBuilder/LivePreview";
import { isLocalFallbackBlob } from "../../../lib/proof";
import { SUI_NETWORK } from "../../../lib/sui";
import type { WalrusCostEstimate } from "../../../storage/walrusCostEstimate";
import { formatWalrusFailureStage, type WalrusFailureDetails } from "../../../storage/walrusDiagnostics";
import type { EncryptionReadinessWarning } from "../encryptionReadiness";
import { StepNavigationActions } from "./StepNavigationActions";
import type {
  FormField,
  FormHeaderImage,
  FormHeaderLogo,
  FormIdentityPolicy,
  FormLocationRequirement,
  FormSection,
  FormVisibility,
  DisplayMode,
  MobileBuilderPane,
  PreparedPublishForm,
  ProjectOption,
  Translate,
} from "../types";

interface PublishStepProps {
  t: Translate;
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
    source?: "url" | "upload";
    fileName?: string;
  };
  fields: FormField[];
  sections: FormSection[];
  visibility: FormVisibility;
  identityPolicy: FormIdentityPolicy;
  locationRequirement: FormLocationRequirement;
  encryptSubmissions: boolean;
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
  onChangeLocationRequirement: (value: FormLocationRequirement) => void;
  onToggleEncryptSubmissions: (value: boolean) => void;
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

function AnonymousRiskIcon() {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
      <path d="M7 10.2c.8-3 2.4-4.5 5-4.5s4.2 1.5 5 4.5" />
      <path d="M7.7 10.2h8.6l-1 3.2H8.7l-1-3.2Z" />
      <path d="M9.2 13.4c.5 1.2 1.4 2 2.8 2s2.3-.8 2.8-2" />
      <path d="M4.7 20c1.5-2.7 4-4.1 7.3-4.1s5.8 1.4 7.3 4.1" />
      <path d="m17.7 4.7 1.8-1.8M6.3 4.7 4.5 2.9" />
    </svg>
  );
}

export function PublishStep({
  t,
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
  visibility,
  identityPolicy,
  locationRequirement,
  encryptSubmissions,
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
  onChangeLocationRequirement,
  onToggleEncryptSubmissions,
  onRegisterOnSui,
  onCopyDiagnostics,
  onBack,
}: PublishStepProps) {
  void publicPath;
  void publicUrl;
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
  const isProjectEncryptedForm = Boolean(encryptSubmissions && visibleSelectedProject);
  const isPersonalEncryptedForm = Boolean(encryptSubmissions && !visibleSelectedProject);
  const encryptionScopePrimary = encryptSubmissions
    ? isProjectEncryptedForm
      ? t("projectEncryptedFormHelp", { name: visibleSelectedProject?.name ?? "" })
      : accountAddress
        ? t("personalEncryptedFormHelp")
        : t("personalEncryptedFormConnectHelp")
    : t("openFormEncryptionHelp");
  const encryptionScopeContrast = encryptSubmissions
    ? isProjectEncryptedForm
      ? t("projectEncryptedFormPersonalContrast")
      : t("personalEncryptedFormProjectContrast")
    : "";

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

          <p className="wallet-inline-note">
            {t("formOwnerLabel")}:{" "}
            {accountAddress ? (
              <SuiAddressDisplay address={accountAddress} className="wallet-inline-address" showTooltip />
            ) : (
              t("walletPublishHint")
            )}
          </p>
          {!savedForm ? (
            <div className="publish-quick-controls">
              <div className="publish-visibility-quick-switch" aria-label={t("formVisibilityLabel")}>
                <span className="publish-visibility-label">{t("visibilityTitle")}</span>
                <div className="publish-visibility-options">
                  {([
                    ["private", t("visibilityPrivate")],
                    ["unlisted", t("visibilityUnlisted")],
                    ["public", t("visibilityPublicExplore")],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`publish-visibility-chip is-${value} ${visibility === value ? "is-active" : ""}`}
                      onClick={() => onChangeVisibility(value)}
                      aria-pressed={visibility === value}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="publish-seal-quick-switch" aria-label={t("encryptSubmissions")}>
                <span className="publish-visibility-label">{t("privateSignalEyebrow")}</span>
                <button
                  type="button"
                  className={`publish-seal-toggle ${encryptSubmissions ? "is-locked" : "is-open"}`}
                  onClick={() => onToggleEncryptSubmissions(!encryptSubmissions)}
                  aria-pressed={encryptSubmissions}
                  title={encryptSubmissions ? t("encryptSubmissionsReviewHelp") : t("openFormEncryptionHelp")}
                >
                  <SignalPrivacyIcon locked={encryptSubmissions} />
                  <span>{encryptSubmissions ? "Seal on" : "Open"}</span>
                </button>
              </div>
              <div className="publish-identity-quick-switch" aria-label={t("submissionIdentityLabel")}>
                <span className="publish-visibility-label">{t("identityPolicyTitle")}</span>
                <button
                  type="button"
                  className={`publish-identity-toggle is-${identityPolicy}`}
                  onClick={() =>
                    onChangeIdentityPolicy(identityPolicy === "wallet_required" ? "anonymous_allowed" : "wallet_required")
                  }
                  aria-pressed={identityPolicy === "wallet_required"}
                  title={t("identityPolicyHelp")}
                >
                  {identityPolicy === "wallet_required" ? (
                    <span className="publish-identity-drop" aria-hidden="true">
                      💧
                    </span>
                  ) : (
                    <AnonymousRiskIcon />
                  )}
                  <span>{identityPolicy === "wallet_required" ? t("verificationRequired") : t("verificationOptional")}</span>
                </button>
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
          {isGuestDraftMode && !savedForm ? (
            <p className="wallet-inline-note">{t("guestDraftPublishWalletRequired")}</p>
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

                <section className="panel composer-settings-card composer-settings-card-visual">
                  <div className="section-row composer-settings-visual-heading">
                    <span className="composer-settings-visual-icon composer-settings-visual-icon-visibility">
                      <RoutingIcon type="visibility" />
                    </span>
                    <div>
                      <p className="eyebrow">{t("exploreRoutingEyebrow")}</p>
                      <h3>{t("visibilityTitle")}</h3>
                    </div>
                  </div>
                  <label>
                    <span>{t("formVisibilityLabel")}</span>
                    <select value={visibility} onChange={(event) => onChangeVisibility(event.target.value as FormVisibility)}>
                      <option value="private">{t("visibilityPrivate")}</option>
                      <option value="unlisted">{t("visibilityUnlisted")}</option>
                      <option value="public">{t("visibilityPublicExplore")}</option>
                    </select>
                  </label>
                  <p className="muted">
                    {t("visibilityHelp")}
                  </p>
                </section>

                <section className="panel composer-settings-card composer-settings-card-visual">
                  <div className="section-row composer-settings-visual-heading">
                    <span className="composer-settings-visual-icon composer-settings-visual-icon-identity">
                      <RoutingIcon type="identity" />
                    </span>
                    <div>
                      <p className="eyebrow">{t("responderIdentityEyebrow")}</p>
                      <h3>{t("identityPolicyTitle")}</h3>
                    </div>
                  </div>
                  <fieldset className="composer-radio-field">
                    <legend>{t("submissionIdentityLabel")}</legend>
                    <div className="metadata-list">
                      <div className="metadata-row">
                        <span>{t("allowedSenderTypesLabel")}</span>
                        <strong>
                          {identityPolicy === "wallet_required"
                            ? t("allowedSenderTypesWalletOnly")
                            : t("allowedSenderTypesAnonymousAndWallet")}
                        </strong>
                      </div>
                    </div>
                    <div className="composer-radio-options">
                      {([
                        ["anonymous_allowed", t("verificationOptional")],
                        ["wallet_required", t("verificationRequired")],
                      ] as const).map(([value, label]) => (
                        <label
                          key={value}
                          className={`composer-radio-option${identityPolicy === value ? " is-selected" : ""}`}
                        >
                          <input
                            type="radio"
                            name="submissionIdentity"
                            value={value}
                            checked={identityPolicy === value}
                            onChange={() => onChangeIdentityPolicy(value)}
                          />
                          <span className="composer-radio-mark" aria-hidden="true" />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <p className="muted">
                    {t("identityPolicyHelp")}
                  </p>
                </section>

                <section className="panel composer-settings-card composer-settings-card-visual">
                  <div className="section-row composer-settings-visual-heading">
                    <span className="composer-settings-visual-icon composer-settings-visual-icon-encryption">
                      <RoutingIcon type="encryption" />
                    </span>
                    <div>
                      <p className="eyebrow">{t("privateSignalEyebrow")}</p>
                      <h3>{t("encryptSubmissions")}</h3>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={encryptSubmissions}
                        onChange={(event) => onToggleEncryptSubmissions(event.target.checked)}
                      />
                      <span>{encryptSubmissions ? t("enabled") : t("disabled")}</span>
                    </label>
                  </div>
                  <p className="muted">{t("encryptSubmissionsReviewHelp")}</p>
                  <div className="metadata-list">
                    <div className="metadata-row">
                      <span>{t("encryptedScopeCurrentLabel")}</span>
                      <strong>{encryptionScopePrimary}</strong>
                    </div>
                    {isPersonalEncryptedForm || isProjectEncryptedForm ? (
                      <div className="metadata-row">
                        <span>{t("encryptedScopeProjectLabel")}</span>
                        <strong>{encryptionScopeContrast}</strong>
                      </div>
                    ) : null}
                  </div>
                  {encryptionWarnings.length > 0 ? (
                    <div className="composer-warning-list" aria-live="polite">
                      {encryptionWarnings.map((warning) => (
                        <p
                          key={`${warning.kind}-${warning.message}`}
                          className={warning.blocksPublish ? "error-text" : "warning-text"}
                        >
                          {getEncryptionWarningMessage(warning)}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </section>

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
