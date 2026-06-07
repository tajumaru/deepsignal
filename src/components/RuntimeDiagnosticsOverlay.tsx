import { useMemo, useState, useSyncExternalStore } from "react";
import {
  copyRouteLifecycleDiagnosticsToClipboard,
  downloadRouteLifecycleDiagnostics,
  getRecentRuntimeEventsSnapshot,
  subscribeRecentRuntimeEvents,
} from "../lib/routeDiagnostics";

export function RuntimeDiagnosticsOverlay() {
  const recentEvents = useSyncExternalStore(
    subscribeRecentRuntimeEvents,
    getRecentRuntimeEventsSnapshot,
    getRecentRuntimeEventsSnapshot,
  );
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const latestEvents = useMemo(() => [...recentEvents].reverse().slice(0, 40), [recentEvents]);

  async function handleCopyDiagnostics() {
    try {
      const success = await copyRouteLifecycleDiagnosticsToClipboard();
      setCopied(success);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="runtime-diagnostics-toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="runtime-diagnostics-panel"
      >
        Debug
      </button>
      {open ? (
        <aside
          id="runtime-diagnostics-panel"
          className="runtime-diagnostics-panel panel"
          role="dialog"
          aria-modal="false"
          aria-label="Runtime diagnostics"
        >
          <div className="runtime-diagnostics-header">
            <div>
              <strong>Runtime diagnostics</strong>
              <p>{`${recentEvents.length} persisted events`}</p>
            </div>
            <button type="button" className="runtime-diagnostics-close" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <div className="runtime-diagnostics-actions inline-actions">
            <button type="button" className="ghost-button" onClick={() => void handleCopyDiagnostics()}>
              {copied ? "Copied diagnostics" : "Copy diagnostics"}
            </button>
            <button type="button" className="ghost-button" onClick={() => downloadRouteLifecycleDiagnostics()}>
              Export diagnostics
            </button>
          </div>
          <div className="runtime-diagnostics-log" role="log" aria-live="polite">
            {latestEvents.map((entry, index) => (
              <article key={`${entry.at}-${entry.event}-${index}`} className="runtime-diagnostics-entry">
                <div className="runtime-diagnostics-entry-topline">
                  <strong>{entry.event}</strong>
                  <span>{`${entry.at}ms`}</span>
                </div>
                <p>{entry.kind}</p>
                <pre>{entry.details ? JSON.stringify(entry.details, null, 2) : "{}"}</pre>
              </article>
            ))}
          </div>
        </aside>
      ) : null}
    </>
  );
}
