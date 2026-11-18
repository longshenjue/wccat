# Evidence Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve source evidence, document revisions, interaction observations and multi-provider search results for future event research.

**Architecture:** Add independently retained tables to the existing SQLite database. A focused repository handles content-addressed compressed blobs, append-only observations, event associations and analysis provenance. Existing acquisition records raw responses once and continues returning the same ranked data.

**Tech Stack:** TypeScript, better-sqlite3, node:crypto, node:zlib, node:test; no additional dependencies.

**Spec:** docs/superpowers/specs/2026-11-18-evidence-library-design.md (approved 2026-11-18).

## Global Constraints

- Retain existing ranking, reports, legacy archive v1 and maintenance generation fencing.
- New library data survives legacy snapshot cleanup; no automatic evidence deletion.
- Newly acquired credentials are sanitized before evidence and automatic legacy persistence. Full backups preserve pre-existing records; historical credential cleanup is not silently performed.
- No new paid requests, periodic AI tasks, public API or account registration side effects.
- New search providers remain disabled; this change supplies recording/normalization contracts, not authenticated network adapters.
- User authorized implementation in this chat; execute inline without another workflow approval. Work on codex/evidence-library in the managed worktree.

## Review Focus

- Cross-run retries versus real repeated observations must preserve chronology without duplicate metrics.
- Content URLs containing identifiers must survive normalization; signed/auth parameters must not survive persistence.
- Malformed and oversized upstream responses must remain distinguishable from complete evidence.
- A maintenance generation change during network acquisition must reject delayed writes.
- Restoring a full backup must include new evidence while old archive validation still accepts v1.

---

### Task 1: Schema, blobs and evidence repository

**Files:** src/lib/evidence-types.ts, evidence-schema.ts, evidence-content.ts, evidence-store.ts; tests/evidence-store.test.ts.

**Interfaces:** createEvidenceSchema(db); EvidenceStore(db) with recordBatch(input), recordSearch(input), createEvent(input), linkEventEvidence(input), recordEventRelation(input), recordAnalysis(input), readDocument(id), readSearch(id), readEvent(id), stats(). Batch returns runId and observation IDs. Search results retain provider-specific ranks independently of a shared document.

- [x] Write tests for compressed deduplication, zero/missing metrics, two engines sharing a URL, content revisions, idempotent run retries, event/analysis provenance, unsafe URL parameters and truncation.
- [x] Run node --import tsx --test tests/evidence-store.test.ts; observe missing behavior.
- [x] Implement strict input validation and transactional writes using normalized content hashes and independent foreign keys.
- [x] Re-run focused tests; expect all pass.

### Task 2: Consistent full backups and legacy backfill

**Files:** src/lib/evidence-maintenance.ts, scripts/evidence.ts, package.json; tests/evidence-maintenance.test.ts.

**Interfaces:** backupEvidenceDatabase(db, directory); verifyEvidenceBackup(file); backfillEvidence(db, options); CLI commands npm run evidence -- stats|backup|verify|backfill.

- [x] Write failing tests for WAL-safe backup/restore, corrupted manifests, repeatable backfill and missing raw provenance.
- [x] Run node --import tsx --test tests/evidence-maintenance.test.ts; expect feature failures.
- [x] Implement backup API plus versioned manifest, hashes, private file modes and row/blob integrity checks; bounded backfill with stable legacy run IDs.
- [x] Re-run tests; expect pass with no network access.

### Task 3: Live acquisition and existing analysis integration

**Files:** src/lib/evidence-capture.ts, ingest.ts, db.ts, store.ts; tests/evidence-ingest.test.ts, evidence-retention.test.ts.

**Interfaces:** captureEvidence(run callback) uses AsyncLocalStorage to observe fetch requests/responses and associate provider, platform and normalized items. Persist batches via guardedWrite with the caller's generation; errors are surfaced rather than swallowed as source failures. fetchSource preserves its existing return type.

- [x] Write failing tests for successful and malformed upstream responses, fallback provenance, same-hour replacement retaining both runs, cleanup survival, and stale generation rejection.
- [x] Run focused tests and observe failure.
- [x] Implement explicit capture scope around existing fetchSource calls, body-size limits, redaction and successful-save ordering; add schema initialization only to writable main database.
- [x] Record existing topic analysis versions against matching evidence without introducing extra model calls.
- [x] Re-run focused and legacy archive/maintenance tests; expect pass.

### Task 4: Documentation, compatibility and review

**Files:** README.md, docs/project-architecture-roadmap.md, docs/free-data-source-setup.md, docs/evidence-library.md, src/components/admin-data-panel.tsx; tests/evidence-compatibility.test.ts.

- [x] Verify a six-table v1 archive still exports, validates and registers with evidence present only in main database.
- [x] Document safe backfill, full backups and restore-to-new-path procedures; label existing full/daily exports as legacy business archives.
- [x] Run npm test, npm run lint, npx tsc --noEmit --incremental false, and production build when needed for import-boundary integration.
- [x] Request one fresh whole-change review and fix material findings with regression tests.
- [x] Report tested behavior, exact database migration/backfill actions, registration blockers and remaining provider-key dependencies.

## Execution record

Implementation progress and any scope rulings live in .superpowers/sdd/2026-11-18-evidence-library/progress.md. Do not migrate or backfill the user's original database while validating the implementation; apply to a consistent temporary copy first. Real backfill remains an explicit user operation unless separately requested.
