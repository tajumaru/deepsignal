import { describe, expect, it } from "vitest";
import {
  buildSealDecryptPolicySnapshot,
  buildSealEncryptPolicySnapshotFromEnvelope,
  compareSealPolicySnapshots,
} from "./decryptDiagnostics";
import {
  createRealSealEnvelope,
  createProjectScopedSealId,
  selectProjectSealApprovalPolicy,
} from "./sealPayload";

const projectId = "0x1111111111111111111111111111111111111111111111111111111111111111";
const unrelatedObjectId = "0x3333333333333333333333333333333333333333333333333333333333333333";

describe("selectProjectSealApprovalPolicy", () => {
  it("preserves envelope admin policy for owner/admin wallets", () => {
    const objectId = createProjectScopedSealId(projectId);

    expect(
      selectProjectSealApprovalPolicy({
        envelopeApprovalPolicy: "project_admin_v0",
        objectId,
        projectId,
      }),
    ).toBe("project_admin_v0");
  });

  it("coerces legacy reviewer envelope policies to owner/admin approval", () => {
    const objectId = createProjectScopedSealId(projectId);

    expect(
      selectProjectSealApprovalPolicy({
        envelopeApprovalPolicy: "project_signal_reviewer_v1",
        objectId,
        projectId,
      }),
    ).toBe("project_signal_v1");

    expect(
      selectProjectSealApprovalPolicy({
        envelopeApprovalPolicy: "project_reviewer_v0",
        objectId: unrelatedObjectId,
        projectId,
      }),
    ).toBe("project_admin_v0");
  });

  it("uses project signal approval when no envelope policy is stored", () => {
    const objectId = createProjectScopedSealId(projectId);

    expect(
      selectProjectSealApprovalPolicy({
        objectId,
        projectId,
      }),
    ).toBe("project_signal_v1");
  });
});

describe("Seal policy diagnostics", () => {
  it("preserves the full Seal object id in encrypt and decrypt canonical JSON", () => {
    const objectId = `${projectId}${"7db6910320145460d8916c4b08e0cdce"}`;
    const envelope = createRealSealEnvelope({
      network: "mainnet",
      packageId: "0x53c9d83b3eb4cace2b7c2a0a71588fc05c0c17adad87ae1c424742d4ce384be1",
      objectId,
      threshold: 1,
      serverObjectIds: ["0xserver"],
      encryptedObject: "ciphertext",
      policyId: "project_admin_v0",
      policyObjectId: projectId,
      approvalPolicy: "project_admin_v0",
      projectId,
    });

    const encryptPolicy = buildSealEncryptPolicySnapshotFromEnvelope(envelope);
    const decryptPolicy = buildSealDecryptPolicySnapshot({
      envelope,
      context: {
        projectId,
        walletAddress: "0x93e4c7edcfc2986c3429c477ba42d8db836763cdab33768f9608ccb7a07b156d",
      },
    });

    expect(JSON.parse(encryptPolicy.normalizedPolicyJson).objectId).toBe(objectId);
    expect(JSON.parse(decryptPolicy.normalizedPolicyJson).objectId).toBe(objectId);
    expect(compareSealPolicySnapshots(encryptPolicy, decryptPolicy)).toMatchObject({
      matches: true,
      differingKeys: [],
    });
  });

  it("reports object id diffs without truncating comparison values", () => {
    const fullObjectId = `${projectId}${"7db6910320145460d8916c4b08e0cdce"}`;
    const envelope = createRealSealEnvelope({
      network: "mainnet",
      packageId: "0x53c9d83b3eb4cace2b7c2a0a71588fc05c0c17adad87ae1c424742d4ce384be1",
      objectId: fullObjectId,
      threshold: 1,
      serverObjectIds: ["0xserver"],
      encryptedObject: "ciphertext",
      policyId: "project_admin_v0",
      policyObjectId: projectId,
      approvalPolicy: "project_admin_v0",
      projectId,
    });
    const encryptPolicy = buildSealEncryptPolicySnapshotFromEnvelope({
      ...envelope,
      objectId: projectId,
    });
    const decryptPolicy = buildSealDecryptPolicySnapshot({ envelope, context: { projectId } });

    expect(compareSealPolicySnapshots(encryptPolicy, decryptPolicy)?.diffs).toContainEqual({
      key: "objectId",
      encryptValue: projectId,
      decryptValue: fullObjectId,
    });
  });
});
