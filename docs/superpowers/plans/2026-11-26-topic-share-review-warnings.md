# Human editorial review for single-topic shares

**User policy:** Translation/wording correctness is decided by the administrator. Editorial doubts must never block draft generation; show admin warnings instead.

**Implementation:** Separate structural/source validation from editorial assessment. Generation saves parseable bilingual draft text after one model request without automatic rewriting, repair or candidate substitution. Generation, manual saves and legacy reads compute server-owned review warnings. Live editor diagnostics identify language/field/candidate and never require acknowledgement or disable actions. Warnings stay out of public PNG/caption/ALT material. Longer card text expands the canvas without clipping or shrinking below readable sizes.

**Source integrity:** Frozen source objects, comment identities, likes, original text, provenance hashes, authentication and optimistic revisions remain protected. AI cannot create source-owned fields. Unreadable responses, unsafe controls, invalid source/record identities and stale writes remain actual errors. Incomplete language fields remain editable blanks rather than a translation rejection; valid Chinese comments may support the voices column even when their saved English translation is unavailable.

**Assessment:** Existing numeric/role, quote, comment, language, length and candidate rules become advisory. Diagnostic-parser failures are advisory too. Client-supplied warnings are never authoritative; saved warnings are derived from saved text/source and recomputed on reads/edits. Plain-text link concerns are warnings; clickable source links still come only from frozen validated evidence.

## Tasks

- [x] Failing-first generation/save/review tests cover core numeral-one, Han/English mixtures, quoted translations, missing evidence, long text and incomplete fields.
- [x] Separate draft preparation from strict diagnostic assertions; remove production editorial-repair retries and source-translation gates.
- [x] Add recomputed persisted admin warnings and live editor badges, with no acknowledgement gate or public warning overlays.
- [x] Expand long card canvases and export measured heights; preserve full text and selection.
- [x] Check real admin generation/save/reload/edit/export on desktop/mobile using temporary data; Browser plugin absent, use available Playwright fallback.
- [x] Run full tests, TypeScript, lint, build and fresh review.

Integration: commit/push/merge main follows the verified plan snapshot under standing authorization, without deployment polling.

## Verification evidence

Three saved-source live DeepSeek calls (handshake/poem/bathhouse) each completed after one request, preserving text with 13/5/9 advisory observations rather than rewriting or rejecting it. No production database writes.

Real local admin browser QA: warnings remain visible after generation, save returns 200 and reload preserves edits, warning count updates, downloads stay enabled, PNG heights expand (export 1080×2898 English and 1080×1800 Chinese), ZIP keeps original caption text and contains no admin warnings. Desktop1440 and mobile390 checked; document width390 on mobile; no page/console errors.

Fresh review identified a fallback-selection editing defect for a missing English object. A real browser reproduced typed text remaining empty; the resolved-selection edit helper and accessible labels fixed it, and the same browser reproduction now passes. Source identity and stale-write protections remain tested.

The existing separate daily-English workflow explicitly requests English-comment column eligibility, preserving its prior selection behavior while single-topic drafts use human-review warnings. Shared comment rendering opts into mixed-language saved translations only for single-topic cards; other surfaces retain their default behavior.

Final checks: 475/475 full tests passed after replacing superseded automatic-repair assertions with warning-only policy tests. TypeScript and production build passed; ESLint has zero errors and one pre-existing image warning. Fresh review found no remaining P1/P2 issues. Integration follows this plan snapshot under standing user authorization; main's history is authoritative for push status.
