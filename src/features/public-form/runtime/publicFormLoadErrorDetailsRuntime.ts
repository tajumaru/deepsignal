import { verifyWalrusBlob } from "../../../lib/walrusProof";
import type { WalrusVerificationStatus } from "../../../lib/walrusProof";

export type PublicFormLoadErrorBlobStatuses = {
  manifestStatus?: WalrusVerificationStatus;
  formBlobStatus?: WalrusVerificationStatus;
};

export async function loadPublicFormBlobStatuses(args: {
  manifestBlobId?: string;
  formBlobId?: string;
}): Promise<PublicFormLoadErrorBlobStatuses> {
  const result: PublicFormLoadErrorBlobStatuses = {};

  if (args.manifestBlobId) {
    try {
      result.manifestStatus = await verifyWalrusBlob(args.manifestBlobId);
    } catch {
      // Best effort only for the public failure screen.
    }
  }

  if (args.formBlobId) {
    try {
      result.formBlobStatus = await verifyWalrusBlob(args.formBlobId);
    } catch {
      // Best effort only for the public failure screen.
    }
  }

  return result;
}
