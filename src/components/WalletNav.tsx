import { useCurrentAccount } from "@mysten/dapp-kit";
import { NavLink } from "react-router-dom";
import { useAccessControl } from "../hooks/useAccessControl";
import { useI18n } from "../i18n";

export function WalletNav() {
  const { t } = useI18n();
  const account = useCurrentAccount();
  const { capabilityProfile, isLoadingAccess } = useAccessControl(account?.address);

  if (!account?.address) {
    return null;
  }

  const hasAdminAccess = !isLoadingAccess && Boolean(capabilityProfile.hasOwnerCap || capabilityProfile.hasAdminCap);

  return (
    <>
      <NavLink to="/admin">{t("navLab")}</NavLink>
      {hasAdminAccess ? <NavLink to="/admin/access">{t("navAccess")}</NavLink> : null}
    </>
  );
}
