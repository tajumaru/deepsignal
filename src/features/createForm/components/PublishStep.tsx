import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { BlobLink } from "../../../components/BlobLink";
import { ShareCard } from "../../../components/ShareCard";
import { SignalMetaRow } from "../../../components/SignalMetaChip";
import { LivePreview } from "../../../components/formBuilder/LivePreview";
import { isLocalFallbackBlob } from "../../../lib/proof";
import { shortAddress, SUI_NETWORK } from "../../../lib/sui";
import { formatWalrusFailureStage, type WalrusFailureDetails } from "../../../storage/walrusDiagnostics";
import type { EncryptionReadinessWarning } from "../encryptionReadiness";
import type {
  FormField,
  FormIdentityPolicy,
  FormSection,
  FormVisibility,
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
  savedForm: PreparedPublishForm | null;
  title: string;
  description: string;
  fields: FormField[];
  sections: FormSection[];
  visibility: FormVisibility;
  identityPolicy: FormIdentityPolicy;
  encryptSubmissions: boolean;
  mobilePane: MobileBuilderPane;
  isReadyToPublish: boolean;
  publicPath: string;
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
  canManageProjects: boolean;
  selectedProjectId: string;
  selectedProject: ProjectOption | null;
  projects: ProjectOption[];
  projectState: string;
  onSetMobilePane: (pane: MobileBuilderPane) => void;
  onSelectProject: (projectId: string) => void;
  onChangeVisibility: (value: FormVisibility) => void;
  onChangeIdentityPolicy: (value: FormIdentityPolicy) => void;
  onToggleEncryptSubmissions: (value: boolean) => void;
  onRegisterOnSui: () => void;
  onBack: () => void;
}

export function PublishStep({
  t,
  saving,
  registeringOnSui,
  error,
  savedForm,
  title,
  description,
  fields,
  sections,
  visibility,
  identityPolicy,
  encryptSubmissions,
  mobilePane,
  isReadyToPublish,
  publicPath,
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
  canManageProjects,
  selectedProjectId,
  selectedProject,
  projects,
  projectState,
  onSetMobilePane,
  onSelectProject,
  onChangeVisibility,
  onChangeIdentityPolicy,
  onToggleEncryptSubmissions,
  onRegisterOnSui,
  onBack,
}: PublishStepProps) {
  const isRegisteredOnSui = Boolean(savedForm?.isOnchain && typeof savedForm.onchainFormId === "number");
  const isLocalOnlyForm = Boolean(savedForm?.blobId && isLocalFallbackBlob(savedForm.blobId));
  const showFocusedSuccessCard = Boolean(savedForm && showPublishSuccessView);
  const beaconScrollRef = useRef<HTMLDivElement | null>(null);
  const storageModeLabel = savedForm
    ? isLocalOnlyForm
      ? t("localMode")
      : t("walrusMode")
    : t("localWalrusMode");
  const visibleSelectedProject = canManageProjects ? selectedProject : null;
  const publishReadyBody = isGuestDraftMode ? t("guestDraftPublishBody") : t("publishReadyBody");
  const encryptionScopeMessage = encryptSubmissions
    ? visibleSelectedProject
      ? t("projectEncryptedFormHelp", { name: visibleSelectedProject.name })
      : accountAddress
        ? t("personalEncryptedFormHelp")
        : t("personalEncryptedFormConnectHelp")
    : t("openFormEncryptionHelp");
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

  return (
    <section
      className={`composer-builder-grid composer-builder-grid-preview ${showFocusedSuccessCard ? "is-focused-success" : ""}`}
    >
      {!showFocusedSuccessCard ? (
        <div className="composer-mobile-tabs" role="tablist" aria-label="Builder view">
          <button type="button" className={`composer-mobile-tab ${mobilePane === "editor" ? "is-active" : ""}`} onClick={() => onSetMobilePane("editor")}>
            {t("editorTab")}
          </button>
          <button type="button" className={`composer-mobile-tab ${mobilePane === "preview" ? "is-active" : ""}`} onClick={() => onSetMobilePane("preview")}>
            {t("previewTab")}
          </button>
        </div>
      ) : null}

      <div className={`composer-builder-column composer-editor-column ${mobilePane === "preview" ? "is-hidden-mobile" : ""}`}>
        <section className="panel composer-section-card composer-publish-panel composer-step-card">
          <div className="section-row">
            <div>
              <p className="eyebrow">Step 4</p>
              <h2>{savedForm ? t("formPublished") : t("publishReadyTitle")}</h2>
              <p className="muted">{savedForm ? t("publishSavedModeBody") : publishReadyBody}</p>
            </div>
            {!savedForm ? (
              <button
                type="submit"
                className="primary-button publish-cta-button"
                disabled={saving || !isReadyToPublish}
              >
                {saving ? t("builderSaving") : t("builderSave")}
              </button>
            ) : null}
          </div>

          <p className="wallet-inline-note">
            {t("formOwnerLabel")}: {accountAddress ? shortAddress(accountAddress) : t("walletPublishHint")}
          </p>
          {isGuestDraftMode && !savedForm ? (
            <p className="wallet-inline-note">{t("guestDraftPublishWalletRequired")}</p>
          ) : null}

          {showWalrusDiagnostics ? (
            <section className="answer-card">
              <div className="section-row">
                <div>
                  <p className="eyebrow">Walrus Runtime</p>
                  <h3>{t("publishDiagnosticsTitle")}</h3>
                </div>
              </div>
              <div className="metadata-list">
                <div className="metadata-row">
                  <span>{t("walletLabel")}</span>
                  <strong>{isConnected ? currentWalletName ?? t("connected") : t("notConnected")}</strong>
                </div>
                <div className="metadata-row">
                  <span>{t("addressLabel")}</span>
                  <strong>{accountAddress ? shortAddress(accountAddress) : t("notConnected")}</strong>
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
              </div>
            </section>
          ) : null}

          {!showWalrusDiagnostics && storageRuntimeNotice ? (
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
                <section className="panel composer-settings-card">
                  <div className="section-row">
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

                <section className="panel composer-settings-card">
                  <div className="section-row">
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

                <section className="panel composer-settings-card">
                  <div className="section-row">
                    <div>
                      <p className="eyebrow">{t("responderIdentityEyebrow")}</p>
                      <h3>{t("identityPolicyTitle")}</h3>
                    </div>
                  </div>
                  <label>
                    <span>{t("submissionIdentityLabel")}</span>
                    <select
                      value={identityPolicy}
                      onChange={(event) => onChangeIdentityPolicy(event.target.value as FormIdentityPolicy)}
                    >
                      <option value="anonymous_allowed">{t("anonymousAllowed")}</option>
                      <option value="wallet_required">{t("walletRequired")}</option>
                    </select>
                  </label>
                  <p className="muted">
                    {t("identityPolicyHelp")}
                  </p>
                </section>

                <section className="panel composer-settings-card">
                  <div className="section-row">
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
                  <p className="muted">{encryptionScopeMessage}</p>
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

                {showWalrusDiagnostics ? (
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
                <div className="composer-success-cta-row">
                  <Link className="primary-button" to={`/dashboard/forms/${savedForm.id}`}>
                    {t("signalInboxTitle")}
                  </Link>
                  <p>
                    {isLocalOnlyForm ? t("localResponderPreview") : t("publicShareLink")}: <Link to={publicPath}>{publicPath}</Link>
                  </p>
                </div>
                {isLocalOnlyForm ? (
                  <p className="warning-text">
                    {t("doNotShareLocalUrl")}
                  </p>
                ) : null}
                {!showFocusedSuccessCard ? (
                  <>
                    <p>
                      {t("adminPage")}: <Link to={`/dashboard/forms/${savedForm.id}`}>{t("adminPageCta")}</Link>
                    </p>
                    <div className="metadata-list">
                      <div className="metadata-row">
                        <span>{t("formStorageModeLabel")}</span>
                        <strong>{storageModeLabel}</strong>
                      </div>
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
            <div className="composer-step-actions">
              <button type="button" className="ghost-button" onClick={onBack}>
                {t("back")}
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {!showFocusedSuccessCard ? (
        <div className={`composer-builder-column composer-preview-column ${mobilePane === "editor" ? "is-hidden-mobile" : ""}`}>
          <LivePreview
            title={title}
            description={description}
            fields={fields}
            sections={sections}
          />
        </div>
      ) : null}
    </section>
  );
}
