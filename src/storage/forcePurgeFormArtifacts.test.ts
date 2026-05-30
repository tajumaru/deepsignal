import { describe, expect, it, beforeEach } from "vitest";
import { forcePurgeFormArtifacts } from "./forcePurgeFormArtifacts";

describe("forcePurgeFormArtifacts", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("removes only the targeted form artifacts and linked encrypted payloads", () => {
    window.localStorage.setItem(
      "deepsignal.forms",
      JSON.stringify([
        { id: "demo-form", title: "Demo", description: "", fields: [], createdAt: "2026-05-17T00:00:00.000Z" },
        { id: "real-form", title: "Real", description: "", fields: [], createdAt: "2026-05-17T00:00:00.000Z" },
      ]),
    );
    window.localStorage.setItem(
      "deepsignal.submissions",
      JSON.stringify([
        {
          id: "demo-submission",
          formId: "demo-form",
          answers: {},
          attachments: [],
          status: "unread",
          priority: "high",
          triageStatus: "new",
          tags: [],
          notes: "",
          isEncrypted: true,
          encryptedBlobId: "demo-payload",
          createdAt: "2026-05-17T00:00:00.000Z",
          updatedAt: "2026-05-17T00:00:00.000Z",
        },
        {
          id: "real-submission",
          formId: "real-form",
          answers: {},
          attachments: [],
          status: "unread",
          priority: "medium",
          triageStatus: "new",
          tags: [],
          notes: "",
          isEncrypted: false,
          createdAt: "2026-05-17T00:00:00.000Z",
          updatedAt: "2026-05-17T00:00:00.000Z",
        },
      ]),
    );
    window.localStorage.setItem(
      "deepsignal.encryptedPayloads",
      JSON.stringify([
        { blobId: "demo-payload", payload: "sealed-demo" },
        { blobId: "real-payload", payload: "sealed-real" },
      ]),
    );
    window.localStorage.setItem(
      "deepsignal.formVersionSchemas",
      JSON.stringify({
        "demo-form": { "1": { id: "demo-form" } },
        "real-form": { "1": { id: "real-form" } },
      }),
    );

    forcePurgeFormArtifacts({ formIds: ["demo-form"] });

    expect(JSON.parse(window.localStorage.getItem("deepsignal.forms") ?? "[]")).toEqual([
      expect.objectContaining({ id: "real-form" }),
    ]);
    expect(JSON.parse(window.localStorage.getItem("deepsignal.submissions") ?? "[]")).toEqual([
      expect.objectContaining({ id: "real-submission" }),
    ]);
    expect(JSON.parse(window.localStorage.getItem("deepsignal.encryptedPayloads") ?? "[]")).toEqual([
      { blobId: "real-payload", payload: "sealed-real" },
    ]);
    expect(JSON.parse(window.localStorage.getItem("deepsignal.formVersionSchemas") ?? "{}")).toEqual({
      "real-form": { "1": { id: "real-form" } },
    });
  });
});
