import { useI18n } from "../../../i18n";
import { formatResponseDeadline, type ResponseDeadlineLabels } from "../../../lib/responseDeadline";
import { shortAddress } from "../../../lib/sui";
import type { FormWithCount, StreamId } from "../hooks/useSignalInboxData";

interface StreamItem {
  id: StreamId;
  label: string;
  count: number;
}

const FLOW_STREAM_IDS: StreamId[] = ["needs_review", "unread", "high", "encrypted", "archived"];
const BLOCKCHAIN_STREAM_IDS: StreamId[] = ["pending_sui", "registered_sui"];

function MailboxIcon({ hasUnread }: { hasUnread: boolean }) {
  return (
    <span className={`mailbox-icon ${hasUnread ? "has-unread" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" focusable="false">
        <path className="mailbox-icon-post" d="M19 25.5v8" />
        <path className="mailbox-icon-base" d="M12.5 34h14" />
        <path
          className="mailbox-icon-body"
          d="M9 24.5v-7.2A9.3 9.3 0 0 1 18.3 8h3.4A9.3 9.3 0 0 1 31 17.3v7.2H9Z"
        />
        <path className="mailbox-icon-door" d="M9 24.5h13.2V17a6.8 6.8 0 0 0-6.8-6.8" />
        <path className="mailbox-icon-flag" d="M25.5 8.8v8.4h6.2" />
        {hasUnread ? <circle className="mailbox-icon-dot" cx="30.8" cy="9.2" r="3.1" /> : null}
      </svg>
    </span>
  );
}

function StreamIcon({ streamId, hasUnread }: { streamId: StreamId; hasUnread: boolean }) {
  return (
    <span className={`stream-item-icon ${hasUnread ? "has-unread" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        {streamId === "needs_review" ? (
          <>
            <path d="M3.8 12s3-5 8.2-5 8.2 5 8.2 5-3 5-8.2 5-8.2-5-8.2-5Z" />
            <circle cx="12" cy="12" r="2.4" />
          </>
        ) : streamId === "unread" ? (
          <>
            <path d="M4.5 8.5 12 13.4l7.5-4.9" />
            <path d="M5 6.5h14v11H5z" />
            <circle cx="18.2" cy="6" r="2.4" />
          </>
        ) : streamId === "encrypted" ? (
          <>
            <path d="M7 10h10v8H7z" />
            <path d="M9 10V7.8a3 3 0 0 1 6 0V10" />
            <path d="M12 13.2v2.1" />
          </>
        ) : streamId === "high" ? (
          <>
            <path d="M7 4.5v15" />
            <path d="M7.5 5.5h9l-1.5 3 1.5 3h-9" />
          </>
        ) : streamId === "pending_sui" ? (
          <>
            <path d="M12 4.5v9" />
            <path d="m8.4 8.1 3.6-3.6 3.6 3.6" />
            <path d="M5.5 13.5v4.2h13v-4.2" />
            <path d="M8 17.7h8" />
          </>
        ) : streamId === "registered_sui" ? (
          <>
            <path d="M9.2 12.8 11 14.6l4.1-5" />
            <path d="M8.5 6.1a4.4 4.4 0 0 1 7 0" />
            <path d="M15.5 17.9a4.4 4.4 0 0 1-7 0" />
            <path d="m6.5 8.6-2 2a2 2 0 0 0 0 2.8l2 2" />
            <path d="m17.5 8.6 2 2a2 2 0 0 1 0 2.8l-2 2" />
          </>
        ) : streamId === "archived" ? (
          <>
            <circle cx="12" cy="12" r="7.5" />
            <path d="m8.8 12.2 2.2 2.2 4.6-5" />
          </>
        ) : (
          <>
            <path d="M5 7.5h14v10H5z" />
            <path d="M5 8 12 13l7-5" />
          </>
        )}
      </svg>
    </span>
  );
}

function getStreamHelper(streamId: StreamId, t: ReturnType<typeof useI18n>["t"]) {
  switch (streamId) {
    case "needs_review":
      return t("needsReviewStreamHelper");
    case "unread":
      return t("unreadStreamHelper");
    case "high":
      return t("flaggedStreamHelper");
    case "encrypted":
      return t("protectedStreamHelper");
    case "archived":
      return t("resolvedStreamHelper");
    case "pending_sui":
      return t("pendingSuiStreamHelper");
    case "registered_sui":
      return t("registeredSuiStreamHelper");
    case "all":
      return t("allSignalsStreamHelper");
    default:
      return "";
  }
}

function getStreamTone(streamId: StreamId) {
  switch (streamId) {
    case "needs_review":
      return "tone-needs-review";
    case "unread":
      return "tone-unread";
    case "high":
      return "tone-flagged";
    case "encrypted":
      return "tone-protected";
    case "archived":
      return "tone-resolved";
    case "pending_sui":
      return "tone-pending-sui";
    case "registered_sui":
      return "tone-registered-sui";
    default:
      return "tone-secondary";
  }
}

function StreamButton({
  stream,
  selectedStreamId,
  onSelectStream,
}: {
  stream: StreamItem;
  selectedStreamId: StreamId;
  onSelectStream: (streamId: StreamId) => void;
}) {
  const { t } = useI18n();
  const hasUnread = stream.id === "unread" && stream.count > 0;
  const isPrimaryQueue = stream.id === "needs_review";
  const isSecondary = stream.id === "all";
  const isHistory = stream.id === "registered_sui";
  const isEmpty = stream.count === 0;
  return (
    <button
      type="button"
      className={`stream-item ${selectedStreamId === stream.id ? "is-active" : ""} ${
        hasUnread ? "has-new-signals" : ""
      } ${getStreamTone(stream.id)} ${isPrimaryQueue ? "is-primary-queue" : ""} ${
        isSecondary ? "is-secondary" : ""
      } ${isHistory ? "is-history" : ""} ${isEmpty ? "is-empty" : ""}`}
      onClick={() => onSelectStream(stream.id)}
    >
      <span className="stream-item-label">
        <StreamIcon streamId={stream.id} hasUnread={hasUnread} />
        <span className="stream-item-copy">
          <span>{stream.label}</span>
          <small>{getStreamHelper(stream.id, t)}</small>
        </span>
      </span>
      <strong>{stream.count}</strong>
    </button>
  );
}

function CsvFileIcon() {
  return (
    <svg className="csv-file-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 3.5h8.3L19 8.2v12.3H6z" />
      <path d="M14 3.8V9h5" />
      <path d="M8.3 15.6c0-1.5.8-2.4 2-2.4.7 0 1.2.2 1.6.7" />
      <path d="M11.9 17.4c-.4.4-.9.6-1.6.6-1.2 0-2-.9-2-2.4" />
      <path d="M13.1 17.4c.4.4.9.6 1.5.6.8 0 1.3-.4 1.3-1 0-.7-.6-.9-1.3-1.1-.7-.2-1.3-.4-1.3-1.1s.5-1.3 1.4-1.3c.5 0 1 .2 1.3.5" />
      <path d="m16.8 13.5 1.3 4.4 1.3-4.4" />
    </svg>
  );
}

interface SignalStreamsNavProps {
  streamItems: StreamItem[];
  selectedStreamId: StreamId;
  onSelectStream: (streamId: StreamId) => void;
  accessibleForms: FormWithCount[];
  selectedFormId: string;
  onSelectForm: (formId: string) => void;
  unreadCountByFormId: Record<string, number>;
  visibleUnreadCount: number;
  allSignalsCount: number;
  activeScopeLabel: string;
  activeNodeSummary: string;
  allSignalNodesLabel: string;
  responseDeadlineLabels: ResponseDeadlineLabels;
  openNodeDirectoryLabel: string;
  onOpenNodeDirectory: () => void;
  onExportAllFormCsv: (formId: string) => void;
}

export function SignalStreamsNav({
  streamItems,
  selectedStreamId,
  onSelectStream,
  accessibleForms,
  selectedFormId,
  onSelectForm,
  unreadCountByFormId,
  visibleUnreadCount,
  allSignalsCount,
  activeScopeLabel,
  activeNodeSummary,
  allSignalNodesLabel,
  responseDeadlineLabels,
  openNodeDirectoryLabel,
  onOpenNodeDirectory,
  onExportAllFormCsv,
}: SignalStreamsNavProps) {
  const { t } = useI18n();
  const hasUnreadSignals = visibleUnreadCount > 0;
  const flowStreams = FLOW_STREAM_IDS.map((streamId) => streamItems.find((stream) => stream.id === streamId)).filter(
    (stream): stream is StreamItem => Boolean(stream),
  );
  const blockchainStreams = BLOCKCHAIN_STREAM_IDS.map((streamId) =>
    streamItems.find((stream) => stream.id === streamId),
  ).filter((stream): stream is StreamItem => Boolean(stream));
  const allSignalsStream = streamItems.find((stream) => stream.id === "all") ?? null;

  return (
    <aside className={`panel signal-sidebar ${hasUnreadSignals ? "has-unread-signals" : ""}`}>
      <div className="signal-sidebar-section">
        <div className="signal-sidebar-heading">
          <MailboxIcon hasUnread={hasUnreadSignals} />
          <div className="signal-sidebar-title">
            <p className="eyebrow">{t("signalStreamsTitle")}</p>
            <h2>{t("signalStreamsTitle")}</h2>
          </div>
          {hasUnreadSignals ? (
            <span className="signal-new-count" aria-label={t("unreadBadge", { count: visibleUnreadCount })}>
              {visibleUnreadCount}
            </span>
          ) : null}
        </div>
        <div className="stream-list">
          {flowStreams.map((stream) => (
            <StreamButton
              key={stream.id}
              stream={stream}
              selectedStreamId={selectedStreamId}
              onSelectStream={onSelectStream}
            />
          ))}
          {allSignalsStream ? (
            <StreamButton
              stream={allSignalsStream}
              selectedStreamId={selectedStreamId}
              onSelectStream={onSelectStream}
            />
          ) : null}
        </div>
        <div className="stream-subsection">
          <p className="eyebrow">{t("blockchainActionsTitle")}</p>
          <div className="stream-list stream-list-compact">
            {blockchainStreams.map((stream) => (
              <StreamButton
                key={stream.id}
                stream={stream}
                selectedStreamId={selectedStreamId}
                onSelectStream={onSelectStream}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="signal-sidebar-section">
        <div className="section-row">
          <p className="eyebrow">{t("formsTitle")}</p>
          <span className="muted">{accessibleForms.length}</span>
        </div>
        <div className="form-stream-list">
          <div
            className={`form-stream-item ${selectedFormId === "all" ? "is-active" : ""}`}
          >
            <button type="button" className="form-stream-select" onClick={() => onSelectForm("all")}>
              <span className="form-stream-heading">
                <strong>{allSignalNodesLabel}</strong>
                <span className="form-stream-count">{allSignalsCount}</span>
              </span>
              <p className="muted">{t("signalsAcrossEveryFormInbox", { count: allSignalsCount })}</p>
            </button>
            <div className="form-stream-actions">
              <span className="signal-chip">{t("unreadBadge", { count: visibleUnreadCount })}</span>
            </div>
          </div>
          {accessibleForms.map((form) => {
            const isSelected = selectedFormId === form.id;
            const unreadCount = unreadCountByFormId[form.id] ?? 0;
            const ownerLabel = form.ownerAddress ? shortAddress(form.ownerAddress) : t("legacyDemoForm");
            const deadlineValue = formatResponseDeadline(form.responseDeadline, responseDeadlineLabels);
            return (
              <div
                key={form.id}
                className={`form-stream-item ${isSelected ? "is-active" : ""}`}
              >
                <button type="button" className="form-stream-select" onClick={() => onSelectForm(form.id)}>
                  <span className="form-stream-heading">
                    <strong>{form.title}</strong>
                    <span className="form-stream-count">{form.submissionCount}</span>
                  </span>
                  <p className="muted">
                    {t("formSignalsSummary", {
                      count: form.submissionCount,
                      inboxType: form.encryptSubmissions ? t("protectedInboxLabel") : t("openInboxLabel"),
                    })}
                  </p>
                  <p className="muted form-stream-meta" title={form.ownerAddress ?? undefined}>
                    <span>{ownerLabel}</span>
                    <span>{deadlineValue}</span>
                  </p>
                </button>
                <div className="form-stream-actions">
                  <span className="signal-chip">{t("unreadBadge", { count: unreadCount })}</span>
                  {form.projectId ? (
                    <span className="signal-chip signal-chip-soft">{t("projectLinkedLabel")}</span>
                  ) : null}
                  <button
                    type="button"
                    className="ghost-button form-stream-export-button"
                    onClick={() => onExportAllFormCsv(form.id)}
                    disabled={form.submissionCount === 0}
                  >
                    <CsvFileIcon />
                    {t("exportAllFormCsv")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="signal-node-summary">
          <div className="signal-node-summary-copy">
            <strong>{activeScopeLabel}</strong>
            <p className="muted">{activeNodeSummary}</p>
          </div>
          <button
            type="button"
            className="primary-button signal-node-directory-trigger"
            onClick={onOpenNodeDirectory}
          >
            {openNodeDirectoryLabel}
          </button>
        </div>
      </div>
    </aside>
  );
}
