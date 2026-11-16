# Admin Sharing and Automatic ShareEn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Use existing managed worktree. Do not commit individually; coordinator reviews, tests, merges and pushes after completion.

**Goal:** Move all sharing to authenticated admin, automatically generate ShareEn with daily reports, allow regenerating and downloading all formats, and produce branded TOP3 numbered English captions.

**Architecture:** Optional shareEn JSON in daily_reports payload; shared server sharing service with fingerprint/generation guards; authenticated admin route and serial task; browser-only PNG/ZIP exports. Public daily page contains no sharing controls. Existing translated long poster remains usable in admin.

**Tech Stack:** Next.js/React, TypeScript, SQLite, DeepSeek, html-to-image, deterministic local ZIP writer.

**Spec:** docs/superpowers/specs/2026-11-16-shareen-design.md plus latest user override below.

## Global Constraints / Latest user overrides
- All sharing is admin-only. Add sharing Tab; remove DailyShare from public daily renderer.
- ShareEn runs by default after daily English generation for CLI, scheduler and admin daily generation.
- Allow explicit force regeneration; failures retain saved usable version. No anonymous AI endpoint.
- Caption first line WcCAT Daily Hot, includes original daily TOP1/TOP2/TOP3 numbered summaries, brief CTA. Core daily cards may still be selected by AI overseas relevance (previously approved); preserve original ranks.
- Red #ff315f + blue #3ba7ff WcCAT logo, white clean fixed1200x1500 cards. Preview is actual admin feature, no new standalone mockups.
- Numerical differences advisory, schema/identities/completeness blocking. No real AI calls or production DB mutations in tests.
- Source fingerprint excludes ordinary English/shareEn; archive-only source is readonly with guarded main copy on write. Re-generation source changes rejected.
- User explicitly authorized final commit and push after code review; no further confirmation needed.

## Review Focus
1. Stale AI writes must not overwrite newer Chinese reports/English updates.
2. Old archive-only reports remain readable and sharing fields survive archive roundtrip.
3. Public daily no longer exposes sharing, admin route requires login/same origin.
4. Every exported card fits fixed size; long content is compacted/readability checked, never silently truncated.
5. Captions contain original Top3 even when editorial highlight picks differ; cached downloads consume no AI.

## Contracts
ShareEnCopy: version:1; generatedAt,model,sourceFingerprint strings; overview:{headline,summary,topics:[{id,title}]}; highlights:[{topicId,hook,whatHappened,context,whyItMatters}]; top3:[{topicId,summary}]; posts:[{id,template,text,reason}]; selectedPostId:string; altTexts:string[].
Backend exports from src/lib/sharing.ts: generateSharing(reportDate:string,options?:{format?:'all'|'english'|'shareen';force?:boolean;log?:GenerationLog}):Promise<{report:WccatDailyReport;englishReady:boolean;shareEnReady:boolean}>; saveShareEnEdits(reportDate:string,copy:ShareEnCopy,expectedRevision:string):WccatDailyReport. Core src/lib/shareen.ts exports generateShareEn(report,log?):Promise<ShareEnCopy|undefined> and sourceFingerprint(report), plus validation helpers.
Admin GET /api/admin/share?date=... returns {report,shareEnRevision}. POST action generate {date,format,force}; creates JobInput kind sharing, reportDate,shareFormat,force. POST action save {date,copy,expectedRevision} saves edited copy; stale revisions return HTTP 409. Auth and same-origin.
AdminSharingPanel props {date,revision,disabled,onDateChange,onGenerate,onSaved}. onGenerate(format,force) creates admin job; onSaved refresh summary; panel fetches authenticated sharing GET. Frontend may provide defaults if props callbacks absent in tests.

## Tasks
- [x] A: Backend ShareEn schema, bounded AI generation, caching/fingerprint persistence, force English regeneration, archive copy-on-write. RED/GREEN tests.
- [x] B: Admin share route, serial sharing jobs/logs, sharing Tab with date state and task links; route authorization tests.
- [x] C: ShareEn poster + admin sharing panel + PNG/ZIP/post/alt export and caption edit/select. ZIP tests and fixed card overflow detection.
- [x] D: Daily auto generation, public control removal, CLI command/docs, integration tests. Source override: default enabled, under2 topics skip safely, preserve existing tests' 1-topic fixtures.
- [x] E: Code review, fix findings, full tests/lint/build and actual feature browser QA using temp DB/mocked AI. No new visual mockup deliverable.
- [ ] F: Stage only product/docs/test changes; exclude output mockups, fast-forward main, verify main suite, push and verify remote SHA.

## Rulings
- Original daily ranks determine caption TOP3; overseas editorial selection only controls deep-dive cards.
- First line branding mandatory. Use natural English reach language rather than unmeasured 1.4-billion participation claim.
- Daily processing remains successful if ShareEn unavailable; admin marks partial and exposes retry. A saved prior same-source ShareEn remains on regeneration failures.
