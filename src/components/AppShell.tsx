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
      nav: null,
      connect: <WalletConnectPlaceholder onActivate={() => setWalletRequested(true)} />,
    };
  }

  if (walletAvailable) {
    return {
      nav: (
        <Suspense fallback={null}>
          <WalletNav />
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
    nav: (
      <WalletSurface fallback={null}>
        <Suspense fallback={null}>
          <WalletNav />
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
  const inboxActive =
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/dashboard");

  return (
    <nav className="mobile-inbox-bottom-nav" aria-label="Mobile workspace navigation">
      <Link className={inboxActive ? "is-active" : undefined} to="/dashboard">
        <span aria-hidden="true">In</span>
        <span>Inbox</span>
      </Link>
      <NavLink to="/explore">
        <span aria-hidden="true">Ex</span>
        <span>Explore</span>
      </NavLink>
      <CreateFormLink>
        <span aria-hidden="true">+</span>
        <span>Create</span>
      </CreateFormLink>
      <NavLink to="/admin/access">
        <span aria-hidden="true">Set</span>
        <span>Settings</span>
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
    !publicChrome && ["/dashboard", "/admin", "/explore"].includes(location.pathname);

  const shell = (
    <div className={`app-shell ${showMobileBottomNav ? "has-mobile-bottom-nav" : ""}`}>
      <div className="bg-orb bg-orb-a" />
      <div className="bg-orb bg-orb-b" />
      <header className={`topbar panel ${publicChrome ? "topbar-public" : ""}`}>
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            <img src="/deepsignal-icon.webp" alt="" />
          </span>
          <div className="brand-copy">
            <strong>DeepSignal</strong>
            <p>{t("brandTagline")}</p>
          </div>
        </Link>
        {publicChrome ? null : (
          <nav className="topnav">
            <NavLink to="/">{t("navHome")}</NavLink>
            <NavLink to="/explore">{t("navExplore")}</NavLink>
            {walletChrome.nav}
            <CreateFormLink nav>{t("navCreateForm")}</CreateFormLink>
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
