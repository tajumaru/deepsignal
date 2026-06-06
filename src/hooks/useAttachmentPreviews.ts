import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
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

let storagePreviewModulePromise: Promise<typeof import("../lib/storageSeal")> | null = null;

function loadStoragePreviewModule() {
  storagePreviewModulePromise ??= import("../lib/storageSeal");
  return storagePreviewModulePromise;
}

function getPreviewKind(mimeType: string | undefined) {
  if (mimeType?.startsWith("image/")) {
    return "image" as const;
  }
  if (mimeType?.startsWith("video/")) {
    return "video" as const;
  }
  return "download" as const;
}

function arePreviewStatesEqual(left: AttachmentPreviewState, right: AttachmentPreviewState) {
  return (
    left.blobId === right.blobId &&
    left.encrypted === right.encrypted &&
    left.kind === right.kind &&
    left.url === right.url &&
    left.mimeType === right.mimeType &&
    left.name === right.name &&
    left.error === right.error
  );
}

function arePreviewMapsEqual(
  left: Record<string, AttachmentPreviewState>,
  right: Record<string, AttachmentPreviewState>,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => right[key] && arePreviewStatesEqual(left[key], right[key]))
  );
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
  const { enabled, decryptContext } = options;
  const { t } = useI18n();
  const attachmentPreviewKey = useMemo(
    () =>
      attachments
        .map((attachment) =>
          [
            attachment.blobId,
            attachment.encrypted ? "encrypted" : "plain",
            attachment.storage ?? "",
            attachment.originalName ?? attachment.name,
            attachment.originalType ?? "",
            attachment.inlineData ?? "",
          ].join(":"),
        )
        .join("|"),
    [attachments],
  );
  const decryptContextKey = [
    decryptContext.walletAddress ?? "",
    decryptContext.projectId ?? "",
    decryptContext.reviewerCapId ?? "",
  ].join("|");

  useEffect(() => {
    if (!enabled || attachments.length === 0) {
      setPreviews((current) => (Object.keys(current).length === 0 ? current : {}));
      return;
    }

    let cancelled = false;
    const objectUrls: string[] = [];

    async function loadPreviews() {
      const hasEncryptedAttachments = attachments.some((attachment) => attachment.encrypted);
      const storageModule = hasEncryptedAttachments ? await loadStoragePreviewModule() : null;
      const nextEntries = await Promise.all(
        attachments.map(async (attachment) => {
          if (!attachment.encrypted) {
            return [
              attachment.blobId,
              {
                blobId: attachment.blobId,
                encrypted: false,
                kind: getPreviewKind(attachment.originalType),
                name: attachment.originalName ?? attachment.name,
              } satisfies AttachmentPreviewState,
            ] as const;
          }

          try {
            const resolved = await storageModule?.decryptAttachmentBlob(
              attachment,
              storageModule.activeSealAdapter,
              decryptContext,
              storageModule.storageAdapter,
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
                kind: getPreviewKind(resolved.mimeType),
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
                kind: getPreviewKind(attachment.originalType),
                name: attachment.originalName ?? attachment.name,
                error: t("attachmentDecryptFailed"),
              } satisfies AttachmentPreviewState,
            ] as const;
          }
        }),
      );

      if (cancelled) {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      const nextPreviews = Object.fromEntries(nextEntries);
      setPreviews((current) => {
        if (arePreviewMapsEqual(current, nextPreviews)) {
          objectUrls.forEach((url) => URL.revokeObjectURL(url));
          return current;
        }
        return nextPreviews;
      });
    }

    void loadPreviews();

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
    // Attachment and decrypt inputs are represented by stable keys so previews reload only on semantic changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentPreviewKey, decryptContextKey, enabled, t]);

  return previews;
}
