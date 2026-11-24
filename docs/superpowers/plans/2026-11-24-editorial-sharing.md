# Bilingual Editorial Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add localized single-story sharing, EN/ZH editorial recommendations and a stronger English daily four-card package to the existing admin.

**Architecture:** A browser-safe topic-sharing domain owns column metadata, source-grounded generation/validation and recommendations. Server adapters resolve exact archived or live source versions and persist frozen drafts; admin jobs run generation. Client editors export saved bilingual assets without fetching sources or invoking AI.

**Tech Stack:** Existing Next.js/React/TypeScript, SQLite, DeepSeek, html-to-image and stored ZIP writer; no new dependencies.

**Spec:** docs/superpowers/specs/2026-11-24-editorial-sharing-design.md

## Global Constraints

- One English daily four-card package plus 2–3 bilingual story packages from today/yesterday.
- Three actual columns; quotes only from saved, attributed comments; no sample timestamp row.
- Authenticated explicit generation only; optimistic revisions and maintenance fencing.
- No X posting, deployment, new scraping on reads/exports, or fabricated viral predictions.

## Review Focus

- Selected source changes or is archived during generation: retain source identity and reject stale overwrite.
- Missing comments/English translation: do not fabricate the voices column or a second side.
- Rapid item/language switches: cancel obsolete reads and preserve or warn about unsaved edits.
- Sparse sources/duplicate stories across snapshots: no fake padding or repeated shortlist entries.
- Long localized text/broken images: fail visibly or bound the export, never silently clip evidence.

### Task 1: Research and source-grounded content domain

- [x] Research accessible original X examples; label missing metrics and derive experiment patterns.
- [x] Define types in src/lib/topic-sharing/types.ts and column metadata.
- [x] Write and observe failing recommendation/generation tests; implement browser-safe rules and server AI generator.
- [x] Verify column eligibility, bilingual validation, independent localized hooks and comment provenance.

### Task 2: Server integration

- [x] Write failing tests for source resolution, persistence/CAS and authenticated topic-share routes.
- [x] Add hourly/daily/archive source adapters, frozen draft storage and today/yesterday shortlist.
- [x] Extend existing admin jobs with topic-sharing generation; retain global exclusive execution and logs.
- [x] Verify no AI on GET, stale source/edit protection, no source mutations and safe links.

### Task 3: Admin authoring and exports

- [x] Add hourly/daily detail actions, shortlist, bilingual editor and column-specific card rendering.
- [x] Add save/reload/regenerate, candidate hook selection, PNG and bilingual ZIP exports.
- [x] Test localization, source links, missing comments/images, unsaved-state guards and export consistency.

### Task 4: English daily package

- [x] Keep legacy saved packages compatible; introduce editorial opener and hook-first captions for new packages.
- [x] Ensure three highlight stories when enough supported material exists, with named columns and context.
- [x] Verify captions, alt text, card count, source ownership and existing editing/image flows.

### Task 5: Integration and review

- [x] Run full tests/typecheck/lint/build and independent review; fix actionable findings.
- [x] Browser-check authenticated authoring, saved drafts, EN/ZH exports, mobile layout and PNG bounds.
- [x] Document capabilities, research limitations, operating cadence and remaining risks.
