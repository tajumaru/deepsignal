import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CreateFormLink } from "../../../components/CreateFormLink";
import { useLongPress } from "../../../hooks/useLongPress";
import { useI18n } from "../../../i18n";

export type InboxOnboardingState = "create-project" | "create-signal" | "ready";

function MobileFilterCaret() {
  return (
    <span className="mobile-inbox-filter-caret" aria-hidden="true">
      <svg viewBox="0 0 12 12" focusable="false">
        <path d="m2.2 4.5 3.8 3.6 3.8-3.6" />
      </svg>
    </span>
  );
}

interface WorkspaceShortcutBarProps {
  hasAdminAccess: boolean;
  selectedProjectName: string | null;
  selectedProjectId: string;
  projects: Array<{ objectId: string; name: string }>;
  highlightCreateFormCta: boolean;
  onSelectProject: (projectId: string) => void;
  onRevealCreateProject: () => void;
  onRevealConnectProject: () => void;
  className?: string;
}

export function WorkspaceShortcutBar({
  hasAdminAccess,
  selectedProjectName,
  selectedProjectId,
  projects,
  highlightCreateFormCta,
  onSelectProject,
  onRevealCreateProject,
  onRevealConnectProject,
  className = "",
}: WorkspaceShortcutBarProps) {
  const { t } = useI18n();
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!projectMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!projectMenuRef.current?.contains(event.target as Node)) {
        setProjectMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProjectMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [projectMenuOpen]);

  return (
    <div className={`workspace-shortcut-bar ${className}`.trim()}>
      <CreateFormLink
        className={`primary-button workspace-action-card workspace-action-card-primary workspace-action-card-compose ${
          highlightCreateFormCta ? "create-form-cta-highlight" : ""
        }`}
      >
        <span className="workspace-action-card-icon" aria-hidden="true" />
        <span className="workspace-action-card-copy">
          <strong>{t("composeSignalCta")}</strong>
          <span>{t("composeSignalCtaDetail")}</span>
        </span>
        <span className="workspace-action-card-arrow" aria-hidden="true" />
      </CreateFormLink>
      {hasAdminAccess ? (
        <>
          <button
            type="button"
            className="ghost-button workspace-action-card workspace-action-card-project"
            onClick={onRevealCreateProject}
          >
            <span className="workspace-action-card-icon" aria-hidden="true" />
            <span className="workspace-action-card-copy">
              <strong>{t("createProjectButton")}</strong>
              <span>{t("createProjectButtonDetail")}</span>
            </span>
            <span className="workspace-action-card-arrow" aria-hidden="true" />
          </button>
          {!selectedProjectName ? (
            <button
              type="button"
              className="ghost-button workspace-action-card workspace-action-card-connect"
              onClick={onRevealConnectProject}
            >
              <span className="workspace-action-card-icon" aria-hidden="true" />
              <span className="workspace-action-card-copy">
                <strong>{t("connectExistingShort")}</strong>
                <span>{t("connectExistingShortDetail")}</span>
              </span>
              <span className="workspace-action-card-arrow" aria-hidden="true" />
            </button>
          ) : null}
        </>
      ) : null}
      {hasAdminAccess ? (
        <div ref={projectMenuRef} className={`workspace-project-menu-shell ${projectMenuOpen ? "is-open" : ""}`}>
          <button
            type="button"
            className={`ghost-button workspace-project-menu-trigger workspace-action-card workspace-action-card-current ${
              projectMenuOpen ? "is-open" : ""
            }`}
            onClick={() => setProjectMenuOpen((current) => !current)}
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
            aria-label={t("selectedProjectLabel")}
          >
            <span className="workspace-action-card-icon" aria-hidden="true">
              {selectedProjectName ? selectedProjectName.slice(0, 1).toUpperCase() : "D"}
            </span>
            <span className="workspace-action-card-copy">
              <strong>{selectedProjectName ?? t("chooseProjectButton")}</strong>
              <span>{selectedProjectName ? t("openProjectDetail") : t("chooseProjectDetail")}</span>
            </span>
            <span className="workspace-action-card-arrow" aria-hidden="true" />
            <MobileFilterCaret />
          </button>
          {projectMenuOpen ? (
            <div className="workspace-project-menu panel" role="menu" aria-label={t("selectedProjectLabel")}>
              {projects.length > 0 ? (
                projects.map((project) => {
                  const active = project.objectId === selectedProjectId;
                  return (
                    <button
                      key={project.objectId}
                      type="button"
                      className={`workspace-project-menu-option ${active ? "is-active" : ""}`}
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        onSelectProject(project.objectId);
                        setProjectMenuOpen(false);
                      }}
                    >
                      <span>{project.name}</span>
                    </button>
                  );
                })
              ) : (
                <button
                  type="button"
                  className="workspace-project-menu-option"
                  role="menuitem"
                  onClick={() => {
                    onRevealConnectProject();
                    setProjectMenuOpen(false);
                  }}
                >
                  <span>{t("connectExistingShort")}</span>
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function HoldToDeleteProjectButton({
  disabledReason,
  deleting,
  onDelete,
}: {
  disabledReason: string;
  deleting: boolean;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const disabled = deleting || Boolean(disabledReason);
  const { isHolding, progress, handlers } = useLongPress<HTMLButtonElement>({
    duration: 3000,
    allowMouse: true,
    enabled: !disabled,
    onComplete: onDelete,
  });
  const style = {
    "--project-delete-hold-progress": String(progress),
  } as CSSProperties;

  return (
    <button
      type="button"
      className={`danger-button signal-inbox-onboarding-delete-project ${isHolding ? "is-holding" : ""}`}
      disabled={disabled}
      title={disabledReason || t("deleteProjectHoldHint")}
      aria-label={disabledReason || t("deleteProjectHoldHint")}
      style={style}
      {...handlers}
      onClick={(event) => event.preventDefault()}
    >
      <span className="signal-inbox-onboarding-delete-label">
        {deleting ? t("deletingLabel") : t("deleteProjectButton")}
      </span>
      <span className="project-delete-hold-ripple" aria-hidden="true">
        <span className="project-delete-hold-wave project-delete-hold-wave-primary" />
        <span className="project-delete-hold-wave project-delete-hold-wave-secondary" />
        <span className="project-delete-hold-mark">☠</span>
      </span>
      <span className="project-delete-hold-progress" aria-hidden="true" />
    </button>
  );
}

export function SignalInboxOnboardingHero({
  state,
  projectName,
  projects,
  selectedProjectId,
  selectProject,
  onRevealCreateProject,
  onRevealConnectProject: _onRevealConnectProject,
  deleteProjectDisabledReason,
  deletingProject,
  onDeleteProject,
  highlightCreateFormCta,
}: {
  state: InboxOnboardingState;
  projectName: string | null;
  projects: Array<{ objectId: string; name: string }>;
  selectedProjectId: string;
  selectProject: (projectId: string) => void;
  onRevealCreateProject: () => void;
  onRevealConnectProject: () => void;
  deleteProjectDisabledReason: string;
  deletingProject: boolean;
  onDeleteProject: () => void;
  highlightCreateFormCta: boolean;
}) {
  const { t } = useI18n();
  void _onRevealConnectProject;
  const isCreateProjectState = state === "create-project";
  const onboardingProjectId = selectedProjectId || projects[0]?.objectId || "";

  return (
    <section className="panel glow-panel workspace-hero workspace-hero-compact desktop-signal-inbox-hero signal-inbox-onboarding-hero">
      <div className="workspace-hero-main workspace-overview-shell signal-inbox-onboarding-layout">
        <div className="workspace-hero-copy signal-inbox-onboarding-copy">
          <p className="eyebrow">{t("encryptedSignalInboxLabel")}</p>
          <h1>
            {isCreateProjectState ? t("signalInboxOnboardingCreateProjectTitle") : t("signalInboxOnboardingCreateSignalTitle")}
          </h1>
          <p className="lede">
            {isCreateProjectState ? t("signalInboxOnboardingCreateProjectBody") : t("signalInboxOnboardingCreateSignalBody")}
          </p>
          {!isCreateProjectState && projectName ? (
            <div className="signal-inbox-onboarding-meta">
              <span className="workspace-meta-item">{projectName}</span>
            </div>
          ) : null}
        </div>

        <aside className="workspace-action-dock signal-inbox-onboarding-actions">
          {isCreateProjectState ? (
            <div className="signal-inbox-onboarding-action-group">
              <div className="signal-inbox-onboarding-action-copy">
                <p className="eyebrow">{t("nextStepLabel")}</p>
                <p className="signal-inbox-onboarding-next-step">{t("signalInboxOnboardingCreateProjectHint")}</p>
              </div>
              <button type="button" className="primary-button" onClick={onRevealCreateProject}>
                {t("createProjectButton")}
              </button>
              <CreateFormLink className="signal-inbox-onboarding-secondary-action">
                {t("signalInboxOnboardingCreateSignalWithoutProject")}
              </CreateFormLink>
            </div>
          ) : (
            <>
              <CreateFormLink className={`primary-button ${highlightCreateFormCta ? "create-form-cta-highlight" : ""}`}>
                {t("composeSignalCta")}
              </CreateFormLink>
              <div className="signal-inbox-onboarding-project-picker">
                <span className="signal-inbox-onboarding-project-label">{t("selectedProjectLabel")}</span>
                <div className="workspace-shortcut-bar signal-inbox-onboarding-project-bar">
                  <div className="workspace-project-menu-shell signal-inbox-onboarding-project-shell">
                    <select
                      className="signal-inbox-onboarding-project-select"
                      value={onboardingProjectId}
                      onChange={(event) => selectProject(event.target.value)}
                      aria-label={t("selectedProjectLabel")}
                    >
                      {projects.map((project) => (
                        <option key={project.objectId} value={project.objectId}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {projectName ? (
                    <HoldToDeleteProjectButton
                      disabledReason={deleteProjectDisabledReason}
                      deleting={deletingProject}
                      onDelete={onDeleteProject}
                    />
                  ) : null}
                  <button type="button" className="ghost-button" onClick={onRevealCreateProject}>
                    {t("createProjectButton")}
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
