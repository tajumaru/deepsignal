import { lazy, Suspense, type PropsWithChildren } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useI18n } from "../i18n";
import { WalletSurface } from "./WalletSurface";

const WalletConnect = lazy(() =>
  import("./WalletConnect").then((module) => ({ default: module.WalletConnect })),
);
const WalletNav = lazy(() =>
  import("./WalletNav").then((module) => ({ default: module.WalletNav })),
);

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const { language, setLanguage, t } = useI18n();
  const showsWalletControls =
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/dashboard") ||
    location.pathname.startsWith("/f/");

  const shell = (
    <div className="app-shell">
      <div className="bg-orb bg-orb-a" />
      <div className="bg-orb bg-orb-b" />
      <header className="topbar panel">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            <img src="/deepsignal-icon.png" alt="" />
          </span>
          <div>
            <strong>DeepSignal</strong>
            <p>{t("brandTagline")}</p>
          </div>
        </Link>
        <nav className="topnav">
          <NavLink to="/">{t("navHome")}</NavLink>
          <NavLink to="/explore">{t("navExplore")}</NavLink>
          {showsWalletControls ? (
            <Suspense fallback={null}>
              <WalletNav />
            </Suspense>
          ) : null}
          <NavLink to="/admin/forms/new">{t("navCreateForm")}</NavLink>
        </nav>
        <div className="topbar-actions">
          {showsWalletControls ? (
            <Suspense fallback={<div className="wallet-connect-shell" />}>
              <WalletConnect />
            </Suspense>
          ) : null}
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
    </div>
  );

  return showsWalletControls ? <WalletSurface>{shell}</WalletSurface> : shell;
}
