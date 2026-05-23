import { useMemo, useState } from "react";
import type { FormTemplateDefinition, SignalTypeKey, TemplateSignalType } from "../../lib/formTemplates";

interface TemplatePickerProps {
  templates: FormTemplateDefinition[];
  selectedTemplateKey: string;
  onSelect: (templateKey: string) => void;
}

const LIBRARY_SECTIONS = [
  { key: "quick", title: "Quick Signals", description: "Fast signal flows for common intake patterns." },
  { key: "advanced", title: "Advanced Signals", description: "Higher-trust flows for security, testing, and field capture." },
  { key: "custom", title: "Custom", description: "Start guided or compose the signal structure yourself." },
] as const;

export function TemplatePicker({ templates, selectedTemplateKey, onSelect }: TemplatePickerProps) {
  const [activeFilter, setActiveFilter] = useState<SignalTypeKey | null>(null);
  const selectedTemplate = templates.find((template) => template.key === selectedTemplateKey) ?? templates[0];
  const featuredTemplate = templates.find((template) => template.featured) ?? templates[0];
  const standardTemplates = templates.filter((template) => template.key !== featuredTemplate.key);

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

  const filteredFeaturedTemplate =
    activeFilter === null || featuredTemplate.signalTypes.some((signalType) => signalType.key === activeFilter)
      ? featuredTemplate
      : null;

  const groupedTemplates = useMemo(
    () =>
      LIBRARY_SECTIONS.map((section) => ({
        ...section,
        templates: standardTemplates.filter(
          (template) =>
            template.librarySection === section.key &&
            (activeFilter === null || template.signalTypes.some((signalType) => signalType.key === activeFilter)),
        ),
      })).filter((section) => section.templates.length > 0),
    [activeFilter, standardTemplates],
  );

  function toggleSignalFilter(signalTypeKey: SignalTypeKey) {
    setActiveFilter((current) => (current === signalTypeKey ? null : signalTypeKey));
  }

  function getPresetSummary(template: FormTemplateDefinition) {
    const summary: string[] = [];
    if (template.automation?.encryptSubmissions) {
      summary.push("Seal on");
    }
    summary.push(template.automation?.identityPolicy === "wallet_required" ? "Wallet verified" : "Wallet optional");
    if (template.automation?.locationRequirement === "required") {
      summary.push("Location capture");
    }
    return summary.join(" • ");
  }

  function getBestFor(template: FormTemplateDefinition) {
    switch (template.key) {
      case "bug":
        return "Breakage reports with screenshots or clips.";
      case "feature":
        return "Product suggestions and next-step ideas.";
      case "feedback":
        return "Short reactions from responders on any device.";
      case "survey":
        return "Quick sentiment checks and lightweight surveys.";
      case "playtest":
        return "Playtests, live sessions, and immediate debriefs.";
      case "beta":
        return "Field testers sending blockers and rough edges.";
      case "anonymous-drop":
        return "Identity-light signal collection without wallet pressure.";
      case "disaster-checkin":
        return "Emergency check-ins where location may matter.";
      case "custom":
        return "Tailoring a signal flow around one starter prompt.";
      case "blank":
        return "Full-control intake design from an empty canvas.";
      default:
        return "Secure signal intake with stronger privacy defaults.";
    }
  }

  function getFieldSummary(template: FormTemplateDefinition) {
    if (template.fields.length === 0) {
      return "Starts blank";
    }
    return `Starts with ${template.fields.length} fields`;
  }

  function renderBadges(badges: FormTemplateDefinition["cardBadges"], className = "") {
    return (
      <div className={`signal-template-badge-row ${className}`.trim()}>
        {badges.map((badge) => (
          <span key={`${badge.label}-${badge.icon}`} className="signal-template-badge">
            <span aria-hidden="true">{badge.icon}</span>
            {badge.label}
          </span>
        ))}
      </div>
    );
  }

  function renderTemplateCard(template: FormTemplateDefinition) {
    const active = selectedTemplateKey === template.key;
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
            <strong>{template.label}</strong>
            <span className="muted composer-template-description">{template.description}</span>
          </div>
        </div>

        {renderBadges(template.cardBadges)}

        <div className="composer-template-card-details">
          {hiddenBadges.length > 0 ? renderBadges(hiddenBadges, "is-detail-row") : null}
          <div className="composer-template-detail-list">
            <span>{getPresetSummary(template)}</span>
            <span>{getFieldSummary(template)}</span>
            <span>Best for: {getBestFor(template)}</span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="composer-template-scroll">
      <div className="composer-template-filter-bar">
        <div className="composer-template-filter-copy">
          <span className="composer-template-filter-label">Library filter</span>
          <span className="composer-template-filter-help">
            Filter the signal library by type.
            {activeFilter ? ` Showing ${signalTypes.find((item) => item.key === activeFilter)?.label ?? ""}.` : " Showing all signal types."}
          </span>
        </div>
        <div className="composer-template-signal-nav" aria-label="Filter signal library by type">
          <button
            type="button"
            aria-pressed={activeFilter === null}
            className={`composer-signal-type-chip ${activeFilter === null ? "is-active" : ""}`}
            onClick={() => setActiveFilter(null)}
          >
            <span aria-hidden="true">◌</span>
            All
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
                {signalType.label}
              </button>
            );
          })}
        </div>
      </div>

      {filteredFeaturedTemplate?.featured ? (
        <button
          type="button"
          className={`composer-featured-template ${selectedTemplateKey === filteredFeaturedTemplate.key ? "is-active" : ""}`}
          onClick={() => onSelect(filteredFeaturedTemplate.key)}
        >
          <div className="composer-featured-template-copy">
            <span className="composer-featured-pill">{filteredFeaturedTemplate.featured.poweredBy}</span>
            <p className="eyebrow">{filteredFeaturedTemplate.featured.eyebrow}</p>
            <h3>
              <span aria-hidden="true">{filteredFeaturedTemplate.emoji}</span>
              {filteredFeaturedTemplate.featured.title}
            </h3>
            <p className="muted">{filteredFeaturedTemplate.featured.description}</p>
            {renderBadges(filteredFeaturedTemplate.cardBadges)}
          </div>
          <div className="composer-featured-template-meta">
            <span className="composer-template-preset-label">Signal posture</span>
            <strong>{getPresetSummary(filteredFeaturedTemplate)}</strong>
            <span className="composer-template-preset-hint">Best for: {getBestFor(filteredFeaturedTemplate)}</span>
            <span className="composer-template-preset-hint">{getFieldSummary(filteredFeaturedTemplate)}</span>
          </div>
        </button>
      ) : null}

      <div className="composer-template-library">
        {groupedTemplates.length > 0 ? (
          groupedTemplates.map((section) => (
            <section key={section.key} className="composer-template-library-section">
              <div className="composer-template-library-header">
                <p className="composer-template-library-eyebrow">{section.title}</p>
                <p className="composer-template-library-description">{section.description}</p>
              </div>
              <div className="composer-template-grid">
                {section.templates.map((template) => renderTemplateCard(template))}
              </div>
            </section>
          ))
        ) : (
          <div className="composer-template-empty-state">
            <strong>No templates in this filter</strong>
            <span className="muted">Try another signal type or switch back to All.</span>
          </div>
        )}
      </div>
      <span className="composer-template-swipe-cue" aria-hidden="true" />
    </div>
  );
}
