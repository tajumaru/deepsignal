import { lazy, Suspense, useState, type PropsWithChildren } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { CreateFormLink } from "./CreateFormLink";
import { WalletSurface } from "./WalletSurface";
import { BuildIndicator } from "./system/BuildIndicator";
import { useI18n } from "../i18n";
import { retryLazyImport } from "../lib/lazyRetry";

const WalletConnect = lazy(() =>
  retryLazyImport(() => import("./WalletConnect")).then((module) => ({ default: module.WalletConnect })),
);
const WalletNav = lazy(() =>
  retryLazyImport(() => import("./WalletNav")).then((module) => ({ default: module.WalletNav })),
);

interface AppShellProps extends PropsWithChildren {
  walletAvailable?: boolean;
  chrome?: "full" | "public";
}

function WalletConnectPlaceholder({ onActivate }: { onActivate: () => void }) {
  return (
    <div className="wallet-connect-shell wallet-connect-shell-compact">
      <div className="wallet-connect-direct panel">
        <div className="wallet-connect-direct-copy">
          <strong>Sync Wallet</strong>
          <span>Wallet-optional public mode</span>
        </div>
        <button type="button" className="wallet-sync-button" onClick={onActivate}>
          Sync Wallet
        </button>
      </div>
    </div>
  );
}

function useWalletChrome(walletAvailable: boolean) {
  const [walletRequested, setWalletRequested] = useState(false);
  const fallback = <div className="wallet-connect-shell wallet-connect-shell-compact" />;

  if (!walletAvailable && !walletRequested) {
    return {
      inboxNav: null,
      accessNav: null,
      connect: <WalletConnectPlaceholder onActivate={() => setWalletRequested(true)} />,
    };
  }

  if (walletAvailable) {
    return {
      inboxNav: (
        <Suspense fallback={null}>
          <WalletNav section="inbox" />
        </Suspense>
      ),
      accessNav: (
        <Suspense fallback={null}>
          <WalletNav section="access" />
        </Suspense>
      ),
      connect: (
        <Suspense fallback={fallback}>
          <WalletConnect compact />
        </Suspense>
      ),
    };
  }

  return {
    inboxNav: (
      <WalletSurface fallback={null}>
        <Suspense fallback={null}>
          <WalletNav section="inbox" />
        </Suspense>
      </WalletSurface>
    ),
    accessNav: (
      <WalletSurface fallback={null}>
        <Suspense fallback={null}>
          <WalletNav section="access" />
        </Suspense>
      </WalletSurface>
    ),
    connect: (
      <WalletSurface fallback={fallback}>
        <Suspense fallback={fallback}>
          <WalletConnect compact />
        </Suspense>
      </WalletSurface>
    ),
  };
}

function MobileAppBottomNav() {
  const location = useLocation();
  const { t } = useI18n();
  const inboxActive =
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/dashboard");

  return (
    <nav className="mobile-inbox-bottom-nav" aria-label="Mobile workspace navigation">
      <Link className={inboxActive ? "is-active" : undefined} to="/dashboard">
        <span aria-hidden="true">In</span>
        <span>{t("navMobileInbox")}</span>
      </Link>
      <NavLink to="/explore">
        <span aria-hidden="true">Ex</span>
        <span>{t("navExplore")}</span>
      </NavLink>
      <CreateFormLink>
        <span aria-hidden="true">+</span>
        <span>{t("navMobileNewSignal")}</span>
      </CreateFormLink>
      <NavLink to="/admin/access">
        <span aria-hidden="true">Set</span>
        <span>{t("navMobileSettings")}</span>
      </NavLink>
    </nav>
  );
}

export function AppShell({ children, walletAvailable = false, chrome = "full" }: AppShellProps) {
  const { language, setLanguage, t } = useI18n();
  const location = useLocation();
  const walletChrome = useWalletChrome(walletAvailable);
  const publicChrome = chrome === "public";
  const showMobileBottomNav =
    !publicChrome &&
    (location.pathname === "/explore" ||
      location.pathname === "/admin" ||
      location.pathname.startsWith("/admin/") ||
      location.pathname === "/dashboard" ||
      location.pathname.startsWith("/dashboard/"));

  const shell = (
    <div className={`app-shell ${showMobileBottomNav ? "has-mobile-bottom-nav" : ""}`}>
      <div className="bg-orb bg-orb-a" />
      <div className="bg-orb bg-orb-b" />
      <header className={`topbar panel ${publicChrome ? "topbar-public" : ""}`}>
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            <img src="/deepsignal-mark.svg" alt="" />
          </span>
          <div className="brand-copy">
            <strong>DeepSignal</strong>
            <p>{t("brandTagline")}</p>
          </div>
        </Link>
        {publicChrome ? null : (
          <nav className="topnav">
            <NavLink to="/">{t("navHome")}</NavLink>
            <CreateFormLink nav>{t("navCreateForm")}</CreateFormLink>
            {walletChrome.inboxNav}
            <NavLink to="/explore">{t("navExplore")}</NavLink>
            {walletChrome.accessNav}
            <NavLink to="/troubleshooting">{t("navTroubleshooting")}</NavLink>
          </nav>
        )}
        <div className="topbar-actions">
          {publicChrome ? null : walletChrome.connect}
          <label className="language-switch">
            <span>{t("languageLabel")}</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as "en" | "ja")}
            >
              <option value="en">{t("languageEnglish")}</option>
              <option value="ja">{t("languageJapanese")}</option>
            </select>
          </label>
        </div>
      </header>
      <main className="page-wrap">{children}</main>
      {showMobileBottomNav ? <MobileAppBottomNav /> : null}
      <BuildIndicator />
    </div>
  );

  return shell;
}
