import type { ActivityActorRole, ActivityAction, ActivityEvent, FormSchema } from "../types";
import {
  ACCESS_CONTROL_PACKAGE_ID,
  PROJECT_REGISTRY_MODULE,
  SUI_NETWORK,
} from "./sui";

const ACTIVITY_EVENTS_KEY = "deepsignal.activityEvents.v1";
const SUI_ACTIVITY_CACHE_KEY = "deepsignal.suiActivityEvents.v1";
const SUI_ACTIVITY_CACHE_TTL_MS = 15_000;

interface SuiEventPage {
  data?: SuiEventRecord[];
  hasNextPage?: boolean;
  nextCursor?: SuiEventCursor | null;
}

interface SuiEventRecord {
  id?: {
    txDigest?: string;
    eventSeq?: string | number;
  };
  timestampMs?: string | number | null;
  parsedJson?: unknown;
}

interface SuiEventCursor {
  txDigest: string;
  eventSeq: string;
}

interface SuiEventClient {
  queryEvents(args: {
    query: {
      MoveEventType: string;
    };
    cursor?: SuiEventCursor | null;
    limit?: number;
    order?: "ascending" | "descending";
  }): Promise<SuiEventPage>;
}

export interface ActivityProjectScope {
  objectId: string;
  owner?: string;
  admins?: string[];
}

interface CachedSuiActivityEvents {
  events: ActivityEvent[];
  cachedAt: number;
}

const suiActivityRequestCache = new Map<string, CachedSuiActivityEvents>();
const suiActivityPendingRequests = new Map<string, Promise<ActivityEvent[]>>();

function hasLocalStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readJson<T>(key: string, fallback: T): T {
  if (!hasLocalStorage()) {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!hasLocalStorage()) {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readSuiActivityCache() {
  const cached = readJson<Record<string, CachedSuiActivityEvents | undefined>>(SUI_ACTIVITY_CACHE_KEY, {});
  const normalized: Record<string, CachedSuiActivityEvents> = {};

  Object.entries(cached).forEach(([key, value]) => {
    if (!value || typeof value !== "object") {
      return;
    }
    const cachedAt = typeof value.cachedAt === "number" ? value.cachedAt : 0;
    const events = Array.isArray(value.events)
      ? value.events
          .map((event) =>
            normalizeActivityEvent(event as ActivityEvent | (Record<string, unknown> & { id?: string })),
          )
          .filter((event): event is ActivityEvent => Boolean(event))
      : [];
    if (cachedAt > 0) {
      normalized[key] = { cachedAt, events };
    }
  });

  return normalized;
}

function writeSuiActivityCacheEntry(cacheKey: string, value: CachedSuiActivityEvents) {
  const nextCache = readSuiActivityCache();
  nextCache[cacheKey] = value;
  writeJson(SUI_ACTIVITY_CACHE_KEY, nextCache);
}

function isActivityAction(value: unknown): value is ActivityAction {
  return (
    value === "form_created" ||
    value === "form_published" ||
    value === "form_updated" ||
    value === "form_archived"
  );
}

function isActivityActorRole(value: unknown): value is ActivityActorRole {
  return value === "owner" || value === "admin" || value === "unknown";
}

export function normalizeActivityEvent(raw: ActivityEvent | (Record<string, unknown> & { id?: string })): ActivityEvent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const id = typeof raw.id === "string" ? raw.id : "";
  const formId = typeof raw.formId === "string" ? raw.formId : "";
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : "";
  const action = isActivityAction(raw.action) ? raw.action : null;
  if (!id || !formId || !createdAt || !action) {
    return null;
  }
  return {
    id,
    formId,
    formTitleSnapshot: typeof raw.formTitleSnapshot === "string" ? raw.formTitleSnapshot : "Untitled signal",
    actorAddress: typeof raw.actorAddress === "string" ? raw.actorAddress : "",
    actorRole: isActivityActorRole(raw.actorRole) ? raw.actorRole : "unknown",
    action,
    createdAt,
    txDigest: typeof raw.txDigest === "string" && raw.txDigest.trim() ? raw.txDigest : undefined,
  };
}

export function listActivityEvents() {
  return readJson<ActivityEvent[]>(ACTIVITY_EVENTS_KEY, [])
    .map((event) => normalizeActivityEvent(event))
    .filter((event): event is ActivityEvent => Boolean(event))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function mergeActivityEvents(...eventGroups: Array<Array<ActivityEvent | null | undefined>>) {
  const nextById = new Map<string, ActivityEvent>();
  eventGroups.flat().forEach((event) => {
    const normalized = event ? normalizeActivityEvent(event) : null;
    if (normalized) {
      nextById.set(normalized.id, normalized);
    }
  });
  return [...nextById.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function appendActivityEvents(events: ActivityEvent[]) {
  if (events.length === 0) {
    return;
  }
  writeJson(ACTIVITY_EVENTS_KEY, mergeActivityEvents(events, listActivityEvents()));
}

export function createActivityEvent(input: {
  form: Pick<FormSchema, "id" | "title">;
  actorAddress?: string | null;
  actorRole?: ActivityActorRole;
  action: ActivityAction;
  createdAt?: string;
  txDigest?: string;
}): ActivityEvent {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return {
    id: `activity-${input.action}-${input.form.id}-${createdAt}-${crypto.randomUUID()}`,
    formId: input.form.id,
    formTitleSnapshot: input.form.title.trim() || "Untitled signal",
    actorAddress: input.actorAddress?.trim() || "",
    actorRole: input.actorRole ?? "unknown",
    action: input.action,
    createdAt,
    txDigest: input.txDigest?.trim() || undefined,
  };
}

export function getActivityActorRole(input: { hasOwnerCap?: boolean; hasAdminCap?: boolean }): ActivityActorRole {
  if (input.hasOwnerCap) {
    return "owner";
  }
  if (input.hasAdminCap) {
    return "admin";
  }
  return "unknown";
}

export function getSuiTransactionUrl(txDigest?: string) {
  if (!txDigest) {
    return null;
  }
  return `https://suiexplorer.com/txblock/${encodeURIComponent(txDigest)}?network=${SUI_NETWORK}`;
}

function readStringField(fields: Record<string, unknown>, key: string) {
  const value = fields[key];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return "";
}

function readBooleanField(fields: Record<string, unknown>, key: string) {
  const value = fields[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value === "true";
  }
  return false;
}

function readEventFields(event: SuiEventRecord) {
  return event.parsedJson && typeof event.parsedJson === "object" && !Array.isArray(event.parsedJson)
    ? (event.parsedJson as Record<string, unknown>)
    : null;
}

function getOnchainEventCreatedAt(event: SuiEventRecord, fields: Record<string, unknown>) {
  const createdAtMs = Number(readStringField(fields, "created_at") || event.timestampMs || 0);
  return Number.isFinite(createdAtMs) && createdAtMs > 0
    ? new Date(createdAtMs).toISOString()
    : new Date(0).toISOString();
}

function getOnchainActorRole(actor: string, project?: ActivityProjectScope): ActivityActorRole {
  const normalizedActor = actor.toLowerCase();
  if (project?.owner?.toLowerCase() === normalizedActor) {
    return "owner";
  }
  if (project?.admins?.some((admin) => admin.toLowerCase() === normalizedActor)) {
    return "admin";
  }
  return "unknown";
}

function makeOnchainActivityEvent(args: {
  action: ActivityAction;
  actorAddress: string;
  actorRole: ActivityActorRole;
  createdAt: string;
  formId: string;
  formTitleSnapshot: string;
  txDigest?: string;
}) {
  return {
    id: `activity-sui-${args.action}-${args.formId}-${args.txDigest ?? args.createdAt}`,
    formId: args.formId,
    formTitleSnapshot: args.formTitleSnapshot || "Untitled signal",
    actorAddress: args.actorAddress,
    actorRole: args.actorRole,
    action: args.action,
    createdAt: args.createdAt,
    txDigest: args.txDigest,
  } satisfies ActivityEvent;
}

function getActivityProjectsCacheKey(projects: ActivityProjectScope[]) {
  return projects
    .map((project) => ({
      objectId: project.objectId.trim().toLowerCase(),
      owner: project.owner?.trim().toLowerCase() ?? "",
      admins: [...(project.admins ?? [])].map((admin) => admin.trim().toLowerCase()).sort(),
    }))
    .sort((left, right) => left.objectId.localeCompare(right.objectId))
    .map((project) => `${project.objectId}:${project.owner}:${project.admins.join(",")}`)
    .join("|");
}

function getFreshCachedSuiActivityEvents(cacheKey: string, now = Date.now()) {
  const memoryEntry = suiActivityRequestCache.get(cacheKey);
  if (memoryEntry && now - memoryEntry.cachedAt <= SUI_ACTIVITY_CACHE_TTL_MS) {
    return memoryEntry.events;
  }

  const storedEntry = readSuiActivityCache()[cacheKey];
  if (storedEntry && now - storedEntry.cachedAt <= SUI_ACTIVITY_CACHE_TTL_MS) {
    suiActivityRequestCache.set(cacheKey, storedEntry);
    return storedEntry.events;
  }

  return null;
}

function getAnyCachedSuiActivityEvents(cacheKey: string) {
  return suiActivityRequestCache.get(cacheKey)?.events ?? readSuiActivityCache()[cacheKey]?.events ?? null;
}

function cacheSuiActivityEvents(cacheKey: string, events: ActivityEvent[]) {
  const entry = { events, cachedAt: Date.now() };
  suiActivityRequestCache.set(cacheKey, entry);
  writeSuiActivityCacheEntry(cacheKey, entry);
}

async function queryMoveEvents(client: SuiEventClient, moveEventType: string) {
  const events: SuiEventRecord[] = [];
  let cursor: SuiEventCursor | null | undefined;
  let pageCount = 0;

  do {
    const page = await client.queryEvents({
      query: { MoveEventType: moveEventType },
      cursor,
      limit: 50,
      order: "descending",
    });
    events.push(...(page.data ?? []));
    cursor = page.hasNextPage ? page.nextCursor : null;
    pageCount += 1;
  } while (cursor && pageCount < 4);

  return events;
}

export async function listSuiActivityEvents(
  client: SuiEventClient,
  projects: ActivityProjectScope[],
) {
  if (!ACCESS_CONTROL_PACKAGE_ID || projects.length === 0) {
    return [] as ActivityEvent[];
  }
  const cacheKey = getActivityProjectsCacheKey(projects);
  const freshCachedEvents = getFreshCachedSuiActivityEvents(cacheKey);
  if (freshCachedEvents) {
    return freshCachedEvents;
  }

  const pendingRequest = suiActivityPendingRequests.get(cacheKey);
  if (pendingRequest) {
    return pendingRequest;
  }

  const projectById = new Map(projects.map((project) => [project.objectId.toLowerCase(), project]));
  const eventTypes = {
    formCreated: `${ACCESS_CONTROL_PACKAGE_ID}::${PROJECT_REGISTRY_MODULE}::FormCreated`,
    formDeleted: `${ACCESS_CONTROL_PACKAGE_ID}::${PROJECT_REGISTRY_MODULE}::FormDeleted`,
    formStatusChanged: `${ACCESS_CONTROL_PACKAGE_ID}::${PROJECT_REGISTRY_MODULE}::FormStatusChanged`,
  };
  const request = (async () => {
    try {
      const [createdEvents, deletedEvents, statusEvents] = await Promise.all([
        queryMoveEvents(client, eventTypes.formCreated),
        queryMoveEvents(client, eventTypes.formDeleted),
        queryMoveEvents(client, eventTypes.formStatusChanged),
      ]);

      const mappedCreatedEvents = createdEvents.flatMap((event) => {
        const fields = readEventFields(event);
        if (!fields) {
          return [];
        }
        const projectId = readStringField(fields, "project_id");
        const project = projectById.get(projectId.toLowerCase());
        if (!project) {
          return [];
        }
        const actor = readStringField(fields, "actor");
        const formId = readStringField(fields, "form_id");
        return [
          makeOnchainActivityEvent({
            action: "form_updated",
            actorAddress: actor,
            actorRole: getOnchainActorRole(actor, project),
            createdAt: getOnchainEventCreatedAt(event, fields),
            formId: `onchain:${projectId}:${formId}`,
            formTitleSnapshot: readStringField(fields, "title"),
            txDigest: event.id?.txDigest,
          }),
        ];
      });

      const mappedDeletedEvents = deletedEvents.flatMap((event) => {
        const fields = readEventFields(event);
        if (!fields) {
          return [];
        }
        const projectId = readStringField(fields, "project_id");
        const project = projectById.get(projectId.toLowerCase());
        if (!project) {
          return [];
        }
        const actor = readStringField(fields, "actor");
        const formId = readStringField(fields, "form_id");
        return [
          makeOnchainActivityEvent({
            action: "form_archived",
            actorAddress: actor,
            actorRole: getOnchainActorRole(actor, project),
            createdAt: getOnchainEventCreatedAt(event, fields),
            formId: `onchain:${projectId}:${formId}`,
            formTitleSnapshot: readStringField(fields, "title"),
            txDigest: event.id?.txDigest,
          }),
        ];
      });

      const mappedInactiveEvents = statusEvents.flatMap((event) => {
        const fields = readEventFields(event);
        if (!fields || readBooleanField(fields, "active")) {
          return [];
        }
        const projectId = readStringField(fields, "project_id");
        const project = projectById.get(projectId.toLowerCase());
        if (!project) {
          return [];
        }
        const actor = readStringField(fields, "actor");
        const formId = readStringField(fields, "form_id");
        return [
          makeOnchainActivityEvent({
            action: "form_archived",
            actorAddress: actor,
            actorRole: getOnchainActorRole(actor, project),
            createdAt: getOnchainEventCreatedAt(event, fields),
            formId: `onchain:${projectId}:${formId}`,
            formTitleSnapshot: `On-chain form ${formId}`,
            txDigest: event.id?.txDigest,
          }),
        ];
      });

      const mergedEvents = mergeActivityEvents(mappedCreatedEvents, mappedDeletedEvents, mappedInactiveEvents);
      cacheSuiActivityEvents(cacheKey, mergedEvents);
      return mergedEvents;
    } catch (error) {
      const cachedEvents = getAnyCachedSuiActivityEvents(cacheKey);
      if (cachedEvents) {
        return cachedEvents;
      }
      throw error;
    } finally {
      suiActivityPendingRequests.delete(cacheKey);
    }
  })();

  suiActivityPendingRequests.set(cacheKey, request);
  return request;
}
