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
  await expect(page.locator('.overlay img[alt="Overlay"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "1:1" })).toHaveClass(/active/);
});


test("P1 undo/redo restores editor state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ Text" }).click();
  await page.getByLabel("Text").fill("First");
  await page.getByLabel("Text").fill("Second");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("First")).toBeVisible();

  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByText("Second")).toBeVisible();
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

  await page.getByRole("button", { name: "+ Text" }).click();
  await page.getByLabel("Text").fill("Video export");

  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "Export video" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.webm$/);
  await expect(page.getByText("Export ready")).toBeVisible();
});
