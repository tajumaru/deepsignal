import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../i18n";
import { isLocalFallbackBlob } from "../../../lib/proof";
import { formatResponseDeadline, type ResponseDeadlineLabels } from "../../../lib/responseDeadline";
import { shortAddress } from "../../../lib/sui";
import type { FormWithCount, StreamId } from "../hooks/useSignalInboxData";

interface StreamItem {
  id: StreamId;
  label: string;
  count: number;
}

const FLOW_STREAM_IDS: StreamId[] = [
  "unread",
  "needs_review",
  "unresolved",
  "high",
  "follow_up",
  "pending_sui",
  "verified",
  "encrypted",
  "anonymous",
  "published",
  "archived",
];
const BLOCKCHAIN_STREAM_IDS: StreamId[] = ["registered_sui"];

export function MailboxIcon({ hasUnread }: { hasUnread: boolean }) {
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
        ) : streamId === "unresolved" ? (
          <>
            <circle cx="12" cy="12" r="7.2" />
            <path d="M12 8v4.3" />
            <circle cx="12" cy="15.6" r="0.9" />
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
        ) : streamId === "verified" ? (
          <>
            <path d="M12 4.5 18 7v4.6c0 3.7-2.4 6.6-6 7.9-3.6-1.3-6-4.2-6-7.9V7l6-2.5Z" />
            <path d="m9.4 12.2 1.8 1.8 3.4-3.8" />
          </>
        ) : streamId === "anonymous" ? (
          <>
            <circle cx="12" cy="8.2" r="2.8" />
            <path d="M6.8 18c.8-2.8 3-4.4 5.2-4.4s4.4 1.6 5.2 4.4" />
            <path d="M4.6 6.4 19.4 17.6" />
          </>
        ) : streamId === "published" ? (
          <>
            <path d="M6 17.5h12" />
            <path d="M9 14.5 12 17.5l6-7" />
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
    case "unresolved":
      return t("openTriageQueue");
    case "unread":
      return t("unreadStreamHelper");
    case "follow_up":
      return t("followUpEnabledLabel");
    case "verified":
      return t("verifiedStreamHelper");
    case "anonymous":
      return t("anonymousSenders");
    case "published":
      return t("roadmapReadySignals");
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
    case "unresolved":
      return "tone-secondary";
    case "unread":
      return "tone-unread";
    case "verified":
      return "tone-registered-sui";
    case "anonymous":
      return "tone-secondary";
    case "published":
      return "tone-resolved";
    case "high":
      return "tone-flagged";
    case "follow_up":
      return "tone-needs-review";
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
  const hasUnread = (stream.id === "unread" || stream.id === "verified") && stream.count > 0;
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
  visibleUnreadCount: number;
}

interface SignalChannelSelectorProps {
  accessibleForms: FormWithCount[];
  selectedFormId: string;
  onSelectForm: (formId: string) => void;
  unreadCountByFormId: Record<string, number>;
  allSignalsCount: number;
  totalUnreadCount: number;
  activeScopeLabel: string;
  allSignalNodesLabel: string;
  responseDeadlineLabels: ResponseDeadlineLabels;
  openNodeDirectoryLabel: string;
  onOpenNodeDirectory: () => void;
  activeNodeSummary: string;
  onExportAllFormCsv: (formId: string) => void;
  className?: string;
}

function ChannelSelectorCaret() {
  return (
    <span className="signal-channel-caret" aria-hidden="true">
      <svg viewBox="0 0 12 12" focusable="false">
        <path d="M2.25 4.25 6 7.75l3.75-3.5" />
      </svg>
    </span>
  );
}

function hasUnregisteredWalrusNode(form: FormWithCount) {
  return Boolean(
    form.projectId &&
      form.manifestBlobId &&
      typeof form.onchainFormId !== "number" &&
      !isLocalFallbackBlob(form.manifestBlobId),
  );
}

function WarningTriangle({ title }: { title: string }) {
  return (
    <span className="signal-warning-indicator" aria-label={title} title={title}>
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M12 3.8 21 19.5H3L12 3.8Z" />
        <path d="M12 9v5.2" />
        <circle cx="12" cy="17.1" r="1.1" />
      </svg>
    </span>
  );
}

function SignalChannelSelectorItem({
  accessibleForms,
  selectedFormId,
  onSelectForm,
  unreadCountByFormId,
  allSignalsCount,
  totalUnreadCount,
  activeScopeLabel,
  allSignalNodesLabel,
  responseDeadlineLabels,
  onExportAllFormCsv,
  closeMenu,
}: {
  accessibleForms: FormWithCount[];
  selectedFormId: string;
  onSelectForm: (formId: string) => void;
  unreadCountByFormId: Record<string, number>;
  allSignalsCount: number;
  totalUnreadCount: number;
  activeScopeLabel: string;
  allSignalNodesLabel: string;
  responseDeadlineLabels: ResponseDeadlineLabels;
  onExportAllFormCsv: (formId: string) => void;
  closeMenu: () => void;
}) {
  const { t } = useI18n();
  const unregisteredCount = accessibleForms.filter(hasUnregisteredWalrusNode).length;
  const allNodesWarningTitle =
    unregisteredCount > 0
      ? t("projectRecoveryNoticeWalrusOnlyBody", { count: unregisteredCount })
      : "";
  return (
    <div className="form-stream-list">
      <div className={`form-stream-item ${selectedFormId === "all" ? "is-active" : ""}`}>
        <button
          type="button"
          className="form-stream-select"
          onClick={() => {
            onSelectForm("all");
            closeMenu();
          }}
        >
          <span className="form-stream-heading">
            <strong>
              {allSignalNodesLabel}
              {unregisteredCount > 0 ? <WarningTriangle title={allNodesWarningTitle} /> : null}
            </strong>
            <span className="form-stream-count">{allSignalsCount}</span>
          </span>
          <p className="muted">{t("signalsAcrossEveryFormInbox", { count: allSignalsCount })}</p>
        </button>
        <div className="form-stream-actions">
          <span className="signal-chip">{t("unreadBadge", { count: totalUnreadCount })}</span>
          <span className="signal-chip signal-chip-soft">{activeScopeLabel}</span>
        </div>
      </div>
      {accessibleForms.map((form) => {
        const isSelected = selectedFormId === form.id;
        const unreadCount = unreadCountByFormId[form.id] ?? 0;
        const ownerLabel = form.ownerAddress ? shortAddress(form.ownerAddress) : t("legacyDemoForm");
        const deadlineValue = formatResponseDeadline(form.responseDeadline, responseDeadlineLabels);
        const hasWarning = hasUnregisteredWalrusNode(form);
        const warningTitle = hasWarning
          ? t("projectRecoveryNoticeWalrusOnlyBody", { count: 1 })
          : "";
        return (
          <div key={form.id} className={`form-stream-item ${isSelected ? "is-active" : ""} ${hasWarning ? "has-warning" : ""}`}>
            <button
              type="button"
              className="form-stream-select"
              onClick={() => {
                onSelectForm(form.id);
                closeMenu();
              }}
            >
              <span className="form-stream-heading">
                <strong>
                  {form.title}
                  {hasWarning ? <WarningTriangle title={warningTitle} /> : null}
                </strong>
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
              {form.projectId ? <span className="signal-chip signal-chip-soft">{t("projectLinkedLabel")}</span> : null}
              <button
                type="button"
                className="ghost-button form-stream-export-button"
                onClick={() => onExportAllFormCsv(form.id)}
                disabled={form.submissionCount === 0}
                aria-label={t("exportAllFormCsvAria")}
                title={t("exportAllFormCsvAria")}
              >
                <CsvFileIcon />
                <span>{t("exportAllFormCsv")}</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SignalChannelSelector({
  accessibleForms,
  selectedFormId,
  onSelectForm,
  unreadCountByFormId,
  allSignalsCount,
  totalUnreadCount,
  activeScopeLabel,
  allSignalNodesLabel,
  responseDeadlineLabels,
  openNodeDirectoryLabel,
  onOpenNodeDirectory,
  activeNodeSummary,
  onExportAllFormCsv,
  className = "",
}: SignalChannelSelectorProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const hasUnreadSignals = totalUnreadCount > 0;
  const unregisteredCount = accessibleForms.filter(hasUnregisteredWalrusNode).length;
  const selectedForm = accessibleForms.find((form) => form.id === selectedFormId) ?? null;
  const selectedCount = selectedFormId === "all" ? allSignalsCount : selectedForm?.submissionCount ?? 0;
  const selectedUnreadCount = selectedFormId === "all" ? totalUnreadCount : unreadCountByFormId[selectedFormId] ?? 0;
  const selectedHasWarning =
    selectedFormId === "all" ? unregisteredCount > 0 : selectedForm ? hasUnregisteredWalrusNode(selectedForm) : false;
  const selectedWarningTitle =
    selectedFormId === "all"
      ? t("projectRecoveryNoticeWalrusOnlyBody", { count: unregisteredCount })
      : t("projectRecoveryNoticeWalrusOnlyBody", { count: 1 });

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  return (
    <div ref={shellRef} className={`signal-channel-selector ${className}`.trim()}>
      <button
        type="button"
        className={`signal-channel-trigger ${menuOpen ? "is-open" : ""}`}
        onClick={() => setMenuOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <span className="signal-channel-trigger-copy">
          <span className="signal-channel-trigger-label">{t("formsTitle")}</span>
          <strong>
            {activeScopeLabel}
            {selectedHasWarning ? <WarningTriangle title={selectedWarningTitle} /> : null}
          </strong>
          <span className="signal-channel-trigger-meta">
            <span>{t("resultsLabel", { count: selectedCount })}</span>
            <span>{t("unreadBadge", { count: selectedUnreadCount })}</span>
          </span>
        </span>
        <ChannelSelectorCaret />
      </button>
      {menuOpen ? (
        <div className="signal-channel-menu panel" role="menu" aria-label={allSignalNodesLabel}>
          <div className="signal-channel-menu-header">
            <div>
              <p className="eyebrow">{t("signalInboxTitle")}</p>
              <h3>{t("formsTitle")}</h3>
            </div>
            {hasUnreadSignals ? (
              <span className="signal-new-count" aria-label={t("unreadBadge", { count: totalUnreadCount })}>
                {totalUnreadCount}
              </span>
            ) : null}
          </div>
          <SignalChannelSelectorItem
            accessibleForms={accessibleForms}
            selectedFormId={selectedFormId}
            onSelectForm={onSelectForm}
            unreadCountByFormId={unreadCountByFormId}
            allSignalsCount={allSignalsCount}
            totalUnreadCount={totalUnreadCount}
            activeScopeLabel={activeScopeLabel}
            allSignalNodesLabel={allSignalNodesLabel}
            responseDeadlineLabels={responseDeadlineLabels}
            onExportAllFormCsv={onExportAllFormCsv}
            closeMenu={() => setMenuOpen(false)}
          />
          <div className="signal-channel-menu-footer">
            <div className="signal-node-summary">
              <div className="signal-node-summary-copy">
                <strong>
                  {activeScopeLabel}
                  {unregisteredCount > 0 ? (
                    <WarningTriangle title={t("projectRecoveryNoticeWalrusOnlyBody", { count: unregisteredCount })} />
                  ) : null}
                </strong>
                <p className="muted">{activeNodeSummary}</p>
              </div>
              <button
                type="button"
                className="primary-button signal-node-directory-trigger"
                onClick={() => {
                  onOpenNodeDirectory();
                  setMenuOpen(false);
                }}
              >
                {openNodeDirectoryLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SignalStreamsNav({
  streamItems,
  selectedStreamId,
  onSelectStream,
  visibleUnreadCount,
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
        <div className="stream-list stream-group stream-group-flow">
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
        <div className="stream-subsection stream-group stream-group-chain">
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
    </aside>
  );
}
