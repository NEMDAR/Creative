# NEMDAR Creative Studio — Roadmap

Canonical subdomain: `creative.nemdar.tech`  
Canonical repository target: `NEMDAR/Creative`

## Delivery rule
Each phase must produce a useful release on its own. Advanced generation must never block the basic editor. The editor composition is provider-agnostic and deterministic; AI creates assets or proposes validated edit actions.

## P0 — Foundation
Goal: establish the codebase, schemas, rendering contracts, deployment path and execution controls.

Exit gate: repo exists, app builds, editor shell opens, composition schema is versioned, and `creative.nemdar.tech` has a defined deployment route.

## P1 — Simple Editor
Goal: the first actually useful editor.

Capabilities: upload one video/image; preview; Arabic/English text overlays; typography; drag/position; logo/image overlay; ratios 9:16, 1:1, 4:5, 16:9; trim; mute/volume; undo/redo; local project persistence; render/export.

Exit gate: fresh session → upload clip → add Arabic/English text → add logo → choose 9:16 → trim → export usable branded video.

## P2 — Timeline Editor
Goal: practical daily editing.

Capabilities: multi-track timeline; multi-clip visual track; split/trim/reorder/duplicate; text tracks; music/audio; transitions; crop/fit/fill/rotate/speed; snapping/zoom/keyboard controls; autosave/version snapshots; render queue; MP4 output.

Exit gate: multi-clip social video with music, transitions and overlays can be edited, saved and exported.

## P3 — Smart Editor
Goal: automate repetitive editing.

Capabilities: Arabic/English captions; caption presets; transcript editing; silence removal; scene detection; smart resize/reframe; music ducking; Brand Kit; reusable templates; natural-language command bar that compiles into deterministic editor actions.

Exit gate: captions + reframe + brand template + at least one AI edit command work end-to-end.

## P4 — AI Creation
Goal: generate missing creative assets without leaving the product.

Capabilities: Provider Router; image generation/editing; background removal/replacement; outpaint; text-to-video; image-to-video; AI voiceover; storyboard; B-roll suggestions; generation history/cost ledger; provenance metadata.

Exit gate: generate an image, a video shot and a voiceover, then use all three in an editable project.

## P5 — Marketing Studio
Goal: move from editing one asset to producing a campaign.

Capabilities: Marketing Brief; concepts/hooks/CTAs; scripts and scene plans; brief-to-edit orchestration; master creative → platform variants; Arabic/English variants; batch experiments; Brand Guardian; Campaign Pack export.

Exit gate: one brief produces an editable, brand-checked multi-platform campaign pack.

## P6 — Pro Studio
Goal: professional finishing and review.

Capabilities: keyframes/easing; masks/compositing; motion graphics; chroma/background tools; color/LUT controls; advanced audio; proxies; comments/versions; approvals; reusable motion components.

Exit gate: a team can produce, review and approve a polished creative without leaving the app.

## P7 — Scale & Automation
Goal: repeatable production at campaign/organization scale.

Capabilities: batch creation from structured rows; publishing connectors; calendar handoff; external API/webhooks; scalable render workers; provider routing by quality/latency/cost; budgets; analytics import; A/B learning loop; RBAC and audit log.

Exit gate: teams can batch-create, render, govern, publish and measure campaigns with cost and audit controls.
