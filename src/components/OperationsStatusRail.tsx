import type { ReactNode } from "react";

export interface OperationsStatusItem {
  label: string;
  tone: "ready" | "pending" | "warning" | "action";
  detail: string;
}

interface OperationsStatusRailProps {
  title?: string;
  items: OperationsStatusItem[];
  nextActionLabel: string;
  nextActionDetail: string;
  nextActionCta?: ReactNode;
}

export function OperationsStatusRail({
  title = "Review Queue",
  items,
  nextActionLabel,
  nextActionDetail,
  nextActionCta,
}: OperationsStatusRailProps) {
  return (
    <section className="panel operations-rail-card">
      <div className="operations-rail-header">
        <div className="operations-rail-summary">
          <div>
            <p className="eyebrow">Encrypted Signal Inbox</p>
            <h2>{title}</h2>
          </div>
          <div className="operations-rail-strip" role="list" aria-label="Review queue status">
            {items.map((item) => (
              <article
                key={item.label}
                className={`operations-strip-pill is-${item.tone}`}
                role="listitem"
              >
                <span className="operations-status-dot" aria-hidden="true" />
                <strong>{item.label}</strong>
              </article>
            ))}
          </div>
        </div>
        <section className="operations-next-action" aria-label="Next review action">
          <span className="operations-next-action-label">Next review action</span>
          <strong>{nextActionLabel}</strong>
          <p>{nextActionDetail}</p>
          {nextActionCta ? <div className="operations-next-action-cta">{nextActionCta}</div> : null}
        </section>
      </div>

      <details className="operations-system-details">
        <summary>
          <span>
            <p className="eyebrow">System Details</p>
            <h3>Open operational details</h3>
          </span>
        </summary>
        <div className="operations-rail" role="list" aria-label="System details">
          {items.map((item) => (
            <article
              key={item.label}
              className={`operations-status-chip is-${item.tone}`}
              role="listitem"
            >
              <span className="operations-status-dot" aria-hidden="true" />
              <div className="operations-status-copy">
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}
