import { afterEach, describe, expect, it } from "vitest";
import { MissingLazyRouteExportError, resolveLazyRouteModule } from "./lazyRetry";

function NamedPublicFormPage() {
  return null;
}

function DefaultPublicFormPage() {
  return null;
}

describe("resolveLazyRouteModule", () => {
  afterEach(() => {
    window.__DEEPSIGNAL_DEBUG__ = undefined;
    window.sessionStorage.clear();
  });

  it("resolves public form lazy modules from a default export first", () => {
    const resolved = resolveLazyRouteModule(
      { default: DefaultPublicFormPage, PublicFormPage: NamedPublicFormPage },
      "route-public-form",
    );

    expect(resolved.default).toBe(DefaultPublicFormPage);
  });

  it("falls back to the expected public form named export", () => {
    const resolved = resolveLazyRouteModule({ PublicFormPage: NamedPublicFormPage }, "route-public-form");

    expect(resolved.default).toBe(NamedPublicFormPage);
  });

  it("records missing export diagnostics without consuming chunk recovery", () => {
    expect(() => resolveLazyRouteModule({ NotPublicFormPage: NamedPublicFormPage }, "route-public-form")).toThrow(
      MissingLazyRouteExportError,
    );

    const failedImports = window.__DEEPSIGNAL_DEBUG__?.failedImports ?? [];
    expect(failedImports[failedImports.length - 1]).toMatchObject({
      category: "missingExport",
      availableExports: ["NotPublicFormPage"],
      expectedExport: "PublicFormPage",
      label: "route-public-form",
      moduleKeys: ["NotPublicFormPage"],
      resolvedExport: "missing",
    });
    expect(window.sessionStorage.getItem("deepsignal.chunkLoadRecovery")).toBeNull();
  });
});
