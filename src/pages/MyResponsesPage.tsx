import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { FormattedAnswerValue } from "../components/FormattedAnswerValue";
import { SignalMetaRow } from "../components/SignalMetaChip";
import { formatDate } from "../lib/utils";
import {
  getMyResponseHistoryEntry,
  hideMyResponseHistoryEntry,
  listMyResponseHistory,
  type MyResponseHistoryEntry,
} from "../storage/myResponseHistory";
import type { FormField } from "../types";

function getStatusLabel(status: MyResponseHistoryEntry["status"]) {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "failed":
      return "Failed";
    case "local-only":
      return "Local only";
    case "pending":
    default:
      return "Pending";
  }
}

function getStorageLabel(storageMode: MyResponseHistoryEntry["storageMode"]) {
  switch (storageMode) {
    case "uploadRelay":
      return "Upload relay";
    case "walrus":
      return "Walrus";
    case "local":
    default:
      return "Local";
  }
}

function getFormVersion(entry: MyResponseHistoryEntry) {
  return entry.formVersion ?? 1;
}

export function MyResponsesPage() {
  const { submissionId = "" } = useParams();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<MyResponseHistoryEntry[]>(() => listMyResponseHistory());
  const selectedEntry = useMemo(
    () => (submissionId ? getMyResponseHistoryEntry(submissionId) : null),
    [submissionId, entries],
  );

  useEffect(() => {
    setEntries(listMyResponseHistory());
  }, [submissionId]);

  function handleHide(entry: MyResponseHistoryEntry) {
    if (!hideMyResponseHistoryEntry(entry.submissionId)) {
      return;
    }
    setEntries(listMyResponseHistory());
    navigate("/my-responses", { replace: true });
  }

  if (submissionId && !selectedEntry) {
    return <Navigate to="/my-responses" replace />;
  }

  if (selectedEntry) {
    const fieldsById = new Map((selectedEntry.fields ?? []).map((field) => [field.id, field]));
    const answerEntries = Object.entries(selectedEntry.answers ?? {});

    return (
      <section className="stack my-responses-page">
        <div className="panel glow-panel my-responses-hero">
          <div>
            <p className="eyebrow">Local sender history</p>
            <h1>My Responses</h1>
            <p className="lede">A device-local copy of the response you sent.</p>
          </div>
          <Link to="/my-responses" className="ghost-button">
            Back to My Responses
          </Link>
        </div>

        <section className="answer-card my-response-detail-card">
          <div className="section-row">
            <div>
              <p className="eyebrow">Response detail</p>
              <h2>{selectedEntry.formTitle}</h2>
              {selectedEntry.projectName ? <p className="muted">{selectedEntry.projectName}</p> : null}
            </div>
            <div className="my-response-badge-row">
              <span className={`my-response-badge is-${selectedEntry.status}`}>{getStatusLabel(selectedEntry.status)}</span>
              <span className={`my-response-badge is-storage-${selectedEntry.storageMode}`}>
                {getStorageLabel(selectedEntry.storageMode)}
              </span>
            </div>
          </div>

          <div className="metadata-list">
            <div className="metadata-row">
              <span>Submitted at</span>
              <strong>{formatDate(selectedEntry.submittedAt)}</strong>
            </div>
            <div className="metadata-row">
              <span>Signal</span>
              <strong>{selectedEntry.formTitle}</strong>
            </div>
            <div className="metadata-row">
              <span>Storage status</span>
              <strong>{getStatusLabel(selectedEntry.status)}</strong>
            </div>
            <div className="metadata-row">
              <span>Form version</span>
              <strong>v{getFormVersion(selectedEntry)}</strong>
            </div>
            <div className="metadata-row">
              <span>Schema hash</span>
              <strong>{selectedEntry.schemaHash ?? "Not available"}</strong>
            </div>
            {selectedEntry.errorMessage ? (
              <div className="metadata-row">
                <span>Error</span>
                <strong>{selectedEntry.errorMessage}</strong>
              </div>
            ) : null}
          </div>
        </section>

        <section className="answer-card">
          <div className="section-row">
            <div>
              <p className="eyebrow">Answer snapshot</p>
              <h2>Response content</h2>
            </div>
          </div>
          {answerEntries.length > 0 ? (
            <div className="stack">
              {answerEntries.map(([fieldId, value], index) => {
                const field = fieldsById.get(fieldId) as FormField | undefined;
                return (
                  <div key={fieldId} className="answer-line" data-question-index={`Q${index + 1}`}>
                    <strong>{field?.label ?? fieldId}</strong>
                    <FormattedAnswerValue field={field} value={value} emptyLabel="No answer" showCountryIso />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">No answer body was stored in this local history entry.</p>
          )}
        </section>

        <details className="answer-card my-response-technical-details">
          <summary>
            <span>
              <strong>Technical details</strong>
              <small>Blob references and recovery metadata saved on this device.</small>
            </span>
          </summary>
          <div className="metadata-list">
            <SignalMetaRow label="Form blob" type="blob" value={selectedEntry.formBlobId} emptyLabel="Not available" />
            <SignalMetaRow label="Manifest" type="manifest" value={selectedEntry.manifestBlobId} emptyLabel="Not available" />
            <SignalMetaRow label="Submission blob" type="blob" value={selectedEntry.submissionBlobId} emptyLabel="Not available" />
            <div className="metadata-row">
              <span>Submission ID</span>
              <strong>{selectedEntry.submissionId}</strong>
            </div>
            {selectedEntry.projectId ? (
              <div className="metadata-row">
                <span>Project ID</span>
                <strong>{selectedEntry.projectId}</strong>
              </div>
            ) : null}
          </div>
        </details>

        <section className="answer-card my-response-history-actions">
          <div>
            <p className="eyebrow">Local history control</p>
            <h2>Hide from my history</h2>
            <p className="muted">
              This only hides the device-local entry. It does not revoke a response or delete Walrus evidence.
            </p>
          </div>
          <div className="inline-actions">
            <button type="button" className="ghost-button" onClick={() => handleHide(selectedEntry)}>
              Hide from my history
            </button>
            <button type="button" className="ghost-button" disabled>
              Revoke response
            </button>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="stack my-responses-page">
      <div className="panel glow-panel my-responses-hero">
        <div>
          <p className="eyebrow">Sender-side history</p>
          <h1>My Responses</h1>
          <p className="lede">Responses sent from this device, separate from the operator Inbox.</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <section className="answer-card my-responses-empty">
          <h2>No responses sent yet.</h2>
          <p className="muted">When you send a signal from this browser, its local receipt will appear here.</p>
          <Link to="/explore" className="primary-button">
            Explore Signals
          </Link>
        </section>
      ) : (
        <div className="my-response-list">
          {entries.map((entry) => (
            <article key={entry.submissionId} className="answer-card my-response-card">
              <div className="my-response-card-main">
                <p className="eyebrow">Signal title</p>
                <h2>{entry.formTitle}</h2>
                <p className="muted">{entry.answerSummary}</p>
              </div>
              <div className="my-response-card-meta">
                <span>{formatDate(entry.submittedAt)}</span>
                <span className={`my-response-badge is-${entry.status}`}>{getStatusLabel(entry.status)}</span>
                <span className={`my-response-badge is-storage-${entry.storageMode}`}>{getStorageLabel(entry.storageMode)}</span>
                <span>v{getFormVersion(entry)}</span>
              </div>
              <Link to={`/my-responses/${entry.submissionId}`} className="primary-button">
                View response
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
