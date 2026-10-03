# NEMDAR Creative Studio

AI-assisted marketing media editor and future campaign production studio.

- Canonical subdomain: `creative.nemdar.tech`
- Canonical GitHub repository: `NEMDAR/Creative`
- Notion roadmap: https://app.notion.com/p/3ee10ca04bc9815fb876e4b7c27d8ad6
- Current execution gate: **P2 — Timeline Editor**

## Why the roadmap starts simple
The first release is deliberately an editor, not an AI-generation suite. It must let a marketer upload media, place Arabic/English text and a logo, choose a social ratio, trim and export. Advanced timeline, captions, image/video generation and campaign automation arrive only after lower gates work end-to-end.

## Bootstrap status
Implemented in this starter:
- Next.js + TypeScript shell.
- Phase 1 editor UI.
- Local video/image preview.
- Text and logo overlays with drag placement.
- Arabic/RTL support.
- Social ratio presets.
- Basic trim and volume controls in project state/preview.
- Durable local project + source-media persistence via IndexedDB.
- Undo/redo and trim-aware video preview.
- PNG export for image creatives.
- Timed local WebM video export with text/logo overlays and progress/error state.
- Provider and render contracts for later phases.
- Full P0–P7 roadmap and card index.

Not yet complete:
- Production server-side MP4 rendering/transcoding.
- Multi-clip timeline.
- AI providers.
- Production deployment.

## Run
```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Docs
- `docs/PRODUCT.md`
- `docs/ROADMAP.md`
- `docs/EXECUTION-CARDS.md`
- `docs/ARCHITECTURE.md`
- `docs/PHASE-1.md`
- `docs/ACCEPTANCE.md`

## Execution source of truth
Engineering evidence reconciles to GitHub PRs/commits. Notion is the portfolio and execution-board mirror.
