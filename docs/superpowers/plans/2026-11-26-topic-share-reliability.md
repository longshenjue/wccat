# Single-topic share reliability plan

**Goal:** Handle recurring editorial validation failures as a bounded pipeline, while keeping evidence, source identity and saved-draft protections strict.

**Root cause:** Public-field limits are duplicated between the generation prompt and validator; most content checks stop at the first failure; only numerical/comment failures are repairable; the repair uses the same creative temperature as initial generation. An otherwise useful bilingual package is discarded when a repaired candidate still contains an unsupported ordinary singular “one”. The screenshot identifies `en.posts[2].text (1)` but does not include its full sentence, so that exact model response cannot be reconstructed.

**Approach:** One shared copy contract; collect all editable content issues after checking the entire draft for fatal security/provenance failures; repair only the reported string fields once at low temperature with explicit per-field budgets and evidence constraints. Fully validate again. If only optional post candidates still fail, rebuild each failed candidate unit from an already validated same-language summary, context or question, respecting whole-text budgets, uniqueness and the corresponding editorial pattern. Log this recovery in the admin job and candidate reason; fully validate again. No quantity rewriting, numeric exemptions, generic filler or silent partial draft.

**Budget:** At most one initial request (6,000 output tokens) plus one repair request (2,500); no third request. Transport failures, malformed JSON, source-owned fields, unsafe controls and unapproved links remain fail-closed. Failed generation preserves the previous draft. Manual edits continue to pass the same strict validator and are never auto-rewritten.

## Tasks

- [x] Add failing-first coverage for multi-issue reporting/repair, recurring singular-one failures, strict unsafe/quantity counterexamples and contract consistency.
- [x] Centralize field constraints and structured editable issues; preserve numeric/comment error compatibility and fatal guards.
- [x] Implement the unified repair controller and guarded candidate recomposition; log issue stage, type and path without response bodies or secrets.
- [x] Reproduce the supplied handshake source and exercise a varied saved-source corpus, including comments/no-comments and sparse/quantified material.
- [x] Check service/concurrency preservation, complete tests, type checks, lint, production build and independent review.
- [ ] Commit, push and integrate into main under the user's standing instruction; do not poll deployment.

## Review focus

No bypass of unsupported quantities or invented quotations; mixed content/security failures must stop before repair; same-field issues get one patch; model repair cannot alter sound Chinese/English or source-owned data; candidate recomposition uses only validated core fields and changes only the failed candidate's text/pattern/reason while preserving its id and selection; request and latency budgets stay bounded.

**Ruling:** Reuse validated complete fields instead of converting singular quantities to articles. This avoids guessing whether “one” is rhetorical, a measured count, a named concept or part of a comparison, and generalizes to other candidate-only editorial failures.

## Evidence

Initial three regressions failed for first-error reporting, mixed repair and repeated `en.posts[2].text (1)`; all passed after the refactor. Fresh review found an ordering dependency between failed candidates; its failing-first case now passes with bounded progress passes and at most 60 local validations. Independent review passed 79 topic-sharing tests with no remaining P1/P2 findings.

Live DeepSeek checks used saved-source handshake/poem/bathhouse fixtures without production writes: all three passed in two requests each (about 9/15/13 seconds). Handshake initial output had five numeric-one failures; poem had numeric-one/three and comment-description failures; bathhouse had missing-comment-evidence wording. One concentrated repair resolved each case. These results demonstrate program validation, not general semantic entailment; unsupplied cultural background remains a known pre-existing fact-checking limitation.

Final verification: 482/482 full tests passed (`--test-concurrency=4`), TypeScript passed, ESLint zero errors with one pre-existing image warning, production build passed, and diff checks were clean. Recomposition also passes the final optimistic source/revision/maintenance guards; a manual save during repair is preserved. Integration occurs after this committed plan snapshot under the user's standing authorization; main's git history is authoritative for release status.
