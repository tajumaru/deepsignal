import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  canFieldHaveConditionalChildren,
  getConditionalLogicCycle,
  getConditionalParentField,
  hasValidConditionalParent,
  hasValidConditionalValue,
  sanitizeConditionalLogicFields,
} from "../../../utils/formLogic";
import {
  createSmartTemplateBundle,
  createTemplateFields,
  getTemplateDefinition,
  normalizeFormPurpose,
  smartComposerTemplates,
} from "../../../lib/formTemplates";
import { normalizeFieldType } from "../../../lib/fieldTypes";
import { getSelectedProjectId, setSelectedProjectId } from "../../../lib/projectRegistry";
import { INITIAL_DRAFT_SNAPSHOT, initialFields, initialTemplate } from "../constants";
import type {
  BuilderStepKey,
  FieldType,
  FieldsStepValidationResult,
  FormBuilderValues,
  FormField,
  FormSection,
  MobileBuilderPane,
  ProjectOption,
  ResponseDeadlinePreset,
  Translate,
} from "../types";
import type { DraftSaveState } from "../types";
import {
  cloneField,
  CREATE_FORM_DRAFT_STORAGE_KEY,
  CREATE_FORM_GUEST_DRAFT_STORAGE_KEY,
  createField,
  createSection,
  serializeDraft,
} from "../utils";

interface UseCreateFormBuilderArgs {
  t: Translate;
  projects: ProjectOption[];
  freshStartToken?: string;
  mode?: "admin" | "guestDraft";
  draftSeed?: {
    templateKey?: string;
    idea?: string;
  };
}

export function useCreateFormBuilder({
  t,
  projects,
  freshStartToken = "",
  mode = "admin",
  draftSeed,
}: UseCreateFormBuilderArgs) {
  const hasLoadedDraftRef = useRef(false);
  const previousModeRef = useRef(mode);
  const draftStorageKey = mode === "guestDraft" ? CREATE_FORM_GUEST_DRAFT_STORAGE_KEY : CREATE_FORM_DRAFT_STORAGE_KEY;
  const isGuestDraftMode = mode === "guestDraft";
  const labelRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fieldCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(initialTemplate.key);
  const [title, setTitle] = useState(initialTemplate.title);
  const [description, setDescription] = useState(initialTemplate.description);
  const [headerImage, setHeaderImage] = useState<FormBuilderValues["headerImage"]>({
    url: "",
    alt: "",
    position: "center",
    source: "url",
    fileName: "",
  });
  const [headerLogo, setHeaderLogo] = useState<FormBuilderValues["headerLogo"]>({
    url: "",
    alt: "",
    source: "url",
    fileName: "",
  });
  const [fields, setFields] = useState(initialFields);
  const [sections, setSections] = useState<FormSection[]>([]);
  const [purpose, setPurpose] = useState(initialTemplate.purpose);
  const [visibility, setVisibility] = useState<"private" | "unlisted" | "public">("unlisted");
  const [identityPolicy, setIdentityPolicy] = useState<"anonymous_allowed" | "wallet_required">("anonymous_allowed");
  const [encryptSubmissions, setEncryptSubmissions] = useState(true);
  const [responseDeadlinePreset, setResponseDeadlinePreset] = useState<ResponseDeadlinePreset>("none");
  const [responseDeadlineCustomAt, setResponseDeadlineCustomAt] = useState("");
  const [currentStep, setCurrentStep] = useState<BuilderStepKey>("template");
  const [mobilePane, setMobilePane] = useState<MobileBuilderPane>("editor");
  const [fieldTypePickerOpen, setFieldTypePickerOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectIdState] = useState(() => (isGuestDraftMode ? "" : getSelectedProjectId()));
  const [projectState, setProjectState] = useState("");
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(INITIAL_DRAFT_SNAPSHOT);
  const [draftSaveState, setDraftSaveState] = useState<DraftSaveState>("idle");
  const [hasRecoverableDraft, setHasRecoverableDraft] = useState(false);
  const [activeFieldId, setActiveFieldId] = useState(initialFields[0]?.id ?? "");
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [dragOverFieldId, setDragOverFieldId] = useState<string | null>(null);
  const [dragOverPlacement, setDragOverPlacement] = useState<"before" | "after" | null>(null);
  const [pendingFocusFieldId, setPendingFocusFieldId] = useState(initialFields[0]?.id ?? "");

  const createOnSui = Boolean(selectedProjectId);
  const draftSnapshot = useMemo(
    () =>
      serializeDraft(
        title,
        description,
        headerImage,
        headerLogo,
        fields,
        purpose,
        visibility,
        identityPolicy,
        createOnSui,
        encryptSubmissions,
        sections,
        responseDeadlinePreset,
        responseDeadlineCustomAt,
      ),
    [
      createOnSui,
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
      title,
      visibility,
    ],
  );
  const isDirty = draftSnapshot !== lastSavedSnapshot;
  const hasValidTitle = Boolean(title.trim());
  const hasQuestions = fields.length > 0;
  const isReadyToPublish = hasValidTitle && hasQuestions;
  const selectedProject = projects.find((project) => project.objectId === selectedProjectId) ?? null;

  function resetBuilderState() {
    const nextFields = createTemplateFields(initialTemplate);
    const nextSelectedProjectId = isGuestDraftMode ? "" : getSelectedProjectId();
    setSelectedTemplateKey(initialTemplate.key);
    setTitle(initialTemplate.title);
    setDescription(initialTemplate.description);
    setHeaderImage({ url: "", alt: "", position: "center", source: "url", fileName: "" });
    setHeaderLogo({ url: "", alt: "", source: "url", fileName: "" });
    setFields(nextFields);
    setSections([]);
    setPurpose(initialTemplate.purpose);
    setVisibility("unlisted");
    setIdentityPolicy("anonymous_allowed");
    setEncryptSubmissions(!isGuestDraftMode);
    setResponseDeadlinePreset("none");
    setResponseDeadlineCustomAt("");
    setCurrentStep("template");
    setMobilePane("editor");
    setFieldTypePickerOpen(false);
    setSelectedProjectIdState(nextSelectedProjectId);
    setProjectState("");
    setLastSavedSnapshot(INITIAL_DRAFT_SNAPSHOT);
    setDraftSaveState("idle");
    setHasRecoverableDraft(false);
    setActiveFieldId(nextFields[0]?.id ?? "");
    setDraggedFieldId(null);
    setDragOverFieldId(null);
    setDragOverPlacement(null);
    setPendingFocusFieldId(nextFields[0]?.id ?? "");
  }

  useEffect(() => {
    if (isGuestDraftMode) {
      return;
    }
    setSelectedProjectId(selectedProjectId);
  }, [isGuestDraftMode, selectedProjectId]);

  useEffect(() => {
    if (previousModeRef.current === mode) {
      return;
    }
    previousModeRef.current = mode;
    hasLoadedDraftRef.current = false;
    setDraftSaveState("idle");
    setHasRecoverableDraft(false);
  }, [mode]);

  const seedGuestDraftFromIntent = useCallback(() => {
    const template = getTemplateDefinition(draftSeed?.templateKey ?? initialTemplate.key);
    const nextFields = createTemplateFields(template);
    const idea = draftSeed?.idea?.trim() ?? "";
    setSelectedTemplateKey(template.key);
    setTitle(idea || template.title);
    setDescription(idea ? `A quick form for ${idea.toLowerCase()}.` : template.description);
    setHeaderImage({ url: "", alt: "", position: "center", source: "url", fileName: "" });
    setHeaderLogo({ url: "", alt: "", source: "url", fileName: "" });
    setFields(nextFields);
    setSections([]);
    setPurpose(normalizeFormPurpose(template.purpose));
    setVisibility("unlisted");
    setIdentityPolicy("anonymous_allowed");
    setEncryptSubmissions(false);
    setResponseDeadlinePreset("none");
    setResponseDeadlineCustomAt("");
    setCurrentStep("fields");
    setSelectedProjectIdState("");
    setProjectState("");
    setActiveFieldId(nextFields[0]?.id ?? "");
    setPendingFocusFieldId(nextFields[0]?.id ?? "");
  }, [draftSeed?.idea, draftSeed?.templateKey]);

  function applyStoredDraft(rawDraft: string) {
    const parsedDraft = JSON.parse(rawDraft) as {
      selectedTemplateKey?: string;
      title?: string;
      description?: string;
      headerImage?: Partial<FormBuilderValues["headerImage"]>;
      headerLogo?: Partial<FormBuilderValues["headerLogo"]>;
      fields?: FormField[];
      sections?: FormSection[];
      purpose?: FormBuilderValues["purpose"];
      visibility?: FormBuilderValues["visibility"];
      identityPolicy?: FormBuilderValues["identityPolicy"];
      encryptSubmissions?: boolean;
      responseDeadlinePreset?: ResponseDeadlinePreset;
      responseDeadlineCustomAt?: string;
      currentStep?: BuilderStepKey;
      selectedProjectId?: string;
      projectState?: string;
    };
    if (!Array.isArray(parsedDraft.fields) || parsedDraft.fields.length === 0) {
      window.localStorage.removeItem(draftStorageKey);
      setHasRecoverableDraft(false);
      return;
    }
    setSelectedTemplateKey(parsedDraft.selectedTemplateKey ?? initialTemplate.key);
    setTitle(typeof parsedDraft.title === "string" ? parsedDraft.title : initialTemplate.title);
    setDescription(typeof parsedDraft.description === "string" ? parsedDraft.description : initialTemplate.description);
    setHeaderImage({
      url: typeof parsedDraft.headerImage?.url === "string" ? parsedDraft.headerImage.url : "",
      alt: typeof parsedDraft.headerImage?.alt === "string" ? parsedDraft.headerImage.alt : "",
      position:
        parsedDraft.headerImage?.position === "top" || parsedDraft.headerImage?.position === "bottom"
          ? parsedDraft.headerImage.position
          : "center",
      source: parsedDraft.headerImage?.source === "upload" ? "upload" : "url",
      fileName: typeof parsedDraft.headerImage?.fileName === "string" ? parsedDraft.headerImage.fileName : "",
    });
    setHeaderLogo({
      url: typeof parsedDraft.headerLogo?.url === "string" ? parsedDraft.headerLogo.url : "",
      alt: typeof parsedDraft.headerLogo?.alt === "string" ? parsedDraft.headerLogo.alt : "",
      source: parsedDraft.headerLogo?.source === "upload" ? "upload" : "url",
      fileName: typeof parsedDraft.headerLogo?.fileName === "string" ? parsedDraft.headerLogo.fileName : "",
    });
    setFields(
      sanitizeConditionalLogicFields(
        parsedDraft.fields.map((field) => ({
          ...field,
          type: normalizeFieldType(field.type),
        })),
      ),
    );
    setSections(Array.isArray(parsedDraft.sections) ? parsedDraft.sections : []);
    setPurpose(parsedDraft.purpose ?? initialTemplate.purpose);
    setVisibility(parsedDraft.visibility ?? "unlisted");
    setIdentityPolicy(parsedDraft.identityPolicy === "wallet_required" ? "wallet_required" : "anonymous_allowed");
    setEncryptSubmissions(parsedDraft.encryptSubmissions ?? !isGuestDraftMode);
    setResponseDeadlinePreset(parsedDraft.responseDeadlinePreset ?? "none");
    setResponseDeadlineCustomAt(parsedDraft.responseDeadlineCustomAt ?? "");
    setCurrentStep(parsedDraft.currentStep ?? "fields");
    setSelectedProjectIdState(isGuestDraftMode ? "" : parsedDraft.selectedProjectId ?? "");
    setProjectState(parsedDraft.projectState ?? "");
    setActiveFieldId(parsedDraft.fields[0]?.id ?? "");
    setPendingFocusFieldId(parsedDraft.fields[0]?.id ?? "");
    setDraftSaveState("restored");
    setHasRecoverableDraft(false);
  }

  useEffect(() => {
    if (hasLoadedDraftRef.current) {
      return;
    }
    hasLoadedDraftRef.current = true;
    try {
      if (freshStartToken) {
        window.localStorage.removeItem(draftStorageKey);
      }
      const rawDraft = freshStartToken ? null : window.localStorage.getItem(draftStorageKey);
      if (!rawDraft) {
        if (isGuestDraftMode) {
          seedGuestDraftFromIntent();
        }
        return;
      }
      setHasRecoverableDraft(true);
    } catch (error) {
      console.warn("Failed to restore create form draft.", error);
      window.localStorage.removeItem(draftStorageKey);
    }
  }, [draftSeed?.idea, draftSeed?.templateKey, draftStorageKey, freshStartToken, isGuestDraftMode, seedGuestDraftFromIntent]);

  useEffect(() => {
    if (isGuestDraftMode || !hasLoadedDraftRef.current || !freshStartToken) {
      return;
    }
    window.localStorage.removeItem(draftStorageKey);
    resetBuilderState();
    // resetBuilderState closes over the current builder state; this effect only responds to explicit fresh starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey, freshStartToken, isGuestDraftMode]);

  useEffect(() => {
    if (!pendingFocusFieldId) {
      return;
    }
    const node = labelRefs.current[pendingFocusFieldId];
    const cardNode = fieldCardRefs.current[pendingFocusFieldId];
    if (cardNode) {
      cardNode.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (!node) {
      return;
    }
    node.focus();
    node.select();
    setActiveFieldId(pendingFocusFieldId);
    setPendingFocusFieldId("");
  }, [fields, pendingFocusFieldId]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const handleDuplicateShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "d") {
        return;
      }
      event.preventDefault();
      duplicateFieldAt(activeFieldId);
    };
    window.addEventListener("keydown", handleDuplicateShortcut);
    return () => window.removeEventListener("keydown", handleDuplicateShortcut);
  }, [activeFieldId]);

  useEffect(() => {
    if (!hasLoadedDraftRef.current) {
      return;
    }
    if (draftSnapshot === INITIAL_DRAFT_SNAPSHOT) {
      window.localStorage.removeItem(draftStorageKey);
      if (draftSaveState !== "restored") {
        setDraftSaveState("idle");
      }
      return;
    }
    setDraftSaveState((current) => (current === "restored" ? current : "saving"));
    const timeoutId = window.setTimeout(() => {
      const payload = {
        selectedTemplateKey,
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
        currentStep,
        selectedProjectId,
        projectState,
      };
      window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
      setDraftSaveState("saved");
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [
    currentStep,
    description,
    draftSaveState,
    draftStorageKey,
    draftSnapshot,
    encryptSubmissions,
    fields,
    headerImage,
    headerLogo,
    identityPolicy,
    projectState,
    purpose,
    responseDeadlineCustomAt,
    responseDeadlinePreset,
    sections,
    selectedProjectId,
    selectedTemplateKey,
    title,
    visibility,
  ]);

  function goToStep(step: BuilderStepKey) {
    setCurrentStep(step);
    if (step === "publish") {
      setMobilePane("preview");
    }
  }

  function moveStep(direction: -1 | 1) {
    const steps: BuilderStepKey[] = ["template", "info", "fields", "publish"];
    const index = steps.indexOf(currentStep);
    const next = steps[index + direction];
    if (next) goToStep(next);
  }

  function replaceFields(nextFields: typeof fields) {
    setFields(nextFields);
    setActiveFieldId(nextFields[0]?.id ?? "");
    setPendingFocusFieldId(nextFields[0]?.id ?? "");
  }

  function applyTemplate(templateKey: string) {
    const template = getTemplateDefinition(templateKey);
    const nextFields = createTemplateFields(template);
    startTransition(() => {
      setSelectedTemplateKey(template.key);
      setPurpose(normalizeFormPurpose(template.purpose));
      setTitle(template.title);
      setDescription(template.description);
      setHeaderImage({ url: "", alt: "", position: "center", source: "url", fileName: "" });
      setHeaderLogo({ url: "", alt: "", source: "url", fileName: "" });
      setSections([]);
      setVisibility("unlisted");
      setIdentityPolicy("anonymous_allowed");
      setResponseDeadlinePreset("none");
      setResponseDeadlineCustomAt("");
      replaceFields(nextFields);
      goToStep("info");
    });
  }

  function updateField(index: number, nextField: typeof fields[number]) {
    setFields((current) => {
      const previousField = current[index];
      let invalidatedConditionalChildren = false;
      const nextOptions =
        nextField.type === "dropdown" || nextField.type === "checkbox"
          ? (nextField.options ?? []).map((option) => option.trim()).filter(Boolean)
          : [];

      const updatedFields = current.map((field, currentIndex) => {
        if (currentIndex === index) {
          return nextField;
        }
        if (field.conditionalParentId !== previousField?.id) {
          return field;
        }
        if (nextOptions.length === 0 || (field.conditionalValue && !nextOptions.includes(field.conditionalValue))) {
          invalidatedConditionalChildren = true;
          return {
            ...field,
            conditionalValue: undefined,
          };
        }
        return field;
      });

      if (invalidatedConditionalChildren) {
        window.setTimeout(() => window.alert(t("conditionalOptionRemovedWarning")), 0);
      }

      return sanitizeConditionalLogicFields(updatedFields);
    });
  }

  function insertField(type: FieldType, afterIndex?: number, sectionId?: string) {
    const activeField = fields.find((field) => field.id === activeFieldId);
    const resolvedSectionId = sectionId ?? activeField?.sectionId;
    const nextField = createField(type, resolvedSectionId, {
      confirmationLabel: t("confirmationDefaultLabel"),
      confirmationPlaceholder: t("confirmationDefaultPlaceholder"),
      options: [t("optionDefault", { index: 1 }), t("optionDefault", { index: 2 })],
    });
    setFields((current) => {
      if (afterIndex === undefined || afterIndex < 0 || afterIndex >= current.length) {
        if (resolvedSectionId) {
          const lastSectionIndex = [...current].map((field) => field.sectionId).lastIndexOf(resolvedSectionId);
          if (lastSectionIndex >= 0) {
            const next = [...current];
            next.splice(lastSectionIndex + 1, 0, nextField);
            return next;
          }
        }
        return [...current, nextField];
      }
      const next = [...current];
      next.splice(afterIndex + 1, 0, nextField);
      return next;
    });
    setPendingFocusFieldId(nextField.id);
    setActiveFieldId(nextField.id);
    setMobilePane("editor");
  }

  function duplicateFieldAt(fieldId: string) {
    if (!fieldId) return;
    setFields((current) => {
      const sourceIndex = current.findIndex((field) => field.id === fieldId);
      if (sourceIndex === -1) return current;
      const nextField = cloneField(current[sourceIndex]);
      const next = [...current];
      next.splice(sourceIndex + 1, 0, nextField);
      setPendingFocusFieldId(nextField.id);
      setActiveFieldId(nextField.id);
      return next;
    });
  }

  function removeField(fieldId: string) {
    setFields((current) => {
      if (current.length === 1) {
        return current;
      }
      const next = sanitizeConditionalLogicFields(
        current.filter((field) => field.id !== fieldId && field.conditionalParentId !== fieldId),
      );
      if (activeFieldId === fieldId) {
        setActiveFieldId(next[0]?.id ?? "");
      }
      return next;
    });
  }

  function insertConditionalField(parentFieldId: string) {
    if (!parentFieldId) return;
    setFields((current) => {
      const parentIndex = current.findIndex((field) => field.id === parentFieldId);
      if (parentIndex === -1) {
        return current;
      }
      const parentField = current[parentIndex];
      if (!canFieldHaveConditionalChildren(parentField)) {
        return current;
      }
      const nextField = createField("shortText", parentField.sectionId, {
        confirmationLabel: t("confirmationDefaultLabel"),
        confirmationPlaceholder: t("confirmationDefaultPlaceholder"),
        options: [t("optionDefault", { index: 1 }), t("optionDefault", { index: 2 })],
      });
      nextField.label = t("conditionalQuestionDefaultLabel");
      nextField.placeholder = t("placeholderExample");
      nextField.conditionalParentId = parentField.id;
      nextField.conditionalValue = (parentField.options ?? []).map((option) => option.trim()).filter(Boolean)[0];
      const next = [...current];
      const lastChildIndex = current.reduce((latestIndex, field, fieldIndex) => {
        return field.conditionalParentId === parentField.id ? fieldIndex : latestIndex;
      }, parentIndex);
      next.splice(lastChildIndex + 1, 0, nextField);
      setPendingFocusFieldId(nextField.id);
      setActiveFieldId(nextField.id);
      return sanitizeConditionalLogicFields(next);
    });
    setMobilePane("editor");
  }

  function reorderFields(sourceId: string, targetId: string, placement: "before" | "after" = "before") {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setFields((current) => {
      const sourceIndex = current.findIndex((field) => field.id === sourceId);
      const targetIndex = current.findIndex((field) => field.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      const adjustedTargetIndex = next.findIndex((field) => field.id === targetId);
      const insertIndex = placement === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
      next.splice(insertIndex, 0, moved);
      return next;
    });
    setDragOverFieldId(null);
    setDragOverPlacement(null);
  }

  function addSection(preset?: string) {
    const nextSection = createSection(preset ?? "");
    setSections((current) => [...current, nextSection]);
  }

  function updateSection(sectionId: string, patch: Partial<FormSection>) {
    setSections((current) => current.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)));
  }

  function removeSection(sectionId: string) {
    setSections((current) => current.filter((section) => section.id !== sectionId));
    setFields((current) =>
      current.map((field) => (field.sectionId === sectionId ? { ...field, sectionId: undefined } : field)),
    );
  }

  function insertSmartTemplate(templateKey: string) {
    const template = smartComposerTemplates.find((candidate) => candidate.key === templateKey);
    if (!template) {
      return;
    }
    const bundle = createSmartTemplateBundle(template);
    setSections((current) => [...current, ...bundle.sections]);
    setFields((current) => [...current, ...bundle.fields]);
    setPendingFocusFieldId(bundle.fields[0]?.id ?? "");
    setActiveFieldId(bundle.fields[0]?.id ?? "");
    setMobilePane("editor");
  }

  function focusFieldError(fieldId: string) {
    setMobilePane("editor");
    setActiveFieldId(fieldId);
    setPendingFocusFieldId(fieldId);
  }

  function validateFieldsStep(): FieldsStepValidationResult {
    if (fields.length === 0) return { isValid: false, error: t("errorNeedField") };

    const emptyLabelField = fields.find((field) => !field.label.trim());
    if (emptyLabelField) {
      focusFieldError(emptyLabelField.id);
      return { isValid: false, error: t("errorEveryFieldNeedsLabel"), fieldId: emptyLabelField.id };
    }

    const emptyOptionsField = fields.find(
      (field) =>
        (field.type === "dropdown" || field.type === "checkbox") &&
        !(field.options ?? []).map((option) => option.trim()).filter(Boolean).length,
    );
    if (emptyOptionsField) {
      focusFieldError(emptyOptionsField.id);
      return { isValid: false, error: t("errorFieldNeedsOption"), fieldId: emptyOptionsField.id };
    }

    const incompleteMatrixField = fields.find(
      (field) =>
        field.type === "matrix" &&
        (!(field.rows ?? []).map((row) => row.trim()).filter(Boolean).length ||
          !(field.columns ?? []).map((column) => column.trim()).filter(Boolean).length),
    );
    if (incompleteMatrixField) {
      focusFieldError(incompleteMatrixField.id);
      return { isValid: false, error: t("errorMatrixNeedsRowsAndColumns"), fieldId: incompleteMatrixField.id };
    }

    const invalidConditionalField = fields.find((field) => !hasValidConditionalParent(field, fields) || !hasValidConditionalValue(field, fields));
    if (invalidConditionalField) {
      focusFieldError(invalidConditionalField.id);
      return {
        isValid: false,
        error: t("errorConditionalQuestionNeedsValue"),
        fieldId: invalidConditionalField.id,
      };
    }

    const nestedConditionalField = fields.find((field) => {
      const parent = getConditionalParentField(field, fields);
      return Boolean(field.conditionalParentId && parent?.conditionalParentId);
    });
    if (nestedConditionalField) {
      focusFieldError(nestedConditionalField.id);
      return {
        isValid: false,
        error: t("errorConditionalNesting"),
        fieldId: nestedConditionalField.id,
      };
    }

    const cycle = getConditionalLogicCycle(fields);
    if (cycle) {
      const relatedFields = cycle.fieldIds
        .map((fieldId) => fields.find((field) => field.id === fieldId))
        .filter((field): field is (typeof fields)[number] => Boolean(field));
      const firstFieldId = relatedFields[0]?.id;
      if (firstFieldId) {
        focusFieldError(firstFieldId);
      }
      const relatedLabels = relatedFields
        .map((field) => field.label.trim() || t("fieldLabel", { index: fields.findIndex((item) => item.id === field.id) + 1 }))
        .join(" -> ");
      return {
        isValid: false,
        error: t("errorConditionalLogicCycleDetails", { fields: relatedLabels || t("conditionalLogic") }),
        fieldId: firstFieldId,
        relatedFieldIds: relatedFields.map((field) => field.id),
      };
    }

    return { isValid: true, error: "" };
  }

  function confirmDiscardChanges() {
    return !isDirty || window.confirm(t("discardChangesConfirm"));
  }

  function markSaved() {
    setLastSavedSnapshot(draftSnapshot);
    window.localStorage.removeItem(draftStorageKey);
    setDraftSaveState("idle");
    setHasRecoverableDraft(false);
  }

  function restoreRecoverableDraft() {
    const rawDraft = window.localStorage.getItem(draftStorageKey);
    if (!rawDraft) {
      setHasRecoverableDraft(false);
      if (isGuestDraftMode) {
        seedGuestDraftFromIntent();
      }
      return;
    }
    try {
      applyStoredDraft(rawDraft);
    } catch (error) {
      console.warn("Failed to restore create form draft.", error);
      window.localStorage.removeItem(draftStorageKey);
      setHasRecoverableDraft(false);
    }
  }

  function discardRecoverableDraft() {
    window.localStorage.removeItem(draftStorageKey);
    setHasRecoverableDraft(false);
    if (isGuestDraftMode) {
      seedGuestDraftFromIntent();
    } else {
      resetBuilderState();
    }
  }

  const values: FormBuilderValues = {
    selectedTemplateKey,
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
    currentStep,
    mobilePane,
    fieldTypePickerOpen,
    activeFieldId,
    draggedFieldId,
    dragOverFieldId,
    dragOverPlacement,
    selectedProjectId,
    projectState,
  };

  return {
    values,
    refs: { labelRefs, fieldCardRefs },
    draftSnapshot,
    draftSaveState,
    hasRecoverableDraft,
    isDirty,
    hasValidTitle,
    hasQuestions,
    isReadyToPublish,
    selectedProject,
    setTitle,
    setDescription,
    setHeaderImage,
    setHeaderLogo,
    setEncryptSubmissions,
    setIdentityPolicy,
    setResponseDeadlinePreset,
    setResponseDeadlineCustomAt,
    setVisibility,
    setFieldTypePickerOpen,
    setMobilePane,
    setActiveFieldId,
    setDraggedFieldId,
    setDragOverFieldId,
    setDragOverPlacement,
    setSelectedProjectIdState,
    setProjectState,
    goToStep,
    moveStep,
    applyTemplate,
    updateField,
    insertField,
    duplicateFieldAt,
    removeField,
    insertConditionalField,
    reorderFields,
    insertSmartTemplate,
    addSection,
    updateSection,
    removeSection,
    validateFieldsStep,
    confirmDiscardChanges,
    markSaved,
    restoreRecoverableDraft,
    discardRecoverableDraft,
  };
}
