import { describe, expect, it } from "vitest";
import { createDefaultNftGate, CUSTOM_NFT_PRESET_ID } from "../../lib/formAccess";
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
        structType: "0xprime::machin::PrimeMachin",
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
      structType: "0xprime::machin::PrimeMachin",
      requiredCount: 2,
    });
  });
});
