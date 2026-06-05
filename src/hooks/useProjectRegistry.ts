import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  isProjectOwnerCapType,
  loadRecentProjects,
  parseProjectOwnerCap,
  parseProjectSummary,
  saveRecentProject,
  subscribeProjectRegistryStorageChange,
  type ProjectSummary,
} from "../lib/projectRegistry";
import { PROJECT_OWNER_CAP_TYPE } from "../lib/sui";
import { isSuiRateLimitError } from "../lib/sui";
import { endPerf, markPerfMilestone, startPerf } from "../lib/perf";
import { handleRateLimitedRpcFallback, useRpcInfrastructure } from "../rpcInfrastructure";
import { useOwnedSuiObjects } from "./useOwnedSuiObjects";
import { useRpcSuiClient } from "./useRpcSuiClient";

type SuiObjectResponse = {
  data?: {
    objectId?: string;
    type?: string;
    content?: {
      fields?: Record<string, unknown>;
    } | null;
  } | null;
};

function normalizeType(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

async function fetchProjectObjects(
  suiClient: ReturnType<typeof useRpcSuiClient>,
  projectIds: string[],
) {
  const projects: ProjectSummary[] = [];
  for (let index = 0; index < projectIds.length; index += 50) {
    const ids = projectIds.slice(index, index + 50);
    let responses: SuiObjectResponse[];

    try {
      responses = (await suiClient.multiGetObjects({
        ids,
        options: {
          showType: true,
          showContent: true,
        },
      })) as SuiObjectResponse[];
    } catch {
      responses = await Promise.all(
        ids.map(async (id) =>
          (await suiClient.getObject({
            id,
            options: {
              showType: true,
              showContent: true,
            },
          })) as SuiObjectResponse,
        ),
      );
    }

    responses.forEach((response, responseIndex) => {
      const project = parseProjectSummary(ids[responseIndex], response.data?.content?.fields);
      if (project) {
        projects.push(project);
      }
    });
  }
  return projects;
}

export function useProjectRegistry(address?: string | null) {
  const suiClient = useRpcSuiClient();
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
        .map((entry) => parseProjectOwnerCap(entry))
        .filter((entry): entry is NonNullable<ReturnType<typeof parseProjectOwnerCap>> => Boolean(entry)),
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
          let capResponses: SuiObjectResponse[];

          try {
            capResponses = (await suiClient.multiGetObjects({
              ids: missingCapIds,
              options: {
                showType: true,
                showContent: true,
              },
            })) as SuiObjectResponse[];
          } catch {
            capResponses = await Promise.all(
              missingCapIds.map(async (id) =>
                (await suiClient.getObject({
                  id,
                  options: {
                    showType: true,
                    showContent: true,
                  },
                })) as SuiObjectResponse,
              ),
            );
          }

          hydratedCaps = [
            ...parsedCaps,
            ...capResponses
              .map((response) => parseProjectOwnerCap(response))
              .filter((entry): entry is NonNullable<ReturnType<typeof parseProjectOwnerCap>> => Boolean(entry)),
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
