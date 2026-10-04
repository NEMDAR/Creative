import { readFile, stat } from "node:fs/promises";
import JSZip from "jszip";
import { expect, test } from "@playwright/test";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const GREEN_PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNg+M/wHwAEAQH/cetH5QAAAABJRU5ErkJggg==",
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

function createToneWav(
  seconds = 2,
  amplitude = 0.25,
  sampleRate = 8000,
  frequency = 440
) {
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
  for (let index = 0; index < samples; index += 1) {
    const value = Math.sin((2 * Math.PI * frequency * index) / sampleRate);
    buffer.writeInt16LE(
      Math.round(value * Math.min(1, Math.max(0, amplitude)) * 32767),
      44 + index * 2
    );
  }
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

  await page.getByRole("button", { name: "+ Text", exact: true }).click();
  await page.getByLabel("Text", { exact: true }).fill("Ã˜Â¥Ã˜Â¹Ã™â€žÃ˜Â§Ã™â€  Ã˜ÂªÃ˜Â¬Ã˜Â±Ã™Å Ã˜Â¨Ã™Å ");
  await page.getByLabel("Alignment").selectOption("right");
  await page.getByLabel("Opacity").first().fill("0.8");

  const logoInput = page.getByLabel("+ Logo / image", { exact: true });
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

  await expect(page.getByText("Ã˜Â¥Ã˜Â¹Ã™â€žÃ˜Â§Ã™â€  Ã˜ÂªÃ˜Â¬Ã˜Â±Ã™Å Ã˜Â¨Ã™Å ")).toBeVisible();
  await expect(page.locator("#creative-image")).toBeVisible();
  await expect(page.locator('.overlay img[alt="Overlay"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "1:1", exact: true })).toHaveClass(/active/);
});


test("P1 undo/redo restores editor state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ Text", exact: true }).click();
  await page.getByLabel("Text", { exact: true }).fill("First");
  await page.getByLabel("Text", { exact: true }).fill("Second");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByLabel("Text", { exact: true })).toHaveValue("First");

  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Second");
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

  await page.getByRole("button", { name: "+ Text", exact: true }).click();
  await page.getByLabel("Text", { exact: true }).fill("Ã™ÂÃ™Å Ã˜Â¯Ã™Å Ã™Ë† Ã˜ÂªÃ˜Â¬Ã˜Â±Ã™Å Ã˜Â¨Ã™Å  Video");

  const logoInput = page.getByLabel("+ Logo / image", { exact: true });
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

  await page.getByRole("button", { name: "+ Text", exact: true }).click();
  await page.getByLabel("Text", { exact: true }).fill("Timed overlay");
  await page.getByLabel("Overlay start").fill("1");
  await page.getByLabel("Overlay end").fill("2");

  const logoInput = page.getByLabel("+ Logo / image", { exact: true });
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

  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Version One");

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
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Autosaved Edit");
  await expect
    .poll(() => saveState.getAttribute("data-saved-at"), { timeout: 5_000 })
    .not.toBe(previousSavedAt);
  await expect(saveState).toHaveText("Saved");

  await page.reload();

  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Autosaved Edit", { timeout: 5_000 });
  await expect(page.locator("#creative-image")).toBeVisible();
  await expect(
    page.getByTestId("snapshot-item").filter({ hasText: "Manual" }).first()
  ).toContainText("Version One");

  await page
    .getByTestId("snapshot-item")
    .filter({ hasText: "Manual" })
    .first()
    .click();

  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Version One");
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
  await page.getByRole("button", { name: "+ Text", exact: true }).click();
  await expect(page.getByLabel("Text", { exact: true })).toBeVisible();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.mp4$/);

  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error("MP4 download path is unavailable.");
  const info = await stat(downloadedPath);
  expect(info.size).toBeGreaterThan(1_000);

  await expect(renderState).toContainText("Complete Ã‚Â· 100%");
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
  await page.getByRole("button", { name: "+ Text", exact: true }).click();
  await page.getByLabel("Text", { exact: true }).fill("NEMDAR performance smoke");
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
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Edited during render");
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Edited during render");

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
  await expect(preview).toContainText("Ã™â€¦Ã˜Â±Ã˜Â­Ã˜Â¨Ã™â€¹Ã˜Â§ Ã˜Â¨Ã™Æ’ Ã™ÂÃ™Å  Ã™â€ Ã™â€¦Ã˜Â¯Ã˜Â§Ã˜Â± Ã™Æ’Ã˜Â±Ã™Å Ã˜ÂªÃ™Å Ã™Â Ã˜Â³Ã˜ÂªÃ™Ë†Ã˜Â¯Ã™Å Ã™Ë†");
  await expect(preview).toHaveAttribute("dir", "rtl");

  const captionText = page.getByLabel("Caption text");
  await captionText.fill("Ã™â€ Ã™â€¦Ã˜Â¯Ã˜Â§Ã˜Â± Ã™Æ’Ã˜Â±Ã™Å Ã˜ÂªÃ™Å Ã™Â Ã¢â‚¬â€ Ã™Æ’Ã˜Â§Ã˜Â¨Ã˜ÂªÃ˜Â´Ã™â€  Ã™â€¦Ã˜Â¹Ã˜Â¯Ã™â€ž");
  await expect(preview).toHaveText("Ã™â€ Ã™â€¦Ã˜Â¯Ã˜Â§Ã˜Â± Ã™Æ’Ã˜Â±Ã™Å Ã˜ÂªÃ™Å Ã™Â Ã¢â‚¬â€ Ã™Æ’Ã˜Â§Ã˜Â¨Ã˜ÂªÃ˜Â´Ã™â€  Ã™â€¦Ã˜Â¹Ã˜Â¯Ã™â€ž");

  await page.getByLabel("Caption end").fill("1.1");
  await expect(page.locator(".captionCue").first()).toContainText("00:01.1");

  const saveState = page.getByTestId("save-state");
  await expect(saveState).toHaveText("Saved", { timeout: 5_000 });
  const savedAt = await saveState.getAttribute("data-saved-at");
  expect(savedAt).not.toBe("");

  await page.reload();

  await expect(page.getByTestId("caption-meta")).toContainText("ar", { timeout: 5_000 });
  await expect(page.getByLabel("Caption text")).toHaveValue("Ã™â€ Ã™â€¦Ã˜Â¯Ã˜Â§Ã˜Â± Ã™Æ’Ã˜Â±Ã™Å Ã˜ÂªÃ™Å Ã™Â Ã¢â‚¬â€ Ã™Æ’Ã˜Â§Ã˜Â¨Ã˜ÂªÃ˜Â´Ã™â€  Ã™â€¦Ã˜Â¹Ã˜Â¯Ã™â€ž");
  await expect(page.getByTestId("caption-preview")).toHaveText("Ã™â€ Ã™â€¦Ã˜Â¯Ã˜Â§Ã˜Â± Ã™Æ’Ã˜Â±Ã™Å Ã˜ÂªÃ™Å Ã™Â Ã¢â‚¬â€ Ã™Æ’Ã˜Â§Ã˜Â¨Ã˜ÂªÃ˜Â´Ã™â€  Ã™â€¦Ã˜Â¹Ã˜Â¯Ã™â€ž");
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

  await page.getByRole("button", { name: "+ Text", exact: true }).click();
  await page.getByLabel("Text", { exact: true }).fill("Brand headline");
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

test("P3 marketing template creates a brand-safe editable project and persists edits", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Brand name").fill("Template Brand");
  await page.getByLabel("Brand primary color").fill("#102A43");
  await page.getByLabel("Brand secondary color").fill("#2F80ED");
  await page.getByLabel("Brand heading font").fill("Cairo, sans-serif");
  await page.getByLabel("Brand body font").fill("Roboto, sans-serif");
  await page.getByLabel("Brand safe zone").fill("11");

  await page.getByTestId("brand-kit").locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: "template-logo.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await page.getByRole("button", { name: "Start template Product Spotlight" }).click();

  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Template Brand Ã¢â‚¬â€ Product Spotlight");
  await expect(page.getByRole("button", { name: "9:16", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".stage .overlay span").filter({ hasText: "YOUR MAIN HOOK" })).toBeVisible();
  await expect(page.locator(".stage .overlay span").filter({ hasText: "Add one clear benefit" })).toBeVisible();
  await expect(page.locator(".stage .overlay span").filter({ hasText: "LEARN MORE" })).toBeVisible();
  await expect(page.locator('.stage .overlay img[alt="Overlay"]')).toHaveCount(1);
  await expect(page.getByLabel("Caption safe zone")).toHaveValue("11");

  const headline = page.getByLabel("Text", { exact: true });
  await expect(headline).toHaveValue("YOUR MAIN HOOK");
  const saveState = page.getByTestId("save-state");
  const before = await saveState.getAttribute("data-saved-at");
  await headline.fill("Editable campaign hook");
  await expect(page.locator(".stage .overlay span").filter({ hasText: "Editable campaign hook" })).toBeVisible();
  await expect
    .poll(() => saveState.getAttribute("data-saved-at"), { timeout: 5_000 })
    .not.toBe(before);

  await page.reload();

  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Template Brand Ã¢â‚¬â€ Product Spotlight");
  await expect(page.locator(".stage .overlay span").filter({ hasText: "Editable campaign hook" })).toBeVisible();
  await expect(page.locator('.stage .overlay img[alt="Overlay"]')).toHaveCount(1);
});

test("P3 AI command bar previews validated edits applies atomically and supports undo", async ({ page }) => {
  await page.goto("/");

  const command = page.getByLabel("AI edit command");
  await command.fill("set ratio to 4:5; add text: Limited offer");
  await page.getByRole("button", { name: "Preview command" }).click();

  const plan = page.getByTestId("command-plan");
  await expect(plan).toBeVisible();
  await expect(plan.locator("li")).toHaveCount(2);
  await expect(plan).toContainText("Set canvas ratio to 4:5");
  await expect(plan).toContainText("Add text Ã¢â‚¬Å“Limited offerÃ¢â‚¬Â");

  await expect(page.getByRole("button", { name: "9:16", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".stage .overlay span").filter({ hasText: "Limited offer" })).toHaveCount(0);

  await page.getByRole("button", { name: "Apply actions" }).click();

  await expect(page.getByRole("button", { name: "4:5", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".stage .overlay span").filter({ hasText: "Limited offer" })).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "9:16", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".stage .overlay span").filter({ hasText: "Limited offer" })).toHaveCount(0);

  await command.fill("Ã˜Â£Ã˜Â¶Ã™Â Ã™â€ Ã˜Âµ: Ã˜Â¹Ã˜Â±Ã˜Â¶ Ã˜Â®Ã˜Â§Ã˜Âµ");
  await page.getByRole("button", { name: "Preview command" }).click();
  await expect(page.getByTestId("command-plan")).toContainText("Ã˜Â¹Ã˜Â±Ã˜Â¶ Ã˜Â®Ã˜Â§Ã˜Âµ");
  await page.getByRole("button", { name: "Apply actions" }).click();

  const arabicText = page.locator(".stage .overlay span").filter({ hasText: "Ã˜Â¹Ã˜Â±Ã˜Â¶ Ã˜Â®Ã˜Â§Ã˜Âµ" });
  await expect(arabicText).toBeVisible();
  await expect(arabicText).toHaveCSS("direction", "rtl");
});

test("P3 AI command bar rejects unsupported edits before mutation", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("AI edit command").fill("make everything cinematic");
  await page.getByRole("button", { name: "Preview command" }).click();

  await expect(page.locator(".commandError")).toContainText("Unsupported command");
  await expect(page.getByTestId("command-plan")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "9:16", exact: true })).toHaveClass(/active/);
});

test("P4 Provider Router swaps capabilities independently and persists runtime selection", async ({ page }) => {
  await page.goto("/");

  const panel = page.getByTestId("provider-panel");
  await expect(panel).toBeVisible();

  const imageProvider = page.getByLabel("Image provider");
  const videoProvider = page.getByLabel("Video provider");
  const voiceProvider = page.getByLabel("Voice provider");

  await expect(imageProvider).toBeEnabled({ timeout: 5_000 });
  await expect(videoProvider).toBeEnabled();
  await expect(voiceProvider).toBeEnabled();

  await expect(imageProvider).toHaveValue("mock-fast");
  await expect(videoProvider).toHaveValue("mock-fast");
  await expect(voiceProvider).toHaveValue("mock-fast");

  await expect(imageProvider.locator("option")).toHaveCount(2);
  await imageProvider.selectOption("mock-quality");

  await expect(imageProvider).toHaveValue("mock-quality");
  await expect(videoProvider).toHaveValue("mock-fast");
  await expect(voiceProvider).toHaveValue("mock-fast");
  await expect(panel).toContainText("mock-image-quality");

  await page.reload();
  await expect(page.getByLabel("Image provider")).toHaveValue("mock-quality", { timeout: 5_000 });
  await expect(page.getByLabel("Video provider")).toHaveValue("mock-fast");
  await expect(page.getByLabel("Voice provider")).toHaveValue("mock-fast");

  const rejected = await page.request.post("/api/providers", {
    data: { capability: "image", providerId: "missing-provider" },
  });
  expect(rejected.status()).toBe(400);
  await expect.poll(async () => (await rejected.json()).error).toContain("Unknown provider");

  await page.getByLabel("Image provider").selectOption("mock-fast");
  await expect(page.getByLabel("Image provider")).toHaveValue("mock-fast");
});

test("P4 image generation inserts provider-tagged asset into library and persists", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("provider-panel")).toBeVisible();
  await page.getByLabel("Image provider").selectOption("mock-quality");
  await expect(page.getByLabel("Image provider")).toHaveValue("mock-quality");

  await page.getByLabel("Image prompt").fill("Luxury UAE property launch at sunset");
  await page.getByRole("button", { name: "Generate image" }).click();

  await expect(page.locator(".assetCard")).toHaveCount(1);
  await expect(page.getByTestId("asset-generation-meta")).toContainText("mock-quality");
  await expect(page.getByTestId("asset-generation-meta")).toContainText("mock-image-quality");
  await expect(page.locator("#creative-image")).toBeVisible();

  const saveState = page.getByTestId("save-state");
  await expect(saveState).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  await expect(page.locator(".assetCard")).toHaveCount(1);
  await expect(page.getByTestId("asset-generation-meta")).toContainText("mock-quality");
  await expect(page.locator("#creative-image")).toBeVisible();
});

test("P4 image tools create non-destructive edit background and outpaint variants", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Image prompt").fill("Luxury product hero shot");
  await page.getByRole("button", { name: "Generate image" }).click();
  await expect(page.locator(".assetCard")).toHaveCount(1);

  await page.getByLabel("Image edit prompt").fill("Make the lighting warmer and more cinematic");
  await page.getByRole("button", { name: "AI edit selected" }).click();
  await expect(page.locator(".assetCard")).toHaveCount(2);
  await expect(page.getByTestId("asset-generation-meta").nth(1)).toContainText("edit");

  await page.getByRole("button", { name: "Remove background" }).click();
  await expect(page.locator(".assetCard")).toHaveCount(3);
  await expect(page.getByTestId("asset-generation-meta").nth(2)).toContainText("background");

  await page.getByRole("button", { name: "Outpaint 4:5" }).click();
  await expect(page.locator(".assetCard")).toHaveCount(4);
  await expect(page.getByTestId("asset-generation-meta").nth(3)).toContainText("outpaint");

  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  await expect(page.locator(".assetCard")).toHaveCount(4);
  await expect(page.getByTestId("asset-generation-meta").nth(1)).toContainText("edit");
  await expect(page.getByTestId("asset-generation-meta").nth(2)).toContainText("background");
  await expect(page.getByTestId("asset-generation-meta").nth(3)).toContainText("outpaint");
});

test("P4 generates text video image video and voiceover as editable persisted assets", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Image prompt").fill("Modern UAE real estate lobby");
  await page.getByRole("button", { name: "Generate image" }).click();
  await expect(page.locator(".assetCard")).toHaveCount(1);

  await page.getByLabel("Video prompt").fill("Slow cinematic camera push with premium lighting");
  await page.getByLabel("Video duration").fill("6");
  await page.getByRole("button", { name: "Image Ã¢â€ â€™ Video" }).click();
  await expect(page.locator(".assetCard")).toHaveCount(2);
  await expect(page.getByTestId("asset-generation-meta").nth(1)).toContainText("image_to_video");

  await page.getByRole("button", { name: "Text Ã¢â€ â€™ Video" }).click();
  await expect(page.locator(".assetCard")).toHaveCount(3);
  await expect(page.getByTestId("asset-generation-meta").nth(2)).toContainText("video_generate");

  await page.getByLabel("Voiceover text").fill("Ã˜Â§Ã™Æ’Ã˜ÂªÃ˜Â´Ã™Â Ã™â€¦Ã˜Â´Ã˜Â±Ã™Ë†Ã˜Â¹Ã™Æ’ Ã˜Â§Ã™â€žÃ™â€šÃ˜Â§Ã˜Â¯Ã™â€¦ Ã™â€¦Ã˜Â¹ Ã™â€ Ã™â€¦Ã˜Â¯Ã˜Â§Ã˜Â±");
  await page.getByLabel("Voiceover language").selectOption("ar");
  await page.getByRole("button", { name: "Generate voiceover" }).click();

  await expect(page.getByTestId("audio-inspector")).toBeVisible();
  await expect(page.getByTestId("audio-generation-meta")).toContainText("voice_synthesize");
  await expect(page.getByTestId("audio-generation-meta")).toContainText("mock-voice");

  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  await expect(page.locator(".assetCard")).toHaveCount(3);
  await expect(page.getByTestId("asset-generation-meta").nth(1)).toContainText("image_to_video");
  await expect(page.getByTestId("asset-generation-meta").nth(2)).toContainText("video_generate");
  await expect(page.getByTestId("audio-generation-meta")).toContainText("voice_synthesize");
});

test("P4 storyboard stays editable and B-roll suggestions rank existing and generative options", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "existing-broll.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await page.getByLabel("Storyboard brief").fill(
    "Introduce the premium waterfront project. Show lifestyle amenities and finish with a strong call to action."
  );
  await page.getByRole("button", { name: "Generate storyboard" }).click();

  await expect(page.getByTestId("storyboard-scene")).toHaveCount(2);
  await expect(page.getByTestId("storyboard-meta")).toContainText("storyboard-v1");

  await page.getByLabel("Storyboard scene 1 title").fill("Opening Hook");
  await page.getByLabel("Storyboard scene 1 duration").fill("7");
  await expect(page.getByLabel("Storyboard scene 1 title")).toHaveValue("Opening Hook");

  await page.getByRole("button", { name: "Suggest B-roll" }).click();
  await expect(page.getByTestId("broll-list")).toHaveCount(2);

  const firstBroll = page.getByTestId("broll-list").first();
  await expect(firstBroll).toContainText("existing-broll.png");
  await expect(firstBroll).toContainText("Generate cinematic B-roll");
  await expect(firstBroll).toContainText("Generate still B-roll");

  await firstBroll.getByRole("button", { name: /Generate cinematic B-roll/ }).click();
  await expect(page.getByLabel("Video prompt")).not.toHaveValue("");

  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  await expect(page.getByTestId("storyboard-scene")).toHaveCount(2);
  await expect(page.getByLabel("Storyboard scene 1 title")).toHaveValue("Opening Hook");
  await expect(page.getByLabel("Storyboard scene 1 duration")).toHaveValue("7");
  await expect(page.getByTestId("broll-list").first()).toContainText("existing-broll.png");
});

test("P4 generation ledger and provenance persist result lineage and review status", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Image prompt").fill("Premium branded property key visual");
  await page.getByRole("button", { name: "Generate image" }).click();

  await expect(page.getByTestId("generation-record")).toHaveCount(1);
  const firstRecord = page.getByTestId("generation-record").first();
  await expect(firstRecord).toContainText("generate");
  await expect(firstRecord).toContainText("succeeded");
  await expect(firstRecord).toContainText("mock-");

  await expect(page.getByTestId("provenance-panel")).toBeVisible();
  await expect(page.getByTestId("provenance-review")).toHaveText("unreviewed");
  await expect(page.getByTestId("provenance-panel")).toContainText("provider-terms");

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByTestId("provenance-review")).toHaveText("approved");

  await page.getByLabel("Image edit prompt").fill("Add warmer premium lighting");
  await page.getByRole("button", { name: "AI edit selected" }).click();

  await expect(page.getByTestId("generation-record")).toHaveCount(2);
  await expect(page.getByTestId("generation-record").first()).toContainText("edit");
  await expect(page.getByTestId("provenance-panel")).toContainText("ai-edited");
  await expect(page.getByTestId("provenance-panel")).toContainText("Source");

  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  await expect(page.getByTestId("generation-record")).toHaveCount(2);
  await page.locator(".assetCard").first().click();
  await expect(page.getByTestId("provenance-review")).toHaveText("approved");
  await expect(page.getByTestId("provenance-panel")).toContainText("provider-terms");
});

test("P5 marketing brief produces editable concepts and a scene plan without invented claims", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Brief product").fill("NEMDAR Creator");
  await page.getByLabel("Brief audience").fill("UAE real estate marketing teams");
  await page.getByLabel("Brief objective").fill("Generate qualified leads");
  await page.getByLabel("Brief offer").fill("Book a product demo");
  await page.getByLabel("Brief CTA").fill("Request a demo");
  await page.getByLabel("Brief approved claims").fill("AI-assisted creative workflow\nEditable campaign assets");

  await expect(page.getByText("Ready for concepts")).toBeVisible();
  await page.getByRole("button", { name: "Generate concepts" }).click();

  await expect(page.getByTestId("creative-concept")).toHaveCount(3);
  const concepts = page.getByTestId("creative-concept");
  await expect(concepts.nth(0)).toContainText("Problem Ã¢â€ â€™ Outcome");
  await expect(concepts.nth(1)).toContainText("Product First");
  await expect(concepts.nth(2)).toContainText("Offer Momentum");
  await expect(page.getByTestId("concept-grid")).not.toContainText("ROI");
  await expect(page.getByTestId("concept-grid")).not.toContainText("guaranteed");

  await page.getByLabel("Problem Ã¢â€ â€™ Outcome hook").fill("Create campaign assets without starting from zero.");
  await page.getByLabel("Problem Ã¢â€ â€™ Outcome CTA").fill("Request your demo");
  await page.getByRole("button", { name: "Use concept Ã¢â€ â€™ scene plan" }).first().click();

  await expect(page.getByTestId("storyboard-meta")).toContainText("concept-scene-plan-v1");
  await expect(page.getByTestId("storyboard-scene").first()).toContainText("Scene 1");
  await expect(page.getByLabel("Storyboard brief")).toContainText("NEMDAR Creator");
});

test("P5 marketing brief captures governed campaign context and persists", async ({ page }) => {
  await page.goto("/");

  const brief = page.getByTestId("marketing-brief");
  await expect(brief).toContainText("Brief incomplete");

  await page.getByLabel("Brief product").fill("NEMDAR Creator for UAE real-estate marketing teams");
  await page.getByLabel("Brief audience").fill("Marketing managers and sales teams in UAE property companies");
  await page.getByLabel("Brief objective").fill("Generate qualified campaign enquiries");
  await page.getByLabel("Brief offer").fill("Book a product walkthrough");
  await page.getByLabel("Brief CTA").fill("Book a demo");
  await page.getByLabel("Brief tone").fill("Premium, direct, modern");
  await page.getByLabel("Brief approved claims").fill(
    "AI-assisted creative workflow\nArabic and English campaign support"
  );
  await page.getByLabel("Brief prohibited claims").fill(
    "Guaranteed ROI\nNumber one in the UAE"
  );
  await page.getByRole("button", { name: "tiktok", exact: true }).click();
  await page.getByRole("button", { name: "EN", exact: true }).click();

  await expect(brief).toContainText("Ready for concepts");


  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  await expect(page.getByLabel("Brief product")).toHaveValue("NEMDAR Creator for UAE real-estate marketing teams");
  await expect(page.getByLabel("Brief audience")).toHaveValue("Marketing managers and sales teams in UAE property companies");
  await expect(page.getByLabel("Brief CTA")).toHaveValue("Book a demo");
  await expect(page.getByRole("button", { name: "tiktok", exact: true })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "EN", exact: true })).toHaveClass(/active/);
  await expect(page.getByLabel("Brief approved claims")).toContainText("AI-assisted creative workflow");
  await expect(page.getByLabel("Brief prohibited claims")).toContainText("Guaranteed ROI");
  await expect(page.getByTestId("marketing-brief")).toContainText("Ready for concepts");
});

test("P5 brief-to-edit orchestration creates storyboard generated asset ratio and editable overlays", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brief product").fill("NEMDAR Creator");
  await page.getByLabel("Brief audience").fill("UAE property marketers");
  await page.getByLabel("Brief objective").fill("Generate leads");
  await page.getByLabel("Brief offer").fill("Book a demo");
  await page.getByLabel("Brief CTA").fill("Request demo");
  await page.getByLabel("Brief approved claims").fill("AI-assisted creative workflow");
  await page.getByRole("button", { name: "Generate concepts" }).click();

  await page.getByRole("button", { name: "Build initial edit" }).first().click();

  await expect(page.getByTestId("storyboard-meta")).toContainText("concept-scene-plan-v1");
  await expect(page.locator(".assetCard")).toHaveCount(1);
  await expect(page.getByTestId("asset-generation-meta")).toContainText("generate");
  await expect(page.getByTestId("overlay-track-item")).toHaveCount(2);
  await expect(page.getByTestId("overlay-track-item").first()).toContainText("text");
  await expect(page.getByTestId("overlay-track-item").nth(1)).toContainText("text");
  await expect(page.getByRole("button", { name: "9:16", exact: true }).first()).toHaveClass(/active/);
});

test("P5 master creative generates four editable platform variants and persists", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Brief product").fill("NEMDAR Creator");
  await page.getByLabel("Brief audience").fill("UAE marketing teams");
  await page.getByLabel("Brief objective").fill("Generate qualified leads");
  await page.getByLabel("Brief CTA").fill("Request a demo");
  await page.getByLabel("Brief approved claims").fill("AI-assisted creative workflow");

  await page.getByRole("button", { name: "Generate concepts" }).click();
  await page.getByRole("button", { name: "Build initial edit" }).first().click();

  await expect(page.locator(".stage .overlay")).toHaveCount(2);
  await page.getByRole("button", { name: "Generate platform variants" }).click();

  await expect(page.getByTestId("campaign-variant")).toHaveCount(4);
  await expect(page.getByTestId("variant-grid")).toContainText("9:16");
  await expect(page.getByTestId("variant-grid")).toContainText("1:1");
  await expect(page.getByTestId("variant-grid")).toContainText("4:5");
  await expect(page.getByTestId("variant-grid")).toContainText("16:9");

  await page.getByTestId("campaign-variant").filter({ hasText: "Square Feed" }).getByRole("button", { name: "Edit variant" }).click();
  await expect(page.getByRole("button", { name: "1:1", exact: true })).toHaveClass(/active/);

  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  await expect(page.getByTestId("campaign-variant")).toHaveCount(4);
  await expect(page.getByTestId("variant-count")).toContainText("4 editable variants");
});

test("P5 language variants preserve master linkage and experiments stay bounded to three", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Brief product").fill("NEMDAR Creator");
  await page.getByLabel("Brief audience").fill("UAE marketing teams");
  await page.getByLabel("Brief objective").fill("Generate qualified leads");
  await page.getByLabel("Brief CTA").fill("Request a demo");
  await page.getByLabel("Brief approved claims").fill("AI-assisted creative workflow");
  await page.getByRole("button", { name: "EN", exact: true }).click();

  await page.getByRole("button", { name: "Generate concepts" }).click();
  await page.getByRole("button", { name: "Build initial edit" }).first().click();

  await page.getByRole("button", { name: "Generate AR / EN variants" }).click();
  await expect(page.getByTestId("language-variant")).toHaveCount(2);
  await expect(page.getByTestId("language-variant-grid")).toContainText("AR");
  await expect(page.getByTestId("language-variant-grid")).toContainText("EN");

  const arabicVariant = page.locator('[data-testid="language-variant"][dir="rtl"]');
  await expect(arabicVariant).toContainText("Review");
  await arabicVariant.getByRole("button", { name: "Apply language" }).click();
  await expect(page.locator(".stage .overlay span").first()).toHaveCSS("direction", "rtl");

  await page.getByRole("button", { name: "Generate 3 experiments" }).click();
  await expect(page.getByTestId("campaign-experiment")).toHaveCount(3);
  await expect(page.getByTestId("experiment-grid")).toContainText("Master");

  await page.getByTestId("campaign-experiment").nth(1).getByRole("button", { name: "Apply experiment" }).click();
  await expect(page.getByLabel("Problem Ã¢â€ â€™ Outcome hook")).toHaveValue(/Quick take:/);

  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  await expect(page.getByTestId("language-variant")).toHaveCount(2);
  await expect(page.getByTestId("campaign-experiment")).toHaveCount(3);
});

test("P5 Brand Guardian blocks unsafe claims and clears after correction", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Brief product").fill("NEMDAR Creator");
  await page.getByLabel("Brief audience").fill("UAE marketing teams");
  await page.getByLabel("Brief objective").fill("Generate qualified leads");
  await page.getByLabel("Brief CTA").fill("Request a demo");
  await page.getByLabel("Brief approved claims").fill("AI-assisted creative workflow");
  await page.getByLabel("Brief prohibited claims").fill("Guaranteed ROI");

  await page.getByRole("button", { name: "Generate concepts" }).click();
  await page.getByRole("button", { name: "Build initial edit" }).first().click();

  await expect(page.getByTestId("guardian-status")).toContainText("Pass");

  await page.getByLabel("AI edit command").fill("add text: Guaranteed ROI");
  await page.getByRole("button", { name: "Preview command" }).click();
  await page.getByRole("button", { name: "Apply actions" }).click();

  await expect(page.getByTestId("guardian-status")).toContainText("Blocked");
  await expect(page.getByTestId("brand-guardian")).toContainText("Unsafe or prohibited claim");
  await expect(page.getByTestId("brand-guardian")).toContainText("Guaranteed ROI");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("guardian-status")).toContainText("Pass");});

test("P5 Campaign Pack exports a real ZIP with manifest copy project and assets", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Brief product").fill("NEMDAR Creator");
  await page.getByLabel("Brief audience").fill("UAE marketing teams");
  await page.getByLabel("Brief objective").fill("Generate qualified leads");
  await page.getByLabel("Brief CTA").fill("Request a demo");
  await page.getByLabel("Brief approved claims").fill("AI-assisted creative workflow");
  await page.getByRole("button", { name: "EN", exact: true }).click();

  await page.getByRole("button", { name: "Generate concepts" }).click();
  await page.getByRole("button", { name: "Build initial edit" }).first().click();
  await page.getByRole("button", { name: "Generate platform variants" }).click();
  await page.getByRole("button", { name: "Generate AR / EN variants" }).click();
  await page.getByRole("button", { name: "Generate 3 experiments" }).click();

  await expect(page.getByTestId("guardian-status")).toContainText("Pass");
  await expect(page.getByTestId("export-campaign-pack")).toBeEnabled();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-campaign-pack").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/campaign-pack\.zip$/);

  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const buffer = await readFile(downloadPath!);
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files);

  expect(names).toContain("manifest.json");
  expect(names).toContain("copy/marketing-brief.json");
  expect(names).toContain("copy/concepts.json");
  expect(names).toContain("copy/language-variants.json");
  expect(names).toContain("copy/experiments.json");
  expect(names).toContain("variants/platform-variants.json");
  expect(names).toContain("project/storyboard.json");
  expect(names).toContain("project/captions.json");
  expect(names).toContain("ai/generation-ledger.json");
  expect(names.some((name) => name.startsWith("assets/") && !name.endsWith("/"))).toBeTruthy();

  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  expect(manifest.studio).toBe("NEMDAR Creator");
  expect(manifest.preflight.status).toBe("pass");
  expect(manifest.campaignVariants).toHaveLength(4);
  expect(manifest.languageVariants).toHaveLength(2);
  expect(manifest.campaignExperiments).toHaveLength(3);
});

test("P6 overlay keyframes interpolate transform opacity easing and persist", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "motion-source.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await expect(page.getByTestId("timeline-clock")).toContainText("00:00.0");
  await page.getByRole("button", { name: "+ Text", exact: true }).click();
  await expect(page.getByTestId("motion-inspector")).toBeVisible();

  await page.getByRole("button", { name: /Add keyframe at/ }).click();
  await page.getByLabel("Keyframe X").fill("20");
  await page.getByLabel("Keyframe Y").fill("20");
  await page.getByLabel("Keyframe opacity").fill("0.2");
  await page.getByLabel("Keyframe scale").fill("0.5");
  await page.getByLabel("Keyframe rotation").fill("-10");
  await page.getByLabel("Keyframe easing").selectOption("linear");

  const surface = page.getByTestId("timeline-surface");
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  if (!box) throw new Error("Timeline surface has no layout box.");

  await surface.click({ position: { x: box.width * 0.8, y: 1 } });
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:04.0");

  await page.getByRole("button", { name: /Add keyframe at/ }).click();
  await page.getByLabel("Keyframe X").fill("80");
  await page.getByLabel("Keyframe Y").fill("60");
  await page.getByLabel("Keyframe opacity").fill("1");
  await page.getByLabel("Keyframe scale").fill("1.5");
  await page.getByLabel("Keyframe rotation").fill("30");
  await page.getByLabel("Keyframe easing").selectOption("ease-in-out");

  await expect(page.getByTestId("overlay-keyframe")).toHaveCount(2);

  await surface.click({ position: { x: box.width * 0.4, y: 1 } });
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:02.0");

  const overlay = page.locator(".stage .overlay").first();
  await expect(overlay).toHaveAttribute("data-motion-x", "50.000");
  await expect(overlay).toHaveAttribute("data-motion-y", "40.000");
  await expect(overlay).toHaveAttribute("data-motion-opacity", "0.600");
  await expect(overlay).toHaveAttribute("data-motion-scale", "1.000");
  await expect(overlay).toHaveAttribute("data-motion-rotation", "10.000");


  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  await page.locator(".stage .overlay").first().click();
  await expect(page.getByTestId("overlay-keyframe")).toHaveCount(2);

  const reloadedSurface = page.getByTestId("timeline-surface");
  await reloadedSurface.scrollIntoViewIfNeeded();
  const reloadedBox = await reloadedSurface.boundingBox();
  if (!reloadedBox) throw new Error("Reloaded timeline surface has no layout box.");
  await reloadedSurface.click({ position: { x: reloadedBox.width * 0.4, y: 1 } });

  const reloadedOverlay = page.locator(".stage .overlay").first();
  await expect(reloadedOverlay).toHaveAttribute("data-motion-x", "50.000");
  await expect(reloadedOverlay).toHaveAttribute("data-motion-opacity", "0.600");
});

test("P6 overlay masks and blend modes preview export state and persist", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "+ Text", exact: true }).click();
  await page.locator("label").filter({ hasText: /^Text/ }).locator("textarea").fill("Masked headline");

  await page.getByLabel("Overlay mask shape").selectOption("ellipse");
  await page.getByLabel("Overlay mask inset").fill("18");
  await page.getByLabel("Overlay blend mode").selectOption("screen");

  const overlay = page.locator(".stage .overlay").filter({ hasText: "Masked headline" });
  await expect(overlay).toHaveAttribute("data-mask-shape", "ellipse");
  await expect(overlay).toHaveAttribute("data-blend-mode", "screen");
  await expect(overlay).toHaveCSS("mix-blend-mode", "screen");
  await expect(overlay).toHaveCSS("clip-path", /ellipse/);

  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  const restored = page.locator(".stage .overlay").filter({ hasText: "Masked headline" });
  await expect(restored).toHaveAttribute("data-mask-shape", "ellipse");
  await expect(restored).toHaveAttribute("data-blend-mode", "screen");
  await restored.click();
  await expect(page.getByLabel("Overlay mask shape")).toHaveValue("ellipse");
  await expect(page.getByLabel("Overlay mask inset")).toHaveValue("18");
  await expect(page.getByLabel("Overlay blend mode")).toHaveValue("screen");
});

test("P6 overlay masks and blend modes preview and persist non-destructively", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "composite-source.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  const logoInput = page
    .locator("label.fileButton")
    .filter({ hasText: "+ Logo / image" })
    .locator('input[type="file"]');
  await logoInput.setInputFiles({
    name: "mask-layer.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await expect(page.getByTestId("compositing-inspector")).toBeVisible();
  await page.getByLabel("Overlay mask shape").selectOption("ellipse");
  await page.getByLabel("Overlay mask inset").fill("12");
  await page.getByLabel("Overlay blend mode").selectOption("multiply");

  const overlay = page.locator(".stage .overlay").first();
  await expect(overlay).toHaveAttribute("data-mask-shape", "ellipse");
  await expect(overlay).toHaveAttribute("data-blend-mode", "multiply");
  await expect(overlay).toHaveCSS("mix-blend-mode", "multiply");
  await expect(overlay).toHaveCSS("clip-path", /ellipse/);

  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  await expect(page.getByTestId("compositing-inspector")).toBeVisible();
  await expect(page.getByLabel("Overlay mask shape")).toHaveValue("ellipse");
  await expect(page.getByLabel("Overlay mask inset")).toHaveValue("12");
  await expect(page.getByLabel("Overlay blend mode")).toHaveValue("multiply");

  const restoredOverlay = page.locator(".stage .overlay").first();
  await expect(restoredOverlay).toHaveAttribute("data-mask-shape", "ellipse");
  await expect(restoredOverlay).toHaveAttribute("data-blend-mode", "multiply");
});

test("P6 motion presets generate editable brand-safe keyframes and persist", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "motion-source.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await page.getByRole("button", { name: "+ Text", exact: true }).click();
  await expect(page.getByTestId("motion-preset-grid")).toBeVisible();

  const textEditor = page.locator("label").filter({ hasText: /^Text/ }).locator("textarea");
  await textEditor.fill("Motion headline");

  const stageText = page.locator(".stage .overlay").filter({ hasText: "Motion headline" });
  const fontBefore = await stageText.locator("span").evaluate((el) => getComputedStyle(el).fontFamily);
  const colorBefore = await stageText.locator("span").evaluate((el) => getComputedStyle(el).color);

  await page.getByTestId("motion-preset-grid").getByRole("button", { name: /^Slide Up/ }).click();
  await expect(page.getByTestId("overlay-keyframe")).toHaveCount(2);
  await expect(page.getByLabel("Keyframe Y")).toHaveValue("34");
  await expect(page.getByLabel("Keyframe opacity")).toHaveValue("0");

  await page.getByTestId("overlay-keyframe").nth(1).click();
  await expect(page.getByLabel("Keyframe Y")).toHaveValue("22");
  await expect(page.getByLabel("Keyframe opacity")).toHaveValue("1");

  await expect(stageText.locator("span")).toHaveCSS("font-family", new RegExp(fontBefore.split(",")[0].replace(/["']/g, "")));
  await expect(stageText.locator("span")).toHaveCSS("color", colorBefore);

  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  const restored = page.locator(".stage .overlay").filter({ hasText: "Motion headline" });
  await restored.click();
  await expect(page.getByTestId("overlay-keyframe")).toHaveCount(2);
  await page.getByTestId("overlay-keyframe").first().click();
  await expect(page.getByLabel("Keyframe Y")).toHaveValue("34");
  await expect(page.getByLabel("Keyframe opacity")).toHaveValue("0");
});

test("P6 chroma key replaces keyed pixels non-destructively and persists", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "green-screen.png",
    mimeType: "image/png",
    buffer: GREEN_PNG_1X1,
  });
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);

  await page.getByLabel("Chroma key enabled").check();
  await page.getByLabel("Chroma key color").fill("#00ff00");
  await page.getByLabel("Chroma tolerance").fill("0.25");
  await page.getByLabel("Chroma spill").fill("0.5");
  await page.getByLabel("Chroma background color").fill("#112233");

  const preview = page.getByTestId("chroma-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("data-chroma-key", "#00FF00");
  await expect(preview).toHaveAttribute("data-chroma-background", "#112233");

  await expect.poll(async () => {
    return preview.evaluate((canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx || canvas.width === 0 || canvas.height === 0) return "";
      const pixel = ctx.getImageData(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
        1,
        1
      ).data;
      return [pixel[0], pixel[1], pixel[2], pixel[3]].join(",");
    });
  }, { timeout: 5_000 }).toBe("17,34,51,255");

  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  await expect(page.getByLabel("Chroma key enabled")).toBeChecked();
  await expect(page.getByLabel("Chroma key color")).toHaveValue("#00ff00");
  await expect(page.getByLabel("Chroma background color")).toHaveValue("#112233");
  await expect(page.getByLabel("Chroma tolerance")).toHaveValue("0.25");
  await expect(page.getByLabel("Chroma spill")).toHaveValue("0.5");
  await expect(page.getByTestId("chroma-preview")).toBeVisible();
});

test("P6 color controls and LUT preset are non-destructive and persist", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "grade-source.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);

  await page.getByLabel("Clip exposure").fill("0.5");
  await page.getByLabel("Clip contrast").fill("1.2");
  await page.getByLabel("Clip saturation").fill("0.8");
  await page.getByLabel("Clip LUT").selectOption("mono");

  const image = page.locator("#creative-image");
  await expect(image).toHaveCSS("filter", /brightness\(1\.414\)/);
  await expect(image).toHaveCSS("filter", /contrast\(1\.2/);
  await expect(image).toHaveCSS("filter", /saturate\(0\.8/);
  await expect(image).toHaveCSS("filter", /grayscale\(1\)/);
  await expect(page.locator(".assetCard")).toHaveCount(1);
  await expect(page.locator(".assetCard strong")).toHaveText("grade-source.png");

  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  await expect(page.getByLabel("Clip exposure")).toHaveValue("0.5");
  await expect(page.getByLabel("Clip contrast")).toHaveValue("1.2");
  await expect(page.getByLabel("Clip saturation")).toHaveValue("0.8");
  await expect(page.getByLabel("Clip LUT")).toHaveValue("mono");
  await expect(page.locator("#creative-image")).toHaveCSS("filter", /grayscale\(1\)/);
  await expect(page.locator(".assetCard strong")).toHaveText("grade-source.png");
});

test("P6 audio mix normalizes measured peak and persists source track fades and role", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "mix-source.webm",
    mimeType: "video/webm",
    buffer: WEBM_CLIP,
  });
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);

  await page.locator('input[accept="audio/*"]').setInputFiles({
    name: "music-tone.wav",
    mimeType: "audio/wav",
    buffer: createToneWav(2, 0.25),
  });

  await expect(page.getByTestId("audio-inspector")).toBeVisible();
  await expect(page.getByTestId("audio-peak")).toContainText("Measured peak 25", { timeout: 5_000 });

  await page.getByLabel("Source audio level").fill("0.5");
  await page.getByLabel("Audio track role").selectOption("music");
  await page.getByLabel("Normalize audio track").check();
  await page.getByLabel("Normalize target").fill("0.5");
  await page.getByLabel("Audio gain").fill("0.4");
  await page.getByLabel("Audio fade in").fill("0.1");
  await page.getByLabel("Audio fade out").fill("0.1");

  const audio = page.locator("audio");
  await expect(audio).toHaveAttribute("data-track-role", "music");
  await expect(audio).toHaveAttribute("data-normalization-gain", "2.000");
  await expect(page.getByTestId("audio-peak")).toContainText("normalization ×2.00");

  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();

  await expect(page.getByLabel("Source audio level")).toHaveValue("0.5");
  await expect(page.getByLabel("Audio track role")).toHaveValue("music");
  await expect(page.getByLabel("Normalize audio track")).toBeChecked();
  await expect(page.getByLabel("Normalize target")).toHaveValue("0.5");
  await expect(page.getByLabel("Audio gain")).toHaveValue("0.4");
  await expect(page.getByLabel("Audio fade in")).toHaveValue("0.1");
  await expect(page.getByLabel("Audio fade out")).toHaveValue("0.1");
  await expect(page.locator("audio")).toHaveAttribute("data-normalization-gain", "2.000");
});

test("P6 proxy media swaps preview source and persists with local draft", async ({ page }) => {
  await page.route("**/api/proxy", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: {
        "x-nemdar-proxy-cache-key": "test-proxy-key",
        "x-nemdar-source-bytes": String(PNG_1X1.length * 2),
        "x-nemdar-proxy-bytes": String(PNG_1X1.length),
      },
      body: PNG_1X1,
    });
  });

  await page.goto("/");
  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "proxy-source.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await expect(page.getByTestId("asset-proxy-meta")).toContainText("Proxy preview");
  await expect(page.locator("#creative-image")).toHaveAttribute("data-preview-source", "proxy");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Save draft" }).click();

  await page.reload();
  await page.getByRole("button", { name: "Load draft" }).click();

  await expect(page.locator("#creative-image")).toHaveAttribute("data-preview-source", "proxy");
  await expect(page.getByTestId("asset-proxy-meta")).toContainText("Proxy preview");
});

test("P6 review comments anchor to timecode resolve and restore with versions", async ({ page }) => {
  await page.route("**/api/proxy", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: {
        "x-nemdar-proxy-cache-key": "review-proxy",
        "x-nemdar-source-bytes": String(PNG_1X1.length),
        "x-nemdar-proxy-bytes": String(PNG_1X1.length),
      },
      body: PNG_1X1,
    });
  });

  await page.goto("/");
  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "review-source.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Review Version");
  const surface = page.getByTestId("timeline-surface");
  await surface.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: rect.left + rect.width * 0.6,
        clientY: rect.top + 1,
      })
    );
  });
  await expect(page.getByTestId("timeline-clock")).toHaveText("00:03.0");

  await page.getByLabel("Review comment").fill("Lift the logo above the safe area.");
  await page.getByRole("button", { name: "Add comment" }).click();

  const comment = page.getByTestId("review-comment").filter({
    hasText: "Lift the logo above the safe area.",
  });
  await expect(comment).toBeVisible();
  await expect(comment).toHaveAttribute("data-resolved", "false");
  await expect(comment.getByRole("button", { name: "Jump to comment at 00:03.0" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Save draft" }).click();

  const manualVersion = page
    .getByTestId("snapshot-item")
    .filter({ hasText: "Review Version" })
    .filter({ hasText: "Manual" })
    .first();
  await expect(manualVersion).toContainText("1 comment");

  await comment.getByRole("button", { name: "Resolve comment" }).click();
  await expect(comment).toHaveAttribute("data-resolved", "true");
  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });

  await manualVersion.click();
  await expect(comment).toHaveAttribute("data-resolved", "false");
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Review Version");

  await page.reload();
  await expect(page.getByTestId("review-comment")).toContainText("Lift the logo above the safe area.");
  await expect(page.getByTestId("review-comment")).toHaveAttribute("data-resolved", "false");
});

test("P6 project approval is gated by open comments and versioned", async ({ page }) => {
  await page.route("**/api/proxy", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: {
        "x-nemdar-proxy-cache-key": "approval-proxy",
        "x-nemdar-source-bytes": String(PNG_1X1.length),
        "x-nemdar-proxy-bytes": String(PNG_1X1.length),
      },
      body: PNG_1X1,
    });
  });

  await page.goto("/");
  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "approval-source.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Approval Version");

  await page.getByLabel("Approval note").fill("Ready for stakeholder review.");
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByTestId("approval-status")).toHaveText("in review");
  await expect(page.getByTestId("approval-current-note")).toHaveText("Ready for stakeholder review.");

  await page.getByLabel("Review comment").fill("Move the CTA higher.");
  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(page.getByTestId("approval-blocker")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve project" })).toBeDisabled();

  await page.getByRole("button", { name: "Resolve comment" }).click();
  await expect(page.getByRole("button", { name: "Approve project" })).toBeEnabled();

  await page.getByLabel("Approval note").fill("Approved after CTA review.");
  await page.getByRole("button", { name: "Approve project" }).click();
  await expect(page.getByTestId("approval-status")).toHaveText("approved");
  await expect(page.getByTestId("approval-current-note")).toHaveText("Approved after CTA review.");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Save draft" }).click();

  const approvedVersion = page
    .getByTestId("snapshot-item")
    .filter({ hasText: "Approval Version" })
    .filter({ hasText: "Manual" })
    .first();
  await expect(approvedVersion).toContainText("approved");

  await page.getByLabel("Review comment").fill("New issue found after approval.");
  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(page.getByTestId("approval-status")).toHaveText("changes requested");
  await expect(page.getByTestId("approval-current-note")).toContainText("new review comment");

  await approvedVersion.click();
  await expect(page.getByTestId("approval-status")).toHaveText("approved");
  await expect(page.getByTestId("review-comment")).toHaveCount(1);
  await expect(page.getByTestId("review-comment")).toHaveAttribute("data-resolved", "true");

  await page.reload();
  await expect(page.getByTestId("approval-status")).toHaveText("approved");
  await expect(page.getByTestId("approval-current-note")).toHaveText("Approved after CTA review.");
});

test("P6 reusable motion components can be captured applied and persisted", async ({ page }) => {
  await page.route("**/api/proxy", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: {
        "x-nemdar-proxy-cache-key": "motion-component-proxy",
        "x-nemdar-source-bytes": String(PNG_1X1.length),
        "x-nemdar-proxy-bytes": String(PNG_1X1.length),
      },
      body: PNG_1X1,
    });
  });

  await page.goto("/");
  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "motion-component-source.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  await page.getByRole("button", { name: "+ Text", exact: true }).click();
  const textEditor = page.locator("label").filter({ hasText: /^Text/ }).locator("textarea");
  await textEditor.fill("Motion source");
  await page.getByTestId("motion-preset-grid").getByRole("button", { name: /^Slide Up/ }).click();
  await expect(page.getByTestId("overlay-keyframe")).toHaveCount(2);

  await page.getByLabel("Motion component name").fill("CTA Slide");
  await page.getByRole("button", { name: "Save motion component" }).click();
  const component = page.getByTestId("motion-component").filter({ hasText: "CTA Slide" });
  await expect(component).toBeVisible();
  await expect(component).toContainText("2 frames");

  await page.getByRole("button", { name: "+ Text", exact: true }).click();
  await textEditor.fill("Motion target");
  await expect(page.getByTestId("overlay-keyframe")).toHaveCount(0);

  await component.getByRole("button", { name: "Apply motion component CTA Slide" }).click();
  await expect(page.getByTestId("overlay-keyframe")).toHaveCount(2);
  await page.getByTestId("overlay-keyframe").first().click();
  await expect(page.getByLabel("Keyframe opacity")).toHaveValue("0");
  await page.getByTestId("overlay-keyframe").nth(1).click();
  await expect(page.getByLabel("Keyframe opacity")).toHaveValue("1");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Save draft" }).click();
  const manualVersion = page
    .getByTestId("snapshot-item")
    .filter({ hasText: "Manual" })
    .first();
  await expect(manualVersion).toContainText("1 motion component");

  await page.reload();
  await expect(page.getByTestId("motion-component").filter({ hasText: "CTA Slide" })).toBeVisible();
  const restoredTarget = page.locator(".stage .overlay").filter({ hasText: "Motion target" });
  await restoredTarget.click();
  await expect(page.getByTestId("overlay-keyframe")).toHaveCount(2);
});

test("P7 batch generation validates CSV rows bounds API output and loads branded variants", async ({ page }) => {
  await page.goto("/");

  const csv = [
    "name,headline,body,cta,ratio,language,template",
    "Launch A,Premium launch,Waterfront living,Learn more,9:16,en,product-spotlight",
    "Arabic Campaign,مشروع مميز,حياة عصرية,اعرف المزيد,4:5,ar,testimonial",
    "Broken Row,Bad ratio,Copy,Act,3:2,en,offer-stack",
  ].join("\n");

  await page.getByLabel("Batch CSV").fill(csv);
  await page.getByRole("button", { name: "Generate batch" }).click();

  await expect(page.getByTestId("batch-summary")).toContainText("2 ready");
  await expect(page.getByTestId("batch-summary")).toContainText("1 invalid");
  await expect(page.getByTestId("batch-summary")).toContainText("0 truncated");
  await expect(page.getByTestId("batch-variant")).toHaveCount(3);
  await expect(page.getByTestId("batch-variant").nth(2)).toContainText("Unsupported ratio: 3:2");

  const arabicVariant = page.getByTestId("batch-variant").filter({ hasText: "Arabic Campaign" });
  await arabicVariant.getByRole("button", { name: "Load variant" }).click();
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Arabic Campaign");
  await expect(page.getByTestId("overlay-template-headline")).toContainText("مشروع مميز");

  const rows = Array.from({ length: 27 }, (_, index) => ({
    name: `Batch ${index + 1}`,
    headline: `Headline ${index + 1}`,
    cta: "Learn more",
    ratio: "9:16",
    language: "en",
  }));

  const response = await page.request.post("/api/batch/generate", {
    data: {
      rows,
      defaultTemplate: "product-spotlight",
    },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.acceptedRows).toBe(25);
  expect(payload.truncatedRows).toBe(2);
  expect(payload.variants).toHaveLength(25);
});

test("P7 approved publishing handoff scopes connector and persists calendar schedule", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("publishing-panel")).toBeVisible();
  await expect(page.getByTestId("publishing-approval-blocker")).toBeVisible();

  const blockedResponse = await page.request.post("/api/publishing/handoff", {
    data: {
      connectorId: "nemdar-sandbox-instagram",
      workspaceId: "workspace-a",
      accountId: "account-a",
      projectName: "Blocked Project",
      approved: false,
    },
  });
  expect(blockedResponse.status()).toBe(400);
  await expect.poll(async () => (await blockedResponse.json()).error).toContain(
    "approval"
  );

  await page.getByLabel("Approve project").click();
  await expect(page.getByTestId("publishing-approval-blocker")).toHaveCount(0);

  await page.getByLabel("Publishing connector").selectOption("nemdar-sandbox-instagram");
  await page.getByLabel("Publishing workspace").fill("uae-marketing");
  await page.getByLabel("Publishing account").fill("ig-main");
  await page.getByLabel("Publishing caption").fill("Approved campaign handoff");
  await page.getByLabel("Publishing schedule").fill("2030-01-02T10:30");

  await page.getByRole("button", { name: "Schedule handoff" }).click();

  const handoff = page.getByTestId("publishing-handoff");
  await expect(handoff).toHaveCount(1);
  await expect(handoff).toContainText("instagram");
  await expect(handoff).toContainText("scheduled");
  await expect(handoff).toContainText("uae-marketing");
  await expect(handoff).toContainText("ig-main");

  await expect(page.getByTestId("save-state")).toHaveText("Saved", { timeout: 5_000 });
  await page.reload();
  await page.getByRole("button", { name: "Load draft" }).click();

  await expect(page.getByTestId("publishing-handoff")).toHaveCount(1);
  await expect(page.getByTestId("publishing-handoff")).toContainText("instagram");
  await expect(page.getByTestId("publishing-handoff")).toContainText("scheduled");
});

test("P7 external API authenticates projects jobs and webhook state changes", async ({ request }) => {
  const headers = { "x-nemdar-api-key": "test-api-key" };

  const unauthorized = await request.get("/api/v1/projects");
  expect(unauthorized.status()).toBe(401);

  const webhookResponse = await request.post("/api/v1/webhooks", {
    headers,
    data: {
      url: "https://example.com/nemdar-hook",
      eventTypes: ["project.created", "job.created", "job.status_changed"],
    },
  });
  expect(webhookResponse.status()).toBe(201);

  const projectResponse = await request.post("/api/v1/projects", {
    headers,
    data: { name: "API Campaign", metadata: { source: "e2e" } },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();
  expect(project.name).toBe("API Campaign");

  const jobResponse = await request.post("/api/v1/jobs", {
    headers,
    data: {
      projectId: project.id,
      type: "render",
      payload: { ratio: "9:16" },
    },
  });
  expect(jobResponse.status()).toBe(201);
  const job = await jobResponse.json();
  expect(job.status).toBe("queued");

  const updateResponse = await request.patch(`/api/v1/jobs/${job.id}`, {
    headers,
    data: {
      status: "succeeded",
      output: { assetUrl: "/exports/api-campaign.mp4" },
    },
  });
  expect(updateResponse.status()).toBe(200);
  const updated = await updateResponse.json();
  expect(updated.status).toBe("succeeded");

  const readProject = await request.get(`/api/v1/projects/${project.id}`, { headers });
  expect(readProject.status()).toBe(200);

  const eventsResponse = await request.get("/api/v1/webhooks/events", { headers });
  expect(eventsResponse.status()).toBe(200);
  const events = (await eventsResponse.json()).events as Array<{
    eventType: string;
    payload: Record<string, unknown>;
  }>;
  expect(events.some((event) => event.eventType === "project.created")).toBeTruthy();
  expect(events.some((event) => event.eventType === "job.created")).toBeTruthy();
  expect(
    events.some(
      (event) =>
        event.eventType === "job.status_changed" &&
        event.payload.jobId === job.id
    )
  ).toBeTruthy();
});

test("P7 external API authenticates projects jobs and records webhook state changes", async ({ page }) => {
  const unauthorized = await page.request.get("/api/v1/projects");
  expect(unauthorized.status()).toBe(401);

  const headers = { "x-nemdar-api-key": "test-api-key" };

  const webhookResponse = await page.request.post("/api/v1/webhooks", {
    headers,
    data: {
      url: "http://127.0.0.1:9999/hook",
      eventTypes: ["job.status_changed"],
    },
  });
  expect(webhookResponse.status()).toBe(201);

  const projectResponse = await page.request.post("/api/v1/projects", {
    headers,
    data: {
      name: "API Campaign Project",
      metadata: { source: "e2e" },
    },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();

  const projectLookup = await page.request.get(`/api/v1/projects/${project.id}`, {
    headers,
  });
  expect(projectLookup.status()).toBe(200);

  const jobResponse = await page.request.post("/api/v1/jobs", {
    headers,
    data: {
      projectId: project.id,
      type: "batch",
      payload: { rowCount: 5 },
    },
  });
  expect(jobResponse.status()).toBe(201);
  const job = await jobResponse.json();

  await page.request.patch(`/api/v1/jobs/${job.id}`, {
    headers,
    data: { status: "running" },
  });
  const succeededResponse = await page.request.patch(`/api/v1/jobs/${job.id}`, {
    headers,
    data: {
      status: "succeeded",
      output: { variants: 5 },
    },
  });
  expect(succeededResponse.status()).toBe(200);

  const eventsResponse = await page.request.get("/api/v1/webhooks/events", {
    headers,
  });
  expect(eventsResponse.status()).toBe(200);
  const eventsPayload = await eventsResponse.json();
  const statusEvents = eventsPayload.events.filter(
    (event: { eventType: string }) => event.eventType === "job.status_changed"
  );
  expect(statusEvents.length).toBeGreaterThanOrEqual(2);
  expect(statusEvents[0].deliveryStatus).toBe("pending");
});

test("P7 render workers expose priority attempts retry and queue observability", async ({ request }) => {
  test.setTimeout(120_000);

  const manifest = {
    schemaVersion: 1,
    projectName: "P7 Worker Smoke",
    output: { width: 320, height: 320, fps: 12 },
    duration: 1,
    timeline: {
      schemaVersion: 1,
      playhead: 0,
      duration: 1,
      tracks: [{
        id: "visual-1",
        kind: "visual",
        clips: [{
          id: "clip-asset-1",
          assetId: "asset-1",
          assetName: "worker.png",
          kind: "image",
          timelineStart: 0,
          sourceStart: 0,
          duration: 1,
          sourceDuration: null,
          transitionOut: null,
          transform: { fit: "cover", cropX: 50, cropY: 50, zoom: 1, rotation: 0, speed: 1 },
          chroma: { enabled: false, keyColor: "#00FF00", tolerance: 0.22, spill: 0.35, backgroundColor: "#0B1020" },
          colorGrade: { exposure: 0, contrast: 1, saturation: 1, lut: "none" },
        }],
      }],
    },
    media: [{ id: "asset-1", field: "media-asset-1", kind: "image", name: "worker.png" }],
    overlays: [],
    audioTrack: null,
  };

  const successResponse = await request.post("/api/render/jobs", {
    multipart: {
      manifest: JSON.stringify(manifest),
      priority: "high",
      maxAttempts: "2",
      "media-asset-1": {
        name: "worker.png",
        mimeType: "image/png",
        buffer: PNG_1X1,
      },
    },
  });
  expect(successResponse.status()).toBe(202);
  const success = await successResponse.json();
  expect(success.priority).toBe("high");
  expect(success.maxAttempts).toBe(2);

  let successfulJob: any = null;
  await expect.poll(async () => {
    const response = await request.get(`/api/render/jobs/${success.jobId}`);
    successfulJob = await response.json();
    return successfulJob.status;
  }, { timeout: 60_000 }).toBe("succeeded");

  expect(successfulJob.attempts).toBe(1);
  expect(successfulJob.workerId).toMatch(/^worker-/);
  expect(successfulJob.startedAt).toBeGreaterThan(0);
  expect(successfulJob.completedAt).toBeGreaterThanOrEqual(successfulJob.startedAt);

  const queueResponse = await request.get("/api/render/jobs");
  const queuePayload = await queueResponse.json();
  expect(queuePayload.queue.maxConcurrency).toBeGreaterThanOrEqual(1);
  expect(queuePayload.jobs.some((job: any) => job.jobId === success.jobId)).toBeTruthy();

  const badResponse = await request.post("/api/render/jobs", {
    multipart: {
      manifest: JSON.stringify(manifest),
      priority: "low",
      maxAttempts: "1",
      "media-asset-1": {
        name: "broken.png",
        mimeType: "image/png",
        buffer: Buffer.from("not-a-real-png"),
      },
    },
  });
  expect(badResponse.status()).toBe(202);
  const bad = await badResponse.json();

  let failedJob: any = null;
  await expect.poll(async () => {
    const response = await request.get(`/api/render/jobs/${bad.jobId}`);
    failedJob = await response.json();
    return failedJob.status;
  }, { timeout: 45_000 }).toBe("failed");
  expect(failedJob.attempts).toBe(1);

  const retryResponse = await request.post(`/api/render/jobs/${bad.jobId}`);
  expect(retryResponse.status()).toBe(200);
  const retried = await retryResponse.json();
  expect(retried.status).toBe("queued");
  expect(retried.maxAttempts).toBe(2);

  await expect.poll(async () => {
    const response = await request.get(`/api/render/jobs/${bad.jobId}`);
    return (await response.json()).status;
  }, { timeout: 45_000 }).toBe("failed");

  const finalFailed = await (await request.get(`/api/render/jobs/${bad.jobId}`)).json();
  expect(finalFailed.attempts).toBe(2);
});

test("P7 control plane routes providers enforces budgets imports analytics learns and audits roles", async ({ request }) => {
  const routed = await request.post("/api/ops/control", { data: {
    action:"route", actor:"qa",
    policy:"cost",
    profiles:[
      {id:"quality-provider",model:"q1",quality:95,latencyMs:9000,costUsd:0.12,configured:true},
      {id:"fast-provider",model:"f1",quality:80,latencyMs:1500,costUsd:0.03,configured:true},
      {id:"disabled",model:"x1",quality:100,latencyMs:1,costUsd:0.001,configured:false},
    ],
  }});
  expect(routed.ok()).toBeTruthy();
  const routing = await routed.json();
  expect(routing.provider).toBe("fast-provider");
  expect(routing.reason).toContain("cost policy");

  const blocked = await request.post("/api/ops/control", { data: {
    action:"budget", actor:"qa",
    policy:{workspaceLimitUsd:10,projectLimitUsd:5,warningPercent:80,mode:"block"},
    usage:{workspaceSpentUsd:4,projectSpentUsd:4.8,estimatedNextUsd:0.5},
  }});
  expect(blocked.status()).toBe(402);
  expect((await blocked.json()).allowed).toBe(false);

  const imported = await request.post("/api/ops/control", { data: {
    action:"import_metrics", actor:"qa",
    rows:[
      {variantId:"variant-a",impressions:1000,clicks:100,leads:10,spendUsd:50,conversions:8},
      {variantId:"variant-b",impressions:1000,clicks:120,leads:12,spendUsd:60,conversions:18},
    ],
  }});
  expect(imported.ok()).toBeTruthy();
  const analytics = await imported.json();
  expect(analytics.rows[0].ctr).toBeCloseTo(0.1);
  expect(analytics.learning.winnerVariantId).toBe("variant-b");
  expect(analytics.learning.autoApplied).toBe(false);
  expect(analytics.learning.insights.join(" ")).toContain("not a guaranteed future outcome");

  const denied = await request.post("/api/ops/control", { data: {
    action:"authorize",actor:"viewer-1",role:"viewer",permission:"publish",
  }});
  expect(denied.status()).toBe(403);
  const allowed = await request.post("/api/ops/control", { data: {
    action:"authorize",actor:"admin-1",role:"admin",permission:"publish",
  }});
  expect(allowed.ok()).toBeTruthy();

  const snapshot = await request.get("/api/ops/control");
  expect(snapshot.ok()).toBeTruthy();
  const control = await snapshot.json();
  expect(control.metrics).toHaveLength(2);
  expect(control.learning.winnerVariantId).toBe("variant-b");
  expect(control.audit.some((entry:any)=>entry.action==="provider_route")).toBeTruthy();
  expect(control.audit.some((entry:any)=>entry.action==="budget_check")).toBeTruthy();
  expect(control.audit.some((entry:any)=>entry.action==="analytics_import")).toBeTruthy();
  expect(control.audit.filter((entry:any)=>entry.action==="authorization").length).toBeGreaterThanOrEqual(2);
});

test("P7 generation endpoint applies explicit provider routing policy and returns decision provenance", async ({ request }) => {
  const qualityResponse = await request.post("/api/generate/image", { data: {
    prompt:"premium product hero", aspectRatio:"1:1", routingPolicy:"quality",
  }});
  expect(qualityResponse.ok()).toBeTruthy();
  const quality = await qualityResponse.json();
  expect(quality.artifact.provider).toBe("mock-quality");
  expect(quality.routingDecision.provider).toBe("mock-quality");
  expect(quality.routingDecision.reason).toContain("quality policy");

  const costResponse = await request.post("/api/generate/image", { data: {
    prompt:"fast social variant", aspectRatio:"1:1", routingPolicy:"cost",
  }});
  expect(costResponse.ok()).toBeTruthy();
  const cost = await costResponse.json();
  expect(cost.artifact.provider).toBe("mock-fast");
  expect(cost.routingDecision.provider).toBe("mock-fast");
  expect(cost.routingDecision.reason).toContain("cost policy");
});

test("P7 generation applies provider policy budget gates permissions and durable audit", async ({ request }) => {
  const adminBudget = await request.post("/api/ops/control", {
    data: {
      action: "set_budget",
      actor: "admin-e2e",
      role: "admin",
      policy: {
        workspaceLimitUsd: 0.02,
        projectLimitUsd: 0.02,
        warningPercent: 50,
        mode: "block",
      },
    },
  });
  expect(adminBudget.ok()).toBeTruthy();

  const reset = await request.post("/api/ops/control", {
    data: { action: "reset_budget_usage", actor: "admin-e2e", role: "admin" },
  });
  expect(reset.ok()).toBeTruthy();

  const viewerDenied = await request.post("/api/generate/image", {
    headers: { "x-nemdar-role": "viewer", "x-nemdar-actor": "viewer-e2e" },
    data: {
      prompt: "viewer should not generate",
      routingPolicy: "cost",
      projectId: "budget-project",
    },
  });
  expect(viewerDenied.status()).toBe(403);

  for (let index = 0; index < 2; index += 1) {
    const generated = await request.post("/api/generate/image", {
      headers: { "x-nemdar-role": "creator", "x-nemdar-actor": "creator-e2e" },
      data: {
        prompt: `budgeted creative ${index + 1}`,
        routingPolicy: "cost",
        projectId: "budget-project",
      },
    });
    expect(generated.ok()).toBeTruthy();
    const payload = await generated.json();
    expect(payload.routingDecision.provider).toBe("mock-fast");
    expect(payload.routingDecision.policy).toBe("cost");
    expect(payload.routingDecision.reason).toContain("cost policy");
    expect(payload.estimatedCost).toBeCloseTo(0.01);
  }

  const blocked = await request.post("/api/generate/image", {
    headers: { "x-nemdar-role": "creator", "x-nemdar-actor": "creator-e2e" },
    data: {
      prompt: "this should exceed the project budget",
      routingPolicy: "cost",
      projectId: "budget-project",
    },
  });
  expect(blocked.status()).toBe(402);
  const blockedPayload = await blocked.json();
  expect(blockedPayload.budget.allowed).toBe(false);

  const publishDenied = await request.post("/api/publishing/handoff", {
    headers: { "x-nemdar-role": "viewer", "x-nemdar-actor": "viewer-e2e" },
    data: {},
  });
  expect(publishDenied.status()).toBe(403);

  const snapshot = await request.get("/api/ops/control");
  const ops = await snapshot.json();
  expect(ops.budget.workspaceSpentUsd).toBeCloseTo(0.02);
  expect(ops.budget.projectSpentUsd["budget-project"]).toBeCloseTo(0.02);
  expect(ops.audit.some((entry: any) => entry.action === "generation_provider_route")).toBeTruthy();
  expect(ops.audit.some((entry: any) => entry.action === "generation_budget_check")).toBeTruthy();
  expect(ops.audit.some((entry: any) => entry.action === "generation_cost_recorded")).toBeTruthy();
  expect(
    ops.audit.some(
      (entry: any) =>
        entry.action === "authorization" &&
        entry.actor === "viewer-e2e" &&
        entry.allowed === false
    )
  ).toBeTruthy();

  await request.post("/api/ops/control", {
    data: {
      action: "set_budget",
      actor: "admin-e2e",
      role: "admin",
      policy: {
        workspaceLimitUsd: 1000,
        projectLimitUsd: 250,
        warningPercent: 80,
        mode: "warn",
      },
    },
  });
  await request.post("/api/ops/control", {
    data: { action: "reset_budget_usage", actor: "admin-e2e", role: "admin" },
  });
});
