import { stat } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const WEBM_CLIP = Buffer.from(
  "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAANsEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggNW7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDNXQYxMYXZmNjEuNy4xMDNEiYhAgsAAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WIjSjSH7I+PAmcgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QCYloA4JCwgaC6gVqagQJVsIRVuYEBElTDZ/tzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYxLjcuMTAzc3PWY8CLY8WIjSjSH7I+PAlnyKFFo4dFTkNPREVSRIeUTGF2YzYxLjE5LjEwMSBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjYwMDAwMDAwMAAfQ7Z1Qa3ngQCjvYEAAIBQBQCdASqgAFoAAEcIhYWIhYSIAgIABigPCHVUmu4h1VJruIdVSa7iHVUmu4h1VJruIbwA/v+rUICjmIEAKAARAgABEBAAGAAYWC/0AAiAgQAAAKOYgQBQABECAAEQEAAYABhYL/QACICBAAAAo5iBAHgAEQIAARAQABgAGFgv9AAIgIEAAACjmIEAoAARAgABEBAAGAAYWC/0AAiAgQAAAKOYgQDIABECAAEQEAAYABhYL/QACICBAAAAo5iBAPAAEQIAARAQABgAGFgv9AAIgIEAAACjl4EBGADxAQABEBAUYABhYL/QACICBAAAo5iBAUAAEQIAARAQABgAGFgv9AAIgIEAAACjmIEBaAARAgABEBAAGAAYWC/0AAiAgQAAAKOYgQGQABECAAEQEAAYABhYL/QACICBAAAAo5iBAbgAEQIAARAQABgAGFgv9AAIgIEAAACjmIEB4AARAgABEBAAGAAYWC/0AAiAgQAAAKOYgQIIABECAAEQEAAYABhYL/QACICBAAAAo5iBAjAAEQIAARAQABgAGFgv9AAIgIEAAAAcU7trkbuPs4EAt4r3gQHxggGj8IED",
  "base64"
);

function createSilentWav(seconds = 2, sampleRate = 8000) {
  const samples = Math.max(1, Math.floor(seconds * sampleRate));
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

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

  await page.getByRole("button", { name: "1:1", exact: true }).click();
  await expect(page.getByRole("button", { name: "1:1", exact: true })).toHaveClass(/active/);

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
  await expect(page.getByRole("button", { name: "1:1", exact: true })).toHaveClass(/active/);
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
  await page.getByRole("button", { name: "9:16", exact: true }).click();
  await expect(page.getByRole("button", { name: "9:16", exact: true })).toHaveClass(/active/);

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
  await expect(terminalState).toContainText("Local export ready");
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
  await surface.evaluate((element) => { const rect = element.getBoundingClientRect(); element.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: rect.left + rect.width * 0.6, clientY: rect.top + 1 })); });

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


test("P2 clip editing supports reorder split trim duplicate and delete", async ({ page }) => {
  await page.goto("/");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles([
    {
      name: "alpha.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    },
    {
      name: "beta.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    },
  ]);

  const clips = page.getByTestId("timeline-clip");
  await expect(clips).toHaveCount(2);
  await expect(clips.nth(0).locator("strong")).toHaveText("alpha.png");
  await expect(clips.nth(1).locator("strong")).toHaveText("beta.png");

  await page.getByRole("button", { name: "Move clip later" }).click();
  await expect(clips.nth(0).locator("strong")).toHaveText("beta.png");
  await expect(clips.nth(1).locator("strong")).toHaveText("alpha.png");

  const surface = page.getByTestId("timeline-surface");
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  if (!box) throw new Error("Timeline surface has no layout box.");
  await page.mouse.click(box.x + box.width * 0.75, box.y + 1);
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:07.5");

  await page.getByRole("button", { name: "Split at playhead" }).click();
  await expect(clips).toHaveCount(3);

  await page.getByLabel("Clip duration").fill("1.5");
  await expect(page.getByLabel("Clip duration")).toHaveValue("1.5");

  await page.getByRole("button", { name: "Duplicate clip" }).click();
  await expect(clips).toHaveCount(4);

  await page.getByRole("button", { name: "Delete clip" }).click();
  await expect(clips).toHaveCount(3);
});


test("P2 timed overlay tracks control text and logo visibility independently", async ({ page }) => {
  await page.goto("/");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles({
    name: "timed-source.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await page.getByRole("button", { name: "+ Text" }).click();
  await page.getByLabel("Text").fill("Timed overlay");
  await page.getByLabel("Overlay start").fill("1");
  await page.getByLabel("Overlay end").fill("2");

  const logoInput = page.locator('input[accept="image/*"]');
  await logoInput.setInputFiles({
    name: "timed-logo.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await expect(page.getByTestId("overlay-track-item")).toHaveCount(2);
  await page.getByLabel("Overlay start").fill("3");
  await page.getByLabel("Overlay end").fill("4");

  const overlayBars = page.getByTestId("overlay-track-item");
  await expect(overlayBars.nth(0)).toHaveAttribute("data-start", "1.00");
  await expect(overlayBars.nth(0)).toHaveAttribute("data-end", "2.00");
  await expect(overlayBars.nth(1)).toHaveAttribute("data-end", "4.00");

  const surface = page.getByTestId("timeline-surface");
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  if (!box) throw new Error("Timeline surface has no layout box.");

  await page.mouse.click(box.x + box.width * 0.3, box.y + 1);
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:01.5");
  await expect(page.locator(".stage .overlay span").filter({ hasText: "Timed overlay" })).toBeVisible();
  await expect(page.locator('.stage .overlay img[alt="Overlay"]')).toHaveCount(0);

  await page.mouse.click(box.x + box.width * 0.7, box.y + 1);
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:03.5");
  await expect(page.locator(".stage .overlay span").filter({ hasText: "Timed overlay" })).toHaveCount(0);
  await expect(page.locator('.stage .overlay img[alt="Overlay"]')).toBeVisible();
});

test("P2 audio track supports placement gain and fades", async ({ page }) => {
  await page.goto("/");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles({
    name: "audio-source.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  const audioInput = page.locator('input[accept="audio/*"]');
  await audioInput.setInputFiles({
    name: "music.wav",
    mimeType: "audio/wav",
    buffer: createSilentWav(2),
  });

  const audioBar = page.getByTestId("audio-track-item");
  await expect(audioBar).toBeVisible();
  await expect(audioBar).toContainText("music.wav");

  await page.getByLabel("Audio start").fill("1");
  await page.getByLabel("Audio duration").fill("2");
  await page.getByLabel("Audio gain").fill("0.5");
  await page.getByLabel("Audio fade in").fill("0.4");
  await page.getByLabel("Audio fade out").fill("0.6");

  await expect(audioBar).toHaveAttribute("data-start", "1.00");
  await expect(audioBar).toHaveAttribute("data-duration", "2.00");
  await expect(audioBar).toContainText("50%");
});

test("P2 basic transitions preview deterministic crossfade and fade states", async ({ page }) => {
  await page.goto("/");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles([
    {
      name: "transition-a.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    },
    {
      name: "transition-b.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    },
  ]);

  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
  await page.getByLabel("Transition type").selectOption("crossfade");
  await page.getByLabel("Transition duration").fill("1");

  await expect(page.getByTestId("transition-badge")).toHaveText("XF");

  const surface = page.getByTestId("timeline-surface");
  const box = await surface.boundingBox();
  if (!box) throw new Error("Timeline surface has no layout box.");

  await surface.evaluate((element) => { const rect = element.getBoundingClientRect(); element.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: rect.left + rect.width * 0.45, clientY: rect.top + 1 })); });
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:04.5");
  await expect(page.locator("#creative-image")).toHaveCSS("opacity", "0.5");
  await expect(page.getByTestId("transition-media-layer")).toBeVisible();
  await expect(page.getByTestId("transition-media-layer")).toHaveCSS("opacity", "0.5");
  await expect(page.getByTestId("transition-blackout")).toHaveCount(0);

  await page.getByLabel("Transition type").selectOption("fade");
  await expect(page.getByTestId("transition-badge")).toHaveText("F");
  await expect(page.getByTestId("transition-media-layer")).toHaveCount(0);
  await expect(page.getByTestId("transition-blackout")).toBeVisible();
  await expect(page.getByTestId("transition-blackout")).toHaveCSS("opacity", "0.5");
});

test("P2 clip transforms apply fit crop zoom and rotation to preview", async ({ page }) => {
  await page.goto("/");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles({
    name: "transform-source.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  const image = page.locator("#creative-image");
  await expect(image).toBeVisible();

  await page.getByLabel("Clip fit").selectOption("contain");
  await page.getByLabel("Clip crop X").fill("20");
  await page.getByLabel("Clip crop Y").fill("80");
  await page.getByLabel("Clip zoom").fill("1.5");
  await page.getByLabel("Clip rotation").fill("30");

  await expect(image).toHaveCSS("object-fit", "contain");
  await expect(image).toHaveCSS("object-position", "20% 80%");
  await expect(image).toHaveCSS("transform", /matrix/);
  await expect
    .poll(() => image.getAttribute("style"))
    .toContain("rotate(30deg) scale(1.5)");

  await page.getByLabel("Clip fit").selectOption("fill");
  await expect(image).toHaveCSS("object-fit", "fill");
});

test("P2 video speed preserves source span while changing timeline duration", async ({ page }) => {
  await page.goto("/");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles({
    name: "speed-source.webm",
    mimeType: "video/webm",
    buffer: WEBM_CLIP,
  });

  const video = page.locator("video");
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.duration)).toBeGreaterThan(0);

  const clipDuration = page.getByLabel("Clip duration");
  await expect
    .poll(async () => Number(await clipDuration.inputValue()))
    .toBeGreaterThan(0);
  const initialDuration = Number(await clipDuration.inputValue());

  await page.getByLabel("Clip speed").selectOption("2");

  await expect
    .poll(async () => Number(await clipDuration.inputValue()))
    .toBeCloseTo(initialDuration / 2, 1);
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.playbackRate))
    .toBe(2);
});

test("P2 timeline UX supports snapping zoom and keyboard navigation", async ({ page }) => {
  await page.goto("/");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles({
    name: "timeline-ux.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await expect(page.getByTestId("timeline-clock")).toHaveText("00:00.0");
  await expect(page.getByRole("button", { name: "Timeline snapping" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByTestId("timeline-zoom")).toHaveText("100%");
  await expect(page.getByTestId("timeline-canvas")).toHaveAttribute("data-zoom", "1.00");

  const surface = page.getByTestId("timeline-surface");
  await surface.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: rect.left + rect.width * 0.98,
        clientY: rect.top + 1,
      })
    );
  });
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:05.0");

  await page.getByRole("button", { name: "Timeline snapping" }).click();
  await expect(page.getByRole("button", { name: "Timeline snapping" })).toHaveAttribute(
    "aria-pressed",
    "false"
  );

  await surface.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: rect.left + rect.width * 0.98,
        clientY: rect.top + 1,
      })
    );
  });
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:04.9");

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:04.8");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:03.8");
  await page.keyboard.press("Home");
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:00.0");
  await page.keyboard.press("End");
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:05.0");

  await page.getByRole("button", { name: "Timeline zoom in" }).click();
  await page.getByRole("button", { name: "Timeline zoom in" }).click();
  await expect(page.getByTestId("timeline-zoom")).toHaveText("150%");
  await expect(page.getByTestId("timeline-canvas")).toHaveAttribute("data-zoom", "1.50");

  await page.keyboard.press("-");
  await expect(page.getByTestId("timeline-zoom")).toHaveText("125%");

  await page.keyboard.press("s");
  await expect(page.getByRole("button", { name: "Timeline snapping" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("P2 autosave reloads latest draft and restores a manual snapshot", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Name").fill("Version One");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles({
    name: "snapshot-source.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await expect(page.locator("#creative-image")).toBeVisible();
  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Save draft" }).click();

  const manualSnapshot = page
    .getByTestId("snapshot-item")
    .filter({ hasText: "Manual" })
    .first();
  await expect(manualSnapshot).toContainText("Version One");

  const saveState = page.getByTestId("save-state");
  const previousSavedAt = await saveState.getAttribute("data-saved-at");
  await page.getByLabel("Name").fill("Autosaved Edit");
  await expect
    .poll(() => saveState.getAttribute("data-saved-at"), { timeout: 5_000 })
    .not.toBe(previousSavedAt);
  await expect(saveState).toHaveText("Saved");

  await page.reload();

  await expect(page.getByLabel("Name")).toHaveValue("Autosaved Edit", { timeout: 5_000 });
  await expect(page.locator("#creative-image")).toBeVisible();
  await expect(
    page.getByTestId("snapshot-item").filter({ hasText: "Manual" }).first()
  ).toContainText("Version One");

  await page
    .getByTestId("snapshot-item")
    .filter({ hasText: "Manual" })
    .first()
    .click();

  await expect(page.getByLabel("Name")).toHaveValue("Version One");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
});

test("P2 durable server render queue exports a real MP4", async ({ page }) => {
  await page.goto("/");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles({
    name: "server-render-source.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await expect(page.locator("#creative-image")).toBeVisible();

  const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByTestId("export-mp4").click();

  const renderState = page.getByTestId("server-render-state");
  await expect(renderState).toBeVisible();

  // Rendering runs on the server; editing remains interactive while the job is active.
  await page.getByRole("button", { name: "+ Text" }).click();
  await expect(page.getByLabel("Text")).toBeVisible();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.mp4$/);

  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error("MP4 download path is unavailable.");
  const info = await stat(downloadedPath);
  expect(info.size).toBeGreaterThan(1_000);

  await expect(renderState).toContainText("Complete · 100%");
});

test("P2 representative long project stays responsive and renders MP4", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles(
    Array.from({ length: 8 }, (_, index) => ({
      name: `long-${index + 1}.png`,
      mimeType: "image/png",
      buffer: PNG_1X1,
    }))
  );

  const clips = page.getByTestId("timeline-clip");
  await expect(clips).toHaveCount(8);
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:00.0");

  // Exercise the image -> image crossfade path.
  await page.getByLabel("Transition type").selectOption("crossfade");
  await page.getByLabel("Transition duration").fill("0.5");
  await expect(page.getByTestId("transition-badge").first()).toHaveText("XF");

  // Add a timed marketing overlay.
  await page.getByRole("button", { name: "+ Text" }).click();
  await page.getByLabel("Text").fill("NEMDAR performance smoke");
  await page.getByLabel("Overlay start").fill("2");
  await page.getByLabel("Overlay end").fill("6");

  // Add music so the final MP4 exercises the audio pipeline too.
  const audioInput = page.locator('input[accept="audio/*"]');
  await audioInput.setInputFiles({
    name: "long-project-music.wav",
    mimeType: "audio/wav",
    buffer: createSilentWav(2),
  });
  await expect(page.getByTestId("audio-track-item")).toBeVisible();
  await page.getByLabel("Audio start").fill("1");
  await page.getByLabel("Audio gain").fill("0.5");
  await page.getByLabel("Audio fade in").fill("0.2");
  await page.getByLabel("Audio fade out").fill("0.3");

  // Long-timeline interaction should remain practical.
  const surface = page.getByTestId("timeline-surface");
  await surface.scrollIntoViewIfNeeded();
  const started = Date.now();
  await surface.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: rect.left + rect.width * 0.9,
        clientY: rect.top + 1,
      })
    );
  });
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:36.0");
  expect(Date.now() - started).toBeLessThan(2_000);

  const downloadPromise = page.waitForEvent("download", { timeout: 150_000 });
  await page.getByTestId("export-mp4").click();

  const renderState = page.getByTestId("server-render-state");
  await expect(renderState).toBeVisible();

  // Editing remains available while FFmpeg is running.
  await page.getByLabel("Name").fill("Edited during render");
  await expect(page.getByLabel("Name")).toHaveValue("Edited during render");

  await expect(renderState).toContainText(/Complete|Failed/, { timeout: 150_000 });
  const finalState = (await renderState.textContent()) ?? "";
  if (finalState.includes("Failed")) {
    throw new Error(`Long-project render failed: ${finalState}`);
  }

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.mp4$/);
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error("Long-project MP4 path is unavailable.");
  const info = await stat(downloadedPath);
  expect(info.size).toBeGreaterThan(3_000);
});

test("P3 automatic Arabic captions generate edit preview and persist", async ({ page }) => {
  await page.goto("/");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles({
    name: "caption-canvas.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  const audioInput = page.locator('input[accept="audio/*"]');
  await audioInput.setInputFiles({
    name: "caption-voice.wav",
    mimeType: "audio/wav",
    buffer: createSilentWav(4),
  });

  await page.getByLabel("Caption language").selectOption("ar");
  await page.getByRole("button", { name: "Generate captions" }).click();

  const meta = page.getByTestId("caption-meta");
  await expect(meta).toContainText("Detected:");
  await expect(meta).toContainText("ar");
  await expect(meta).toContainText("mock-caption-v1");
  await expect(page.locator(".captionCue")).toHaveCount(3);

  const preview = page.getByTestId("caption-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("مرحبًا بك في نمدار كريتيف ستوديو");
  await expect(preview).toHaveAttribute("dir", "rtl");

  const captionText = page.getByLabel("Caption text");
  await captionText.fill("نمدار كريتيف — كابتشن معدل");
  await expect(preview).toHaveText("نمدار كريتيف — كابتشن معدل");

  await page.getByLabel("Caption end").fill("1.1");
  await expect(page.locator(".captionCue").first()).toContainText("00:01.1");

  const saveState = page.getByTestId("save-state");
  await expect(saveState).toHaveText("Saved", { timeout: 5_000 });
  const savedAt = await saveState.getAttribute("data-saved-at");
  expect(savedAt).not.toBe("");

  await page.reload();

  await expect(page.getByTestId("caption-meta")).toContainText("ar", { timeout: 5_000 });
  await expect(page.getByLabel("Caption text")).toHaveValue("نمدار كريتيف — كابتشن معدل");
  await expect(page.getByTestId("caption-preview")).toHaveText("نمدار كريتيف — كابتشن معدل");
});

test("P3 caption style presets control typography safe-zone and persist", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "caption-style.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await page.locator('input[accept="audio/*"]').setInputFiles({
    name: "caption-style.wav",
    mimeType: "audio/wav",
    buffer: createSilentWav(4),
  });

  await page.getByLabel("Caption language").selectOption("en");
  await page.getByRole("button", { name: "Generate captions" }).click();

  const preview = page.getByTestId("caption-preview");
  await expect(preview).toBeVisible();

  await page.getByRole("button", { name: "Caption preset bold" }).click();
  await expect(preview).toHaveAttribute("data-preset", "bold");
  await expect(preview).toHaveCSS("font-size", "32px");
  await expect(preview).toHaveCSS("font-weight", "900");

  await page.getByLabel("Caption position").selectOption("top");
  await page.getByLabel("Caption emphasis").selectOption("highlight");
  await page.getByLabel("Caption font size").fill("36");
  await page.getByLabel("Caption safe zone").fill("12");
  await page.getByLabel("Caption max width").fill("70");
  await page.getByLabel("Caption shadow").uncheck();

  await expect
    .poll(() => preview.getAttribute("style"))
    .toContain("font-size: 36px");
  await expect
    .poll(() => preview.getAttribute("style"))
    .toContain("inset: 12% auto auto 50%");
  await expect
    .poll(() => preview.getAttribute("style"))
    .toContain("max-width: 70%");
  await expect(preview).toHaveCSS("text-shadow", "none");

  const saveState = page.getByTestId("save-state");
  const before = await saveState.getAttribute("data-saved-at");
  await expect
    .poll(() => saveState.getAttribute("data-saved-at"), { timeout: 5_000 })
    .not.toBe(before);

  await page.reload();

  await expect(page.getByRole("button", { name: "Caption preset bold" })).toHaveClass(/active/);
  await expect(page.getByLabel("Caption position")).toHaveValue("top");
  await expect(page.getByLabel("Caption emphasis")).toHaveValue("highlight");
  await expect(page.getByLabel("Caption font size")).toHaveValue("36");
  await expect(page.getByLabel("Caption safe zone")).toHaveValue("12");
  await expect(page.getByLabel("Caption max width")).toHaveValue("70");
  await expect(page.getByLabel("Caption shadow")).not.toBeChecked();
});

test("P3 transcript edit cuts the selected spoken range from media", async ({ page }) => {
  await page.goto("/");

  const sourceInput = page.locator('input[accept="video/*,image/*"]');
  await sourceInput.setInputFiles([
    {
      name: "speech-a.webm",
      mimeType: "video/webm",
      buffer: WEBM_CLIP,
    },
    {
      name: "speech-b.webm",
      mimeType: "video/webm",
      buffer: WEBM_CLIP,
    },
  ]);

  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
  await page.getByLabel("Caption language").selectOption("en");
  await page.getByRole("button", { name: "Generate captions" }).click();

  await expect(page.locator(".captionCue")).toHaveCount(3);
  await expect(page.getByTestId("caption-cue-editor")).toBeVisible();

  const clipDuration = page.getByLabel("Clip duration");
  const initialClipDuration = Number(await clipDuration.inputValue());
  const cutEnd = Number(await page.getByLabel("Caption end").inputValue());

  await page.getByRole("button", { name: "Cut spoken range from media" }).click();

  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
  await expect(page.getByTestId("timeline-clip").first()).toContainText("speech-a.webm");
  await expect(page.locator(".captionCue")).toHaveCount(2);
  await expect(page.locator(".captionCue").first()).toContainText("00:00.0");
  await expect
    .poll(async () => Number(await page.getByLabel("Clip duration").inputValue()))
    .toBeCloseTo(initialClipDuration - cutEnd, 1);
});

test("P3 silence detection reviews ranges before applying video cuts", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[accept="video/*,image/*"]').setInputFiles(
    "tests/fixtures/silence-pattern.webm"
  );

  const video = page.locator("video");
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.duration))
    .toBeGreaterThan(2.9);

  const clipDuration = page.getByLabel("Clip duration");
  const initialDuration = Number(await clipDuration.inputValue());

  await page.getByRole("button", { name: "Detect silence" }).click();

  const ranges = page.locator(".silenceRange");
  await expect(ranges).toHaveCount(2, { timeout: 10_000 });

  const firstRangeDuration = Number(
    (await ranges.first().locator("strong").innerText()).replace("s", "")
  );
  expect(firstRangeDuration).toBeGreaterThan(0.8);

  const secondCheckbox = ranges.nth(1).locator('input[type="checkbox"]');
  await secondCheckbox.uncheck();
  await expect(secondCheckbox).not.toBeChecked();

  await page.getByRole("button", { name: "Apply selected silence cuts" }).click();

  await expect(page.locator(".silenceRange")).toHaveCount(0);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await expect
    .poll(async () => Number(await page.getByLabel("Clip duration").inputValue()))
    .toBeCloseTo(initialDuration - firstRangeDuration, 1);
});

test("P3 scene detection offers reviewable reversible split suggestions", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[accept="video/*,image/*"]').setInputFiles(
    "tests/fixtures/scene-pattern.webm"
  );

  const video = page.locator("video");
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.duration))
    .toBeGreaterThan(2.9);

  await page.getByLabel("Scene threshold").fill("0.10");
  await page.getByRole("button", { name: "Detect scenes" }).click();

  const suggestions = page.locator(".sceneSuggestion");
  await expect(suggestions).toHaveCount(2, { timeout: 10_000 });
  await expect(suggestions.nth(0)).toContainText("00:01.0");
  await expect(suggestions.nth(1)).toContainText("00:02.0");

  await suggestions.nth(1).locator('input[type="checkbox"]').uncheck();
  await page.getByRole("button", { name: "Apply selected scene splits" }).click();

  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Undo scene splits" })).toBeVisible();

  await page.getByRole("button", { name: "Undo scene splits" }).click();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Undo scene splits" })).toHaveCount(0);
});

test("P3 smart reframe keeps an off-center subject inside social framing", async ({ page }) => {
  await page.goto("/");

  const subjectSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="#050505"/><rect x="900" y="150" width="200" height="300" rx="40" fill="#ffffff"/></svg>'
  );

  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "off-center-subject.svg",
    mimeType: "image/svg+xml",
    buffer: subjectSvg,
  });

  const image = page.locator("#creative-image");
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (node: HTMLImageElement) => node.complete && node.naturalWidth > 0
      )
    )
    .toBe(true);

  const saveState = page.getByTestId("save-state");
  await expect(saveState).toHaveText("Saved", { timeout: 5_000 });
  const beforeReframeSavedAt = await saveState.getAttribute("data-saved-at");

  await page.getByRole("button", { name: "Smart 4:5" }).click();

  await expect(page.getByTestId("smart-reframe-result")).toBeVisible();
  const cropX = Number(await page.getByLabel("Clip crop X").inputValue());
  expect(cropX).toBeGreaterThan(65);
  await expect(page.getByRole("button", { name: "4:5", exact: true })).toHaveClass(/active/);

  const objectPosition = await image.evaluate(
    (node) => getComputedStyle(node).objectPosition
  );
  expect(Number.parseFloat(objectPosition)).toBeGreaterThan(65);

  await expect
    .poll(() => saveState.getAttribute("data-saved-at"), { timeout: 5_000 })
    .not.toBe(beforeReframeSavedAt);
  await expect(saveState).toHaveText("Saved");
  await page.reload();

  await expect(page.getByRole("button", { name: "4:5", exact: true })).toHaveClass(/active/);
  await expect
    .poll(async () => Number(await page.getByLabel("Clip crop X").inputValue()))
    .toBeGreaterThan(65);
});

test("P3 automatic music ducking lowers gain only during captioned speech", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "ducking-canvas.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await page.locator('input[accept="audio/*"]').setInputFiles({
    name: "ducking-music.wav",
    mimeType: "audio/wav",
    buffer: createSilentWav(4),
  });

  await page.getByLabel("Caption language").selectOption("en");
  await page.getByRole("button", { name: "Generate captions" }).click();
  await expect(page.locator(".captionCue")).toHaveCount(3);

  await page.locator(".captionCue").nth(0).click();
  await page.getByLabel("Caption end").fill("0.8");

  await page.locator(".captionCue").nth(1).click();
  await page.getByLabel("Caption start").fill("2.0");

  await page.getByLabel("Automatic music ducking").check();
  await page.getByLabel("Ducking gain").fill("0.25");

  await page.locator(".captionCue").nth(0).click();

  const audio = page.locator("audio");
  await expect(audio).toHaveAttribute("data-effective-gain", "0.200");

  const surface = page.getByTestId("timeline-surface");
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  if (!box) throw new Error("Timeline surface has no layout box.");

  await surface.click({ position: { x: box.width * 0.3, y: 1 } });
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:01.5");
  await expect(audio).toHaveAttribute("data-effective-gain", "0.800");

  await surface.click({ position: { x: box.width * 0.46, y: 1 } });
  await expect(audio).toHaveAttribute("data-effective-gain", "0.200");

  const saveState = page.getByTestId("save-state");
  await expect(saveState).toHaveText("Saved", { timeout: 5_000 });
  const before = await saveState.getAttribute("data-saved-at");
  await page.getByLabel("Ducking gain").fill("0.3");
  await expect
    .poll(() => saveState.getAttribute("data-saved-at"), { timeout: 5_000 })
    .not.toBe(before);

  await page.reload();

  await expect(page.getByLabel("Automatic music ducking")).toBeChecked();
  await expect(page.getByLabel("Ducking gain")).toHaveValue("0.3");
});

test("P3 Brand Kit persists and applies approved identity without duplicating logo", async ({ page }) => {
  await page.goto("/");

  const brandKit = page.getByTestId("brand-kit");
  await expect(brandKit).toBeVisible();

  await page.getByLabel("Brand name").fill("NEMDAR Campaign");
  await page.getByLabel("Brand primary color").fill("#112233");
  await page.getByLabel("Brand secondary color").fill("#445566");
  await page.getByLabel("Brand heading font").fill("Cairo, sans-serif");
  await page.getByLabel("Brand body font").fill("Roboto, sans-serif");
  await page.getByLabel("Brand heading weight").fill("900");
  await page.getByLabel("Brand safe zone").fill("12");
  await page.getByLabel("Brand caption size").fill("36");
  await page.getByLabel("Brand caption width").fill("70");

  await brandKit.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: "approved-logo.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await expect(page.getByTestId("brand-logo-preview")).toContainText("approved-logo.png");

  await page.getByRole("button", { name: "+ Text" }).click();
  await page.getByLabel("Text").fill("Brand headline");
  await page.getByRole("button", { name: "Apply Brand" }).click();

  const brandedText = page.locator(".stage .overlay span").filter({ hasText: "Brand headline" });
  await expect(brandedText).toHaveCSS("font-family", /Cairo/);
  await expect(brandedText).toHaveCSS("font-weight", "900");
  await expect(brandedText).toHaveCSS("color", "rgb(17, 34, 51)");

  await expect(page.getByLabel("Caption font size")).toHaveValue("36");
  await expect(page.getByLabel("Caption safe zone")).toHaveValue("12");
  await expect(page.getByLabel("Caption max width")).toHaveValue("70");

  await expect(page.locator('.stage .overlay img[alt="Overlay"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Apply Brand" }).click();
  await expect(page.locator('.stage .overlay img[alt="Overlay"]')).toHaveCount(1);

  await expect(brandKit.locator(".brandState")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  await expect(page.getByLabel("Brand name")).toHaveValue("NEMDAR Campaign");
  await expect(page.getByLabel("Brand primary color")).toHaveValue("#112233");
  await expect(page.getByLabel("Brand secondary color")).toHaveValue("#445566");
  await expect(page.getByLabel("Brand heading font")).toHaveValue("Cairo, sans-serif");
  await expect(page.getByLabel("Brand safe zone")).toHaveValue("12");
  await expect(page.getByTestId("brand-logo-preview")).toContainText("approved-logo.png");
  await expect(page.locator('.stage .overlay img[alt="Overlay"]')).toHaveCount(1);
});
