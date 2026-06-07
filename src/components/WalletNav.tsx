import { Link, NavLink, useLocation } from "react-router-dom";
import { useI18n } from "../i18n";
import { isSignalInboxPath } from "../lib/navigation";
import { useOptionalWalletConnection } from "../walletStatus";
import { NavItemLabel } from "./NavIcons";

interface WalletNavProps {
  section?: "all" | "inbox" | "access";
  onNavigate?: () => void;
}

export function WalletNav({ section = "all", onNavigate }: WalletNavProps) {
  const { t } = useI18n();
  const location = useLocation();
  const walletConnection = useOptionalWalletConnection();

  const inboxActive = isSignalInboxPath(location.pathname);
  const inboxNav = (
    <Link
      className={inboxActive ? "active" : undefined}
      aria-current={inboxActive ? "page" : undefined}
      to="/admin"
      onClick={onNavigate}
    >
      <NavItemLabel>{t("navLab")}</NavItemLabel>
    </Link>
  );

  if (section === "inbox") {
    return inboxNav;
  }

  if (section === "access") {
    if (!walletConnection.accountAddress) {
      return null;
    }
    return (
      <NavLink to="/admin/access" onClick={onNavigate}>
        <NavItemLabel>{t("navAccess")}</NavItemLabel>
      </NavLink>
    );
  }

  return (
    <>
      {inboxNav}
      {walletConnection.accountAddress ? (
        <NavLink to="/admin/access" onClick={onNavigate}>
          <NavItemLabel>{t("navAccess")}</NavItemLabel>
        </NavLink>
      ) : null}
    </>
  );
}
