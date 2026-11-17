# ShareEn Caption and Battle Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans, TDD and one fresh final code review. No commits/push without a new explicit request.

**Goal:** Synchronize new captions with focus cards and repair omitted emotional opposition during daily generation.
**Architecture:** Keep source topic identity authoritative. Add optional captionBasis marker for backward compatibility and use the existing bounded field-repair pipeline for missing battle data.
**Tech Stack:** TypeScript, React/Next, node:test.
**Spec:** docs/superpowers/specs/2026-11-17-shareen-caption-battle-design.md

## Global Constraints
- Captions follow2–3 selected highlights in order; legacy absent marker remains readable.
- Existing battle scores take priority; no fabricated50/50, text remains usable on optional failure.
- Max2 ShareEn text calls, downloads/images-only never add text calls, no real paid requests.
- No image layout changes, hourly logic changes, commit or push.

## Review Focus
- Two selected stories must not force a third unrelated caption.
- Legacy saved captions and private image revisions remain compatible.
- Missing and explicit-null battles differ; existing analysis still needs translation.
- Repair selection changes include battle handling without overwriting good text.
- Daily-generated persisted payload actually renders the emotional strip and exports its description.

### Task1: Caption synchronization
- [x] RED tests: selection ranks1/5/10 and2-card selection determine summaries and all posts; mismatch/order validation rejected, legacy valid, editing updates candidates.
- [x] Implement type marker, assembly, validator, editor labels and documentation; focused GREEN.

### Task2: Missing emotional opposition
- [x] RED tests: omitted field with Chinese source is repaired, absent unanalysed field gets one bounded attempt, explicit no-evidence stays absent, failures preserve text/log state, daily persistence→render/export carries strips.
- [x] Implement null-aware optional repair and per-card diagnostic logs; focused GREEN.

### Task3: Verification
- [x] Full test suite alone, lint/build, browser check caption order and daily-produced debate strip; fresh code review and fix important findings.
