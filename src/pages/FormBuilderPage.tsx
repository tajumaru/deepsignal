import { useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { RecoverableDraftBanner } from "../components/RecoverableDraftBanner";
import { FieldTypePicker } from "../components/formBuilder/FieldTypePicker";
import { useAccessControl } from "../hooks/useAccessControl";
import { useProjectRegistry } from "../hooks/useProjectRegistry";
import { useSuiWallet } from "../hooks/useSuiWallet";
import { useI18n } from "../i18n";
import { canAdmin, getAdminSurfaceAccessState, getRoleLabel } from "../lib/adminAccess";
import { getActivityActorRole } from "../lib/activityLog";
import { setSelectedProjectId } from "../lib/projectRegistry";
import { shortAddress, WALRUS_UPLOAD_RELAY_URL } from "../lib/sui";
import { initialFields, initialTemplate, showWalrusDiagnostics } from "../features/createForm/constants";
import { BuilderToolbar } from "../features/createForm/components/BuilderToolbar";
import { FieldsStep } from "../features/createForm/components/FieldsStep";
import { InfoStep } from "../features/createForm/components/InfoStep";
import { IntentStartStep } from "../features/createForm/components/IntentStartStep";
import { MirrorPreviewPanel } from "../features/createForm/components/MirrorPreviewPanel";
import { PublishOverlay } from "../features/createForm/components/PublishOverlay";
import { PublishStep } from "../features/createForm/components/PublishStep";
import { TemplateStep } from "../features/createForm/components/TemplateStep";
import { getCreateFormEncryptionReadiness } from "../features/createForm/encryptionReadiness";
import { useCreateFormBuilder } from "../features/createForm/hooks/useCreateFormBuilder";
import { useCreateFormPublish } from "../features/createForm/hooks/useCreateFormPublish";
import type { DisplayMode } from "../features/createForm/types";
import { getStorageRuntimeStatus, subscribeStorageRuntime } from "../storage/storageFactory";

function normalizeFieldsForModeSwitch(fields: typeof initialFields) {
  return fields.map((field) => ({
    type: field.type,
    label: field.label.trim(),
    description: field.helpText?.trim() ?? "",
    placeholder: field.placeholder?.trim() ?? "",
    required: field.required,
    options: field.options?.map((option) => option.trim()).filter(Boolean) ?? [],
    rows: field.rows?.map((row) => row.trim()).filter(Boolean) ?? [],
    columns: field.columns?.map((column) => column.trim()).filter(Boolean) ?? [],
  }));
}

interface FormBuilderComposerProps {
  mode: "admin" | "guestDraft";
  freshStartToken: string;
  initialDisplayMode?: DisplayMode;
  draftSeed: {
    templateKey?: string;
    idea?: string;
  };
}

function FormBuilderComposer({ mode, freshStartToken, initialDisplayMode = "classic", draftSeed }: FormBuilderComposerProps) {
  const { t } = useI18n();
  const wallet = useSuiWallet();
  const suiClient = useSuiClient();
  const { capabilityProfile, isLoadingAccess } = useAccessControl(wallet.accountAddress);
  const { projects } = useProjectRegistry(wallet.accountAddress);
  const createFormTx = useSignAndExecuteTransaction();
  const composerShellRef = useRef<HTMLElement | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [storageRuntime, setStorageRuntime] = useState(() => getStorageRuntimeStatus());
  const [showPublishSuccessView, setShowPublishSuccessView] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(initialDisplayMode);
  const [showMirrorStartChoice, setShowMirrorStartChoice] = useState(false);
  const isMirrorMode = displayMode === "mirror";
  const hasAdminAccess = canAdmin(capabilityProfile);
  const isGuestDraftMode = mode === "guestDraft";

  const builder = useCreateFormBuilder({
    t,
    projects,
    freshStartToken,
    mode: isGuestDraftMode ? "guestDraft" : "admin",
    startExperience: initialDisplayMode,
    draftSeed,
  });
  const selectedProjectForPublish = hasAdminAccess ? builder.selectedProject : null;
  const publish = useCreateFormPublish({
    t,
    accountAddress: wallet.accountAddress,
    actorRole: getActivityActorRole(capabilityProfile),
    creationMode: isGuestDraftMode ? "guest" : "admin",
    title: builder.values.title,
    description: builder.values.description,
    headerImage: builder.values.headerImage,
    headerLogo: builder.values.headerLogo,
    fields: builder.values.fields,
    sections: builder.values.sections,
    purpose: builder.values.purpose,
    visibility: builder.values.visibility,
    identityPolicy: builder.values.identityPolicy,
    locationRequirement: builder.values.locationRequirement,
    encryptSubmissions: builder.values.encryptSubmissions,
    responseDeadlinePreset: builder.values.responseDeadlinePreset,
    responseDeadlineCustomAt: builder.values.responseDeadlineCustomAt,
    isDirty: builder.isDirty,
    selectedProject: selectedProjectForPublish,
    setProjectState: builder.setProjectState,
    signAndExecuteTransaction: async (transaction) => createFormTx.mutateAsync({ transaction }),
    waitForTransaction: async (digest) =>
      suiClient.waitForTransaction({
        digest,
        options: { showEvents: true },
      }),
    validateFieldsStep: builder.validateFieldsStep,
    goToStep: builder.goToStep,
    onSaved: () => builder.markSaved(),
  });

  const accessState = getAdminSurfaceAccessState("admin", wallet.accountAddress, capabilityProfile);

  const completedSteps = useMemo(
    () =>
      [
        builder.values.selectedTemplateKey && builder.values.currentStep !== "template" ? "template" : "",
        builder.hasValidTitle && ["fields", "publish"].includes(builder.values.currentStep) ? "info" : "",
        builder.hasQuestions && builder.values.currentStep === "publish" ? "fields" : "",
        publish.savedForm ? "publish" : "",
      ].filter(Boolean),
    [builder.hasQuestions, builder.hasValidTitle, builder.values.currentStep, builder.values.selectedTemplateKey, publish.savedForm],
  );
  const encryptionWarnings = getCreateFormEncryptionReadiness({
    encryptSubmissions: builder.values.encryptSubmissions,
    projectId: selectedProjectForPublish?.objectId,
    ownerAddress: wallet.accountAddress,
  });
  const draftStateLabel = useMemo(() => {
    if (!builder.isDirty && publish.savedForm) {
      return t("draftClearedAfterPublish");
    }
    switch (builder.draftSaveState) {
      case "restored":
        return t("draftRestored");
      case "saving":
        return t("draftSaving");
      case "saved":
        return t("draftSaved");
      default:
        return builder.isDirty ? t("draftUnsaved") : "";
    }
  }, [builder.draftSaveState, builder.isDirty, publish.savedForm, t]);
  const hasEditedCoreSignal = useMemo(() => {
    const titleChanged = builder.values.title.trim() !== initialTemplate.title.trim();
    const descriptionChanged = builder.values.description.trim() !== initialTemplate.description.trim();
    const fieldsChanged =
      JSON.stringify(normalizeFieldsForModeSwitch(builder.values.fields)) !==
      JSON.stringify(normalizeFieldsForModeSwitch(initialFields));
    return titleChanged || descriptionChanged || fieldsChanged;
  }, [builder.values.description, builder.values.fields, builder.values.title]);

  useEffect(() => {
    const unsubscribe = subscribeStorageRuntime(() => setStorageRuntime(getStorageRuntimeStatus()));
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (publish.overlay.open) {
      setShowPublishSuccessView(false);
      return;
    }
    if (!publish.savedForm || builder.isDirty) {
      setShowPublishSuccessView(false);
    }
  }, [builder.isDirty, publish.overlay.open, publish.savedForm]);

  useEffect(() => {
    document.body.classList.add("composer-mode");
    return () => document.body.classList.remove("composer-mode");
  }, []);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!freshStartToken) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      const composerShell = composerShellRef.current;
      if (!composerShell) {
        return;
      }
      const topbarHeight = document.querySelector<HTMLElement>(".topbar")?.getBoundingClientRect().height ?? 0;
      const nextTop = Math.max(
        0,
        window.scrollY + composerShell.getBoundingClientRect().top - topbarHeight - 12,
      );
      window.scrollTo({ top: nextTop, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [freshStartToken]);

  function handleFieldsContinue() {
    publish.setError("");
    const validation = builder.validateFieldsStep();
    if (!validation.isValid) {
      publish.setError(validation.error);
      return;
    }
    builder.moveStep(1);
  }

  function handleSelectProject(projectId: string) {
    builder.setSelectedProjectIdState(projectId);
    if (!isGuestDraftMode) {
      setSelectedProjectId(projectId);
    }
  }

  function handleApplyIntentDraft(draft: Parameters<typeof builder.applyIntentDraft>[0]) {
    setShowMirrorStartChoice(false);
    builder.applyIntentDraft(draft);
  }

  function switchDisplayMode(nextMode: DisplayMode) {
    if (nextMode === "classic") {
      setDisplayMode("classic");
      setShowMirrorStartChoice(false);
      return;
    }

    setDisplayMode("mirror");
    if (hasEditedCoreSignal) {
      setShowMirrorStartChoice(true);
      return;
    }

    setShowMirrorStartChoice(false);
    builder.goToStep("template");
  }

  function handleStartMirrorFromIntent() {
    setShowMirrorStartChoice(false);
    builder.goToStep("template");
  }

  function handleContinueCurrentSignal() {
    setShowMirrorStartChoice(false);
  }

  if (!isGuestDraftMode && wallet.accountAddress && isLoadingAccess) {
    return <div className="panel">{t("checkingWalletCapabilities")}</div>;
  }

  const builderForm = (
    <form id="create-form" className="composer-stage composer-step-stage" onSubmit={publish.handleSubmit}>
      {builder.values.currentStep === "template" ? (
        isMirrorMode ? (
          <IntentStartStep onApplyDraft={handleApplyIntentDraft} />
        ) : (
          <TemplateStep
            t={t}
            selectedTemplateKey={builder.values.selectedTemplateKey}
            onSelectTemplate={builder.applyTemplate}
          />
        )
      ) : null}

      {builder.values.currentStep === "info" ? (
        <InfoStep
          t={t}
          title={builder.values.title}
          description={builder.values.description}
          identityPolicy={builder.values.identityPolicy}
          locationRequirement={builder.values.locationRequirement}
          encryptSubmissions={builder.values.encryptSubmissions}
          headerImage={builder.values.headerImage}
          headerLogo={builder.values.headerLogo}
          responseDeadlinePreset={builder.values.responseDeadlinePreset}
          responseDeadlineCustomAt={builder.values.responseDeadlineCustomAt}
          setTitle={builder.setTitle}
          setDescription={builder.setDescription}
          setHeaderImage={builder.setHeaderImage}
          setHeaderLogo={builder.setHeaderLogo}
          setResponseDeadlinePreset={builder.setResponseDeadlinePreset}
          setResponseDeadlineCustomAt={builder.setResponseDeadlineCustomAt}
          onBack={() => builder.moveStep(-1)}
          onContinue={() => builder.moveStep(1)}
        />
      ) : null}

      {builder.values.currentStep === "fields" ? (
        <FieldsStep
          t={t}
          title={builder.values.title}
          description={builder.values.description}
          fields={builder.values.fields}
          sections={builder.values.sections}
          encryptSubmissions={builder.values.encryptSubmissions}
          draggedFieldId={builder.values.draggedFieldId}
          dragOverFieldId={builder.values.dragOverFieldId}
          dragOverPlacement={builder.values.dragOverPlacement}
          refs={builder.refs}
          setActiveFieldId={builder.setActiveFieldId}
          setDraggedFieldId={builder.setDraggedFieldId}
          setDragOverFieldId={builder.setDragOverFieldId}
          setDragOverPlacement={builder.setDragOverPlacement}
          onAddSection={builder.addSection}
          onUpdateSection={builder.updateSection}
          onRemoveSection={builder.removeSection}
          onUpdateField={builder.updateField}
          onRemoveField={builder.removeField}
          onDuplicateField={builder.duplicateFieldAt}
          onInsertConditionalField={builder.insertConditionalField}
          onInsertField={builder.insertField}
          onReorderFields={builder.reorderFields}
          onOpenFieldTypePicker={() => builder.setFieldTypePickerOpen(true)}
          onBack={() => builder.moveStep(-1)}
          onContinue={handleFieldsContinue}
          displayMode={displayMode}
        />
      ) : null}

      {builder.values.currentStep === "publish" ? (
        <PublishStep
          t={t}
          saving={publish.saving}
          registeringOnSui={publish.registeringOnSui}
          error={publish.error}
          failure={publish.failure}
          diagnosticsCopied={publish.diagnosticsCopied}
          savedForm={publish.savedForm}
          title={builder.values.title}
          description={builder.values.description}
          headerImage={builder.values.headerImage}
          headerLogo={builder.values.headerLogo}
          fields={builder.values.fields}
          sections={builder.values.sections}
          visibility={builder.values.visibility}
          identityPolicy={builder.values.identityPolicy}
          locationRequirement={builder.values.locationRequirement}
          encryptSubmissions={builder.values.encryptSubmissions}
          mobilePane={builder.values.mobilePane}
          isReadyToPublish={builder.isReadyToPublish}
          publicPath={publish.publicPath}
          publicUrl={publish.publicUrl}
          publishChecks={publish.publishChecks}
          encryptionWarnings={encryptionWarnings}
          showPublishSuccessView={showPublishSuccessView}
          showWalrusDiagnostics={showWalrusDiagnostics}
          isGuestDraftMode={isGuestDraftMode}
          isConnected={wallet.isConnected}
          currentWalletName={wallet.walletName}
          accountAddress={wallet.accountAddress}
          storageMode={import.meta.env.VITE_WALRUS_STORAGE_MODE || "uploadRelay"}
          uploadRelayUrl={WALRUS_UPLOAD_RELAY_URL || t("notConfigured")}
          storageRuntimeMode={storageRuntime.mode}
          storageRuntimeNotice={storageRuntime.notice ?? undefined}
          storageRuntimeDiagnostics={storageRuntime.diagnostics}
          walrusCostEstimate={publish.walrusCostEstimate}
          displayMode={displayMode}
          canManageProjects={hasAdminAccess}
          selectedProjectId={builder.values.selectedProjectId}
          selectedProject={hasAdminAccess ? builder.selectedProject : null}
          projects={hasAdminAccess ? projects : []}
          projectState={builder.values.projectState}
          onSetMobilePane={builder.setMobilePane}
          onSelectProject={handleSelectProject}
          onChangeVisibility={builder.setVisibility}
          onChangeIdentityPolicy={builder.setIdentityPolicy}
          onChangeLocationRequirement={builder.setLocationRequirement}
          onToggleEncryptSubmissions={builder.setEncryptSubmissions}
          onRegisterOnSui={() => void publish.handleRegisterOnSui()}
          onCopyDiagnostics={() => void publish.copyDiagnostics()}
          onBack={() => builder.moveStep(-1)}
        />
      ) : null}
    </form>
  );

  const composer = (
      <section ref={composerShellRef} className="composer-shell">
        <PublishOverlay
          t={t}
          open={publish.overlay.open}
          overlay={publish.overlay}
          saving={publish.saving}
          title={builder.values.title}
          description={builder.values.description}
          fieldsCount={builder.values.fields.length}
          encryptSubmissions={builder.values.encryptSubmissions}
          purpose={builder.values.purpose}
          publicPath={publish.publicPath}
          publicUrl={publish.publicUrl}
          isCrossDeviceShareReady={publish.isCrossDeviceShareReady}
          onCopyLink={publish.handleCopyLink}
          onCopyBlobId={publish.handleCopyBlobId}
          onClose={() => {
            publish.setOverlay((current) => ({ ...current, open: false }));
            if (publish.savedForm) {
              setShowPublishSuccessView(true);
            }
          }}
        />

        <FieldTypePicker
          open={builder.values.fieldTypePickerOpen}
          onClose={() => builder.setFieldTypePickerOpen(false)}
          onPick={(type) => builder.insertField(type)}
        />

        <BuilderToolbar
          t={t}
          isScrolled={isScrolled}
          currentStep={builder.values.currentStep}
          completedSteps={completedSteps}
          capabilityConfigured={!isGuestDraftMode && capabilityProfile.isConfigured}
          accessRoleLabel={isGuestDraftMode ? t("guestDraftRole") : getRoleLabel(capabilityProfile)}
          adminCapLabel={!isGuestDraftMode && hasAdminAccess && capabilityProfile.adminCapIds[0] ? shortAddress(capabilityProfile.adminCapIds[0]) : undefined}
          draftStateLabel={draftStateLabel || undefined}
          savedFormId={publish.savedForm?.id}
          savedManifestBlobId={publish.savedForm?.manifestBlobId}
          onSelectStep={builder.goToStep}
        />

        <section className="panel composer-view-mode-panel" aria-label="Create Signal display mode">
          <div>
            <p className="eyebrow">Display Mode</p>
            <strong>{isMirrorMode ? "Mirror Preview Mode" : "Classic Builder"}</strong>
          </div>
          <div className="composer-view-mode-toggle" role="group" aria-label="Switch Create Signal display mode">
            <button
              type="button"
              className={displayMode === "classic" ? "is-active" : ""}
              onClick={() => switchDisplayMode("classic")}
            >
              Classic
            </button>
            <button
              type="button"
              className={displayMode === "mirror" ? "is-active" : ""}
              onClick={() => switchDisplayMode("mirror")}
            >
              Mirror
            </button>
          </div>
        </section>

        {isMirrorMode && showMirrorStartChoice ? (
          <section className="panel mirror-start-choice-panel" aria-live="polite">
            <div>
              <p className="eyebrow">Mirror Start</p>
              <strong>Continue with current signal or start from intent?</strong>
              <span>
                We found existing title, description, or block edits. Mirror Mode will not reset them unless you choose
                the intent start.
              </span>
            </div>
            <div className="mirror-start-choice-actions">
              <button type="button" className="primary-button" onClick={handleContinueCurrentSignal}>
                Continue with current signal
              </button>
              <button type="button" className="ghost-button" onClick={handleStartMirrorFromIntent}>
                Start from intent
              </button>
            </div>
          </section>
        ) : null}

        {builder.hasRecoverableDraft ? (
          <RecoverableDraftBanner
            title={t("recoverableDraftTitle")}
            restoreLabel={t("restore")}
            discardLabel={t("discard")}
            onRestore={builder.restoreRecoverableDraft}
            onDiscard={builder.discardRecoverableDraft}
          />
        ) : null}

        {isGuestDraftMode ? (
          <section className="composer-guest-draft-banner">
            <strong>{t("guestDraftBannerTitle")}</strong>
            <span>{t("guestDraftBannerBody")}</span>
          </section>
        ) : null}

        {isMirrorMode ? (
          <div className="composer-mirror-layout">
            <div className="composer-mirror-builder">{builderForm}</div>
            <MirrorPreviewPanel
              values={builder.values}
              activeFieldId={builder.values.activeFieldId}
              isReadyToPublish={builder.isReadyToPublish}
              publishedStatus={publish.savedForm ? "published" : "preview"}
              surface={builder.values.currentStep === "publish" ? "publish" : "builder"}
              savedForm={publish.savedForm}
              publicUrl={publish.publicUrl}
              publicPath={publish.publicPath}
              storageRuntimeMode={storageRuntime.mode}
              storageRuntimeNotice={storageRuntime.notice ?? undefined}
              storageRuntimeDiagnostics={storageRuntime.diagnostics}
              walrusCostEstimate={publish.walrusCostEstimate}
              saving={publish.saving}
              registeringOnSui={publish.registeringOnSui}
              publishError={publish.error}
              publishFailure={publish.failure}
              onCopyLink={publish.handleCopyLink}
            />
          </div>
        ) : (
          builderForm
        )}
      </section>
  );

  if (isGuestDraftMode) {
    return composer;
  }

  return (
    <AdminAccessGate
      hasWallet={Boolean(wallet.accountAddress)}
      access={accessState}
      deniedBody={
        capabilityProfile.isConfigured
          ? t("formComposerDeniedBody")
          : undefined
      }
    >
      {composer}
    </AdminAccessGate>
  );
}

export function FormBuilderPage() {
  const wallet = useSuiWallet();
  const location = useLocation();
  const { t } = useI18n();
  const { capabilityProfile, isLoadingAccess } = useAccessControl(wallet.accountAddress);
  const searchParams = new URLSearchParams(location.search);
  const requestedGuestDraftMode = searchParams.get("mode") === "guestDraft";
  const freshStartToken = searchParams.get("fresh") ?? "";
  const initialDisplayMode: DisplayMode = searchParams.get("preview") === "mirror" ? "mirror" : "classic";
  const draftSeed = {
    templateKey: searchParams.get("template") ?? undefined,
    idea: searchParams.get("idea") ?? undefined,
  };
  const hasAdminAccess = canAdmin(capabilityProfile);

  if (!requestedGuestDraftMode && wallet.accountAddress && isLoadingAccess) {
    return <div className="panel">{t("checkingWalletCapabilities")}</div>;
  }

  const mode =
    requestedGuestDraftMode ||
    !wallet.accountAddress ||
    (capabilityProfile.isConfigured && !hasAdminAccess)
      ? "guestDraft"
      : "admin";

  return (
    <FormBuilderComposer
      key={`${mode}:${freshStartToken || "restored"}`}
      mode={mode}
      freshStartToken={freshStartToken}
      initialDisplayMode={initialDisplayMode}
      draftSeed={draftSeed}
    />
  );
}
