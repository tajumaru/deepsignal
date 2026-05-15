import type { Translate } from "../types";

interface StepNavigationActionsProps {
  t: Translate;
  onBack: () => void;
  onContinue?: () => void;
}

function StepBackIcon() {
  return (
    <svg aria-hidden="true" className="step-nav-icon" viewBox="0 0 24 24" focusable="false">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function StepContinueIcon() {
  return (
    <svg aria-hidden="true" className="step-nav-icon" viewBox="0 0 24 24" focusable="false">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function StepNavigationActions({ t, onBack, onContinue }: StepNavigationActionsProps) {
  const backLabel = t("back");
  const continueLabel = t("continue");

  return (
    <div className="composer-step-actions">
      <button
        type="button"
        className="ghost-button step-nav-button"
        onClick={onBack}
        aria-label={backLabel}
        title={backLabel}
      >
        <StepBackIcon />
        <span className="sr-only">{backLabel}</span>
      </button>
      {onContinue ? (
        <button
          type="button"
          className="primary-button step-nav-button"
          onClick={onContinue}
          aria-label={continueLabel}
          title={continueLabel}
        >
          <StepContinueIcon />
          <span className="sr-only">{continueLabel}</span>
        </button>
      ) : null}
    </div>
  );
}
