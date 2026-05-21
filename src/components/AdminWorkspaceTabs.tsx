import { Link, useLocation } from "react-router-dom";
import { useI18n } from "../i18n";

export type AdminWorkspaceTabId = "review" | "activity" | "insights" | "members";

interface AdminWorkspaceTabsProps {
  activeTab: AdminWorkspaceTabId;
  onSelectTab?: (tab: AdminWorkspaceTabId) => void;
}

const DASHBOARD_TABS: Array<{ id: Exclude<AdminWorkspaceTabId, "members">; labelKey: "adminTabReview" | "adminTabActivity" | "adminTabInsights" }> = [
  { id: "review", labelKey: "adminTabReview" },
  { id: "activity", labelKey: "adminTabActivity" },
  { id: "insights", labelKey: "adminTabInsights" },
];

export function AdminWorkspaceTabs({ activeTab, onSelectTab }: AdminWorkspaceTabsProps) {
  const { t } = useI18n();
  const location = useLocation();
  const dashboardPath = location.pathname.startsWith("/dashboard") ? "/dashboard" : "/admin";

  return (
    <nav className="workspace-tab-nav" aria-label={t("adminWorkspaceSectionsLabel")}>
      {DASHBOARD_TABS.map((tab) =>
        onSelectTab ? (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "is-active" : ""}
            onClick={() => onSelectTab(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ) : (
          <Link
            key={tab.id}
            className={activeTab === tab.id ? "is-active" : ""}
            to={`${dashboardPath}?tab=${tab.id}`}
          >
            {t(tab.labelKey)}
          </Link>
        ),
      )}
      {onSelectTab ? (
        <button
          type="button"
          className={activeTab === "members" ? "is-active" : ""}
          onClick={() => onSelectTab("members")}
        >
          {t("membersButton")}
        </button>
      ) : (
        <Link
          className={activeTab === "members" ? "is-active" : ""}
          to={`${dashboardPath}/access`}
        >
          {t("membersButton")}
        </Link>
      )}
    </nav>
  );
}
