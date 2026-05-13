import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { BlobLink } from "../../../components/BlobLink";
import { ShareCard } from "../../../components/ShareCard";
import { SignalMetaRow } from "../../../components/SignalMetaChip";
import { LivePreview } from "../../../components/formBuilder/LivePreview";
import { isLocalFallbackBlob } from "../../../lib/proof";
import { shortAddress, SUI_NETWORK } from "../../../lib/sui";
import { formatWalrusFailureStage, type WalrusFailureDetails } from "../../../storage/walrusDiagnostics";
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
  showPublishSuccessView: boolean;
  showWalrusDiagnostics: boolean;
  isConnected: boolean;
  currentWalletName?: string;
  accountAddress?: string;
  storageMode: string;
  uploadRelayUrl: string;
  storageRuntimeMode: string;
  storageRuntimeNotice?: string;
  storageRuntimeDiagnostics?: WalrusFailureDetails | null;
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
  showPublishSuccessView,
  showWalrusDiagnostics,
  isConnected,
  currentWalletName,
  accountAddress,
  storageMode,
  uploadRelayUrl,
  storageRuntimeMode,
  storageRuntimeNotice,
  storageRuntimeDiagnostics,
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
      ? "Local mode"
      : "Walrus mode"
    : "Local / Walrus mode";

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
              <p className="muted">{savedForm ? t("publishSavedModeBody") : t("publishReadyBody")}</p>
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

          {showWalrusDiagnostics ? (
            <section className="answer-card">
              <div className="section-row">
                <div>
                  <p className="eyebrow">Walrus Runtime</p>
                  <h3>Publish diagnostics</h3>
                </div>
              </div>
              <div className="metadata-list">
                <div className="metadata-row">
                  <span>Wallet</span>
                  <strong>{isConnected ? currentWalletName ?? "Connected" : "Not connected"}</strong>
                </div>
                <div className="metadata-row">
                  <span>Address</span>
                  <strong>{accountAddress ? shortAddress(accountAddress) : "Not connected"}</strong>
                </div>
                <div className="metadata-row">
                  <span>Network</span>
                  <strong>{SUI_NETWORK}</strong>
                </div>
                <div className="metadata-row">
                  <span>Storage mode</span>
                  <strong>{storageMode}</strong>
                </div>
                <div className="metadata-row">
                  <span>Upload relay</span>
                  <strong>{uploadRelayUrl || "Not configured"}</strong>
                </div>
                <div className="metadata-row">
                  <span>Runtime state</span>
                  <strong>{storageRuntimeMode}</strong>
                </div>
                {storageRuntimeNotice ? (
                  <div className="metadata-row">
                    <span>Walrus notice</span>
                    <strong>{storageRuntimeNotice}</strong>
                  </div>
                ) : null}
                {storageRuntimeDiagnostics ? (
                  <div className="metadata-row">
                    <span>Walrus stage</span>
                    <strong>{formatWalrusFailureStage(storageRuntimeDiagnostics.stage)}</strong>
                  </div>
                ) : null}
                {storageRuntimeDiagnostics?.digest ? (
                  <div className="metadata-row">
                    <span>Tx digest</span>
                    <strong>{storageRuntimeDiagnostics.digest}</strong>
                  </div>
                ) : null}
                {storageRuntimeDiagnostics?.lastRpcError ? (
                  <div className="metadata-row">
                    <span>Last RPC error</span>
                    <strong>{storageRuntimeDiagnostics.lastRpcError}</strong>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {!showWalrusDiagnostics && storageRuntimeNotice ? (
            <section className="answer-card">
              <div className="metadata-row">
                <span>Walrus notice</span>
                <strong>{storageRuntimeNotice}</strong>
              </div>
              {storageRuntimeDiagnostics ? (
                <div className="metadata-row">
                  <span>Walrus stage</span>
                  <strong>{formatWalrusFailureStage(storageRuntimeDiagnostics.stage)}</strong>
                </div>
              ) : null}
              {storageRuntimeDiagnostics?.digest ? (
                <div className="metadata-row">
                  <span>Tx digest</span>
                  <strong>{storageRuntimeDiagnostics.digest}</strong>
                </div>
              ) : null}
              {storageRuntimeDiagnostics?.lastRpcError ? (
                <div className="metadata-row">
                  <span>Last RPC error</span>
                  <strong>{storageRuntimeDiagnostics.lastRpcError}</strong>
                </div>
              ) : null}
            </section>
          ) : null}

          {!showFocusedSuccessCard ? (
            <details className="composer-advanced-settings">
              <summary>{t("advanced")}</summary>
              <div className="stack composer-advanced-grid">
                <section className="panel composer-settings-card">
                  <div className="section-row">
                    <div>
                      <p className="eyebrow">Project routing</p>
                      <h3>Signal registry</h3>
                    </div>
                  </div>
                  <label>
                    <span>Selected project</span>
                    <select value={selectedProjectId} onChange={(event) => onSelectProject(event.target.value)}>
                      <option value="">Walrus / local only</option>
                      {projects.map((project) => (
                        <option key={project.objectId} value={project.objectId}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="muted">
                    {selectedProject
                      ? `Save to Walrus/local first. ${selectedProject.name} can be registered on Sui later from an explicit action.`
                      : "Leave this empty to keep the existing Walrus / local form flow only."}
                  </p>
                  {projectState ? <p className="muted">{projectState}</p> : null}
                  <p className="muted">{t("suiRegistrationDeferredNotice")}</p>
                </section>

                <section className="panel composer-settings-card">
                  <div className="section-row">
                    <div>
                      <p className="eyebrow">Explore routing</p>
                      <h3>Visibility</h3>
                    </div>
                  </div>
                  <label>
                    <span>Form visibility</span>
                    <select value={visibility} onChange={(event) => onChangeVisibility(event.target.value as FormVisibility)}>
                      <option value="private">Private</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="public">Public Explore</option>
                    </select>
                  </label>
                  <p className="muted">
                    Private stays admin-oriented. Unlisted works for anyone with the URL. Public Explore also lists this form in the network view.
                  </p>
                </section>

                <section className="panel composer-settings-card">
                  <div className="section-row">
                    <div>
                      <p className="eyebrow">Responder identity</p>
                      <h3>Identity policy</h3>
                    </div>
                  </div>
                  <label>
                    <span>Submission identity</span>
                    <select
                      value={identityPolicy}
                      onChange={(event) => onChangeIdentityPolicy(event.target.value as FormIdentityPolicy)}
                    >
                      <option value="anonymous_allowed">Anonymous allowed</option>
                      <option value="wallet_required">Wallet required</option>
                    </select>
                  </label>
                  <p className="muted">
                    Anonymous allowed keeps the public intake wallet-optional. Wallet required still keeps the page public, but blocks sending until the responder connects a wallet.
                  </p>
                </section>

                <section className="panel composer-settings-card">
                  <div className="section-row">
                    <div>
                      <p className="eyebrow">Private Signal</p>
                      <h3>Encrypt submissions</h3>
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
                  <p className="muted">Keep this on so reviewers unlock the signal later with an authorized wallet.</p>
                </section>

                {showWalrusDiagnostics ? (
                  <section className="panel composer-settings-card">
                    <div className="section-row">
                      <div>
                        <p className="eyebrow">Proof-backed routing</p>
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
                  <p className="eyebrow">Observation Relay</p>
                  <h3>SIGNAL ACTIVE</h3>
                  <p className="muted">{storageModeLabel}</p>
                </div>
                <span className="composer-live-pill">Observing</span>
              </div>

              <section className="answer-card contest-share-ready-card">
                <div className="section-row">
                  <div>
                    <p className="eyebrow">Step 3</p>
                    <h4>{isLocalOnlyForm ? "Local preview only" : "Share Public Link"}</h4>
                  </div>
                  <span className="signal-chip signal-chip-accent">{isLocalOnlyForm ? "Same browser only" : "Anonymous ready"}</span>
                </div>
                <p className="muted">
                  {isLocalOnlyForm
                    ? "This save fell back to browser-local storage. You can preview the responder flow on this device, but other phones and browsers cannot open the form yet."
                    : "This is the judge handoff moment. Open the public link, copy it, or scan the QR code to submit a private signal."}
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
                    <p className="eyebrow">{isLocalOnlyForm ? "Cross-device share blocked" : "Share Ready"}</p>
                    <h4>{isLocalOnlyForm ? "Walrus publish is required before sharing" : "QR sharing is unavailable"}</h4>
                    <p className="muted">
                      {isLocalOnlyForm
                        ? "Republish after Walrus storage succeeds, then share the public link or QR code."
                        : "This form is currently stored in local fallback mode, so phones and other browsers cannot restore it from a QR code yet."}
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
                    {isLocalOnlyForm ? "Local responder preview" : t("publicShareLink")}: <Link to={publicPath}>{publicPath}</Link>
                  </p>
                </div>
                {isLocalOnlyForm ? (
                  <p className="warning-text">
                    Do not share this URL yet. It only works in the current browser until Walrus storage succeeds.
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
                        <SignalMetaRow label="Project" type="registry" value={savedForm.projectId} />
                      ) : null}
                      {isRegisteredOnSui ? (
                        <div className="metadata-row">
                          <span>Registry Form ID</span>
                          <strong>{savedForm.onchainFormId}</strong>
                        </div>
                      ) : null}
                      <SignalMetaRow label={t("walrusBlobId")} type="blob" value={savedForm.blobId}>
                        <BlobLink blobId={savedForm.blobId} />
                      </SignalMetaRow>
                      {savedForm.manifestBlobId ? (
                        <SignalMetaRow label="Manifest Blob ID" type="manifest" value={savedForm.manifestBlobId}>
                          <BlobLink blobId={savedForm.manifestBlobId} label="Verify manifest on Walrus" />
                          <Link to={`/m/${savedForm.manifestBlobId}`}>{t("restoreLink")}</Link>
                        </SignalMetaRow>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>

              {savedForm.projectId && !isRegisteredOnSui && !showFocusedSuccessCard ? (
                <section className="answer-card sui-optional-card">
                  <p className="eyebrow">Optional Sui step</p>
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
