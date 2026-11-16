# ShareEn Image Cards Implementation Plan

> Use superpowers:executing-plans inline; fresh reviewer after implementation. Existing managed worktree. User said start editing; do not pause for more approval, do not commit/push without a new instruction.

**Goal:** Two-line fixed overview masthead, readable image-led focus cards, and bounded field-level repair instead of whole-package regeneration.
**Architecture:** Keep saved v1 compatibility. Separate pure normalization/repair from server AI transport. Browser-safe media helpers and validation serve preview and PNG export. Existing source/revision guards unchanged.
**Tech Stack:** Next.js, React, TypeScript, SQLite, DeepSeek, html-to-image.
**Spec:** docs/superpowers/specs/2026-11-16-shareen-image-cards-design.md

## Review Focus
- Partial/reordered/unknown/duplicate topic data never silently changes source identity; title fallback must match source ID.
- A failed top3 summary cannot discard valid card content or trigger a full second draft.
- Existing cache and custom image edits survive validation/save/archive, without making remote arbitrary URLs fetchable.
- Image failure/slow decoding does not hang export or produce an unexplained missing picture.
- Overview masthead stays one line plus a date and all 10 real-world long titles fit; body overflow remains detected.

## Tasks
- [x] 1. Tests RED→GREEN: keyed/legacy model normalization, ID ordering, valid English fallbacks, TOP3 reuse, field-only repair, bounded failure. Modify shareen.ts; create shareen-draft.ts; adapt validation/types without invalidating old caches.
- [x] 2. Tests RED→GREEN: approved media resolution and optional image overrides. Add shareen-media.ts; validate optional imageUrl. Replace poster header/overview and compact image-led focus card, remove overview/context editors, add image URL editor; wait for decoded images before export.
- [x] 3. Update admin generation wording/docs. Full npm test alone, lint/build, temporary DB + mock AI browser QA for two-line masthead, long Top10, image success/failure, PNG/ZIP and mobile admin.
- [x] 4. Fresh code review, fix important findings and rerun checks. Leave changes reviewable without automatic commit or push.

## Decisions
- Reuse approved overseas selection rather than switching to original TOP3; only caption uses original TOP3.
- Existing v1 headline/summary/context remain readable data, but new layout does not display them. New drafts supply fixed headline, empty summary/context; no database migration needed.
- No additional image storage: use existing source covers and proxy; custom URL edits are admin-only and use the same host allowlist.

## Review fixes
- Unknown extra IDs are discarded from source-owned slots; duplicated IDs quarantine only ambiguous fields. Duplicate JSON keys are detected lexically and removed rather than silently accepting the last value.
- Valid selected post candidates survive invalid siblings; defaults fill only missing candidates.
- Provider body/network failures do not trigger another AI call. Optional shortening failure keeps valid complete copy.
- Decoded proxy image pixels are embedded before PNG export; query strings remain part of resource cache keys. Distinct-image ZIP regression was observed RED (three red photos), then GREEN (red/green/blue photos); failure of secondary fetches no longer aborts export.
- Replaced border-image gradient separators after actual PNG inspection showed a renderer-specific full-area fill. Exported header/footer backgrounds are white again.

## Final verification
- `npm test`: 158/158 passed, zero failures; final full suite ran without concurrent build.
- `npm run lint`: zero errors, one pre-existing img-element warning in topic-workbench.tsx.
- `npm run build`: passed, including TypeScript checks.
- Browser plugin unavailable; used existing Playwright installation with temporary SQLite and mocked AI. Verified exactly two overview header rows, one-line masthead without horizontal overflow, long Top10, old summary hidden, image success/failure, admin replacement URL save without AI, PNG/ZIP and 320/390/768/1440 widths. No runtime errors.
- Actual ZIP CRC and all 1200×1500 PNG dimensions checked. Three distinct image fixtures remain distinct in exported pixels. Simulated failures of any non-image repeat request still exported successfully. Source metadata includes image URLs.
- Independent fresh code review completed; all actionable findings fixed with regression evidence. Temporary server stopped and its temporary database removed. No real AI calls or production DB changes. Changes intentionally uncommitted/unpushed under the user's standing instruction.

## Release authorization
After implementation and review, the user explicitly requested `commit and push`. Release these combined changes to main; keep the managed worktree.
