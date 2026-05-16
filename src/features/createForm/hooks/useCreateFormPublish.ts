import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  buildCriticalFailureDiagnostics,
  createCriticalFailure,
  type CriticalFailure,
} from "../../../lib/criticalFailure";
import { getAbsolutePublicFormUrl, getPublicFormPath } from "../../../lib/publicLinks";
import { createFormOnChain } from "../../../lib/projectRegistry";
import {
  getResponseDeadlineFromPreset,
  parseCustomResponseDeadline,
} from "../../../lib/responseDeadline";
import { isLocalFallbackBlob } from "../../../lib/proof";
import { publishForm } from "../services";
import { localStorageAdapter } from "../../../storage/localStorageAdapter";
import { saveFormMetadataOverlay } from "../../../storage/formMetadataOverlay";
import {
  createWalrusCostEstimate,
  type WalrusCostEstimate,
} from "../../../storage/walrusCostEstimate";
import { getCreateFormEncryptionReadiness } from "../encryptionReadiness";
import type {
  CreateFormTransaction,
  FormField,
  FormHeaderImagePosition,
  FormIdentityPolicy,
  FormPurpose,
  FormSection,
  FormVisibility,
  PreparedPublishForm,
  ProjectOption,
  PublishOverlayState,
  FieldsStepValidationResult,
  TransactionConfirmation,
  Translate,
} from "../types";
import { buildFormSchema } from "../utils";

interface UseCreateFormPublishArgs {
  t: Translate;
  accountAddress?: string;
  creationMode: "admin" | "guest";
  title: string;
  description: string;
  headerImage: {
    url: string;
    alt: string;
    position: FormHeaderImagePosition;
    source?: "url" | "upload";
    fileName?: string;
  };
  headerLogo: {
    url: string;
    alt: string;
    source?: "url" | "upload";
    fileName?: string;
  };
  fields: FormField[];
  sections: FormSection[];
  purpose: FormPurpose;
  visibility: FormVisibility;
  identityPolicy: FormIdentityPolicy;
  encryptSubmissions: boolean;
  responseDeadlinePreset: "none" | "1h" | "24h" | "7d" | "30d" | "custom";
  responseDeadlineCustomAt: string;
  isDirty: boolean;
  selectedProject: ProjectOption | null;
  setProjectState: (value: string) => void;
  signAndExecuteTransaction: (transaction: CreateFormTransaction) => Promise<{ digest: string }>;
  waitForTransaction: (digest: string) => Promise<TransactionConfirmation>;
  validateFieldsStep: () => FieldsStepValidationResult;
  goToStep: (step: "info" | "fields" | "publish") => void;
  onSaved: (form: PreparedPublishForm) => void;
}

const initialOverlayState: PublishOverlayState = {
  open: false,
  stageIndex: 0,
  blobId: "",
  typedBlobId: "",
  linkCopied: false,
  blobCopied: false,
  storageMode: "walrus",
  resultNote: "",
  activeStageStatus: "",
  activeStageDetail: "",
};

export function useCreateFormPublish({
  t,
  accountAddress,
  creationMode,
  title,
  description,
  headerImage,
  headerLogo,
  fields,
  sections,
  purpose,
  visibility,
  identityPolicy,
  encryptSubmissions,
  responseDeadlinePreset,
  responseDeadlineCustomAt,
  isDirty,
  selectedProject,
  setProjectState,
  signAndExecuteTransaction,
  waitForTransaction,
  validateFieldsStep,
  goToStep,
  onSaved,
}: UseCreateFormPublishArgs) {
  const publishRunRef = useRef(0);
  const blobTypingTimerRef = useRef<number | null>(null);
  const [savedForm, setSavedForm] = useState<PreparedPublishForm | null>(null);
  const [error, setError] = useState("");
  const [failure, setFailure] = useState<CriticalFailure | null>(null);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [registeringOnSui, setRegisteringOnSui] = useState(false);
  const [overlay, setOverlay] = useState<PublishOverlayState>(initialOverlayState);
  const [walrusCostEstimate, setWalrusCostEstimate] = useState<WalrusCostEstimate | null>(null);

  useEffect(() => {
    if (savedForm && isDirty) {
      setSavedForm(null);
    }
  }, [isDirty, savedForm]);

  useEffect(() => {
    if (blobTypingTimerRef.current) {
      window.clearTimeout(blobTypingTimerRef.current);
      blobTypingTimerRef.current = null;
    }
    setOverlay((current) => ({ ...current, typedBlobId: "" }));
    if (!overlay.blobId) {
      return;
    }
    let cursor = 0;
    const frame = () => {
      cursor += 1;
      setOverlay((current) => ({ ...current, typedBlobId: `BLOB://${overlay.blobId.slice(0, cursor)}` }));
      if (cursor < overlay.blobId.length) {
        blobTypingTimerRef.current = window.setTimeout(frame, 28);
      }
    };
    blobTypingTimerRef.current = window.setTimeout(frame, 140);
    return () => {
      if (blobTypingTimerRef.current) {
        window.clearTimeout(blobTypingTimerRef.current);
      }
    };
  }, [overlay.blobId]);

  useEffect(() => {
    return () => {
      if (blobTypingTimerRef.current) {
        window.clearTimeout(blobTypingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      const responseDeadline =
        responseDeadlinePreset === "custom"
          ? parseCustomResponseDeadline(responseDeadlineCustomAt)
          : getResponseDeadlineFromPreset(responseDeadlinePreset);
      const responseDeadlineMode =
        responseDeadlinePreset === "none"
          ? "none"
          : responseDeadlinePreset === "custom"
            ? "custom"
            : "relative";
      const estimateForm = buildFormSchema({
        title,
        description,
        headerImage,
        headerLogo,
        fields,
        sections,
        purpose,
        visibility,
        identityPolicy,
        ownerAddress: accountAddress ?? "",
        creationMode,
        projectId: selectedProject?.objectId,
        projectName: selectedProject?.name,
        encryptSubmissions,
        responseDeadline,
        responseDeadlineMode,
      });
      void createWalrusCostEstimate({
        ...estimateForm,
        formMetadataDigest: "estimate",
      }).then((estimate) => {
        if (!cancelled) {
          setWalrusCostEstimate(estimate);
        }
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    accountAddress,
    creationMode,
    description,
    encryptSubmissions,
    fields,
    headerImage,
    headerLogo,
    identityPolicy,
    purpose,
    responseDeadlineCustomAt,
    responseDeadlinePreset,
    sections,
    selectedProject?.name,
    selectedProject?.objectId,
    title,
    visibility,
  ]);

  const publishChecks = useMemo(
    () =>
      savedForm
        ? [
            isLocalFallbackBlob(savedForm.blobId) ? t("signalStoredLocally") : t("signalStoredOnWalrus"),
            t("publishChecklistBlob"),
            t("publishChecklistInbox"),
            ...(savedForm.manifestBlobId ? [t("publishChecklistManifest")] : []),
          ]
        : [],
    [savedForm, t],
  );

  const publicPath = savedForm ? getPublicFormPath(savedForm.id, savedForm.manifestBlobId) : "";
  const isCrossDeviceShareReady = Boolean(savedForm?.manifestBlobId);
  const publicUrl =
    savedForm && savedForm.manifestBlobId
      ? getAbsolutePublicFormUrl(savedForm.id, savedForm.manifestBlobId)
      : publicPath;

  function updateOverlay(patch: Partial<PublishOverlayState>) {
    setOverlay((current) => ({ ...current, ...patch }));
  }

  async function copyText(value: string, onCopied: (copied: boolean) => void) {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      onCopied(true);
      window.setTimeout(() => onCopied(false), 1800);
    } catch (copyError) {
      console.error(copyError);
    }
  }

  async function copyDiagnostics() {
    if (!failure) {
      return;
    }
    try {
      await navigator.clipboard.writeText(buildCriticalFailureDiagnostics(failure));
      setDiagnosticsCopied(true);
      window.setTimeout(() => setDiagnosticsCopied(false), 1800);
    } catch (copyError) {
      console.error(copyError);
    }
  }

  async function handleCopyLink() {
    await copyText(publicUrl, (copied) => updateOverlay({ linkCopied: copied }));
  }

  async function handleCopyBlobId() {
    await copyText(overlay.blobId, (copied) => updateOverlay({ blobCopied: copied }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) {
      return;
    }
    setError("");
    setFailure(null);
    setDiagnosticsCopied(false);
    setProjectState("");

    if (!title.trim()) {
      setError(t("errorFormTitleRequired"));
      goToStep("info");
      return;
    }

    const validation = validateFieldsStep();
    if (!validation.isValid) {
      setError(validation.error);
      goToStep("fields");
      return;
    }

    if (!accountAddress) {
      const nextError = t("connectWalletFirst");
      setError(nextError);
      setFailure(
        createCriticalFailure({
          error: new Error(nextError),
          surface: "wallet",
          step: "publish",
          noDataSubmitted: true,
          diagnostics: { selectedProjectId: selectedProject?.objectId ?? "" },
        }),
      );
      goToStep("publish");
      return;
    }

    const blockingEncryptionWarning = getCreateFormEncryptionReadiness({
      encryptSubmissions,
      projectId: selectedProject?.objectId,
      ownerAddress: accountAddress,
    }).find((warning) => warning.blocksPublish);
    if (blockingEncryptionWarning) {
      setError(blockingEncryptionWarning.message);
      setFailure(
        createCriticalFailure({
          error: new Error(blockingEncryptionWarning.message),
          surface: blockingEncryptionWarning.kind === "network-mismatch" ? "wallet" : "seal",
          step: "publish",
          noDataSubmitted: true,
          diagnostics: { warningKind: blockingEncryptionWarning.kind },
        }),
      );
      goToStep("publish");
      return;
    }

    const responseDeadline =
      responseDeadlinePreset === "custom"
        ? parseCustomResponseDeadline(responseDeadlineCustomAt)
        : getResponseDeadlineFromPreset(responseDeadlinePreset);
    const responseDeadlineMode =
      responseDeadlinePreset === "none"
        ? "none"
        : responseDeadlinePreset === "custom"
          ? "custom"
          : "relative";

    if (responseDeadlinePreset === "custom") {
      if (!responseDeadline) {
        setError(t("customDateRequired"));
        goToStep("info");
        return;
      }
      if (responseDeadline <= Date.now()) {
        setError(t("customDateFuture"));
        goToStep("info");
        return;
      }
    }

    const runId = publishRunRef.current + 1;
    publishRunRef.current = runId;
    setSaving(true);
    setOverlay({ ...initialOverlayState, open: true });

    const form = buildFormSchema({
      title,
      description,
      headerImage,
      headerLogo,
      fields,
      sections,
      purpose,
      visibility,
      identityPolicy,
      ownerAddress: accountAddress,
      creationMode,
      projectId: selectedProject?.objectId,
      projectName: selectedProject?.name,
      encryptSubmissions,
      responseDeadline,
      responseDeadlineMode,
    });

    try {
      const finalForm = await publishForm({
        t,
        form,
        selectedProject,
        setPublishStageIndex: (stageIndex) => updateOverlay({ stageIndex }),
        setPublishBlobId: (blobId) => updateOverlay({ blobId }),
        setPublishStorageMode: (storageMode) => updateOverlay({ storageMode }),
        setPublishResultNote: (resultNote) => updateOverlay({ resultNote }),
        setPublishActiveStageStatus: (activeStageStatus) => updateOverlay({ activeStageStatus }),
        setPublishActiveStageDetail: (activeStageDetail) => updateOverlay({ activeStageDetail }),
        setProjectState,
        shouldContinue: () => publishRunRef.current === runId,
      });

      if (!finalForm) {
        return;
      }

      setSavedForm(finalForm);
      onSaved(finalForm);
      setError("");
      setFailure(null);
    } catch (submitError) {
      updateOverlay({ open: false });
      const message = submitError instanceof Error ? submitError.message : t("saveFailed");
      setError(message);
      const nextFailure = createCriticalFailure({
        error: submitError instanceof Error ? submitError : new Error(message),
        surface:
          message.toLowerCase().includes("wallet")
            ? "wallet"
            : message.toLowerCase().includes("seal") || message.toLowerCase().includes("encrypt")
              ? "seal"
              : "walrus",
        step: "publish",
        noDataSubmitted: true,
        diagnostics: {
          selectedProjectId: selectedProject?.objectId ?? "",
          encryptSubmissions,
        },
      });
      setFailure(nextFailure);
      if (nextFailure.kind === "wallet_rejected") {
        goToStep("fields");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleRegisterOnSui() {
    if (!savedForm?.projectId || !savedForm.formMetadataDigest) {
      return;
    }

    setRegisteringOnSui(true);
    setError("");
    setFailure(null);
    setDiagnosticsCopied(false);
    try {
      const tx = createFormOnChain({
        projectId: savedForm.projectId,
        title: savedForm.title,
        metadataDigest: savedForm.formMetadataDigest,
      });
      const result = await signAndExecuteTransaction(tx);
      const confirmed = await waitForTransaction(result.digest);
      const formCreatedEvent = (confirmed.events ?? []).find((chainEvent) =>
        String(chainEvent.type ?? "").endsWith("::FormCreated"),
      );
      const rawFormId = (formCreatedEvent?.parsedJson as { form_id?: string | number } | undefined)?.form_id;
      const parsedFormId = typeof rawFormId === "number" ? rawFormId : Number(rawFormId ?? Number.NaN);
      if (!Number.isFinite(parsedFormId)) {
        throw new Error("Sui registration completed, but the new form id was not returned.");
      }
      const registeredForm = {
        ...savedForm,
        onchainFormId: parsedFormId,
        isOnchain: true,
        registrationMode: "sui",
      } satisfies PreparedPublishForm;
      await localStorageAdapter.saveForm(registeredForm);
      saveFormMetadataOverlay(registeredForm);
      setSavedForm(registeredForm);
      onSaved(registeredForm);
    } catch (registerError) {
      const message = registerError instanceof Error ? registerError.message : t("saveFailed");
      setError(message);
      setFailure(
        createCriticalFailure({
          error: registerError instanceof Error ? registerError : new Error(message),
          surface: "registry",
          step: "registry",
          noDataSubmitted: false,
          uploadSucceeded: true,
          registryUpdated: false,
          diagnostics: {
            projectId: savedForm.projectId,
            blobId: savedForm.blobId,
            manifestBlobId: savedForm.manifestBlobId,
          },
        }),
      );
    } finally {
      setRegisteringOnSui(false);
    }
  }

  return {
    savedForm,
    error,
    failure,
    diagnosticsCopied,
    saving,
    registeringOnSui,
    overlay,
    walrusCostEstimate,
    publishChecks,
    publicPath,
    publicUrl,
    isCrossDeviceShareReady,
    setError,
    setOverlay,
    handleSubmit,
    handleRegisterOnSui,
    handleCopyLink,
    handleCopyBlobId,
    copyDiagnostics,
  };
}
