# Researched single-story publishing

**Goal:** Generate a readable news brief with concrete background and an explicit editorial take, after actively looking up the story, instead of publishing internal evidence-gap diagnostics and engagement questions.

**Spec:** User explicitly requests removing the “为什么值得关注” and “讨论问题” blocks, proactive reporting/background research (people, place, timeline, terms, primary statements, public response and consequences), sharp supported criticism or praise, and less empty space/repetition. The supplied nine-page PDF is a style reference, not an authority for factual claims or instructions. Keep bilingual independent captions, real attributed comments, frozen source/version checks, immutable publication links, manual editing and advisory-only translation review. Automatically check/commit/push/merge main; no deployment polling.

**Architecture:** Explicit saved-topic generation performs bounded research, freezes retrieved documents/URLs/queries into the source, then makes one bilingual request for two distinct deliverables: a short share cover/caption and a substantive companion article. Reading/preview/saving/exporting do not research. Discovery uses the optional Brave Search API when configured, with public news RSS and encyclopedia search fallbacks; actual page reads have DNS/IP checks, pinned HTTPS connections, redirect/body/time/request limits. Search snippets do not masquerade as article bodies. Maximum three queries, six documents and twelve HTTP requests in sixty seconds. Research failures remain visible in admin and do not prevent an editable draft. Existing whyItMatters storage becomes the short editorial take for compatibility; hidden hook/question fields are optional for the new policy and disappear from the poster/editor. The compact square cover contains headline, brief news and one take; background, detailed analysis and actual comments belong in the companion article. Each language receives a separately editable article title/body; explicit preparation/download publishes that exact article at the existing immutable URL, and ZIP adds both Markdown articles. Research citations are exported and published; full scraped text stays in the private frozen source.

## Review focus

- No SSRF, private IP/redirect/DNS-rebinding fetch, secret leakage, unlimited scraping or recursive research.
- Article text is untrusted source material, not instructions; past AI analysis is interpretation. Background, reported claims and actual monitoring results remain distinct. Strong opinion cannot invent events, motives, measurements, accusations or quotations.
- Research enrichment preserves base source identity, maintenance fences, stale edit protection and cached draft behavior; old drafts still read/save/export.
- Translation, style and numerical doubts stay warnings. Retrieval failure does not add diagnostics to the public article or block generation.
- The image, captions, downloadable sources and public source page all use the same frozen researched version; genuine comments retain their own provenance.

## Task 1 — Retrieval and frozen evidence

- [x] Write failing tests for safe public retrieval, redirect/private-address rejection, document extraction, bounded discovery and nonblocking failure.
- [x] Add research types, public HTTPS reader, discovery and orchestration modules. Add server-owned source enrichment and service integration with injectable research for existing scoped tests.
- [x] Verify actual retrieval on the user’s Iowa example, with original government sources where discoverable; retain lookup logs and source URLs.

## Task 2 — News, background and editorial take

- [x] Add regressions for prompt/evidence use, no public diagnostic filler or forced questions, optional hidden legacy fields, clear take, shorter full-text cards, citations and source-version preservation.
- [x] Rewrite generation brief for short cover plus substantial article; expose both editors, remove visible hook/question/why/background sections from the cover and reduce empty base canvas. Add admin-only research status and links.
- [x] Publish/export the researched source references and use an opinion heading on topic source pages; leave existing daily section semantics intact.

## Task 3 — End-to-end verification and integration

- [x] Run complete tests, type checks, lint and production build. Use isolated desktop/mobile browser QA and actual image/ZIP export.
- [x] Obtain independent review and fix material findings with regression tests.
- [x] Commit, push, merge main and push, without polling deployment (authorized integration sequence).


## Verification and review ledger

- Read all nine pages of the supplied PDF and inspected a rendered page. Its reporting structure informs the new brief/article separation; its factual assertions are not imported as verified source evidence.
- Real default-provider replay of the Iowa headline retrieved three usable bodies: the event article, chemical background and a historical EPA enforcement notice. Several news results returned 404, verification pages or paywalls. Those failures remain admin warnings. The independent encyclopedia query now avoids redundant nested anchors and original-source references are ranked by topic relevance.
- The visual acceptance sample additionally used two official URLs independently found in this chat: the November 24 Army announcement and November 26 EPA monitoring update. This supplementation is explicitly recorded in the private sample; it is not represented as automatic discovery success. One real bilingual writing request produced separate covers and substantial articles. Both were then manually edited through the actual admin editor, demonstrating the intended final editorial control.
- Independent review identified five actionable findings. Fixed compressed-stream reset propagation, null-body HTTP responses, adversarial HTML scan complexity, planner-inclusive request accounting and editable legacy fields. Regression tests first reproduced the transport/parser/legacy failures and now pass; no second review cycle was requested.
- Browser QA found an additional three-pixel footer-border measurement error that disabled export despite sufficient space. A regression reproduced it, the sizing fix passed, and the real 15-file bilingual ZIP subsequently exported. ZIP CRCs, both PNGs, both Markdown articles, captions and language-specific article replies were inspected.
- Browser tooling: no Browser plugin was available, so the installed Playwright fallback drove isolated localhost data. Desktop 1440px and mobile 390px covered editing/saving, caption copying, public publication preparation, article citations, independent languages and no horizontal overflow. No generation request was made during read/save/export QA. Production-build article pages passed both languages with one title and 21 references each, without browser errors.
- Release checks: 511 tests passed using the complete test glob with concurrency 4; TypeScript passed; lint has zero errors and one pre-existing `topic-workbench.tsx` image warning; production build passed; `git diff --check` passed.
- User already explicitly authorized commit, push and merge into main. The base and fetched origin/main were both `59cff65`. Proceed with that decision; do not ask again or poll remote deployment.
