import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { getPublicFormPath } from "../../../lib/publicLinks";
import { createFormOnChain } from "../../../lib/projectRegistry";
import { isLocalFallbackBlob } from "../../../lib/proof";
import { publishForm } from "../services";
import { localStorageAdapter } from "../../../storage/localStorageAdapter";
import { saveFormMetadataOverlay } from "../../../storage/formMetadataOverlay";
import type {
  CreateFormTransaction,
  FormField,
  FormPurpose,
  FormSection,
  PreparedPublishForm,
  ProjectOption,
  PublishOverlayState,
  TransactionConfirmation,
  Translate,
} from "../types";
import { buildFormSchema } from "../utils";

interface UseCreateFormPublishArgs {
  t: Translate;
  accountAddress?: string;
  title: string;
  description: string;
  fields: FormField[];
  sections: FormSection[];
  purpose: FormPurpose;
  encryptSubmissions: boolean;
  isDirty: boolean;
  selectedProject: ProjectOption | null;
  setProjectState: (value: string) => void;
  signAndExecuteTransaction: (transaction: CreateFormTransaction) => Promise<{ digest: string }>;
  waitForTransaction: (digest: string) => Promise<TransactionConfirmation>;
  validateFieldsStep: () => { isValid: boolean; error: string };
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
};

export function useCreateFormPublish({
  t,
  accountAddress,
  title,
  description,
  fields,
  sections,
  purpose,
  encryptSubmissions,
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
  const [saving, setSaving] = useState(false);
  const [registeringOnSui, setRegisteringOnSui] = useState(false);
  const [overlay, setOverlay] = useState<PublishOverlayState>(initialOverlayState);

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
  const publicUrl = savedForm && typeof window !== "undefined" ? `${window.location.origin}${publicPath}` : publicPath;
  const isCrossDeviceShareReady = Boolean(savedForm?.manifestBlobId);

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

  async function handleCopyLink() {
    await copyText(publicUrl, (copied) => updateOverlay({ linkCopied: copied }));
  }

  async function handleCopyBlobId() {
    await copyText(overlay.blobId, (copied) => updateOverlay({ blobCopied: copied }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
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
      setError(t("connectWalletFirst"));
      goToStep("publish");
      return;
    }

    const runId = publishRunRef.current + 1;
    publishRunRef.current = runId;
    setSaving(true);
    setOverlay({ ...initialOverlayState, open: true });

    const form = buildFormSchema({
      title,
      description,
      fields,
      sections,
      purpose,
      ownerAddress: accountAddress,
      projectId: selectedProject?.objectId,
      projectName: selectedProject?.name,
      encryptSubmissions,
    });

    try {
      const finalForm = await publishForm({
        form,
        selectedProject,
        setPublishStageIndex: (stageIndex) => updateOverlay({ stageIndex }),
        setPublishBlobId: (blobId) => updateOverlay({ blobId }),
        setPublishStorageMode: (storageMode) => updateOverlay({ storageMode }),
        setPublishResultNote: (resultNote) => updateOverlay({ resultNote }),
        setProjectState,
        shouldContinue: () => publishRunRef.current === runId,
      });

      if (!finalForm) {
        return;
      }

      setSavedForm(finalForm);
      onSaved(finalForm);
      setError("");
    } catch (submitError) {
      updateOverlay({ open: false });
      setError(submitError instanceof Error ? submitError.message : t("saveFailed"));
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
      setError(registerError instanceof Error ? registerError.message : t("saveFailed"));
    } finally {
      setRegisteringOnSui(false);
    }
  }

  return {
    savedForm,
    error,
    saving,
    registeringOnSui,
    overlay,
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
  };
}
