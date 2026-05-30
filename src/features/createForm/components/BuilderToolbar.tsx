import { Link } from "react-router-dom";
import { FormBuilderSteps } from "../../../components/formBuilder/FormBuilderSteps";
import { getPublicFormPath } from "../../../lib/publicLinks";
import type { BuilderStepKey, Translate } from "../types";

interface BuilderToolbarProps {
  t: Translate;
  isScrolled: boolean;
  currentStep: BuilderStepKey;
  completedSteps: string[];
  disabledSteps?: BuilderStepKey[];
  capabilityConfigured: boolean;
  accessRoleLabel: string;
  adminCapLabel?: string;
  draftStateLabel?: string;
  savedFormId?: string;
  savedManifestBlobId?: string;
  onSelectStep: (step: BuilderStepKey) => void;
}

export function BuilderToolbar({
  t,
  isScrolled,
  currentStep,
  completedSteps,
  disabledSteps,
  capabilityConfigured,
  accessRoleLabel,
  adminCapLabel,
  draftStateLabel,
  savedFormId,
  savedManifestBlobId,
  onSelectStep,
}: BuilderToolbarProps) {
  const builderSteps = [
    { key: "template", title: "Step 1", description: t("stepTemplateDescription") },
    { key: "info", title: "Step 2", description: t("stepInfoDescription") },
    { key: "fields", title: "Step 3", description: t("stepFieldsDescription") },
    { key: "publish", title: "Step 4", description: t("stepPublishDescription") },
  ];

  return (
    <div className={`composer-toolbar panel ${isScrolled ? "is-scrolled" : ""}`}>
      <div className="composer-toolbar-copy">
        <p className="eyebrow">{t("builderEyebrow")}</p>
        <h1>{t("builderTitle")}</h1>
        <p className="muted composer-intro">{t("composerIntro")}</p>
        {capabilityConfigured ? (
          <p className="muted">
            {t("accessRoleLabel")}: {accessRoleLabel}
            {adminCapLabel ? ` (${adminCapLabel})` : ""}
          </p>
        ) : null}
        {draftStateLabel ? <p className="muted composer-draft-status">{draftStateLabel}</p> : null}
      </div>

      <FormBuilderSteps
        steps={builderSteps}
        currentStep={currentStep}
        completedSteps={completedSteps}
        disabledSteps={disabledSteps}
        getStateLabel={(state) =>
          state === "current" ? t("stepStateCurrent") : state === "done" ? t("stepStateDone") : t("stepStateUpcoming")
        }
        onSelect={(stepKey) => onSelectStep(stepKey as BuilderStepKey)}
      />

      <div className="composer-toolbar-actions">
        {savedFormId ? (
          <Link className="ghost-button" to={getPublicFormPath(savedFormId, savedManifestBlobId)}>
            {t("openLiveForm")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
