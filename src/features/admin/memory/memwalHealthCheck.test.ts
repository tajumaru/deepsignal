import { describe, expect, it } from "vitest";
import { runAdminMemWalHealthCheck } from "./memwalHealthCheck";

describe("admin MemWal health check placeholder", () => {
  it("reports the no-op runtime from an admin-only code path", async () => {
    await expect(runAdminMemWalHealthCheck()).resolves.toMatchObject({
      scope: "admin",
      runtime: {
        kind: "noop",
        enabled: false,
        configured: false,
        reason: "disabled",
      },
    });
  });
});
