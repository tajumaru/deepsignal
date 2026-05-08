import type { FormSchema } from "../types";
import type { CapabilityProfile } from "../hooks/useAccessControl";

export type FormAccessState = "allowed" | "legacy" | "denied";
export type RequiredAccessRole = "admin" | "reviewer";

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

export function canAdmin(profile?: CapabilityProfile | null) {
  return Boolean(profile?.hasOwnerCap || profile?.hasAdminCap);
}

export function canReview(profile?: CapabilityProfile | null) {
  return Boolean(profile?.hasOwnerCap || profile?.hasAdminCap || profile?.hasReviewerCap);
}

export function canIssueAdmin(profile?: CapabilityProfile | null) {
  return Boolean(profile?.hasOwnerCap);
}

export function canIssueReviewer(profile?: CapabilityProfile | null) {
  return Boolean(profile?.hasAdminCap);
}

export function getRoleLabel(profile?: CapabilityProfile | null) {
  if (profile?.hasOwnerCap) {
    return "Owner";
  }
  if (profile?.hasAdminCap) {
    return "Admin";
  }
  if (profile?.hasReviewerCap) {
    return "Reviewer";
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
    return canReview(profile) ? "allowed" : "denied";
  }

  return getFormAccessState(form, currentAddress);
}

export function canReviewForm(
  form: FormSchema,
  currentAddress?: string | null,
  profile?: CapabilityProfile | null,
) {
  if (profile?.isConfigured) {
    return canReview(profile);
  }

  return canAccessForm(form, currentAddress);
}
