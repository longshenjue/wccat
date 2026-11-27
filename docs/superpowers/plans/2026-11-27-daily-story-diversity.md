# Daily story diversity repair

**Goal:** A daily edition covers ten distinct news storylines where material permits, instead of spending multiple slots and all detail cards on one running story.

**Spec:** The user's November 26 screenshot has three Cai Lei headlines and all three detail selections on that storyline. Preserve their earlier requirement: different developments are not duplicate facts. Keep platform-tier-v3 scoring, full Top10, bilingual cards, editable captions, immutable publication pages and translation-warning-only single-topic generation.

**Architecture:** Keep strict hourly/fact deduplication. Build the full scored daily candidate pool, then use one bounded editorial classification of the first 40 candidates to group developments of a specifically shared news storyline. Select one existing leading fact per storyline and refill from the full pool. Preserve grouped facts, their individual scores, analyses and source links as related developments. This is presentation grouping, not a claim that those facts are equivalent; group scores never add together. No person/company/keyword exclusion lists. Unknown, overlapping or invalid model IDs reject the classification and produce an explicit warning plus the ordinary ranking fallback. No retry, no additional scraping. New daily inputs naturally prevent detail cards from selecting the three nested developments as separate stories.

**Review focus:** A shared person or company with independent events must remain separate; denial/correction and reported claims retain their distinct original wording and links; candidate refill precedes Top10 truncation; malformed classification cannot erase source facts or increase scores; unavailable classification cannot block downloads or affect old published source pages.

## Task 1: Story selection and bounded classification

- [x] Write and observe failing tests for full-pool refill, preserved stages/scores, unrelated same-person stories, invalid IDs, bounded requests and nonblocking failure.
- [x] Add pure `daily-story-selection.ts` and server `daily-story-planner.ts`; export the untruncated candidate builder from `daily-report.ts` and integrate planning before daily draft/translation generation.
- [x] Verify focused regressions and replay all six public November 26 samples, using one real bounded classification to inspect the actual selection.

## Task 2: Preserve related developments throughout publishing

- [x] Add regression checks that daily UI, single-topic source material, daily bilingual evidence and public source pages retain grouped developments without borrowing their comment attitudes.
- [x] Show related stages in daily reader and public source pages; include them in saved single-topic background and daily generation evidence. Preserve individual source titles and source identity.
- [x] Verify both languages still use the same ten story IDs and three distinct detail IDs; old draft/publication shapes remain valid.

## Task 3: Verification and integration

- [x] Run full tests, TypeScript, lint, production build and focused browser QA using isolated data.
- [x] Obtain independent code review and resolve material findings.
- [x] Commit, push, merge into main and push, per standing authorization; do not poll deployment status.

Execution: native implementation in the current clean feature branch. This repairs the documented daily selection behavior; no additional user approval ceremony is needed for the authorized fixes.

Verification: 495/495 tests passed with the normal npm test command; TypeScript/build passed; lint has zero errors and the existing topic-workbench image warning. An earlier simultaneous heavy check run exposed the existing service-supervisor timing assertion; the later isolated complete run passed. Independent review found two Important issues, both reproduced RED then fixed GREEN: grouped-stage evidence is now labelled and usable by the support gate/native cards, and single-topic sources preserve the 48-link grouping bound instead of truncating at 20. No deferred review findings.

Actual-data replay: six public samples contain 4,577 source records and rebuild 2,142 distinct fact candidates. One real bounded classification grouped four Cai Lei variants and three immediate mission angles; ten daily entries were still selected. Public samples reconstruct a subset of saved analysis/raw comparison data, so this is selection verification rather than an assertion of byte-identical historical scores.

Browser QA: Browser plugin not available, existing Playwright runtime used. Isolated desktop 1440px/mobile 390px daily reader, expandable stages, bilingual public source pages and admin eight-image ZIP export passed without page errors or horizontal document overflow. ZIP CRC passed, all eight PNGs were 1200×1500 in the fixture, and both source TXT files retained the grouped developments. No production data was rewritten. Old drafts/publications require explicit daily regeneration to use the new editorial selection.
