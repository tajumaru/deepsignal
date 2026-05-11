import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { BlobLink } from "../components/BlobLink";
import { EmptyState } from "../components/EmptyState";
import { OperationsStatusRail, type OperationsStatusItem } from "../components/OperationsStatusRail";
import { SealStatusCard } from "../components/SealStatusCard";
import { ShareCard } from "../components/ShareCard";
import { SignalClusterPanel } from "../components/SignalClusterPanel";
import { SignalMetaChip, SignalMetaRow } from "../components/SignalMetaChip";
import { getSealRuntimeStatus } from "../crypto/cryptoFactory";
import {
  REAL_SEAL_SESSION_TTL_MIN,
  SEAL_ADMIN_WALLET_REQUIRED_MESSAGE,
  SEAL_PERMISSION_DENIED_MESSAGE,
  SEAL_WALLET_CANCELLED_MESSAGE,
} from "../crypto/sealPayload";
import { useAccessControl } from "../hooks/useAccessControl";
import { useProjectRegistry } from "../hooks/useProjectRegistry";
import { useI18n } from "../i18n";
import {
  createMetadataDigest,
  createProject,
  deleteFormOnChain,
  deleteProject,
  getSelectedProjectId,
  isProjectObjectType,
  isProjectOwnerCapType,
  parseProjectIdFromOwnerCapFields,
  parseSuiObjectData,
  parseProjectSummary,
  registerSignalReceipt,
  removeRecentProject,
  saveRecentProject,
  setSelectedProjectId,
} from "../lib/projectRegistry";
import {
  canAdmin,
  canReview,
  canReviewForm,
  getAdminSurfaceAccessState,
  getRoleLabel,
} from "../lib/adminAccess";
import { getTriageStatusLabel, TRIAGE_STATUS_OPTIONS } from "../lib/signalOps";
import { exportSubmissionJson } from "../lib/export";
import { getEncryptedPayloadAvailabilityLabel, hasDedicatedEncryptedPayloadBlob } from "../lib/encryptionDisplay";
import { getPublicFormPath, getPublicRoadmapPath } from "../lib/publicLinks";
import { getRespondentDisplayLabel, getSubmissionRespondentMeta } from "../lib/respondentMeta";
import {
  getSignalPreview,
  getSignalSubject,
  getStorageBadgeLabel,
  getWalletAccessLabel,
  inferSignalCategory,
  isLocalFallbackBlob,
  type SignalCategory,
} from "../lib/signalInbox";
import {
  normalizeSubmission,
  resolveSubmissionAnswers,
  storageAdapter,
} from "../lib/storage";
import { formatDate, flattenAnswer } from "../lib/utils";
import { getStorageRuntimeStatus } from "../storage/storageFactory";
import type { FormSchema, Submission } from "../types";

interface FormWithCount extends FormSchema {
  submissionCount: number;
}

type StreamId =
  | "all"
  | "unread"
  | "encrypted"
  | "high"
  | "pending_sui"
  | "bug"
  | "feature"
  | "archived";

interface SignalRecord {
  form: FormWithCount;
  submission: Submission;
  category: SignalCategory;
}

const ROADMAP_READY_STATUSES = new Set<Submission["triageStatus"]>([
  "planned",
  "in_progress",
  "fixed",
]);

function formatWorkspaceCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatAccessLabel(roleLabel: string) {
  return `${roleLabel} access`;
}

function getFriendlyDecryptError(message: string) {
  if (message === SEAL_ADMIN_WALLET_REQUIRED_MESSAGE) {
    return "Connect an authorized reviewer wallet to decrypt this private signal.";
  }
  if (message === SEAL_PERMISSION_DENIED_MESSAGE) {
    return "This wallet is not authorized for this project.";
  }
  if (message === SEAL_WALLET_CANCELLED_MESSAGE) {
    return "Wallet approval was cancelled.";
  }
  return message;
}

function matchesStream(record: SignalRecord, streamId: StreamId) {
  switch (streamId) {
    case "unread":
      return record.submission.status === "unread";
    case "encrypted":
      return record.submission.isEncrypted;
    case "high":
      return record.submission.priority === "high";
    case "pending_sui":
      return Boolean(record.submission.pendingOnchainRegistration);
    case "bug":
      return record.category === "Bug";
    case "feature":
      return record.category === "Feature";
    case "archived":
      return record.submission.status === "archived";
    default:
      return true;
  }
}

export function AdminDashboardPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const signPersonalMessage = useSignPersonalMessage();
  const {
    capabilityProfile,
    isPending: isLoadingCapabilities,
    isLoadingAccess,
  } = useAccessControl(account?.address);
  const { projects, refetch: refetchProjects } = useProjectRegistry(account?.address);
  const createProjectTx = useSignAndExecuteTransaction();
  const deleteProjectTx = useSignAndExecuteTransaction();
  const deleteOnchainFormTx = useSignAndExecuteTransaction();
  const registerSignalReceiptTx = useSignAndExecuteTransaction();
  const sealRuntime = getSealRuntimeStatus();
  const storageRuntime = getStorageRuntimeStatus();
  const [forms, setForms] = useState<FormWithCount[]>([]);
  const [submissionsByFormId, setSubmissionsByFormId] = useState<Record<string, Submission[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedFormId, setSelectedFormId] = useState("all");
  const [selectedStreamId, setSelectedStreamId] = useState<StreamId>("all");
  const [selectedSignalId, setSelectedSignalId] = useState("");
  const [search, setSearch] = useState("");
  const [detailAnswers, setDetailAnswers] = useState<Record<string, unknown> | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<Submission["attachments"]>([]);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [draftTag, setDraftTag] = useState("");
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [deletingVisibleNodes, setDeletingVisibleNodes] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showEncryptedSignal, setShowEncryptedSignal] = useState(false);
  const [nodeDirectoryOpen, setNodeDirectoryOpen] = useState(false);
  const [beaconFormId, setBeaconFormId] = useState<string | null>(null);
  const [nodeSearch, setNodeSearch] = useState("");
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [selectedProjectId, setSelectedProjectIdState] = useState(() => getSelectedProjectId());
  const [manualProjectId, setManualProjectId] = useState("");
  const [projectCreateName, setProjectCreateName] = useState("");
  const [projectState, setProjectState] = useState("");
  const [deletingProject, setDeletingProject] = useState(false);
  const [selectedPendingSignalIds, setSelectedPendingSignalIds] = useState<string[]>([]);
  const [registeringSignalIds, setRegisteringSignalIds] = useState<string[]>([]);
  const [deletingOnchainFormIds, setDeletingOnchainFormIds] = useState<number[]>([]);
  const saveQueueRef = useRef(Promise.resolve());
  const advancedProjectSettingsRef = useRef<HTMLDetailsElement | null>(null);
  const manualProjectInputRef = useRef<HTMLInputElement | null>(null);
  const projectCreateInputRef = useRef<HTMLInputElement | null>(null);
  const hasAdminAccess = canAdmin(capabilityProfile);
  const selectedProject = projects.find((project) => project.objectId === selectedProjectId) ?? null;
  const projectMemberCount = selectedProject ? selectedProject.admins.length + 1 : 0;
  const localProjectFormsCount = useMemo(
    () => forms.filter((form) => form.projectId === selectedProject?.objectId).length,
    [forms, selectedProject?.objectId],
  );
  const roleLabel = getRoleLabel(capabilityProfile);
  const accessState = getAdminSurfaceAccessState(
    "reviewer",
    account?.address,
    capabilityProfile,
  );
  const privateReviewLabel =
    sealRuntime.activeMode === "mock" ? "Private review ready" : "Private review enabled";

  useEffect(() => {
    void loadConsole();
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (selectedProjectId) {
      setSelectedProjectId(selectedProjectId);
      return;
    }
    if (projects[0]?.objectId) {
      setSelectedProjectIdState(projects[0].objectId);
      setSelectedProjectId(projects[0].objectId);
    }
  }, [projects, selectedProjectId]);

  async function hydrateProject(projectId: string) {
    const response = await suiClient.getObject({
      id: projectId,
      options: {
        showType: true,
        showContent: true,
      },
    });
    const parsed = parseSuiObjectData(response);
    if (!parsed) {
      throw new Error("Project object was not found on Sui.");
    }

    if (isProjectOwnerCapType(parsed.type)) {
      const linkedProjectId = parseProjectIdFromOwnerCapFields(parsed.fields);
      if (!linkedProjectId) {
        throw new Error("Project owner cap is missing its linked project id.");
      }
      return hydrateProject(linkedProjectId);
    }

    if (!isProjectObjectType(parsed.type)) {
      throw new Error("That object is not a DeepSignal project or project owner cap.");
    }

    const summary = parseProjectSummary(parsed.objectId, parsed.fields);
    if (!summary) {
      throw new Error("Project exists on Sui, but its fields could not be parsed.");
    }
    saveRecentProject(summary);
    return summary;
  }

  async function connectManualProject() {
    const nextProjectId = manualProjectId.trim();
    if (!nextProjectId) {
      setProjectState("Enter a project object id.");
      return;
    }
    try {
      setProjectState("Loading project...");
      const project = await hydrateProject(nextProjectId);
      await refetchProjects();
      setSelectedProjectIdState(project.objectId);
      setSelectedProjectId(project.objectId);
      setManualProjectId("");
      setProjectState(`Connected to ${project.name}.`);
    } catch (projectError) {
      setProjectState(projectError instanceof Error ? projectError.message : "Failed to load project.");
    }
  }

  function revealProjectTools(mode: "connect" | "create") {
    const details = advancedProjectSettingsRef.current;
    if (details && !details.open) {
      details.open = true;
    }
    details?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      if (mode === "create") {
        projectCreateInputRef.current?.focus();
        return;
      }
      manualProjectInputRef.current?.focus();
    }, 160);
  }

  async function handleCreateProject() {
    if (!hasAdminAccess) {
      setProjectState("OwnerCap or AdminCap is required to create a project.");
      return;
    }

    const role = capabilityProfile.ownerCapIds[0] ? "owner" : "admin";
    const capId = capabilityProfile.ownerCapIds[0] ?? capabilityProfile.adminCapIds[0] ?? "";
    if (!capId) {
      setProjectState("No active OwnerCap or AdminCap object was found in the connected wallet.");
      return;
    }
    if (!projectCreateName.trim()) {
      setProjectState("Enter a project name.");
      return;
    }

    try {
      setProjectState("Awaiting wallet approval...");
      const tx = createProject({
        name: projectCreateName.trim(),
        capId,
        role,
        recipientAddress: account?.address ?? "",
      });
      const result = await createProjectTx.mutateAsync({ transaction: tx });
      const confirmed = await suiClient.waitForTransaction({
        digest: result.digest,
        options: {
          showEvents: true,
        },
      });
      const projectCreatedEvent = (confirmed.events ?? []).find((event) =>
        String(event.type ?? "").endsWith("::ProjectCreated"),
      );
      const projectId = String((projectCreatedEvent?.parsedJson as { project_id?: string } | undefined)?.project_id ?? "");
      if (!projectId) {
        throw new Error("Project was created, but the new project id could not be resolved.");
      }
      const project = await hydrateProject(projectId);
      await refetchProjects();
      setSelectedProjectIdState(project.objectId);
      setSelectedProjectId(project.objectId);
      setProjectCreateName("");
      setProjectState(`Project ${project.name} is ready.`);
    } catch (projectError) {
      setProjectState(projectError instanceof Error ? projectError.message : "Failed to create project.");
    }
  }

  async function handleDeleteProject() {
    if (!selectedProject) {
      setProjectState("Select a project first.");
      return;
    }
    if (!selectedProject.ownedOwnerCapId) {
      setProjectState("Only the project owner wallet can delete this project.");
      return;
    }
    if (selectedProject.formsCount > 0 || selectedProject.signalsCount > 0 || localProjectFormsCount > 0) {
      setProjectState(
        "Only empty projects can be deleted. Remove linked forms and signals first so public routes and local fallback data do not become orphaned.",
      );
      return;
    }
    if (
      !window.confirm(
        `Delete project ${selectedProject.name}? This removes the on-chain project object and cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      setDeletingProject(true);
      setProjectState("Awaiting wallet approval...");
      const tx = deleteProject({
        projectId: selectedProject.objectId,
        ownerCapId: selectedProject.ownedOwnerCapId,
      });
      const result = await deleteProjectTx.mutateAsync({ transaction: tx });
      await suiClient.waitForTransaction({ digest: result.digest });
      removeRecentProject(selectedProject.objectId);
      setSelectedProjectIdState("");
      setSelectedProjectId("");
      await refetchProjects();
      setProjectState(`Project ${selectedProject.name} was deleted.`);
    } catch (projectError) {
      setProjectState(projectError instanceof Error ? projectError.message : "Failed to delete project.");
    } finally {
      setDeletingProject(false);
    }
  }

  async function loadConsole(preferredSignalId?: string) {
    setLoading(true);
    setLoadError("");
    try {
      const allForms = await storageAdapter.listForms();
      const pairs = await Promise.all(
        allForms.map(async (form) => {
          const raw = await storageAdapter.listSubmissions(form.id);
          const submissions = raw.map((submission) => normalizeSubmission(submission));
          return {
            form: { ...form, submissionCount: submissions.length },
            submissions,
          };
        }),
      );

      const nextForms = pairs.map((pair) => pair.form);
      const nextSubmissions = Object.fromEntries(
        pairs.map((pair) => [pair.form.id, pair.submissions]),
      ) as Record<string, Submission[]>;

      setForms(nextForms);
      setSubmissionsByFormId(nextSubmissions);
      setSelectedSignalId((current) => preferredSignalId ?? current);
    } catch (error) {
      console.error("Failed to load admin console", error);
      setForms([]);
      setSubmissionsByFormId({});
      setLoadError(
        error instanceof Error
          ? `Failed to load Research Lab: ${error.message}`
          : "Failed to load Research Lab.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(formId: string) {
    if (!window.confirm(t("deleteFormConfirm"))) {
      return;
    }
    setDeletingFormId(formId);
    try {
      await storageAdapter.deleteForm(formId);
      await loadConsole();
      setToast({ tone: "success", message: t("deleteNodeSuccess") });
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : t("deleteNodeFailed"),
      });
    } finally {
      setDeletingFormId(null);
    }
  }

  async function handleDeleteVisibleNodes(formIds: string[]) {
    if (formIds.length === 0) {
      return;
    }
    if (!window.confirm(t("deleteVisibleNodesConfirm", { count: formIds.length }))) {
      return;
    }
    setDeletingVisibleNodes(true);
    setDeletingFormId(null);
    try {
      await storageAdapter.deleteForms(formIds);
      await loadConsole();
      setToast({ tone: "success", message: t("deleteVisibleNodesSuccess", { count: formIds.length }) });
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : t("deleteNodeFailed"),
      });
    } finally {
      setDeletingVisibleNodes(false);
    }
  }

  useEffect(() => {
    if (!nodeDirectoryOpen && !beaconFormId) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (beaconFormId) {
          setBeaconFormId(null);
          return;
        }
        setNodeDirectoryOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [beaconFormId, nodeDirectoryOpen]);

  const accessibleForms = useMemo(
    () =>
      forms.filter((form) => canReviewForm(form, account?.address, capabilityProfile)),
    [account?.address, capabilityProfile, forms],
  );

  useEffect(() => {
    if (selectedFormId === "all") {
      return;
    }
    if (!accessibleForms.some((form) => form.id === selectedFormId)) {
      setSelectedFormId("all");
    }
  }, [accessibleForms, selectedFormId]);

  const allSignals = useMemo<SignalRecord[]>(
    () =>
      accessibleForms.flatMap((form) =>
        (submissionsByFormId[form.id] ?? []).map((submission) => ({
          form,
          submission,
          category: inferSignalCategory(submission),
        })),
      ),
    [accessibleForms, submissionsByFormId],
  );
  const pendingSignals = useMemo(
    () => allSignals.filter((record) => record.submission.pendingOnchainRegistration),
    [allSignals],
  );
  const selectedProjectForms = useMemo(
    () =>
      selectedProject
        ? accessibleForms.filter((form) => form.projectId === selectedProject.objectId)
        : [],
    [accessibleForms, selectedProject],
  );
  const selectedProjectSignals = useMemo(
    () =>
      selectedProject
        ? allSignals.filter((record) => record.form.projectId === selectedProject.objectId)
        : [],
    [allSignals, selectedProject],
  );
  useEffect(() => {
    setSelectedPendingSignalIds((current) =>
      current.filter((signalId) =>
        allSignals.some(
          (record) =>
            record.submission.id === signalId && record.submission.pendingOnchainRegistration,
        ),
      ),
    );
  }, [allSignals]);

  const visibleSignals = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return allSignals.filter((record) => {
      if (selectedFormId !== "all" && record.form.id !== selectedFormId) {
        return false;
      }
      if (!matchesStream(record, selectedStreamId)) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      const searchBody = [
        record.form.title,
        getSignalSubject(record.submission),
        getSignalPreview(record.submission),
        flattenAnswer(record.submission.answers),
        record.submission.tags.join(" "),
        record.category,
      ]
        .join(" ")
        .toLowerCase();
      return searchBody.includes(normalizedSearch);
    });
  }, [allSignals, search, selectedFormId, selectedStreamId]);

  const selectedRecord =
    visibleSignals.find((record) => record.submission.id === selectedSignalId) ??
    allSignals.find((record) => record.submission.id === selectedSignalId) ??
    visibleSignals[0] ??
    null;
  const roadmapReadySignals = useMemo(
    () => selectedProjectSignals.filter((record) => ROADMAP_READY_STATUSES.has(record.submission.triageStatus)),
    [selectedProjectSignals],
  );
  const operationsStatusItems: OperationsStatusItem[] = [
    {
      label: "Project Connected",
      tone: selectedProject ? "ready" : "action",
      detail: selectedProject ? selectedProject.name : "Select, create, or connect a project",
    },
    {
      label: "Private Signals Enabled",
      tone:
        selectedProjectForms.length === 0
          ? "pending"
          : selectedProjectForms.some((form) => form.encryptSubmissions)
            ? "ready"
            : "warning",
      detail:
        selectedProjectForms.length === 0
          ? "No form published yet"
          : selectedProjectForms.some((form) => form.encryptSubmissions)
            ? `${selectedProjectForms.filter((form) => form.encryptSubmissions).length} protected form${selectedProjectForms.filter((form) => form.encryptSubmissions).length === 1 ? "" : "s"} active`
            : "Forms exist, but private signal protection is off",
    },
    {
      label: "Reviewer Wallet Ready",
      tone: !account?.address ? "action" : canReview(capabilityProfile) || !capabilityProfile.isConfigured ? "ready" : "warning",
      detail: !account?.address
        ? "Connect reviewer wallet"
        : canReview(capabilityProfile) || !capabilityProfile.isConfigured
          ? `${getRoleLabel(capabilityProfile)} wallet verified`
          : "Connected wallet does not have reviewer access",
    },
    {
      label: "Walrus Sync Active",
      tone: storageRuntime.mode === "walrus" ? "ready" : "warning",
      detail: storageRuntime.mode === "walrus"
        ? "Trusted storage available"
        : "Local fallback active",
    },
    {
      label: "Pending Sui Verification",
      tone: pendingSignals.length > 0 ? "pending" : selectedProjectSignals.length > 0 ? "ready" : "pending",
      detail: pendingSignals.length > 0
        ? `${pendingSignals.length} signal${pendingSignals.length === 1 ? "" : "s"} waiting for verification`
        : selectedProjectSignals.length > 0
          ? "No pending proof registrations"
          : "Awaiting project signals",
    },
    {
      label: "Roadmap Publishing Ready",
      tone: roadmapReadySignals.length > 0 ? "ready" : selectedProjectSignals.length > 0 ? "pending" : "pending",
      detail: roadmapReadySignals.length > 0
        ? `${roadmapReadySignals.length} signal${roadmapReadySignals.length === 1 ? "" : "s"} ready for the Public Roadmap`
        : selectedProjectSignals.length > 0
          ? "Mark signals as Planned, In Progress, or Fixed"
          : "No roadmap candidates yet",
    },
  ];
  const selectedRoadmapUrl = selectedRecord
    ? getPublicRoadmapPath(selectedRecord.form.id, selectedRecord.form.manifestBlobId)
    : "";
  const isSelectedRecordOnRoadmap = selectedRecord
    ? ROADMAP_READY_STATUSES.has(selectedRecord.submission.triageStatus)
    : false;
  const selectedRecordNeedsDecrypt = Boolean(
    selectedRecord?.submission.isEncrypted && !detailAnswers,
  );
  const deleteProjectBlockedReason = !selectedProject
    ? ""
    : !selectedProject.ownedOwnerCapId
      ? "This wallet is not holding the project owner capability."
      : selectedProject.formsCount > 0
        ? `This project still has ${selectedProject.formsCount} on-chain form record${selectedProject.formsCount === 1 ? "" : "s"}.`
        : selectedProject.signalsCount > 0
          ? `This project still has ${selectedProject.signalsCount} on-chain signal${selectedProject.signalsCount === 1 ? "" : "s"}.`
          : localProjectFormsCount > 0
            ? `This workspace still has ${localProjectFormsCount} local form${localProjectFormsCount === 1 ? "" : "s"} linked to the project.`
            : "";
  const visibleOnchainForms = selectedProject?.onchainForms ?? [];
  const firstProjectForm = selectedProjectForms[0] ?? null;
  const firstProtectedSignal = selectedProjectSignals.find((record) => record.submission.isEncrypted) ?? null;
  const nextRecommendedAction =
    !selectedProject
      ? {
          label: "Connect a project",
          detail: "Create a new project or connect an existing one before you create or review private signals.",
          cta: (
            <div className="inline-actions">
              {hasAdminAccess ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => revealProjectTools("create")}
                >
                  Create project
                </button>
              ) : null}
              <button
                type="button"
                className="ghost-button"
                onClick={() => revealProjectTools("connect")}
              >
                Connect existing
              </button>
            </div>
          ),
        }
      : selectedProjectForms.length === 0
        ? {
            label: "Create your first private signal form",
            detail: "Publish one protected form for this project so judges can submit anonymously.",
            cta: <Link className="primary-button" to="/admin/forms/new">Create Signal Form</Link>,
          }
        : selectedProjectSignals.length === 0
          ? {
              label: "Share your public signal link",
              detail: "Open the latest public form and send one anonymous private signal into the inbox.",
              cta: firstProjectForm ? <Link className="primary-button" to={getPublicFormPath(firstProjectForm.id, firstProjectForm.manifestBlobId)}>Open Public Link</Link> : null,
            }
          : firstProtectedSignal && !detailAnswers
            ? {
                label: "Decrypt protected signals",
                detail: "Select a protected signal and verify reviewer wallet access to unlock the message.",
                cta: firstProtectedSignal ? (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => setSelectedSignalId(firstProtectedSignal.submission.id)}
                  >
                    Open Protected Signal
                  </button>
                ) : null,
              }
            : pendingSignals.length > 0
              ? {
                  label: "Register signals on Sui",
                  detail: "Clear the proof queue so pending signals become verified records.",
                  cta: (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={registeringSignalIds.length > 0}
                      onClick={() => void handleRegisterPendingSignals()}
                    >
                      {registeringSignalIds.length > 0 ? "Registering..." : "Register Pending Signals"}
                    </button>
                  ),
                }
              : roadmapReadySignals.length === 0
                ? {
                    label: "Publish signals to roadmap",
                    detail: "Move at least one reviewed signal into a roadmap status so the public roadmap becomes live.",
                    cta: selectedRecord ? (
                      <button
                        type="button"
                        className="primary-button"
                        disabled={saving}
                        onClick={() => void handleMoveToRoadmap()}
                      >
                        Move to Public Roadmap
                      </button>
                    ) : null,
                  }
                : {
                    label: "Review signal inbox",
                    detail: "The console is operational. Continue triage, proof verification, or roadmap updates as new signals arrive.",
                    cta: selectedRoadmapUrl ? <Link className="primary-button" to={selectedRoadmapUrl}>Open Public Roadmap</Link> : null,
                  };

  useEffect(() => {
    if (!selectedRecord) {
      setDetailAnswers(null);
      setDetailAttachments([]);
      setNotesDraft("");
      setDraftTag("");
      setShowMetadata(false);
      setShowEncryptedSignal(false);
      setDecryptError("");
      return;
    }
    setNotesDraft(selectedRecord.submission.notes);
    setDraftTag("");
    setDetailAnswers(
      selectedRecord.submission.isEncrypted ? null : selectedRecord.submission.answers,
    );
    setDetailAttachments(selectedRecord.submission.attachments ?? []);
    setShowMetadata(false);
    setShowEncryptedSignal(false);
    setDecryptError("");
  }, [selectedRecord]);

  function applySubmissionUpdate(nextSubmission: Submission) {
    setSubmissionsByFormId((current) => ({
      ...current,
      [nextSubmission.formId]: (current[nextSubmission.formId] ?? []).map((submission) =>
        submission.id === nextSubmission.id ? nextSubmission : submission,
      ),
    }));
  }

  async function updateSubmission(nextSubmission: Submission) {
    const normalized = normalizeSubmission({
      ...nextSubmission,
      updatedAt: new Date().toISOString(),
    });
    applySubmissionUpdate(normalized);
    setSelectedSignalId(normalized.id);
    const runSave = async () => {
      setSaving(true);
      try {
        await storageAdapter.updateSubmission(normalized);
      } finally {
        setSaving(false);
      }
    };
    saveQueueRef.current = saveQueueRef.current.then(runSave, runSave);
    await saveQueueRef.current;
  }

  async function handleDeleteOnchainForm(formId: number) {
    if (!selectedProject) {
      setProjectState("Select a project first.");
      return;
    }
    if (selectedProject.signalsCount > 0) {
      setProjectState("This project still has on-chain signals. Forms with linked signals cannot be deleted.");
      return;
    }
    if (!window.confirm(`Delete on-chain form ${formId} from ${selectedProject.name}?`)) {
      return;
    }

    try {
      setDeletingOnchainFormIds((current) => [...current, formId]);
      setProjectState("Awaiting wallet approval...");
      const tx = deleteFormOnChain({
        projectId: selectedProject.objectId,
        formId,
      });
      const result = await deleteOnchainFormTx.mutateAsync({ transaction: tx });
      await suiClient.waitForTransaction({ digest: result.digest });
      await refetchProjects();
      await loadConsole();
      setProjectState(`Removed on-chain form ${formId}.`);
    } catch (projectError) {
      setProjectState(projectError instanceof Error ? projectError.message : "Failed to delete on-chain form.");
    } finally {
      setDeletingOnchainFormIds((current) => current.filter((entry) => entry !== formId));
    }
  }

  function isRegisteringSignal(signalId: string) {
    return registeringSignalIds.includes(signalId);
  }

  function togglePendingSelection(signalId: string) {
    setSelectedPendingSignalIds((current) =>
      current.includes(signalId)
        ? current.filter((entry) => entry !== signalId)
        : [...current, signalId],
    );
  }

  async function registerSubmissionRecordOnSui(record: SignalRecord) {
    const { form, submission } = record;
    if (
      !form.projectId ||
      typeof form.onchainFormId !== "number" ||
      !submission.receiptBlobId ||
      isLocalFallbackBlob(submission.receiptBlobId)
    ) {
      throw new Error("This signal is not eligible for Sui registration yet.");
    }

    const signalReceiptMetadataDigest = await createMetadataDigest({
      submissionId: submission.id,
      formId: submission.formId,
      createdAt: submission.createdAt,
      receiptBlobId: submission.receiptBlobId,
      attachmentBlobIds: submission.attachments.map((attachment) => attachment.blobId),
      encrypted: submission.isEncrypted,
      sealIdentity: submission.sealIdentity ?? null,
      respondentWalletAddress: submission.respondentMeta?.walletAddress ?? null,
      respondentSessionId: submission.respondentMeta?.sessionId ?? null,
      isAnonymous: submission.respondentMeta?.isAnonymous ?? true,
    });
    const tx = registerSignalReceipt({
      projectId: form.projectId,
      formId: form.onchainFormId,
      walrusBlobId: submission.receiptBlobId,
      metadataDigest: signalReceiptMetadataDigest,
      encrypted: submission.isEncrypted,
      sealIdentity: submission.sealIdentity ?? null,
    });
    const result = await registerSignalReceiptTx.mutateAsync({ transaction: tx });
    const confirmed = await suiClient.waitForTransaction({
      digest: result.digest,
      options: { showEvents: true },
    });
    const signalRegisteredEvent = (confirmed.events ?? []).find((chainEvent) =>
      String(chainEvent.type ?? "").endsWith("::SignalRegistered"),
    );
    const rawSignalId = (signalRegisteredEvent?.parsedJson as { signal_id?: string | number } | undefined)?.signal_id;
    const parsedSignalId = typeof rawSignalId === "number" ? rawSignalId : Number(rawSignalId ?? Number.NaN);
    const registeredSubmission = normalizeSubmission({
      ...submission,
      pendingOnchainRegistration: false,
      onchainSignalId: Number.isFinite(parsedSignalId) ? parsedSignalId : undefined,
      signalReceiptMetadataDigest,
      onchainStatus: "new",
      updatedAt: new Date().toISOString(),
    });
    await storageAdapter.updateSubmission(registeredSubmission);
    applySubmissionUpdate(registeredSubmission);
    return registeredSubmission;
  }

  async function handleRegisterPendingSignals(targetSignalIds?: string[]) {
    const nextTargetIds = (targetSignalIds ?? selectedPendingSignalIds).filter(Boolean);
    if (nextTargetIds.length === 0) {
      setToast({ tone: "error", message: "Select at least one pending signal first." });
      return;
    }

    const targetRecords = nextTargetIds
      .map((signalId) =>
        allSignals.find(
          (record) =>
            record.submission.id === signalId && record.submission.pendingOnchainRegistration,
        ) ?? null,
      )
      .filter((record): record is SignalRecord => Boolean(record));
    if (targetRecords.length === 0) {
      setToast({ tone: "error", message: "No pending Sui registrations were found for the selected signals." });
      return;
    }

    setRegisteringSignalIds((current) => [...new Set([...current, ...targetRecords.map((record) => record.submission.id)])]);
    const successes: string[] = [];
    const failures: string[] = [];

    for (const record of targetRecords) {
      try {
        await registerSubmissionRecordOnSui(record);
        successes.push(record.submission.id);
      } catch (error) {
        console.warn("register_signal failed from admin dashboard", error);
        failures.push(
          error instanceof Error
            ? `${getSignalSubject(record.submission)}: ${error.message}`
            : `${getSignalSubject(record.submission)}: Failed to register on Sui.`,
        );
      }
    }

    setRegisteringSignalIds((current) =>
      current.filter((signalId) => !targetRecords.some((record) => record.submission.id === signalId)),
    );
    if (successes.length > 0) {
      setSelectedPendingSignalIds((current) =>
        current.filter((signalId) => !successes.includes(signalId)),
      );
    }
    if (failures.length > 0) {
      setToast({
        tone: successes.length > 0 ? "success" : "error",
        message:
          successes.length > 0
            ? `Registered ${successes.length} signal${successes.length === 1 ? "" : "s"} on Sui. ${failures[0]}`
            : failures[0],
      });
      return;
    }
    setToast({
      tone: "success",
      message: `Registered ${successes.length} pending signal${successes.length === 1 ? "" : "s"} on Sui.`,
    });
  }

  async function handleDecrypt() {
    if (!selectedRecord) {
      return;
    }
    setDecrypting(true);
    setDecryptError("");
    try {
      const resolved = await resolveSubmissionAnswers(
        selectedRecord.form,
        selectedRecord.submission,
        undefined,
        {
          walletAddress: account?.address,
          projectId: selectedRecord.form.projectId,
          suiClient,
          signPersonalMessage: async (message) => {
            const result = await signPersonalMessage.mutateAsync({ message });
            return result.signature;
          },
        },
      );
      if (resolved) {
        setDetailAnswers(resolved.answers);
        setDetailAttachments(resolved.attachments);
        setToast({ tone: "success", message: "Wallet verified. Private signal unlocked." });
      }
    } catch (error) {
      setDecryptError(
        error instanceof Error ? getFriendlyDecryptError(error.message) : t("decryptFailed"),
      );
    } finally {
      setDecrypting(false);
    }
  }

  async function handleMoveToRoadmap() {
    if (!selectedRecord) {
      return;
    }
    const nextStatus = ROADMAP_READY_STATUSES.has(selectedRecord.submission.triageStatus)
      ? selectedRecord.submission.triageStatus
      : "planned";
    await updateSubmission({
      ...selectedRecord.submission,
      triageStatus: nextStatus,
    });
    setToast({ tone: "success", message: "Signal added to the Public Roadmap." });
  }

  const streamItems = [
    { id: "all", label: "All Signals", count: allSignals.length },
    {
      id: "unread",
      label: "Unread",
      count: allSignals.filter((record) => record.submission.status === "unread").length,
    },
    {
      id: "encrypted",
      label: "Protected",
      count: allSignals.filter((record) => record.submission.isEncrypted).length,
    },
    {
      id: "high",
      label: "Flagged",
      count: allSignals.filter((record) => record.submission.priority === "high").length,
    },
    {
      id: "pending_sui",
      label: "Pending Sui",
      count: pendingSignals.length,
    },
    {
      id: "archived",
      label: "Resolved",
      count: allSignals.filter((record) => record.submission.status === "archived").length,
    },
  ] satisfies Array<{ id: StreamId; label: string; count: number }>;

  const unreadCountByFormId = useMemo(
    () =>
      Object.fromEntries(
        accessibleForms.map((form) => [
          form.id,
          (submissionsByFormId[form.id] ?? []).filter((submission) => submission.status === "unread")
            .length,
        ]),
      ) as Record<string, number>,
    [accessibleForms, submissionsByFormId],
  );

  const selectedForm = accessibleForms.find((form) => form.id === selectedFormId) ?? null;
  const selectedBeaconForm =
    accessibleForms.find((form) => form.id === beaconFormId) ?? null;
  const formById = useMemo(
    () =>
      Object.fromEntries(accessibleForms.map((form) => [form.id, form])) as Record<
        string,
        FormSchema | undefined
      >,
    [accessibleForms],
  );
  const formTitleById = useMemo(
    () =>
      Object.fromEntries(accessibleForms.map((form) => [form.id, form.title])) as Record<
        string,
        string | undefined
      >,
    [accessibleForms],
  );
  const clusterCountById = useMemo(
    () =>
      allSignals.reduce<Record<string, number>>((counts, record) => {
        if (record.submission.clusterId) {
          counts[record.submission.clusterId] = (counts[record.submission.clusterId] ?? 0) + 1;
        }
        return counts;
      }, {}),
    [allSignals],
  );
  const inferredAiConfidence = selectedRecord
    ? selectedRecord.submission.aiSummary
      ? selectedRecord.submission.keywords?.length
        ? "High"
        : "Medium"
      : detailAnswers
        ? "Medium"
        : "Low"
    : "Low";
  const workspaceMetaItems = [
    formatWorkspaceCount(selectedProject ? selectedProject.formsCount : accessibleForms.length, "Form"),
    formatWorkspaceCount(selectedProject ? selectedProject.signalsCount : allSignals.length, "Signal"),
    formatWorkspaceCount(projectMemberCount || 1, "Member"),
    selectedProject ? "Protected" : "Local mode",
    formatAccessLabel(roleLabel),
  ];
  const activeScopeLabel =
    selectedFormId === "all" ? t("allSignalNodes") : selectedForm?.title ?? t("selectedNode");
  const activeStreamLabel =
    streamItems.find((stream) => stream.id === selectedStreamId)?.label ?? "All Signals";
  const visibleUnreadCount = visibleSignals.filter(
    (record) => record.submission.status === "unread",
  ).length;
  const selectedPendingVisibleCount = visibleSignals.filter((record) =>
    selectedPendingSignalIds.includes(record.submission.id),
  ).length;
  const activeFormsCount = selectedFormId === "all" ? accessibleForms.length : 1;
  const hasProjects = projects.length > 0;
  const overviewCards = [
    {
      label: "Current scope",
      value: activeScopeLabel,
      meta: `${visibleSignals.length} visible`,
    },
    {
      label: "Unread queue",
      value: String(visibleUnreadCount),
      meta: activeStreamLabel,
    },
    {
      label: "Protected signals",
      value: String(visibleSignals.filter((record) => record.submission.isEncrypted).length),
      meta: privateReviewLabel,
    },
    {
      label: "Pending Sui",
      value: String(pendingSignals.length),
      meta: "Optional proof queue",
    },
    ...(activeFormsCount > 0
      ? [
          {
            label: "Active forms",
            value: String(activeFormsCount),
            meta: selectedProject ? selectedProject.name : "Walrus / local mode",
          },
        ]
      : []),
  ];

  const nodeDirectoryItems = useMemo(() => {
    const normalizedSearch = nodeSearch.trim().toLowerCase();
    const allFormsItem = {
      id: "all",
      title: t("allSignalNodes"),
      submissionCount: allSignals.length,
      unreadCount: allSignals.filter((record) => record.submission.status === "unread").length,
      isLegacyDemo: false,
    };
    const formItems = accessibleForms
      .filter((form) => {
        if (!normalizedSearch) {
          return true;
        }
        return (
          form.title.toLowerCase().includes(normalizedSearch) ||
          form.description.toLowerCase().includes(normalizedSearch)
        );
      })
      .map((form) => ({
        id: form.id,
        title: form.title,
        submissionCount: form.submissionCount,
        unreadCount: unreadCountByFormId[form.id] ?? 0,
        isLegacyDemo: !form.ownerAddress,
      }));
    return [allFormsItem, ...formItems];
  }, [accessibleForms, allSignals, nodeSearch, t, unreadCountByFormId]);

  const deletableNodeIds = useMemo(
    () => nodeDirectoryItems.filter((item) => item.id !== "all").map((item) => item.id),
    [nodeDirectoryItems],
  );

  if (loading) {
    return <div className="panel">{t("loadingResearchLab")}</div>;
  }

  if (loadError) {
    return (
      <div className="panel stack">
        <strong>Research Lab failed to load</strong>
        <p className="warning-text">{loadError}</p>
        <button
          type="button"
          className="ghost-button"
          onClick={() => void loadConsole()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoadingAccess) {
    return <div className="panel">Checking wallet capabilities...</div>;
  }

  return (
    <AdminAccessGate
      hasWallet={Boolean(account?.address)}
      access={accessState}
      deniedBody={capabilityProfile.isConfigured ? "Only wallets with OwnerCap / AdminCap / ReviewerCap can open the review console." : undefined}
    >
      <section className="stack">
        {toast ? (
          <div className={`signal-toast is-${toast.tone}`} role="status" aria-live="polite">
            {toast.message}
          </div>
        ) : null}
        <OperationsStatusRail
          items={operationsStatusItems}
          nextActionLabel={nextRecommendedAction.label}
          nextActionDetail={nextRecommendedAction.detail}
          nextActionCta={nextRecommendedAction.cta}
        />

        <section className="panel glow-panel workspace-hero">
          <div className="workspace-hero-main">
            <div className="workspace-hero-copy">
              <p className="eyebrow">{t("creatorOnlyInbox")}</p>
              <h1>{selectedProject ? selectedProject.name : "Contest demo workspace"}</h1>
              <p className="lede">
                {selectedProject
                  ? "Run the full judge demo from one place: create the form, collect a private signal, unlock it with reviewer access, and publish the roadmap."
                  : "Start by selecting the project for this demo. Once a project is active, the next step is creating a signal form."}
              </p>
              <div className="workspace-hero-meta">
                {workspaceMetaItems.map((item) => (
                  <span key={item} className="workspace-meta-item">
                    {item}
                  </span>
                ))}
                <span className="workspace-meta-item">{privateReviewLabel}</span>
                {isLoadingCapabilities ? (
                  <span className="workspace-meta-item">Checking wallet access...</span>
                ) : null}
              </div>
            </div>

            <div className="workspace-hero-controls">
              <label className="project-selector-inline" htmlFor="workspace-project-selector">
                <span className="eyebrow">Current project</span>
                <select
                  id="workspace-project-selector"
                  className="project-selector-field"
                  value={selectedProjectId}
                  onChange={(event) => {
                    setSelectedProjectIdState(event.target.value);
                    setSelectedProjectId(event.target.value);
                  }}
                >
                  <option value="">Choose a project</option>
                  {projects.map((project) => (
                    <option key={project.objectId} value={project.objectId}>
                      {project.name} ({project.formsCount} forms / {project.signalsCount} signals)
                    </option>
                  ))}
                </select>
              </label>
              <Link className="ghost-button" to="/admin/access">
                {t("manageMembers")}
              </Link>
            </div>
          </div>
        </section>

        <details ref={advancedProjectSettingsRef} className="panel advanced-project-settings">
          <summary>
            <span>
              <strong>Advanced project settings</strong>
              <span className="muted">
                Connect an existing project, create a new one, and use registry tools when needed.
              </span>
            </span>
          </summary>
          <div className="advanced-project-settings-body">
            <div className="project-registry-status">
              <span className="signal-chip">{selectedProject ? "Project selected" : "No project selected"}</span>
              <span className="signal-chip">{privateReviewLabel}</span>
            </div>

            <div className="project-registry-grid">
              <article className="project-registry-subpanel">
                <div className="project-panel-head">
                  <div>
                    <p className="eyebrow">Existing Project</p>
                    <h3>Connect existing project</h3>
                  </div>
                  <span className="signal-chip">Project / OwnerCap</span>
                </div>
                <p className="muted">
                  Attach this workspace to an existing DeepSignal project by pasting a Project or ProjectOwnerCap object id.
                </p>
                <div className="inline-actions">
                  <input
                    ref={manualProjectInputRef}
                    value={manualProjectId}
                    onChange={(event) => setManualProjectId(event.target.value)}
                    placeholder="Project or ProjectOwnerCap object id"
                  />
                  <button type="button" className="ghost-button" onClick={() => void connectManualProject()}>
                    Connect
                  </button>
                </div>
              </article>

              {hasAdminAccess ? (
                <article className="project-registry-subpanel">
                  <div className="project-panel-head">
                    <div>
                      <p className="eyebrow">Create New Project</p>
                      <h3>Create project</h3>
                    </div>
                    <span className="signal-chip signal-chip-accent">Owner / Admin</span>
                  </div>
                  <p className="muted">
                    Start a fresh project container for forms and signal routing, then make it the active destination.
                  </p>
                  <div className="inline-actions">
                    <input
                      ref={projectCreateInputRef}
                      value={projectCreateName}
                      onChange={(event) => setProjectCreateName(event.target.value)}
                      placeholder="New project name"
                    />
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void handleCreateProject()}
                      disabled={createProjectTx.isPending}
                    >
                      {createProjectTx.isPending ? "Creating..." : "Create Project"}
                    </button>
                  </div>
                </article>
              ) : null}

              {selectedProject ? (
                <article className="project-registry-subpanel">
                  <div className="project-panel-head">
                    <div>
                      <p className="eyebrow">Project Lifecycle</p>
                      <h3>Delete project</h3>
                    </div>
                    <span className="signal-chip">Owner only</span>
                  </div>
                  <p className="muted">
                    Delete is available only for empty projects so existing form routes and fallback data are not orphaned.
                  </p>
                  <div className="stack">
                    <div className="workspace-hero-meta">
                      <span className="workspace-meta-item">{selectedProject.formsCount} on-chain forms</span>
                      <span className="workspace-meta-item">{selectedProject.signalsCount} on-chain signals</span>
                      <span className="workspace-meta-item">{localProjectFormsCount} local forms</span>
                    </div>
                    {deleteProjectBlockedReason ? (
                      <p className="warning-text">{deleteProjectBlockedReason} Local form visibility can differ from the on-chain registry.</p>
                    ) : (
                      <p className="muted">This project is empty and can be deleted by the owner wallet.</p>
                    )}
                    {visibleOnchainForms.length > 0 ? (
                      <div className="stack onchain-form-list">
                        <p className="muted">On-chain form records</p>
                        {visibleOnchainForms.map((form) => (
                          <div key={form.formId} className="metadata-row onchain-form-row">
                            <div>
                              <strong>Form #{form.formId}</strong>
                              <p className="muted">{form.title || "Untitled form"}</p>
                            </div>
                            <div className="inline-actions">
                              <span className={`signal-chip ${form.active ? "signal-chip-accent" : "signal-chip-soft"}`}>
                                {form.active ? "Active" : "Inactive"}
                              </span>
                              <button
                                type="button"
                                className="ghost-button"
                                disabled={
                                  deletingOnchainFormIds.includes(form.formId) ||
                                  selectedProject.signalsCount > 0
                                }
                                onClick={() => void handleDeleteOnchainForm(form.formId)}
                              >
                                {deletingOnchainFormIds.includes(form.formId) ? "Deleting..." : "Delete on-chain form"}
                              </button>
                            </div>
                          </div>
                        ))}
                        {selectedProject.signalsCount > 0 ? (
                          <p className="muted">On-chain forms can only be deleted when no on-chain signals reference this project.</p>
                        ) : null}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="ghost-button node-directory-delete"
                      onClick={() => void handleDeleteProject()}
                      disabled={
                        deletingProject ||
                        !selectedProject.ownedOwnerCapId ||
                        selectedProject.formsCount > 0 ||
                        selectedProject.signalsCount > 0 ||
                        localProjectFormsCount > 0
                      }
                    >
                      {deletingProject ? "Deleting..." : "Delete Project"}
                    </button>
                  </div>
                </article>
              ) : null}
            </div>

            {projectState ? <p className="muted">{projectState}</p> : null}
          </div>
        </details>

        <div className="mobile-console-banner">{t("adminDesktopNotice")}</div>

        <section className="inbox-overview-grid" aria-label="Inbox overview">
          {overviewCards.map((card) => (
            <article key={card.label} className="panel inbox-overview-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <p className="muted">{card.meta}</p>
            </article>
          ))}
        </section>

        {accessibleForms.length === 0 ? (
          hasProjects ? (
          <EmptyState>
            <h2>{t("noCreatorInboxesTitle")}</h2>
            <p>{t("noCreatorInboxesBody")}</p>
            {hasAdminAccess || !capabilityProfile.isConfigured ? (
              <Link className="primary-button" to="/admin/forms/new">
                {t("createSignalForm")}
              </Link>
            ) : null}
          </EmptyState>
          ) : null
        ) : (
          <div className="signal-console-layout admin-console-layout">
            <aside className="panel signal-sidebar">
              <div className="signal-sidebar-section">
                <div>
                  <p className="eyebrow">Streams</p>
                  <h2>Streams</h2>
                </div>
                <div className="stream-list">
                  {streamItems.map((stream) => (
                    <button
                      key={stream.id}
                      type="button"
                      className={`stream-item ${selectedStreamId === stream.id ? "is-active" : ""}`}
                      onClick={() => setSelectedStreamId(stream.id)}
                    >
                      <span>{stream.label}</span>
                      <strong>{stream.count}</strong>
                    </button>
                  ))}
                </div>
              </div>

              <div className="signal-sidebar-section">
                <div className="section-row">
                  <p className="eyebrow">Forms</p>
                  <span className="muted">{accessibleForms.length}</span>
                </div>
                <div className="form-stream-list">
                  <button
                    type="button"
                    className={`form-stream-item ${selectedFormId === "all" ? "is-active" : ""}`}
                    onClick={() => setSelectedFormId("all")}
                  >
                    <div className="form-stream-select">
                      <strong>{t("allSignalNodes")}</strong>
                      <p className="muted">{allSignals.length} signals across every form inbox.</p>
                    </div>
                    <div className="form-stream-actions">
                      <span className="signal-chip">{visibleUnreadCount} unread</span>
                      <span className="signal-chip signal-chip-soft">{allSignals.length} total</span>
                    </div>
                  </button>
                  {accessibleForms.map((form) => {
                    const isSelected = selectedFormId === form.id;
                    const unreadCount = unreadCountByFormId[form.id] ?? 0;
                    return (
                      <button
                        key={form.id}
                        type="button"
                        className={`form-stream-item ${isSelected ? "is-active" : ""}`}
                        onClick={() => setSelectedFormId(form.id)}
                      >
                        <div className="form-stream-select">
                          <strong>{form.title}</strong>
                          <p className="muted">
                            {form.submissionCount} signals
                            {form.encryptSubmissions ? " · protected inbox" : " · open inbox"}
                          </p>
                        </div>
                        <div className="form-stream-actions">
                          <span className="signal-chip">{unreadCount} unread</span>
                          {form.projectId ? (
                            <span className="signal-chip signal-chip-soft">Project linked</span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="signal-node-summary">
                  <div className="signal-node-summary-copy">
                    <strong>{activeScopeLabel}</strong>
                    <p className="muted">
                      {t("activeNodeSummary", { count: accessibleForms.length })}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="primary-button signal-node-directory-trigger"
                    onClick={() => setNodeDirectoryOpen(true)}
                  >
                    {t("openNodeDirectory")}
                  </button>
                </div>
              </div>

            </aside>

            <section className="panel signal-inbox-column">
              <div className="signal-column-header">
                <div className="signal-column-copy">
                  <p className="eyebrow">{t("signalInboxTitle")}</p>
                  <h2>{activeStreamLabel}</h2>
                  <p className="muted">
                    {t("unreadCountSummary", {
                      count: visibleUnreadCount,
                      scope: activeScopeLabel,
                    })}
                  </p>
                </div>
                <div className="signal-column-tools">
                  <span className="signal-chip signal-chip-soft">{visibleSignals.length} results</span>
                  <span className="signal-chip signal-chip-soft">{pendingSignals.length} pending Sui</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("searchSignalsPlaceholder")}
                  />
                </div>
              </div>
              <section className="answer-card answer-card-plain">
                <div className="section-row">
                  <div>
                    <p className="eyebrow">Pending Sui Registration</p>
                    <h3>Optional proof queue</h3>
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={selectedPendingSignalIds.length === 0 || registeringSignalIds.length > 0}
                    onClick={() => void handleRegisterPendingSignals()}
                  >
                    {registeringSignalIds.length > 0
                      ? "Registering on Sui..."
                      : `Register selected on Sui${selectedPendingVisibleCount > 0 ? ` (${selectedPendingVisibleCount})` : ""}`}
                  </button>
                </div>
                <p className="muted">Sui registration is optional proof, not required for review.</p>
              </section>

              {visibleSignals.length === 0 ? (
                <EmptyState variant="abyss">
                  <p className="eyebrow">Inbox empty</p>
                  <h2>
                    {!selectedProject
                      ? "Choose a project first"
                      : selectedProjectForms.length === 0
                        ? "Create your first signal form"
                        : "Waiting for a private signal"}
                  </h2>
                  <p>
                    {!selectedProject
                      ? "The contest flow starts with project selection so reviewer access and roadmap publishing stay scoped correctly."
                      : selectedProjectForms.length === 0
                        ? "Publish a form for this project, then share the public link so someone can submit anonymously."
                        : "Share the public link and send one anonymous submission to demonstrate the locked inbox state."}
                  </p>
                  <div className="inline-actions">
                    {!selectedProject ? null : selectedProjectForms.length === 0 ? (
                      <Link className="primary-button" to="/admin/forms/new">
                        Create Signal Form
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => setNodeDirectoryOpen(true)}
                      >
                        Open public link
                      </button>
                    )}
                  </div>
                </EmptyState>
              ) : (
                <div className="signal-list">
                  {visibleSignals.map((record) => {
                    const { form, submission, category } = record;
                    const storageLabel = getStorageBadgeLabel(
                      submission.encryptedBlobId ?? submission.blobId,
                    );
                    return (
                      <Link
                        key={submission.id}
                        className={`signal-card ${submission.status === "unread" ? "is-unread" : "is-read"}`}
                        to={`/admin/forms/${form.id}/submissions/${submission.id}`}
                      >
                        <div className="signal-card-topline">
                          <strong>{getSignalSubject(submission)}</strong>
                          <span className="signal-card-time">{formatDate(submission.createdAt)}</span>
                        </div>
                        <p className={`signal-card-preview ${submission.isEncrypted ? "is-locked" : ""}`}>
                          {submission.isEncrypted
                            ? "Encrypted private signal. Requires reviewer access to unlock."
                            : getSignalPreview(submission)}
                        </p>
                        <div className="signal-card-formline">
                          <span className="signal-card-form">{form.title}</span>
                          {getSubmissionRespondentMeta(submission).isAnonymous ? (
                            <span className="signal-chip">Anonymous respondent</span>
                          ) : submission.contributorId ? (
                            <SignalMetaChip type="contributor" value={getRespondentDisplayLabel(submission)} />
                          ) : null}
                        </div>
                        <div className="signal-badge-row signal-badge-row-compact">
                          <span className={`pill status-${submission.status}`}>{submission.status}</span>
                          <span className={`pill priority-${submission.priority}`}>{submission.priority}</span>
                          <span className="signal-chip">{category}</span>
                          {submission.pendingOnchainRegistration ? (
                            <span className="signal-chip signal-chip-accent">Pending Sui</span>
                          ) : null}
                          {submission.isEncrypted ? (
                            <span className="signal-chip signal-chip-soft">Encrypted private signal</span>
                          ) : null}
                          {submission.clusterId ? (
                            <span className="signal-chip signal-chip-accent">
                              AI grouped
                              {clusterCountById[submission.clusterId]
                                ? ` (${clusterCountById[submission.clusterId]})`
                                : ""}
                            </span>
                          ) : null}
                          {submission.attachments.length > 0 ? (
                            <span className="signal-chip">
                              {t("attachmentCountLabel", { count: submission.attachments.length })}
                            </span>
                          ) : null}
                          {submission.status === "unread" ? (
                            <span className="signal-chip signal-chip-accent">
                              {t("newSignalLabel")}
                            </span>
                          ) : null}
                          <span className="signal-chip">{storageLabel}</span>
                        </div>
                        {submission.pendingOnchainRegistration ? (
                          <div className="inline-actions">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                togglePendingSelection(submission.id);
                              }}
                            >
                              {selectedPendingSignalIds.includes(submission.id) ? "Selected" : "Select for Sui"}
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={isRegisteringSignal(submission.id)}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void handleRegisterPendingSignals([submission.id]);
                              }}
                            >
                              {isRegisteringSignal(submission.id) ? "Registering..." : "Register on Sui"}
                            </button>
                          </div>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <article className="panel signal-detail-column">
              {!selectedRecord ? (
                <EmptyState variant="abyss" animated={false} showVisual={false}>
                  <p className="eyebrow">Signal detail</p>
                  <h2>No signal selected</h2>
                  <p>Choose a signal from the inbox to review it, unlock the private message, and move it toward the Public Roadmap.</p>
                </EmptyState>
              ) : (
                <>
                  <section className="answer-card signal-detail-hero">
                    <div className="signal-detail-heading">
                    <div>
                      <p className="eyebrow">{t("signalDetailTitle")}</p>
                      <h2>{getSignalSubject(selectedRecord.submission)}</h2>
                      <p className="muted">
                        {selectedRecord.form.title} / {formatDate(selectedRecord.submission.createdAt)}
                      </p>
                    </div>
                    <div className="inline-actions signal-detail-utility-actions">
                      <Link
                        className="ghost-button"
                        to={`/dashboard/forms/${selectedRecord.form.id}/submissions/${selectedRecord.submission.id}`}
                      >
                        {t("openFormInbox")}
                      </Link>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() =>
                          exportSubmissionJson(selectedRecord.form, selectedRecord.submission)
                        }
                      >
                        {t("exportJson")}
                      </button>
                      {selectedRecord.submission.pendingOnchainRegistration ? (
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={isRegisteringSignal(selectedRecord.submission.id)}
                          onClick={() => void handleRegisterPendingSignals([selectedRecord.submission.id])}
                        >
                          {isRegisteringSignal(selectedRecord.submission.id)
                            ? "Registering..."
                            : "Register on Sui"}
                        </button>
                      ) : null}
                    </div>
                    </div>

                    <div className="signal-detail-meta-row signal-badge-row-compact">
                      <span className={`pill status-${selectedRecord.submission.status}`}>
                      {selectedRecord.submission.status}
                      </span>
                      <span className={`pill priority-${selectedRecord.submission.priority}`}>
                      {selectedRecord.submission.priority}
                      </span>
                      <span className="pill">{getTriageStatusLabel(selectedRecord.submission.triageStatus)}</span>
                      <span className="signal-chip">{selectedRecord.category}</span>
                      <span className="signal-chip">
                      Severity {selectedRecord.submission.severity ?? "medium"}
                      </span>
                      <span className={`signal-chip ${detailAnswers ? "signal-chip-accent" : ""}`}>
                        {detailAnswers
                          ? "Private signal unlocked"
                          : selectedRecord.submission.isEncrypted
                            ? "Encrypted private signal"
                            : "Open submission"}
                      </span>
                      {typeof selectedRecord.submission.ratingValue === "number" ? (
                        <span className="signal-chip">
                          {t("ratingLabel", {
                            value: selectedRecord.submission.ratingValue,
                          })}
                        </span>
                      ) : null}
                    </div>
                  </section>

                  {selectedRecordNeedsDecrypt ? (
                    <div className="stack private-access-copy">
                      <p className="muted">Encrypted private signal</p>
                      <p className="muted">
                        {sealRuntime.activeMode === "mock"
                          ? `${t("demoDecryptAvailable")} Mock mode only.`
                          : t("walletApprovalReuseNotice", { minutes: REAL_SEAL_SESSION_TTL_MIN })}
                      </p>
                    </div>
                  ) : null}

                  {selectedRecord.submission.pendingOnchainRegistration ? (
                    <div className="stack private-access-copy">
                      <p className="muted">Pending Sui Registration</p>
                      <p className="muted">
                        Sui registration is optional proof, not required for review.
                      </p>
                    </div>
                  ) : null}

                  {decryptError ? <p className="warning-text">{decryptError}</p> : null}
                  {selectedRecord.submission.isEncrypted && detailAnswers ? (
                    <div className="contest-inline-success" role="status" aria-live="polite">
                      <strong>Wallet verified</strong>
                      <span>Private signal unlocked</span>
                    </div>
                  ) : null}

                  <div className="signal-detail-sections">
                    <section className="answer-card review-controls-section">
                      <div className="review-controls-header">
                        <div>
                          <p className="eyebrow">Review Workflow</p>
                          <h3>{t("reviewControlsTitle")}</h3>
                        </div>
                        <span className={`save-state-pill ${saving ? "is-pending" : ""}`}>
                          {saving ? "Saving..." : "Ready"}
                        </span>
                      </div>
                      {selectedRecord.submission.isEncrypted ? (
                        <section className="contest-review-lock-card">
                          <div className="section-row">
                            <div>
                              <p className="eyebrow">Reviewer access</p>
                              <h4>{detailAnswers ? "Private signal unlocked" : "Decrypt with Wallet"}</h4>
                            </div>
                            {detailAnswers ? (
                              <span className="signal-chip signal-chip-accent">Wallet verified</span>
                            ) : (
                              <span className="signal-chip signal-chip-soft">Requires reviewer access</span>
                            )}
                          </div>
                          <p className="muted">
                            {detailAnswers
                              ? "This reviewer wallet has been verified for the project."
                              : "Connect an authorized reviewer wallet to decrypt this private signal."}
                          </p>
                          {!detailAnswers ? (
                            <div className="inline-actions">
                              <button
                                type="button"
                                className="primary-button"
                                onClick={() => void handleDecrypt()}
                                disabled={decrypting}
                              >
                                {decrypting
                                  ? t("decryptingSignal")
                                  : sealRuntime.activeMode === "mock"
                                    ? t("decryptSignal")
                                    : "Decrypt private signal"}
                              </button>
                              {!isLocalFallbackBlob(selectedRecord.submission.encryptedBlobId) ? (
                                <BlobLink
                                  blobId={selectedRecord.submission.encryptedBlobId}
                                  label={t("verifyOnWalrus")}
                                />
                              ) : null}
                            </div>
                          ) : null}
                        </section>
                      ) : null}
                      <div className="review-field-row">
                        <label className="review-select">
                          <span>{t("status")}</span>
                          <select
                            value={selectedRecord.submission.status}
                            onChange={(event) =>
                              void updateSubmission({
                                ...selectedRecord.submission,
                                status: event.target.value as Submission["status"],
                              })
                            }
                          >
                            <option value="unread">{t("statusUnread")}</option>
                            <option value="read">{t("statusRead")}</option>
                            <option value="archived">{t("statusArchived")}</option>
                          </select>
                        </label>
                        <label className="review-select">
                          <span>Review Stage</span>
                          <select
                            value={selectedRecord.submission.triageStatus}
                            onChange={(event) =>
                              void updateSubmission({
                                ...selectedRecord.submission,
                                triageStatus: event.target.value as Submission["triageStatus"],
                              })
                            }
                          >
                            {TRIAGE_STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="review-select">
                          <span>{t("priority")}</span>
                          <select
                            value={selectedRecord.submission.priority}
                            onChange={(event) =>
                              void updateSubmission({
                                ...selectedRecord.submission,
                                priority: event.target.value as Submission["priority"],
                              })
                            }
                          >
                            <option value="low">{t("priorityLow")}</option>
                            <option value="medium">{t("priorityMedium")}</option>
                            <option value="high">{t("priorityHigh")}</option>
                          </select>
                        </label>
                      </div>
                      <div className="review-action-bar">
                        <button
                          type="button"
                          className="ghost-button review-secondary-button"
                          disabled={saving || selectedRecord.submission.status === "read"}
                          onClick={() =>
                            void updateSubmission({
                              ...selectedRecord.submission,
                              status: "read",
                            })
                          }
                        >
                          Mark reviewed
                        </button>
                        <button
                          type="button"
                          className="primary-button review-primary-button"
                          disabled={saving}
                          onClick={() =>
                            void updateSubmission({
                              ...selectedRecord.submission,
                              status: "archived",
                              triageStatus: "closed",
                            })
                          }
                        >
                          Mark resolved
                        </button>
                      </div>
                      <div className="review-secondary-links">
                        {selectedRecord.submission.githubIssueUrl ? (
                          <a
                            className="review-inline-link"
                            href={selectedRecord.submission.githubIssueUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open GitHub issue
                          </a>
                        ) : (
                          <span className="muted">GitHub issue not linked yet</span>
                        )}
                        <Link
                          className="review-inline-link"
                          to={`/dashboard/forms/${selectedRecord.form.id}/submissions/${selectedRecord.submission.id}`}
                        >
                          Review thread
                        </Link>
                        {isSelectedRecordOnRoadmap ? (
                          <Link className="review-inline-link" to={selectedRoadmapUrl}>
                            Open Public Roadmap
                          </Link>
                        ) : null}
                      </div>
                      <p className="review-helper-copy muted">
                        {selectedRecord.submission.notes.trim() ? "Notes saved." : "Notes empty."} Tags {selectedRecord.submission.tags.length}.
                      </p>
                      <section className="review-support-card contest-roadmap-card">
                        <div className="section-row">
                          <div>
                            <h4>Public Roadmap</h4>
                            <p className="muted">Planned, In Progress, and Fixed signals appear on the roadmap.</p>
                          </div>
                          <span className="signal-chip">
                            {getTriageStatusLabel(selectedRecord.submission.triageStatus)}
                          </span>
                        </div>
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            disabled={saving}
                            onClick={() => void handleMoveToRoadmap()}
                          >
                            {isSelectedRecordOnRoadmap ? "Keep on Public Roadmap" : "Move to Public Roadmap"}
                          </button>
                          {isSelectedRecordOnRoadmap ? (
                            <Link className="ghost-button" to={selectedRoadmapUrl}>
                              Open roadmap
                            </Link>
                          ) : null}
                        </div>
                      </section>
                      <div className="review-support-grid">
                        <section className="review-support-card">
                          <div className="section-row">
                            <h4>{t("tags")}</h4>
                            <span className="muted">{selectedRecord.submission.tags.length}</span>
                          </div>
                          <div className="pill-row review-tag-list">
                            {selectedRecord.submission.tags.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                className="tag-pill"
                                aria-label={`Remove tag ${tag}`}
                                onClick={() =>
                                  void updateSubmission({
                                    ...selectedRecord.submission,
                                    tags: selectedRecord.submission.tags.filter((item) => item !== tag),
                                  })
                                }
                              >
                                {tag} x
                              </button>
                            ))}
                          </div>
                          <div className="inline-actions">
                            <input
                              value={draftTag}
                              onChange={(event) => setDraftTag(event.target.value)}
                              placeholder={t("addTagPlaceholder")}
                            />
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={!draftTag.trim() || saving}
                              onClick={() => {
                                const nextTag = draftTag.trim();
                                if (selectedRecord.submission.tags.includes(nextTag)) {
                                  setDraftTag("");
                                  return;
                                }
                                setDraftTag("");
                                void updateSubmission({
                                  ...selectedRecord.submission,
                                  tags: [...selectedRecord.submission.tags, nextTag],
                                });
                              }}
                            >
                              {t("addTag")}
                            </button>
                          </div>
                        </section>

                        <section className="review-support-card">
                          <div className="section-row">
                            <h4>{t("notesTitle")}</h4>
                            <span className="muted">{saving ? "Saving..." : "Private"}</span>
                          </div>
                          <textarea
                            rows={4}
                            value={notesDraft}
                            onChange={(event) => setNotesDraft(event.target.value)}
                            placeholder={t("captureReviewNotes")}
                          />
                          <div className="review-action-bar">
                            <button
                              type="button"
                              className="ghost-button review-secondary-button"
                              disabled={saving}
                              onClick={() => setNotesDraft(selectedRecord.submission.notes)}
                            >
                              Reset
                            </button>
                            <button
                              type="button"
                              className="primary-button review-primary-button"
                              disabled={saving}
                              onClick={() =>
                                void updateSubmission({
                                  ...selectedRecord.submission,
                                  notes: notesDraft,
                                })
                              }
                            >
                              {t("saveNote")}
                            </button>
                          </div>
                        </section>
                      </div>
                    </section>

                    <section className="answer-card original-signal-section">
                      <div className="signal-detail-group-header signal-detail-group-header-original">
                        <p className="eyebrow">Original Signal</p>
                        <h3>Original Signal</h3>
                        <p className="muted">Read the submitted feedback first, then move back to review actions.</p>
                      </div>
                      <div className="original-signal-block">
                        <div className="section-row">
                          <div>
                            <p className="eyebrow">Feedback body</p>
                            <h4>Submitted Feedback</h4>
                          </div>
                        </div>
                      {detailAnswers ? (
                        <div className="stack">
                          {selectedRecord.form.fields.map((field) => (
                            <div key={field.id} className="answer-line">
                              <strong>{field.label}</strong>
                              <p>{flattenAnswer(detailAnswers[field.id]) || t("noAnswerLabel")}</p>
                            </div>
                          ))}
                        </div>
                      ) : selectedRecordNeedsDecrypt ? (
                        <div className="locked-signal-state">
                          <div className="locked-signal-copy">
                            <strong>Encrypted private signal</strong>
                            <p>Requires reviewer access. Decrypt with wallet to reveal the message.</p>
                          </div>
                          <div className="locked-signal-skeleton" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </div>
                        </div>
                      ) : (
                        <p className="muted">No response content is available yet.</p>
                      )}
                      </div>
                      <div className="original-signal-block">
                        <div className="section-row">
                          <div>
                            <p className="eyebrow">Attachments</p>
                            <h4>{t("attachments")}</h4>
                          </div>
                        </div>
                      {selectedRecordNeedsDecrypt ? (
                        <p className="muted">Attachments stay hidden until the private signal is unlocked.</p>
                      ) : detailAttachments.length === 0 ? (
                        <p className="muted">{t("noAttachments")}</p>
                      ) : (
                        <div className="stack">
                          {detailAttachments.map((attachment) => (
                            <div key={attachment.blobId} className="attachment-row">
                              <div>
                                <strong>{attachment.name}</strong>
                                <p className="muted">
                                  {attachment.type} · {Math.round(attachment.size / 1024)} KB
                                </p>
                              </div>
                              <div className="stack signal-meta-row-value">
                                <SignalMetaChip type="blob" value={attachment.blobId} />
                                {!isLocalFallbackBlob(attachment.blobId) ? (
                                  <BlobLink
                                    blobId={attachment.blobId}
                                    label={t("verifyOnWalrus")}
                                  />
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      </div>
                    </section>

                    <section className="answer-card ai-card ai-summary-section">
                      <div className="section-row">
                        <div>
                          <p className="eyebrow">AI Summary</p>
                          <h3>AI Summary</h3>
                        </div>
                        <span className="signal-chip">Confidence {inferredAiConfidence}</span>
                      </div>
                      <p>{selectedRecord.submission.aiSummary || getSignalPreview(selectedRecord.submission)}</p>
                      <div className="signal-badge-row signal-badge-row-compact">
                        <span className="signal-chip">{selectedRecord.category}</span>
                        {selectedRecord.submission.keywords?.slice(0, 3).map((keyword) => (
                          <span key={keyword} className="signal-chip">
                            {keyword}
                          </span>
                        ))}
                        {selectedRecord.submission.clusterId ? (
                          <span className="signal-chip signal-chip-accent">
                            AI grouped
                            {clusterCountById[selectedRecord.submission.clusterId]
                              ? ` (${clusterCountById[selectedRecord.submission.clusterId]})`
                              : ""}
                          </span>
                        ) : null}
                      </div>
                    </section>

                    <section className="answer-card triage-compact-card ai-card ai-triage-section">
                      <div className="section-row">
                        <div>
                          <p className="eyebrow">AI Triage</p>
                          <h3>AI Triage</h3>
                        </div>
                        <span className="muted">Secondary</span>
                      </div>
                      <div className="signal-badge-row signal-badge-row-compact">
                        <span className="signal-chip">{selectedRecord.category}</span>
                        <span className="signal-chip">
                          Severity {selectedRecord.submission.severity ?? "medium"}
                        </span>
                        <span className="signal-chip">
                          Emotion {selectedRecord.submission.emotion ?? "neutral"}
                        </span>
                        <span className="signal-chip">
                          Duplicate {selectedRecord.submission.clusterId ? "Possible" : "None"}
                        </span>
                      </div>
                    </section>

                    <section className="signal-detail-group details-group-section">
                      <div className="signal-detail-group-header signal-detail-group-header-details">
                        <p className="eyebrow">Trust Metadata</p>
                        <h3>Trust Metadata</h3>
                        <p className="muted">Technical proof stays grouped here so review actions remain the focus.</p>
                      </div>

                      <details className="answer-card collapsible-detail-card ai-similar-section ai-card">
                        <summary>
                          <span>
                            <p className="eyebrow">Similar Signals</p>
                            <h3>Similar Signals</h3>
                          </span>
                        </summary>
                        <SignalClusterPanel
                          selectedSubmission={selectedRecord.submission}
                          submissions={allSignals.map((record) => record.submission)}
                          formById={formById}
                          formTitleById={formTitleById}
                          busy={saving}
                          onSelectSignal={(submissionId) => setSelectedSignalId(submissionId)}
                          onSaveSubmission={updateSubmission}
                        />
                      </details>

                      <details
                        className="answer-card collapsible-detail-card tertiary-detail-section"
                        open={showMetadata}
                        onToggle={(event) =>
                          setShowMetadata((event.currentTarget as HTMLDetailsElement).open)
                        }
                      >
                        <summary>
                          <span>
                            <p className="eyebrow">Trust Metadata</p>
                            <h3>Trusted storage and proof</h3>
                          </span>
                        </summary>
                        <div className="metadata-list">
                          <div className="metadata-row">
                            <span>Review state</span>
                            <strong>{detailAnswers ? "Private signal unlocked" : "Encrypted private signal"}</strong>
                          </div>
                          <div className="metadata-row">
                            <span>Seal runtime</span>
                            <strong>{sealRuntime.activeMode === "mock" ? "Mock reviewer mode" : "Project reviewer access"}</strong>
                          </div>
                          <SignalMetaRow label="Project" type="registry" value={selectedRecord.form.projectId} emptyLabel={t("notAvailable")} />
                          {typeof selectedRecord.form.onchainFormId === "number" ? (
                            <div className="metadata-row">
                              <span>Registry Form ID</span>
                              <strong>{selectedRecord.form.onchainFormId}</strong>
                            </div>
                          ) : null}
                          {typeof selectedRecord.submission.onchainSignalId === "number" ? (
                            <div className="metadata-row">
                              <span>Signal Receipt</span>
                              <strong>{selectedRecord.submission.onchainSignalId}</strong>
                            </div>
                          ) : null}
                          <SignalMetaRow label={t("formBlobId")} type="blob" value={selectedRecord.form.blobId} emptyLabel={t("notAvailable")}>
                            {!isLocalFallbackBlob(selectedRecord.form.blobId) ? (
                              <BlobLink
                                blobId={selectedRecord.form.blobId}
                                label={t("verifyOnWalrus")}
                              />
                            ) : null}
                          </SignalMetaRow>
                          <SignalMetaRow label={t("submissionBlobIdLabel")} type="blob" value={selectedRecord.submission.blobId} emptyLabel={t("notAvailable")}>
                            {!isLocalFallbackBlob(selectedRecord.submission.blobId) ? (
                              <BlobLink
                                blobId={selectedRecord.submission.blobId}
                                label={t("verifyOnWalrus")}
                              />
                            ) : null}
                          </SignalMetaRow>
                          {hasDedicatedEncryptedPayloadBlob(selectedRecord.submission) ? (
                            <SignalMetaRow
                              label={t("encryptedPayloadBlobId")}
                              type="seal"
                              value={selectedRecord.submission.encryptedBlobId}
                            >
                              {!isLocalFallbackBlob(selectedRecord.submission.encryptedBlobId) ? (
                                <BlobLink
                                  blobId={selectedRecord.submission.encryptedBlobId}
                                  label={t("verifyOnWalrus")}
                                />
                              ) : null}
                            </SignalMetaRow>
                          ) : selectedRecord.submission.isEncrypted ? (
                            <div className="metadata-row">
                              <span>Encrypted Payload</span>
                              <strong>{getEncryptedPayloadAvailabilityLabel(selectedRecord.submission)}</strong>
                            </div>
                          ) : null}
                          <SignalMetaRow label="Seal Identity" type="seal" value={selectedRecord.submission.sealIdentity} emptyLabel={t("notAvailable")} />
                          {selectedRecord.submission.signalReceiptMetadataDigest ? (
                            <SignalMetaRow
                              label="Receipt Metadata Digest"
                              type="registry"
                              value={selectedRecord.submission.signalReceiptMetadataDigest}
                              emptyLabel={t("notAvailable")}
                            />
                          ) : null}
                          <div className="metadata-row signal-meta-row">
                            <span>{t("attachmentBlobIds")}</span>
                            <div className="stack signal-meta-row-value">
                              {selectedRecord.submission.attachments.length === 0 ? (
                                <strong>{t("notAvailable")}</strong>
                              ) : (
                                selectedRecord.submission.attachments.map((attachment) => (
                                  <div key={attachment.blobId} className="signal-meta-row-value">
                                    <SignalMetaChip type="blob" value={attachment.blobId} />
                                    {!isLocalFallbackBlob(attachment.blobId) ? (
                                      <BlobLink
                                        blobId={attachment.blobId}
                                        label={t("verifyOnWalrus")}
                                      />
                                    ) : null}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                          <div className="metadata-row">
                            <span>Wallet</span>
                            <strong>
                              {getSubmissionRespondentMeta(selectedRecord.submission).isAnonymous
                                ? "Anonymous respondent"
                                : getSubmissionRespondentMeta(selectedRecord.submission).walletAddress ?? t("notAvailable")}
                            </strong>
                          </div>
                          <div className="metadata-row">
                            <span>Anonymous</span>
                            <strong>{getSubmissionRespondentMeta(selectedRecord.submission).isAnonymous ? "Yes" : "No"}</strong>
                          </div>
                          <div className="metadata-row">
                            <span>Submitted</span>
                            <strong>{formatDate(getSubmissionRespondentMeta(selectedRecord.submission).submittedAt)}</strong>
                          </div>
                          <div className="metadata-row">
                            <span>Chain</span>
                            <strong>{getSubmissionRespondentMeta(selectedRecord.submission).chain}</strong>
                          </div>
                          <div className="metadata-row">
                            <span>{t("storageMode")}</span>
                            <strong>
                              {storageRuntime.mode === "walrus"
                                ? t("storageWalrus")
                                : t("localFallbackLabel")}
                            </strong>
                          </div>
                          <div className="metadata-row">
                            <span>Reviewer access</span>
                            <strong>{privateReviewLabel}</strong>
                          </div>
                          <div className="metadata-row">
                            <span>{t("walletAccessStatus")}</span>
                            <strong>
                              {getWalletAccessLabel(selectedRecord.form, account?.address)}
                            </strong>
                          </div>
                          <div className="metadata-row">
                            <span>Pending Sui registration</span>
                            <strong>
                              {selectedRecord.submission.onchainStatus ??
                                (selectedRecord.submission.pendingOnchainRegistration
                                  ? t("pendingSuiRegistration")
                                  : "offchain only")}
                            </strong>
                          </div>
                          <div className="inline-actions metadata-action-row">
                            {selectedRecord.submission.pendingOnchainRegistration ? (
                              <button
                                type="button"
                                className="ghost-button"
                                disabled={isRegisteringSignal(selectedRecord.submission.id)}
                                onClick={() => void handleRegisterPendingSignals([selectedRecord.submission.id])}
                              >
                                {isRegisteringSignal(selectedRecord.submission.id)
                                  ? "Registering..."
                                  : "Register on Sui"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={saving}
                              onClick={() => void handleMoveToRoadmap()}
                            >
                              {isSelectedRecordOnRoadmap ? "On Public Roadmap" : "Move to Public Roadmap"}
                            </button>
                            {isSelectedRecordOnRoadmap ? (
                              <Link className="ghost-button" to={selectedRoadmapUrl}>
                                Open Public Roadmap
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      </details>

                      <details
                        className="answer-card collapsible-detail-card original-raw-payload-section tertiary-detail-section"
                        open={showEncryptedSignal}
                        onToggle={(event) =>
                          setShowEncryptedSignal((event.currentTarget as HTMLDetailsElement).open)
                        }
                      >
                        <summary>
                          <span>
                            <p className="eyebrow">Technical details</p>
                            <h3>Encrypted payload details</h3>
                          </span>
                        </summary>
                        <SealStatusCard
                          encryptSubmissions={selectedRecord.form.encryptSubmissions}
                          encryptedBlobId={selectedRecord.submission.encryptedBlobId}
                          encryptedPayloadEmbedded={
                            Boolean(selectedRecord.submission.encryptedPayload) &&
                            !selectedRecord.submission.encryptedBlobId
                          }
                          canDecrypt={Boolean(account?.address)}
                          walletAccessStatus={getWalletAccessLabel(selectedRecord.form, account?.address)}
                        />
                      </details>

                      <details className="answer-card collapsible-detail-card tertiary-detail-section">
                        <summary>
                          <span>
                            <p className="eyebrow">{t("nodeActions")}</p>
                            <h3>{selectedRecord.form.title}</h3>
                          </span>
                        </summary>
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => setNodeDirectoryOpen(true)}
                          >
                            {t("openNodeDirectory")}
                          </button>
                          <Link
                            className="ghost-button"
                            to={getPublicFormPath(selectedRecord.form.id, selectedRecord.form.manifestBlobId)}
                          >
                            {t("openPublicForm")}
                          </Link>
                          <Link className="ghost-button" to={`/dashboard/forms/${selectedRecord.form.id}`}>
                            {t("reviewSubmissions")}
                          </Link>
                        </div>
                      </details>
                    </section>
                  </div>
                </>
              )}
            </article>
          </div>
        )}
      </section>
      {nodeDirectoryOpen ? (
        <div className="node-directory-overlay" role="dialog" aria-modal="true">
          <div className="node-directory-backdrop" onClick={() => setNodeDirectoryOpen(false)} />
          <section className="panel glow-panel node-directory-panel">
            <div className="signal-detail-heading">
              <div>
                <p className="eyebrow">{t("signalNodesTitle")}</p>
                <h2>{t("nodeDirectoryTitle")}</h2>
                <p className="muted">{t("nodeDirectoryDescription")}</p>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setNodeDirectoryOpen(false)}
              >
                {t("closeLabel")}
              </button>
            </div>

            <div className="node-directory-toolbar">
              <input
                value={nodeSearch}
                onChange={(event) => setNodeSearch(event.target.value)}
                placeholder={t("searchNodesPlaceholder")}
              />
              <div className="node-directory-toolbar-actions">
                <div className="node-directory-stats">
                  <span className="signal-chip">
                    {t("activeNodeSummary", { count: accessibleForms.length })}
                  </span>
                  <span className="signal-chip">
                    {t("signalsCount", { count: allSignals.length })}
                  </span>
                </div>
                {hasAdminAccess || !capabilityProfile.isConfigured ? (
                  <button
                    type="button"
                    className="ghost-button node-directory-delete"
                    onClick={() => void handleDeleteVisibleNodes(deletableNodeIds)}
                    disabled={deletingVisibleNodes || deletableNodeIds.length === 0}
                  >
                    {deletingVisibleNodes ? t("deletingLabel") : t("deleteVisibleNodes", { count: deletableNodeIds.length })}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="node-directory-list">
              {nodeDirectoryItems.map((item) => {
                const isSelected = selectedFormId === item.id;
                return (
                  <div key={item.id} className={`node-directory-row ${isSelected ? "is-active" : ""}`}>
                    <button
                      type="button"
                      className={`node-directory-item ${isSelected ? "is-active" : ""}`}
                      onClick={() => {
                        setSelectedFormId(item.id);
                        setNodeDirectoryOpen(false);
                      }}
                    >
                      <div className="node-directory-item-main">
                        <div className="node-directory-item-heading">
                          <strong>{item.title}</strong>
                          {item.unreadCount > 0 ? (
                            <span className="node-unread-badge">
                              {t("unreadBadge", { count: item.unreadCount })}
                            </span>
                          ) : null}
                        </div>
                        <p className="muted">
                          {t("signalsCount", { count: item.submissionCount })}
                          {item.isLegacyDemo ? ` / ${t("legacyDemoForm")}` : ""}
                        </p>
                      </div>
                    </button>
                    {item.id !== "all" ? (
                      <div className="node-directory-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            setBeaconFormId(item.id);
                            setNodeDirectoryOpen(false);
                          }}
                        >
                          {t("openSignalBeacon")}
                        </button>
                        {hasAdminAccess || !capabilityProfile.isConfigured ? (
                          <button
                            type="button"
                            className="ghost-button node-directory-delete"
                            onClick={() => void handleDelete(item.id)}
                            disabled={deletingVisibleNodes || deletingFormId === item.id}
                          >
                            {deletingFormId === item.id ? t("deletingLabel") : t("deleteNode")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {nodeDirectoryItems.length === 1 && nodeSearch.trim() ? (
                <EmptyState>
                  <h2>{t("noNodesFoundTitle")}</h2>
                  <p>{t("noNodesFoundBody")}</p>
                </EmptyState>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      {selectedBeaconForm ? (
        <div className="node-directory-overlay" role="dialog" aria-modal="true">
          <div className="node-directory-backdrop" onClick={() => setBeaconFormId(null)} />
          <section className="panel glow-panel node-directory-panel beacon-overlay-panel">
            <div className="signal-detail-heading">
              <div>
                <p className="eyebrow">{t("signalBeaconLabel")}</p>
                <h2>{selectedBeaconForm.title}</h2>
                <p className="muted">{t("signalBeaconFromNodeDescription")}</p>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setBeaconFormId(null)}
              >
                {t("closeLabel")}
              </button>
            </div>
            <ShareCard
              formId={selectedBeaconForm.id}
              blobId={selectedBeaconForm.blobId}
              createdAt={selectedBeaconForm.createdAt}
            />
          </section>
        </div>
      ) : null}
    </AdminAccessGate>
  );
}


