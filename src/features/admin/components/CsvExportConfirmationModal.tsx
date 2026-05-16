import { useEffect, useRef } from "react";
import type { ExportMetadata, ExportPiiField } from "../../../lib/exportResponses";

interface CsvExportConfirmationModalLabels {
  title: string;
  body: string;
  targetForm: string;
  targetCount: string;
  includedColumns: string;
  includesDecryptedData: string;
  includesAttachmentInfo: string;
  exportedBy: string;
  filterSnapshot: string;
  personalInfoOptions: string;
  omitWalletAddress: string;
  omitNotes: string;
  omitAttachments: string;
  omitDecryptedAnswers: string;
  yes: string;
  no: string;
  cancel: string;
  confirm: string;
}

interface CsvExportConfirmationModalProps {
  metadata: ExportMetadata;
  excludedPiiFields: ExportPiiField[];
  labels: CsvExportConfirmationModalLabels;
  onTogglePiiField: (field: ExportPiiField) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

const PII_OPTIONS: Array<{ field: ExportPiiField; labelKey: keyof CsvExportConfirmationModalLabels }> = [
  { field: "respondentAddress", labelKey: "omitWalletAddress" },
  { field: "notes", labelKey: "omitNotes" },
  { field: "attachments", labelKey: "omitAttachments" },
  { field: "decryptedAnswers", labelKey: "omitDecryptedAnswers" },
];

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function CsvExportConfirmationModal({
  metadata,
  excludedPiiFields,
  labels,
  onTogglePiiField,
  onCancel,
  onConfirm,
}: CsvExportConfirmationModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onCancel]);

  return (
    <div className="modal-backdrop export-modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        ref={dialogRef}
        className="answer-card export-confirmation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-export-title"
        aria-describedby="csv-export-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-row">
          <div>
            <p className="eyebrow">{metadata.title}</p>
            <h3 id="csv-export-title">{labels.title}</h3>
          </div>
          <span className="signal-chip signal-chip-soft">{metadata.filterMode}</span>
        </div>
        <p id="csv-export-description" className="muted">{labels.body}</p>

        <div className="metadata-list">
          <div className="metadata-row">
            <span>{labels.targetForm}</span>
            <strong>{metadata.formTitle}</strong>
          </div>
          <div className="metadata-row">
            <span>{labels.targetCount}</span>
            <strong>{metadata.responseCount}</strong>
          </div>
          <div className="metadata-row">
            <span>{labels.exportedBy}</span>
            <strong>{metadata.exportedBy || "unknown"}</strong>
          </div>
          <div className="metadata-row">
            <span>{labels.includesDecryptedData}</span>
            <strong>{metadata.includedDecryptedData ? labels.yes : labels.no}</strong>
          </div>
          <div className="metadata-row">
            <span>{labels.includesAttachmentInfo}</span>
            <strong>{metadata.includedAttachmentInfo ? labels.yes : labels.no}</strong>
          </div>
        </div>

        <div className="export-confirmation-block">
          <strong>{labels.includedColumns}</strong>
          <p>{metadata.columns.join(", ")}</p>
        </div>

        <div className="export-confirmation-block">
          <strong>{labels.filterSnapshot}</strong>
          <pre>{JSON.stringify(metadata.filterSnapshot, null, 2)}</pre>
        </div>

        <div className="export-confirmation-block">
          <strong>{labels.personalInfoOptions}</strong>
          <div className="export-pii-options">
            {PII_OPTIONS.map((option) => (
              <label key={option.field} className="export-pii-option">
                <input
                  type="checkbox"
                  checked={excludedPiiFields.includes(option.field)}
                  onChange={() => onTogglePiiField(option.field)}
                />
                <span>{labels[option.labelKey]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="inline-actions export-confirmation-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            {labels.cancel}
          </button>
          <button ref={confirmButtonRef} type="button" className="primary-button" onClick={onConfirm}>
            {labels.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}
