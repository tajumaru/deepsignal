import { useCurrentAccount } from "@mysten/dapp-kit";
import { NavLink } from "react-router-dom";
import { useI18n } from "../i18n";

export function WalletNav() {
  const { t } = useI18n();
  const account = useCurrentAccount();

  if (!account?.address) {
    return null;
  }

  return (
    <>
      <NavLink to="/admin">{t("navLab")}</NavLink>
      <NavLink to="/admin/access">{t("navAccess")}</NavLink>
    </>
  );
}
