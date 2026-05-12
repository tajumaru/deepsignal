import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { getConditionalLogicCycle, sanitizeConditionalLogicFields } from "../../../utils/formLogic";
import {
  createSmartTemplateBundle,
  createTemplateFields,
  getTemplateDefinition,
  normalizeFormPurpose,
  smartComposerTemplates,
} from "../../../lib/formTemplates";
import { getSelectedProjectId, setSelectedProjectId } from "../../../lib/projectRegistry";
import { INITIAL_DRAFT_SNAPSHOT, initialFields, initialTemplate } from "../constants";
import type {
  BuilderStepKey,
  FieldType,
  FieldsStepValidationResult,
  FormBuilderValues,
  FormSection,
  MobileBuilderPane,
  ProjectOption,
  Translate,
} from "../types";
import { cloneField, createField, createSection, serializeDraft } from "../utils";

interface UseCreateFormBuilderArgs {
  t: Translate;
  projects: ProjectOption[];
}

export function useCreateFormBuilder({ t, projects }: UseCreateFormBuilderArgs) {
  const labelRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fieldCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(initialTemplate.key);
  const [title, setTitle] = useState(initialTemplate.title);
  const [description, setDescription] = useState(initialTemplate.description);
  const [fields, setFields] = useState(initialFields);
  const [sections, setSections] = useState<FormSection[]>([]);
  const [purpose, setPurpose] = useState(initialTemplate.purpose);
  const [visibility, setVisibility] = useState<"private" | "unlisted" | "public">("unlisted");
  const [encryptSubmissions, setEncryptSubmissions] = useState(true);
  const [currentStep, setCurrentStep] = useState<BuilderStepKey>("template");
  const [mobilePane, setMobilePane] = useState<MobileBuilderPane>("editor");
  const [fieldTypePickerOpen, setFieldTypePickerOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectIdState] = useState(() => getSelectedProjectId());
  const [projectState, setProjectState] = useState("");
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(INITIAL_DRAFT_SNAPSHOT);
  const [activeFieldId, setActiveFieldId] = useState(initialFields[0]?.id ?? "");
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [dragOverFieldId, setDragOverFieldId] = useState<string | null>(null);
  const [dragOverPlacement, setDragOverPlacement] = useState<"before" | "after" | null>(null);
  const [pendingFocusFieldId, setPendingFocusFieldId] = useState(initialFields[0]?.id ?? "");

  const createOnSui = Boolean(selectedProjectId);
  const draftSnapshot = useMemo(
    () => serializeDraft(title, description, fields, purpose, visibility, createOnSui, encryptSubmissions, sections),
    [createOnSui, description, encryptSubmissions, fields, purpose, sections, title, visibility],
  );
  const isDirty = draftSnapshot !== lastSavedSnapshot;
  const hasValidTitle = Boolean(title.trim());
  const hasQuestions = fields.length > 0;
  const isReadyToPublish = hasValidTitle && hasQuestions;
  const selectedProject = projects.find((project) => project.objectId === selectedProjectId) ?? null;

  useEffect(() => {
    setSelectedProjectId(selectedProjectId);
  }, [selectedProjectId]);

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
      setSections([]);
      setVisibility("unlisted");
      replaceFields(nextFields);
      goToStep("info");
    });
  }

  function updateField(index: number, nextField: typeof fields[number]) {
    setFields((current) =>
      sanitizeConditionalLogicFields(current.map((field, currentIndex) => (currentIndex === index ? nextField : field))),
    );
  }

  function insertField(type: FieldType, afterIndex?: number, sectionId?: string) {
    const activeField = fields.find((field) => field.id === activeFieldId);
    const resolvedSectionId = sectionId ?? activeField?.sectionId;
    const nextField = createField(type, resolvedSectionId);
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
      const next = sanitizeConditionalLogicFields(current.filter((field) => field.id !== fieldId));
      if (activeFieldId === fieldId) {
        setActiveFieldId(next[0]?.id ?? "");
      }
      return next;
    });
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
  }

  const values: FormBuilderValues = {
    selectedTemplateKey,
    title,
    description,
    fields,
    sections,
    purpose,
    visibility,
    encryptSubmissions,
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
    isDirty,
    hasValidTitle,
    hasQuestions,
    isReadyToPublish,
    selectedProject,
    setTitle,
    setDescription,
    setEncryptSubmissions,
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
    reorderFields,
    insertSmartTemplate,
    addSection,
    updateSection,
    removeSection,
    validateFieldsStep,
    confirmDiscardChanges,
    markSaved,
  };
}
