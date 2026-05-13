import { useCurrentAccount } from "@mysten/dapp-kit";
import { NavLink } from "react-router-dom";
import { useAccessControl } from "../hooks/useAccessControl";
import { useI18n } from "../i18n";
import { canReview } from "../lib/adminAccess";

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

  if (capabilityProfile.isConfigured && !canReview(capabilityProfile)) {
    return null;
  }

  return (
    <>
      <NavLink to="/admin">{t("navLab")}</NavLink>
      <NavLink to="/admin/access">{t("navAccess")}</NavLink>
    </>
  );
}
