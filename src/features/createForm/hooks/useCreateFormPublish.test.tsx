import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultNftGate, CUSTOM_NFT_PRESET_ID } from "../../../lib/formAccess";
import { PublishFlowError } from "../services";
import { useCreateFormPublish } from "./useCreateFormPublish";

const mockPublishForm = vi.fn();

vi.mock("../services", async () => {
  const actual = await vi.importActual<typeof import("../services")>("../services");
  return {
    ...actual,
    publishForm: (...args: unknown[]) => mockPublishForm(...args),
  };
});

function TestHarness() {
  const publish = useCreateFormPublish({
    t: (key: string) => key,
    accountAddress: "0xcreator",
    actorRole: "owner",
    creationMode: "admin",
    title: "Signal Form",
    description: "Route verification",
    headerImage: { url: "", alt: "", position: "center" },
    headerLogo: { url: "", alt: "" },
    fields: [{ id: "field-1", type: "shortText", label: "Signal", required: true, sensitive: false }],
    sections: [],
    purpose: "custom",
    visibility: "private",
    identityPolicy: "anonymous_allowed",
    accessMode: "public",
    nftGate: createDefaultNftGate(CUSTOM_NFT_PRESET_ID),
    locationRequirement: "optional",
    processingMode: "review_required",
    encryptSubmissions: false,
    responseOpenAtCustom: "",
    responseDeadlinePreset: "none",
    responseDeadlineCustomAt: "",
    isDirty: false,
    selectedProject: null,
    setProjectState: vi.fn(),
    signAndExecuteTransaction: vi.fn(),
    waitForTransaction: vi.fn(),
    validateFieldsStep: () => ({ isValid: true, error: "" }),
    goToStep: vi.fn(),
    onSaved: vi.fn(),
  });

  return (
    <form onSubmit={publish.handleSubmit}>
      <button type="submit">Publish</button>
      <div data-testid="manifest">{publish.savedForm?.manifestBlobId ?? ""}</div>
      <div data-testid="public-url">{publish.publicUrl}</div>
      <div data-testid="error">{publish.error}</div>
    </form>
  );
}

describe("useCreateFormPublish", () => {
  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("does not reuse a stale manifest or public link after a failed republish", async () => {
    mockPublishForm
      .mockResolvedValueOnce({
        id: "form-123",
        blobId: "manifest-old",
        manifestBlobId: "manifest-old",
      })
      .mockRejectedValueOnce(
        new PublishFlowError("Public route asset failed verification.", {
          uploadSucceeded: true,
          registryUpdated: false,
          diagnostics: {
            formId: "form-123",
            manifestBlobId: "manifest-old",
          },
        }),
      );

    render(<TestHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByTestId("manifest").textContent).toBe("manifest-old"));
    expect(screen.getByTestId("public-url").textContent).toContain("manifest-old");

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByTestId("error").textContent).toContain("Public route asset failed verification."));
    expect(screen.getByTestId("manifest").textContent).toBe("");
    expect(screen.getByTestId("public-url").textContent).toBe("");
  });

  it("marks upload failures as not registered", async () => {
    mockPublishForm.mockRejectedValueOnce(
      new PublishFlowError("Walrus upload failed: relay returned 503", {
        uploadSucceeded: false,
        registryUpdated: false,
      }),
    );

    render(<TestHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByTestId("error").textContent).toContain("Walrus upload failed"));
  });
});
