# Architecture

## Core principle
The editor does not know which AI provider created an asset. Generated and uploaded media enter the same asset model. AI editing produces validated editor actions; the saved composition remains deterministic and renderable without re-running a model.

## Layers
1. **Web editor** — project UI, stage, timeline, inspector, command bar.
2. **Composition schema** — tracks, clips, overlays, transforms, timing, brand metadata.
3. **Asset layer** — local/bootstrap URLs now; object storage adapter later.
4. **Render layer** — stable `RenderJobRequest` → browser prototype now; Remotion/FFmpeg worker later.
5. **Provider Router** — text/image/video/voice adapters; async jobs; provider metadata and cost ledger.
6. **Project persistence** — local draft in bootstrap; Supabase-compatible persistence later.
7. **Automation** — campaign orchestration, batch jobs, publishing and analytics only after lower gates pass.

## Security guardrails
- Paid provider secrets remain server-side.
- Generated-asset provenance is stored with the asset.
- Marketing claims are never invented by automation; brief facts are source inputs.
- Publish actions require explicit workspace/account authorization.
