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
    expect(within(roadmapCard as HTMLElement).getByText("Your signal")).toBeInTheDocument();
    expect(within(roadmapCard as HTMLElement).getByText("Lifecycle: in progress")).toBeInTheDocument();
    expect(within(roadmapCard as HTMLElement).getByText("Local receipt matched")).toBeInTheDocument();
    expect(within(roadmapCard as HTMLElement).getByText(/Metadata-only roadmap entry/)).toBeInTheDocument();
    expect(within(roadmapCard as HTMLElement).getByRole("link", { name: "Track lifecycle" })).toHaveAttribute(
      "href",
      "/my-responses/submission-1",
    );
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
