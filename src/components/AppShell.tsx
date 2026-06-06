import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PropsWithChildren,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import "../styles/app-shell-entry.css";
import { CreateFormLink } from "./CreateFormLink";
import { NavItemLabel } from "./NavIcons";
import { BuildIndicator } from "./system/BuildIndicator";
import { useI18n } from "../i18n";
import { buildInfo } from "../lib/buildInfo";
import { retryLazyImport } from "../lib/lazyRetry";
import { isSignalInboxPath } from "../lib/navigation";
import { logRouteLifecycle } from "../lib/routeDiagnostics";
import { scheduleIdleTask } from "../lib/scheduleIdleTask";
import { useOptionalRpcInfrastructure } from "../rpcInfrastructure";
import type { WalletSessionPhase } from "../walletSessionState";

const MOBILE_DRAWER_SWIPE_THRESHOLD_PX = 60;
const MOBILE_DRAWER_EDGE_START_PX = 24;
const MOBILE_DRAWER_HORIZONTAL_RATIO = 1.5;
const MOBILE_DRAWER_INTENT_PX = 8;
const MOBILE_VIEWPORT_QUERY = "(max-width: 900px)";

const WalletRuntimePanel = lazy(() => retryLazyImport(() => import("./WalletRuntimePanel"), "wallet-runtime-panel"));
const NetworkMenu = lazy(() =>
  retryLazyImport(() => import("./NetworkMenu"), "network-menu").then((module) => ({ default: module.NetworkMenu })),
);

interface AppShellProps extends PropsWithChildren {
  chrome?: "full" | "public";
  walletSessionPhase?: WalletSessionPhase;
  walletUiEnabled?: boolean;
}

interface MobileDrawerGestureState {
  dragging: boolean;
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
  blockedByScroll: boolean;
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

function TransmissionIcon() {
  return (
    <svg className="mobile-compose-fab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5.5a6.5 6.5 0 0 1 6.5 6.5" />
      <path d="M12 2.5A9.5 9.5 0 0 1 21.5 12" />
      <path d="M12 10.75a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" />
      <path d="M12 12l4.9-4.9" />
      <path d="M5.5 12A6.5 6.5 0 0 1 12 5.5" />
      <path d="M2.5 12A9.5 9.5 0 0 1 12 2.5" />
    </svg>
  );
}

function isComposerRoute(pathname: string) {
  return pathname === "/create" || pathname === "/compose" || pathname === "/admin/forms/new";
}

function WalletNavSlot({
  navLabLabel,
  onNavigate,
  section,
  walletUiEnabled,
}: {
  navLabLabel: string;
  onNavigate?: () => void;
  section: "access" | "inbox";
  walletUiEnabled: boolean;
}) {
  if (!walletUiEnabled) {
    return section === "inbox" ? (
      <Link to="/admin" onClick={onNavigate}>
        {navLabLabel}
      </Link>
    ) : null;
  }

  return (
    <Suspense fallback={null}>
      <WalletRuntimePanel mode="nav" section={section} onNavigate={onNavigate} />
    </Suspense>
  );
}

function WalletConnectSlot({
  fallback,
  surface,
  walletSessionPhase,
  walletUiEnabled,
}: {
  fallback?: ReactNode;
  surface?: "mobileDrawer";
  walletSessionPhase: WalletSessionPhase;
  walletUiEnabled: boolean;
}) {
  if (!walletUiEnabled) {
    return null;
  }

  if (walletSessionPhase === "provider_deferred") {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <Suspense fallback={fallback ?? null}>
      <WalletRuntimePanel mode="connect" surface={surface} fallback={fallback} />
    </Suspense>
  );
}

interface MobileAppBottomNavProps {
  showComposeShortcut: boolean;
}

function MobileAppBottomNav({ showComposeShortcut }: MobileAppBottomNavProps) {
  const location = useLocation();
  const { t } = useI18n();
  const inboxActive = isSignalInboxPath(location.pathname);
  const navClassName = ({ isActive }: { isActive: boolean }) => (isActive ? "is-active" : undefined);

  return (
    <>
      {showComposeShortcut ? (
        <CreateFormLink
          fresh={false}
          className="mobile-compose-fab"
        >
          <TransmissionIcon />
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
      </nav>
    </>
  );
}

function DeferredNetworkMenu({ drawerFallback = false }: { drawerFallback?: boolean }) {
  const [ready, setReady] = useState(false);
  const rpcInfrastructure = useOptionalRpcInfrastructure();

  useEffect(() => scheduleIdleTask(() => setReady(true), 2200), []);

  if (!ready || !rpcInfrastructure) {
    if (drawerFallback) {
      return (
        <div className="mobile-drawer-status-line" aria-live="polite">
          <span className="mobile-drawer-status-dot" aria-hidden="true" />
          <span>{ready ? "Local signal mode" : "Loading network controls"}</span>
        </div>
      );
    }
    return <div className="network-select-shell network-select-shell-placeholder" aria-hidden="true" />;
  }

  return (
    <Suspense fallback={<div className="network-select-shell network-select-shell-placeholder" aria-hidden="true" />}>
      <NetworkMenu />
    </Suspense>
  );
}

function MobileDrawerNetworkStatus() {
  const rpcInfrastructure = useOptionalRpcInfrastructure();
  const providerLabel = rpcInfrastructure?.usingTatum ? rpcInfrastructure.providerLabel : "Sui Fullnode";
  const networkLabel = rpcInfrastructure?.network ?? "mainnet";

  return (
    <div className="mobile-drawer-status-line" aria-live="polite">
      <span className="mobile-drawer-status-dot" aria-hidden="true" />
      <span>{providerLabel} / {networkLabel}</span>
    </div>
  );
}

function MobileDrawerWalletStandbyStatus() {
  const { t } = useI18n();

  return (
    <div className="mobile-drawer-status-line">
      <span className="mobile-drawer-status-dot is-idle" aria-hidden="true" />
      <span>{t("secureSessionStandby")}</span>
    </div>
  );
}

export function AppShell({
  children,
  chrome = "full",
  walletSessionPhase = "provider_deferred",
  walletUiEnabled = false,
}: AppShellProps) {
  const { language, setLanguage, t } = useI18n();
  const location = useLocation();
  const publicChrome = chrome === "public";
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileDrawerDragOffset, setMobileDrawerDragOffset] = useState(0);
  const [mobileDrawerDragging, setMobileDrawerDragging] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuToggleRef = useRef<HTMLButtonElement | null>(null);
  const mobileDrawerRef = useRef<HTMLElement | null>(null);
  const mobileDrawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const mobileDrawerReturnFocusRef = useRef<HTMLElement | null>(null);
  const mobileDrawerGestureRef = useRef<MobileDrawerGestureState | null>(null);
  const mobileDrawerEdgeGestureRef = useRef<MobileDrawerGestureState | null>(null);
  const mountPathRef = useRef(location.pathname);
  const walletConnectFallback = <div className="wallet-connect-shell wallet-connect-shell-compact" />;
  const mobileWalletFallback = (
    <div className="mobile-drawer-status-line" aria-live="polite">
      <span className="mobile-drawer-status-dot" aria-hidden="true" />
      <span>{t("secureSessionStandby")}</span>
    </div>
  );
  const showComposeShortcut = !isComposerRoute(location.pathname);
  const showMobileBottomNav = !publicChrome;

  useEffect(() => {
    logRouteLifecycle("app-shell:mount", {
      chrome,
      pathname: mountPathRef.current,
      hash: typeof window === "undefined" ? "" : window.location.hash,
    });
    return () => {
      logRouteLifecycle("app-shell:unmount", {
        chrome,
      });
    };
  }, [chrome]);

  useEffect(() => {
    logRouteLifecycle("app-shell:route-change", {
      chrome,
      pathname: location.pathname,
      walletSessionPhase,
      walletUiEnabled,
    });
  }, [chrome, location.pathname, walletSessionPhase, walletUiEnabled]);

  useEffect(() => {
    setMoreMenuOpen(false);
    setMobileDrawerDragOffset(0);
    setMobileDrawerDragging(false);
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

  useEffect(() => {
    if (!mobileDrawerOpen) {
      return;
    }

    mobileDrawerCloseRef.current?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMobileDrawer();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mobileDrawerOpen]);

  useEffect(() => {
    if (publicChrome || mobileDrawerOpen) {
      return;
    }

    function handleEdgeTouchStart(event: TouchEvent) {
      if (!isMobileDrawerViewport() || event.touches.length !== 1) {
        mobileDrawerEdgeGestureRef.current = null;
        return;
      }

      const touch = event.touches[0];
      if (window.innerWidth - touch.clientX > MOBILE_DRAWER_EDGE_START_PX) {
        mobileDrawerEdgeGestureRef.current = null;
        return;
      }

      mobileDrawerEdgeGestureRef.current = {
        dragging: false,
        startX: touch.clientX,
        startY: touch.clientY,
        deltaX: 0,
        deltaY: 0,
        blockedByScroll: false,
      };
    }

    function handleEdgeTouchMove(event: TouchEvent) {
      const gesture = mobileDrawerEdgeGestureRef.current;
      if (!gesture || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      gesture.deltaX = deltaX;
      gesture.deltaY = deltaY;

      if (!gesture.dragging) {
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);
        if (absDeltaY > MOBILE_DRAWER_INTENT_PX && absDeltaY > absDeltaX) {
          gesture.blockedByScroll = true;
          return;
        }
        if (deltaX < -MOBILE_DRAWER_INTENT_PX && absDeltaX > absDeltaY * MOBILE_DRAWER_HORIZONTAL_RATIO) {
          gesture.dragging = true;
        }
      }

      if (gesture.dragging) {
        event.preventDefault();
      }
    }

    function handleEdgeTouchEnd(event: TouchEvent) {
      const gesture = mobileDrawerEdgeGestureRef.current;
      const touch = event.changedTouches[0];
      if (gesture && touch) {
        gesture.deltaX = touch.clientX - gesture.startX;
        gesture.deltaY = touch.clientY - gesture.startY;
      }
      mobileDrawerEdgeGestureRef.current = null;
      if (!gesture || gesture.blockedByScroll) {
        return;
      }

      if (
        gesture.deltaX < -MOBILE_DRAWER_SWIPE_THRESHOLD_PX &&
        Math.abs(gesture.deltaX) > Math.abs(gesture.deltaY) * MOBILE_DRAWER_HORIZONTAL_RATIO
      ) {
        openMobileDrawer();
      }
    }

    window.addEventListener("touchstart", handleEdgeTouchStart, { passive: true });
    window.addEventListener("touchmove", handleEdgeTouchMove, { passive: false });
    window.addEventListener("touchend", handleEdgeTouchEnd);
    window.addEventListener("touchcancel", handleEdgeTouchEnd);
    return () => {
      window.removeEventListener("touchstart", handleEdgeTouchStart);
      window.removeEventListener("touchmove", handleEdgeTouchMove);
      window.removeEventListener("touchend", handleEdgeTouchEnd);
      window.removeEventListener("touchcancel", handleEdgeTouchEnd);
    };
  }, [mobileDrawerOpen, publicChrome]);

  function openMobileDrawer() {
    const activeElement = document.activeElement;
    mobileDrawerReturnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : mobileMenuToggleRef.current;
    setMobileDrawerDragOffset(0);
    setMobileDrawerDragging(false);
    setMobileDrawerOpen(true);
  }

  function closeMobileDrawer() {
    const shouldRestoreFocus =
      mobileDrawerRef.current?.contains(document.activeElement) ||
      document.activeElement?.classList.contains("mobile-drawer-backdrop");
    setMobileDrawerDragOffset(0);
    setMobileDrawerDragging(false);
    setMobileDrawerOpen(false);
    if (shouldRestoreFocus) {
      window.requestAnimationFrame(() => {
        mobileDrawerReturnFocusRef.current?.focus();
        mobileDrawerReturnFocusRef.current = null;
      });
    }
  }

  function isMobileDrawerViewport() {
    return typeof window !== "undefined" && window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
  }

  function handleMobileDrawerTouchStart(event: ReactTouchEvent<HTMLElement>) {
    if (!isMobileDrawerViewport() || event.touches.length !== 1) {
      mobileDrawerGestureRef.current = null;
      return;
    }

    const touch = event.touches[0];
    mobileDrawerGestureRef.current = {
      dragging: false,
      startX: touch.clientX,
      startY: touch.clientY,
      deltaX: 0,
      deltaY: 0,
      blockedByScroll: false,
    };
    setMobileDrawerDragOffset(0);
    setMobileDrawerDragging(false);
  }

  function handleMobileDrawerTouchMove(event: ReactTouchEvent<HTMLElement>) {
    const gesture = mobileDrawerGestureRef.current;
    if (!gesture || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    gesture.deltaX = deltaX;
    gesture.deltaY = deltaY;

    if (!gesture.dragging) {
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      if (absDeltaY > MOBILE_DRAWER_INTENT_PX && absDeltaY > absDeltaX) {
        gesture.blockedByScroll = true;
        return;
      }
      if (deltaX > MOBILE_DRAWER_INTENT_PX && deltaX > absDeltaY * MOBILE_DRAWER_HORIZONTAL_RATIO) {
        gesture.dragging = true;
        setMobileDrawerDragging(true);
      }
    }

    if (gesture.dragging) {
      event.preventDefault();
      setMobileDrawerDragOffset(Math.max(0, Math.min(deltaX, window.innerWidth)));
    }
  }

  function finishMobileDrawerTouch(event: ReactTouchEvent<HTMLElement>) {
    const gesture = mobileDrawerGestureRef.current;
    const touch = event.changedTouches[0];
    if (gesture && touch) {
      gesture.deltaX = touch.clientX - gesture.startX;
      gesture.deltaY = touch.clientY - gesture.startY;
    }
    mobileDrawerGestureRef.current = null;
    setMobileDrawerDragging(false);

    if (
      gesture &&
      !gesture.blockedByScroll &&
      gesture.deltaX > MOBILE_DRAWER_SWIPE_THRESHOLD_PX &&
      gesture.deltaX > Math.abs(gesture.deltaY) * MOBILE_DRAWER_HORIZONTAL_RATIO
    ) {
      closeMobileDrawer();
      return;
    }

    setMobileDrawerDragOffset(0);
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
                openMobileDrawer();
              }}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileDrawerOpen}
              aria-controls="mobile-command-drawer"
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
              <WalletNavSlot
                navLabLabel={t("navLab")}
                onNavigate={() => setMobileDrawerOpen(false)}
                section="inbox"
                walletUiEnabled={walletUiEnabled}
              />
            </div>
            <div className="topnav-row topnav-row-secondary">
              <NavLink to="/explore">{t("navExplore")}</NavLink>
              <NavLink to="/my-responses">{t("navMyResponses")}</NavLink>
              <WalletNavSlot
                navLabLabel={t("navLab")}
                onNavigate={() => setMobileDrawerOpen(false)}
                section="access"
                walletUiEnabled={walletUiEnabled}
              />
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
              <WalletConnectSlot
                fallback={walletConnectFallback}
                walletSessionPhase={walletSessionPhase}
                walletUiEnabled={walletUiEnabled}
              />
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
                id="mobile-command-drawer"
                className={`mobile-nav-drawer panel is-open ${mobileDrawerDragging ? "is-dragging" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label="DeepSignal mobile command menu"
                style={{ "--mobile-drawer-drag-x": `${mobileDrawerDragOffset}px` } as CSSProperties}
                onTouchStart={handleMobileDrawerTouchStart}
                onTouchMove={handleMobileDrawerTouchMove}
                onTouchEnd={finishMobileDrawerTouch}
                onTouchCancel={finishMobileDrawerTouch}
              >
                <div className="mobile-drawer-header">
                  <div className="mobile-drawer-brand">
                    <span className="brand-mark" aria-hidden="true">
                      <img src="/deepsignal-mark.svg" alt="" />
                    </span>
                    <div>
                      <strong>DeepSignal</strong>
                    </div>
                  </div>
                  <button
                    ref={mobileDrawerCloseRef}
                    type="button"
                    className="mobile-drawer-close-button"
                    onClick={closeMobileDrawer}
                    aria-label="Close mobile command menu"
                  >
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                  </button>
                </div>

                <div className="mobile-drawer-section">
                  <span className="mobile-drawer-section-label">SIGNALS</span>
                  <nav className="mobile-drawer-nav mobile-drawer-primary-nav" aria-label="Mobile navigation">
                    <NavLink to="/explore" onClick={closeMobileDrawer}>
                      {t("navExplore")}
                    </NavLink>
                    <NavLink to="/dashboard" onClick={closeMobileDrawer}>
                      {t("navMobileInbox")}
                    </NavLink>
                    <NavLink to="/my-responses" onClick={closeMobileDrawer}>
                      {t("navMobileMyResponses")}
                    </NavLink>
                  </nav>
                </div>

                <div className="mobile-drawer-section">
                  <span className="mobile-drawer-section-label">{t("navMobileSettings")}</span>
                  <nav className="mobile-drawer-nav mobile-drawer-settings-nav" aria-label="Mobile settings navigation">
                    <WalletNavSlot
                      navLabLabel={t("navLab")}
                      onNavigate={closeMobileDrawer}
                      section="access"
                      walletUiEnabled={walletUiEnabled}
                    />
                    <NavLink className="mobile-drawer-command-link" to="/troubleshooting" onClick={closeMobileDrawer}>
                      {t("navTroubleshooting")}
                    </NavLink>
                  </nav>
                  <div className="mobile-drawer-utility-group">
                    <div className="mobile-drawer-utility-card mobile-drawer-status-card">
                      <span className="mobile-drawer-utility-label">Network</span>
                      <MobileDrawerNetworkStatus />
                      <DeferredNetworkMenu drawerFallback />
                    </div>
                    <div className="mobile-drawer-utility-card mobile-drawer-status-card">
                      <span className="mobile-drawer-utility-label">Wallet</span>
                      <WalletConnectSlot
                        fallback={mobileWalletFallback}
                        surface="mobileDrawer"
                        walletSessionPhase={walletSessionPhase}
                        walletUiEnabled={walletUiEnabled}
                      />
                      {walletUiEnabled ? null : <MobileDrawerWalletStandbyStatus />}
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
                    <div className="mobile-drawer-about-row" aria-label="About DeepSignal">
                      <span>About</span>
                      <span>{buildInfo.label}</span>
                    </div>
                  </div>
                </div>
              </aside>
            </>
          ) : null}
        </>
      )}
      <main className="page-wrap">{children}</main>
      {showMobileBottomNav ? (
        <MobileAppBottomNav showComposeShortcut={showComposeShortcut} />
      ) : null}
      <BuildIndicator />
    </div>
  );

  return shell;
}
