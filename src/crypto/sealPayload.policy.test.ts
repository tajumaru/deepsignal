import { describe, expect, it } from "vitest";
import {
  createProjectScopedSealId,
  selectProjectSealApprovalPolicy,
} from "./sealPayload";

const projectId = "0x1111111111111111111111111111111111111111111111111111111111111111";
const reviewerCapId = "0x2222222222222222222222222222222222222222222222222222222222222222";
const unrelatedObjectId = "0x3333333333333333333333333333333333333333333333333333333333333333";

describe("selectProjectSealApprovalPolicy", () => {
  it("uses reviewer signal approval for project-scoped ids even when the envelope stores admin policy", () => {
    const objectId = createProjectScopedSealId(projectId);

    expect(
      selectProjectSealApprovalPolicy({
        envelopeApprovalPolicy: "project_admin_v0",
        objectId,
        projectId,
        reviewerCapId,
      }),
    ).toBe("project_signal_reviewer_v1");
  });

  it("uses reviewer project approval for non-project-scoped ids when a reviewer cap is present", () => {
    expect(
      selectProjectSealApprovalPolicy({
        envelopeApprovalPolicy: "project_admin_v0",
        objectId: unrelatedObjectId,
        projectId,
        reviewerCapId,
      }),
    ).toBe("project_reviewer_v0");
  });

  it("preserves envelope admin policy for owner/admin wallets without reviewer caps", () => {
    const objectId = createProjectScopedSealId(projectId);

    expect(
      selectProjectSealApprovalPolicy({
        envelopeApprovalPolicy: "project_admin_v0",
        objectId,
        projectId,
      }),
    ).toBe("project_admin_v0");
  });
});
