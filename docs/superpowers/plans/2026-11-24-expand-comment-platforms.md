# Expand verified comment sources

The user requested a platform-by-platform live check and integration of every
obtainable source. Work is on `codex/expand-comment-platforms`.

1. Audit all 21 catalog platforms using actual source URLs and official public
   interfaces. Start with 100 bounded requests (103 ultimately used after a
   three-request Toutiao discovery extension); no pagination, login or
   nested-reply requests. Record successful bodies separately from empty samples,
   blocked access and unresolved original-post mappings.
2. Add tested adapters for verified community, news and technology sources.
   Preserve original-post identity, observed likes and literal comment text.
   Read article metadata only when needed; construct API URLs from validated
   identifiers on fixed hosts. Do not execute embedded scripts.
3. Share the existing daily request budget across metadata, POSTs and optional
   empty-hot-list fallbacks. Keep two source threads/topic and at most 20 selected
   comments/thread. Cache successes/empty results and cool down failures.
4. Carry new sources through the existing hourly/daily/share views. Keep missing
   comments hidden and retain the user's removal of the sample-time row.
5. Run regression tests, typecheck, lint, production build and independent review.
   Save the complete audit matrix with exact limitations for the user.

Independent modules are implemented in parallel: community.ts, news.ts, tech.ts.
The primary agent owns shared types, collector integration and presentation.

Completed: all 21 platforms audited; 11 returned real text, including the existing
Bilibili adapter and 10 newly integrated sources. See the complete audit in
`docs/comment-source-audit-2026-11-24.md`. Root and provider tests were observed
failing before implementation. Independent review found three issues (QQ nested
single-item chains, Huxiu ownership checks, short tech comments); each was fixed
with a regression test. The later Toutiao streaming integration passed a second
independent review, including split UTF-8, exhausted quota and hostile-host cases.

Final verification: `npm test` 334/334; `npx tsc --noEmit --incremental false`
passed; `npm run build` passed; `npm run lint` zero errors with the pre-existing
topic-workbench image warning; `git diff --check` passed. Presentation tests cover
all new platform attributions and absence of the removed sample timestamp row.
No production database mutation, deployment, commit or push was performed.
