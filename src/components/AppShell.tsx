import { lazy, Suspense, type PropsWithChildren } from "react";
import { Link, NavLink } from "react-router-dom";
import { useI18n } from "../i18n";

const WalletConnect = lazy(() =>
  import("./WalletConnect").then((module) => ({ default: module.WalletConnect })),
);
const WalletNav = lazy(() =>
  import("./WalletNav").then((module) => ({ default: module.WalletNav })),
);

export function AppShell({ children }: PropsWithChildren) {
  const { language, setLanguage, t } = useI18n();

  const shell = (
    <div className="app-shell">
      <div className="bg-orb bg-orb-a" />
      <div className="bg-orb bg-orb-b" />
      <header className="topbar panel">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            <img src="/deepsignal-icon.webp" alt="" />
          </span>
          <div className="brand-copy">
            <strong>DeepSignal</strong>
            <p>{t("brandTagline")}</p>
          </div>
        </Link>
        <nav className="topnav">
          <NavLink to="/">{t("navHome")}</NavLink>
          <NavLink to="/explore">{t("navExplore")}</NavLink>
          <Suspense fallback={null}>
            <WalletNav />
          </Suspense>
          <NavLink to="/admin/forms/new">{t("navCreateForm")}</NavLink>
        </nav>
        <div className="topbar-actions">
          <Suspense fallback={<div className="wallet-connect-shell" />}>
            <WalletConnect />
          </Suspense>
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

  return shell;
}
