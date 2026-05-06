import { Link, NavLink } from "react-router-dom";
import { useEffect, useState, type PropsWithChildren } from "react";
import { WalletConnect } from "./WalletConnect";
import { useI18n } from "../i18n";
import {
  getStorageRuntimeStatus,
  subscribeStorageRuntime,
} from "../storage/storageFactory";

export function AppShell({ children }: PropsWithChildren) {
  const { language, setLanguage, t } = useI18n();
  const [storageStatus, setStorageStatus] = useState(getStorageRuntimeStatus());

  useEffect(() => {
    const unsubscribe = subscribeStorageRuntime(() => setStorageStatus(getStorageRuntimeStatus()));
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="app-shell">
      <div className="bg-orb bg-orb-a" />
      <div className="bg-orb bg-orb-b" />
      <header className="topbar panel">
        <Link className="brand" to="/">
          <span className="brand-mark">DS</span>
          <div>
            <strong>DeepSignal</strong>
            <p>{t("brandTagline")}</p>
          </div>
        </Link>
        <nav className="topnav">
          <NavLink to="/">{t("navHome")}</NavLink>
          <NavLink to="/admin">{t("navLab")}</NavLink>
          <NavLink to="/admin/forms/new">{t("navCreateForm")}</NavLink>
        </nav>
        <div className="topbar-actions">
          <WalletConnect />
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
      <footer className="app-footer panel">
        <p>
          {t("storageLabel")}:{" "}
          {storageStatus.mode === "walrus" ? t("storageWalrus") : t("storageLocalFallback")}
        </p>
        {storageStatus.notice ? <p className="warning-text">{t("walrusFallbackNotice")}</p> : null}
      </footer>
    </div>
  );
}
