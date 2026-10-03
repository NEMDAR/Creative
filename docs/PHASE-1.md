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
The scaffold now includes media upload/preview, text/logo overlays, dragging, full basic text controls, ratio presets, RTL support, trim-aware preview, mute/volume, undo/redo, local project/overlay draft persistence and current-frame PNG export. Source media still needs reselection after browser restart. Timed video export remains a tracked P1 card and is intentionally not marked complete.
