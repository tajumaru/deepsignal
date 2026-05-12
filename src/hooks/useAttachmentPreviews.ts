import { useEffect, useState } from "react";
import { activeSealAdapter, decryptAttachmentBlob, storageAdapter } from "../lib/storage";
import type { SealDecryptContext, SubmissionAttachment } from "../types";

export interface AttachmentPreviewState {
  blobId: string;
  encrypted: boolean;
  kind: "image" | "video" | "download";
  url?: string;
  mimeType?: string;
  name?: string;
  error?: string;
}

function getPreviewKind(mimeType: string | undefined, fallbackType: SubmissionAttachment["type"]) {
  if (mimeType?.startsWith("image/")) {
    return "image" as const;
  }
  if (mimeType?.startsWith("video/")) {
    return "video" as const;
  }
  return "download" as const;
}

export function getAttachmentDownloadHref(
  attachment: SubmissionAttachment,
  preview?: AttachmentPreviewState,
) {
  if (preview?.url) {
    return preview.url;
  }
  if (attachment.storage === "inline" && attachment.inlineData) {
    return `data:${attachment.originalType || "application/octet-stream"};base64,${attachment.inlineData}`;
  }
  return undefined;
}

export function useAttachmentPreviews(
  attachments: SubmissionAttachment[],
  options: {
    enabled: boolean;
    decryptContext: SealDecryptContext;
  },
) {
  const [previews, setPreviews] = useState<Record<string, AttachmentPreviewState>>({});

  useEffect(() => {
    if (!options.enabled || attachments.length === 0) {
      setPreviews({});
      return;
    }

    let cancelled = false;
    const objectUrls: string[] = [];

    async function loadPreviews() {
      const nextEntries = await Promise.all(
        attachments.map(async (attachment) => {
          if (!attachment.encrypted) {
            return [
              attachment.blobId,
              {
                blobId: attachment.blobId,
                encrypted: false,
                kind: getPreviewKind(attachment.originalType, attachment.type),
                name: attachment.originalName ?? attachment.name,
              } satisfies AttachmentPreviewState,
            ] as const;
          }

          try {
            const resolved = await decryptAttachmentBlob(
              attachment,
              activeSealAdapter,
              options.decryptContext,
              storageAdapter,
            );
            if (!resolved) {
              throw new Error("missing");
            }
            const url = URL.createObjectURL(resolved.blob);
            objectUrls.push(url);
            return [
              attachment.blobId,
              {
                blobId: attachment.blobId,
                encrypted: true,
                kind: getPreviewKind(resolved.mimeType, attachment.type),
                url,
                mimeType: resolved.mimeType,
                name: resolved.name,
              } satisfies AttachmentPreviewState,
            ] as const;
          } catch {
            return [
              attachment.blobId,
              {
                blobId: attachment.blobId,
                encrypted: true,
                kind: getPreviewKind(attachment.originalType, attachment.type),
                name: attachment.originalName ?? attachment.name,
                error: "添付を復号できません",
              } satisfies AttachmentPreviewState,
            ] as const;
          }
        }),
      );

      if (cancelled) {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setPreviews(Object.fromEntries(nextEntries));
    }

    void loadPreviews();

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [
    attachments,
    options.enabled,
    options.decryptContext.projectId,
    options.decryptContext.signPersonalMessage,
    options.decryptContext.suiClient,
    options.decryptContext.walletAddress,
  ]);

  return previews;
}
