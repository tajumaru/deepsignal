import { formatResponseDeadline, type ResponseDeadlineLabels } from "../../../lib/responseDeadline";
import type { FormWithCount, StreamId } from "../hooks/useSignalInboxData";

interface StreamItem {
  id: StreamId;
  label: string;
  count: number;
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
  responseDeadlineLabel: string;
  responseDeadlineLabels: ResponseDeadlineLabels;
  openNodeDirectoryLabel: string;
  onOpenNodeDirectory: () => void;
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
  responseDeadlineLabel,
  responseDeadlineLabels,
  openNodeDirectoryLabel,
  onOpenNodeDirectory,
}: SignalStreamsNavProps) {
  return (
    <aside className="panel signal-sidebar">
      <div className="signal-sidebar-section">
        <div>
          <p className="eyebrow">Streams</p>
          <h2>Streams</h2>
        </div>
        <div className="stream-list">
          {streamItems.map((stream) => (
            <button
              key={stream.id}
              type="button"
              className={`stream-item ${selectedStreamId === stream.id ? "is-active" : ""}`}
              onClick={() => onSelectStream(stream.id)}
            >
              <span>{stream.label}</span>
              <strong>{stream.count}</strong>
            </button>
          ))}
        </div>
      </div>

      <div className="signal-sidebar-section">
        <div className="section-row">
          <p className="eyebrow">Forms</p>
          <span className="muted">{accessibleForms.length}</span>
        </div>
        <div className="form-stream-list">
          <button
            type="button"
            className={`form-stream-item ${selectedFormId === "all" ? "is-active" : ""}`}
            onClick={() => onSelectForm("all")}
          >
            <div className="form-stream-select">
              <strong>{allSignalNodesLabel}</strong>
              <p className="muted">{allSignalsCount} signals across every form inbox.</p>
            </div>
            <div className="form-stream-actions">
              <span className="signal-chip">{visibleUnreadCount} unread</span>
              <span className="signal-chip signal-chip-soft">{allSignalsCount} total</span>
            </div>
          </button>
          {accessibleForms.map((form) => {
            const isSelected = selectedFormId === form.id;
            const unreadCount = unreadCountByFormId[form.id] ?? 0;
            return (
              <button
                key={form.id}
                type="button"
                className={`form-stream-item ${isSelected ? "is-active" : ""}`}
                onClick={() => onSelectForm(form.id)}
              >
                <div className="form-stream-select">
                  <strong>{form.title}</strong>
                  <p className="muted">
                    {form.submissionCount} signals
                    {form.encryptSubmissions ? " · protected inbox" : " · open inbox"}
                  </p>
                  <p className="muted">{responseDeadlineLabel}: {formatResponseDeadline(form.responseDeadline, responseDeadlineLabels)}</p>
                </div>
                <div className="form-stream-actions">
                  <span className="signal-chip">{unreadCount} unread</span>
                  {form.projectId ? (
                    <span className="signal-chip signal-chip-soft">Project linked</span>
                  ) : null}
                </div>
              </button>
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
