import { expect, test } from "@playwright/test";

test.describe("mock admin workspace", () => {
  test("opens the admin UI without a connected wallet in dev", async ({ page }) => {
    await page.goto("/admin?mockAdmin=1");

    await expect(page.getByText("MOCK ADMIN")).toBeVisible();
    await expect(page.getByRole("region", { name: "Mock Signal Operations" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Encrypted field escalation/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Decrypt recovery needed/ })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /search signals/i }).last()).toBeVisible();
  });

  test("keeps inbox, filters, and detail usable at iPhone width", async ({ page }) => {
    await page.goto("/admin?mockAdmin=1");

    await expect(page.getByText("MOCK ADMIN")).toBeVisible();
    const recoveryNoticeDismiss = page.getByRole("button", { name: /Understood|理解しました/ });
    if (await recoveryNoticeDismiss.isVisible().catch(() => false)) {
      await recoveryNoticeDismiss.click();
    }
    await expect(page.locator(".mobile-signal-inbox")).toBeVisible();
    await expect(page.getByRole("button", { name: /Encrypted field escalation/ })).toBeVisible();
    await page.getByRole("button", { name: /Encrypted field escalation/ }).click();
    await expect(page.locator(".signal-detail-column")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start review session" })).toBeVisible();
  });
});
