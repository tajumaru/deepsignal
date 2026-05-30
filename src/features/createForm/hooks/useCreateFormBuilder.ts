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
import { toDateTimeLocalValue } from "../../../lib/responseDeadline";
import type { Language } from "../../../i18n";
import { normalizeFieldType } from "../../../lib/fieldTypes";
import { getSelectedProjectId, setSelectedProjectId } from "../../../lib/projectRegistry";
import { createInitialDraftSnapshot, getInitialFields, getInitialTemplate } from "../constants";
import type {
  AnalysisProfileId,
  AnalysisSignalType,
  AnalysisType,
  AnalystType,
  BuilderStepKey,
  DisplayMode,
  FieldType,
  FieldsStepValidationResult,
  FormBuilderValues,
  FormSection,
  IntentDraft,
  MobileBuilderPane,
  ProjectOption,
  ResponseDeadlinePreset,
  Translate,
  DraftParseStatus,
} from "../types";
import type { DraftSaveState } from "../types";
import {
  cloneField,
  CREATE_FORM_DRAFT_STORAGE_KEY,
  CREATE_FORM_GUEST_DRAFT_STORAGE_KEY,
  createField,
  createSection,
  parseStoredCreateFormDraft,
  type ParsedCreateFormDraft,
  serializeDraft,
} from "../utils";
import type { FormSchema } from "../../../types";

interface UseCreateFormBuilderArgs {
  t: Translate;
  language: Language;
  projects: ProjectOption[];
  freshStartToken?: string;
  mode?: "admin" | "guestDraft";
  startExperience?: DisplayMode;
  draftSeed?: {
    templateKey?: string;
    idea?: string;
  };
}

export function useCreateFormBuilder({
  t,
  language,
  projects,
  freshStartToken = "",
  mode = "admin",
  startExperience = "classic",
  draftSeed,
}: UseCreateFormBuilderArgs) {
  const initialTemplate = useMemo(() => getInitialTemplate(language), [language]);
  const initialFields = useMemo(() => getInitialFields(language), [language]);
  const initialDraftSnapshot = useMemo(() => createInitialDraftSnapshot(language), [language]);
  const hasLoadedDraftRef = useRef(false);
  const previousModeRef = useRef(mode);
  const suppressDraftAutosaveRef = useRef(false);
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
  const [analysisProfileId, setAnalysisProfileId] = useState<AnalysisProfileId | undefined>(
    initialTemplate.analysis?.analysisProfileId,
  );
  const [signalType, setSignalType] = useState<AnalysisSignalType | undefined>(initialTemplate.analysis?.signalType);
  const [analystType, setAnalystType] = useState<AnalystType | undefined>(initialTemplate.analysis?.analystType);
  const [analysisType, setAnalysisType] = useState<AnalysisType | undefined>(initialTemplate.analysis?.analysisType);
  const [visibility, setVisibility] = useState<"private" | "unlisted" | "public">("public");
  const [identityPolicy, setIdentityPolicy] = useState<"anonymous_allowed" | "wallet_required">("anonymous_allowed");
  const [locationRequirement, setLocationRequirement] = useState<"optional" | "required">("optional");
  const [encryptSubmissions, setEncryptSubmissions] = useState(true);
  const [responseDeadlinePreset, setResponseDeadlinePreset] = useState<ResponseDeadlinePreset>("none");
  const [responseDeadlineCustomAt, setResponseDeadlineCustomAt] = useState("");
  const [currentStep, setCurrentStep] = useState<BuilderStepKey>("template");
  const [mobilePane, setMobilePane] = useState<MobileBuilderPane>("editor");
  const [fieldTypePickerOpen, setFieldTypePickerOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectIdState] = useState(() => (isGuestDraftMode ? "" : getSelectedProjectId()));
  const [projectState, setProjectState] = useState("");
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(initialDraftSnapshot);
  const [draftSaveState, setDraftSaveState] = useState<DraftSaveState>("idle");
  const [hasRecoverableDraft, setHasRecoverableDraft] = useState(false);
  const [draftParseStatus, setDraftParseStatus] = useState<DraftParseStatus>("idle");
  const [draftParseNotice, setDraftParseNotice] = useState("");
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
        analysisProfileId,
        signalType,
        analystType,
        analysisType,
        visibility,
        identityPolicy,
        locationRequirement,
        createOnSui,
        encryptSubmissions,
        sections,
        responseDeadlinePreset,
        responseDeadlineCustomAt,
      ),
    [
      analysisProfileId,
      analysisType,
      analystType,
      createOnSui,
      description,
      encryptSubmissions,
      fields,
      headerImage,
      headerLogo,
      identityPolicy,
      locationRequirement,
      purpose,
      responseDeadlineCustomAt,
      responseDeadlinePreset,
      sections,
      signalType,
      title,
      visibility,
    ],
  );
  const isDirty = draftSnapshot !== lastSavedSnapshot;
  const hasValidTitle = Boolean(title.trim());
  const hasQuestions = fields.length > 0;
  const isReadyToPublish = hasValidTitle && hasQuestions;
  const selectedProject = projects.find((project) => project.objectId === selectedProjectId) ?? null;

  function resolveTemplateAutomation(template: ReturnType<typeof getTemplateDefinition>) {
    return {
      visibility: template.automation?.visibility ?? "public",
      identityPolicy: template.automation?.identityPolicy ?? "anonymous_allowed",
      locationRequirement: template.automation?.locationRequirement ?? "optional",
      encryptSubmissions: template.automation?.encryptSubmissions ?? !isGuestDraftMode,
    } as const;
  }

  const resetBuilderState = useCallback(() => {
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
    setAnalysisProfileId(initialTemplate.analysis?.analysisProfileId);
    setSignalType(initialTemplate.analysis?.signalType);
    setAnalystType(initialTemplate.analysis?.analystType);
    setAnalysisType(initialTemplate.analysis?.analysisType);
    setVisibility("public");
    setIdentityPolicy("anonymous_allowed");
    setLocationRequirement("optional");
    setEncryptSubmissions(!isGuestDraftMode);
    setResponseDeadlinePreset("none");
    setResponseDeadlineCustomAt("");
    setCurrentStep("template");
    setMobilePane("editor");
    setFieldTypePickerOpen(false);
    setSelectedProjectIdState(nextSelectedProjectId);
    setProjectState("");
    setLastSavedSnapshot(initialDraftSnapshot);
    setDraftSaveState("idle");
    setHasRecoverableDraft(false);
    setDraftParseStatus("idle");
    setDraftParseNotice("");
    setActiveFieldId(nextFields[0]?.id ?? "");
    setDraggedFieldId(null);
    setDragOverFieldId(null);
    setDragOverPlacement(null);
    setPendingFocusFieldId(nextFields[0]?.id ?? "");
  }, [initialDraftSnapshot, initialTemplate, isGuestDraftMode]);

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
    setDraftParseStatus("idle");
    setDraftParseNotice("");
  }, [mode]);

  const seedGuestDraftFromIntent = useCallback(() => {
    const template = getTemplateDefinition(draftSeed?.templateKey ?? initialTemplate.key, language);
    const nextFields = createTemplateFields(template);
    const idea = draftSeed?.idea?.trim() ?? "";
    const automation = {
      visibility: template.automation?.visibility ?? "public",
      identityPolicy: template.automation?.identityPolicy ?? "anonymous_allowed",
      locationRequirement: template.automation?.locationRequirement ?? "optional",
      encryptSubmissions: template.automation?.encryptSubmissions ?? false,
    } as const;
    setSelectedTemplateKey(template.key);
    setTitle(idea || template.title);
    setDescription(idea ? `A quick form for ${idea.toLowerCase()}.` : template.description);
    setHeaderImage({ url: "", alt: "", position: "center", source: "url", fileName: "" });
    setHeaderLogo({ url: "", alt: "", source: "url", fileName: "" });
    setFields(nextFields);
    setSections([]);
    setPurpose(normalizeFormPurpose(template.purpose));
    setAnalysisProfileId(template.analysis?.analysisProfileId);
    setSignalType(template.analysis?.signalType);
    setAnalystType(template.analysis?.analystType);
    setAnalysisType(template.analysis?.analysisType);
    setVisibility(automation.visibility);
    setIdentityPolicy(automation.identityPolicy);
    setLocationRequirement(automation.locationRequirement);
    setEncryptSubmissions(automation.encryptSubmissions);
    setResponseDeadlinePreset("none");
    setResponseDeadlineCustomAt("");
    setCurrentStep("fields");
    setSelectedProjectIdState("");
    setProjectState("");
    setActiveFieldId(nextFields[0]?.id ?? "");
    setPendingFocusFieldId(nextFields[0]?.id ?? "");
  }, [draftSeed?.idea, draftSeed?.templateKey, initialTemplate.key, language]);

  function applyStoredDraft(parsedDraft: ParsedCreateFormDraft) {
    if (!Array.isArray(parsedDraft.fields) || parsedDraft.fields.length === 0) {
      setHasRecoverableDraft(false);
      setDraftParseStatus("invalid");
      setDraftParseNotice("We found local draft data, but it is incomplete. DeepSignal kept it untouched so you can continue safely.");
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
    setAnalysisProfileId(parsedDraft.analysisProfileId ?? initialTemplate.analysis?.analysisProfileId);
    setSignalType(parsedDraft.signalType ?? initialTemplate.analysis?.signalType);
    setAnalystType(parsedDraft.analystType ?? initialTemplate.analysis?.analystType);
    setAnalysisType(parsedDraft.analysisType ?? initialTemplate.analysis?.analysisType);
    setVisibility(parsedDraft.visibility ?? "public");
    setIdentityPolicy(parsedDraft.identityPolicy === "wallet_required" ? "wallet_required" : "anonymous_allowed");
    setLocationRequirement(parsedDraft.locationRequirement === "required" ? "required" : "optional");
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
    setDraftParseStatus("available");
    setDraftParseNotice("");
  }

  useEffect(() => {
    if (hasLoadedDraftRef.current) {
      return;
    }
    hasLoadedDraftRef.current = true;
    try {
      if (freshStartToken) {
        window.localStorage.removeItem(draftStorageKey);
        resetBuilderState();
        return;
      }
      const rawDraft = window.localStorage.getItem(draftStorageKey);
      if (!rawDraft) {
        setDraftParseStatus("idle");
        setDraftParseNotice("");
        if (isGuestDraftMode && startExperience !== "mirror") {
          seedGuestDraftFromIntent();
        }
        return;
      }
      const parsed = parseStoredCreateFormDraft(rawDraft);
      if (parsed.status === "valid") {
        setHasRecoverableDraft(true);
        setDraftParseStatus("available");
        setDraftParseNotice("");
        return;
      }
      setHasRecoverableDraft(false);
      setDraftParseStatus("invalid");
      setDraftParseNotice(
        "We found a local Create Signal draft, but it could not be restored safely. The saved data is still preserved until you discard it.",
      );
    } catch (error) {
      console.warn("Failed to restore create form draft.", error);
      setHasRecoverableDraft(false);
      setDraftParseStatus("invalid");
      setDraftParseNotice(
        "DeepSignal could not inspect the local draft right now. Your fallback data was left in place, and you can keep working safely.",
      );
    }
  }, [draftSeed?.idea, draftSeed?.templateKey, draftStorageKey, freshStartToken, isGuestDraftMode, resetBuilderState, seedGuestDraftFromIntent, startExperience]);

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
    if (suppressDraftAutosaveRef.current) {
      window.localStorage.removeItem(draftStorageKey);
      if (draftSnapshot === initialDraftSnapshot) {
        suppressDraftAutosaveRef.current = false;
      }
      return;
    }
    if (draftSnapshot === initialDraftSnapshot) {
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
        analysisProfileId,
        signalType,
        analystType,
        analysisType,
        visibility,
        identityPolicy,
        locationRequirement,
        encryptSubmissions,
        responseDeadlinePreset,
        responseDeadlineCustomAt,
        currentStep,
        selectedProjectId,
        projectState,
      };
      window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
      setDraftSaveState("saved");
      setDraftParseStatus("available");
      setDraftParseNotice("");
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [
    analysisProfileId,
    analysisType,
    analystType,
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
    initialDraftSnapshot,
    locationRequirement,
    projectState,
    purpose,
    responseDeadlineCustomAt,
    responseDeadlinePreset,
    sections,
    selectedProjectId,
    selectedTemplateKey,
    signalType,
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
    const template = getTemplateDefinition(templateKey, language);
    const nextFields = createTemplateFields(template);
    const automation = resolveTemplateAutomation(template);
    startTransition(() => {
      setSelectedTemplateKey(template.key);
      setPurpose(normalizeFormPurpose(template.purpose));
      setAnalysisProfileId(template.analysis?.analysisProfileId);
      setSignalType(template.analysis?.signalType);
      setAnalystType(template.analysis?.analystType);
      setAnalysisType(template.analysis?.analysisType);
      setTitle(template.title);
      setDescription(template.description);
      setHeaderImage({ url: "", alt: "", position: "center", source: "url", fileName: "" });
      setHeaderLogo({ url: "", alt: "", source: "url", fileName: "" });
      setSections([]);
      setVisibility(automation.visibility);
      setIdentityPolicy(automation.identityPolicy);
      setLocationRequirement(automation.locationRequirement);
      setEncryptSubmissions(automation.encryptSubmissions);
      setResponseDeadlinePreset("none");
      setResponseDeadlineCustomAt("");
      replaceFields(nextFields);
      goToStep("info");
    });
  }

  function applyIntentDraft(draft: IntentDraft) {
    const sectionMap = new Map<string, FormSection>();
    const nextSections = draft.sections.map((section) => {
      const nextSection = createSection(section.title);
      nextSection.description = section.description ?? "";
      sectionMap.set(section.title, nextSection);
      return nextSection;
    });
    const labels = {
      confirmationLabel: t("confirmationDefaultLabel"),
      confirmationPlaceholder: t("confirmationDefaultPlaceholder"),
      options: [t("optionDefault", { index: 1 }), t("optionDefault", { index: 2 })],
    };
    const nextFields = draft.blocks.map((block) => {
      const sectionId = block.sectionTitle ? sectionMap.get(block.sectionTitle)?.id : undefined;
      const nextField = createField(block.type, sectionId, labels);
      nextField.label = block.label;
      nextField.helpText = block.helpText ?? "";
      nextField.placeholder = block.placeholder ?? "";
      nextField.required = Boolean(block.required);
      nextField.options = block.options ?? nextField.options;
      return nextField;
    });

    startTransition(() => {
      setSelectedTemplateKey("intent-draft");
      setTitle(draft.title.trim() || initialTemplate.title);
      setDescription(draft.description.trim() || initialTemplate.description);
      setSections(nextSections);
      replaceFields(nextFields.length ? nextFields : createTemplateFields(initialTemplate));
      setPurpose("custom");
      setVisibility("public");
      setIdentityPolicy("anonymous_allowed");
      setLocationRequirement("optional");
      setResponseDeadlinePreset("none");
      setResponseDeadlineCustomAt("");
      goToStep("info");
    });
  }

  function applyFormForEdit(form: FormSchema) {
    const nextHeaderImage = {
      url: form.headerImage?.url ?? "",
      alt: form.headerImage?.alt ?? "",
      position: form.headerImage?.position ?? "center",
      source: form.headerImage?.source ?? "url",
      fileName: form.headerImage?.fileName ?? "",
    };
    const nextHeaderLogo = {
      url: form.headerLogo?.url ?? "",
      alt: form.headerLogo?.alt ?? "",
      source: form.headerLogo?.source ?? "url",
      fileName: form.headerLogo?.fileName ?? "",
    };
    const nextFields = sanitizeConditionalLogicFields(
      (form.fields.length ? form.fields : initialFields).map((field) => ({
        ...field,
        type: normalizeFieldType(field.type),
      })),
    );
    const nextSections = Array.isArray(form.sections) ? form.sections : [];
    const nextPurpose = normalizeFormPurpose(form.purpose);
    const nextAnalysisProfileId = form.analysisProfileId;
    const nextSignalType = form.signalType;
    const nextAnalystType = form.analystType;
    const nextAnalysisType = form.analysisType;
    const nextVisibility = form.visibility ?? "public";
    const nextIdentityPolicy = form.identityPolicy === "wallet_required" ? "wallet_required" : "anonymous_allowed";
    const nextLocationRequirement = form.locationRequirement === "required" ? "required" : "optional";
    const nextDeadlinePreset = form.responseDeadline ? "custom" : "none";
    const nextDeadlineCustomAt = form.responseDeadline ? toDateTimeLocalValue(form.responseDeadline) : "";
    const nextSelectedProjectId = isGuestDraftMode ? "" : form.projectId ?? "";
    const nextSnapshot = serializeDraft(
      form.title,
      form.description ?? "",
      nextHeaderImage,
      nextHeaderLogo,
      nextFields,
      nextPurpose,
      nextAnalysisProfileId,
      nextSignalType,
      nextAnalystType,
      nextAnalysisType,
      nextVisibility,
      nextIdentityPolicy,
      nextLocationRequirement,
      Boolean(nextSelectedProjectId),
      form.encryptSubmissions ?? !isGuestDraftMode,
      nextSections,
      nextDeadlinePreset,
      nextDeadlineCustomAt,
    );

    startTransition(() => {
      hasLoadedDraftRef.current = true;
      window.localStorage.removeItem(draftStorageKey);
      setSelectedTemplateKey("published-edit");
      setTitle(form.title);
      setDescription(form.description ?? "");
      setHeaderImage(nextHeaderImage);
      setHeaderLogo(nextHeaderLogo);
      setFields(nextFields);
      setSections(nextSections);
      setPurpose(nextPurpose);
      setAnalysisProfileId(nextAnalysisProfileId);
      setSignalType(nextSignalType);
      setAnalystType(nextAnalystType);
      setAnalysisType(nextAnalysisType);
      setVisibility(nextVisibility);
      setIdentityPolicy(nextIdentityPolicy);
      setLocationRequirement(nextLocationRequirement);
      setEncryptSubmissions(form.encryptSubmissions ?? !isGuestDraftMode);
      setResponseDeadlinePreset(nextDeadlinePreset);
      setResponseDeadlineCustomAt(nextDeadlineCustomAt);
      setCurrentStep("info");
      setMobilePane("editor");
      setFieldTypePickerOpen(false);
      setSelectedProjectIdState(nextSelectedProjectId);
      setProjectState(form.projectName ? `Linked to ${form.projectName}` : "");
      setLastSavedSnapshot(nextSnapshot);
      setDraftSaveState("idle");
      setHasRecoverableDraft(false);
      setDraftParseStatus("idle");
      setDraftParseNotice("");
      setActiveFieldId(nextFields[0]?.id ?? "");
      setDraggedFieldId(null);
      setDragOverFieldId(null);
      setDragOverPlacement(null);
      setPendingFocusFieldId(nextFields[0]?.id ?? "");
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
    return nextSection;
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
    suppressDraftAutosaveRef.current = false;
    window.localStorage.removeItem(draftStorageKey);
    setDraftSaveState("idle");
    setHasRecoverableDraft(false);
    setDraftParseStatus("idle");
    setDraftParseNotice("");
  }

  function restoreRecoverableDraft() {
    const rawDraft = window.localStorage.getItem(draftStorageKey);
    if (!rawDraft) {
      setHasRecoverableDraft(false);
      setDraftParseStatus("idle");
      setDraftParseNotice("");
      if (isGuestDraftMode) {
        seedGuestDraftFromIntent();
      }
      return;
    }
    const parsed = parseStoredCreateFormDraft(rawDraft);
    if (parsed.status === "valid") {
      applyStoredDraft(parsed.draft);
      return;
    }
    console.warn("Failed to restore create form draft.", parsed.reason);
    setHasRecoverableDraft(false);
    setDraftParseStatus("invalid");
    setDraftParseNotice(
      "This draft could not be restored into the builder, but it is still preserved locally. You can keep editing or discard the broken draft explicitly.",
    );
  }

  function discardRecoverableDraft() {
    suppressDraftAutosaveRef.current = true;
    window.localStorage.removeItem(draftStorageKey);
    setHasRecoverableDraft(false);
    setDraftParseStatus("idle");
    setDraftParseNotice("");
    if (isGuestDraftMode) {
      seedGuestDraftFromIntent();
    } else {
      resetBuilderState();
    }
  }

  function clearDraftParseNotice() {
    if (draftParseStatus !== "invalid") {
      return;
    }
    setDraftParseStatus("idle");
    setDraftParseNotice("");
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
    analysisProfileId,
    signalType,
    analystType,
    analysisType,
    visibility,
    identityPolicy,
    locationRequirement,
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
    draftParseStatus,
    draftParseNotice,
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
    setLocationRequirement,
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
    applyIntentDraft,
    applyFormForEdit,
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
    clearDraftParseNotice,
  };
}
