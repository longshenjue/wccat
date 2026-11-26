# X Publication Materials Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ship a complete bilingual X publishing package: main-post caption, one source reply, a stable public source page and image reference, covering daily packages and single topics selected from daily/hourly reports.

**Architecture:** Keep existing editable caption candidates. Explicit preparation or downloading a publication package creates an immutable, minimal public projection of the saved revision. Public readers see source/context pages and an index, never administrator drafts or diagnostics. Saved snapshots survive later source regeneration.

**Tech Stack:** Existing Next.js App Router, React, SQLite, native CSS and client ZIP encoder. No new dependencies or additional model calls.

**Spec:** User-approved approach in this chat: complete content on X, one clearly described source link in an author reply, profile index, bilingual source explanations and stable per-post versions. User additionally requests a clear ready-to-post caption in single-topic sharing.

## Global Constraints

- Preserve translation-warning-only policy; no new editorial generation/save/download blockers.
- Keep current Chinese/English post separation and 4-card daily package, image selection and full text.
- Main captions default to no external links; preserve manual edits and only advise on a pasted URL.
- Source pages freeze the exact saved copy/evidence; later report changes do not rewrite old pages.
- Public projection excludes candidate alternatives, review warnings, model metadata, private source keys and job data.
- Writes require existing administrator/session/same-origin checks, revision checks and maintenance fencing.
- Preview/read/copy operations do not invoke models or scrape. Explicit preparation and publication-package download may save a public projection, never post to X.
- No domain purchase, X publishing or deployment-status polling.

## Review Focus

1. Private drafts stay private until preparation/download; public endpoints expose only whitelisted fields.
2. Stale edits and report regeneration cannot publish a different revision than the exported image.
3. Published source pages persist after source edits/deletion; repeat preparation is idempotent.
4. Source replies correctly omit comment promises when none exist, and label search/hotspot links accurately.
5. Caption edits, language switches and ZIP contents remain consistent; generated URLs and image IDs match public records.

### Task 1: Public projections and storage

- [x] Test frozen single-topic/daily projections, excluded metadata, evidence identity and idempotent revision-guarded writes.
- [x] Add publication types, projection builder, SQLite schema/store and authenticated preparation endpoint.
- [x] Add public per-publication page, bilingual index, metadata and clear original-source/AI/comment labeling.

### Task 2: Caption and export workflow

- [x] Expose main-post captions clearly and improve generation brief without extra calls or gates.
- [x] Add common publishing controls for source reply, link, reference and caption copying.
- [x] Prepare saved publication snapshots on explicit prepare/download; add matching refs to posters and matching source-reply files to ZIP.
- [x] Cover topic, hourly-origin single topics and daily bilingual exports.

### Task 3: Verification and integration

- [x] Add API authentication, stale-revision, immutable snapshots and public-presentation regressions.
- [x] Verify desktop/mobile UI, copy interactions, source page/index and actual ZIP/image exports using isolated data.
- [x] Run all tests, types, lint and production build; obtain independent code review.
- [x] Commit, push, merge into main and push main, without deployment polling.

Verification: real isolated browser at 1440px and 390px; caption edit/save/clipboard, language-specific source replies, unauthenticated public pages, reference search, delayed publication POST export locking, topic 13-file and daily 17-file ZIP dimensions/URLs, legacy English downloads, and publication-service 503 local-ZIP fallback. No extra model calls. Browser plugin not available; existing Playwright runtime used.

Final checks: 487/487 tests passed; publication-focused regressions passed after final reference validation; TypeScript and production build passed. ESLint has zero errors and the existing topic-workbench image warning. Independent review findings were resolved. Integration follows the user's standing authorization; no deployment polling.
