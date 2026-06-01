import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { upsertMyResponseHistoryEntry, type MyResponseHistoryEntry } from "../storage/myResponseHistory";
import type { FormSchema, Submission } from "../types";
import { PublicRoadmapPage } from "./PublicRoadmapPage";

const mockGetForm = vi.hoisted(() => vi.fn());
const mockListSubmissions = vi.hoisted(() => vi.fn());

vi.mock("../storage/localStorageAdapter", () => ({
  localStorageAdapter: {
    getForm: mockGetForm,
    listSubmissions: mockListSubmissions,
  },
}));

function buildForm(overrides: Partial<FormSchema> = {}): FormSchema {
  return {
    id: "form-1",
    title: "Signal intake",
    description: "Signals worth tracking",
    fields: [],
    createdAt: "2026-05-01T00:00:00.000Z",
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
    priority: "high",
    triageStatus: "in_progress",
    tags: [],
    notes: "",
    isEncrypted: false,
    createdAt: "2026-05-02T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
    subjectPreview: "Mobile checkout freeze",
    ...overrides,
  };
}

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
    fields: [],
    ...overrides,
  };
}

function renderRoadmap(initialEntry = "/roadmap/form-1") {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/roadmap/:formId" element={<PublicRoadmapPage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("PublicRoadmapPage lifecycle surface", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("deepsignal.language", "en");
    window.localStorage.setItem("deepsignal.language.manual", "true");
    mockGetForm.mockReset();
    mockListSubmissions.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows lifecycle labels, local receipt metadata, and encrypted metadata-only copy", async () => {
    upsertMyResponseHistoryEntry(buildHistoryEntry());
    mockGetForm.mockResolvedValue(buildForm());
    mockListSubmissions.mockResolvedValue([
      buildSubmission({ isEncrypted: true, answers: {}, triageStatus: "in_progress" }),
    ]);

    renderRoadmap();

    const card = await screen.findByText("Mobile checkout freeze");
    const roadmapCard = card.closest("article");
    expect(roadmapCard).not.toBeNull();
    expect(within(roadmapCard as HTMLElement).getByText("Originated from your signal")).toBeInTheDocument();
    expect(within(roadmapCard as HTMLElement).getByText("Lifecycle: in progress")).toBeInTheDocument();
    expect(within(roadmapCard as HTMLElement).getByText("Your signal helped create this roadmap item")).toBeInTheDocument();
    expect(within(roadmapCard as HTMLElement).getByText("The team is actively working on this.")).toBeInTheDocument();
    expect(within(roadmapCard as HTMLElement).getByText("Metadata-only roadmap entry. The encrypted signal body stays private.")).toBeInTheDocument();
    expect(within(roadmapCard as HTMLElement).getByRole("link", { name: "Track lifecycle" })).toHaveAttribute(
      "href",
      "/my-responses/submission-1",
    );
    expect(screen.getByText("Current Public Impact")).toBeInTheDocument();
    expect(screen.getByText("In Progress: 1")).toBeInTheDocument();
  });

  it("does not mark roadmap entries as local respondent signals without a matching receipt", async () => {
    upsertMyResponseHistoryEntry(buildHistoryEntry({ submissionId: "other-submission" }));
    mockGetForm.mockResolvedValue(buildForm());
    mockListSubmissions.mockResolvedValue([buildSubmission({ triageStatus: "planned" })]);

    renderRoadmap();

    const card = await screen.findByText("Mobile checkout freeze");
    const roadmapCard = card.closest("article");
    expect(roadmapCard).not.toBeNull();
    expect(within(roadmapCard as HTMLElement).queryByText("Originated from your signal")).not.toBeInTheDocument();
    expect(within(roadmapCard as HTMLElement).queryByText("Your signal helped create this roadmap item")).not.toBeInTheDocument();
    expect(within(roadmapCard as HTMLElement).queryByRole("link", { name: "Track lifecycle" })).not.toBeInTheDocument();
    expect(within(roadmapCard as HTMLElement).getByText("Accepted into the roadmap.")).toBeInTheDocument();
  });

  it("uses actionable empty lane copy when no signals are published", async () => {
    mockGetForm.mockResolvedValue(buildForm());
    mockListSubmissions.mockResolvedValue([]);

    renderRoadmap();

    await waitFor(() => {
      expect(screen.getByText(/No planned signals yet/)).toBeInTheDocument();
    });
    expect(screen.getByText(/No signals are in progress yet/)).toBeInTheDocument();
    expect(screen.getByText(/No fixed signals yet/)).toBeInTheDocument();
  });
});
