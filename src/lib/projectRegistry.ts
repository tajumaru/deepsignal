import {
  ACCESS_CONTROL_PACKAGE_ID,
  PROJECT_REGISTRY_MODULE,
} from "./sui";

export type GlobalProjectCreatorRole = "owner" | "admin";
export type OnchainSignalStatus = "new" | "triaged" | "archived";
export type ProjectMemberRole = "owner" | "co_admin" | "reviewer";

export const PROJECT_ROLE_OWNER = 0;
export const PROJECT_ROLE_CO_ADMIN = 1;
export const PROJECT_ROLE_REVIEWER = 2;

const RECENT_PROJECTS_KEY = "deepsignal.projectRegistry.recentProjects";
const SELECTED_PROJECT_ID_KEY = "deepsignal.projectRegistry.selectedProjectId";
const PROJECT_REGISTRY_STORAGE_EVENT = "deepsignal:project-registry-storage";

export interface ProjectSummary {
  objectId: string;
  name: string;
  owner: string;
  admins: string[];
  reviewers: string[];
  members: ProjectMemberSummary[];
  formsCount: number;
  signalsCount: number;
  onchainForms?: OnchainProjectFormSummary[];
  onchainSignals?: OnchainProjectSignalSummary[];
  createdAt?: string;
  ownedOwnerCapId?: string;
}

export interface ProjectMemberSummary {
  address: string;
  role: ProjectMemberRole;
  roleCode: number;
}

export interface OnchainProjectFormSummary {
  formId: number;
  title: string;
  metadataDigest: string;
  manifestBlobId?: string;
  formBlobId?: string;
  sourceFormId?: string;
  active: boolean;
  createdAt?: string;
}

export interface OnchainProjectSignalSummary {
  signalId: number;
  formId: number;
  walrusBlobId: string;
  metadataDigest: string;
  encrypted: boolean;
  sealIdentity?: string;
  submitter?: string;
  status: "new" | "triaged" | "archived";
  createdAt?: string;
}

export interface ProjectOwnerCapSummary {
  objectId: string;
  projectId: string;
}

export interface ParsedSuiObjectData {
  objectId: string;
  type: string;
  fields: Record<string, unknown> | null;
}

export type ProjectObjectClient = {
  getObject?: (input: {
    id: string;
    options?: {
      showType?: boolean;
      showContent?: boolean;
    };
  }) => Promise<unknown>;
  core?: {
    getObject: (input: {
      objectId: string;
      include?: {
        json?: boolean;
      };
    }) => Promise<unknown>;
  };
};

export interface ProjectFormMetadataReference {
  digest: string;
  manifestBlobId?: string;
  formBlobId?: string;
  formId?: string;
}

const PROJECT_FORM_METADATA_PREFIX = "deepsignal-form-ref:v1:";
const PROJECT_OBJECT_CACHE_TTL_MS = 1000 * 60 * 3;
const projectObjectCache = new Map<string, { expiresAt: number; promise: Promise<ProjectSummary | null> }>();

function emitProjectRegistryStorageChange() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(PROJECT_REGISTRY_STORAGE_EVENT));
}

function normalizeObjectId(value?: string | null) {
  if (!value) {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function normalizeType(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function storageNamespace() {
  return normalizeObjectId(ACCESS_CONTROL_PACKAGE_ID) || "unconfigured";
}

function recentProjectsKey() {
  return `${RECENT_PROJECTS_KEY}:${storageNamespace()}`;
}

function selectedProjectIdKey() {
  return `${SELECTED_PROJECT_ID_KEY}:${storageNamespace()}`;
}

export function subscribeProjectRegistryStorageChange(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key !== null &&
      event.key !== recentProjectsKey() &&
      event.key !== selectedProjectIdKey()
    ) {
      return;
    }
    listener();
  };

  window.addEventListener(PROJECT_REGISTRY_STORAGE_EVENT, listener);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(PROJECT_REGISTRY_STORAGE_EVENT, listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function readNestedValue(source: unknown): unknown {
  if (!source || typeof source !== "object") {
    return source;
  }

  if (Array.isArray(source)) {
    return source;
  }

  const record = source as Record<string, unknown>;
  if (typeof record.id === "string") {
    return record.id;
  }
  if (typeof record.bytes === "string") {
    return record.bytes;
  }
  if ("fields" in record) {
    return readNestedValue(record.fields);
  }
  if ("value" in record) {
    return readNestedValue(record.value);
  }

  return source;
}

function readObjectId(source: unknown) {
  const value = readNestedValue(source);
  return typeof value === "string" ? normalizeObjectId(value) : "";
}

function readString(source: unknown) {
  const value = readNestedValue(source);
  return typeof value === "string" ? value : "";
}

function readAddressVector(source: unknown) {
  if (Array.isArray(source)) {
    return source.map((item) => (typeof item === "string" ? normalizeObjectId(item) : "")).filter(Boolean);
  }
  if (!source || typeof source !== "object") {
    return [];
  }

  const record = source as Record<string, unknown>;
  if (Array.isArray(record.contents)) {
    return readAddressVector(record.contents);
  }
  if (record.fields && typeof record.fields === "object") {
    return readAddressVector(record.fields);
  }
  return [];
}

function roleCodeToProjectMemberRole(roleCode: number): ProjectMemberRole {
  if (roleCode === PROJECT_ROLE_CO_ADMIN) {
    return "co_admin";
  }
  if (roleCode === PROJECT_ROLE_REVIEWER) {
    return "reviewer";
  }
  return "owner";
}

function readU64(source: unknown) {
  if (typeof source === "number" && Number.isFinite(source)) {
    return source;
  }
  if (typeof source === "string" && source.trim()) {
    const parsed = Number(source);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (source && typeof source === "object") {
    const nested = readNestedValue(source);
    return readU64(nested);
  }
  return 0;
}

function readBool(source: unknown) {
  if (typeof source === "boolean") {
    return source;
  }
  if (typeof source === "string") {
    return source === "true";
  }
  if (source && typeof source === "object") {
    return readBool(readNestedValue(source));
  }
  return false;
}

function readVectorEntries(source: unknown): Record<string, unknown>[] {
  if (Array.isArray(source)) {
    return source.filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
    );
  }
  if (!source || typeof source !== "object") {
    return [];
  }

  const record = source as Record<string, unknown>;
  if (Array.isArray(record.contents)) {
    return readVectorEntries(record.contents);
  }
  if (record.fields && typeof record.fields === "object") {
    return readVectorEntries(record.fields);
  }
  return [];
}

export function parseProjectMembers(source: unknown) {
  return readVectorEntries(source)
    .map((entry) => {
      const fields =
        entry.fields && typeof entry.fields === "object"
          ? (entry.fields as Record<string, unknown>)
          : entry;
      const address = normalizeObjectId(typeof fields.addr === "string" ? fields.addr : readObjectId(fields.addr));
      const roleCode = readU64(fields.role);
      if (!address) {
        return null;
      }
      return {
        address,
        role: roleCodeToProjectMemberRole(roleCode),
        roleCode,
      } satisfies ProjectMemberSummary;
    })
    .filter((member): member is ProjectMemberSummary => Boolean(member));
}

export function parseProjectForms(source: unknown) {
  return readVectorEntries(source)
    .map((entry) => {
      const fields =
        entry.fields && typeof entry.fields === "object"
          ? (entry.fields as Record<string, unknown>)
          : entry;
      const formId = readU64(fields.form_id);
      const title = readString(fields.title);
      const metadata = parseProjectFormMetadataReference(readString(fields.metadata_digest));
      return {
        formId,
        title,
        metadataDigest: metadata.digest,
        manifestBlobId: metadata.manifestBlobId,
        formBlobId: metadata.formBlobId,
        sourceFormId: metadata.formId,
        active: readBool(fields.active),
        createdAt: readU64(fields.created_at)
          ? new Date(readU64(fields.created_at)).toISOString()
          : undefined,
      } satisfies OnchainProjectFormSummary;
    })
    .filter((form) => Boolean(form.title) || Number.isFinite(form.formId))
    .sort((left, right) => left.formId - right.formId);
}

function parseOnchainSignalStatus(source: unknown): OnchainProjectSignalSummary["status"] {
  const value = readU64(source);
  if (value === 1) {
    return "triaged";
  }
  if (value === 2) {
    return "archived";
  }
  return "new";
}

export function parseProjectSignals(source: unknown) {
  return readVectorEntries(source)
    .map((entry) => {
      const fields =
        entry.fields && typeof entry.fields === "object"
          ? (entry.fields as Record<string, unknown>)
          : entry;
      const signalId = readU64(fields.signal_id);
      const formId = readU64(fields.form_id);
      const walrusBlobId = readString(fields.walrus_blob_id);
      return {
        signalId,
        formId,
        walrusBlobId,
        metadataDigest: readString(fields.metadata_digest),
        encrypted: readBool(fields.encrypted),
        sealIdentity: readString(fields.seal_identity) || undefined,
        submitter: readObjectId(fields.submitter) || undefined,
        status: parseOnchainSignalStatus(fields.status),
        createdAt: readU64(fields.created_at)
          ? new Date(readU64(fields.created_at)).toISOString()
          : undefined,
      } satisfies OnchainProjectSignalSummary;
    })
    .filter((signal) => Boolean(signal.walrusBlobId) && Number.isFinite(signal.signalId))
    .sort((left, right) => {
      const leftTime = left.createdAt ?? "";
      const rightTime = right.createdAt ?? "";
      if (leftTime === rightTime) {
        return right.signalId - left.signalId;
      }
      return rightTime.localeCompare(leftTime);
    });
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function encodeUtf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeUtf8Base64(value: string) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function createMetadataDigest(value: unknown) {
  const payload = new TextEncoder().encode(stableSerialize(value));
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function serializeProjectFormMetadataReference(reference: ProjectFormMetadataReference) {
  const normalized = {
    digest: reference.digest,
    ...(reference.manifestBlobId ? { manifestBlobId: reference.manifestBlobId } : {}),
    ...(reference.formBlobId ? { formBlobId: reference.formBlobId } : {}),
    ...(reference.formId ? { formId: reference.formId } : {}),
  } satisfies ProjectFormMetadataReference;
  return `${PROJECT_FORM_METADATA_PREFIX}${encodeUtf8Base64(JSON.stringify(normalized))}`;
}

export function parseProjectFormMetadataReference(value?: string | null): ProjectFormMetadataReference {
  const raw = value?.trim() ?? "";
  if (!raw) {
    return { digest: "" };
  }
  if (!raw.startsWith(PROJECT_FORM_METADATA_PREFIX)) {
    return { digest: raw };
  }

  try {
    const decoded = decodeUtf8Base64(raw.slice(PROJECT_FORM_METADATA_PREFIX.length));
    const parsed = JSON.parse(decoded) as Partial<ProjectFormMetadataReference> | null;
    return {
      digest: typeof parsed?.digest === "string" ? parsed.digest : "",
      manifestBlobId: typeof parsed?.manifestBlobId === "string" ? parsed.manifestBlobId : undefined,
      formBlobId: typeof parsed?.formBlobId === "string" ? parsed.formBlobId : undefined,
      formId: typeof parsed?.formId === "string" ? parsed.formId : undefined,
    } satisfies ProjectFormMetadataReference;
  } catch {
    return { digest: raw };
  }
}

export function parseProjectOwnerCap(entry: { data?: { objectId?: string; content?: { fields?: Record<string, unknown> } | null } | null }) {
  const objectId = normalizeObjectId(entry.data?.objectId);
  const projectId = readObjectId(entry.data?.content?.fields?.project_id);
  if (!objectId || !projectId) {
    return null;
  }

  return {
    objectId,
    projectId,
  } satisfies ProjectOwnerCapSummary;
}

export function parseProjectSummary(
  objectId: string,
  fields?: Record<string, unknown> | null,
  ownedOwnerCapId?: string,
) {
  if (!fields) {
    return null;
  }

  const name = readString(fields.name);
  const owner = normalizeObjectId(typeof fields.owner === "string" ? fields.owner : readObjectId(fields.owner));
  if (!objectId || !name || !owner) {
    return null;
  }

  const createdAtMs = readU64(fields.created_at);
  const legacyAdmins = readAddressVector(fields.admins);
  const members = parseProjectMembers(fields.members);
  const memberCoAdmins = members
    .filter((member) => member.role === "co_admin")
    .map((member) => member.address);
  const coAdmins = [...new Set([owner, ...legacyAdmins, ...memberCoAdmins])];
  const reviewers = members
    .filter((member) => member.role === "reviewer")
    .map((member) => member.address);
  return {
    objectId: normalizeObjectId(objectId),
    name,
    owner,
    admins: coAdmins,
    reviewers,
    members,
    formsCount: readU64(fields.forms_count),
    signalsCount: readU64(fields.signals_count),
    onchainForms: parseProjectForms(fields.forms),
    onchainSignals: parseProjectSignals(fields.signals),
    createdAt: createdAtMs ? new Date(createdAtMs).toISOString() : undefined,
    ownedOwnerCapId: normalizeObjectId(ownedOwnerCapId),
  } satisfies ProjectSummary;
}

export function parseSuiObjectData(response: unknown) {
  const jsonRpcData =
    response && typeof response === "object" && "data" in (response as Record<string, unknown>)
      ? ((response as { data?: unknown }).data as Record<string, unknown> | null | undefined)
      : null;
  const coreObject =
    response && typeof response === "object" && "object" in (response as Record<string, unknown>)
      ? ((response as { object?: unknown }).object as Record<string, unknown> | null | undefined)
      : null;
  const data = jsonRpcData ?? coreObject;
  const content =
    jsonRpcData && typeof jsonRpcData.content === "object"
      ? (jsonRpcData.content as Record<string, unknown>)
      : null;
  const json =
    coreObject && typeof coreObject.json === "object" && coreObject.json && !Array.isArray(coreObject.json)
      ? (coreObject.json as Record<string, unknown>)
      : null;
  const fields =
    content && content.fields && typeof content.fields === "object" && !Array.isArray(content.fields)
      ? (content.fields as Record<string, unknown>)
      : json;
  const objectId = normalizeObjectId(typeof data?.objectId === "string" ? data.objectId : "");
  const type = typeof data?.type === "string" ? data.type : "";
  if (!objectId) {
    return null;
  }
  return {
    objectId,
    type,
    fields,
  } satisfies ParsedSuiObjectData;
}

export function isProjectObjectType(type?: string | null) {
  return normalizeType(type) === normalizeType(
    ACCESS_CONTROL_PACKAGE_ID
      ? `${ACCESS_CONTROL_PACKAGE_ID}::${PROJECT_REGISTRY_MODULE}::Project`
      : "",
  );
}

export function readCachedProjectSummary(projectId: string) {
  const normalized = normalizeObjectId(projectId);
  const cached = projectObjectCache.get(normalized);
  if (!cached || cached.expiresAt <= Date.now()) {
    projectObjectCache.delete(normalized);
    return null;
  }
  return cached.promise;
}

export async function fetchProjectSummaryWithCache(
  suiClient: ProjectObjectClient,
  projectId: string,
) {
  const normalized = normalizeObjectId(projectId);
  if (!normalized) {
    return null;
  }

  const cached = readCachedProjectSummary(normalized);
  if (cached) {
    return cached;
  }

  const promise = suiClient
    .core
    ?.getObject({
      objectId: normalized,
      include: {
        json: true,
      },
    })
    ?? suiClient.getObject?.({
      id: normalized,
      options: {
        showType: true,
        showContent: true,
      },
    });

  if (!promise) {
    return null;
  }

  const cachedPromise = promise
    .then((response) => {
      const parsed = parseSuiObjectData(response);
      if (!parsed || !isProjectObjectType(parsed.type)) {
        return null;
      }
      return parseProjectSummary(parsed.objectId, parsed.fields);
    })
    .catch((error) => {
      projectObjectCache.delete(normalized);
      throw error;
    });

  projectObjectCache.set(normalized, {
    expiresAt: Date.now() + PROJECT_OBJECT_CACHE_TTL_MS,
    promise: cachedPromise,
  });
  return cachedPromise;
}

export function isProjectOwnerCapType(type?: string | null) {
  return normalizeType(type) === normalizeType(
    ACCESS_CONTROL_PACKAGE_ID
      ? `${ACCESS_CONTROL_PACKAGE_ID}::${PROJECT_REGISTRY_MODULE}::ProjectOwnerCap`
      : "",
  );
}

export function parseProjectIdFromOwnerCapFields(fields?: Record<string, unknown> | null) {
  return readObjectId(fields?.project_id);
}

export function loadRecentProjects() {
  if (typeof window === "undefined") {
    return [] as ProjectSummary[];
  }
  try {
    const raw = window.localStorage.getItem(recentProjectsKey());
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as ProjectSummary[];
    return Array.isArray(parsed)
      ? parsed.map((project) => ({
          ...project,
          admins: [...new Set([project.owner, ...(project.admins ?? [])].filter(Boolean))],
          reviewers: project.reviewers ?? [],
          members: project.members ?? [],
        }))
      : [];
  } catch {
    return [];
  }
}

export function saveRecentProject(project: ProjectSummary) {
  if (typeof window === "undefined") {
    return;
  }
  const next = [
    project,
    ...loadRecentProjects().filter((entry) => entry.objectId !== project.objectId),
  ].slice(0, 12);
  window.localStorage.setItem(recentProjectsKey(), JSON.stringify(next));
  emitProjectRegistryStorageChange();
}

export function removeRecentProject(projectId: string) {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeObjectId(projectId);
  if (!normalized) {
    return;
  }
  const next = loadRecentProjects().filter((entry) => entry.objectId !== normalized);
  if (next.length > 0) {
    window.localStorage.setItem(recentProjectsKey(), JSON.stringify(next));
  } else {
    window.localStorage.removeItem(recentProjectsKey());
  }
  if (getSelectedProjectId() === normalized) {
    window.localStorage.removeItem(selectedProjectIdKey());
  }
  emitProjectRegistryStorageChange();
}

export function getSelectedProjectId() {
  if (typeof window === "undefined") {
    return "";
  }
  return normalizeObjectId(window.localStorage.getItem(selectedProjectIdKey()));
}

export function setSelectedProjectId(projectId: string) {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeObjectId(projectId);
  const current = getSelectedProjectId();
  if (!normalized) {
    if (!current) {
      return;
    }
    window.localStorage.removeItem(selectedProjectIdKey());
    emitProjectRegistryStorageChange();
    return;
  }
  if (current === normalized) {
    return;
  }
  window.localStorage.setItem(selectedProjectIdKey(), normalized);
  emitProjectRegistryStorageChange();
}

export function triageStatusToOnchainStatus(
  triageStatus: string,
  inboxStatus?: string,
): OnchainSignalStatus {
  if (inboxStatus === "archived") {
    return "archived";
  }
  return triageStatus === "new" ? "new" : "triaged";
}

export { PROJECT_REGISTRY_STORAGE_EVENT };
