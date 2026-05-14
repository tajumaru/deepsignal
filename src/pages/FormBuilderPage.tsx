import { useCurrentAccount, useCurrentWallet, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { FieldTypePicker } from "../components/formBuilder/FieldTypePicker";
import { useAccessControl } from "../hooks/useAccessControl";
import { useProjectRegistry } from "../hooks/useProjectRegistry";
import { useI18n } from "../i18n";
import { canAdmin, getAdminSurfaceAccessState, getRoleLabel } from "../lib/adminAccess";
import { setSelectedProjectId } from "../lib/projectRegistry";
import { shortAddress, WALRUS_UPLOAD_RELAY_URL } from "../lib/sui";
import { showWalrusDiagnostics } from "../features/createForm/constants";
import { BuilderToolbar } from "../features/createForm/components/BuilderToolbar";
import { FieldsStep } from "../features/createForm/components/FieldsStep";
import { InfoStep } from "../features/createForm/components/InfoStep";
import { PublishOverlay } from "../features/createForm/components/PublishOverlay";
import { PublishStep } from "../features/createForm/components/PublishStep";
import { TemplateStep } from "../features/createForm/components/TemplateStep";
import { getCreateFormEncryptionReadiness } from "../features/createForm/encryptionReadiness";
import { useCreateFormBuilder } from "../features/createForm/hooks/useCreateFormBuilder";
import { useCreateFormPublish } from "../features/createForm/hooks/useCreateFormPublish";
import { getStorageRuntimeStatus, subscribeStorageRuntime } from "../storage/storageFactory";

interface FormBuilderComposerProps {
  mode: "admin" | "guestDraft";
  freshStartToken: string;
  draftSeed: {
    templateKey?: string;
    idea?: string;
  };
}

function FormBuilderComposer({ mode, freshStartToken, draftSeed }: FormBuilderComposerProps) {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const { currentWallet, isConnected } = useCurrentWallet();
  const suiClient = useSuiClient();
  const { capabilityProfile, isLoadingAccess } = useAccessControl(account?.address);
  const { projects } = useProjectRegistry(account?.address);
  const createFormTx = useSignAndExecuteTransaction();
  const navigate = useNavigate();
  const composerShellRef = useRef<HTMLElement | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [storageRuntime, setStorageRuntime] = useState(() => getStorageRuntimeStatus());
  const [showPublishSuccessView, setShowPublishSuccessView] = useState(false);
  const hasAdminAccess = canAdmin(capabilityProfile);
  const isGuestDraftMode = mode === "guestDraft";

  const builder = useCreateFormBuilder({
    t,
    projects,
    freshStartToken,
    mode: isGuestDraftMode ? "guestDraft" : "admin",
    draftSeed,
  });
  const selectedProjectForPublish = hasAdminAccess ? builder.selectedProject : null;
  const publish = useCreateFormPublish({
    t,
    accountAddress: account?.address,
    creationMode: isGuestDraftMode ? "guest" : "admin",
    title: builder.values.title,
    description: builder.values.description,
    fields: builder.values.fields,
    sections: builder.values.sections,
    purpose: builder.values.purpose,
    visibility: builder.values.visibility,
    identityPolicy: builder.values.identityPolicy,
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

  const accessState = getAdminSurfaceAccessState("admin", account?.address, capabilityProfile);

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
    ownerAddress: account?.address,
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

  function handleNavigateHome() {
    if (!builder.confirmDiscardChanges()) {
      return;
    }
    navigate("/");
  }

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

  if (!isGuestDraftMode && account?.address && isLoadingAccess) {
    return <div className="panel">{t("checkingWalletCapabilities")}</div>;
  }

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
          isCrossDeviceShareReady={publish.isCrossDeviceShareReady}
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
          onSelectStep={builder.goToStep}
          onNavigateHome={handleNavigateHome}
        />

        {isGuestDraftMode ? (
          <section className="composer-guest-draft-banner">
            <strong>{t("guestDraftBannerTitle")}</strong>
            <span>{t("guestDraftBannerBody")}</span>
          </section>
        ) : null}

        <form id="create-form" className="composer-stage composer-step-stage" onSubmit={publish.handleSubmit}>
          {builder.values.currentStep === "template" ? (
            <TemplateStep
              t={t}
              selectedTemplateKey={builder.values.selectedTemplateKey}
              onSelectTemplate={builder.applyTemplate}
              onNavigateHome={handleNavigateHome}
            />
          ) : null}

          {builder.values.currentStep === "info" ? (
            <InfoStep
              t={t}
              title={builder.values.title}
              description={builder.values.description}
              responseDeadlinePreset={builder.values.responseDeadlinePreset}
              responseDeadlineCustomAt={builder.values.responseDeadlineCustomAt}
              setTitle={builder.setTitle}
              setDescription={builder.setDescription}
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
            />
          ) : null}

          {builder.values.currentStep === "publish" ? (
            <PublishStep
              t={t}
              saving={publish.saving}
              registeringOnSui={publish.registeringOnSui}
              error={publish.error}
              savedForm={publish.savedForm}
              title={builder.values.title}
              description={builder.values.description}
              fields={builder.values.fields}
              sections={builder.values.sections}
              visibility={builder.values.visibility}
              identityPolicy={builder.values.identityPolicy}
              encryptSubmissions={builder.values.encryptSubmissions}
              mobilePane={builder.values.mobilePane}
              isReadyToPublish={builder.isReadyToPublish}
              publicPath={publish.publicPath}
              publishChecks={publish.publishChecks}
              encryptionWarnings={encryptionWarnings}
              showPublishSuccessView={showPublishSuccessView}
              showWalrusDiagnostics={showWalrusDiagnostics}
              isConnected={isConnected}
              currentWalletName={currentWallet?.name ?? undefined}
              accountAddress={account?.address}
              storageMode={import.meta.env.VITE_WALRUS_STORAGE_MODE || "uploadRelay"}
              uploadRelayUrl={WALRUS_UPLOAD_RELAY_URL || t("notConfigured")}
              storageRuntimeMode={storageRuntime.mode}
              storageRuntimeNotice={storageRuntime.notice ?? undefined}
              storageRuntimeDiagnostics={storageRuntime.diagnostics}
              canManageProjects={hasAdminAccess}
              selectedProjectId={builder.values.selectedProjectId}
              selectedProject={hasAdminAccess ? builder.selectedProject : null}
              projects={hasAdminAccess ? projects : []}
              projectState={builder.values.projectState}
              onSetMobilePane={builder.setMobilePane}
              onSelectProject={handleSelectProject}
              onChangeVisibility={builder.setVisibility}
              onChangeIdentityPolicy={builder.setIdentityPolicy}
              onToggleEncryptSubmissions={builder.setEncryptSubmissions}
              onRegisterOnSui={() => void publish.handleRegisterOnSui()}
              onBack={() => builder.moveStep(-1)}
            />
          ) : null}
        </form>
      </section>
  );

  if (isGuestDraftMode) {
    return composer;
  }

  return (
    <AdminAccessGate
      hasWallet={Boolean(account?.address)}
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
  const account = useCurrentAccount();
  const location = useLocation();
  const { t } = useI18n();
  const { capabilityProfile, isLoadingAccess } = useAccessControl(account?.address);
  const searchParams = new URLSearchParams(location.search);
  const requestedGuestDraftMode = searchParams.get("mode") === "guestDraft";
  const freshStartToken = searchParams.get("fresh") ?? "";
  const draftSeed = {
    templateKey: searchParams.get("template") ?? undefined,
    idea: searchParams.get("idea") ?? undefined,
  };
  const hasAdminAccess = canAdmin(capabilityProfile);

  if (!requestedGuestDraftMode && account?.address && isLoadingAccess) {
    return <div className="panel">{t("checkingWalletCapabilities")}</div>;
  }

  const mode =
    requestedGuestDraftMode ||
    !account?.address ||
    (capabilityProfile.isConfigured && !hasAdminAccess)
      ? "guestDraft"
      : "admin";

  return (
    <FormBuilderComposer
      key={`${mode}:${freshStartToken || "restored"}`}
      mode={mode}
      freshStartToken={freshStartToken}
      draftSeed={draftSeed}
    />
  );
}
