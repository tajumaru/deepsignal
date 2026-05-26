import type { FormSchema } from "../types";
import type { CapabilityProfile } from "../hooks/useAccessControl";
import type { ProjectSummary } from "./projectRegistry";

export type FormAccessState = "allowed" | "legacy" | "denied";
export type RequiredAccessRole = "admin" | "reviewer";

export type ProjectPermissionRole = "owner" | "co_admin" | "reviewer";

export function addressesMatch(left?: string | null, right?: string | null) {
  if (!left || !right) {
    return false;
  }
  return left.toLowerCase() === right.toLowerCase();
}

export function getFormAccessState(form: FormSchema | null, currentAddress?: string | null): FormAccessState {
  if (!form) {
    return "denied";
  }
  if (!form.ownerAddress) {
    return "legacy";
  }
  return addressesMatch(form.ownerAddress, currentAddress) ? "allowed" : "denied";
}

export function canAccessForm(form: FormSchema | null, currentAddress?: string | null) {
  return getFormAccessState(form, currentAddress) !== "denied";
}

export function isProjectOwner(project: Pick<ProjectSummary, "owner"> | null | undefined, address?: string | null) {
  return addressesMatch(project?.owner, address);
}

export function isProjectCoAdmin(
  project: Pick<ProjectSummary, "owner" | "admins"> | null | undefined,
  address?: string | null,
) {
  return Boolean(
    isProjectOwner(project, address) ||
      project?.admins.some((admin) => addressesMatch(admin, address)),
  );
}

export function isProjectReviewer(
  project: Pick<ProjectSummary, "reviewers"> | null | undefined,
  address?: string | null,
) {
  return Boolean(project?.reviewers.some((reviewer) => addressesMatch(reviewer, address)));
}

export function canViewProject(
  project: Pick<ProjectSummary, "owner" | "admins" | "reviewers"> | null | undefined,
  address?: string | null,
) {
  return isProjectOwner(project, address) || isProjectCoAdmin(project, address) || isProjectReviewer(project, address);
}

export function canReviewProject(
  project: Pick<ProjectSummary, "owner" | "admins" | "reviewers"> | null | undefined,
  address?: string | null,
) {
  return canViewProject(project, address);
}

export function canManageProject(
  project: Pick<ProjectSummary, "owner" | "admins"> | null | undefined,
  address?: string | null,
) {
  return isProjectOwner(project, address) || isProjectCoAdmin(project, address);
}

export function canManageProjectMembers(project: Pick<ProjectSummary, "owner"> | null | undefined, address?: string | null) {
  return isProjectOwner(project, address);
}

export function canAdmin(profile?: CapabilityProfile | null) {
  return Boolean(profile?.hasOwnerCap || profile?.hasAdminCap);
}

export function canReview(profile?: CapabilityProfile | null) {
  return Boolean(profile?.hasOwnerCap || profile?.hasAdminCap);
}

export function canAttemptPrivateSignalDecrypt(
  form: FormSchema | null,
  currentAddress?: string | null,
  profile?: CapabilityProfile | null,
) {
  if (!form || !currentAddress) {
    return false;
  }
  if (profile?.isConfigured) {
    const formAccessState = getFormAccessState(form, currentAddress);
    return canReview(profile) || formAccessState === "allowed" || formAccessState === "legacy";
  }
  return canAccessForm(form, currentAddress);
}

export function canIssueAdmin(profile?: CapabilityProfile | null) {
  return Boolean(profile?.hasOwnerCap);
}

export function getRoleLabel(profile?: CapabilityProfile | null) {
  if (profile?.hasOwnerCap) {
    return "Owner";
  }
  if (profile?.hasAdminCap) {
    return "Admin";
  }
  return profile?.isConfigured ? "No access" : "Legacy owner";
}

export function canAccessAdminSurface(
  requiredRole: RequiredAccessRole,
  profile?: CapabilityProfile | null,
) {
  if (profile?.isConfigured) {
    return requiredRole === "admin" ? canAdmin(profile) : canReview(profile);
  }
  return true;
}

export function getAdminSurfaceAccessState(
  requiredRole: RequiredAccessRole,
  currentAddress?: string | null,
  profile?: CapabilityProfile | null,
): FormAccessState {
  if (profile?.isConfigured) {
    return canAccessAdminSurface(requiredRole, profile) ? "allowed" : "denied";
  }

  if (!currentAddress) {
    return "denied";
  }

  return "allowed";
}

export function getReviewAccessState(
  form: FormSchema | null,
  currentAddress?: string | null,
  profile?: CapabilityProfile | null,
): FormAccessState {
  if (profile?.isConfigured) {
    const formAccessState = getFormAccessState(form, currentAddress);
    return canReview(profile) || formAccessState === "allowed" || formAccessState === "legacy"
      ? "allowed"
      : "denied";
  }

  return getFormAccessState(form, currentAddress);
}

export function canReviewForm(
  form: FormSchema,
  currentAddress?: string | null,
  profile?: CapabilityProfile | null,
) {
  if (profile?.isConfigured) {
    const formAccessState = getFormAccessState(form, currentAddress);
    return canReview(profile) || formAccessState === "allowed" || formAccessState === "legacy";
  }

  return canAccessForm(form, currentAddress);
}
