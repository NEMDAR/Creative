import { expect, test } from "@playwright/test";

test.describe("P8 product experience gate", () => {
  test("business routes remain reachable and preserve their primary surfaces", async ({ page }) => {
    const routes: Array<[string, string]> = [
      ["/home", "home-page"],
      ["/projects", "projects-page"],
      ["/editor", "p8-workspace-tabs"],
      ["/campaign", "marketing-brief"],
      ["/batch", "batch-panel"],
      ["/assets", "assets-page"],
      ["/brand-kit", "brand-page"],
      ["/publishing", "publishing-panel"],
      ["/calendar", "calendar-page"],
      ["/analytics", "analytics-console"],
      ["/operations", "operations-console"],
      ["/settings", "settings-page"],
    ];
    for (const [path, testId] of routes) {
      await page.goto(path);
      await expect(page.getByTestId(testId)).toBeVisible();
    }
  });

  test("editor exposes focused tools and contextual inspector without losing capabilities", async ({ page }) => {
    await page.goto("/editor");
    await expect(page.getByTestId("editor-tool-rail")).toBeVisible();
    await expect(page.getByText("Upload videos or images")).toBeVisible();

    await page.getByRole("button", { name: "Text tools" }).click();
    await expect(page.getByRole("button", { name: "+ Add text layer" })).toBeVisible();

    await page.getByRole("button", { name: "AI tools" }).click();
    await expect(page.getByTestId("provider-panel")).toBeVisible();
    await expect(page.getByTestId("image-generation-panel")).toBeVisible();

    await page.getByRole("button", { name: "Captions tools" }).click();
    await expect(page.getByTestId("caption-inspector")).toBeVisible();

    await page.getByRole("button", { name: "Templates tools" }).click();
    await expect(page.getByTestId("marketing-templates")).toBeVisible();

    await page.getByRole("tab", { name: "Advanced" }).click();
    await expect(page.getByTestId("scene-inspector")).toBeVisible();
    await expect(page.getByTestId("silence-inspector")).toBeVisible();

    await page.getByRole("tab", { name: "Review" }).click();
    await expect(page.getByTestId("approval-panel")).toBeVisible();
  });

  test("operations exposes live production controls", async ({ page }) => {
    await page.goto("/operations");
    for (const id of [
      "render-queue-card",
      "provider-routing-card",
      "budget-card",
      "publishing-health-card",
      "roles-card",
      "audit-card",
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });


  test("project and campaign flows enter the real editor", async ({ page }) => {
    await page.goto("/projects");
    await page.getByLabel("New project name").fill("P8 UX Test Project");
    await page.getByRole("button", { name: "Create project" }).click();
    const projectCard = page.locator(".projectCard").filter({ hasText: "P8 UX Test Project" }).first();
    await expect(projectCard).toBeVisible();
    await projectCard.getByRole("link", { name: "Open in Editor" }).click();
    await expect(page).toHaveURL(/\/editor$/);
    await expect(page.getByTestId("editor-tool-rail")).toBeVisible();

    await page.goto("/campaign");
    await page.getByRole("link", { name: "Open in Editor" }).click();
    await expect(page).toHaveURL(/\/editor$/);
    await expect(page.getByTestId("editor-tool-rail")).toBeVisible();
  });

  test("settings applies RTL and command shortcut focuses The Wand", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("Language direction").selectOption("ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByLabel("Language direction").selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    await page.goto("/editor");
    await page.keyboard.press("Control+K");
    await expect(page.getByLabel("AI edit command")).toBeFocused();
  });

  test("mobile editor keeps workspace navigation usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/editor");
    await expect(page.getByTestId("p8-workspace-tabs")).toBeVisible();
    await expect(page.getByTestId("editor-tool-rail")).toBeVisible();
  });
});
