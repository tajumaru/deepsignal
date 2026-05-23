import { EmptyState } from "../../../components/EmptyState";
import { SuiAddressDisplay } from "../../../components/SuiAddressDisplay";
import { useI18n } from "../../../i18n";
import { getSuiTransactionUrl } from "../../../lib/activityLog";
import { shortAddress } from "../../../lib/sui";
import { formatDate } from "../../../lib/utils";
import type { ActivityAction, ActivityEvent } from "../../../types";

function getActivityActionLabel(action: ActivityAction, t: ReturnType<typeof useI18n>["t"]) {
  switch (action) {
    case "form_created":
      return t("activityActionCreated");
    case "form_published":
      return t("activityActionPublished");
    case "form_updated":
      return t("activityActionUpdated");
    case "form_archived":
      return t("activityActionArchived");
    default:
      return t("activityActionUpdated");
  }
}

function getActivityActionClass(action: ActivityAction) {
  switch (action) {
    case "form_created":
      return "created";
    case "form_published":
      return "published";
    case "form_updated":
      return "updated";
    case "form_archived":
      return "archived";
    default:
      return "updated";
  }
}

interface WorkspaceActivityLogProps {
  events: ActivityEvent[];
}

export function WorkspaceActivityLog({ events }: WorkspaceActivityLogProps) {
  const { t } = useI18n();

  return (
    <section className="panel workspace-activity-panel">
      <div className="signal-workbench-header">
        <div className="signal-workbench-copy">
          <p className="eyebrow">{t("activityEyebrow")}</p>
          <h2>{t("workspaceActivityTitle")}</h2>
          <p className="muted">{t("workspaceActivityBody")}</p>
        </div>
        <div className="signal-workbench-summary">
          <span className="signal-chip">{t("activityEventsCount", { count: events.length })}</span>
        </div>
      </div>

      {events.length === 0 ? (
        <EmptyState>
          <h2>{t("activityEmptyTitle")}</h2>
          <p>{t("activityEmptyBody")}</p>
        </EmptyState>
      ) : (
        <div className="workspace-activity-timeline" aria-label={t("workspaceActivityTitle")}>
          {events.map((event) => {
            const actionClass = getActivityActionClass(event.action);
            const actionLabel = getActivityActionLabel(event.action, t);
            const txUrl = getSuiTransactionUrl(event.txDigest);

            return (
              <article key={event.id} className="workspace-activity-row">
                <span className={`workspace-activity-dot is-${actionClass}`} aria-hidden="true" />
                <div className="workspace-activity-main">
                  <div className="workspace-activity-line">
                    {event.actorAddress ? (
                      <SuiAddressDisplay
                        address={event.actorAddress}
                        className="workspace-activity-address"
                        showTooltip
                      />
                    ) : (
                      <strong>{t("unknownActor")}</strong>
                    )}
                    <span className={`activity-badge is-${actionClass}`}>{actionLabel}</span>
                    <span>{event.formTitleSnapshot}</span>
                  </div>
                  <div className="workspace-activity-meta">
                    <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
                    <span>{event.actorRole}</span>
                    <span>{t("activityFormId", { id: shortAddress(event.formId) })}</span>
                    {txUrl ? (
                      <a href={txUrl} target="_blank" rel="noreferrer">
                        {t("suiExplorerLabel")}
                      </a>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
