import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { SignalMetaChip } from "./SignalMetaChip";
import type { UploadedAttachment } from "../types";

const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024;
const DEFAULT_ACCEPT =
  "image/*,video/mp4,video/webm,application/pdf,text/*,.zip,application/zip,application/x-zip-compressed";

export interface UploadDropzoneItem extends UploadedAttachment {
  file?: File;
}

interface UploadDropzoneProps {
  attachments: UploadDropzoneItem[];
  onChange: (attachments: UploadDropzoneItem[]) => void;
  accept?: string;
  disabled?: boolean;
  hint?: string;
  maxSizeBytes?: number;
  maxSizeErrorMessage?: (maxSizeBytes: number) => string;
  multiple?: boolean;
  capture?: "user" | "environment";
  onFilesSelected?: (files: File[]) => void;
  onUploadProgress?: (attachmentId: string, progress: number) => void;
  onUploadComplete?: (attachmentId: string) => void;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function getFileCategory(mimeType: string, fileName: string) {
  const lowerName = fileName.toLowerCase();
  if (mimeType.startsWith("image/")) {
    return "image" as const;
  }
  if (mimeType === "video/mp4" || mimeType === "video/webm") {
    return "video" as const;
  }
  if (mimeType === "application/pdf") {
    return "pdf" as const;
  }
  if (
    mimeType === "application/zip" ||
    mimeType === "application/x-zip-compressed" ||
    lowerName.endsWith(".zip")
  ) {
    return "zip" as const;
  }
  if (mimeType.startsWith("text/")) {
    return "text" as const;
  }
  return "other" as const;
}

function isSupportedFile(file: File) {
  const category = getFileCategory(file.type, file.name);
  return category !== "other";
}

function createAttachmentRecord(
  file: File,
  maxSizeBytes: number,
  maxSizeErrorMessage?: (maxSizeBytes: number) => string,
): UploadDropzoneItem {
  const mimeType = file.type || "application/octet-stream";
  const category = getFileCategory(mimeType, file.name);
  const canPreview = category === "image" || category === "video";
  const tooLarge = file.size > maxSizeBytes;

  return {
    id: crypto.randomUUID(),
    file,
    fileName: file.name,
    fileSize: file.size,
    mimeType,
    previewUrl: canPreview ? URL.createObjectURL(file) : undefined,
    status: tooLarge ? "failed" : "pending",
    progress: tooLarge ? 0 : 0,
    error: tooLarge
      ? maxSizeErrorMessage?.(maxSizeBytes) ?? `Max file size is ${formatBytes(maxSizeBytes)}.`
      : undefined,
  };
}

function getStatusLabel(status: UploadDropzoneItem["status"]) {
  switch (status) {
    case "uploading":
      return "Uploading";
    case "uploaded":
      return "Uploaded";
    case "failed":
      return "Failed";
    default:
      return "Ready";
  }
}

function getFileBadgeLabel(attachment: UploadDropzoneItem) {
  const category = getFileCategory(attachment.mimeType, attachment.fileName);
  switch (category) {
    case "image":
      return "IMG";
    case "video":
      return "VID";
    case "pdf":
      return "PDF";
    case "zip":
      return "ZIP";
    case "text":
      return "TXT";
    default:
      return "FILE";
  }
}

export function UploadDropzone({
  attachments,
  onChange,
  accept = DEFAULT_ACCEPT,
  disabled = false,
  hint,
  maxSizeBytes = DEFAULT_MAX_FILE_BYTES,
  maxSizeErrorMessage,
  multiple = true,
  capture,
  onFilesSelected,
  onUploadProgress,
  onUploadComplete,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef(new Map<string, string>());
  const [isDragging, setIsDragging] = useState(false);
  const [selectionError, setSelectionError] = useState("");

  useEffect(() => {
    const activeIds = new Set(attachments.map((attachment) => attachment.id));
    attachments.forEach((attachment) => {
      if (attachment.previewUrl) {
        previewUrlsRef.current.set(attachment.id, attachment.previewUrl);
      }
    });

    previewUrlsRef.current.forEach((url, id) => {
      if (!activeIds.has(id)) {
        URL.revokeObjectURL(url);
        previewUrlsRef.current.delete(id);
      }
    });
  }, [attachments]);

  useEffect(
    () => () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    attachments.forEach((attachment) => {
      if (attachment.status === "uploading") {
        onUploadProgress?.(attachment.id, attachment.progress);
      }
      if (attachment.status === "uploaded") {
        onUploadComplete?.(attachment.id);
      }
    });
  }, [attachments, onUploadComplete, onUploadProgress]);

  const summaryLabel = useMemo(() => {
    const count = attachments.filter((attachment) => attachment.status !== "failed" || attachment.file).length;
    if (count === 0) {
      return "No files selected yet";
    }
    return count === 1 ? "1 file selected" : `${count} files selected`;
  }, [attachments]);

  function commitFiles(fileList: FileList | null) {
    if (!fileList || disabled) {
      return;
    }
    const files = [...fileList];
    const supportedFiles = files.filter((file) => isSupportedFile(file));
    const unsupportedFiles = files.filter((file) => !isSupportedFile(file));
    if (unsupportedFiles.length > 0) {
      setSelectionError("Some files were skipped. Use images, mp4/webm videos, PDF, text, or zip files.");
    } else {
      setSelectionError("");
    }
    if (supportedFiles.length === 0) {
      return;
    }

    const next = supportedFiles.map((file) => createAttachmentRecord(file, maxSizeBytes, maxSizeErrorMessage));
    onChange(multiple ? [...attachments, ...next] : next.slice(0, 1));
    onFilesSelected?.(supportedFiles);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    commitFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    commitFiles(event.dataTransfer.files);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragging(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  function removeAttachment(id: string) {
    onChange(attachments.filter((attachment) => attachment.id !== id));
  }

  return (
    <div className="upload-dropzone-shell">
      <div
        className={`upload-dropzone ${isDragging ? "is-dragging" : ""} ${disabled ? "is-disabled" : ""}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={inputRef}
          className="upload-dropzone-input"
          type="file"
          accept={accept}
          multiple={multiple}
          capture={capture}
          disabled={disabled}
          onChange={handleInputChange}
        />
        <div className="upload-dropzone-copy">
          <strong>Drag &amp; drop evidence files here</strong>
          <span>or click to upload</span>
          <small>{summaryLabel}</small>
          <small className="muted">Supports images, mp4/webm, PDF, text, and zip files.</small>
          {hint ? <small className="muted">{hint}</small> : null}
        </div>
      </div>
      {selectionError ? <p className="warning-text">{selectionError}</p> : null}

      {attachments.length > 0 ? (
        <div className="upload-dropzone-list">
          {attachments.map((attachment) => {
            const category = getFileCategory(attachment.mimeType, attachment.fileName);
            const isImage = category === "image";
            const isVideo = category === "video";

            return (
              <article
                key={attachment.id}
                className={`upload-attachment-card status-${attachment.status}`}
              >
                {isImage && attachment.previewUrl ? (
                  <img
                    className="upload-attachment-preview"
                    src={attachment.previewUrl}
                    alt={attachment.fileName}
                    loading="lazy"
                  />
                ) : null}
                {isVideo && attachment.previewUrl ? (
                  <video
                    className="upload-attachment-preview"
                    src={attachment.previewUrl}
                    muted
                    playsInline
                    preload="metadata"
                    controls
                  />
                ) : null}
                {!isImage && !isVideo ? (
                  <div className={`upload-attachment-icon kind-${category}`}>
                    <span>{getFileBadgeLabel(attachment)}</span>
                  </div>
                ) : null}

                <div className="upload-attachment-meta">
                  <div className="upload-attachment-head">
                    <div className="upload-attachment-title">
                      <strong title={attachment.fileName}>{attachment.fileName}</strong>
                      <span>{attachment.mimeType || "application/octet-stream"}</span>
                    </div>
                    <button
                      type="button"
                      className="ghost-button upload-attachment-remove"
                      disabled={disabled}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeAttachment(attachment.id);
                      }}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="upload-attachment-details">
                    <span>{formatBytes(attachment.fileSize)}</span>
                    <span>{getStatusLabel(attachment.status)}</span>
                    {attachment.error ? <span className="upload-attachment-status-pill is-error">Needs retry</span> : null}
                    {attachment.walrusBlobId ? <SignalMetaChip type="blob" value={attachment.walrusBlobId} /> : null}
                  </div>

                  <div className="upload-attachment-progress">
                    <div
                      className="upload-attachment-progress-bar"
                      style={{ width: `${Math.max(attachment.progress, attachment.status === "uploaded" ? 100 : 0)}%` }}
                    />
                  </div>

                  {attachment.error ? <p className="error-text">{attachment.error}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
