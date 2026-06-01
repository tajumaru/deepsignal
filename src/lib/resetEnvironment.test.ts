import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLocalCache } from "./resetEnvironment";

describe("resetEnvironment", () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("preserves submitted response history when clearing local cache", async () => {
    window.localStorage.setItem("deepsignal.myResponseHistory.v1", JSON.stringify([{ submissionId: "signal-1" }]));
    window.localStorage.setItem("deepsignal.submittedHistory.v1", JSON.stringify([{ submissionId: "signal-1" }]));
    window.localStorage.setItem("deepsignal.submissions", JSON.stringify([{ id: "signal-1" }]));
    window.localStorage.setItem("deepsignal.forms", JSON.stringify([{ id: "form-1" }]));
    window.localStorage.setItem("deepsignal:public-draft:form-1:direct", JSON.stringify({ answers: { a: "draft" } }));
    window.localStorage.setItem("deepsignal.lastExploreError", "temporary route diagnostic");
    window.sessionStorage.setItem("deepsignal.seal.sessionKey.wallet", "cached-session");

    const result = await clearLocalCache();

    expect(result.status).toBe("success");
    expect(window.localStorage.getItem("deepsignal.myResponseHistory.v1")).toBeTruthy();
    expect(window.localStorage.getItem("deepsignal.submittedHistory.v1")).toBeTruthy();
    expect(window.localStorage.getItem("deepsignal.submissions")).toBeTruthy();
    expect(window.localStorage.getItem("deepsignal.forms")).toBeTruthy();
    expect(window.localStorage.getItem("deepsignal:public-draft:form-1:direct")).toBeTruthy();
    expect(window.localStorage.getItem("deepsignal.lastExploreError")).toBeNull();
    expect(window.sessionStorage.getItem("deepsignal.seal.sessionKey.wallet")).toBeNull();
  });
});
