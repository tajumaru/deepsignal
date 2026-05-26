import { describe, expect, it } from "vitest";
import type { CapabilityProfile } from "../hooks/useAccessControl";
import type { FormSchema } from "../types";
import {
  canAttemptPrivateSignalDecrypt,
  canManageProject,
  canManageProjectMembers,
  canReviewProject,
  getReviewAccessState,
} from "./adminAccess";

const form: FormSchema = {
  id: "form-1",
  title: "Private feedback",
  description: "",
  createdAt: new Date(0).toISOString(),
  ownerAddress: "0xowner",
  fields: [],
};

function profile(overrides: Partial<CapabilityProfile> = {}): CapabilityProfile {
  return {
    isConfigured: true,
    packageId: "0xpackage",
    registryId: "0xregistry",
    hasOwnerCap: false,
    hasAdminCap: false,
    hasReviewerCap: false,
    ownerCapIds: [],
    adminCapIds: [],
    reviewerCapIds: [],
    ...overrides,
  };
}

describe("review decrypt access", () => {
  it("allows configured owner/admin capability holders to attempt private decrypt", () => {
    expect(
      canAttemptPrivateSignalDecrypt(form, "0xreviewer", profile({
        hasReviewerCap: true,
        reviewerCapIds: ["0xreviewer-cap"],
      })),
    ).toBe(false);
    expect(
      canAttemptPrivateSignalDecrypt(form, "0xadmin", profile({
        hasAdminCap: true,
        adminCapIds: ["0xadmin-cap"],
      })),
    ).toBe(true);
    expect(
      canAttemptPrivateSignalDecrypt(form, "0xowner-cap-holder", profile({
        hasOwnerCap: true,
        ownerCapIds: ["0xowner-cap"],
      })),
    ).toBe(true);
  });

  it("allows the form owner to attempt owner-wallet decrypt even when access control is configured", () => {
    expect(canAttemptPrivateSignalDecrypt(form, "0xowner", profile())).toBe(true);
    expect(getReviewAccessState(form, "0xowner", profile())).toBe("allowed");
  });

  it("blocks connected outsiders without caps or ownership", () => {
    expect(canAttemptPrivateSignalDecrypt(form, "0xoutsider", profile())).toBe(false);
    expect(getReviewAccessState(form, "0xoutsider", profile())).toBe("denied");
  });

  it("blocks missing wallets", () => {
    expect(canAttemptPrivateSignalDecrypt(form, null, profile({ hasReviewerCap: true }))).toBe(false);
  });

  it("preserves legacy local access rules when capability registry is not configured", () => {
    const unconfiguredProfile = profile({
      isConfigured: false,
      packageId: "",
      registryId: "",
    });

    expect(canAttemptPrivateSignalDecrypt(form, "0xowner", unconfiguredProfile)).toBe(true);
    expect(canAttemptPrivateSignalDecrypt(form, "0xoutsider", unconfiguredProfile)).toBe(false);
    expect(
      canAttemptPrivateSignalDecrypt(
        { ...form, ownerAddress: undefined },
        "0xlegacy-admin",
        unconfiguredProfile,
      ),
    ).toBe(true);
  });
});

describe("project role permissions", () => {
  const project = {
    owner: "0xowner",
    admins: ["0xcoadmin"],
    reviewers: ["0xreviewer"],
  };

  it("mirrors the Move owner/co-admin/reviewer authorization model", () => {
    expect(canManageProject(project, "0xowner")).toBe(true);
    expect(canManageProject(project, "0xcoadmin")).toBe(true);
    expect(canManageProject(project, "0xreviewer")).toBe(false);
    expect(canReviewProject(project, "0xreviewer")).toBe(true);
    expect(canReviewProject(project, "0xoutsider")).toBe(false);
  });

  it("limits member management to the owner", () => {
    expect(canManageProjectMembers(project, "0xowner")).toBe(true);
    expect(canManageProjectMembers(project, "0xcoadmin")).toBe(false);
    expect(canManageProjectMembers(project, "0xreviewer")).toBe(false);
  });
});
