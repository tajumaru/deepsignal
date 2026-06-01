import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import {
  listMyResponseHistory,
  upsertMyResponseHistoryEntry,
  type MyResponseHistoryEntry,
} from "../storage/myResponseHistory";
import type { Submission } from "../types";
import { MyResponsesPage } from "./MyResponsesPage";

const mockListSubmissions = vi.hoisted(() => vi.fn());

vi.mock("../storage/localStorageAdapter", () => ({
  localStorageAdapter: {
    listSubmissions: mockListSubmissions,
  },
}));

function buildHistoryEntry(overrides: Partial<MyResponseHistoryEntry> = {}): MyResponseHistoryEntry {
  return {
    submissionId: "submission-1",
    formId: "form-1",
    formTitle: "Signal intake",
    submittedAt: "2026-05-01T00:00:00.000Z",
    status: "submitted",
    storageMode: "local",
    answerSummary: "Impact: high",
    answers: { impact: "high" },
    fields: [{ id: "impact", type: "shortText", label: "Impact", required: false, sensitive: false }],
    ...overrides,
  };
}

function buildSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "submission-1",
    formId: "form-1",
    answers: { impact: "high" },
    attachments: [],
    status: "read",
    priority: "medium",
    triageStatus: "in_progress",
    tags: [],
    notes: "",
    isEncrypted: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
    ...overrides,
  };
}

function renderMyResponses(initialEntry = "/my-responses/submission-1") {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/my-responses" element={<MyResponsesPage />} />
          <Route path="/my-responses/:submissionId" element={<MyResponsesPage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("MyResponsesPage lifecycle sync", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("deepsignal.language", "en");
    window.localStorage.setItem("deepsignal.language.manual", "true");
    mockListSubmissions.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("hydrates the response lifecycle from a matching local submission", async () => {
    upsertMyResponseHistoryEntry(buildHistoryEntry({ manifestBlobId: "manifest-1" }));
    mockListSubmissions.mockResolvedValue([buildSubmission()]);

    const { container } = renderMyResponses();

    await waitFor(() => {
      expect(container.querySelector(".my-response-badge.is-lifecycle-in_progress")).toBeInTheDocument();
    });

    expect(mockListSubmissions).toHaveBeenCalledWith("form-1");
    expect(screen.getByRole("link", { name: "Open roadmap" })).toHaveAttribute(
      "href",
      "/roadmap/form-1?manifest=manifest-1",
    );
    expect(listMyResponseHistory()[0]).toMatchObject({
      status: "submitted",
      reviewStatus: "read",
      triageStatus: "in_progress",
      roadmapStatus: "in_progress",
      lifecycleStatus: "in_progress",
      lifecycleUpdatedAt: "2026-05-02T00:00:00.000Z",
    });
  });

  it("hides the roadmap link when public status has no manifest blob", async () => {
    upsertMyResponseHistoryEntry(buildHistoryEntry());
    mockListSubmissions.mockResolvedValue([buildSubmission({ triageStatus: "planned" })]);

    renderMyResponses();

    await waitFor(() => {
      expect(screen.getByText("Your signal helped shape the roadmap.")).toBeInTheDocument();
    });
    expect(screen.getByText("Roadmap link unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View Roadmap" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open roadmap" })).not.toBeInTheDocument();
  });

  it("keeps the existing sender lifecycle when no local submission matches", async () => {
    upsertMyResponseHistoryEntry(buildHistoryEntry());
    mockListSubmissions.mockResolvedValue([buildSubmission({ id: "other-submission" })]);

    const { container } = renderMyResponses();

    await waitFor(() => {
      expect(mockListSubmissions).toHaveBeenCalledWith("form-1");
    });

    expect(container.querySelector(".my-response-badge.is-lifecycle-received")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open roadmap" })).not.toBeInTheDocument();
    expect(listMyResponseHistory()[0]).toMatchObject({
      status: "submitted",
      lifecycleStatus: "received",
      triageStatus: undefined,
      roadmapStatus: undefined,
    });
  });

  it("shows the planned impact card and roadmap link when public metadata is available", async () => {
    upsertMyResponseHistoryEntry(buildHistoryEntry({ manifestBlobId: "manifest-1" }));
    mockListSubmissions.mockResolvedValue([buildSubmission({ triageStatus: "planned" })]);

    renderMyResponses();

    await waitFor(() => {
      expect(screen.getByText("Your Signal Is Making Progress")).toBeInTheDocument();
    });

    expect(screen.getByText("Your signal helped shape the roadmap.")).toBeInTheDocument();
    expect(screen.getByText("Included in Public Roadmap")).toBeInTheDocument();
    expect(screen.getByText("★★★☆☆")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Roadmap" })).toHaveAttribute(
      "href",
      "/roadmap/form-1?manifest=manifest-1",
    );
  });

  it("celebrates completed impact and keeps encrypted body copy private", async () => {
    upsertMyResponseHistoryEntry(buildHistoryEntry({ encrypted: true, manifestBlobId: "manifest-1" }));
    mockListSubmissions.mockResolvedValue([buildSubmission({ isEncrypted: true, triageStatus: "fixed" })]);

    renderMyResponses();

    await waitFor(() => {
      expect(screen.getByText("Signal Impact Achieved")).toBeInTheDocument();
    });

    expect(screen.getByText("Work connected to your signal has been completed.")).toBeInTheDocument();
    expect(screen.getByText("★★★★★")).toBeInTheDocument();
    expect(screen.getByText("Metadata only. The encrypted signal body remains private.")).toBeInTheDocument();
  });
});
