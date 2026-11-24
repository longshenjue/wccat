# Sampled Comment Quotes Implementation Plan

> Execute inline, using test-driven-development and one final independent review. User delegated design decisions; no additional design approval is needed.

**Goal:** Show bounded real comment examples beneath red/blue analysis across hourly, daily and sharing views.

**Architecture:** ProviderState-backed collection and classification; optional source-owned examples on TopicAnalysis; shared browser-safe rendering and export provenance. No public collection route.

**Tech Stack:** Next.js / React / TypeScript, SQLite, node:test.

**Spec:** docs/superpowers/specs/2026-11-24-comment-quotes-design.md

## Global constraints

Only observed comment IDs/text/likes; max 20 per thread, 2 threads/topic, 100 requests/day; no pagination; 4-hour caches; failure suppression; locked stance labels; no invented opposite side; no fetching on render/export.

## Review focus

- Search URLs and hostile lookalike hosts must never become comment requests.
- Classifier must not inject a quote, link, likes, author or unrelated ID.
- Old reports and unavailable platforms must render unchanged with no empty placeholders.
- Cached samples must not lose observation dates or survive as current after a failed refresh.
- ShareEn quote content must remain readable and attributed in exported images, ALT and sources.

## Tasks

1. Bounded collector: add comments types/adapters/client. First write failing tests for supported URLs, root-only caps, byte/time budgets, 4h caching, negative cooldown, daily caps and maintenance fencing. Implement and run those tests.
2. Selection/runtime: add exact-ID validation and highest-like selection; classification cache and optional translations; enrich precomputed analyses and daily report top 3. First test forged IDs, conflicting classifications, single-side evidence, translation handling and no-key behavior. Preserve optional JSON compatibility.
3. Rendering/export: shared red/blue cat component beneath analysis, on hourly/daily/long posters/ShareEn. Add excerpts and accessible source labels; measure taller quote-bearing ShareEn canvases and include full source quotes in ALT/sources. First test server-rendered visibility/escaping/attribution and export identity/contents.
4. Verify integration: run focused/full tests, tsc, eslint and build. Render seeded sample and empty cases at desktop/mobile/export dimensions. Review and resolve meaningful findings; document provider limitations and operating configuration.

## Progress

- Initial project clean on main. Created codex/sampled-comment-quotes for reviewable changes.
- Design: reuse existing provider and evidence infrastructure; no extra dependency or database schema required.
- Task 1: complete. Bounded first-page adapters, shared 100-attempt daily budget (including ID lookups), cache/cooldown, evidence capture, byte/time bounds and generation fencing.
- Task 2: complete. Exact-ID classification, highest observed likes per side, optional labeled English translation of literal source excerpts, classifier caching and hourly/daily integration. A compare-before-write guard preserves newer concurrent analyses.
- Task 3: complete. Shared cat-marker quotes on hourly/daily/long posters/ShareEn, hidden empty cases, source-owned metadata, full originals in ZIP provenance and translated excerpts in ALT. One/two-comment ShareEn cards use 1900/2200px canvases; normal cards remain 1500px.
- Review: independent reviewer found cooldown cleanup and Bilibili plain-text stripping defects. Both were reproduced and fixed with regressions. HTML-bearing providers also retain visible emoji labels; BV-form b23.tv links are recognized without following opaque redirects.
- Ruling: translate server-owned literal excerpts rather than allowing a model summary. A real API check exposed an omitted English translation; the v2 prompt explicitly requires English/romanized text and preserves source-excerpt labels.
- Verification: all 290 tests pass with `node --import tsx --test --test-concurrency=1 tests/*.test.ts`; TypeScript and production build pass; eslint reports zero errors and the existing topic thumbnail img warning. A parallel full run exposed an unchanged supervisor timing test's PID-file deadline; that test passes independently and in the complete serial run.
- Rendered QA: existing cached Playwright (Browser skill unavailable in session), isolated SQLite and localhost ports 3033/3034. Hourly/daily show two samples; topic switching hides empty cases; 390px layout has no horizontal overflow. Long poster and a 2200px focus card with photograph/long copy/two quotes fit with no browser errors. Screenshots and temporary QA scripts are outside the repository.
- Live QA: current Bilibili URL returned three root comments; actual DeepSeek classification selected one red comment, no blue match, and one English translation. Selected IDs/text/likes match the source. Zhihu returned HTTP403, exercising the hidden/cooldown path. Production data was read-only; live check results were stored in a separate temporary SQLite database.
