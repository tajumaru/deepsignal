import { useEffect, useRef } from "react";

interface ComposerStep {
  key: string;
  title: string;
  description: string;
}

interface FormBuilderStepsProps {
  steps: ComposerStep[];
  currentStep: string;
  completedSteps?: string[];
  disabledSteps?: string[];
  getStateLabel?: (state: "current" | "done" | "upcoming") => string;
  onSelect?: (stepKey: string) => void;
}

export function FormBuilderSteps({
  steps,
  currentStep,
  completedSteps = [],
  disabledSteps = [],
  getStateLabel,
  onSelect,
}: FormBuilderStepsProps) {
  const navRef = useRef<HTMLElement | null>(null);
  const stepRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const nav = navRef.current;
    const currentButton = stepRefs.current[currentStep];
    if (!nav || !currentButton) {
      return;
    }

    const isHorizontallyScrollable = nav.scrollWidth > nav.clientWidth;
    if (!isHorizontallyScrollable) {
      return;
    }

    const targetLeft = Math.max(
      0,
      currentButton.offsetLeft - (nav.clientWidth - currentButton.offsetWidth) / 2,
    );
    nav.scrollTo({
      left: targetLeft,
      behavior: "smooth",
    });
  }, [currentStep]);

  return (
    <nav ref={navRef} className="composer-flow-steps" aria-label="Composer steps">
      {steps.map((step, index) => {
        const isCurrent = currentStep === step.key;
        const isComplete = completedSteps.includes(step.key);
        const isDisabled = disabledSteps.includes(step.key);
        const state = isCurrent ? "current" : isComplete ? "done" : "upcoming";
        return (
          <button
            key={step.key}
            ref={(node) => {
              stepRefs.current[step.key] = node;
            }}
            type="button"
            className={`composer-flow-step ${isCurrent ? "is-current" : ""} ${isComplete ? "is-complete" : ""} ${isDisabled ? "is-disabled" : ""}`}
            disabled={isDisabled}
            onClick={() => onSelect?.(step.key)}
            aria-current={isCurrent ? "step" : undefined}
          >
            <span className="composer-flow-step-state">
              {getStateLabel?.(state) ?? (isCurrent ? "Current" : isComplete ? "Done" : "Upcoming")}
            </span>
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
