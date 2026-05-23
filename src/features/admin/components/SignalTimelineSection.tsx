import { useI18n } from "../../../i18n";
import { formatDate, formatRelativeTime } from "../../../lib/utils";
import type { ReactNode } from "react";

type SignalTimelinePhase = "intake" | "review" | "escalation" | "published" | "resolved";

interface SignalTimelineEntry {
  id: string;
  title: string;
  detail?: string;
  timestamp: string;
  phase: SignalTimelinePhase;
  order: number;
}

interface SignalTimelineCurrentState {
  title: string;
  detail?: string;
  phase: SignalTimelinePhase;
}

interface SignalTimelineSectionProps {
  open: boolean;
  onToggle: () => void;
  entries: SignalTimelineEntry[];
  currentState: SignalTimelineCurrentState | null;
  timelineNow: number;
  getPhaseLabel: (phase: SignalTimelinePhase) => string;
}

function SectionToggle({
  eyebrow,
  title,
  detail,
  open,
  onToggle,
  trailing,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  open: boolean;
  onToggle: () => void;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`workspace-section-toggle ${open ? "is-open" : ""}`}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className="workspace-section-toggle-copy">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <strong>{title}</strong>
        {detail ? <span className="muted">{detail}</span> : null}
      </span>
      <span className="workspace-section-toggle-side">
        {trailing}
        <span className="workspace-section-toggle-icon" aria-hidden="true">
          {open ? "-" : "+"}
        </span>
      </span>
    </button>
  );
}

export function SignalTimelineSection({
  open,
  onToggle,
  entries,
  currentState,
  timelineNow,
  getPhaseLabel,
}: SignalTimelineSectionProps) {
  const { t } = useI18n();

  return (
    <section className="answer-card review-secondary-card signal-timeline-section">
      <SectionToggle
        eyebrow={t("signalTimelineEyebrow")}
        title={t("signalTimelineTitle")}
        detail={t("signalTimelineBody")}
        open={open}
        onToggle={onToggle}
        trailing={(
          <span className="signal-chip signal-chip-soft">
            {t("signalTimelineCount", { count: entries.length })}
          </span>
        )}
      />
      {open ? (
        <div className="signal-timeline-panel">
          {currentState ? (
            <div className={`signal-timeline-current-state is-${currentState.phase}`}>
              <div className="signal-timeline-current-head">
                <span className="signal-timeline-current-label">{t("signalTimelineCurrentStateLabel")}</span>
                <span className={`signal-timeline-phase-pill is-${currentState.phase}`}>
                  {getPhaseLabel(currentState.phase)}
                </span>
              </div>
              <strong>{currentState.title}</strong>
              {currentState.detail ? <p className="muted">{currentState.detail}</p> : null}
            </div>
          ) : null}
          <p className="muted signal-timeline-derived-note">{t("signalTimelineDerivedHint")}</p>
          <div className="signal-timeline-list" aria-label={t("signalTimelineTitle")}>
            {entries.map((entry, index) => {
              const isCurrent = index === entries.length - 1;
              return (
                <article
                  key={entry.id}
                  className={`signal-timeline-item ${isCurrent ? "is-current" : "is-past"} is-${entry.phase}`}
                >
                  <span className={`signal-timeline-marker is-${entry.phase}`} aria-hidden="true" />
                  <div className="signal-timeline-card">
                    <div className="signal-timeline-card-header">
                      <strong>{entry.title}</strong>
                      <div className="signal-timeline-meta">
                        <span className={`signal-timeline-phase-pill is-${entry.phase}`}>
                          {getPhaseLabel(entry.phase)}
                        </span>
                        <time dateTime={entry.timestamp} title={formatDate(entry.timestamp)}>
                          {formatRelativeTime(entry.timestamp, timelineNow)}
                        </time>
                      </div>
                    </div>
                    {entry.detail ? <p className="muted signal-timeline-detail">{entry.detail}</p> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

