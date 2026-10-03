# Phase 1 — Simple Editor Specification

## Primary user story
As a marketer, I can upload a source clip, add Arabic or English text and a logo, choose a social ratio, trim the clip, preview it, save my project and export a branded video without needing professional editing software.

## Phase 1 scope
- One primary source video or image.
- Multiple text overlays.
- Logo/image overlay.
- Drag positioning.
- Font size, weight, alignment, color, opacity and RTL/LTR.
- 9:16 / 1:1 / 4:5 / 16:9.
- Video trim in/out.
- Mute/volume.
- Undo/redo.
- Save/reopen project.
- Full timed video export.
- Export progress and errors.
- Chromium smoke path.

## Deliberately not in P1
No multi-clip timeline, captions, AI generation, transitions, keyframes, social publishing, collaboration or analytics. Those are later gates.

## Current bootstrap implementation
The Phase 1 implementation now includes media upload/preview, text/logo overlays, dragging, full basic text controls, ratio presets, RTL support, trim-aware preview, mute/volume, undo/redo, IndexedDB persistence for the project and source media, PNG export for image creatives, and timed local WebM video export with overlays, trim, progress and error state. A production server-side MP4 render/transcode path is intentionally deferred to production hardening; it does not block the local Chromium P1 gate.
