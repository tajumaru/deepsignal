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
  title = "Operations Status Rail",
  items,
  nextActionLabel,
  nextActionDetail,
  nextActionCta,
}: OperationsStatusRailProps) {
  return (
    <section className="panel operations-rail-card">
      <div className="operations-rail-header">
        <div>
          <p className="eyebrow">Private Signal Operations Console</p>
          <h2>{title}</h2>
        </div>
        <section className="operations-next-action" aria-label="Next Recommended Action">
          <span className="operations-next-action-label">Next Recommended Action</span>
          <strong>{nextActionLabel}</strong>
          <p>{nextActionDetail}</p>
          {nextActionCta ? <div className="operations-next-action-cta">{nextActionCta}</div> : null}
        </section>
      </div>

      <div className="operations-rail" role="list" aria-label={title}>
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
    </section>
  );
}
