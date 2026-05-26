import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCreateFormBuilder } from "./useCreateFormBuilder";
import { CREATE_FORM_DRAFT_STORAGE_KEY } from "../utils";

vi.mock("../../../lib/projectRegistry", () => ({
  getSelectedProjectId: () => "",
  setSelectedProjectId: vi.fn(),
}));

describe("useCreateFormBuilder", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("keeps malformed local drafts intact and falls back to a safe builder state", () => {
    window.localStorage.setItem(CREATE_FORM_DRAFT_STORAGE_KEY, "{not-valid-json");

    const { result } = renderHook(() =>
      useCreateFormBuilder({
        t: (key: string) => key,
        language: "en",
        projects: [],
      }),
    );

    expect(result.current.hasRecoverableDraft).toBe(false);
    expect(result.current.draftParseStatus).toBe("invalid");
    expect(result.current.draftParseNotice).toContain("preserved");
    expect(window.localStorage.getItem(CREATE_FORM_DRAFT_STORAGE_KEY)).toBe("{not-valid-json");
    expect(result.current.values.title.length).toBeGreaterThan(0);
  });
});
