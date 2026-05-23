import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { ProjectSummary } from "../../../lib/projectRegistry";

type ProjectWorkspaceModalMode = "select" | "create" | "connect";

interface ProjectWorkspaceModalProps {
  mode: ProjectWorkspaceModalMode;
  projects: ProjectSummary[];
  selectedProjectId: string;
  projectCreateName: string;
  manualProjectId: string;
  isCreatingProject: boolean;
  projectState: string;
  createInputRef: RefObject<HTMLInputElement>;
  connectInputRef: RefObject<HTMLInputElement>;
  onSelectProject: (projectId: string) => void;
  onProjectCreateNameChange: (value: string) => void;
  onManualProjectIdChange: (value: string) => void;
  onCreateProject: () => void | Promise<void>;
  onConnectProject: () => void | Promise<void>;
  onClose: () => void;
  labels: {
    close: string;
    cancel: string;
    currentProject: string;
    selectedStatus: string;
    noProjectSelectedStatus: string;
    selectTitle: string;
    selectBody: string;
    selectEmpty: string;
    createTitle: string;
    createBody: string;
    createPlaceholder: string;
    createButton: string;
    creatingLabel: string;
    connectTitle: string;
    connectBody: string;
    connectPlaceholder: string;
    connectButton: string;
    projectStats: (params?: { forms?: number; signals?: number }) => string;
  };
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function ProjectWorkspaceModal({
  mode,
  projects,
  selectedProjectId,
  projectCreateName,
  manualProjectId,
  isCreatingProject,
  projectState,
  createInputRef,
  connectInputRef,
  onSelectProject,
  onProjectCreateNameChange,
  onManualProjectIdChange,
  onCreateProject,
  onConnectProject,
  onClose,
  labels,
}: ProjectWorkspaceModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectedProject = useMemo(
    () => projects.find((project) => project.objectId === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    window.setTimeout(() => {
      if (mode === "create") {
        createInputRef.current?.focus();
        return;
      }
      if (mode === "connect") {
        connectInputRef.current?.focus();
        return;
      }
      closeButtonRef.current?.focus();
    }, 10);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [connectInputRef, createInputRef, mode, onClose]);

  const modalTitle =
    mode === "create"
      ? labels.createTitle
      : mode === "connect"
        ? labels.connectTitle
        : labels.selectTitle;
  const modalBody =
    mode === "create"
      ? labels.createBody
      : mode === "connect"
        ? labels.connectBody
        : labels.selectBody;

  return (
    <div className="modal-backdrop export-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="answer-card export-confirmation-modal project-workspace-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-workspace-modal-title"
        aria-describedby="project-workspace-modal-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-row">
          <div>
            <p className="eyebrow">{labels.currentProject}</p>
            <h3 id="project-workspace-modal-title">{modalTitle}</h3>
          </div>
          <button ref={closeButtonRef} type="button" className="ghost-button" onClick={onClose}>
            {labels.close}
          </button>
        </div>

        <p id="project-workspace-modal-description" className="muted">
          {modalBody}
        </p>

        <div className="project-workspace-modal-status">
          <span className="signal-chip signal-chip-soft">
            {selectedProject ? labels.selectedStatus : labels.noProjectSelectedStatus}
          </span>
          {selectedProject ? (
            <span className="signal-chip">
              {selectedProject.name} - {labels.projectStats({ forms: selectedProject.formsCount, signals: selectedProject.signalsCount })}
            </span>
          ) : null}
        </div>

        {mode === "select" ? (
          <div className="project-workspace-modal-list">
            {projects.length > 0 ? (
              projects.map((project) => {
                const isSelected = project.objectId === selectedProjectId;
                return (
                  <button
                    key={project.objectId}
                    type="button"
                    className={`project-workspace-modal-item ${isSelected ? "is-selected" : ""}`}
                    onClick={() => onSelectProject(project.objectId)}
                  >
                    <span className="project-workspace-modal-item-copy">
                      <strong>{project.name}</strong>
                      <span className="muted">
                        {labels.projectStats({ forms: project.formsCount, signals: project.signalsCount })}
                      </span>
                    </span>
                    {isSelected ? <span className="signal-chip signal-chip-soft">{labels.selectedStatus}</span> : null}
                  </button>
                );
              })
            ) : (
              <div className="project-workspace-modal-empty">
                <p>{labels.selectEmpty}</p>
              </div>
            )}
          </div>
        ) : null}

        {mode === "create" ? (
          <div className="project-workspace-modal-form">
            <input
              ref={createInputRef}
              value={projectCreateName}
              onChange={(event) => onProjectCreateNameChange(event.target.value)}
              placeholder={labels.createPlaceholder}
            />
            <div className="inline-actions export-confirmation-actions">
              <button type="button" className="ghost-button" onClick={onClose}>
                {labels.cancel}
              </button>
              <button type="button" className="primary-button" onClick={() => void onCreateProject()} disabled={isCreatingProject}>
                {isCreatingProject ? labels.creatingLabel : labels.createButton}
              </button>
            </div>
          </div>
        ) : null}

        {mode === "connect" ? (
          <div className="project-workspace-modal-form">
            <input
              ref={connectInputRef}
              value={manualProjectId}
              onChange={(event) => onManualProjectIdChange(event.target.value)}
              placeholder={labels.connectPlaceholder}
            />
            <div className="inline-actions export-confirmation-actions">
              <button type="button" className="ghost-button" onClick={onClose}>
                {labels.cancel}
              </button>
              <button type="button" className="primary-button" onClick={() => void onConnectProject()}>
                {labels.connectButton}
              </button>
            </div>
          </div>
        ) : null}

        {projectState ? <p className="project-workspace-modal-feedback">{projectState}</p> : null}
      </section>
    </div>
  );
}
