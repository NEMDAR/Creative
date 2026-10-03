import { expect, test } from "@playwright/test";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const WEBM_CLIP = Buffer.from(
  "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAANsEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggNW7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDNXQYxMYXZmNjEuNy4xMDNEiYhAgsAAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WIjSjSH7I+PAmcgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QCYloA4JCwgaC6gVqagQJVsIRVuYEBElTDZ/tzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYxLjcuMTAzc3PWY8CLY8WIjSjSH7I+PAlnyKFFo4dFTkNPREVSRIeUTGF2YzYxLjE5LjEwMSBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjYwMDAwMDAwMAAfQ7Z1Qa3ngQCjvYEAAIBQBQCdASqgAFoAAEcIhYWIhYSIAgIABigPCHVUmu4h1VJruIdVSa7iHVUmu4h1VJruIbwA/v+rUICjmIEAKAARAgABEBAAGAAYWC/0AAiAgQAAAKOYgQBQABECAAEQEAAYABhYL/QACICBAAAAo5iBAHgAEQIAARAQABgAGFgv9AAIgIEAAACjmIEAoAARAgABEBAAGAAYWC/0AAiAgQAAAKOYgQDIABECAAEQEAAYABhYL/QACICBAAAAo5iBAPAAEQIAARAQABgAGFgv9AAIgIEAAACjl4EBGADxAQABEBAUYABhYL/QACICBAAAo5iBAUAAEQIAARAQABgAGFgv9AAIgIEAAACjmIEBaAARAgABEBAAGAAYWC/0AAiAgQAAAKOYgQGQABECAAEQEAAYABhYL/QACICBAAAAo5iBAbgAEQIAARAQABgAGFgv9AAIgIEAAACjmIEB4AARAgABEBAAGAAYWC/0AAiAgQAAAKOYgQIIABECAAEQEAAYABhYL/QACICBAAAAo5iBAjAAEQIAARAQABgAGFgv9AAIgIEAAAAcU7trkbuPs4EAt4r3gQHxggGj8IED",
  "base64"
);

test("P1 image creative can be edited, saved, exported and restored", async ({ page }) => {
  await page.goto("/");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles({
    name: "source.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await expect(page.locator(".assetCard strong")).toHaveText("source.png");
  await expect(page.locator("#creative-image")).toBeVisible();
  await expect
    .poll(() => page.locator("#creative-image").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: "+ Text" }).click();
  await page.getByLabel("Text").fill("إعلان تجريبي");
  await page.getByLabel("Alignment").selectOption("right");
  await page.getByLabel("Opacity").first().fill("0.8");

  const logoInput = page.locator('input[accept="image/*"]');
  await logoInput.setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await expect(page.locator('.overlay img[alt="Overlay"]')).toBeVisible();

  await page.getByRole("button", { name: "1:1" }).click();
  await expect(page.getByRole("button", { name: "1:1" })).toHaveClass(/active/);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export frame" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-frame\.png$/);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Save draft" }).click();

  await page.reload();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Load draft" }).click();

  await expect(page.getByText("إعلان تجريبي")).toBeVisible();
  await expect(page.locator("#creative-image")).toBeVisible();
  await expect(page.locator('.overlay img[alt="Overlay"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "1:1" })).toHaveClass(/active/);
});


test("P1 undo/redo restores editor state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ Text" }).click();
  await page.getByLabel("Text").fill("First");
  await page.getByLabel("Text").fill("Second");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByLabel("Text")).toHaveValue("First");

  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByLabel("Text")).toHaveValue("Second");
});

test("P1 video trim exports a timed WebM asset", async ({ page }) => {
  await page.goto("/");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles({
    name: "source.webm",
    mimeType: "video/webm",
    buffer: WEBM_CLIP,
  });

  const video = page.locator("video");
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.duration)).toBeGreaterThan(0);

  await page.getByLabel("Trim start").fill("0.1");
  await page.getByLabel("Trim end").fill("0.4");
  await page.getByRole("button", { name: "9:16" }).click();
  await expect(page.getByRole("button", { name: "9:16" })).toHaveClass(/active/);

  await page.getByRole("button", { name: "+ Text" }).click();
  await page.getByLabel("Text").fill("فيديو تجريبي Video");

  const logoInput = page.locator('input[accept="image/*"]');
  await logoInput.setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await expect(page.locator('.overlay img[alt="Overlay"]')).toBeVisible();

  const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
  await page.getByRole("button", { name: "Export video" }).click();

  const terminalState = page.locator(".exportState.success, .exportState.error");
  await terminalState.waitFor({ state: "visible", timeout: 15_000 });
  const className = await terminalState.getAttribute("class");
  if (className?.includes("error")) {
    throw new Error(`Video export error: ${await terminalState.textContent()}`);
  }

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.webm$/);
  await expect(terminalState).toContainText("Export ready");
});


test("P2 timeline exposes duration and scrubs the playhead", async ({ page }) => {
  await page.goto("/");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles({
    name: "timeline-source.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await expect(page.getByTestId("timeline-clock")).toHaveText("00:00.0");
  const surface = page.getByTestId("timeline-surface");
  await expect(surface).toBeVisible();

  const box = await surface.boundingBox();
  if (!box) throw new Error("Timeline surface has no layout box.");
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);

  await expect(page.getByTestId("timeline-clock")).toHaveText("00:03.0");
  await expect(page.getByTestId("timeline-playhead")).toHaveCSS("left", /.+/);
});


test("P2 visual track accepts and reorders multiple clips", async ({ page }) => {
  await page.goto("/");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles([
    {
      name: "first.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    },
    {
      name: "second.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    },
  ]);

  const clips = page.getByTestId("timeline-clip");
  await expect(clips).toHaveCount(2);
  await expect(clips.nth(0).locator("strong")).toHaveText("first.png");
  await expect(clips.nth(1).locator("strong")).toHaveText("second.png");

  await page.getByRole("button", { name: "Move second.png earlier" }).click();

  await expect(clips.nth(0).locator("strong")).toHaveText("second.png");
  await expect(clips.nth(1).locator("strong")).toHaveText("first.png");
});
