# Current news, complete share assets and concise prompts

> Execution: implement inline with regression tests and one final independent review.

**Goal:** Generate current, concrete X news packages with a real relevant image and attributed reader comments, without public evidence-gap filler or stale background masquerading as breaking news.

**Spec:** This chat's latest user instructions supersede the previous decision to remove comments from covers. Restore attitude/comment material, actively seek missing images and comments, search current Chinese and international reporting including Google, and rewrite the entire news prompt family instead of appending more patches. Keep short covers separate from full companion articles. Translation/grammar doubts remain admin warnings. Previously authorized commit/push/merge main applies; do not poll deployment.

**Architecture:** One compact shared newsroom policy plus task-specific output contracts, used by hourly analysis, daily drafts, daily English cards and bilingual topic writing. Explicit generation performs bounded current-event discovery in both languages; event sources and dated historical background are separate. Public Google News and regional news discovery are best-effort providers, not browser-only promises. Source images and discovered supported comment threads are server-owned frozen evidence; model output never invents them. Cover layout shows original image, news, concise take and available sourced attitudes/comments. Missing required assets leave an editable draft and an explicit admin readiness status, rather than silently producing a complete publication.

## Constraints and review focus

- Never invent photographs, quotes, identities, likes, market prices or an event date. A retrieval date does not establish an article's publication date.
- Do not overwrite immutable existing public pages or human edits. Apply changes to explicit regeneration and new publications.
- Reads/previews/saves/exports do not initiate news/comment research. Cached image bytes may be read locally.
- Current-event sources precede background; do not replace a failed news query with Wikipedia or accept a broad shared entity as proof of this event.
- Keep safe HTTPS/DNS pinning, decoded-body/redirect/time/request limits and comment first-page quotas. Do not bypass verification/paywall/rate-limit failures.
- Public diagnostic phrases such as “但缺具体数据佐证 / 现有材料没有…” must not survive generated captions, covers, articles or daily copy. Research failures belong in admin.

## Tasks

1. [x] Replace scattered prompts with `src/lib/newsroom/prompts.ts`: shared policy and separate analysis, daily, English-card, topic and query-planner contracts. Regression-test actual request payloads and conflict-free brevity; keep schema/version compatibility.
2. [x] Improve `topic-sharing/research`: dated Chinese/international news discovery with Google News fallback, event/background separation and source relevance. Preserve source date, original image metadata and discovered comment-thread candidates. Test the actual stale Stock Connect failure and request caps.
3. [x] Add bounded source-image preparation and source-owned single-topic comment enrichment independent of old AI-analysis availability. Attempt alternate supported threads after failures, keep provenance, and retain real comments even when the classifier cannot match an old artificial red/blue dichotomy. Test real bytes/URLs and failure readiness.
4. [x] Restore picture and sourced attitudes/comments to the new cover; display admin asset readiness, retain independent article editing and export original asset attribution. Verify both languages, no ellipses, phone layout, actual PNG/ZIP and article citation flow.
5. [x] Run full suite, types, lint, production build and live current-news replay; obtain independent review and fix material findings. Release follows the already authorized commit/push/merge-main workflow; do not poll remote deployment.

## Initial evidence

- Failed public page `59b0de57a0c7a53e8e9d0b31` cites only the Stock Connect encyclopedia and substitutes 2014–2020 background for a 2026-11-27 rally.
- Google browser search found and verified Sina/e公司's 2026-11-27 14:10 report `doc-inkaczqn5628056`, with actual intraday index changes. International dated reporting also exists.
- Current research replaces a second event query with encyclopedia search and accepts any one broad anchor. Current covers explicitly suppress all comments and never render a photograph. Single-topic comment capture requires pre-existing analysis and only inspects original links, often search pages.
- Existing hourly prompt explicitly teaches “从现有榜单信号看”; daily prompts promote attention abstractions; current topic prompt is much longer and contradicts upstream behavior. These are root causes to replace, not patch with another paragraph.

## Verification and independent review

- Shared reporting policy is used by hourly analysis, daily writing, daily English cards, single-topic bilingual writing and research planning. Public diagnostic cleanup is generation-only; original quotations and human edits are preserved.
- One independent review found date/relevance, daily eligibility, image attribution, quote export and regeneration-fallback defects. Each was reproduced before its fix. The final tests cover edition-relative verified publication dates, unrelated Brazil/U.S. market articles, matching writer/repair/validator eligibility with legacy compatibility, exact image occurrence provenance, neutral observations in ALT/sources/canvas, and same-source asset retention. The v1 misleading empty-comment announcement was also reproduced and removed; real old comments remain available.
- A live model response contained malformed JSON despite JSON mode. A separate compact serialization contract now permits one syntax-only repair; it cannot be triggered by translation, numbers, language, length or opinion warnings. Both a failed envelope and unchanged mixed-language wording have regression coverage.
- Real automatic replay, starting only from the hot-search title and original Weibo search URL, found two dated Tencent news bodies on 2026-11-27, saved the publisher's 330×330 illustration, and retrieved original comment `qq-news:7532014236337559055` from `https://new.qq.com/rain/a/20261127A0CXFH00`. The untranslated original and collected timestamp are retained. No like count was supplied, so none is invented. Earlier zero-comment articles and blocked Sina requests were real failures, not evidence of no discussion anywhere.
- Real bilingual writing completed, including the syntax-only recovery, with `ready: true`. Editorial warnings remain visible in admin. The stock-market sample is a draft for the account owner to judge, not an automatically posted or independently certified report.
- Local UI flow: authenticated editor → English/Chinese switch → source image and actual quote → PNG → bilingual ZIP → long-text save → public daily view. Desktop 1440×1000 and mobile 390×844; no page/console errors, no framework error overlay. A fourfold-length summary expanded from 1440 to 2296px with zero clipping. ZIP includes two PNGs, captions, independent articles, source/quote provenance, ALT and public-page replies. Early synthetic layout fixtures were replaced by the real automatic source for the final run.
- Public daily serialization omits private research bodies, queries and warning lists recursively; public publication payloads whitelist reader material and original citations. Existing public pages stay immutable.
- Final full suite: 532/532; TypeScript: zero errors; ESLint: zero errors and one existing img warning; production build: exit 0. An unrelated 400ms service-startup test was flaky under full CPU concurrency; the final whole suite passed with two test workers without modifying that test. Default Turbopack cannot follow the managed worktree's external dependency symlink; production compilation is verified with Next's supported `--webpack` option. No dependency or deployment configuration change is required.

## Operational bounds

Research: at most three queries, 20 counted HTTP/planner requests, nine publisher attempts / six saved bodies and 60 seconds. Empty original comment threads trigger only one focused alternate-discussion discovery (eight requests / three verified pages). Comment collection: at most six unique threads total, first page only, up to 20 per thread and 40 retained observations, sharing the existing daily network quota and caches. Image acquisition checks up to three candidates, validates public HTTPS/DNS and decoded image size, and freezes WebP bytes ≤512KB. Missing required event coverage/image/original comments leaves an editable draft and explicit pending status. Translation remains advisory. Upstream pages can still be unavailable or empty; no verification/paywall/rate-limit bypass is attempted.
