import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import "../styles/components/metadata-proof.css";
import "../styles/pages/public-flows.css";
import "../styles/pages/my-responses.css";
import "../styles/mobile/layout.css";
import "../styles/mobile/workspace.css";
import "../styles/mobile/signal.css";
import { FormattedAnswerValue } from "../components/FormattedAnswerValue";
import { SignalMetaRow } from "../components/SignalMetaChip";
import { useI18n } from "../i18n";
import { getPublicRoadmapPath } from "../lib/publicLinks";
import { formatDate } from "../lib/utils";
import {
  hideMyResponseHistoryEntry,
  listMyResponseHistory,
  mergeMyResponseLifecycleFromSubmission,
  upsertMyResponseHistoryEntry,
  type MyResponseHistoryEntry,
  type MyResponseLifecycleStatus,
} from "../storage/myResponseHistory";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import type { FormField } from "../types";

const LIFECYCLE_STEPS: Array<{
  value: MyResponseLifecycleStatus;
  labelKey: string;
  detailKey: string;
}> = [
  { value: "submitted", labelKey: "myResponsesLifecycleSubmitted", detailKey: "myResponsesLifecycleSubmittedDetail" },
  { value: "received", labelKey: "myResponsesLifecycleReceived", detailKey: "myResponsesLifecycleReceivedDetail" },
  { value: "reviewing", labelKey: "myResponsesLifecycleReviewing", detailKey: "myResponsesLifecycleReviewingDetail" },
  { value: "planned", labelKey: "myResponsesLifecyclePlanned", detailKey: "myResponsesLifecyclePlannedDetail" },
  { value: "in_progress", labelKey: "myResponsesLifecycleInProgress", detailKey: "myResponsesLifecycleInProgressDetail" },
  { value: "completed", labelKey: "myResponsesLifecycleCompleted", detailKey: "myResponsesLifecycleCompletedDetail" },
  { value: "closed", labelKey: "myResponsesLifecycleClosed", detailKey: "myResponsesLifecycleClosedDetail" },
];

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

function getReceiptDisplayId(submissionId: string) {
  const normalized = submissionId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!normalized) {
    return "REC-LOCAL";
  }
  return `REC-${normalized.slice(0, 6)}-${normalized.slice(-4)}`;
}

function getVaultSummary(entries: MyResponseHistoryEntry[]) {
  return {
    total: entries.length,
    localOnly: entries.filter((entry) => entry.status === "local-only" || entry.storageMode === "local").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    durable: entries.filter((entry) => entry.storageMode === "walrus" || entry.storageMode === "uploadRelay").length,
  };
}

function getLifecycleIndex(status: MyResponseLifecycleStatus | undefined) {
  return Math.max(
    0,
    LIFECYCLE_STEPS.findIndex((step) => step.value === (status ?? "submitted")),
  );
}

function getLifecycleLabel(status: MyResponseLifecycleStatus | undefined, t: (key: string) => string) {
  const step = LIFECYCLE_STEPS.find((item) => item.value === status) ?? LIFECYCLE_STEPS[0];
  return t(step.labelKey);
}

function getLifecycleDetail(status: MyResponseLifecycleStatus | undefined, t: (key: string) => string) {
  const step = LIFECYCLE_STEPS.find((item) => item.value === status) ?? LIFECYCLE_STEPS[0];
  return t(step.detailKey);
}

function getLifecycleEventForStep(entry: MyResponseHistoryEntry, status: MyResponseLifecycleStatus) {
  const events = entry.lifecycleEvents ?? [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].status === status) {
      return events[index];
    }
  }
  return null;
}

async function listMyResponseHistoryWithSubmissionLifecycle() {
  const entries = listMyResponseHistory();
  const formIds = Array.from(new Set(entries.map((entry) => entry.formId)));
  const submissionsById = new Map(
    (
      await Promise.all(
        formIds.map(async (formId) => {
          try {
            return await localStorageAdapter.listSubmissions(formId);
          } catch (error) {
            console.warn("[my responses] failed to sync local lifecycle", { formId, error });
            return [];
          }
        }),
      )
    )
      .flat()
      .map((submission) => [submission.id, submission]),
  );
  const syncedEntries = entries.map((entry) =>
    mergeMyResponseLifecycleFromSubmission(entry, submissionsById.get(entry.submissionId)),
  );
  for (const syncedEntry of syncedEntries) {
    const original = entries.find((entry) => entry.submissionId === syncedEntry.submissionId);
    if (
      original &&
      (original.lifecycleStatus !== syncedEntry.lifecycleStatus ||
        original.triageStatus !== syncedEntry.triageStatus ||
        original.roadmapStatus !== syncedEntry.roadmapStatus ||
        original.lifecycleUpdatedAt !== syncedEntry.lifecycleUpdatedAt)
    ) {
      upsertMyResponseHistoryEntry(syncedEntry);
    }
  }
  return syncedEntries;
}

function SignalLifecycleTimeline({ entry }: { entry: MyResponseHistoryEntry }) {
  const { t } = useI18n();
  const activeIndex = getLifecycleIndex(entry.lifecycleStatus);
  const isRoadmapVisible = Boolean(entry.roadmapStatus);

  return (
    <section className="answer-card my-response-lifecycle-card my-response-detail-section">
      <div className="section-row">
        <div>
          <p className="eyebrow">{t("myResponsesLifecycleEyebrow")}</p>
          <h2>{t("myResponsesLifecycleTitle")}</h2>
          <p className="muted">{t("myResponsesLifecycleBody")}</p>
        </div>
        <span className={`my-response-badge is-lifecycle-${entry.lifecycleStatus ?? "submitted"}`}>
          {getLifecycleLabel(entry.lifecycleStatus, t)}
        </span>
      </div>

      <ol className="my-response-lifecycle-timeline" aria-label={t("myResponsesLifecycleTitle")}>
        {LIFECYCLE_STEPS.map((step, index) => {
          const state = index < activeIndex ? "complete" : index === activeIndex ? "current" : "pending";
          const event = getLifecycleEventForStep(entry, step.value);
          return (
            <li key={step.value} className={`my-response-lifecycle-step is-${state}`}>
              <span className="my-response-lifecycle-dot" aria-hidden="true" />
              <div>
                <strong>{t(step.labelKey)}</strong>
                <small>{t(step.detailKey)}</small>
                {event ? <time dateTime={event.at}>{formatDate(event.at)}</time> : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="my-response-lifecycle-footer">
        <div>
          <span>{t("myResponsesLifecycleLastUpdate")}</span>
          <strong>{formatDate(entry.lifecycleUpdatedAt ?? entry.submittedAt)}</strong>
        </div>
        <div>
          <span>{t("myResponsesRoadmapVisibility")}</span>
          <strong>{isRoadmapVisible ? t("myResponsesRoadmapVisible") : t("myResponsesRoadmapInternal")}</strong>
        </div>
      </div>
      {isRoadmapVisible ? (
        <Link to={getPublicRoadmapPath(entry.formId, entry.manifestBlobId)} className="ghost-button my-response-roadmap-link">
          {t("myResponsesOpenRoadmap")}
        </Link>
      ) : null}
    </section>
  );
}

export function MyResponsesPage() {
  const { t } = useI18n();
  const { submissionId = "" } = useParams();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<MyResponseHistoryEntry[]>(() => listMyResponseHistory());
  const selectedEntry = useMemo(() => entries.find((entry) => entry.submissionId === submissionId) ?? null, [entries, submissionId]);
  const vaultSummary = useMemo(() => getVaultSummary(entries), [entries]);

  useEffect(() => {
    let active = true;
    void listMyResponseHistoryWithSubmissionLifecycle().then((nextEntries) => {
      if (active) {
        setEntries(nextEntries);
      }
    });
    return () => {
      active = false;
    };
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
    const receiptId = getReceiptDisplayId(selectedEntry.submissionId);

    return (
      <section className="stack my-responses-page">
        <div className="panel glow-panel my-responses-hero">
          <div className="my-responses-hero-copy">
            <p className="eyebrow">{t("myResponsesDetailEyebrow")}</p>
            <h1>{t("myResponsesVaultTitle")}</h1>
            <p className="lede">{t("myResponsesDetailLede")}</p>
            <div className="my-responses-vault-chips" aria-label={t("myResponsesVaultStatus")}>
              <span>{t("myResponsesChipLocalHistory")}</span>
              <span>{t("myResponsesChipEncryptedReceipt")}</span>
              <span>{t("myResponsesChipWalletOptional")}</span>
              <span className="is-muted">{t("myResponsesChipRevokeUnavailable")}</span>
            </div>
          </div>
          <Link to="/my-responses" className="ghost-button">
            {t("myResponsesBack")}
          </Link>
        </div>

        <section className="answer-card my-response-overview-panel my-response-detail-section">
          <div className="my-response-receipt-header">
            <p className="my-response-section-label">{t("myResponsesHeaderSummary")}</p>
            <div className="my-response-receipt-mark" aria-hidden="true">
              <span />
            </div>
            <div className="my-response-receipt-title-block">
              <p className="eyebrow">{t("myResponsesSignal")}</p>
              <h2>{selectedEntry.formTitle}</h2>
              {selectedEntry.projectName ? <p className="muted">{selectedEntry.projectName}</p> : null}
            </div>
            <div className="my-response-receipt-id-block">
              <span>{t("myResponsesSubmissionId")}</span>
              <strong>{receiptId}</strong>
              <small>{selectedEntry.submissionId}</small>
            </div>
          </div>

          <div className="my-response-status-summary">
            <div className="section-row">
              <div>
                <p className="my-response-section-label">{t("myResponsesStatusSummary")}</p>
                <h2>{t("myResponsesStorageStatus")}</h2>
              </div>
            </div>
            <div className="my-response-status-grid">
              <div>
                <span>{t("myResponsesSubmittedAt")}</span>
                <strong>{formatDate(selectedEntry.submittedAt)}</strong>
              </div>
              <div>
                <span>{t("myResponsesLifecycleStatus")}</span>
                <strong>{getLifecycleLabel(selectedEntry.lifecycleStatus, t)}</strong>
              </div>
              <div>
                <span>{t("myResponsesStorageStatus")}</span>
                <strong>{getStorageLabel(selectedEntry.storageMode, t)}</strong>
              </div>
              <div>
                <span>{t("myResponsesFormVersion")}</span>
                <strong>v{getFormVersion(selectedEntry)}</strong>
              </div>
            </div>
            <div className="my-response-status-tags" aria-label={t("myResponsesStatusTags")}>
              <span className={`my-response-badge is-${selectedEntry.status}`}>{getStatusLabel(selectedEntry.status, t)}</span>
              <span className={`my-response-badge is-lifecycle-${selectedEntry.lifecycleStatus ?? "submitted"}`}>
                {getLifecycleLabel(selectedEntry.lifecycleStatus, t)}
              </span>
              <span className={`my-response-badge is-storage-${selectedEntry.storageMode}`}>
                {getStorageLabel(selectedEntry.storageMode, t)}
              </span>
              <span className="my-response-badge is-revoke-unavailable">{t("myResponsesChipRevokeUnavailable")}</span>
            </div>
          </div>
        </section>

        <section className="answer-card my-response-answer-vault my-response-detail-section">
          <div className="section-row">
            <div>
              <p className="my-response-section-label">{t("myResponsesAnswerSnapshot")}</p>
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

        <section className="answer-card my-response-detail-card my-response-detail-section">
          <div className="section-row">
            <div>
              <p className="my-response-section-label">{t("myResponsesSignalDetails")}</p>
              <h2>{t("myResponsesResponseDetail")}</h2>
            </div>
          </div>
          <div className="metadata-list">
            <div className="metadata-row">
              <span>{t("myResponsesSignal")}</span>
              <strong>{selectedEntry.formTitle}</strong>
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

        <SignalLifecycleTimeline entry={selectedEntry} />

        <details className="answer-card my-response-technical-details my-response-detail-section">
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

        <section className="answer-card my-response-history-actions my-response-detail-section">
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
            <p className="my-response-revoke-helper">{t("myResponsesRevokeUnavailableBody")}</p>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="stack my-responses-page">
      <div className="panel glow-panel my-responses-hero">
        <div className="my-responses-hero-copy">
          <p className="eyebrow">{t("myResponsesEyebrow")}</p>
          <h1>{t("myResponsesVaultTitle")}</h1>
          <p className="lede">{t("myResponsesLede")}</p>
          <div className="my-responses-vault-chips" aria-label={t("myResponsesVaultStatus")}>
            <span>{t("myResponsesChipLocalHistory")}</span>
            <span>{t("myResponsesChipEncryptedReceipt")}</span>
            <span>{t("myResponsesChipWalletOptional")}</span>
            <span className="is-muted">{t("myResponsesChipRevokeUnavailable")}</span>
          </div>
        </div>
        <div className="my-responses-hero-stats" aria-label={t("myResponsesVaultSummary")}>
          <div>
            <span>{t("myResponsesStatReceipts")}</span>
            <strong>{vaultSummary.total}</strong>
          </div>
          <div>
            <span>{t("myResponsesStatLocalOnly")}</span>
            <strong>{vaultSummary.localOnly}</strong>
          </div>
          <div>
            <span>{t("myResponsesStatDurable")}</span>
            <strong>{vaultSummary.durable}</strong>
          </div>
          <div className={vaultSummary.failed > 0 ? "is-alert" : undefined}>
            <span>{t("myResponsesStatFailed")}</span>
            <strong>{vaultSummary.failed}</strong>
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <section className="answer-card my-responses-empty">
          <div className="my-responses-empty-vault" aria-hidden="true">
            <span />
          </div>
          <h2>{t("myResponsesEmptyTitle")}</h2>
          <p className="muted">{t("myResponsesEmptyBody")}</p>
          <Link to="/explore" className="primary-button">
            {t("myResponsesExploreSignals")}
          </Link>
        </section>
      ) : (
        <div className="my-response-list">
          {entries.map((entry) => (
            <Link
              key={entry.submissionId}
              to={`/my-responses/${entry.submissionId}`}
              className="answer-card my-response-card"
              aria-label={`${t("myResponsesOpenReceipt")}: ${entry.formTitle}`}
            >
              <div className="my-response-card-main">
                <p className="eyebrow">{getReceiptDisplayId(entry.submissionId)}</p>
                <h2>{entry.formTitle}</h2>
                <p className="my-response-preview">{entry.answerSummary}</p>
                <p className="my-response-lifecycle-hint">
                  <strong>{getLifecycleLabel(entry.lifecycleStatus, t)}</strong>
                  <span>{getLifecycleDetail(entry.lifecycleStatus, t)}</span>
                </p>
              </div>
              <div className="my-response-card-meta">
                <span>{formatDate(entry.submittedAt)}</span>
                <span className={`my-response-badge is-${entry.status}`}>{getStatusLabel(entry.status, t)}</span>
                <span className={`my-response-badge is-lifecycle-${entry.lifecycleStatus ?? "submitted"}`}>
                  {getLifecycleLabel(entry.lifecycleStatus, t)}
                </span>
                <span className={`my-response-badge is-storage-${entry.storageMode}`}>{getStorageLabel(entry.storageMode, t)}</span>
                <span>v{getFormVersion(entry)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
