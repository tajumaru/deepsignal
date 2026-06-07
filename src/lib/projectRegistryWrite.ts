import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";
import {
  ACCESS_CONTROL_MODULE,
  ACCESS_CONTROL_PACKAGE_ID,
  ACCESS_CONTROL_REGISTRY_ID,
  PROJECT_REGISTRY_MODULE,
} from "./sui";
import { normalizeSuiAddress } from "./suiAddress";
import type {
  GlobalProjectCreatorRole,
  OnchainSignalStatus,
  ProjectMemberRole,
} from "./projectRegistry";

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

export interface AddProjectMemberArgs {
  projectId: string;
  ownerCapId: string;
  memberAddress: string;
  role: Exclude<ProjectMemberRole, "owner"> | number;
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

export interface DeleteFormOnChainArgs {
  projectId: string;
  formId: number | string | bigint;
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

export interface AccessRegistryAdminArgs {
  ownerCapId: string;
  adminAddress: string;
  registryId?: string;
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

function projectMemberRoleToCode(role: AddProjectMemberArgs["role"]) {
  if (typeof role === "number") {
    return role;
  }
  switch (role) {
    case "co_admin":
      return 1;
    case "reviewer":
      return 2;
    default:
      return 0;
  }
}

function onchainSignalStatusToCode(status: OnchainSignalStatus | number) {
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

export function buildAccessControlTarget(functionName: string, packageId?: string) {
  return `${resolvePackageId(packageId)}::${ACCESS_CONTROL_MODULE}::${functionName}`;
}

export function addAdminAccess(args: AccessRegistryAdminArgs) {
  const tx = createOrReuseTransaction(args.tx);
  tx.moveCall({
    target: buildAccessControlTarget("add_admin", args.packageId),
    arguments: [
      tx.object(requireValue(args.ownerCapId, "OWNER_CAP_ID")),
      tx.object(resolveRegistryId(args.registryId)),
      tx.pure.address(normalizeSuiAddress(requireValue(args.adminAddress, "Admin address"))),
    ],
  });

  return tx;
}

export function removeAdminAccess(args: AccessRegistryAdminArgs) {
  const tx = createOrReuseTransaction(args.tx);
  tx.moveCall({
    target: buildAccessControlTarget("remove_admin", args.packageId),
    arguments: [
      tx.object(requireValue(args.ownerCapId, "OWNER_CAP_ID")),
      tx.object(resolveRegistryId(args.registryId)),
      tx.pure.address(normalizeSuiAddress(requireValue(args.adminAddress, "Admin address"))),
    ],
  });

  return tx;
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
  tx.transferObjects(
    [ownerCap],
    tx.pure.address(normalizeSuiAddress(requireValue(args.recipientAddress, "Recipient address"))),
  );

  return tx;
}

export function addProjectAdmin(args: AddProjectAdminArgs) {
  return addProjectMember({
    projectId: args.projectId,
    ownerCapId: args.ownerCapId,
    memberAddress: args.adminAddress,
    role: "co_admin",
    packageId: args.packageId,
    tx: args.tx,
  });
}

export function addProjectMember(args: AddProjectMemberArgs) {
  const packageId = resolvePackageId(args.packageId);
  const tx = createOrReuseTransaction(args.tx);

  tx.moveCall({
    target: `${packageId}::${PROJECT_REGISTRY_MODULE}::add_project_member`,
    arguments: [
      tx.object(requireValue(args.projectId, "Project object id")),
      tx.object(requireValue(args.ownerCapId, "Project owner cap id")),
      tx.pure.address(normalizeSuiAddress(requireValue(args.memberAddress, "Member address"))),
      tx.pure.u8(projectMemberRoleToCode(args.role)),
    ],
  });

  return tx;
}

export function removeProjectAdmin(args: AddProjectAdminArgs) {
  return removeProjectMember({
    projectId: args.projectId,
    ownerCapId: args.ownerCapId,
    memberAddress: args.adminAddress,
    role: "co_admin",
    packageId: args.packageId,
    tx: args.tx,
  });
}

export function removeProjectMember(args: AddProjectMemberArgs) {
  const packageId = resolvePackageId(args.packageId);
  const tx = createOrReuseTransaction(args.tx);

  tx.moveCall({
    target: `${packageId}::${PROJECT_REGISTRY_MODULE}::remove_project_member`,
    arguments: [
      tx.object(requireValue(args.projectId, "Project object id")),
      tx.object(requireValue(args.ownerCapId, "Project owner cap id")),
      tx.pure.address(normalizeSuiAddress(requireValue(args.memberAddress, "Member address"))),
    ],
  });

  return tx;
}

export function updateProjectMemberRole(args: AddProjectMemberArgs) {
  const packageId = resolvePackageId(args.packageId);
  const tx = createOrReuseTransaction(args.tx);

  tx.moveCall({
    target: `${packageId}::${PROJECT_REGISTRY_MODULE}::update_project_member_role`,
    arguments: [
      tx.object(requireValue(args.projectId, "Project object id")),
      tx.object(requireValue(args.ownerCapId, "Project owner cap id")),
      tx.pure.address(normalizeSuiAddress(requireValue(args.memberAddress, "Member address"))),
      tx.pure.u8(projectMemberRoleToCode(args.role)),
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

export function deleteFormOnChain(args: DeleteFormOnChainArgs) {
  const packageId = resolvePackageId(args.packageId);
  const tx = createOrReuseTransaction(args.tx);

  tx.moveCall({
    target: `${packageId}::${PROJECT_REGISTRY_MODULE}::delete_form`,
    arguments: [
      tx.object(requireValue(args.projectId, "Project object id")),
      tx.pure.u64(args.formId),
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

export const projectRegistryBcs = {
  sealIdentity: bcs.option(bcs.string()),
};
