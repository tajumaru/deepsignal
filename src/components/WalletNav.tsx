import { useCurrentAccount } from "@mysten/dapp-kit";
import { NavLink } from "react-router-dom";
import { useAccessControl } from "../hooks/useAccessControl";
import { useI18n } from "../i18n";
import { canAdmin } from "../lib/adminAccess";

export function WalletNav() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const { capabilityProfile, isLoadingAccess } = useAccessControl(account?.address);

  if (!account?.address) {
    return null;
  }

  if (isLoadingAccess) {
    return null;
  }

  const hasAdminAccess = canAdmin(capabilityProfile);
  const inboxPath = hasAdminAccess ? "/admin" : "/dashboard";

  return (
    <>
      <NavLink to={inboxPath}>{t("navLab")}</NavLink>
      {hasAdminAccess ? <NavLink to="/admin/access">{t("navAccess")}</NavLink> : null}
    </>
  );
}
