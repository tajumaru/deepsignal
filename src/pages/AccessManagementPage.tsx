import { AdminAccessGate } from "../components/AdminAccessGate";
import { AdminWorkspaceTabs } from "../components/AdminWorkspaceTabs";
import { AccessManagementSection } from "../components/AccessManagementSection";
import { useAccessControl } from "../hooks/useAccessControl";
import { useSuiWallet } from "../hooks/useSuiWallet";
import { useI18n } from "../i18n";
import { getAdminSurfaceAccessState } from "../lib/adminAccess";

export function AccessManagementPage() {
  const { t } = useI18n();
  const wallet = useSuiWallet();
  const {
    capabilityProfile,
    refetch: refetchCapabilities,
    isLoadingAccess,
    accessVerificationBlocked,
  } = useAccessControl(wallet.accountAddress);
  const accessState = getAdminSurfaceAccessState(
    "admin",
    wallet.accountAddress,
    capabilityProfile,
  );

  if (isLoadingAccess) {
    return <div className="panel">{t("loadingAccessManagement")}</div>;
  }

  if (accessVerificationBlocked) {
    return (
      <section className="stack">
        <section className="panel glow-panel access-panel">
          <p className="eyebrow">{t("creatorOnlyInbox")}</p>
          <h1>{t("loadingAccessManagement")}</h1>
          <p>Tatum RPC is rate limiting access checks right now, so DeepSignal could not verify your capability objects yet.</p>
          <div className="inline-actions">
            <button type="button" className="ghost-button" onClick={() => void refetchCapabilities()}>
              Retry access check
            </button>
          </div>
        </section>
      </section>
    );
  }

  return (
    <AdminAccessGate
      hasWallet={Boolean(wallet.accountAddress)}
      access={accessState}
      deniedBody={
        capabilityProfile.isConfigured
          ? t("memberManagementCapabilityRequired")
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

        <AdminWorkspaceTabs activeTab="members" />

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
