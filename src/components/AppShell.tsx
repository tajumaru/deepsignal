import { lazy, Suspense, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { CreateFormLink } from "./CreateFormLink";
import { NetworkMenu } from "./NetworkMenu";
import { AccessControlNavIcon, CreateSignalNavIcon, MoreNavIcon, NavItemLabel } from "./NavIcons";
import { BuildIndicator } from "./system/BuildIndicator";
import { useI18n } from "../i18n";
import { retryLazyImport } from "../lib/lazyRetry";
import { isSignalInboxPath } from "../lib/navigation";

const WalletConnect = lazy(() =>
  retryLazyImport(() => import("./WalletConnect")).then((module) => ({ default: module.WalletConnect })),
);
const WalletNav = lazy(() =>
  retryLazyImport(() => import("./WalletNav")).then((module) => ({ default: module.WalletNav })),
);

interface AppShellProps extends PropsWithChildren {
  walletAvailable?: boolean;
  onWalletActivate?: () => void;
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

function MenuToggleIcon() {
  return (
    <span className="mobile-menu-toggle-icon" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function useWalletChrome(walletAvailable: boolean, onWalletActivate?: () => void, onNavigate?: () => void) {
  const fallback = <div className="wallet-connect-shell wallet-connect-shell-compact" />;

  if (!walletAvailable) {
    return {
      inboxNav: null,
      accessNav: null,
      connect: <WalletConnectPlaceholder onActivate={() => onWalletActivate?.()} />,
    };
  }

  return {
    inboxNav: (
      <Suspense fallback={null}>
        <WalletNav section="inbox" onNavigate={onNavigate} />
      </Suspense>
    ),
    accessNav: (
      <Suspense fallback={null}>
        <WalletNav section="access" onNavigate={onNavigate} />
      </Suspense>
    ),
    connect: (
      <Suspense fallback={fallback}>
        <WalletConnect compact />
      </Suspense>
    ),
  };
}

function MobileAppBottomNav() {
  const location = useLocation();
  const { t } = useI18n();
  const inboxActive = isSignalInboxPath(location.pathname);

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

export function AppShell({
  children,
  walletAvailable = false,
  onWalletActivate,
  chrome = "full",
}: AppShellProps) {
  const { language, setLanguage, t } = useI18n();
  const location = useLocation();
  const publicChrome = chrome === "public";
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const walletChrome = useWalletChrome(walletAvailable, onWalletActivate, () => setMobileDrawerOpen(false));
  const showMobileBottomNav =
    !publicChrome &&
    (location.pathname === "/explore" ||
      location.pathname === "/admin" ||
      location.pathname.startsWith("/admin/") ||
      location.pathname === "/dashboard" ||
      location.pathname.startsWith("/dashboard/"));

  useEffect(() => {
    setMoreMenuOpen(false);
    setMobileDrawerOpen(false);
    setMobileMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!moreMenuRef.current?.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMoreMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [moreMenuOpen]);

  useEffect(() => {
    if (!mobileDrawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileDrawerOpen]);

  const shell = (
    <div
      className={`app-shell ${showMobileBottomNav ? "has-mobile-bottom-nav" : ""} ${
        mobileDrawerOpen ? "has-mobile-drawer-open" : ""
      }`}
    >
      <div className="bg-orb bg-orb-a" />
      <div className="bg-orb bg-orb-b" />
      <header className={`topbar panel ${publicChrome ? "topbar-public" : ""}`}>
        {publicChrome ? null : (
          <div className="mobile-topbar-row">
            <button
              type="button"
              className={`mobile-menu-toggle ${mobileDrawerOpen ? "is-open" : ""}`}
              onClick={() => setMobileDrawerOpen((current) => !current)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileDrawerOpen}
              aria-controls="mobile-nav-drawer"
            >
              <MenuToggleIcon />
            </button>
            <Link className="mobile-brand" to="/" onClick={() => setMobileDrawerOpen(false)}>
              <span className="brand-mark" aria-hidden="true">
                <img src="/deepsignal-mark.svg" alt="" />
              </span>
              <strong>DeepSignal</strong>
            </Link>
            <CreateFormLink className="mobile-header-cta" onClick={() => setMobileDrawerOpen(false)}>
              <span aria-hidden="true">+</span>
              <span>{t("navMobileNewSignal")}</span>
            </CreateFormLink>
          </div>
        )}
        <Link className="brand desktop-topbar-brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            <img src="/deepsignal-mark.svg" alt="" />
          </span>
          <div className="brand-copy">
            <strong>DeepSignal</strong>
            <p>{t("brandTagline")}</p>
          </div>
        </Link>
        {publicChrome ? null : (
          <nav className="topnav desktop-topnav" aria-label="Primary navigation">
            <div className="topnav-row topnav-row-primary">
              <NavLink to="/">{t("navHome")}</NavLink>
              <CreateFormLink nav>
                <NavItemLabel icon={<CreateSignalNavIcon />}>{t("navCreateForm")}</NavItemLabel>
              </CreateFormLink>
              {walletChrome.inboxNav}
            </div>
            <div className="topnav-row topnav-row-secondary">
              <NavLink to="/explore">{t("navExplore")}</NavLink>
              {walletChrome.accessNav}
              <div ref={moreMenuRef} className={`topnav-more ${moreMenuOpen ? "is-open" : ""}`}>
                <button
                  type="button"
                  className={`topnav-more-trigger ${moreMenuOpen ? "is-open" : ""}`}
                  onClick={() => setMoreMenuOpen((current) => !current)}
                  aria-haspopup="menu"
                  aria-expanded={moreMenuOpen}
                >
                  <NavItemLabel icon={<MoreNavIcon />}>{t("navMore")}</NavItemLabel>
                </button>
                {moreMenuOpen ? (
                  <div className="topnav-more-inline" role="menu" aria-label={t("navMore")}>
                    <NavLink className="topnav-more-link" to="/troubleshooting" role="menuitem">
                      {t("navTroubleshooting")}
                    </NavLink>
                  </div>
                ) : null}
              </div>
            </div>
          </nav>
        )}
        <div className="topbar-actions desktop-topbar-actions">
          {publicChrome ? null : (
            <div className="topbar-infra">
              {walletAvailable ? <NetworkMenu /> : null}
              {walletChrome.connect}
            </div>
          )}
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
      {publicChrome ? null : (
        <>
          <button
            type="button"
            className={`mobile-drawer-backdrop ${mobileDrawerOpen ? "is-open" : ""}`}
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden={!mobileDrawerOpen}
            tabIndex={mobileDrawerOpen ? 0 : -1}
          />
          <aside
            id="mobile-nav-drawer"
            className={`mobile-nav-drawer panel ${mobileDrawerOpen ? "is-open" : ""}`}
            aria-hidden={!mobileDrawerOpen}
          >
            <div className="mobile-drawer-header">
              <div>
                <span className="mobile-drawer-eyebrow">Secure Command Panel</span>
                <strong>DeepSignal</strong>
                <p>{t("brandTagline")}</p>
              </div>
              <CreateFormLink className="mobile-drawer-cta" onClick={() => setMobileDrawerOpen(false)}>
                <span aria-hidden="true">+</span>
                <span>{t("navCreateForm")}</span>
              </CreateFormLink>
            </div>

            <div className="mobile-drawer-section">
              <span className="mobile-drawer-section-label">Secure Inbox</span>
              <nav className="mobile-drawer-nav" aria-label="Mobile navigation">
                <NavLink to="/" onClick={() => setMobileDrawerOpen(false)}>
                  {t("navHome")}
                </NavLink>
                <CreateFormLink nav onClick={() => setMobileDrawerOpen(false)}>
                  <NavItemLabel icon={<CreateSignalNavIcon />}>{t("navCreateForm")}</NavItemLabel>
                </CreateFormLink>
                {walletChrome.inboxNav}
                <NavLink to="/explore" onClick={() => setMobileDrawerOpen(false)}>
                  {t("navExplore")}
                </NavLink>
                {walletChrome.accessNav}
                <div className="mobile-drawer-more">
                  <button
                    type="button"
                    className={`mobile-drawer-more-trigger ${mobileMoreOpen ? "is-open" : ""}`}
                    onClick={() => setMobileMoreOpen((current) => !current)}
                    aria-expanded={mobileMoreOpen}
                  >
                    <NavItemLabel icon={<MoreNavIcon />}>{t("navMore")}</NavItemLabel>
                  </button>
                  {mobileMoreOpen ? (
                    <NavLink
                      className="mobile-drawer-subnav-link"
                      to="/troubleshooting"
                      onClick={() => setMobileDrawerOpen(false)}
                    >
                      {t("navTroubleshooting")}
                    </NavLink>
                  ) : null}
                </div>
              </nav>
            </div>

            <div className="mobile-drawer-section">
              <span className="mobile-drawer-section-label">Command Surface</span>
              <div className="mobile-drawer-utility-group">
              <div className="mobile-drawer-utility-card">
                <span className="mobile-drawer-utility-label">Network</span>
                {walletAvailable ? <NetworkMenu /> : <div className="mobile-drawer-utility-empty">Unavailable</div>}
              </div>
              <div className="mobile-drawer-utility-card">
                <span className="mobile-drawer-utility-label">Wallet</span>
                {walletChrome.connect}
              </div>
              <div className="mobile-drawer-utility-card">
                <label className="language-switch mobile-drawer-language-switch">
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
            </div>
            </div>
          </aside>
        </>
      )}
      <main className="page-wrap">{children}</main>
      {showMobileBottomNav ? <MobileAppBottomNav /> : null}
      <BuildIndicator />
    </div>
  );

  return shell;
}
