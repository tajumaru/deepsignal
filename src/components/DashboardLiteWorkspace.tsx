import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { WalletConnectSurface } from "./WalletConnectSurface";
import { buildInfo } from "../lib/buildInfo";
import { getBrowserCapabilitiesSnapshot, logRouteLifecycle } from "../lib/routeDiagnostics";
import type { WalletSessionPhase } from "../walletSessionState";

type ProjectSummaryLite = {
  formsCount?: number;
  name?: string;
  objectId?: string;
  signalsCount?: number;
};

type SubmissionLite = {
  createdAt?: string;
  formId?: string;
  id?: string;
  isEncrypted?: boolean;
  priority?: string;
  triageStatus?: string;
};

type LiteWorkspaceSnapshot = {
  formsCount: number;
  recentProjects: ProjectSummaryLite[];
  recentSignals: SubmissionLite[];
  selectedProjectId: string;
  submissionsCount: number;
};

const FORMS_KEY = "deepsignal.forms";
const SUBMISSIONS_KEY = "deepsignal.submissions";
const RECENT_PROJECTS_KEY = "deepsignal.projectRegistry.recentProjects";
const SELECTED_PROJECT_ID_KEY = "deepsignal.projectRegistry.selectedProjectId";
const PROJECT_REGISTRY_STORAGE_EVENT = "deepsignal:project-registry-storage";

function normalizeObjectId(value?: string | null) {
  if (!value) {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") {
    return "";
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function readJsonArray<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function readNamespacedStorageValue(prefix: string) {
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(prefix)) {
      continue;
    }
    const value = window.localStorage.getItem(key);
    if (value) {
      return value;
    }
  }
  return "";
}

function loadSelectedProjectId() {
  const direct = normalizeObjectId(window.localStorage.getItem(SELECTED_PROJECT_ID_KEY));
  if (direct) {
    return direct;
  }
  return normalizeObjectId(readNamespacedStorageValue(`${SELECTED_PROJECT_ID_KEY}:`));
}

function loadRecentProjects() {
  const direct = readJsonArray<ProjectSummaryLite>(RECENT_PROJECTS_KEY);
  if (direct.length > 0) {
    return direct;
  }
  try {
    const raw = readNamespacedStorageValue(`${RECENT_PROJECTS_KEY}:`);
    if (!raw) {
      return [] as ProjectSummaryLite[];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProjectSummaryLite[]) : [];
  } catch {
    return [];
  }
}

function loadLiteWorkspaceSnapshot(): LiteWorkspaceSnapshot {
  const forms = readJsonArray<{ id?: string }>(FORMS_KEY);
  const submissions = readJsonArray<SubmissionLite>(SUBMISSIONS_KEY).sort((left, right) =>
    String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")),
  );
  return {
    formsCount: forms.length,
    recentProjects: loadRecentProjects().slice(0, 3),
    recentSignals: submissions.slice(0, 5),
    selectedProjectId: loadSelectedProjectId(),
    submissionsCount: submissions.length,
  };
}

function formatSignalDate(value?: string) {
  if (!value) {
    return "Unknown time";
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function DashboardLiteWorkspace({
  advancedLoadError,
  advancedLoading,
  autoOpenAfterConnect,
  onOpenAdvancedWorkspace,
  routePath,
  walletSessionPhase,
}: {
  advancedLoadError?: unknown;
  advancedLoading: boolean;
  autoOpenAfterConnect: boolean;
  onOpenAdvancedWorkspace: () => void;
  routePath: string;
  walletSessionPhase: WalletSessionPhase;
}) {
  const [snapshot, setSnapshot] = useState<LiteWorkspaceSnapshot>(() =>
    typeof window === "undefined"
      ? {
          formsCount: 0,
          recentProjects: [],
          recentSignals: [],
          selectedProjectId: "",
          submissionsCount: 0,
        }
      : loadLiteWorkspaceSnapshot(),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const refresh = () => setSnapshot(loadLiteWorkspaceSnapshot());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(PROJECT_REGISTRY_STORAGE_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(PROJECT_REGISTRY_STORAGE_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    logRouteLifecycle("dashboard:lite-workspace-render", {
      routePath,
      formsCount: snapshot.formsCount,
      submissionsCount: snapshot.submissionsCount,
      selectedProjectId: snapshot.selectedProjectId,
      recentProjectsCount: snapshot.recentProjects.length,
      recentSignalsCount: snapshot.recentSignals.length,
      mobileSafari: Boolean(getBrowserCapabilitiesSnapshot().mobileSafari),
    });
  }, [
    routePath,
    snapshot.formsCount,
    snapshot.recentProjects.length,
    snapshot.recentSignals.length,
    snapshot.selectedProjectId,
    snapshot.submissionsCount,
  ]);

  const advancedErrorMessage = advancedLoadError instanceof Error
    ? advancedLoadError.message
    : advancedLoadError
      ? String(advancedLoadError)
      : "";
  const walletConnected = walletSessionPhase === "connected";
  const walletRestoring = walletSessionPhase === "restoring";
  const walletDeferred = walletSessionPhase === "provider_deferred";
  const showWalletConnectCta = !walletConnected;
  const showAdvancedWorkspaceButton = walletConnected || !autoOpenAfterConnect;

  return (
    <main className="dashboard-degraded-shell" role="main" aria-label="Signal Intelligence Workspace">
      <section className="panel glow-panel route-status-panel">
        <p className="eyebrow">Signal Intelligence Workspace</p>
        <h1>{walletConnected ? "Local inbox ready" : "Connect wallet to continue"}</h1>
        <p className="muted">
          {walletConnected
            ? "DeepSignal restored the local inbox first. Heavy reviewer tools stay deferred until you explicitly open the advanced workspace."
            : autoOpenAfterConnect
              ? "DeepSignal restored the local inbox first. Connect your reviewer wallet and the secure workspace will open automatically."
              : "DeepSignal restored the local inbox first. Connect your reviewer wallet, then open the secure workspace."}
        </p>
        <dl className="route-status-metadata">
          <div>
            <dt>Version</dt>
            <dd>{buildInfo.label}</dd>
          </div>
          <div>
            <dt>Route</dt>
            <dd>{routePath}</dd>
          </div>
          <div>
            <dt>Selected project</dt>
            <dd>{snapshot.selectedProjectId || "none"}</dd>
          </div>
          <div>
            <dt>Local forms</dt>
            <dd>{snapshot.formsCount}</dd>
          </div>
          <div>
            <dt>Local signals</dt>
            <dd>{snapshot.submissionsCount}</dd>
          </div>
        </dl>
        {advancedErrorMessage ? <p className="muted">Advanced workspace failed: {advancedErrorMessage}</p> : null}
        {showWalletConnectCta ? (
          <div className="dashboard-lite-wallet-connect">
            <WalletConnectSurface compact />
            {walletRestoring || walletDeferred ? (
              <p className="muted">
                {walletRestoring ? "Restoring secure session..." : "Reviewer wallet stays dormant until you request it."}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="inline-actions">
          {showAdvancedWorkspaceButton ? (
            <button type="button" className="primary-button" onClick={onOpenAdvancedWorkspace} disabled={advancedLoading}>
              {advancedLoading ? "Opening advanced workspace..." : "Open advanced workspace"}
            </button>
          ) : null}
          <Link className="ghost-button" to="/create">
            Compose Signal
          </Link>
          <Link className="ghost-button" to="/explore">
            Explore Signals
          </Link>
        </div>
      </section>
      <section className="panel glow-panel route-status-panel">
        <p className="eyebrow">Recent signal flow</p>
        <h2>Latest local signals</h2>
        {snapshot.recentSignals.length > 0 ? (
          <div className="route-status-metadata">
            {snapshot.recentSignals.map((submission) => (
              <div key={submission.id ?? `${submission.formId}:${submission.createdAt}`}>
                <dt>{submission.triageStatus || submission.priority || "signal"}</dt>
                <dd>
                  {submission.isEncrypted ? "Encrypted signal" : "Local signal"} · {formatSignalDate(submission.createdAt)}
                </dd>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No local signals yet. Create a project, then compose your first signal.</p>
        )}
      </section>
      <section className="panel glow-panel route-status-panel">
        <p className="eyebrow">Project context</p>
        <h2>Recent projects</h2>
        {snapshot.recentProjects.length > 0 ? (
          <div className="route-status-metadata">
            {snapshot.recentProjects.map((project) => (
              <div key={project.objectId ?? project.name ?? "project"}>
                <dt>{project.name || project.objectId || "Untitled project"}</dt>
                <dd>{`${project.formsCount ?? 0} forms · ${project.signalsCount ?? 0} signals`}</dd>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No recent projects stored locally yet.</p>
        )}
      </section>
    </main>
  );
}
