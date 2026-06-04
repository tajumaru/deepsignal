import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultNftGate,
  CUSTOM_NFT_PRESET_ID,
  PRIME_MACHIN_PRESET_ID,
  PRIME_MACHIN_STRUCT_TYPE,
  TALLY_PRESET_ID,
  TALLY_STRUCT_TYPE,
} from "../../../lib/formAccess";
import { PublishStep } from "./PublishStep";

type MockOwnedObjectEntry = {
  data?: {
    objectId?: string;
    type?: string;
  };
};

const { mockUseOwnedSuiObjects } = vi.hoisted(() => ({
  mockUseOwnedSuiObjects: vi.fn<() => { data: MockOwnedObjectEntry[]; error: null; isLoading: boolean }>(() => ({
    data: [] as MockOwnedObjectEntry[],
    error: null,
    isLoading: false,
  })),
}));

vi.mock("../../../hooks/useOwnedSuiObjects", () => ({
  useOwnedSuiObjects: mockUseOwnedSuiObjects,
}));

vi.mock("../../../components/BlobLink", () => ({
  BlobLink: () => <div>BlobLink</div>,
}));

vi.mock("../../../components/CriticalFailurePanel", () => ({
  CriticalFailurePanel: () => <div>CriticalFailurePanel</div>,
}));

vi.mock("../../../components/ShareCard", () => ({
  ShareCard: () => <div>ShareCard</div>,
}));

vi.mock("../../../components/SignalMetaChip", () => ({
  SignalMetaRow: ({ label, value }: { label: string; value: string }) => (
    <div>
      {label}: {value}
    </div>
  ),
}));

vi.mock("../../../components/SuiAddressDisplay", () => ({
  SuiAddressDisplay: ({ address }: { address: string }) => <span>{address}</span>,
}));

vi.mock("../../../components/formBuilder/LivePreview", () => ({
  LivePreview: () => <div>LivePreview</div>,
}));

vi.mock("./StepNavigationActions", () => ({
  StepNavigationActions: () => <div>StepNavigationActions</div>,
}));

function createTranslate() {
  return ((key: string) => key) as ComponentProps<typeof PublishStep>["t"];
}

beforeEach(() => {
  mockUseOwnedSuiObjects.mockReset();
  mockUseOwnedSuiObjects.mockReturnValue({
    data: [] as MockOwnedObjectEntry[],
    error: null,
    isLoading: false,
  });
});

function renderPublishStep(overrides: Partial<ComponentProps<typeof PublishStep>> = {}) {
  const props: ComponentProps<typeof PublishStep> = {
    t: createTranslate(),
    language: "en",
    saving: false,
    registeringOnSui: false,
    error: "",
    failure: null,
    diagnosticsCopied: false,
    savedForm: null,
    title: "Signal intake",
    description: "Collect field signals",
    headerImage: { url: "", alt: "", position: "center" },
    headerLogo: { url: "", alt: "" },
    fields: [],
    sections: [],
    analysisProfileId: undefined,
    signalType: undefined,
    analystType: undefined,
    analysisType: undefined,
    visibility: "private",
    identityPolicy: "anonymous_allowed",
    accessMode: "public",
    nftGate: createDefaultNftGate(CUSTOM_NFT_PRESET_ID),
    locationRequirement: "optional",
    encryptSubmissions: false,
    responseOpenAtCustom: "",
    responseDeadlinePreset: "none",
    responseDeadlineCustomAt: "",
    mobilePane: "editor",
    isReadyToPublish: true,
    publicPath: "/f/test",
    publicUrl: "https://example.com/f/test",
    publishChecks: [],
    encryptionWarnings: [],
    showPublishSuccessView: false,
    showWalrusDiagnostics: false,
    isGuestDraftMode: false,
    isConnected: false,
    currentWalletName: undefined,
    accountAddress: "0xowner",
    storageMode: "local",
    uploadRelayUrl: "",
    storageRuntimeMode: "local",
    storageRuntimeNotice: undefined,
    storageRuntimeDiagnostics: null,
    walrusCostEstimate: null,
    displayMode: "classic",
    canManageProjects: false,
    selectedProjectId: "",
    selectedProject: null,
    projects: [],
    projectState: "idle",
    selectedTemplateKey: "blank",
    onSetMobilePane: vi.fn(),
    onSelectProject: vi.fn(),
    onChangeVisibility: vi.fn(),
    onChangeIdentityPolicy: vi.fn(),
    onChangeAccessMode: vi.fn(),
    onChangeNftGatePreset: vi.fn(),
    onChangeNftGate: vi.fn(),
    onChangeLocationRequirement: vi.fn(),
    onToggleEncryptSubmissions: vi.fn(),
    onChangeResponseOpenAtCustom: vi.fn(),
    onChangeResponseDeadlinePreset: vi.fn(),
    onChangeResponseDeadlineCustomAt: vi.fn(),
    onRegisterOnSui: vi.fn(),
    onCopyDiagnostics: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };

  return render(
    <MemoryRouter>
      <PublishStep {...props} />
    </MemoryRouter>,
  );
}

describe("PublishStep access control UI", () => {
  it("shows NFT owned object diagnostics and lets the builder apply a discovered type", () => {
    const onChangeNftGatePreset = vi.fn();
    const onChangeNftGate = vi.fn();
    mockUseOwnedSuiObjects.mockReturnValueOnce({
      data: [
        { data: { objectId: "1", type: PRIME_MACHIN_STRUCT_TYPE } },
        { data: { objectId: "2", type: "0x2::custom::Alpha" } },
        { data: { objectId: "3", type: "0x2::custom::Alpha" } },
      ],
      error: null,
      isLoading: false,
    } as { data: MockOwnedObjectEntry[]; error: null; isLoading: boolean });

    renderPublishStep({
      identityPolicy: "wallet_required",
      accessMode: "nft_required",
      nftGate: {
        ...createDefaultNftGate(CUSTOM_NFT_PRESET_ID),
        structType: "",
      },
      onChangeNftGatePreset,
      onChangeNftGate,
    });

    expect(screen.getByText("publishNftDiagnosticsTitle")).toBeInTheDocument();
    fireEvent.click(screen.getByText("publishNftDiagnosticsTitle"));
    expect(screen.getByText("publishNftDiagnosticsNoStructTypeTitle")).toBeInTheDocument();
    expect(screen.getByText("0x2::custom::Alpha")).toBeInTheDocument();
    expect(screen.getByText(PRIME_MACHIN_STRUCT_TYPE)).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("publishNftDiagnosticsUseType")[1]);

    expect(onChangeNftGatePreset).toHaveBeenCalledWith(CUSTOM_NFT_PRESET_ID);
    expect(onChangeNftGate).toHaveBeenCalledWith({
      structType: "0x2::custom::Alpha",
      collectionLabel: undefined,
    });
  });

  it("shows the redesigned access control panel without a separate identity policy section in public mode", () => {
    renderPublishStep();

    expect(screen.getAllByText("publishAccessSettingsTitle").length).toBeGreaterThan(0);
    expect(screen.getAllByText("publishAccessModePublic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("publishAccessModeWallet").length).toBeGreaterThan(0);
    expect(screen.getAllByText("publishAccessModeNft").length).toBeGreaterThan(0);
    expect(screen.queryByText("accessControlSidebarTitle")).not.toBeInTheDocument();
    expect(screen.queryByText("publishAccessRecommendationsTitle")).not.toBeInTheDocument();
    expect(screen.queryByText("publishAccessRestrictionsTitle")).not.toBeInTheDocument();
    expect(screen.queryByText("Collection Preset")).not.toBeInTheDocument();
    expect(screen.queryByText("identityPolicyTitle")).not.toBeInTheDocument();
    expect(screen.queryByText("verificationOptional")).not.toBeInTheDocument();
  });

  it("shows NFT gate settings only when NFT holders only is selected", () => {
    mockUseOwnedSuiObjects.mockReturnValueOnce({
      data: [{ data: { objectId: "1", type: PRIME_MACHIN_STRUCT_TYPE } }],
      error: null,
      isLoading: false,
    } as { data: MockOwnedObjectEntry[]; error: null; isLoading: boolean });
    renderPublishStep({
      identityPolicy: "wallet_required",
      accessMode: "nft_required",
      nftGate: {
        ...createDefaultNftGate(PRIME_MACHIN_PRESET_ID),
        structType: PRIME_MACHIN_STRUCT_TYPE,
      },
    });

    expect(screen.getAllByText("publishNftCollectionPresetLabel").length).toBeGreaterThan(0);
    expect(screen.getAllByText("publishNftStructTypeLabel").length).toBeGreaterThan(0);
    expect(screen.getAllByText("publishNftRequiredCountLabel").length).toBeGreaterThan(0);
    expect(screen.getAllByText("publishNftGateViewingTitle").length).toBeGreaterThan(0);
    expect(screen.getAllByText("publishNftGateSubmissionTitle").length).toBeGreaterThan(0);
    expect(screen.getAllByText("publishAccessNftNote").length).toBeGreaterThan(0);
  });

  it("shows the Tally collection art when the Tally preset is selected", () => {
    renderPublishStep({
      identityPolicy: "wallet_required",
      accessMode: "nft_required",
      nftGate: {
        ...createDefaultNftGate(TALLY_PRESET_ID),
        structType: TALLY_STRUCT_TYPE,
      },
    });

    const arts = Array.from(document.querySelectorAll(".publish-nft-preset-art")) as HTMLImageElement[];
    expect(arts.some((art) => art.getAttribute("src") === "/nft/tally.webp")).toBe(true);
  });

  it("shows an English datetime placeholder overlay when the intake window is empty", () => {
    renderPublishStep({
      language: "en",
      responseOpenAtCustom: "",
      responseDeadlinePreset: "custom",
      responseDeadlineCustomAt: "",
    });

    expect(screen.getAllByText("MM/DD/YYYY --:--").length).toBeGreaterThan(0);
  });
});
