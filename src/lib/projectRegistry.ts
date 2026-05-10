import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import {
  ACCESS_CONTROL_MODULE,
  ACCESS_CONTROL_PACKAGE_ID,
  ACCESS_CONTROL_REGISTRY_ID,
  PROJECT_REGISTRY_MODULE,
} from "./sui";

export type GlobalProjectCreatorRole = "owner" | "admin";
export type OnchainSignalStatus = "new" | "triaged" | "archived";

const RECENT_PROJECTS_KEY = "deepsignal.projectRegistry.recentProjects";
const SELECTED_PROJECT_ID_KEY = "deepsignal.projectRegistry.selectedProjectId";
const PROJECT_REGISTRY_STORAGE_EVENT = "deepsignal:project-registry-storage";

export interface ProjectSummary {
  objectId: string;
  name: string;
  owner: string;
  admins: string[];
  formsCount: number;
  signalsCount: number;
  createdAt?: string;
  ownedOwnerCapId?: string;
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

export interface CreateProjectArgs {
  name: string;
  capId: string;
  role: GlobalProjectCreatorRole;
  recipientAddress: string;
  registryId?: string;
  packageId?: string;
  tx?: Transaction;
}

export interface AddProjectAdminArgs {
  projectId: string;
  ownerCapId: string;
  adminAddress: string;
  packageId?: string;
  tx?: Transaction;
}

export interface DeleteProjectArgs {
  projectId: string;
  ownerCapId: string;
  packageId?: string;
  tx?: Transaction;
}

export interface CreateFormOnChainArgs {
  projectId: string;
  title: string;
  metadataDigest: string;
  packageId?: string;
  tx?: Transaction;
}

export interface SetFormActiveArgs {
  projectId: string;
  formId: number | string | bigint;
  active: boolean;
  packageId?: string;
  tx?: Transaction;
}

export interface RegisterSignalReceiptArgs {
  projectId: string;
  formId: number | string | bigint;
  walrusBlobId: string;
  metadataDigest: string;
  encrypted: boolean;
  sealIdentity?: string | null;
  packageId?: string;
  tx?: Transaction;
}

export interface UpdateSignalStatusOnChainArgs {
  projectId: string;
  signalId: number | string | bigint;
  status: OnchainSignalStatus | number;
  packageId?: string;
  tx?: Transaction;
}

function requireValue(value: string | undefined, label: string) {
  if (!value?.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function resolvePackageId(packageId?: string) {
  return requireValue(packageId ?? ACCESS_CONTROL_PACKAGE_ID, "PACKAGE_ID");
}

function resolveRegistryId(registryId?: string) {
  return requireValue(registryId ?? ACCESS_CONTROL_REGISTRY_ID, "REGISTRY_ID");
}

function createOrReuseTransaction(tx?: Transaction) {
  return tx ?? new Transaction();
}

function emitProjectRegistryStorageChange() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(PROJECT_REGISTRY_STORAGE_EVENT));
}

export function subscribeProjectRegistryStorageChange(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key !== null &&
      event.key !== RECENT_PROJECTS_KEY &&
      event.key !== SELECTED_PROJECT_ID_KEY
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

export async function createMetadataDigest(value: unknown) {
  const payload = new TextEncoder().encode(stableSerialize(value));
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
  return {
    objectId: normalizeObjectId(objectId),
    name,
    owner,
    admins: readAddressVector(fields.admins),
    formsCount: readU64(fields.forms_count),
    signalsCount: readU64(fields.signals_count),
    createdAt: createdAtMs ? new Date(createdAtMs).toISOString() : undefined,
    ownedOwnerCapId: normalizeObjectId(ownedOwnerCapId),
  } satisfies ProjectSummary;
}

export function parseSuiObjectData(response: unknown) {
  const data =
    response && typeof response === "object" && "data" in (response as Record<string, unknown>)
      ? ((response as { data?: unknown }).data as Record<string, unknown> | null | undefined)
      : null;
  const content =
    data && typeof data.content === "object"
      ? (data.content as Record<string, unknown>)
      : null;
  const fields =
    content && content.fields && typeof content.fields === "object" && !Array.isArray(content.fields)
      ? (content.fields as Record<string, unknown>)
      : null;
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
  return String(type ?? "").endsWith("::Project");
}

export function isProjectOwnerCapType(type?: string | null) {
  return String(type ?? "").endsWith("::ProjectOwnerCap");
}

export function parseProjectIdFromOwnerCapFields(fields?: Record<string, unknown> | null) {
  return readObjectId(fields?.project_id);
}

export function loadRecentProjects() {
  if (typeof window === "undefined") {
    return [] as ProjectSummary[];
  }
  try {
    const raw = window.localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as ProjectSummary[];
    return Array.isArray(parsed) ? parsed : [];
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
  window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
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
    window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
  } else {
    window.localStorage.removeItem(RECENT_PROJECTS_KEY);
  }
  if (getSelectedProjectId() === normalized) {
    window.localStorage.removeItem(SELECTED_PROJECT_ID_KEY);
  }
  emitProjectRegistryStorageChange();
}

export function getSelectedProjectId() {
  if (typeof window === "undefined") {
    return "";
  }
  return normalizeObjectId(window.localStorage.getItem(SELECTED_PROJECT_ID_KEY));
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
    window.localStorage.removeItem(SELECTED_PROJECT_ID_KEY);
    emitProjectRegistryStorageChange();
    return;
  }
  if (current === normalized) {
    return;
  }
  window.localStorage.setItem(SELECTED_PROJECT_ID_KEY, normalized);
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

export function onchainSignalStatusToCode(status: OnchainSignalStatus | number) {
  if (typeof status === "number") {
    return status;
  }

  switch (status) {
    case "new":
      return 0;
    case "triaged":
      return 1;
    case "archived":
      return 2;
    default:
      return 0;
  }
}

export function createProject(args: CreateProjectArgs) {
  const packageId = resolvePackageId(args.packageId);
  const registryId = resolveRegistryId(args.registryId);
  const tx = createOrReuseTransaction(args.tx);
  const target =
    args.role === "owner"
      ? `${packageId}::${PROJECT_REGISTRY_MODULE}::create_project_by_owner`
      : `${packageId}::${PROJECT_REGISTRY_MODULE}::create_project`;

  const ownerCap = tx.moveCall({
    target,
    arguments: [
      tx.object(requireValue(args.capId, args.role === "owner" ? "OWNER_CAP_ID" : "ADMIN_CAP_ID")),
      tx.object(registryId),
      tx.pure.string(requireValue(args.name, "Project name")),
    ],
  });
  tx.transferObjects([ownerCap], tx.pure.address(normalizeSuiAddress(requireValue(args.recipientAddress, "Recipient address"))));

  return tx;
}

export function addProjectAdmin(args: AddProjectAdminArgs) {
  const packageId = resolvePackageId(args.packageId);
  const tx = createOrReuseTransaction(args.tx);

  tx.moveCall({
    target: `${packageId}::${PROJECT_REGISTRY_MODULE}::add_admin`,
    arguments: [
      tx.object(requireValue(args.projectId, "Project object id")),
      tx.object(requireValue(args.ownerCapId, "Project owner cap id")),
      tx.pure.address(normalizeSuiAddress(requireValue(args.adminAddress, "Admin address"))),
    ],
  });

  return tx;
}

export function removeProjectAdmin(args: AddProjectAdminArgs) {
  const packageId = resolvePackageId(args.packageId);
  const tx = createOrReuseTransaction(args.tx);

  tx.moveCall({
    target: `${packageId}::${PROJECT_REGISTRY_MODULE}::remove_admin`,
    arguments: [
      tx.object(requireValue(args.projectId, "Project object id")),
      tx.object(requireValue(args.ownerCapId, "Project owner cap id")),
      tx.pure.address(normalizeSuiAddress(requireValue(args.adminAddress, "Admin address"))),
    ],
  });

  return tx;
}

export function deleteProject(args: DeleteProjectArgs) {
  const packageId = resolvePackageId(args.packageId);
  const tx = createOrReuseTransaction(args.tx);

  tx.moveCall({
    target: `${packageId}::${PROJECT_REGISTRY_MODULE}::delete_project`,
    arguments: [
      tx.object(requireValue(args.projectId, "Project object id")),
      tx.object(requireValue(args.ownerCapId, "Project owner cap id")),
    ],
  });

  return tx;
}

export function createFormOnChain(args: CreateFormOnChainArgs) {
  const packageId = resolvePackageId(args.packageId);
  const tx = createOrReuseTransaction(args.tx);

  tx.moveCall({
    target: `${packageId}::${PROJECT_REGISTRY_MODULE}::create_form`,
    arguments: [
      tx.object(requireValue(args.projectId, "Project object id")),
      tx.pure.string(requireValue(args.title, "Form title")),
      tx.pure.string(requireValue(args.metadataDigest, "Metadata digest")),
    ],
  });

  return tx;
}

export function setFormActiveOnChain(args: SetFormActiveArgs) {
  const packageId = resolvePackageId(args.packageId);
  const tx = createOrReuseTransaction(args.tx);

  tx.moveCall({
    target: `${packageId}::${PROJECT_REGISTRY_MODULE}::set_form_active`,
    arguments: [
      tx.object(requireValue(args.projectId, "Project object id")),
      tx.pure.u64(args.formId),
      tx.pure.bool(args.active),
    ],
  });

  return tx;
}

export function registerSignalReceipt(args: RegisterSignalReceiptArgs) {
  const packageId = resolvePackageId(args.packageId);
  const tx = createOrReuseTransaction(args.tx);

  tx.moveCall({
    target: `${packageId}::${PROJECT_REGISTRY_MODULE}::register_signal`,
    arguments: [
      tx.object(requireValue(args.projectId, "Project object id")),
      tx.pure.u64(args.formId),
      tx.pure.string(requireValue(args.walrusBlobId, "Walrus blob id")),
      tx.pure.string(requireValue(args.metadataDigest, "Metadata digest")),
      tx.pure.bool(args.encrypted),
      tx.pure.option("string", args.sealIdentity ?? null),
    ],
  });

  return tx;
}

export function updateSignalStatusOnChain(args: UpdateSignalStatusOnChainArgs) {
  const packageId = resolvePackageId(args.packageId);
  const tx = createOrReuseTransaction(args.tx);

  tx.moveCall({
    target: `${packageId}::${PROJECT_REGISTRY_MODULE}::update_signal_status`,
    arguments: [
      tx.object(requireValue(args.projectId, "Project object id")),
      tx.pure.u64(args.signalId),
      tx.pure.u8(onchainSignalStatusToCode(args.status)),
    ],
  });

  return tx;
}

export function buildAccessControlTarget(functionName: string, packageId?: string) {
  return `${resolvePackageId(packageId)}::${ACCESS_CONTROL_MODULE}::${functionName}`;
}

export const projectRegistryBcs = {
  sealIdentity: bcs.option(bcs.string()),
};

export { PROJECT_REGISTRY_STORAGE_EVENT };
