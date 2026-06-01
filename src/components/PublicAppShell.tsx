import { Link, NavLink } from "react-router-dom";
import { useI18n } from "../i18n";
import { buildInfo } from "../lib/buildInfo";
import { BuildIndicator } from "./system/BuildIndicator";
import { useEffect, useRef, useState, type CSSProperties, type PropsWithChildren, type TouchEvent as ReactTouchEvent } from "react";
import "../styles/public-shell-entry.css";

const PUBLIC_DRAWER_SWIPE_THRESHOLD_PX = 60;
const PUBLIC_DRAWER_EDGE_START_PX = 24;
const PUBLIC_DRAWER_HORIZONTAL_RATIO = 1.5;
const PUBLIC_DRAWER_INTENT_PX = 8;
const PUBLIC_DRAWER_VIEWPORT_QUERY = "(max-width: 900px)";

interface PublicDrawerGestureState {
  dragging: boolean;
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
  blockedByScroll: boolean;
}

function shouldShowPublicBuildIndicator() {
  if (import.meta.env.DEV || typeof window === "undefined") {
    return import.meta.env.DEV;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const hashQuery = window.location.hash.includes("?") ? window.location.hash.split("?").slice(1).join("?") : "";
  const hashParams = new URLSearchParams(hashQuery);
  return searchParams.has("debugBuild") || hashParams.has("debugBuild");
}

export function PublicAppShell({ children }: PropsWithChildren) {
  const { language, setLanguage, t } = useI18n();
  const showBuildIndicator = shouldShowPublicBuildIndicator();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDragOffset, setDrawerDragOffset] = useState(0);
  const [drawerDragging, setDrawerDragging] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const drawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const drawerReturnFocusRef = useRef<HTMLElement | null>(null);
  const drawerGestureRef = useRef<PublicDrawerGestureState | null>(null);
  const edgeGestureRef = useRef<PublicDrawerGestureState | null>(null);

  function isMobileDrawerViewport() {
    return typeof window !== "undefined" && window.matchMedia(PUBLIC_DRAWER_VIEWPORT_QUERY).matches;
  }

  function openDrawer() {
    const activeElement = document.activeElement;
    drawerReturnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    setDrawerDragOffset(0);
    setDrawerDragging(false);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    const shouldRestoreFocus =
      drawerRef.current?.contains(document.activeElement) ||
      document.activeElement?.classList.contains("mobile-drawer-backdrop");
    setDrawerDragOffset(0);
    setDrawerDragging(false);
    setDrawerOpen(false);
    if (shouldRestoreFocus) {
      window.requestAnimationFrame(() => {
        drawerReturnFocusRef.current?.focus();
        drawerReturnFocusRef.current = null;
      });
    }
  }

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerCloseRef.current?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDrawer();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (drawerOpen) {
      return;
    }

    function handleEdgeTouchStart(event: TouchEvent) {
      if (!isMobileDrawerViewport() || event.touches.length !== 1) {
        edgeGestureRef.current = null;
        return;
      }
      const touch = event.touches[0];
      if (window.innerWidth - touch.clientX > PUBLIC_DRAWER_EDGE_START_PX) {
        edgeGestureRef.current = null;
        return;
      }
      edgeGestureRef.current = {
        dragging: false,
        startX: touch.clientX,
        startY: touch.clientY,
        deltaX: 0,
        deltaY: 0,
        blockedByScroll: false,
      };
    }

    function handleEdgeTouchMove(event: TouchEvent) {
      const gesture = edgeGestureRef.current;
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
        if (absDeltaY > PUBLIC_DRAWER_INTENT_PX && absDeltaY > absDeltaX) {
          gesture.blockedByScroll = true;
          return;
        }
        if (deltaX < -PUBLIC_DRAWER_INTENT_PX && absDeltaX > absDeltaY * PUBLIC_DRAWER_HORIZONTAL_RATIO) {
          gesture.dragging = true;
        }
      }
      if (gesture.dragging) {
        event.preventDefault();
      }
    }

    function handleEdgeTouchEnd(event: TouchEvent) {
      const gesture = edgeGestureRef.current;
      const touch = event.changedTouches[0];
      if (gesture && touch) {
        gesture.deltaX = touch.clientX - gesture.startX;
        gesture.deltaY = touch.clientY - gesture.startY;
      }
      edgeGestureRef.current = null;
      if (
        gesture &&
        !gesture.blockedByScroll &&
        gesture.deltaX < -PUBLIC_DRAWER_SWIPE_THRESHOLD_PX &&
        Math.abs(gesture.deltaX) > Math.abs(gesture.deltaY) * PUBLIC_DRAWER_HORIZONTAL_RATIO
      ) {
        openDrawer();
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
  }, [drawerOpen]);

  function handleDrawerTouchStart(event: ReactTouchEvent<HTMLElement>) {
    if (!isMobileDrawerViewport() || event.touches.length !== 1) {
      drawerGestureRef.current = null;
      return;
    }
    const touch = event.touches[0];
    drawerGestureRef.current = {
      dragging: false,
      startX: touch.clientX,
      startY: touch.clientY,
      deltaX: 0,
      deltaY: 0,
      blockedByScroll: false,
    };
    setDrawerDragOffset(0);
    setDrawerDragging(false);
  }

  function handleDrawerTouchMove(event: ReactTouchEvent<HTMLElement>) {
    const gesture = drawerGestureRef.current;
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
      if (absDeltaY > PUBLIC_DRAWER_INTENT_PX && absDeltaY > absDeltaX) {
        gesture.blockedByScroll = true;
        return;
      }
      if (deltaX > PUBLIC_DRAWER_INTENT_PX && deltaX > absDeltaY * PUBLIC_DRAWER_HORIZONTAL_RATIO) {
        gesture.dragging = true;
        setDrawerDragging(true);
      }
    }
    if (gesture.dragging) {
      event.preventDefault();
      setDrawerDragOffset(Math.max(0, Math.min(deltaX, window.innerWidth)));
    }
  }

  function finishDrawerTouch(event: ReactTouchEvent<HTMLElement>) {
    const gesture = drawerGestureRef.current;
    const touch = event.changedTouches[0];
    if (gesture && touch) {
      gesture.deltaX = touch.clientX - gesture.startX;
      gesture.deltaY = touch.clientY - gesture.startY;
    }
    drawerGestureRef.current = null;
    setDrawerDragging(false);
    if (
      gesture &&
      !gesture.blockedByScroll &&
      gesture.deltaX > PUBLIC_DRAWER_SWIPE_THRESHOLD_PX &&
      gesture.deltaX > Math.abs(gesture.deltaY) * PUBLIC_DRAWER_HORIZONTAL_RATIO
    ) {
      closeDrawer();
      return;
    }
    setDrawerDragOffset(0);
  }

  return (
    <div className={`app-shell public-app-shell ${drawerOpen ? "has-mobile-drawer-open" : ""}`}>
      <header className="topbar panel topbar-public public-app-topbar">
        <button
          type="button"
          className={`mobile-menu-toggle public-mobile-menu-toggle ${drawerOpen ? "is-open" : ""}`}
          onClick={() => (drawerOpen ? closeDrawer() : openDrawer())}
          aria-label="Toggle navigation menu"
          aria-expanded={drawerOpen}
          aria-controls="mobile-command-drawer"
        >
          <span className="mobile-menu-toggle-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        <Link className="brand desktop-topbar-brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            <img src="/deepsignal-mark.svg" alt="" />
          </span>
          <div className="brand-copy">
            <strong>DeepSignal</strong>
            <p>{t("brandTagline")}</p>
          </div>
        </Link>
        <div className="topbar-actions desktop-topbar-actions">
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
      {drawerOpen ? (
        <>
          <button
            type="button"
            className="mobile-drawer-backdrop is-open"
            onClick={closeDrawer}
            aria-hidden="true"
            tabIndex={-1}
          />
          <aside
            ref={drawerRef}
            id="mobile-command-drawer"
            className={`mobile-nav-drawer panel is-open ${drawerDragging ? "is-dragging" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="DeepSignal mobile command menu"
            style={{ "--mobile-drawer-drag-x": `${drawerDragOffset}px` } as CSSProperties}
            onTouchStart={handleDrawerTouchStart}
            onTouchMove={handleDrawerTouchMove}
            onTouchEnd={finishDrawerTouch}
            onTouchCancel={finishDrawerTouch}
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
                ref={drawerCloseRef}
                type="button"
                className="mobile-drawer-close-button"
                onClick={closeDrawer}
                aria-label="Close mobile command menu"
              >
                <span aria-hidden="true" />
                <span aria-hidden="true" />
              </button>
            </div>

            <div className="mobile-drawer-section">
              <span className="mobile-drawer-section-label">SIGNALS</span>
              <nav className="mobile-drawer-nav mobile-drawer-primary-nav" aria-label="Mobile navigation">
                <NavLink to="/explore" onClick={closeDrawer}>{t("navExplore")}</NavLink>
                <NavLink to="/dashboard" onClick={closeDrawer}>{t("navMobileInbox")}</NavLink>
                <NavLink to="/my-responses" onClick={closeDrawer}>{t("navMobileMyResponses")}</NavLink>
              </nav>
            </div>

            <div className="mobile-drawer-section">
              <span className="mobile-drawer-section-label">{t("navMobileSettings")}</span>
              <nav className="mobile-drawer-nav mobile-drawer-settings-nav" aria-label="Mobile settings navigation">
                <NavLink className="mobile-drawer-command-link" to="/troubleshooting" onClick={closeDrawer}>
                  {t("navTroubleshooting")}
                </NavLink>
              </nav>
              <div className="mobile-drawer-utility-group">
                <div className="mobile-drawer-utility-card mobile-drawer-status-card">
                  <span className="mobile-drawer-utility-label">Network</span>
                  <div className="mobile-drawer-status-line">
                    <span className="mobile-drawer-status-dot" aria-hidden="true" />
                    <span>Sui Fullnode / mainnet</span>
                  </div>
                </div>
                <div className="mobile-drawer-utility-card mobile-drawer-status-card">
                  <span className="mobile-drawer-utility-label">Wallet</span>
                  <div className="mobile-drawer-status-line">
                    <span className="mobile-drawer-status-dot is-idle" aria-hidden="true" />
                    <span>ウォレット未接続</span>
                  </div>
                </div>
                <div className="mobile-drawer-utility-card">
                  <label className="language-switch mobile-drawer-language-switch">
                    <span>{t("languageLabel")}</span>
                    <select value={language} onChange={(event) => setLanguage(event.target.value as "en" | "ja")}>
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
      <main className="page-wrap">{children}</main>
      {showBuildIndicator ? <BuildIndicator compact /> : null}
    </div>
  );
}
