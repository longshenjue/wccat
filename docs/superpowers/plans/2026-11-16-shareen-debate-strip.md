# ShareEn Debate Strip Implementation Plan

> Use superpowers:executing-plans inline. User is steering the ongoing implementation; do not restart approval flow or discard previous uncommitted changes. Fresh reviewer at end, no automatic commit/push.

**Goal:** Compact emotional opposition on focus cards with a collapsible optional image.
**Architecture:** Browser-safe battle normalizer fixes source scores and short text; optional model fields feed the existing bounded repair pipeline. Preview/export share identical strip and image hiding. No DB migration.
**Tech Stack:** Next.js, React, TypeScript, DeepSeek, existing PNG/ZIP exporter.
**Spec:** docs/superpowers/specs/2026-11-16-shareen-debate-strip-design.md

## Review Focus
- A stance or source score never leaks from the original TOP1 to another selected topic.
- New estimates are marked as such; unavailable data does not become a fake50/50.
- Optional bad/missing battle data cannot invalidate good news content or add unbounded AI calls.
- No-image, hidden-image, failed-image and long-label variants fit 1200×1500 without clipped body text.
- Old caches, admin optimistic revisions, source fingerprint and all prior uncommitted fixes continue working.

## Tasks
- [x] 1. RED→GREEN tests for source score reuse, estimates, compact English labels, missing battle compatibility, invalid optional repair and hidden images. Add shareen-battle.ts; update types, validation, draft generation and media helper.
- [x] 2. Add shared red/blue strip and no-image collapse; admin short stance editing and hide-image control; source/alt metadata; update docs.
- [x] 3. Full tests, lint/build, temporary DB/mocked AI browser PNG/ZIP, no-image and mobile checks; fresh review and fixes. Preserve uncommitted state.

## Rulings
- Continue overseas-relevance selection; caption still follows original TOP3.
- Reuse existing source-analysis scores; absent scores may be generated as explicitly labeled AI estimate in the same ShareEn call. No additional full-analysis call.
- Old stored cards without English stances remain usable; reuse matching original-TOP1 English only, otherwise offer regeneration in admin.

## Review fixes and verification ledger
- Source-language fallback now checks both original TOP1 ID and the English cache TOP1 ID; stale/reordered English cannot leak another topic’s stance. Regression observed RED→GREEN.
- Existing scores use neutral Source analysis wording, since local-rules is also valid source analysis.
- Malformed optional battle is dropped with a diagnostic instead of disabling an otherwise valid news cache/export. Regression RED→GREEN.
- Alt text preserves user descriptions and replaces only the reserved generated debate suffix from current attitudes, preventing stale exported opinions after edits. Regression RED→GREEN.
- Prompt permits omission when material does not support opposing attitudes or relative energy; no invented default50/50.
- Long unbroken label wrapping treated as important for PNG readability and fixed; actual30-character wide-label browser check passed.
- Browser mock QA: three strips, original-score/estimate provenance, failed image collapse, manual hide, compact editing without AI, single PNG/ZIP, widths320/390/768/1440, no runtime errors. Exported PNG inspected.

## Completion evidence
- Fresh independent review completed; all functional findings and the label wrapping edge case addressed.
- `npm test`:165/165 passed; full suite ran without concurrent build.
- `npm run lint`:0 errors, one existing img-element warning in topic-workbench.tsx.
- `npm run build`:passed including TypeScript.
- Browser verification repeated after fixes; exported ZIP CRC, 1200×1500 PNG dimensions, current edited attitude in alt text, hidden-image metadata and provenance confirmed.
- Temporary mock service and its temporary DB stopped/removed. No production writes or real AI calls. No commit or push performed.

## Release authorization
After implementation and review, the user explicitly requested `commit and push`. Release these combined changes to main; keep the managed worktree.
