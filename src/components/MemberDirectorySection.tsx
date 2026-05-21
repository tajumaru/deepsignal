import { useMemo } from "react";
import { useAccessRegistry } from "../hooks/useAccessRegistry";
import type { CapabilityProfile } from "../hooks/useAccessControl";
import { useI18n } from "../i18n";
import type { RegistryRoleEntry } from "../lib/accessRegistry";
import { buildRegistryRows } from "./memberDirectoryRows";
import { SignalMetaChip } from "./SignalMetaChip";

function roleTitle(role: RegistryRoleEntry["role"]) {
  switch (role) {
    case "owner":
      return "accessRoleOwner";
    case "admin":
      return "accessRoleAdmin";
    case "reviewer":
      return "accessRoleReviewer";
    default:
      return role;
  }
}

function profileRoleLabel(profile: CapabilityProfile, t: (key: string) => string) {
  if (profile.hasOwnerCap) {
    return t("accessRoleOwner");
  }
  if (profile.hasAdminCap) {
    return t("accessRoleAdmin");
  }
  if (profile.hasReviewerCap) {
    return t("accessRoleReviewer");
  }
  return profile.isConfigured ? t("accessRoleNone") : t("accessRoleLegacyOwner");
}

function statusLabel(status: RegistryRoleEntry["status"], t: (key: string) => string) {
  return status === "active" ? t("statusActive") : status;
}

export function MemberDirectorySection({
  capabilityProfile,
  readOnly = true,
}: {
  capabilityProfile: CapabilityProfile;
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const { registry, isLoadingRegistry, refetch } = useAccessRegistry();
  const rows = useMemo(() => buildRegistryRows(registry), [registry]);

  return (
    <section className="panel access-management-panel">
      <div className="section-row">
        <div>
          <p className="eyebrow">{t("accessManagementEyebrow")}</p>
          <h2>{readOnly ? t("accessManagementTitle") : t("accessOverviewTitle")}</h2>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => void refetch()}
          disabled={isLoadingRegistry}
        >
          {isLoadingRegistry ? t("refreshingLabel") : t("refreshRegistry")}
        </button>
      </div>

      <div className="access-management-summary">
        <span className="signal-chip">
          {t("connectedRoleLabel")}: {profileRoleLabel(capabilityProfile, t)}
        </span>
        <span className="signal-chip">{t("ownersCount", { count: registry.owner ? 1 : 0 })}</span>
        <span className="signal-chip">{t("adminsCount", { count: registry.admins.length })}</span>
        <span className="signal-chip">{t("reviewersCount", { count: registry.reviewers.length })}</span>
      </div>

      {readOnly ? (
        <p className="muted">{t("reviewerRegistryReadOnlyHint")}</p>
      ) : null}

      <div className="access-role-grid" role="table" aria-label={t("accessRegistryTableLabel")}>
        <div className={`access-role-row access-role-row-header ${readOnly ? "is-read-only" : ""}`} role="row">
          <span className="access-role-cell access-role-cell-address" role="columnheader">{t("addressLabel")}</span>
          <span className="access-role-cell access-role-cell-role" role="columnheader">{t("roleLabel")}</span>
          <span className="access-role-cell access-role-cell-cap" role="columnheader">{t("capObjectIdLabel")}</span>
          <span className="access-role-cell access-role-cell-status" role="columnheader">{t("statusLabel")}</span>
          <span className="access-role-cell access-role-cell-actions" role="columnheader">{readOnly ? t("readOnlyLabel") : t("actionsLabel")}</span>
        </div>
        {rows.map((entry) => (
          <div key={entry.key} className={`access-role-row ${readOnly ? "is-read-only" : ""}`} role="row">
            <span className="access-role-value access-role-cell access-role-cell-address" role="cell" data-label={t("addressLabel")}>
              <span className="access-role-meta">
                <SignalMetaChip type="contributor" value={entry.address} />
              </span>
            </span>
            <span className="access-role-value access-role-cell access-role-cell-role" role="cell" data-label={t("roleLabel")}>
              {t(roleTitle(entry.role))}
            </span>
            <span className="access-role-value access-role-cell access-role-cell-cap" role="cell" data-label={t("capObjectIdLabel")}>
              <span className="access-role-meta">
                <SignalMetaChip type="registry" value={entry.capId} />
              </span>
            </span>
            <span className="access-role-value access-role-cell access-role-cell-status" role="cell" data-label={t("statusLabel")}>
              <span className="signal-chip signal-chip-accent">{statusLabel(entry.status, t)}</span>
            </span>
            <span className="access-role-value access-role-cell access-role-cell-actions" role="cell" data-label={t("actionsLabel")}>
              <span className="muted">{t("readOnlyLabel")}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
