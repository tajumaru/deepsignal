import { useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  loadRecentProjects,
  parseProjectOwnerCap,
  parseProjectSummary,
  subscribeProjectRegistryStorageChange,
  type ProjectSummary,
} from "../lib/projectRegistry";
import { PROJECT_OWNER_CAP_TYPE } from "../lib/sui";
import { isSuiRateLimitError } from "../lib/sui";
import { handleRateLimitedRpcFallback, useRpcInfrastructure } from "../rpcInfrastructure";

type OwnedObjectEntry = {
  data?: {
    objectId?: string;
    type?: string;
    content?: {
      fields?: Record<string, unknown>;
    } | null;
  } | null;
};

type OwnedObjectsResponse = {
  data?: OwnedObjectEntry[];
  hasNextPage?: boolean;
  nextCursor?: string | null;
};

type OwnedObjectsRequest = {
  owner: string;
  cursor?: string;
  options?: {
    showType?: boolean;
    showContent?: boolean;
  };
  limit?: number;
  filter?: {
    StructType: string;
  };
};

type SuiObjectResponse = {
  data?: {
    objectId?: string;
    content?: {
      fields?: Record<string, unknown>;
    } | null;
  } | null;
};

function normalizeType(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

async function fetchOwnedProjectCaps(
  suiClient: ReturnType<typeof useSuiClient>,
  owner: string,
  structType: string,
) {
  const ownedCaps: OwnedObjectEntry[] = [];
  let cursor: string | null | undefined = null;
  let pageCount = 0;

  do {
    const page = (await suiClient.getOwnedObjects({
      owner,
      cursor: cursor ?? undefined,
      filter: {
        StructType: structType,
      },
      options: {
        showType: true,
        showContent: true,
      },
      limit: 50,
    } as OwnedObjectsRequest)) as OwnedObjectsResponse;

    ownedCaps.push(...(page.data ?? []));
    cursor = page.hasNextPage ? page.nextCursor : null;
    pageCount += 1;
  } while (cursor && pageCount < 20);

  return ownedCaps;
}

export function useProjectRegistry(address?: string | null) {
  const suiClient = useSuiClient();
  const rpc = useRpcInfrastructure();
  const enabled = Boolean(address && PROJECT_OWNER_CAP_TYPE && !rpc.isRateLimitedCooldownActive);
  const expectedType = normalizeType(PROJECT_OWNER_CAP_TYPE);
  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>(() => loadRecentProjects());

  const projectQuery = useQuery({
    queryKey: ["project-registry", address ?? "", expectedType, rpc.mode, rpc.currentRpcUrl],
    enabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      try {
        const ownedCaps = await fetchOwnedProjectCaps(suiClient, address ?? "", PROJECT_OWNER_CAP_TYPE);

        const caps = ownedCaps
          .map((entry) => parseProjectOwnerCap(entry))
          .filter((entry): entry is NonNullable<ReturnType<typeof parseProjectOwnerCap>> => Boolean(entry));
        const projects: ProjectSummary[] = [];

        for (const cap of caps) {
          try {
            const response = (await suiClient.getObject({
              id: cap.projectId,
              options: {
                showContent: true,
              },
            })) as SuiObjectResponse;
            const project = parseProjectSummary(cap.projectId, response.data?.content?.fields, cap.objectId);
            if (project) {
              projects.push(project);
            }
          } catch (error) {
            if (isSuiRateLimitError(error)) {
              handleRateLimitedRpcFallback(rpc, error);
            }
            if (projects.length === 0) {
              throw error;
            }
            break;
          }
        }

        return {
          caps,
          projects,
        };
      } catch (error) {
        if (isSuiRateLimitError(error)) {
          handleRateLimitedRpcFallback(rpc, error);
          return {
            caps: [],
            projects: [],
          };
        }
        throw error;
      }
    },
  });

  useEffect(() => {
    setRecentProjects(loadRecentProjects());
  }, [address, projectQuery.dataUpdatedAt]);

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

  return {
    ...projectQuery,
    projects,
    ownedProjectCaps: projectQuery.data?.caps ?? [],
  };
}
