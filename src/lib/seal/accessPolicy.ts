import { selectProjectSealApprovalPolicy, type ProjectSealApprovalPolicy } from "../../crypto/sealPayload";
import type { SealDecryptContext, SealEncryptContext } from "../../types";

export interface SealAccessProfile {
  hasOwnerCap?: boolean;
  hasAdminCap?: boolean;
  reviewerCapIds?: string[];
}

export function createAccessPolicy(
  context: SealEncryptContext & { objectId: string; envelopeApprovalPolicy?: ProjectSealApprovalPolicy | string },
): ProjectSealApprovalPolicy {
  return selectProjectSealApprovalPolicy({
    objectId: context.objectId,
    projectId: context.projectId ?? context.ownerAddress ?? "",
    envelopeApprovalPolicy: context.envelopeApprovalPolicy,
  });
}

export function resolveAccessPolicy(
  context: SealDecryptContext & { objectId: string; envelopeApprovalPolicy?: ProjectSealApprovalPolicy | string },
): ProjectSealApprovalPolicy {
  return selectProjectSealApprovalPolicy({
    objectId: context.objectId,
    projectId: context.projectId ?? context.ownerAddress ?? "",
    envelopeApprovalPolicy: context.envelopeApprovalPolicy,
  });
}

export function getReviewerCapIdForDecrypt(profile: SealAccessProfile) {
  void profile;
  return undefined;
}

export function canUseAdminSealAccess(profile: SealAccessProfile) {
  return Boolean(profile.hasOwnerCap || profile.hasAdminCap);
}
