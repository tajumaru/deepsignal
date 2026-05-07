interface ComposerStep {
  key: string;
  title: string;
  description: string;
}

interface FormBuilderStepsProps {
  steps: ComposerStep[];
  currentStep: string;
  completedSteps?: string[];
  onSelect?: (stepKey: string) => void;
}

export function FormBuilderSteps({
  steps,
  currentStep,
  completedSteps = [],
  onSelect,
}: FormBuilderStepsProps) {
  return (
    <nav className="composer-flow-steps" aria-label="Composer steps">
      {steps.map((step, index) => {
        const isCurrent = currentStep === step.key;
        const isComplete = completedSteps.includes(step.key);
        return (
          <button
            key={step.key}
            type="button"
            className={`composer-flow-step ${isCurrent ? "is-current" : ""} ${isComplete ? "is-complete" : ""}`}
            onClick={() => onSelect?.(step.key)}
            aria-current={isCurrent ? "step" : undefined}
          >
            <span className="composer-flow-step-index">{index + 1}</span>
            <span className="composer-flow-step-copy">
              <strong>{step.title}</strong>
              <small>{step.description}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
