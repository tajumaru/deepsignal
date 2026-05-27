import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoot } from "./AppRoot";

function openHashRoute(route: string) {
  window.history.pushState(null, "", `/#${route}`);
}

function expectNoMissingI18nProvider(consoleError: ReturnType<typeof vi.spyOn>) {
  const errorText = consoleError.mock.calls.flat().map(String).join("\n");
  expect(document.body.textContent ?? "").not.toContain("useI18n must be used within I18nProvider");
  expect(errorText).not.toContain("useI18n must be used within I18nProvider");
}

describe("AppRoot provider coverage", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
    document.body.innerHTML = "";
  });

  it("renders ExploreSignalsPage under the real app root router with I18nProvider", async () => {
    openHashRoute("/explore");

    render(<AppRoot />);

    await screen.findByRole("heading", { name: "Explore Signals" });
    expectNoMissingI18nProvider(consoleError);
  });

  it("renders PublicFormPage under the real app root router with I18nProvider", async () => {
    openHashRoute("/f/form_qvq6aiaf");

    render(<AppRoot />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Form not found" })).toBeInTheDocument();
    });
    expectNoMissingI18nProvider(consoleError);
  });
});
