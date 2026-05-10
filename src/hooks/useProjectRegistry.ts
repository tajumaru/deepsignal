import { useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { loadRecentProjects, parseProjectOwnerCap, parseProjectSummary, type ProjectSummary } from "../lib/projectRegistry";
import { PROJECT_OWNER_CAP_TYPE } from "../lib/sui";

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

export function useProjectRegistry(address?: string | null) {
  const suiClient = useSuiClient();
  const enabled = Boolean(address && PROJECT_OWNER_CAP_TYPE);
  const expectedType = normalizeType(PROJECT_OWNER_CAP_TYPE);
  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>(() => loadRecentProjects());

  const projectQuery = useQuery({
    queryKey: ["project-registry", address ?? "", expectedType],
    enabled,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const ownedCaps: OwnedObjectEntry[] = [];
      let cursor: string | null | undefined = null;
      let pageCount = 0;

      do {
        const page = (await suiClient.getOwnedObjects({
          owner: address ?? "",
          cursor: cursor ?? undefined,
          options: {
            showType: true,
            showContent: true,
          },
          limit: 50,
        })) as OwnedObjectsResponse;

        for (const entry of page.data ?? []) {
          if (normalizeType(entry.data?.type) === expectedType) {
            ownedCaps.push(entry);
          }
        }

        cursor = page.hasNextPage ? page.nextCursor : null;
        pageCount += 1;
      } while (cursor && pageCount < 20);

      const caps = ownedCaps
        .map((entry) => parseProjectOwnerCap(entry))
        .filter((entry): entry is NonNullable<ReturnType<typeof parseProjectOwnerCap>> => Boolean(entry));
      const projects = await Promise.all(
        caps.map(async (cap) => {
          const response = (await suiClient.getObject({
            id: cap.projectId,
            options: {
              showContent: true,
            },
          })) as SuiObjectResponse;
          return parseProjectSummary(cap.projectId, response.data?.content?.fields, cap.objectId);
        }),
      );

      return {
        caps,
        projects: projects.filter((project): project is NonNullable<typeof project> => Boolean(project)),
      };
    },
  });

  useEffect(() => {
    setRecentProjects(loadRecentProjects());
  }, [address, projectQuery.dataUpdatedAt]);

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
