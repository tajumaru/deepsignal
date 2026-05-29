import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import "../styles/components/metadata-proof.css";
import "../styles/pages/public-flows.css";
import "../styles/mobile/layout.css";
import "../styles/mobile/workspace.css";
import "../styles/mobile/signal.css";
import { FormattedAnswerValue } from "../components/FormattedAnswerValue";
import { SignalMetaRow } from "../components/SignalMetaChip";
import { useI18n } from "../i18n";
import { formatDate } from "../lib/utils";
import {
  getMyResponseHistoryEntry,
  hideMyResponseHistoryEntry,
  listMyResponseHistory,
  type MyResponseHistoryEntry,
} from "../storage/myResponseHistory";
import type { FormField } from "../types";

function getStatusLabel(status: MyResponseHistoryEntry["status"], t: (key: string) => string) {
  switch (status) {
    case "submitted":
      return t("myResponsesStatusSubmitted");
    case "failed":
      return t("myResponsesStatusFailed");
    case "local-only":
      return t("myResponsesStatusLocalOnly");
    case "pending":
    default:
      return t("myResponsesStatusPending");
  }
}

function getStorageLabel(storageMode: MyResponseHistoryEntry["storageMode"], t: (key: string) => string) {
  switch (storageMode) {
    case "uploadRelay":
      return t("myResponsesStorageUploadRelay");
    case "walrus":
      return t("myResponsesStorageWalrus");
    case "local":
    default:
      return t("myResponsesStorageLocal");
  }
}

function getFormVersion(entry: MyResponseHistoryEntry) {
  return entry.formVersion ?? 1;
}

export function MyResponsesPage() {
  const { t } = useI18n();
  const { submissionId = "" } = useParams();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<MyResponseHistoryEntry[]>(() => listMyResponseHistory());
  const selectedEntry = useMemo(
    () => (submissionId ? getMyResponseHistoryEntry(submissionId) : null),
    [submissionId],
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
            <p className="eyebrow">{t("myResponsesDetailEyebrow")}</p>
            <h1>{t("myResponsesTitle")}</h1>
            <p className="lede">{t("myResponsesDetailLede")}</p>
          </div>
          <Link to="/my-responses" className="ghost-button">
            {t("myResponsesBack")}
          </Link>
        </div>

        <section className="answer-card my-response-detail-card">
          <div className="section-row">
            <div>
              <p className="eyebrow">{t("myResponsesResponseDetail")}</p>
              <h2>{selectedEntry.formTitle}</h2>
              {selectedEntry.projectName ? <p className="muted">{selectedEntry.projectName}</p> : null}
            </div>
            <div className="my-response-badge-row">
              <span className={`my-response-badge is-${selectedEntry.status}`}>{getStatusLabel(selectedEntry.status, t)}</span>
              <span className={`my-response-badge is-storage-${selectedEntry.storageMode}`}>
                {getStorageLabel(selectedEntry.storageMode, t)}
              </span>
            </div>
          </div>

          <div className="metadata-list">
            <div className="metadata-row">
              <span>{t("myResponsesSubmittedAt")}</span>
              <strong>{formatDate(selectedEntry.submittedAt)}</strong>
            </div>
            <div className="metadata-row">
              <span>{t("myResponsesSignal")}</span>
              <strong>{selectedEntry.formTitle}</strong>
            </div>
            <div className="metadata-row">
              <span>{t("myResponsesStorageStatus")}</span>
              <strong>{getStatusLabel(selectedEntry.status, t)}</strong>
            </div>
            <div className="metadata-row">
              <span>{t("myResponsesFormVersion")}</span>
              <strong>v{getFormVersion(selectedEntry)}</strong>
            </div>
            <div className="metadata-row">
              <span>{t("myResponsesSchemaHash")}</span>
              <strong>{selectedEntry.schemaHash ?? t("myResponsesNotAvailable")}</strong>
            </div>
            {selectedEntry.errorMessage ? (
              <div className="metadata-row">
                <span>{t("myResponsesError")}</span>
                <strong>{selectedEntry.errorMessage}</strong>
              </div>
            ) : null}
          </div>
        </section>

        <section className="answer-card">
          <div className="section-row">
            <div>
              <p className="eyebrow">{t("myResponsesAnswerSnapshot")}</p>
              <h2>{t("myResponsesContent")}</h2>
            </div>
          </div>
          {answerEntries.length > 0 ? (
            <div className="stack">
              {answerEntries.map(([fieldId, value], index) => {
                const field = fieldsById.get(fieldId) as FormField | undefined;
                return (
                  <div key={fieldId} className="answer-line" data-question-index={`Q${index + 1}`}>
                    <strong>{field?.label ?? fieldId}</strong>
                    <FormattedAnswerValue field={field} value={value} emptyLabel={t("myResponsesNoAnswer")} showCountryIso />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">{t("myResponsesNoAnswerBody")}</p>
          )}
        </section>

        <details className="answer-card my-response-technical-details">
          <summary>
            <span>
              <strong>{t("myResponsesTechnicalDetails")}</strong>
              <small>{t("myResponsesTechnicalDetailsBody")}</small>
            </span>
          </summary>
          <div className="metadata-list">
            <SignalMetaRow
              label={t("myResponsesFormBlob")}
              type="blob"
              value={selectedEntry.formBlobId}
              emptyLabel={t("myResponsesNotAvailable")}
            />
            <SignalMetaRow
              label={t("myResponsesManifest")}
              type="manifest"
              value={selectedEntry.manifestBlobId}
              emptyLabel={t("myResponsesNotAvailable")}
            />
            <SignalMetaRow
              label={t("myResponsesSubmissionBlob")}
              type="blob"
              value={selectedEntry.submissionBlobId}
              emptyLabel={t("myResponsesNotAvailable")}
            />
            <div className="metadata-row">
              <span>{t("myResponsesSubmissionId")}</span>
              <strong>{selectedEntry.submissionId}</strong>
            </div>
            {selectedEntry.projectId ? (
              <div className="metadata-row">
                <span>{t("myResponsesProjectId")}</span>
                <strong>{selectedEntry.projectId}</strong>
              </div>
            ) : null}
          </div>
        </details>

        <section className="answer-card my-response-history-actions">
          <div>
            <p className="eyebrow">{t("myResponsesLocalHistoryControl")}</p>
            <h2>{t("myResponsesHideTitle")}</h2>
            <p className="muted">{t("myResponsesHideBody")}</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="ghost-button" onClick={() => handleHide(selectedEntry)}>
              {t("myResponsesHideAction")}
            </button>
            <button type="button" className="ghost-button" disabled>
              {t("myResponsesRevokeResponse")}
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
          <p className="eyebrow">{t("myResponsesEyebrow")}</p>
          <h1>{t("myResponsesTitle")}</h1>
          <p className="lede">{t("myResponsesLede")}</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <section className="answer-card my-responses-empty">
          <h2>{t("myResponsesEmptyTitle")}</h2>
          <p className="muted">{t("myResponsesEmptyBody")}</p>
          <Link to="/explore" className="primary-button">
            {t("myResponsesExploreSignals")}
          </Link>
        </section>
      ) : (
        <div className="my-response-list">
          {entries.map((entry) => (
            <article key={entry.submissionId} className="answer-card my-response-card">
              <div className="my-response-card-main">
                <p className="eyebrow">{t("myResponsesSignalTitle")}</p>
                <h2>{entry.formTitle}</h2>
                <p className="muted">{entry.answerSummary}</p>
              </div>
              <div className="my-response-card-meta">
                <span>{formatDate(entry.submittedAt)}</span>
                <span className={`my-response-badge is-${entry.status}`}>{getStatusLabel(entry.status, t)}</span>
                <span className={`my-response-badge is-storage-${entry.storageMode}`}>{getStorageLabel(entry.storageMode, t)}</span>
                <span>v{getFormVersion(entry)}</span>
              </div>
              <Link to={`/my-responses/${entry.submissionId}`} className="primary-button">
                {t("myResponsesViewResponse")}
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
