import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormTemplateDefinition } from "../../lib/formTemplates";
import { TemplatePicker } from "./TemplatePicker";

vi.mock("../../i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe("TemplatePicker", () => {
  const originalMatchMedia = window.matchMedia;
  const baseTemplate: Omit<FormTemplateDefinition, "key"> = {
    purpose: "custom",
    emoji: "S",
    label: "Custom Signal",
    title: "Custom Signal",
    description: "Capture a custom signal.",
    librarySection: "custom",
    signalTypes: [{ key: "feedback", icon: "!", label: "Feedback" }],
    cardBadges: [],
    capabilities: [],
    fields: [{ type: "shortText", label: "Signal", required: true }],
  };

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it("renders on legacy mobile media query implementations", () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: true,
      media: "(max-width: 900px)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    render(
      <TemplatePicker
        templates={[
          {
            ...baseTemplate,
            key: "custom",
          },
        ]}
        selectedTemplateKey="custom"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("templateCustomLabel")).toBeInTheDocument();
  });

  it("does not highlight the default template on initial mobile render", () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: true,
      media: "(max-width: 900px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    render(
      <TemplatePicker
        templates={[
          {
            ...baseTemplate,
            key: "encrypted-report",
          },
        ]}
        selectedTemplateKey="encrypted-report"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /templateEncryptedReportLabel/i })).not.toHaveClass("is-active");
  });
});
