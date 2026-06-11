import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  isProjectOwnerCapType,
  loadRecentProjects,
  parseProjectIdFromOwnerCapFields,
  parseSuiObjectData,
  parseProjectSummary,
  saveRecentProject,
  subscribeProjectRegistryStorageChange,
  type ProjectOwnerCapSummary,
  type ProjectSummary,
} from "../lib/projectRegistry";
import { PROJECT_OWNER_CAP_TYPE } from "../lib/sui";
import { isSuiRateLimitError } from "../lib/sui";
import { endPerf, markPerfMilestone, startPerf } from "../lib/perf";
import { handleRateLimitedRpcFallback, useRpcInfrastructure } from "../rpcInfrastructure";
import { useOwnedSuiObjects } from "./useOwnedSuiObjects";
import { useReadOnlyCoreSuiClient } from "./useReadOnlyCoreSuiClient";

function parseProjectOwnerCapResponse(response: unknown) {
  const parsed = parseSuiObjectData(response);
  if (!parsed || !isProjectOwnerCapType(parsed.type)) {
    return null;
  }
  const projectId = parseProjectIdFromOwnerCapFields(parsed.fields);
  if (!projectId) {
    return null;
  }
  return {
    objectId: parsed.objectId,
    projectId,
  };
}

function normalizeType(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

async function fetchProjectObjects(
  suiClient: ReturnType<typeof useReadOnlyCoreSuiClient>,
  projectIds: string[],
) {
  const projects: ProjectSummary[] = [];
  for (let index = 0; index < projectIds.length; index += 50) {
    const ids = projectIds.slice(index, index + 50);
    const responses = await suiClient.core.getObjects({
      objectIds: ids,
      include: {
        json: true,
      },
    });

    responses.objects.forEach((response, responseIndex) => {
      if (response instanceof Error) {
        return;
      }
      const project = parseProjectSummary(ids[responseIndex], response.json);
      if (project) {
        projects.push(project);
      }
    });
  }
  return projects;
}

export function useProjectRegistry(address?: string | null) {
  const suiClient = useReadOnlyCoreSuiClient();
  const rpc = useRpcInfrastructure();
  const enabled = Boolean(address && PROJECT_OWNER_CAP_TYPE && !rpc.isRateLimitedCooldownActive);
  const expectedType = normalizeType(PROJECT_OWNER_CAP_TYPE);
  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>(() => loadRecentProjects());
  const ownedObjectsQuery = useOwnedSuiObjects(address, {
    enabled,
    structTypes: PROJECT_OWNER_CAP_TYPE ? [PROJECT_OWNER_CAP_TYPE] : [],
  });
  const ownerCapObjectIds = useMemo(
    () =>
      (ownedObjectsQuery.data ?? [])
        .filter((entry) => isProjectOwnerCapType(entry.data?.type) || normalizeType(entry.data?.type) === expectedType)
        .map((entry) => entry.data?.objectId?.trim() ?? "")
        .filter(Boolean),
    [expectedType, ownedObjectsQuery.data],
  );
  const parsedOwnedProjectCaps = useMemo(
    () =>
      (ownedObjectsQuery.data ?? [])
        .filter((entry) => isProjectOwnerCapType(entry.data?.type) || normalizeType(entry.data?.type) === expectedType)
        .map((entry) =>
          parseProjectOwnerCapResponse({
            data: {
              objectId: entry.data?.objectId,
              type: entry.data?.type,
              content: entry.data?.content,
            },
          }),
        )
        .filter((entry): entry is ProjectOwnerCapSummary => Boolean(entry)),
    [expectedType, ownedObjectsQuery.data],
  );

  const projectQuery = useQuery({
    queryKey: ["project-registry", address ?? "", ownerCapObjectIds.join(","), rpc.mode, rpc.currentRpcUrl],
    enabled: enabled && ownerCapObjectIds.length > 0,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      startPerf("projects_fetch_start", address ?? undefined);
      markPerfMilestone("projects_fetch_start", address ? "wallet-connected" : "wallet-disconnected");
      try {
        const parsedCaps = parsedOwnedProjectCaps;

        const knownCapIds = new Set(parsedCaps.map((cap) => cap.objectId));
        const missingCapIds = ownerCapObjectIds.filter((objectId) => !knownCapIds.has(objectId));

        let hydratedCaps = parsedCaps;
        if (missingCapIds.length > 0) {
          const capResponses = await suiClient.core.getObjects({
            objectIds: missingCapIds,
            include: {
              json: true,
            },
          });

          hydratedCaps = [
            ...parsedCaps,
            ...capResponses.objects
              .map((response) => (response instanceof Error ? null : parseProjectOwnerCapResponse({ object: response })))
              .filter((entry): entry is ProjectOwnerCapSummary => Boolean(entry)),
          ];
        }

        const projectIds = [...new Set(hydratedCaps.map((cap) => cap.projectId).filter(Boolean))];
        if (projectIds.length === 0) {
          const result = {
            caps: hydratedCaps,
            projects: [],
          };
          endPerf("projects_fetch_start", "ok", "0 projects");
          markPerfMilestone("projects_fetch_end", "0 projects");
          return result;
        }

        const projects = await fetchProjectObjects(suiClient, projectIds);
        const ownerCapIdByProjectId = new Map(
          hydratedCaps.map((cap) => [cap.projectId, cap.objectId]),
        );

        const result = {
          caps: hydratedCaps,
          projects: projects.map((project) => ({
            ...project,
            ownedOwnerCapId: ownerCapIdByProjectId.get(project.objectId),
          })),
        };
        endPerf("projects_fetch_start", "ok", `${result.projects.length} projects`);
        markPerfMilestone("projects_fetch_end", `${result.projects.length} projects`);
        return result;
      } catch (error) {
        if (isSuiRateLimitError(error)) {
          handleRateLimitedRpcFallback(rpc, error);
          endPerf("projects_fetch_start", "ok", "rate-limited-fallback");
          markPerfMilestone("projects_fetch_end", "rate-limited-fallback");
          return {
            caps: [],
            projects: [],
          };
        }
        endPerf("projects_fetch_start", "failed", error instanceof Error ? error.message : String(error));
        markPerfMilestone("projects_fetch_end", "failed");
        throw error;
      }
    },
  });

  useEffect(() => {
    setRecentProjects(loadRecentProjects());
  }, [address, projectQuery.dataUpdatedAt]);

  useEffect(() => {
    (projectQuery.data?.projects ?? []).forEach((project) => {
      saveRecentProject(project);
    });
  }, [projectQuery.data?.projects]);

  useEffect(() => {
    return subscribeProjectRegistryStorageChange(() => {
      setRecentProjects(loadRecentProjects());
    });
  }, []);

  const projects = useMemo<ProjectSummary[]>(
    () =>
      [
        ...(projectQuery.data?.projects ?? []),
        ...recentProjects,
      ].filter(
        (project, index, all) =>
          Boolean(project.objectId) && all.findIndex((entry) => entry.objectId === project.objectId) === index,
      ),
    [projectQuery.data?.projects, recentProjects],
  );

  async function refetchProjects() {
    await ownedObjectsQuery.refetch();
    return projectQuery.refetch();
  }

  return {
    ...projectQuery,
    refetch: refetchProjects,
    dataUpdatedAt: Math.max(ownedObjectsQuery.dataUpdatedAt, projectQuery.dataUpdatedAt),
    projects,
    ownedProjectCaps: projectQuery.data?.caps ?? parsedOwnedProjectCaps,
  };
}
