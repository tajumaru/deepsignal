import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import type { Translate } from "../../features/createForm/types";
import type { FormTemplateDefinition, SignalTypeKey, TemplateSignalType } from "../../lib/formTemplates";

interface TemplatePickerProps {
  templates: FormTemplateDefinition[];
  selectedTemplateKey: string;
  onSelect: (templateKey: string) => void;
}

type TranslationKey = Parameters<Translate>[0];

const LIBRARY_SECTIONS = [
  { key: "quick", titleKey: "templateSectionQuickTitle", descriptionKey: "templateSectionQuickDescription" },
  { key: "advanced", titleKey: "templateSectionAdvancedTitle", descriptionKey: "templateSectionAdvancedDescription" },
  { key: "custom", titleKey: "templateSectionCustomTitle", descriptionKey: "templateSectionCustomDescription" },
] as const;

const TEMPLATE_COPY_KEYS = {
  "encrypted-report": {
    label: "templateEncryptedReportLabel",
    description: "templateEncryptedReportDescription",
    bestFor: "templateEncryptedReportBestFor",
    featuredEyebrow: "templateEncryptedReportFeaturedEyebrow",
    featuredTitle: "templateEncryptedReportFeaturedTitle",
    featuredDescription: "templateEncryptedReportFeaturedDescription",
    featuredPoweredBy: "templateEncryptedReportFeaturedPoweredBy",
  },
  bug: {
    label: "templateBugLabel",
    description: "templateBugDescription",
    bestFor: "templateBugBestFor",
  },
  feature: {
    label: "templateFeatureLabel",
    description: "templateFeatureDescription",
    bestFor: "templateFeatureBestFor",
  },
  feedback: {
    label: "templateFeedbackLabel",
    description: "templateFeedbackDescription",
    bestFor: "templateFeedbackBestFor",
  },
  survey: {
    label: "templateSurveyLabel",
    description: "templateSurveyDescription",
    bestFor: "templateSurveyBestFor",
  },
  playtest: {
    label: "templatePlaytestLabel",
    description: "templatePlaytestDescription",
    bestFor: "templatePlaytestBestFor",
  },
  beta: {
    label: "templateBetaLabel",
    description: "templateBetaDescription",
    bestFor: "templateBetaBestFor",
  },
  "anonymous-drop": {
    label: "templateAnonymousDropLabel",
    description: "templateAnonymousDropDescription",
    bestFor: "templateAnonymousDropBestFor",
  },
  "disaster-checkin": {
    label: "templateDisasterCheckinLabel",
    description: "templateDisasterCheckinDescription",
    bestFor: "templateDisasterCheckinBestFor",
  },
  custom: {
    label: "templateCustomLabel",
    description: "templateCustomDescription",
    bestFor: "templateCustomBestFor",
  },
  blank: {
    label: "templateBlankLabel",
    description: "templateBlankDescription",
    bestFor: "templateBlankBestFor",
  },
} as const satisfies Record<
  string,
  Partial<
    Record<
      "label" | "description" | "bestFor" | "featuredEyebrow" | "featuredTitle" | "featuredDescription" | "featuredPoweredBy",
      TranslationKey
    >
  >
>;

const SIGNAL_TYPE_LABEL_KEYS: Record<SignalTypeKey, TranslationKey> = {
  secure: "signalTypeSecure",
  anonymous: "signalTypeAnonymous",
  location: "signalTypeLocation",
  testing: "signalTypeTesting",
  incident: "signalTypeIncident",
  feedback: "signalTypeFeedback",
};

const BADGE_LABEL_KEYS: Record<string, TranslationKey> = {
  Secure: "templateBadgeSecure",
  "Walrus-backed": "templateBadgeWalrusBacked",
  "Seal encrypted": "templateBadgeSealEncrypted",
  "Optional anonymous": "templateBadgeOptionalAnonymous",
  Incident: "templateBadgeIncident",
  "Media-ready": "templateBadgeMediaReady",
  Ideas: "templateBadgeIdeas",
  "Quick response": "templateBadgeQuickResponse",
  "Structured prompts": "templateBadgeStructuredPrompts",
  "Anonymous-ready": "templateBadgeAnonymousReady",
  "Mobile friendly": "templateBadgeMobileFriendly",
  Pulse: "templateBadgePulse",
  "Trend-ready": "templateBadgeTrendReady",
  "Lightweight rollout": "templateBadgeLightweightRollout",
  Testing: "templateBadgeTesting",
  "Session-ready": "templateBadgeSessionReady",
  Encrypted: "templateBadgeEncrypted",
  "Environment context": "templateBadgeEnvironmentContext",
  Anonymous: "templateBadgeAnonymous",
  "Guest mode": "templateBadgeGuestMode",
  "Metadata minimized": "templateBadgeMetadataMinimized",
  Location: "templateBadgeLocation",
  "GPS ready": "templateBadgeGpsReady",
  "Time-sensitive": "templateBadgeTimeSensitive",
  "Fast scaffold": "templateBadgeFastScaffold",
  "Flexible setup": "templateBadgeFlexibleSetup",
  "Blank canvas": "templateBadgeBlankCanvas",
  "Full control": "templateBadgeFullControl",
  Lightweight: "templateBadgeLightweight",
};

export function TemplatePicker({ templates, selectedTemplateKey, onSelect }: TemplatePickerProps) {
  const { t } = useI18n();
  const [activeFilter, setActiveFilter] = useState<SignalTypeKey | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const syncViewport = () => setIsMobileViewport(mediaQuery.matches);
    syncViewport();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  const signalTypes = useMemo(() => {
    const seen = new Set<SignalTypeKey>();
    const ordered: TemplateSignalType[] = [];
    for (const template of templates) {
      for (const signalType of template.signalTypes) {
        if (seen.has(signalType.key)) {
          continue;
        }
        seen.add(signalType.key);
        ordered.push(signalType);
      }
    }
    return ordered;
  }, [templates]);

  const groupedTemplates = useMemo(
    () =>
      LIBRARY_SECTIONS.map((section) => ({
        ...section,
        title: t(section.titleKey),
        description: t(section.descriptionKey),
        templates: templates.filter(
          (template) =>
            template.librarySection === section.key &&
            (activeFilter === null || template.signalTypes.some((signalType) => signalType.key === activeFilter)),
        ),
      })).filter((section) => section.templates.length > 0),
    [activeFilter, templates, t],
  );

  const mobileTemplates = useMemo(
    () => groupedTemplates.flatMap((section) => section.templates),
    [groupedTemplates],
  );

  function toggleSignalFilter(signalTypeKey: SignalTypeKey) {
    setActiveFilter((current) => (current === signalTypeKey ? null : signalTypeKey));
  }

  function getTemplateCopy(template: FormTemplateDefinition): {
    label: string;
    description: string;
    bestFor: string;
    featuredEyebrow: string;
    featuredTitle: string;
    featuredDescription: string;
    featuredPoweredBy: string;
  } {
    const keys: Partial<
      Record<
        "label" | "description" | "bestFor" | "featuredEyebrow" | "featuredTitle" | "featuredDescription" | "featuredPoweredBy",
        TranslationKey
      >
    > | null = TEMPLATE_COPY_KEYS[template.key as keyof typeof TEMPLATE_COPY_KEYS] ?? null;
    return {
      label: keys?.label ? t(keys.label) : template.label,
      description: keys?.description ? t(keys.description) : template.description,
      bestFor: keys?.bestFor ? t(keys.bestFor) : t("templateDefaultBestFor"),
      featuredEyebrow: keys?.featuredEyebrow ? t(keys.featuredEyebrow) : template.featured?.eyebrow ?? "",
      featuredTitle: keys?.featuredTitle ? t(keys.featuredTitle) : template.featured?.title ?? template.title,
      featuredDescription: keys?.featuredDescription ? t(keys.featuredDescription) : template.featured?.description ?? template.description,
      featuredPoweredBy: keys?.featuredPoweredBy ? t(keys.featuredPoweredBy) : template.featured?.poweredBy ?? "",
    };
  }

  function getSignalTypeLabel(signalType: TemplateSignalType) {
    const key = SIGNAL_TYPE_LABEL_KEYS[signalType.key];
    return key ? t(key) : signalType.label;
  }

  function getBadgeLabel(label: string) {
    const key = BADGE_LABEL_KEYS[label];
    return key ? t(key) : label;
  }

  function getPresetSummary(template: FormTemplateDefinition) {
    const summary: string[] = [];
    if (template.automation?.encryptSubmissions) {
      summary.push(t("templatePresetSealOn"));
    }
    summary.push(
      template.automation?.identityPolicy === "wallet_required"
        ? t("templatePresetWalletVerified")
        : t("templatePresetWalletOptional"),
    );
    if (template.automation?.locationRequirement === "required") {
      summary.push(t("templatePresetLocationCapture"));
    }
    return summary.join(" / ");
  }

  function getFieldSummary(template: FormTemplateDefinition) {
    if (template.fields.length === 0) {
      return t("templateStartsBlank");
    }
    return t("templateStartsWithFields", { count: template.fields.length });
  }

  function renderBadges(badges: FormTemplateDefinition["cardBadges"], className = "") {
    return (
      <div className={`signal-template-badge-row ${className}`.trim()}>
        {badges.map((badge) => (
          <span key={`${badge.label}-${badge.icon}`} className="signal-template-badge">
            <span aria-hidden="true">{badge.icon}</span>
            {getBadgeLabel(badge.label)}
          </span>
        ))}
      </div>
    );
  }

  function renderTemplateCard(template: FormTemplateDefinition) {
    const active = selectedTemplateKey === template.key;
    const copy = getTemplateCopy(template);
    const hiddenBadges = template.capabilities.filter(
      (badge) => !template.cardBadges.some((cardBadge) => cardBadge.label === badge.label),
    );

    return (
      <button
        key={template.key}
        type="button"
        className={`composer-template-card ${active ? "is-active" : ""}`}
        onClick={() => onSelect(template.key)}
        aria-pressed={active}
      >
        <div className="composer-template-card-header">
          <span className="composer-template-emoji" aria-hidden="true">
            {template.emoji}
          </span>
          <div className="composer-template-card-copy">
            <strong>{copy.label}</strong>
            <span className="muted composer-template-description">{copy.description}</span>
          </div>
        </div>

        {renderBadges(template.cardBadges)}

        <div className="composer-template-card-details">
          {hiddenBadges.length > 0 ? renderBadges(hiddenBadges, "is-detail-row") : null}
          <div className="composer-template-detail-list">
            <span>{getPresetSummary(template)}</span>
            <span>{getFieldSummary(template)}</span>
            <span>{t("templateBestForPrefix", { value: copy.bestFor })}</span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="composer-template-scroll">
      {!isMobileViewport ? (
        <div className="composer-template-filter-bar">
          <div className="composer-template-filter-copy">
            <span className="composer-template-filter-label">{t("templateLibraryFilterLabel")}</span>
            <span className="composer-template-filter-help">
              {activeFilter
                ? t("templateLibraryFilterHelpActive", {
                    label: getSignalTypeLabel(signalTypes.find((item) => item.key === activeFilter) ?? signalTypes[0]),
                  })
                : t("templateLibraryFilterHelpAll")}
            </span>
          </div>
          <div className="composer-template-signal-nav" aria-label={t("templateLibraryFilterAriaLabel")}>
            <button
              type="button"
              aria-pressed={activeFilter === null}
              className={`composer-signal-type-chip ${activeFilter === null ? "is-active" : ""}`}
              onClick={() => setActiveFilter(null)}
            >
              <span aria-hidden="true">*</span>
              {t("templateFilterAll")}
            </button>
            {signalTypes.map((signalType) => {
              const active = activeFilter === signalType.key;
              return (
                <button
                  key={signalType.key}
                  type="button"
                  aria-pressed={active}
                  className={`composer-signal-type-chip ${active ? "is-active" : ""}`}
                  onClick={() => toggleSignalFilter(signalType.key)}
                >
                  <span aria-hidden="true">{signalType.icon}</span>
                  {getSignalTypeLabel(signalType)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="composer-template-library">
        {isMobileViewport ? (
          <div className="composer-template-grid composer-template-grid-mobile">
            {mobileTemplates.map((template) => renderTemplateCard(template))}
          </div>
        ) : groupedTemplates.length > 0 ? (
          groupedTemplates.map((section) => (
            <section
              key={section.key}
              id={section.key === "quick" ? "quick-signal-section" : undefined}
              className="composer-template-library-section"
            >
              <div className="composer-template-library-header">
                <p className="composer-template-library-eyebrow">{section.title}</p>
                <p className="composer-template-library-description">{section.description}</p>
              </div>
              <div className="composer-template-grid">{section.templates.map((template) => renderTemplateCard(template))}</div>
            </section>
          ))
        ) : (
          <div className="composer-template-empty-state">
            <strong>{t("templateEmptyStateTitle")}</strong>
            <span className="muted">{t("templateEmptyStateBody")}</span>
          </div>
        )}
      </div>
      <span className="composer-template-swipe-cue" aria-hidden="true" />
    </div>
  );
}
