# Admin Data Archives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add an authenticated admin UI for portable monthly archives and deliberate hourly-history cleanup while permanently retaining generated daily reports.

**Architecture:** Keep one writable SQLite database, add read-only registered monthly archives and bounded date-based readers. Heavy export/cleanup work runs in separate Node processes with persistent task status; a database-backed maintenance fence coordinates web, worker and CLI writes. Cleanup always uses a version-bound preview and protects the latest snapshot and last 48 hours.

**Tech Stack:** Next.js 16 / React 19, Node 22 crypto/fs/zlib/child_process, better-sqlite3, existing node:test + tsx.

**Spec:** `docs/superpowers/specs/2026-11-13-admin-data-archives-design.md` (approved 2026-11-13).

## Global Constraints

- No external storage; no scheduled deletion; no cleanup of real local or cloud data during verification.
- Preserve all `daily_reports` payloads including embedded analysis and English; no on-demand public AI or old arbitrary production CRUD.
- Runtime `/app/data`; optional `WCCAT_DATA_DIR` for isolated tests and local maintenance. Main database, exports and archives remain separate paths.
- Retain last 48 hours by actual generatedAt plus latest snapshot; Beijing inclusive date ranges.
- Files are versioned, independently validated SQLite gzip archives; multi-month ranges yield monthly files.
- Admin secrets are runtime-only password hash and signing secret; all resource endpoints independently authenticate.
- Existing main checkout and live database stay untouched. Execute inline in the managed isolated worktree; use the approved design as authorization to continue without further plan approval.

## Review Focus

- Worker started an AI request before cleanup: its later write must fail the generation fence rather than resurrect deleted data (Task 2 tests).
- Download is aborted or data changes after preview: source must remain intact; only explicit, verified cleanup can run (Tasks 3/5 tests).
- Disk is almost full, or compaction fails after logical deletion: accurate persistent status and retry path, never a false space-reclaimed message (Task 5 tests).
- Months overlap or a newer English cache exists in main: archive registration/query must not duplicate or replace newer content (Task 4 tests).
- Hostile archive, forged cookie, traversal ID, cross-origin POST: no file disclosure, untrusted SQL execution or destructive action (Tasks 1/3/4/6 tests).

---

### Task 1: Administrator authentication

**Files:** Create `src/lib/admin-auth.ts`, `src/app/api/admin/session/route.ts`, `scripts/admin-password.ts`, `tests/admin-auth.test.ts`; modify package scripts/env example.

**Interfaces:** `hashAdminPassword(password): string`, `adminConfigured(): boolean`, `createAdminSession(now?): string`, `verifyAdminSession(token, now?): boolean`, `requireAdmin(request, mutate?): void`; cookie `wccat_admin`, 8-hour TTL. Password format scrypt with random salt; rotation invalidates sessions.

- [x] Write/run RED tests for wrong password, expiration, tampering, missing secrets, cross-origin mutation and rate limit.
- [x] Implement auth, bounded login throttling, runtime-only Secure/HttpOnly/SameSite cookie routes and hidden-input password-hash CLI.
- [x] Run `node --import tsx --test tests/admin-auth.test.ts`; expect all assertions passing.
- [x] Commit auth implementation and evidence.

### Task 2: Storage schema and cross-process write fencing

**Files:** Create `src/lib/storage-paths.ts`, `src/lib/db-schema.ts`, `src/lib/maintenance.ts`, `tests/maintenance.test.ts`; modify `db.ts`, `store.ts`, `precompute.ts`, `daily-report.ts`, `daily-share-backfill.ts`.

**Interfaces:** Paths `dataDir`, `dbPath`, `exportsDir`, `archivesDir`; `createBusinessSchema(database)`; `writeGeneration(): number`; `guardedWrite(database, fn, expectedGeneration?): T`; `acquireMaintenance(database, owner): void`, `releaseMaintenance(database, owner): void`. Persist owner pid/hostname and generation, recover dead owners safely.

- [x] Write/run RED tests using independently opened SQLite connections for active maintenance, stale generation, dead owner recovery and child-process late writes.
- [x] Extract compatible business schema; add operational maintenance/task tables, incremental auto-vacuum only on newly created databases.
- [x] Guard every production business writer; capture expected generation before asynchronous collection/AI/translation, including fallback/log writes.
- [x] Run `node --import tsx --test tests/maintenance.test.ts` and existing persistence/analysis tests; expect no resurrection and unchanged old behavior outside maintenance.
- [x] Commit schema and write-fence integration.

### Task 3: Range previews and portable monthly export

**Files:** Create `src/lib/data-range.ts`, `src/lib/data-preview.ts`, `src/lib/archive-format.ts`, `src/lib/archive-export.ts`, `tests/archive-export.test.ts`.

**Interfaces:** `parseRange({start,end}): DateRange`, `splitMonths(range): DateRange[]`; `previewCleanup(range, now?): CleanupPreview` with digest, protected rows, table counts and missing-report dates; `exportMonth(range, mode, progress, cancelled): Promise<ArchiveFile>`; `validateArchive(path): ArchiveMetadata`.

- [x] Write/run RED tests for one chosen month out of three, boundary dates, daily-only/full export round trip, mutation-free preview, and cancellation leaving source unchanged.
- [x] Export consistent independently read transactions into versioned whitelisted schemas, sorted row/metadata digests, gzip streaming, SHA-256 and disk-budget checks. Support old primary keys without merging autoincrement identities across deployments.
- [x] Validate format/header/schema, integrity_check, counts, hashes and ranges before offering download. No public paths or arbitrary filenames.
- [x] Run `node --import tsx --test tests/archive-export.test.ts`; expect source tables byte-for-byte unchanged.
- [x] Commit export/range primitives.

### Task 4: Archive registration and merged historical reads

**Files:** Create `src/lib/archive-catalog.ts`, `scripts/register-archives.ts`, `tests/archive-catalog.test.ts`; modify DB read methods, `store.ts`, daily navigation.

**Interfaces:** `registerArchives(paths): Promise<RegistrationResult[]>`; `archiveDatabases(): Database[]` with bounded caching; query adapters select newest generated snapshot/report, same-generation main first, children from same source. Registration validates before atomic publication and is idempotent by content.

- [x] Write/run RED tests for same file twice, overlapping partial months, >10 months, cross-month last-24-hour selection, corrupt schema, decompression budget and newer main English retention.
- [x] Implement safe CLI gzip extraction/validation and catalog refresh with bounded connections; no startup imports or mutations during reads.
- [x] Route hourly/daily/analysis date reads through merged sources; an explicitly absent/deleted hourly date returns a clear empty state rather than latest data.
- [x] Run `node --import tsx --test tests/archive-catalog.test.ts` plus daily-window/persistence tests; expect deterministic deduplication.
- [x] Commit archive recovery/query integration.

### Task 5: Persistent jobs, deliberate cleanup and actual disk reclaim

**Files:** Create `src/lib/admin-jobs.ts`, `src/lib/data-cleanup.ts`, `scripts/admin-job.ts`, `scripts/prepare-storage.ts`, `tests/data-cleanup.test.ts`, `tests/admin-jobs.test.ts`.

**Interfaces:** `createJob(input): AdminJob`, `runJob(id): Promise<void>`, `getJobs(): AdminJob[]`, `cancelJob(id): void`; job states queued/running/ready/complete/failed/cancelled; selected cleanup binds range+digest+mode+optional downloaded export IDs.

- [x] Write/run RED tests for cleanup preserving daily payloads, last-48-hour/latest protection, fingerprint conflict, archive acknowledgement missing, insufficient disk and failure recovery.
- [x] Add one active job globally, separate Node task runner, progress/cancellation/restart recovery and safe temporary export lifetime. Download completion + explicit admin acknowledgement required for export-then-cleanup.
- [x] Implement maintenance-fenced revalidation and atomic table deletion including AI logs, generation increment, incremental reclaim/checkpoint with before/after actual disk sizes.
- [x] For old databases, provide controlled initialization CLI and UI task with free-space preflight before VACUUM; failed initialization keeps business rows untouched. Failed post-delete reclaim reports logical deletion separately and allows reclaim retry.
- [x] Run task tests and whole `npm test`; expect no unrelated/daily data loss and truthful physical-space reporting.
- [x] Commit job/cleanup implementation.

### Task 6: Authenticated management API and administrator UI

**Files:** Create `src/app/api/admin/data/route.ts`, `src/components/admin-data-panel.tsx`; modify `src/app/admin/page.tsx`, styles, `src/app/daily/page.tsx`; create `tests/admin-data-api.test.ts`.

**Interfaces:** GET admin data returns capacity/months/previews/jobs or one authenticated server-ID download; POST accepts typed preview/export/cleanup/reclaim/cancel/discard operations. Mutations require same-origin session and validated JSON; download has no-store and safe attachment headers.

- [x] Write/run RED tests for unauthenticated resource access, bad origin, invalid ranges, unsafe IDs and full-mode-only export cleanup.
- [x] Build login/logout, month/date selectors, counts/capacity/progress, separate download and cleanup actions, explicit confirmations including missing reports, hashes and failure/retry controls.
- [x] Add long-term daily date/month navigation while retaining the original public page design; preserve existing PNG behavior.
- [x] Run API tests, lint and typecheck; expect no production arbitrary CRUD or public generation regression.
- [x] Commit admin experience.

### Task 7: Verification, documentation and delivery

**Files:** Update README, `.env.example`, `docs/deploy-northflank.md`, approved spec status and this plan's evidence.

- [ ] Run all tests, `npx tsc --noEmit`, `npm run lint`, production build and isolated browser/API round trip using generated test secrets only.
- [ ] Verify actual gzip download/registration, independent deployment-style historical reads and daily rendering/PNG after selected cleanup, all in temporary data directories.
- [ ] Document password hash setup, session rotation, first-time storage preparation, monthly export/clear choices and bulk archive registration; no real delete on deployment/startup.
- [ ] Request one fresh whole-change reviewer, fix important findings with RED→GREEN tests, re-run affected checks and complete delivery without publishing secrets or test data.
- [ ] Commit final verified work and integrate into requested repository deployment flow; keep the existing live database unchanged.
