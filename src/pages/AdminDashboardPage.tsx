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
import { SealStatusCard } from "../components/SealStatusCard";
import { ShareCard } from "../components/ShareCard";
import { SignalClusterPanel } from "../components/SignalClusterPanel";
import { SignalMetaChip, SignalMetaRow } from "../components/SignalMetaChip";
import { getSealRuntimeStatus } from "../crypto/cryptoFactory";
import { useAccessControl } from "../hooks/useAccessControl";
import { useProjectRegistry } from "../hooks/useProjectRegistry";
import { useI18n } from "../i18n";
import {
  createProject,
  getSelectedProjectId,
  isProjectObjectType,
  isProjectOwnerCapType,
  parseProjectIdFromOwnerCapFields,
  parseSuiObjectData,
  parseProjectSummary,
  saveRecentProject,
  setSelectedProjectId,
} from "../lib/projectRegistry";
import {
  canAdmin,
  canReviewForm,
  getAdminSurfaceAccessState,
  getRoleLabel,
} from "../lib/adminAccess";
import { exportSubmissionJson } from "../lib/export";
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
  | "bug"
  | "feature"
  | "archived";

interface SignalRecord {
  form: FormWithCount;
  submission: Submission;
  category: SignalCategory;
}

function formatWorkspaceCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatAccessLabel(roleLabel: string) {
  return `${roleLabel} access`;
}

function matchesStream(record: SignalRecord, streamId: StreamId) {
  switch (streamId) {
    case "unread":
      return record.submission.status === "unread";
    case "encrypted":
      return record.submission.isEncrypted;
    case "high":
      return record.submission.priority === "high";
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
  const saveQueueRef = useRef(Promise.resolve());
  const hasAdminAccess = canAdmin(capabilityProfile);
  const selectedProject = projects.find((project) => project.objectId === selectedProjectId) ?? null;
  const projectMemberCount = selectedProject ? selectedProject.admins.length + 1 : 0;
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
      setSelectedProjectIdState(project.objectId);
      setSelectedProjectId(project.objectId);
      setManualProjectId("");
      setProjectState(`Connected to ${project.name}.`);
    } catch (projectError) {
      setProjectState(projectError instanceof Error ? projectError.message : "Failed to load project.");
    }
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

  useEffect(() => {
    if (!selectedRecord) {
      setDetailAnswers(null);
      setDetailAttachments([]);
      setNotesDraft("");
      setDecryptError("");
      return;
    }
    setNotesDraft(selectedRecord.submission.notes);
    setDetailAnswers(
      selectedRecord.submission.isEncrypted ? null : selectedRecord.submission.answers,
    );
    setDetailAttachments(selectedRecord.submission.attachments ?? []);
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

  async function handleSelect(record: SignalRecord) {
    setSelectedSignalId(record.submission.id);
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
      }
    } catch (error) {
      setDecryptError(error instanceof Error ? error.message : t("decryptFailed"));
    } finally {
      setDecrypting(false);
    }
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
  const workspaceMetaItems = [
    formatWorkspaceCount(selectedProject ? selectedProject.formsCount : accessibleForms.length, "Form"),
    formatWorkspaceCount(selectedProject ? selectedProject.signalsCount : allSignals.length, "Signal"),
    formatWorkspaceCount(projectMemberCount || 1, "Member"),
    selectedProject ? "Protected" : "Local mode",
    formatAccessLabel(roleLabel),
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
      deniedBody={
        capabilityProfile.isConfigured
          ? "OwnerCap / AdminCap / ReviewerCap を持つウォレットだけが review console を開けます。"
          : undefined
      }
    >
      <section className="stack">
        {toast ? (
          <div className={`signal-toast is-${toast.tone}`} role="status" aria-live="polite">
            {toast.message}
          </div>
        ) : null}
        <section className="panel glow-panel workspace-hero">
          <div className="workspace-hero-main">
            <div className="workspace-hero-copy">
              <p className="eyebrow">{t("creatorOnlyInbox")}</p>
              <h1>{selectedProject ? selectedProject.name : "Signal workspace"}</h1>
              <p className="lede">
                {selectedProject
                  ? "Review incoming signals, manage who can read them, and launch the next protected form from one place."
                  : "Choose a project to review protected signals, or stay in Walrus / local mode while you set things up."}
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
                  <option value="">Walrus / local only</option>
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

        <section className="panel workspace-primary-action">
          <div>
            <p className="eyebrow">Primary action</p>
            <h2>{selectedProject ? "New Signal Form" : t("createSignalForm")}</h2>
            <p className="muted">Launch a new protected feedback entrypoint.</p>
          </div>
          <div className="workspace-primary-actions">
            <Link className="primary-button" to="/admin/forms/new">
              {selectedProject ? "Create form for this project" : "New Signal Form"}
            </Link>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setNodeDirectoryOpen(true)}
            >
              {t("openNodeDirectory")}
            </button>
          </div>
        </section>

        <details className="panel advanced-project-settings">
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
            </div>

            {projectState ? <p className="muted">{projectState}</p> : null}
          </div>
        </details>

        <div className="mobile-console-banner">{t("adminDesktopNotice")}</div>

        {accessibleForms.length === 0 ? (
          <EmptyState>
            <h2>{t("noCreatorInboxesTitle")}</h2>
            <p>{t("noCreatorInboxesBody")}</p>
            {hasAdminAccess || !capabilityProfile.isConfigured ? (
              <Link className="primary-button" to="/admin/forms/new">
                {t("createSignalForm")}
              </Link>
            ) : null}
          </EmptyState>
        ) : (
          <div className="signal-console-layout">
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
                <div className="signal-node-summary">
                  <div className="signal-node-summary-copy">
                    <strong>
                      {selectedFormId === "all"
                        ? t("allSignalNodes")
                        : selectedForm?.title ?? t("selectedNode")}
                    </strong>
                    <p className="muted">{t("activeNodeSummary", { count: accessibleForms.length })}</p>
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
                <div>
                  <p className="eyebrow">{t("signalInboxTitle")}</p>
                  <h2>{streamItems.find((stream) => stream.id === selectedStreamId)?.label}</h2>
                  <p className="muted">
                    {t("unreadCountSummary", {
                      count: visibleSignals.filter((record) => record.submission.status === "unread").length,
                      scope:
                        selectedFormId === "all"
                          ? t("allSignalNodes")
                          : accessibleForms.find((form) => form.id === selectedFormId)?.title ??
                            t("selectedNode"),
                    })}
                  </p>
                </div>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("searchSignalsPlaceholder")}
                />
              </div>

              {visibleSignals.length === 0 ? (
                <EmptyState variant="abyss">
                  <p className="eyebrow">Abyssal Scan</p>
                  <h2>{t("abyssNoSignalsTitle")}</h2>
                  <p>{t("abyssNoSignalsBody")}</p>
                  <p className="muted">{t("abyssNoSignalsHint")}</p>
                </EmptyState>
              ) : (
                <div className="signal-list">
                  {visibleSignals.map((record) => {
                    const { form, submission, category } = record;
                    const isSelected = selectedRecord?.submission.id === submission.id;
                    const storageLabel = getStorageBadgeLabel(
                      submission.encryptedBlobId ?? submission.blobId,
                    );
                    return (
                      <button
                        key={submission.id}
                        type="button"
                        className={`signal-card ${isSelected ? "is-active" : ""} ${submission.status === "unread" ? "is-unread" : "is-read"}`}
                        onClick={() => void handleSelect(record)}
                      >
                        <div className="signal-card-topline">
                          <strong>{getSignalSubject(submission)}</strong>
                          <span className="signal-card-time">{formatDate(submission.createdAt)}</span>
                        </div>
                        <p className="signal-card-preview">{getSignalPreview(submission)}</p>
                        <div className="signal-card-formline">
                          <span className="signal-card-form">{form.title}</span>
                          {submission.contributorId ? (
                            <SignalMetaChip type="contributor" value={submission.contributorId} />
                          ) : null}
                        </div>
                        <div className="signal-badge-row signal-badge-row-compact">
                          <span className={`pill status-${submission.status}`}>{submission.status}</span>
                          <span className={`pill priority-${submission.priority}`}>{submission.priority}</span>
                          <span className="signal-chip">{category}</span>
                          {submission.isEncrypted ? (
                            <span className="signal-chip signal-chip-soft">Protected</span>
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
                      </button>
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
                  <p>Choose a signal from the inbox to review its answers, attachments, and status.</p>
                </EmptyState>
              ) : (
                <>
                  <section className="answer-card signal-detail-hero">
                    <div className="signal-detail-heading">
                    <div>
                      <p className="eyebrow">{t("signalDetailTitle")}</p>
                      <h2>{getSignalSubject(selectedRecord.submission)}</h2>
                      <p className="muted">
                        {selectedRecord.form.title} · {formatDate(selectedRecord.submission.createdAt)}
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
                    </div>
                    </div>

                    <div className="signal-detail-meta-row signal-badge-row-compact">
                      <span className={`pill status-${selectedRecord.submission.status}`}>
                      {selectedRecord.submission.status}
                      </span>
                      <span className={`pill priority-${selectedRecord.submission.priority}`}>
                      {selectedRecord.submission.priority}
                      </span>
                      <span className="signal-chip">{selectedRecord.category}</span>
                      <span className="signal-chip">
                      Severity {selectedRecord.submission.severity ?? "medium"}
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

                  {selectedRecord.submission.isEncrypted ? (
                    <section className="answer-card private-access-card">
                      <div className="private-access-actions">
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
                    </section>
                  ) : null}

                  {selectedRecord.submission.isEncrypted && !detailAnswers ? (
                    <div className="stack private-access-copy">
                      <p className="muted">{privateReviewLabel}</p>
                      <p className="muted">
                        {sealRuntime.activeMode === "mock"
                          ? `${t("demoDecryptAvailable")} Mock mode only.`
                          : "Private signal. Wallet approval is required before the full content is shown."}
                      </p>
                    </div>
                  ) : null}

                  {decryptError ? <p className="warning-text">{decryptError}</p> : null}

                  <div className="signal-detail-sections">
                    <section className="answer-card">
                      <p className="eyebrow">AI Summary</p>
                      <h3>AI Summary</h3>
                      <p>{getSignalPreview(selectedRecord.submission)}</p>
                      <div className="signal-badge-row signal-badge-row-compact">
                        <span className="signal-chip">{selectedRecord.category}</span>
                        <span className={`pill status-${selectedRecord.submission.status}`}>
                          {selectedRecord.submission.status}
                        </span>
                        <span className={`pill priority-${selectedRecord.submission.priority}`}>
                          {selectedRecord.submission.priority}
                        </span>
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

                    <section className="answer-card">
                      <p className="eyebrow">Raw signal</p>
                      <h3>{t("answersTitle")}</h3>
                      {detailAnswers ? (
                        <div className="stack">
                          {selectedRecord.form.fields.map((field) => (
                            <div key={field.id} className="answer-line">
                              <strong>{field.label}</strong>
                              <p>{flattenAnswer(detailAnswers[field.id]) || t("noAnswerLabel")}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="muted">{t("encryptedFeedbackHidden")}</p>
                      )}
                    </section>

                    <section className="answer-card">
                      <p className="eyebrow">Attachments</p>
                      <h3>{t("attachments")}</h3>
                      {detailAttachments.length === 0 ? (
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
                    </section>

                    <SignalClusterPanel
                      selectedSubmission={selectedRecord.submission}
                      submissions={allSignals.map((record) => record.submission)}
                      formById={formById}
                      formTitleById={formTitleById}
                      busy={saving}
                      onSelectSignal={(submissionId) => setSelectedSignalId(submissionId)}
                      onSaveSubmission={updateSubmission}
                    />

                    <section className="answer-card">
                      <p className="eyebrow">Actions</p>
                      <div className="section-row">
                        <h3>{t("reviewControlsTitle")}</h3>
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            disabled={saving || selectedRecord.submission.status === "read"}
                            onClick={() =>
                              void updateSubmission({
                                ...selectedRecord.submission,
                                status: "read",
                              })
                            }
                          >
                            Mark as reviewed
                          </button>
                          <button type="button" className="ghost-button" disabled>
                            Create GitHub issue
                          </button>
                        </div>
                      </div>
                      <label>
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
                      <label>
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
                    </section>

                    <section className="answer-card">
                      <div className="section-row">
                        <h3>{t("tags")}</h3>
                        <span className="muted">{selectedRecord.submission.tags.length}</span>
                      </div>
                      <div className="pill-row">
                        {selectedRecord.submission.tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="tag-pill"
                            onClick={() =>
                              void updateSubmission({
                                ...selectedRecord.submission,
                                tags: selectedRecord.submission.tags.filter((item) => item !== tag),
                              })
                            }
                          >
                            {tag} ×
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

                    <section className="answer-card">
                      <h3>{t("notesTitle")}</h3>
                      <textarea
                        rows={6}
                        value={notesDraft}
                        onChange={(event) => setNotesDraft(event.target.value)}
                        placeholder={t("captureReviewNotes")}
                      />
                      <button
                        type="button"
                        className="primary-button"
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
                    </section>

                    <section className="answer-card">
                      <p className="eyebrow">Metadata</p>
                      <div className="section-row">
                        <h3>{t("signalMetadataTitle")}</h3>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setShowMetadata((current) => !current)}
                        >
                          {showMetadata ? t("hideSignalMetadata") : t("showSignalMetadata")}
                        </button>
                      </div>
                      {showMetadata ? (
                        <div className="metadata-list">
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
                          <SignalMetaRow label={t("encryptedPayloadBlobId")} type="seal" value={selectedRecord.submission.encryptedBlobId} emptyLabel={t("notAvailable")}>
                            {!isLocalFallbackBlob(selectedRecord.submission.encryptedBlobId) ? (
                              <BlobLink
                                blobId={selectedRecord.submission.encryptedBlobId}
                                label={t("verifyOnWalrus")}
                              />
                            ) : null}
                          </SignalMetaRow>
                          <SignalMetaRow label="Seal Identity" type="seal" value={selectedRecord.submission.sealIdentity} emptyLabel={t("notAvailable")} />
                          <SignalMetaRow
                            label="Receipt Metadata Digest"
                            type="registry"
                            value={selectedRecord.submission.signalReceiptMetadataDigest}
                            emptyLabel={t("notAvailable")}
                          />
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
                          <SignalMetaRow label="Contributor" type="contributor" value={selectedRecord.submission.contributorId} emptyLabel={t("notAvailable")} />
                          <div className="metadata-row">
                            <span>{t("storageMode")}</span>
                            <strong>
                              {storageRuntime.mode === "walrus"
                                ? t("storageWalrus")
                                : t("localFallbackLabel")}
                            </strong>
                          </div>
                          <div className="metadata-row">
                            <span>Private review</span>
                            <strong>{privateReviewLabel}</strong>
                          </div>
                          <div className="metadata-row">
                            <span>{t("walletAccessStatus")}</span>
                            <strong>
                              {getWalletAccessLabel(selectedRecord.form, account?.address)}
                            </strong>
                          </div>
                          <div className="metadata-row">
                            <span>Project status sync</span>
                            <strong>{selectedRecord.submission.onchainStatus ?? "offchain only"}</strong>
                          </div>
                        </div>
                      ) : null}
                    </section>

                    <section className="answer-card">
                      <div className="section-row">
                        <h3>Protected payload</h3>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setShowEncryptedSignal((current) => !current)}
                        >
                          {showEncryptedSignal ? t("hideEncryptedSignal") : t("showEncryptedSignal")}
                        </button>
                      </div>
                      {showEncryptedSignal ? (
                        <SealStatusCard
                          encryptSubmissions={selectedRecord.form.encryptSubmissions}
                          encryptedBlobId={selectedRecord.submission.encryptedBlobId}
                          canDecrypt={Boolean(account?.address)}
                          walletAccessStatus={getWalletAccessLabel(selectedRecord.form, account?.address)}
                        />
                      ) : null}
                    </section>

                    <section className="answer-card">
                      <div className="section-row">
                        <div>
                          <p className="eyebrow">{t("nodeActions")}</p>
                          <h3>{selectedRecord.form.title}</h3>
                        </div>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setNodeDirectoryOpen(true)}
                        >
                          {t("openNodeDirectory")}
                        </button>
                      </div>
                      <div className="inline-actions">
                        <Link className="ghost-button" to={`/f/${selectedRecord.form.id}`}>
                          {t("openPublicForm")}
                        </Link>
                        <Link className="ghost-button" to={`/dashboard/forms/${selectedRecord.form.id}`}>
                          {t("reviewSubmissions")}
                        </Link>
                      </div>
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
              <div className="node-directory-stats">
                <span className="signal-chip">
                  {t("activeNodeSummary", { count: accessibleForms.length })}
                </span>
                <span className="signal-chip">
                  {t("signalsCount", { count: allSignals.length })}
                </span>
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
                          {item.isLegacyDemo ? ` · ${t("legacyDemoForm")}` : ""}
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
                            disabled={deletingFormId === item.id}
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
