import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TemplatePicker } from "./TemplatePicker";

vi.mock("../../i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe("TemplatePicker", () => {
  const originalMatchMedia = window.matchMedia;

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
            key: "custom",
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
          },
        ]}
        selectedTemplateKey="custom"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("templateCustomLabel")).toBeInTheDocument();
  });
});
