import { useCurrentAccount, useCurrentWallet, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { useCreateFormBuilder } from "../features/createForm/hooks/useCreateFormBuilder";
import { useCreateFormPublish } from "../features/createForm/hooks/useCreateFormPublish";
import { getStorageRuntimeStatus, subscribeStorageRuntime } from "../storage/storageFactory";

export function FormBuilderPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const { currentWallet, isConnected } = useCurrentWallet();
  const suiClient = useSuiClient();
  const { capabilityProfile, isLoadingAccess } = useAccessControl(account?.address);
  const { projects } = useProjectRegistry(account?.address);
  const createFormTx = useSignAndExecuteTransaction();
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [storageRuntime, setStorageRuntime] = useState(() => getStorageRuntimeStatus());
  const [showPublishSuccessView, setShowPublishSuccessView] = useState(false);

  const builder = useCreateFormBuilder({ t, projects });
  const publish = useCreateFormPublish({
    t,
    accountAddress: account?.address,
    title: builder.values.title,
    description: builder.values.description,
    fields: builder.values.fields,
    sections: builder.values.sections,
    purpose: builder.values.purpose,
    visibility: builder.values.visibility,
    encryptSubmissions: builder.values.encryptSubmissions,
    responseDeadlinePreset: builder.values.responseDeadlinePreset,
    responseDeadlineCustomAt: builder.values.responseDeadlineCustomAt,
    isDirty: builder.isDirty,
    selectedProject: builder.selectedProject,
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

  const hasAdminAccess = canAdmin(capabilityProfile);
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
    setSelectedProjectId(projectId);
  }

  if (isLoadingAccess) {
    return <div className="panel">Checking wallet capabilities...</div>;
  }

  return (
    <AdminAccessGate
      hasWallet={Boolean(account?.address)}
      access={accessState}
      deniedBody={
        capabilityProfile.isConfigured
          ? "Only wallets with OwnerCap or AdminCap can open the form composer and publish new signals."
          : undefined
      }
    >
      <section className="composer-shell">
        <PublishOverlay
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
          capabilityConfigured={capabilityProfile.isConfigured}
          accessRoleLabel={getRoleLabel(capabilityProfile)}
          adminCapLabel={hasAdminAccess && capabilityProfile.adminCapIds[0] ? shortAddress(capabilityProfile.adminCapIds[0]) : undefined}
          savedFormId={publish.savedForm?.id}
          onSelectStep={builder.goToStep}
          onNavigateHome={handleNavigateHome}
        />

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
              mobilePane={builder.values.mobilePane}
              draggedFieldId={builder.values.draggedFieldId}
              dragOverFieldId={builder.values.dragOverFieldId}
              dragOverPlacement={builder.values.dragOverPlacement}
              refs={builder.refs}
              setMobilePane={builder.setMobilePane}
              setActiveFieldId={builder.setActiveFieldId}
              setDraggedFieldId={builder.setDraggedFieldId}
              setDragOverFieldId={builder.setDragOverFieldId}
              setDragOverPlacement={builder.setDragOverPlacement}
              onInsertSmartTemplate={builder.insertSmartTemplate}
              onUpdateSection={builder.updateSection}
              onRemoveSection={builder.removeSection}
              onUpdateField={builder.updateField}
              onRemoveField={builder.removeField}
              onDuplicateField={builder.duplicateFieldAt}
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
              encryptSubmissions={builder.values.encryptSubmissions}
              mobilePane={builder.values.mobilePane}
              isReadyToPublish={builder.isReadyToPublish}
              publicPath={publish.publicPath}
              publishChecks={publish.publishChecks}
              showPublishSuccessView={showPublishSuccessView}
              showWalrusDiagnostics={showWalrusDiagnostics}
              isConnected={isConnected}
              currentWalletName={currentWallet?.name ?? undefined}
              accountAddress={account?.address}
              storageMode={import.meta.env.VITE_WALRUS_STORAGE_MODE || "uploadRelay"}
              uploadRelayUrl={WALRUS_UPLOAD_RELAY_URL || "Not configured"}
              storageRuntimeMode={storageRuntime.mode}
              storageRuntimeNotice={storageRuntime.notice ?? undefined}
              storageRuntimeDiagnostics={storageRuntime.diagnostics}
              selectedProjectId={builder.values.selectedProjectId}
              selectedProject={builder.selectedProject}
              projects={projects}
              projectState={builder.values.projectState}
              onSetMobilePane={builder.setMobilePane}
              onSelectProject={handleSelectProject}
              onChangeVisibility={builder.setVisibility}
              onToggleEncryptSubmissions={builder.setEncryptSubmissions}
              onRegisterOnSui={() => void publish.handleRegisterOnSui()}
              onBack={() => builder.moveStep(-1)}
            />
          ) : null}
        </form>
      </section>
    </AdminAccessGate>
  );
}
