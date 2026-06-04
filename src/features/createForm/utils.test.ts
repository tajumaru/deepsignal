import { describe, expect, it } from "vitest";
import {
  createDefaultNftGate,
  CUSTOM_NFT_PRESET_ID,
  PRIME_MACHIN_COLLECTION_LABEL,
  PRIME_MACHIN_PRESET_ID,
  PRIME_MACHIN_STRUCT_TYPE,
  TALLY_COLLECTION_LABEL,
  TALLY_PRESET_ID,
  TALLY_STRUCT_TYPE,
} from "../../lib/formAccess";
import { computeSchemaHash } from "../../lib/formVersioning";
import { buildFormSchema, createField } from "./utils";

function buildBaseForm() {
  return buildFormSchema({
    title: "  Signal Intake  ",
    description: "  Collect operational signals  ",
    headerImage: { url: "", alt: "", position: "center" },
    headerLogo: { url: "", alt: "" },
    fields: [
      {
        ...createField("dropdown"),
        id: "impact",
        label: "  Impact  ",
        required: true,
        sensitive: false,
        options: [" Low ", " ", "High"],
      },
    ],
    sections: [],
    purpose: "custom",
    visibility: "private",
    identityPolicy: "anonymous_allowed",
    accessMode: "public",
    nftGate: createDefaultNftGate(CUSTOM_NFT_PRESET_ID),
    locationRequirement: "optional",
    processingMode: "review_required",
    ownerAddress: "0xowner",
    creationMode: "admin",
    projectId: "0xproject",
    projectName: "Ops",
    encryptSubmissions: false,
    responseDeadline: null,
    responseDeadlineMode: "none",
  });
}

describe("buildFormSchema", () => {
  it("initializes version metadata for newly built forms", () => {
    const form = buildBaseForm();

    expect(form.baseFormId).toBe(form.id);
    expect(form.formVersion).toBe(1);
    expect(form.schemaHash).toBe(computeSchemaHash(form));
    expect(form.registrationMode).toBe("walrus");
    expect(form.isOnchain).toBe(false);
  });

  it("normalizes structural fields before computing schemaHash", () => {
    const form = buildBaseForm();

    expect(form.title).toBe("Signal Intake");
    expect(form.description).toBe("Collect operational signals");
    expect(form.fields[0]).toMatchObject({
      id: "impact",
      label: "Impact",
      type: "dropdown",
      options: ["Low", "High"],
    });
    expect(form.schemaHash).toBe(computeSchemaHash(form));
  });

  it("preserves the template analysis lens on the published form schema", () => {
    const form = buildFormSchema({
      title: "Incident Lens",
      description: "Collect incident signals",
      headerImage: { url: "", alt: "", position: "center" },
      headerLogo: { url: "", alt: "" },
      fields: [{ ...createField("shortText"), label: "Signal", required: true }],
      sections: [],
      purpose: "bug",
      analysisProfileId: "incident_report",
      signalType: "disaster",
      analystType: "risk",
      analysisType: "urgency",
      visibility: "unlisted",
      identityPolicy: "anonymous_allowed",
      accessMode: "public",
      nftGate: createDefaultNftGate(CUSTOM_NFT_PRESET_ID),
      locationRequirement: "required",
      processingMode: "review_required",
      ownerAddress: "0xowner",
      creationMode: "admin",
      encryptSubmissions: true,
    });

    expect(form).toMatchObject({
      analysisProfileId: "incident_report",
      signalType: "disaster",
      analystType: "risk",
      analysisType: "urgency",
      processingMode: "review_required",
    });
    expect(form.schemaHash).toBe(computeSchemaHash(form));
  });

  it("keeps schemaHash stable across light builder values", () => {
    const base = buildBaseForm();
    const lightEdit = {
      ...base,
      title: "Updated title",
      description: "Updated description",
      visibility: "public" as const,
      publicExplore: true,
    };

    expect(computeSchemaHash(lightEdit)).toBe(base.schemaHash);
  });

  it("keeps anonymous identity for public access mode", () => {
    const form = buildFormSchema({
      title: "Public signal",
      description: "Anyone can respond",
      headerImage: { url: "", alt: "", position: "center" },
      headerLogo: { url: "", alt: "" },
      fields: [{ ...createField("shortText"), label: "Signal", required: true }],
      sections: [],
      purpose: "custom",
      visibility: "private",
      identityPolicy: "wallet_required",
      accessMode: "public",
      nftGate: createDefaultNftGate(CUSTOM_NFT_PRESET_ID),
      locationRequirement: "optional",
      processingMode: "review_required",
      ownerAddress: "0xowner",
      creationMode: "admin",
      encryptSubmissions: false,
    });

    expect(form.accessMode).toBe("public");
    expect(form.identityPolicy).toBe("anonymous_allowed");
  });

  it("forces wallet identity when wallet access mode is selected", () => {
    const form = buildFormSchema({
      title: "Wallet-gated signal",
      description: "Connected wallet required",
      headerImage: { url: "", alt: "", position: "center" },
      headerLogo: { url: "", alt: "" },
      fields: [{ ...createField("shortText"), label: "Signal", required: true }],
      sections: [],
      purpose: "custom",
      visibility: "private",
      identityPolicy: "anonymous_allowed",
      accessMode: "wallet_required",
      nftGate: createDefaultNftGate(CUSTOM_NFT_PRESET_ID),
      locationRequirement: "optional",
      processingMode: "review_required",
      ownerAddress: "0xowner",
      creationMode: "admin",
      encryptSubmissions: false,
    });

    expect(form.accessMode).toBe("wallet_required");
    expect(form.identityPolicy).toBe("wallet_required");
  });

  it("forces wallet identity policy for nft-required signals while preserving nft gate config", () => {
    const form = buildFormSchema({
      title: "Prime holder signal",
      description: "Only NFT holders can respond",
      headerImage: { url: "", alt: "", position: "center" },
      headerLogo: { url: "", alt: "" },
      fields: [{ ...createField("shortText"), label: "Signal", required: true }],
      sections: [],
      purpose: "custom",
      visibility: "private",
      identityPolicy: "anonymous_allowed",
      accessMode: "nft_required",
      nftGate: {
        ...createDefaultNftGate(CUSTOM_NFT_PRESET_ID),
        structType: PRIME_MACHIN_STRUCT_TYPE,
        requiredCount: 2,
      },
      locationRequirement: "optional",
      processingMode: "review_required",
      ownerAddress: "0xowner",
      creationMode: "admin",
      encryptSubmissions: true,
    });

    expect(form.accessMode).toBe("nft_required");
    expect(form.identityPolicy).toBe("wallet_required");
    expect(form.nftGate).toMatchObject({
      structType: PRIME_MACHIN_STRUCT_TYPE,
      requiredCount: 2,
    });
  });

  it("uses the canonical Prime Machin struct type for the preset", () => {
    const gate = createDefaultNftGate(PRIME_MACHIN_PRESET_ID);

    expect(gate).toMatchObject({
      presetId: PRIME_MACHIN_PRESET_ID,
      collectionLabel: PRIME_MACHIN_COLLECTION_LABEL,
      structType: PRIME_MACHIN_STRUCT_TYPE,
      requiredCount: 1,
      gateViewing: true,
      gateSubmission: true,
    });
  });

  it("uses the canonical Tally struct type for the preset", () => {
    const gate = createDefaultNftGate(TALLY_PRESET_ID);

    expect(gate).toMatchObject({
      presetId: TALLY_PRESET_ID,
      collectionLabel: TALLY_COLLECTION_LABEL,
      structType: TALLY_STRUCT_TYPE,
      requiredCount: 1,
      gateViewing: true,
      gateSubmission: true,
    });
  });
});
