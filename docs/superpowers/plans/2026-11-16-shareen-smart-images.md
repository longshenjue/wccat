# ShareEn Smart Images Implementation Plan

> Use superpowers:subagent-driven-development. Existing managed worktree. No individual commits or push: user has only authorized implementation. Do not delete the managed workspace or discard prior uncommitted header/contain changes.

**Goal:** DeepSeek visual framing and exact-size cached imagery with a safe split-layout alternative.
**Architecture:** Pure image contract/geometry plus bounded server processor; browser-only reference rendering; private encoded assets travel inside the existing report payload and archive. Existing source/revision guards remain authoritative.
**Tech Stack:** Next.js/React/TypeScript, better-sqlite3, sharp0.34.5, DeepSeek Chat Completions vision, existing PNG/ZIP export.
**Spec:** docs/superpowers/specs/2026-11-16-shareen-smart-images-design.md

## Global Constraints
- Card1200×1500, wide1072×360, split400×480. Compact cannot change image ratio. Keep three-line Logo/title/date and no extra ranking-label border.
- Only server generation invokes image processing; reads/downloads never invoke AI. At most one vision call per visible image, sequential processing≤3.
- Source download≤6MiB, decode≤12MP,10-second fetch bound; vision30 seconds; outputWebP≤512KiB. Validate every redirect and source allowlist.
- Images are original-pixel crop/scale, no generative retouching. Invalid/low-confidence/uncontainable protection regions→split, never unsafe crop.
- Private image bytes persist inside daily payload for monthly archives but are stripped from admin browser JSON and rejected as client authority. Auth-only immutable image retrieval by report/topic/id.
- No real keys/AI/production mutations in tests. No commit/push without a new user request.

## Review Focus
- Multiple protected people or text at an edge cannot be cut by a mathematically valid crop; oriented pixel coordinates must match the vision input.
- Hidden, URL-edited, stale, malformed and failure states cannot reuse another topic/source's processed image or strand the layout.
- Cache hits and individual reprocessing cannot silently regenerate text or perform unbounded vision retries; downloads stay read-only.
- Private bytes must not leak into public RSC/JSON, exceed edit body limits, or be overwritten by client-posted asset payloads.
- Archive roundtrip and maintenance/concurrent edits retain correctly linked images while failed processing preserves usable existing data.

### Task 1: Bounded vision processor and image contract
**Own files:** src/lib/shareen-image-types.ts, shareen-image-geometry.ts, shareen-image-processor.ts, tests/shareen-image-processor.test.ts. Do not edit existing files.
**Interfaces:**
- shareen-image-types.ts exports WIDE_IMAGE={width:1072,height:360}, SPLIT_IMAGE={width:400,height:480}, IMAGE_POLICY_VERSION string, ShareEnImageAsset with fields in spec; dataBase64?:string (private). Export browser-safe validateImageAsset(value:unknown):ShareEnImageAsset|undefined; optional invalid cache degrades, not whole news rejection. Validate bounds, enums, hashes/URLs/dimensions and encoded-size cap; output strips unknown keys.
- processShareEnImage(input:{url:string;sourceId?:string;title:string;previous?:ShareEnImageAsset;force?:boolean},log?:(level:'info'|'warn',message:string)=>void):Promise<ShareEnImageAsset|undefined>. Use same DEEPSEEK_API_KEY / DEEPSEEK_MODEL(default deepseek-flash). Download/reorient source; send normalized small image and text as OpenAI-compatible content blocks; model JSON protectedRegions[{x,y,width,height}],focalPoint{x,y},mode,confidence,reason. Geometry validates and adds protection margin. Sharp crop only if all regions fit; else split contain. Output correct dimensions and SHA256 bytes ID, cache keys/provenance. Missing key/vision failure returns safe split asset, source failure returns previous only if same source/valid else undefined. Never log image/base64/API-key/raw provider body. Source refs use existing allowlist.
- Pure geometry exports selectImagePlan(width:number,height:number,value:unknown):{layout:'wide'|'split';crop?:{left,top,width,height};protectedRegions:Array<{x,y,width,height}>;confidence:number;reason:string}. Whole source oriented dimensions; finite normalized rectangles; all protected regions + 4% safety contained, confidence≥0.65; upscaling>2x prefers split. No protectable source→split.
**Steps:**
- [x] Add failing tests for safe non-central subject crop, multiple far-apart regions→split, malformed/low-confidence→split, exact output dimensions/pixels/EXIF, bounded source/redirect limits, one vision call and cache bypass/force; run RED.
- [x] Implement contract, geometry and server processor. Run focused GREEN and TypeScript self-review. Report details to coordinator, no commit.

### Task 2: Cached-image rendering and admin controls
**Own files:** src/lib/shareen-types.ts, src/lib/shareen-media.ts, src/lib/shareen-validation.ts, src/components/shareen-poster.tsx, shareen.css, admin-sharing-panel.tsx, admin-data-panel.tsx; tests/shareen-media.test.ts and new focused client contract tests as needed. Preserve prior uncommitted header fixes.
**Interfaces:**
- Add highlight.imageAsset?:ShareEnImageAsset and SharingFormat includes 'images'. Shared validator retains valid metadata/private bytes internally, gracefully omits invalid asset. It must never trust arbitrary asset.src URLs.
- Export shareEnOriginalImage(report,copy,index):{url,sourceId,alt}|undefined from media helper to resolve original allowed cover/override (ignore imageAsset; hide returnsundefined). shareEnImage returns {url(original),src,alt,layout:'wide'|'split',processed:boolean}; valid asset with matching original source URL uses src='/api/admin/share/image?date=...&topicId=...&assetId=...' (encode all). It returns no binary. Stale source refs fall back to original safe display.
- AdminSharingPanel.onGenerate(format,force,topicId?) signature; parent posts {action:'generate',date,format,force,topicId} to existing /api/admin/share, serial task/logs same as sharing.
- Add补齐配图(images,false), each focus card重新处理配图(images,true,topicId); preserve unsaved edits and old revision conflict behavior, disable processing while dirty and guide save first. Show ready/layout/fallback reason state. Other text/long formats unaffected.
- Render exact wide1072×360; split grid400px image + remaining event text, then full-width battle/why. On missing/hidden/native error drop entire picture column and restore full text width. Compact retains exact image dimensions/ratio. Raw old covers remain full-contain until processing. Cached images use existing decode/inline export flow.
**Steps:**
- [x] Tests RED for processed-src selection, no byte serialization in helper, source mismatch, hiding and split selection. Implement and run GREEN.
- [x] Render/UI controls, update guides to current sizes. Self-review/TypeScript and report. Do not change API/server orchestration files.

### Task 3: Persistence, auth endpoints, serial jobs and automatic orchestration
**Own files:** src/lib/shareen-images.ts(new), src/lib/shareen-image-state.ts(new), src/lib/sharing.ts, src/lib/daily-report.ts, src/lib/admin-jobs.ts, src/app/api/admin/share/route.ts, src/app/api/admin/share/image/route.ts(new), admin browse serialization if needed; tests/shareen-images.test.ts, tests/admin-share-api.test.ts and new image API/roundtrip tests.
**Interfaces:**
- prepareShareEnImages(report,copy,options?:{force?:boolean;topicId?:string;previous?:ShareEnCopy;log?:GenerationLog}):Promise<ShareEnCopy>. Resolve only selected visible≤3 sources, reuse own same-source cached assets from previous if valid, process sequentially, retain source-compatible cache on failure; no text generation. Uses processor from Task1. No persistence inside pure orchestration.
- sharingReportForClient(report:WccatDailyReport):WccatDailyReport removes dataBase64 from every imageAsset; use admin GET/save responses and relevant admin browse reads. Keep report source fingerprint unchanged (shareEn excluded).
- saveShareEnEdits must rehydrate only baseline server-owned assets matching topic and unchanged URL. Client cannot create/rewrite image bytes or point to another asset; URL edits drop stale refs. Existing expectedRevision and atomic source/target guards remain.
- generateSharing accepts images,force,topicId?; 'images' does not call text generator, 'all'/'shareen' prepare image caches even if existing text; 'english' skips. Persist sharing field with guards. Daily generation auto processes after valid ShareEn. Cached source image copies may be reused during text force; only images+force forces vision.
- POST generate format images valid optional topicId must belong to selected report highlights; require same-origin/auth and queue existing kind sharing. JobInput.shareFormat uses SharingFormat and topicId?; persisted logs/readiness accurate.
- GET /api/admin/share/image?date=&topicId=&assetId= requires admin. Lookup current report's matching validated asset (archive supported); decode bounded private WebP bytes, verify SHA256 and exact dimensions metadata, send image/webp and private cache headers. Invalid/unregistered asset404. Never fetch source or invoke AI.
**Steps:**
- [x] RED tests for default processing, images-only/no-text, per-card/caching, failed-force preservation, URL edits, forged/omitted private fields, source/revision races, auth/read-only image route, archive export/register with private bytes; run RED then implement GREEN.
- [x] Update docs/admin-sharing.md README as appropriate, full suite alone then lint/build and actual mocked-browser QA, no production/paid calls. Fresh broad review; fix important findings and rerun checks.
