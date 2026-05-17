import { useCurrentAccount } from "@mysten/dapp-kit";
import { AdminAccessGate } from "../components/AdminAccessGate";
import { AccessManagementSection } from "../components/AccessManagementSection";
import { useAccessControl } from "../hooks/useAccessControl";
import { useI18n } from "../i18n";
import { getAdminSurfaceAccessState } from "../lib/adminAccess";

export function AccessManagementPage() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const {
    capabilityProfile,
    refetch: refetchCapabilities,
    isLoadingAccess,
  } = useAccessControl(account?.address);
  const accessState = getAdminSurfaceAccessState(
    "reviewer",
    account?.address,
    capabilityProfile,
  );

  if (isLoadingAccess) {
    return <div className="panel">{t("loadingAccessManagement")}</div>;
  }

  return (
    <AdminAccessGate
      hasWallet={Boolean(account?.address)}
      access={accessState}
      deniedBody={
        capabilityProfile.isConfigured
          ? "メンバー管理にアクセスするには OwnerCap / AdminCap / ReviewerCap が必要です。"
          : undefined
      }
    >
      <section className="stack">
        <div className="panel glow-panel inbox-shell-header">
          <div>
            <p className="eyebrow">{t("accessManagementEyebrow")}</p>
            <h1>{t("accessManagementTitle")}</h1>
            <p className="lede">{t("accessManagementDescription")}</p>
          </div>
        </div>

        {capabilityProfile.isConfigured ? (
          <AccessManagementSection
            capabilityProfile={capabilityProfile}
            onToast={() => undefined}
            onRefreshCapabilities={refetchCapabilities}
          />
        ) : (
          <section className="panel access-management-panel">
            <p className="muted">{t("accessManagementNotConfigured")}</p>
          </section>
        )}
      </section>
    </AdminAccessGate>
  );
}
