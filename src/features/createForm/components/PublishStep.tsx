import { Link } from "react-router-dom";
import { BlobLink } from "../../../components/BlobLink";
import { ShareCard } from "../../../components/ShareCard";
import { SignalMetaRow } from "../../../components/SignalMetaChip";
import { LivePreview } from "../../../components/formBuilder/LivePreview";
import { isLocalFallbackBlob } from "../../../lib/proof";
import { shortAddress, SUI_NETWORK } from "../../../lib/sui";
import type { FormField, FormSection, MobileBuilderPane, PreparedPublishForm, ProjectOption, Translate } from "../types";

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
  encryptSubmissions: boolean;
  mobilePane: MobileBuilderPane;
  isReadyToPublish: boolean;
  publicPath: string;
  publishChecks: string[];
  showWalrusDiagnostics: boolean;
  isConnected: boolean;
  currentWalletName?: string;
  accountAddress?: string;
  storageMode: string;
  uploadRelayUrl: string;
  storageRuntimeMode: string;
  storageRuntimeNotice?: string;
  selectedProjectId: string;
  selectedProject: ProjectOption | null;
  projects: ProjectOption[];
  projectState: string;
  onSetMobilePane: (pane: MobileBuilderPane) => void;
  onSelectProject: (projectId: string) => void;
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
  encryptSubmissions,
  mobilePane,
  isReadyToPublish,
  publicPath,
  publishChecks,
  showWalrusDiagnostics,
  isConnected,
  currentWalletName,
  accountAddress,
  storageMode,
  uploadRelayUrl,
  storageRuntimeMode,
  storageRuntimeNotice,
  selectedProjectId,
  selectedProject,
  projects,
  projectState,
  onSetMobilePane,
  onSelectProject,
  onToggleEncryptSubmissions,
  onRegisterOnSui,
  onBack,
}: PublishStepProps) {
  return (
    <section className="composer-builder-grid composer-builder-grid-preview">
      <div className="composer-mobile-tabs" role="tablist" aria-label="Builder view">
        <button type="button" className={`composer-mobile-tab ${mobilePane === "editor" ? "is-active" : ""}`} onClick={() => onSetMobilePane("editor")}>
          {t("editorTab")}
        </button>
        <button type="button" className={`composer-mobile-tab ${mobilePane === "preview" ? "is-active" : ""}`} onClick={() => onSetMobilePane("preview")}>
          {t("previewTab")}
        </button>
      </div>

      <div className={`composer-builder-column composer-editor-column ${mobilePane === "preview" ? "is-hidden-mobile" : ""}`}>
        <section className="panel composer-section-card composer-publish-panel composer-step-card">
          <div className="section-row">
            <div>
              <p className="eyebrow">Step 4</p>
              <h2>{savedForm ? t("formPublished") : t("publishReadyTitle")}</h2>
          <p className="muted">{savedForm ? t("signalStoredOnWalrus") : t("publishReadyBody")}</p>
            </div>
            <button type="submit" className="primary-button" disabled={saving || !isReadyToPublish}>
              {saving ? t("builderSaving") : t("builderSave")}
            </button>
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
              </div>
            </section>
          ) : null}

          <details className="composer-advanced-settings" open>
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
                        {project.name} ({project.formsCount} forms)
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
                    <p className="eyebrow">{t("sealEyebrow")}</p>
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
                <p className="muted">{t("encryptSubmissionsHelp")}</p>
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

          {error ? <p className="error-text">{error}</p> : null}

          {savedForm ? (
            <div className="success-card composer-success-card">
              <div className="composer-success-header">
                <div>
                  <p className="eyebrow">Observation Relay</p>
                  <h3>SIGNAL ACTIVE</h3>
                  <p className="muted">
                    {isLocalFallbackBlob(savedForm.blobId) ? t("signalStoredLocally") : t("signalStoredOnWalrus")}
                  </p>
                </div>
                <span className="composer-live-pill">Observing</span>
              </div>

              <div className="composer-publish-checks">
                {publishChecks.map((check) => (
                  <p key={check}>{check}</p>
                ))}
              </div>

              <div className="composer-link-grid">
                <p>
                  {t("publicShareLink")}: <Link to={publicPath}>{publicPath}</Link>
                </p>
                <p>
                  {t("adminPage")}: <Link to={`/dashboard/forms/${savedForm.id}`}>{t("adminPageCta")}</Link>
                </p>
                <div className="metadata-list">
                  {savedForm.projectId ? <SignalMetaRow label="Project" type="registry" value={savedForm.projectId} /> : null}
                  {typeof savedForm.onchainFormId === "number" ? (
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
              </div>

              {savedForm.projectId && typeof savedForm.onchainFormId !== "number" ? (
                <section className="answer-card">
                  <p className="eyebrow">Optional Sui step</p>
                  <h4>{t("registerOnSuiTitle")}</h4>
                  <p className="muted">{t("registerOnSuiBody")}</p>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={onRegisterOnSui}
                      disabled={registeringOnSui}
                    >
                      {registeringOnSui ? t("registeringOnSui") : t("registerOnSui")}
                    </button>
                    <span className="muted">{t("registerOnSuiHint")}</span>
                  </div>
                </section>
              ) : null}

              {savedForm.manifestBlobId ? (
                <ShareCard
                  formId={savedForm.id}
                  blobId={savedForm.blobId}
                  createdAt={savedForm.createdAt}
                  manifestBlobId={savedForm.manifestBlobId}
                />
              ) : (
                <section className="answer-card">
                  <p className="eyebrow">Share Ready</p>
                  <h4>QR sharing is unavailable</h4>
                  <p className="muted">This form is currently stored in local fallback mode, so phones and other browsers cannot restore it from a QR code yet.</p>
                </section>
              )}
            </div>
          ) : (
            <p className="muted">{t("saveFormHint")}</p>
          )}

          <div className="composer-step-actions">
            <button type="button" className="ghost-button" onClick={onBack}>
              {t("back")}
            </button>
          </div>
        </section>
      </div>

      <div className={`composer-builder-column composer-preview-column ${mobilePane === "editor" ? "is-hidden-mobile" : ""}`}>
        <LivePreview
          title={title}
          description={description}
          fields={fields}
          sections={sections}
          encryptSubmissions={encryptSubmissions}
        />
      </div>
    </section>
  );
}
