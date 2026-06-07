import { afterEach, describe, expect, it, vi } from "vitest";
import { MissingLazyRouteExportError, resolveLazyRouteModule, retryLazyImport } from "./lazyRetry";

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
    vi.restoreAllMocks();
  });

  it("prefers the expected named export when a route contract asks for one", () => {
    const resolved = resolveLazyRouteModule(
      { default: DefaultPublicFormPage, PublicFormPage: NamedPublicFormPage },
      "route-public-form",
    );

    expect(resolved.default).toBe(NamedPublicFormPage);
  });

  it("falls back to the expected public form named export", () => {
    const resolved = resolveLazyRouteModule({ PublicFormPage: NamedPublicFormPage }, "route-public-form");

    expect(resolved.default).toBe(NamedPublicFormPage);
  });

  it("falls back to the default export when the expected named export is not present", () => {
    const resolved = resolveLazyRouteModule({ default: DefaultPublicFormPage }, "route-public-form");

    expect(resolved.default).toBe(DefaultPublicFormPage);
  });

  it("finds the expected export inside nested module objects from cache-busted chunk imports", () => {
    const resolved = resolveLazyRouteModule(
      {
        a: Object.freeze({
          WalrusRuntimeProvider: NamedPublicFormPage,
        }),
      },
      "walrus-runtime-provider",
    );

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

  it("does not block the first lazy import on build.json for app shell imports", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise(() => undefined) as ReturnType<typeof fetch>,
    );

    const loaded = await retryLazyImport(async () => ({ ok: true }), "app-shell");

    expect(loaded).toEqual({ ok: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps retrying long enough for a briefly delayed chunk host to recover", async () => {
    let attempts = 0;

    const loaded = await retryLazyImport(async () => {
      attempts += 1;
      if (attempts < 4) {
        throw new TypeError("Failed to fetch dynamically imported module: https://example.test/assets/FormBuilderPage.js");
      }
      return { ok: true, attempts };
    }, "anonymous");

    expect(loaded).toEqual({ ok: true, attempts: 4 });
  });
});
