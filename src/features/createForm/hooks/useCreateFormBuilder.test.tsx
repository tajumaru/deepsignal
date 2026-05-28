import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCreateFormBuilder } from "./useCreateFormBuilder";
import { CREATE_FORM_DRAFT_STORAGE_KEY } from "../utils";

vi.mock("../../../lib/projectRegistry", () => ({
  getSelectedProjectId: () => "",
  setSelectedProjectId: vi.fn(),
}));

describe("useCreateFormBuilder", () => {
  afterEach(() => {
    vi.useRealTimers();
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

  it("does not autosave the discarded draft back into local storage", () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      CREATE_FORM_DRAFT_STORAGE_KEY,
      JSON.stringify({
        selectedTemplateKey: "custom",
        title: "Draft to discard",
        description: "Temporary draft",
        fields: [{ id: "field-1", type: "text", label: "Signal", required: true }],
        currentStep: "fields",
      }),
    );

    const { result } = renderHook(() =>
      useCreateFormBuilder({
        t: (key: string) => key,
        language: "en",
        projects: [],
      }),
    );

    expect(result.current.hasRecoverableDraft).toBe(true);

    act(() => {
      result.current.discardRecoverableDraft();
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(result.current.hasRecoverableDraft).toBe(false);
    expect(window.localStorage.getItem(CREATE_FORM_DRAFT_STORAGE_KEY)).toBeNull();
  });
});
