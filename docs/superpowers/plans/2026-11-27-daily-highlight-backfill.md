# Daily highlight backfill implementation plan

> Execution: implement inline in this chat, as requested; use targeted tests only, then commit and deploy.

**Goal:** Produce three source-supported daily highlights when the Top10 contains enough verifiable stories.

**Architecture:** Keep the existing editorial priority order and ranking. Research candidates within the Top10 until three satisfy the same eligibility rule used by ShareEn, or all ten have been tried. Background-only and failed retrievals continue to the next candidate; optional media failures preserve usable reporting. Log progress and explain any final shortfall.

**Tech stack:** TypeScript, Next.js, existing research and ShareEn services.

**Scope:** This chat's approved fix to the prematurely truncated research shortlist. Existing saved editions remain unchanged; no automatic regeneration or new source integrations.

## Task: Backfill daily highlights

- [x] Add regressions for background-only candidates, retrieval exceptions, exhausted Top10, optional media failures and already supported stories.
- [x] Run the focused test and confirm the missing backfill behavior fails.
- [x] Share the eligibility predicate between daily reporting and ShareEn; replace the three-attempt shortlist with a bounded Top10 scan targeting three supported stories.
- [x] Document the candidate budget and shortfall logs.
- [x] Run relevant research/editorial tests, TypeScript, lint and build; skip the full suite per user instruction.
- [x] Independently review the diff before release.

Validation: 36 focused tests pass; TypeScript and production build pass; lint has no errors and one preexisting image warning. Release verification of the exact pushed revision is reported in the chat.
