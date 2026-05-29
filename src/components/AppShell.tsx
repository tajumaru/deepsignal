import { lazy, Suspense, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { CreateFormLink } from "./CreateFormLink";
import { NavItemLabel } from "./NavIcons";
import { BuildIndicator } from "./system/BuildIndicator";
import { WalletConnectSurface } from "./WalletConnectSurface";
import { useI18n } from "../i18n";
import { retryLazyImport } from "../lib/lazyRetry";
import { isSignalInboxPath } from "../lib/navigation";
import { scheduleIdleTask } from "../lib/scheduleIdleTask";
import { useOptionalRpcInfrastructure } from "../rpcInfrastructure";

const WalletNav = lazy(() =>
  retryLazyImport(() => import("./WalletNav"), "wallet-nav").then((module) => ({ default: module.WalletNav })),
);
const NetworkMenu = lazy(() =>
  retryLazyImport(() => import("./NetworkMenu"), "network-menu").then((module) => ({ default: module.NetworkMenu })),
);

interface AppShellProps extends PropsWithChildren {
  walletAvailable?: boolean;
  chrome?: "full" | "public";
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

function PencilIcon() {
  return (
    <svg className="mobile-compose-fab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 20h4.8L19.3 9.5a2.1 2.1 0 0 0 0-3L17.5 4.7a2.1 2.1 0 0 0-3 0L4 15.2V20Z" />
      <path d="m13.4 5.8 4.8 4.8" />
    </svg>
  );
}

function isComposerRoute(pathname: string) {
  return pathname === "/create" || pathname === "/compose" || pathname === "/admin/forms/new";
}

function useWalletChrome(walletAvailable: boolean, navLabLabel: string, onNavigate?: () => void) {
  const fallback = <div className="wallet-connect-shell wallet-connect-shell-compact" />;

  if (!walletAvailable) {
    return {
      inboxNav: (
        <Link to="/admin" onClick={onNavigate}>
          {navLabLabel}
        </Link>
      ),
      accessNav: null,
      connect: null,
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
      <WalletConnectSurface compact fallback={fallback} />
    ),
  };
}

interface MobileAppBottomNavProps {
  showComposeShortcut: boolean;
}

function MobileAppBottomNav({ showComposeShortcut }: MobileAppBottomNavProps) {
  const location = useLocation();
  const { t } = useI18n();
  const inboxActive = isSignalInboxPath(location.pathname);
  const exploreActive = location.pathname === "/explore";
  const navClassName = ({ isActive }: { isActive: boolean }) => (isActive ? "is-active" : undefined);

  return (
    <>
      {showComposeShortcut ? (
        <CreateFormLink
          fresh={false}
          className={`mobile-compose-fab${exploreActive ? " mobile-explore-compose-fab" : ""}`}
        >
          <PencilIcon />
          <span className="sr-only">{t("composeSignalCta")}</span>
        </CreateFormLink>
      ) : null}
      <nav className="mobile-inbox-bottom-nav" aria-label="Mobile workspace navigation">
        <Link className={inboxActive ? "is-active" : undefined} to="/dashboard">
          <span aria-hidden="true">In</span>
          <span>{t("navMobileInbox")}</span>
        </Link>
        <NavLink className={navClassName} to="/explore">
          <span aria-hidden="true">Ex</span>
          <span>{t("navExplore")}</span>
        </NavLink>
        <NavLink className={navClassName} to="/my-responses">
          <span aria-hidden="true">Me</span>
          <span>{t("navMobileMyResponses")}</span>
        </NavLink>
        <NavLink className={navClassName} to="/admin/access">
          <span aria-hidden="true">Set</span>
          <span>{t("navMobileSettings")}</span>
        </NavLink>
      </nav>
    </>
  );
}

function DeferredNetworkMenu() {
  const [ready, setReady] = useState(false);
  const rpcInfrastructure = useOptionalRpcInfrastructure();

  useEffect(() => scheduleIdleTask(() => setReady(true), 2200), []);

  if (!ready || !rpcInfrastructure) {
    return <div className="network-select-shell network-select-shell-placeholder" aria-hidden="true" />;
  }

  return (
    <Suspense fallback={<div className="network-select-shell network-select-shell-placeholder" aria-hidden="true" />}>
      <NetworkMenu />
    </Suspense>
  );
}

export function AppShell({
  children,
  walletAvailable = false,
  chrome = "full",
}: AppShellProps) {
  const { language, setLanguage, t } = useI18n();
  const location = useLocation();
  const publicChrome = chrome === "public";
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuToggleRef = useRef<HTMLButtonElement | null>(null);
  const mobileDrawerRef = useRef<HTMLElement | null>(null);
  const walletChrome = useWalletChrome(walletAvailable, t("navLab"), () => setMobileDrawerOpen(false));
  const showComposeShortcut = !isComposerRoute(location.pathname);
  const showMobileBottomNav =
    !publicChrome &&
    (location.pathname === "/explore" ||
      location.pathname === "/create" ||
      location.pathname === "/compose" ||
      location.pathname === "/my-responses" ||
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

  function closeMobileDrawer() {
    if (mobileDrawerRef.current?.contains(document.activeElement)) {
      mobileMenuToggleRef.current?.focus();
    }
    setMobileMoreOpen(false);
    setMobileDrawerOpen(false);
  }

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
              ref={mobileMenuToggleRef}
              type="button"
              className={`mobile-menu-toggle ${mobileDrawerOpen ? "is-open" : ""}`}
              onClick={() => {
                if (mobileDrawerOpen) {
                  closeMobileDrawer();
                  return;
                }
                setMobileDrawerOpen(true);
              }}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileDrawerOpen}
              aria-controls="mobile-nav-drawer"
            >
              <MenuToggleIcon />
            </button>
            <a className="mobile-brand" href="/" onClick={() => setMobileDrawerOpen(false)}>
              <span className="brand-mark" aria-hidden="true">
                <img src="/deepsignal-mark.svg" alt="" />
              </span>
              <strong>DeepSignal</strong>
            </a>
          </div>
        )}
        <a className="brand desktop-topbar-brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <img src="/deepsignal-mark.svg" alt="" />
          </span>
          <div className="brand-copy">
            <strong>DeepSignal</strong>
            <p>{t("brandTagline")}</p>
          </div>
        </a>
        {publicChrome ? null : (
          <nav className="topnav desktop-topnav" aria-label="Primary navigation">
            <div className="topnav-row topnav-row-primary">
              <a href="/">{t("navHome")}</a>
              <CreateFormLink nav fresh={false}>
                <NavItemLabel>{t("navCreateForm")}</NavItemLabel>
              </CreateFormLink>
              {walletChrome.inboxNav}
            </div>
            <div className="topnav-row topnav-row-secondary">
              <NavLink to="/explore">{t("navExplore")}</NavLink>
              <NavLink to="/my-responses">{t("navMyResponses")}</NavLink>
              {walletChrome.accessNav}
              <div ref={moreMenuRef} className={`topnav-more ${moreMenuOpen ? "is-open" : ""}`}>
                <button
                  type="button"
                  className={`topnav-more-trigger ${moreMenuOpen ? "is-open" : ""}`}
                  onClick={() => setMoreMenuOpen((current) => !current)}
                  aria-haspopup="menu"
                  aria-expanded={moreMenuOpen}
                >
                  <NavItemLabel>{t("navMore")}</NavItemLabel>
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
              <DeferredNetworkMenu />
              {walletAvailable ? walletChrome.connect : null}
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
          {mobileDrawerOpen ? (
            <>
              <button
                type="button"
                className="mobile-drawer-backdrop is-open"
                onClick={closeMobileDrawer}
                aria-hidden="true"
                tabIndex={-1}
              />
              <aside
                ref={mobileDrawerRef}
                id="mobile-nav-drawer"
                className="mobile-nav-drawer panel is-open"
                role="dialog"
                aria-modal="true"
                aria-label="Mobile navigation menu"
              >
                <div className="mobile-drawer-header">
                  <div>
                    <span className="mobile-drawer-eyebrow">Secure Command Panel</span>
                    <strong>DeepSignal</strong>
                    <p>{t("brandTagline")}</p>
                  </div>
                </div>

                <div className="mobile-drawer-section">
                  <span className="mobile-drawer-section-label">Secure Inbox</span>
                  <nav className="mobile-drawer-nav" aria-label="Mobile navigation">
                    <a href="/" onClick={closeMobileDrawer}>
                      {t("navHome")}
                    </a>
                    {walletChrome.inboxNav}
                    <NavLink to="/explore" onClick={closeMobileDrawer}>
                      {t("navExplore")}
                    </NavLink>
                    <NavLink to="/my-responses" onClick={closeMobileDrawer}>
                      {t("navMyResponses")}
                    </NavLink>
                    {walletChrome.accessNav}
                    <div className="mobile-drawer-more">
                      <button
                        type="button"
                        className={`mobile-drawer-more-trigger ${mobileMoreOpen ? "is-open" : ""}`}
                        onClick={() => setMobileMoreOpen((current) => !current)}
                        aria-expanded={mobileMoreOpen}
                      >
                        <NavItemLabel>{t("navMore")}</NavItemLabel>
                      </button>
                      {mobileMoreOpen ? (
                        <NavLink
                          className="mobile-drawer-subnav-link"
                          to="/troubleshooting"
                          onClick={closeMobileDrawer}
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
                      <DeferredNetworkMenu />
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
          ) : null}
        </>
      )}
      <main className="page-wrap">{children}</main>
      {showMobileBottomNav ? <MobileAppBottomNav showComposeShortcut={showComposeShortcut} /> : null}
      <BuildIndicator />
    </div>
  );

  return shell;
}
