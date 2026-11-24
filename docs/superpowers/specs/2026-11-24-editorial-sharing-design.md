# Bilingual editorial sharing

The user's approved direction is an English-first account explaining daily Chinese
internet attention, while serving its existing Chinese readership. The requested
cadence is one English four-image daily post plus 2–3 single stories from today or
yesterday, each with separately localized English and Chinese materials. This
request explicitly says to start; routine design decisions below are delegated.

## Approach

Extend the existing authenticated admin, background jobs, saved drafts and browser
PNG/ZIP exports. A separate publishing system would duplicate these protections;
editing public pages would expose authoring controls. Continue in the current
feature checkout because its uncommitted comment expansion is a required input.
Preserve that work. Do not post to X or deploy as part of this change.

## User flows

- Hourly item details and saved daily item details gain a single-story share action.
  It opens a bilingual editor for that exact saved source version.
- Sharing workspace gains a today/yesterday editorial shortlist, separately ranked
  for English and Chinese readers with transparent reasons and limitations. It
  recommends 2–3 distinct topics; these are editorial estimates, not viral forecasts.
- Single-story generation produces localized copy, distinct candidate hooks,
  follow-up/source replies, alt text, a branded card for each language, source text,
  and a downloadable package. Users can edit, save, reload and regenerate explicitly.
- Three real series are exposed: Inside China's Internet, In Their Words, and
  China Tech, in Context, with corresponding Chinese labels. In Their Words needs
  genuine usable comment evidence; no invented quotations or forced opposing side.
- The daily English package uses an editorial opener plus up to three selected
  stories. With three eligible stories it is exactly four images; sparse sources
  are never padded with invented stories. Existing saved legacy packages still work.

## Evidence and safety

All source identity, links, original quotations and like counts are server-owned.
AI uses only saved material, distinguishes fact from interpretation, keeps uncertainty
and translates culture with context. No new scraping during preview/export, no
fabricated X metrics, population percentages, controversy, prices or historical facts.
No sample-time row. Existing real comment cats remain available when appropriate.

Generated topic shares are stored separately from source reports/snapshots with a
frozen evidence copy, generation fencing and optimistic revision checks. Old jobs
must not overwrite newer edits or source revisions. Reads and recommendations never
invoke paid AI. Existing admin auth/same-origin and single-job exclusivity apply.

## Research practice

Use public original X examples and official guidance when accessible. Record evidence
quality and missing engagement figures. Candidate copy patterns are experiments
(specific observation, source quote, contextual number, culture translation, update),
not algorithm guarantees. Paid-ad findings are not labeled organic growth evidence.

## Verification

Tests cover bilingual validation, unavailable evidence, stale edits/jobs, safe URLs,
explicit generation, archived/hourly/daily source identity, recommendations from the
requested two-day window, duplicate topics, captions and export consistency. Verify
admin interaction and PNG/ZIP rendering in desktop and mobile browser sizes. Run
full tests, typecheck, lint, production build, and independent review.
