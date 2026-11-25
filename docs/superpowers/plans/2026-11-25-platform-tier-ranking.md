# Platform tier ranking implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each platform a hard contribution ceiling and use engagement only for relative ranking within that platform.

**Architecture:** A shared platform scorer assigns bounded strengths from source rank, heat and comparable engagement percentiles. Hourly topics sum one maximum per platform; daily topics recompute against each saved snapshot's full source pool, then combine peak and coverage inside each platform's ceiling.

**Tech Stack:** Existing TypeScript, Node test runner, SQLite snapshots; no new dependencies or collection requests.

**Spec:** User's 2026-11-25 tier/within-platform ranking direction; detailed policy and dated scale evidence in `docs/daily-ranking.md`.

## Global constraints

- Initial S/A/B/C/D ceilings: 500/400/300/200/100. User follow-up assigns Zhihu to S and Douyin to B for editorial relevance. Unverified reach classifications are explicitly provisional, never invented MAUs.
- Likes, comments, plays and danmaku only compete within the same source and capture, never as absolute cross-platform bonuses.
- Unknown/invalid rank evidence cannot score. Historical Weibo rank zero remains first place; eligible source ranks 1–50.
- Missing metrics are unavailable, not zero. Percentiles require at least five unique items, 60% field coverage and varying values.
- Platform aliases, repeated posts and manual captures cannot multiply the platform ceiling.
- Preserve existing saved reports/drafts until explicitly regenerated. No network/AI/DB writes for offline replay.
- Supersede the unshipped cross-platform-v2 exclusion/fallback policy; single-platform stories compete under their caps.

## Review focus

- Duplicate provider items with different metric completeness must share one score and one percentile observation.
- Platform-wide collection gaps must not be interpreted as zero engagement.
- Archived platformScore/heatScore must not leak into new daily scores.
- New captures in one four-hour block must not multiply persistence.
- Rich Bilibili fields and alias statistics must not create extra score budget.

### Task 1: Shared platform scoring and hourly integration

**Files:** Create `src/lib/platform-ranking.ts`, `tests/platform-ranking.test.ts`, `tests/platform-ranking-ingest.test.ts`; modify `src/lib/ranking.ts`, `src/lib/types.ts` and `src/lib/ingest.ts`.

**Interfaces:** `platformPolicy(sourceId)`, `platformItemKey(item)`, `platformRank(item)`, `scorePlatformItems(items): TopicOccurrence[]`. Optional occurrence evidence records cap, tier and component strengths.

- [x] Write and observe failing tests for hard ceilings, relative scaling invariance, valid/missing/tied metrics, aliases and within-platform engagement ordering.
- [x] Implement scorer: rank/heat/engagement weight 60/10/30, renormalizing available components. Equalize engagement groups (audience/reaction/discussion) rather than rewarding field count.
- [x] Replace hourly additive bonuses and ceiling escapes with maximum contribution per source; run focused tests.

### Task 2: Daily aggregation and replay

**Files:** Modify `src/lib/daily-ranking.ts`, `src/lib/daily-report.ts`, `tests/daily-ranking.test.ts`, `tests/daily-ranking-generation.test.ts`, `docs/daily-ranking.md`.

**Interfaces:** Daily scoring consumes `{snapshotDate, occurrence}` observations and per-source available coverage slots. Evidence stores policy, per-source cap, peak, average, coverage and contribution.

- [x] Write and observe failing tests for bounded day persistence, old-score isolation, duplicate blocks, source outages and permitted solo content.
- [x] Rescore every full saved source pool; contribution = cap × (0.7 × peak strength + 0.3 × mean strength across source-available four-hour slots). Select by summed contribution without platform quotas.
- [x] Run focused tests; replay the eight saved public captures and report platform counts without endorsing their headlines.
- [x] Update policy, complete platform table, provisional classifications and dated primary references.
- [x] Run full tests, TypeScript, lint and build. Obtain fresh code review and resolve material findings. Leave commit/push for user's instruction.
