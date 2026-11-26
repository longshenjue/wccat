# News fact deduplication implementation plan

> Execute inline with regression tests, then request one fresh whole-branch review.

**Goal:** One daily entry per concrete news development, including reordered headlines and Chinese/Arabic mission numbers. Different actions, outcomes, denials and later developments remain separate.

**Architecture:** Share a conservative, deterministic headline matcher between hourly grouping and daily aggregation. Daily grouping uses original occurrence titles, rather than lossy archived normalized titles, before scoring and selecting ten entries. Reuse frozen evidence; no new crawl or AI call for deduplication.

**Constraints:** Preserve platform-tier-v3 caps and within-platform scoring. Never sum precomputed daily scores. Keep archived reports unchanged until explicitly regenerated. Existing analyses from mixed archived groups must not be attributed to a narrower reconstructed fact. No deployment polling after push.

**Approach:** Exact fact-preserving normalization plus narrowly defined equivalences: bounded Chinese numeral conversion, mission-number aliases, redundant success wording, reordered response headlines and reordered complete clauses. Entity overlap, character bags, broad fuzzy similarity and LLM guesses are insufficient to merge. Ambiguous paraphrases remain separate. Complete-link grouping prevents a generic intermediate headline from joining conflicting facts.

## Tasks

- [x] Reproduce screenshot duplicates and stage/negation/numeric/actor-role counterexamples in regression tests; observe failures.
- [x] Implement cached-per-run fact descriptors and conservative grouping; apply to hourly grouping and daily occurrence aggregation. Keep original URLs and representative analysis references when valid.
- [x] Verify duplicate scores stay bounded, sample dates are unique, mixed archived groups split safely, and the full candidate pool fills the Top10 after deduplication.
- [x] Replay the six saved source snapshots behind the supplied daily report; report grouping counts and distinguish genuine separate developments.
- [x] Document regeneration behavior; run relevant tests, full suite, type checks, lint, build and fresh code review.
- [ ] Commit, push feature branch and integrate into main; do not poll deployment.

## Review focus

Actor/object reversals; negation and question wording; different dates/counts/mission IDs; archived lossy normalization and mixed analysis; transitive merge bridges; duplicate platform contributions; empty/unusable titles; runtime on several thousand saved occurrences.

## Review corrections

Failing-first regressions cover final-group analysis compatibility after generic bridges, explicit comma/space actor boundaries, mission-number/date separation, unique bounded IDs for split/long titles, rebuilt per-fact snapshot peaks/sentiment and preservation of a valid lower-heat parent's saved analysis. These checks extend beyond the two supplied duplicate groups to prevent a fix that erases genuine developments.

## Verification

472/472 tests passed with `node --import tsx --test --test-concurrency=4 tests/*.test.ts`; TypeScript, production build and diff checks passed. ESLint has zero errors and one pre-existing image warning. Fresh review independently passed 71 relevant tests with no remaining P1/P2 findings. A single-observation signal regression from the full suite was corrected to preserve the existing long-tail behavior.

Integration follows this committed plan snapshot; main's git history is authoritative for whether the authorized release has been pushed.
