import { Link, NavLink, useLocation } from "react-router-dom";
import { useAccessControl } from "../hooks/useAccessControl";
import { useSuiWallet } from "../hooks/useSuiWallet";
import { useI18n } from "../i18n";
import { isSignalInboxPath } from "../lib/navigation";
import { AccessControlNavIcon, NavItemLabel, SignalInboxNavIcon } from "./NavIcons";

interface WalletNavProps {
  section?: "all" | "inbox" | "access";
  onNavigate?: () => void;
}

export function WalletNav({ section = "all", onNavigate }: WalletNavProps) {
  const { t } = useI18n();
  const location = useLocation();
  const wallet = useSuiWallet();
  const { capabilityProfile, isLoadingAccess } = useAccessControl(wallet.accountAddress);

  if (!wallet.accountAddress) {
    return null;
  }

  const hasAdminAccess = !isLoadingAccess && Boolean(capabilityProfile.hasOwnerCap || capabilityProfile.hasAdminCap);
  const inboxActive = isSignalInboxPath(location.pathname);
  const inboxNav = (
    <Link
      className={inboxActive ? "active" : undefined}
      aria-current={inboxActive ? "page" : undefined}
      to="/admin"
      onClick={onNavigate}
    >
      <NavItemLabel icon={<SignalInboxNavIcon />}>{t("navLab")}</NavItemLabel>
    </Link>
  );

  if (section === "inbox") {
    return inboxNav;
  }

  if (section === "access") {
    return hasAdminAccess ? (
      <NavLink to="/admin/access" onClick={onNavigate}>
        <NavItemLabel icon={<AccessControlNavIcon />}>{t("navAccess")}</NavItemLabel>
      </NavLink>
    ) : null;
  }

  return (
    <>
      {inboxNav}
      {hasAdminAccess ? (
        <NavLink to="/admin/access" onClick={onNavigate}>
          <NavItemLabel icon={<AccessControlNavIcon />}>{t("navAccess")}</NavItemLabel>
        </NavLink>
      ) : null}
    </>
  );
}
