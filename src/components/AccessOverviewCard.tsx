import { Link } from "react-router-dom";
import type { CapabilityProfile } from "../hooks/useAccessControl";
import { useAccessRegistry } from "../hooks/useAccessRegistry";
import { useI18n } from "../i18n";
import { getRoleLabel } from "../lib/adminAccess";

interface AccessOverviewCardProps {
  capabilityProfile: CapabilityProfile;
  manageHref: string;
}

export function AccessOverviewCard({
  capabilityProfile,
  manageHref,
}: AccessOverviewCardProps) {
  const { t } = useI18n();
  const { registry, refetch, isLoadingRegistry } = useAccessRegistry();

  return (
    <section className="panel access-overview-card">
      <div className="section-row">
        <div>
          <p className="eyebrow">{t("accessManagementEyebrow")}</p>
          <h2>{t("accessOverviewTitle")}</h2>
          <p className="muted">{t("accessOverviewBody")}</p>
        </div>
        <div className="access-overview-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => void refetch()}
            disabled={isLoadingRegistry}
          >
            {isLoadingRegistry ? t("refreshingLabel") : t("refreshRegistry")}
          </button>
          <Link className="primary-button" to={manageHref}>
            {t("manageMembers")}
          </Link>
        </div>
      </div>

      <div className="access-management-summary">
        <span className="signal-chip">
          {t("connectedRoleLabel")}: {getRoleLabel(capabilityProfile)}
        </span>
        <span className="signal-chip">{t("ownersCount", { count: registry.owner ? 1 : 0 })}</span>
        <span className="signal-chip">{t("adminsCount", { count: registry.admins.length })}</span>
        <span className="signal-chip">
          {t("reviewersCount", { count: registry.reviewers.length })}
        </span>
      </div>
    </section>
  );
}
