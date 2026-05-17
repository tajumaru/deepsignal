import type { ReactNode } from "react";
import { useI18n } from "../i18n";

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
  title,
  items,
  nextActionLabel,
  nextActionDetail,
  nextActionCta,
}: OperationsStatusRailProps) {
  const { t } = useI18n();
  const resolvedTitle = title ?? t("reviewQueueTitle");

  return (
    <section className="panel operations-rail-card">
      <div className="operations-rail-header">
        <div className="operations-rail-summary">
          <div>
            <p className="eyebrow">{t("encryptedSignalInboxLabel")}</p>
            <h2>{resolvedTitle}</h2>
          </div>
          <div className="operations-rail-strip" role="list" aria-label={t("reviewQueueStatusAria")}>
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
        <section className="operations-next-action" aria-label={t("nextReviewActionLabel")}>
          <span className="operations-next-action-label">{t("nextReviewActionLabel")}</span>
          <strong>{nextActionLabel}</strong>
          <p>{nextActionDetail}</p>
          {nextActionCta ? <div className="operations-next-action-cta">{nextActionCta}</div> : null}
        </section>
      </div>

      <details className="operations-system-details">
        <summary>
          <span>
            <p className="eyebrow">{t("systemDetailsLabel")}</p>
            <h3>{t("openOperationalDetailsTitle")}</h3>
          </span>
        </summary>
        <div className="operations-rail" role="list" aria-label={t("systemDetailsLabel")}>
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
