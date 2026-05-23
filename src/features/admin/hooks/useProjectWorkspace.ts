import {
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { canAdmin } from "../../../lib/adminAccess";
import {
  createProject,
  deleteFormOnChain,
  deleteProject,
  getSelectedProjectId,
  isProjectObjectType,
  isProjectOwnerCapType,
  parseProjectIdFromOwnerCapFields,
  parseProjectSummary,
  parseSuiObjectData,
  removeRecentProject,
  saveRecentProject,
  setSelectedProjectId,
} from "../../../lib/projectRegistry";
import { useProjectRegistry } from "../../../hooks/useProjectRegistry";
import type { CapabilityProfile } from "../../../hooks/useAccessControl";
import type { FormWithCount } from "./useSignalInboxData";

interface UseProjectWorkspaceArgs {
  accountAddress?: string | null;
  capabilityProfile: CapabilityProfile;
  forms: FormWithCount[];
  loadConsole: () => Promise<void>;
}

export function useProjectWorkspace({
  accountAddress,
  capabilityProfile,
  forms,
  loadConsole,
}: UseProjectWorkspaceArgs) {
  const suiClient = useSuiClient();
  const { projects, refetch: refetchProjects } = useProjectRegistry(accountAddress);
  const createProjectTx = useSignAndExecuteTransaction();
  const deleteProjectTx = useSignAndExecuteTransaction();
  const deleteOnchainFormTx = useSignAndExecuteTransaction();
  const [selectedProjectId, setSelectedProjectIdState] = useState(() => getSelectedProjectId());
  const [hydratedSelectedProject, setHydratedSelectedProject] = useState<ReturnType<typeof parseProjectSummary> | null>(null);
  const [manualProjectId, setManualProjectId] = useState("");
  const [projectCreateName, setProjectCreateName] = useState("");
  const [projectState, setProjectState] = useState("");
  const [highlightCreateFormCta, setHighlightCreateFormCta] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [deletingOnchainFormIds, setDeletingOnchainFormIds] = useState<number[]>([]);
  const advancedProjectSettingsRef = useRef<HTMLDetailsElement | null>(null);
  const manualProjectInputRef = useRef<HTMLInputElement | null>(null);
  const projectCreateInputRef = useRef<HTMLInputElement | null>(null);
  const hasAdminAccess = canAdmin(capabilityProfile);

  const visibleProjects = hasAdminAccess ? projects : [];
  const visibleSelectedProjectId = hasAdminAccess ? selectedProjectId : "";
  const cachedSelectedProject = visibleProjects.find((project) => project.objectId === visibleSelectedProjectId) ?? null;
  const selectedProject = useMemo(() => {
    if (!visibleSelectedProjectId) {
      return null;
    }
    if (hydratedSelectedProject?.objectId === visibleSelectedProjectId) {
      return {
        ...(cachedSelectedProject ?? {}),
        ...hydratedSelectedProject,
        ownedOwnerCapId: cachedSelectedProject?.ownedOwnerCapId,
      };
    }
    return cachedSelectedProject;
  }, [cachedSelectedProject, hydratedSelectedProject, visibleSelectedProjectId]);
  const projectMemberCount = selectedProject ? selectedProject.admins.length + 1 : 0;
  const localProjectFormsCount = useMemo(
    () => forms.filter((form) => form.projectId === selectedProject?.objectId).length,
    [forms, selectedProject?.objectId],
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

  useEffect(() => {
    if (!hasAdminAccess) {
      return;
    }
    if (selectedProjectId) {
      setSelectedProjectId(selectedProjectId);
      return;
    }
    if (projects[0]?.objectId) {
      setSelectedProjectIdState(projects[0].objectId);
      setSelectedProjectId(projects[0].objectId);
    }
  }, [hasAdminAccess, projects, selectedProjectId]);

  useEffect(() => {
    if (!highlightCreateFormCta) {
      return;
    }
    const timer = window.setTimeout(() => {
      setHighlightCreateFormCta(false);
    }, 5200);
    return () => window.clearTimeout(timer);
  }, [highlightCreateFormCta]);

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

  useEffect(() => {
    if (!hasAdminAccess || !visibleSelectedProjectId) {
      setHydratedSelectedProject(null);
      return;
    }

    let cancelled = false;

    const refreshSelectedProject = async () => {
      try {
        const project = await hydrateProject(visibleSelectedProjectId);
        if (!cancelled) {
          setHydratedSelectedProject(project);
        }
      } catch {
        if (!cancelled) {
          setHydratedSelectedProject(null);
        }
      }
    };

    void refreshSelectedProject();

    const handleFocus = () => {
      void refreshSelectedProject();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
    };
  }, [hasAdminAccess, visibleSelectedProjectId]);

  async function connectManualProject() {
    if (!hasAdminAccess) {
      setProjectState("OwnerCap or AdminCap is required to connect a project.");
      return;
    }
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
    if (!hasAdminAccess) {
      return;
    }
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

  function selectProject(projectId: string) {
    if (!hasAdminAccess) {
      return;
    }
    setSelectedProjectIdState(projectId);
    setSelectedProjectId(projectId);
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
        registryId: capabilityProfile.registryId,
        recipientAddress: accountAddress ?? "",
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
      setHighlightCreateFormCta(true);
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
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

  return {
    projects: visibleProjects,
    refetchProjects,
    selectedProjectId: visibleSelectedProjectId,
    selectProject,
    selectedProject,
    localProjectFormsCount,
    projectMemberCount,
    manualProjectId,
    setManualProjectId,
    projectCreateName,
    setProjectCreateName,
    highlightCreateFormCta,
    isCreatingProject: createProjectTx.isPending,
    projectState,
    setProjectState,
    deletingProject,
    deletingOnchainFormIds,
    advancedProjectSettingsRef,
    manualProjectInputRef,
    projectCreateInputRef,
    deleteProjectBlockedReason,
    visibleOnchainForms,
    connectManualProject,
    revealProjectTools,
    handleCreateProject,
    handleDeleteProject,
    handleDeleteOnchainForm,
  };
}
