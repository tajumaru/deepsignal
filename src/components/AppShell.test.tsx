import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n";
import { AppShell } from "./AppShell";

function renderShell(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <I18nProvider>
        <AppShell walletAvailable={false}>
          <h1>Test workspace</h1>
        </AppShell>
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe("AppShell", () => {
  it("hides mobile compose shortcuts while already on the Create route", () => {
    const { container } = renderShell("/create");

    expect(screen.getByRole("heading", { name: "Test workspace" })).toBeInTheDocument();
    expect(container.querySelector(".mobile-compose-fab")).not.toBeInTheDocument();
    expect(container.querySelector(".mobile-header-cta")).not.toBeInTheDocument();
  });

  it("keeps mobile compose shortcuts available from signal discovery routes", () => {
    const { container } = renderShell("/explore");

    expect(container.querySelector(".mobile-compose-fab")).toBeInTheDocument();
  });

  it("shows the mobile bottom navigation from the sent signals route", () => {
    const { container } = renderShell("/my-responses");

    expect(container.querySelector(".mobile-inbox-bottom-nav")).toBeInTheDocument();
    expect(container.querySelector(".mobile-inbox-bottom-nav a.is-active")?.getAttribute("href")).toBe("/my-responses");
  });
});
