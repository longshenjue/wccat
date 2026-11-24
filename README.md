# WcCAT

**What Chinese Care About Today** is a daily attention radar for the Chinese internet.

WcCAT is not just a hot-search aggregator. It tries to answer: what are Chinese internet users paying attention to today, and where are the emotions, conflicts, interests, and consensus?

## MVP Scope

- Third-party hot-list sources first, own crawlers later.
- Daily snapshots stored in a local SQLite database at `data/wccat.sqlite`.
- Unified ranking across sources like Weibo, Baidu, Zhihu, Bilibili, The Paper, and Toutiao.
- Heuristic heat scoring with platform weights, rank position, cross-platform overlap, and official/public resonance.
- DeepSeek-powered daily overviews, topic analysis, and daily report drafts. Without `DEEPSEEK_API_KEY`, WcCAT falls back to local summaries, rules, and templates.
- Discord-inspired dashboard with source navigation, daily ranking, topic detail, source links, and archive support.

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `DEEPSEEK_API_KEY` in `.env.local` to enable AI. All text generation uses
`DEEPSEEK_MODEL` (default: `deepseek-flash`) via DeepSeek's Chat Completions API.

Open `http://localhost:3002`. Both `npm run dev` and `npm run start` use port 3002.

## Northflank Deployment

Follow [the Northflank deployment guide](docs/deploy-northflank.md) for exact
dashboard settings, private API networking, the SQLite volume, runtime secrets,
health checks, and first-time report generation. The Docker image starts both
the production web server and four-hour worker through `npm run start:cloud`.
Deploy one WcCAT instance and mount persistent storage at `/app/data`.

## Refresh Data

```bash
npm run refresh
```

Run the four-hour worker in a separate process:

```bash
npm run worker
```

Check which source interfaces are currently returning data:

```bash
npm run check:sources
```

If an AI request fails, the topic displays `Local rules` as a temporary fallback.
Retry analysis of the stored top three topics without collecting new rankings:

```bash
npm run analyze -- top=3
npm run ai:logs -- limit=10
```

Successful stored analyses are skipped. Local fallbacks are retried when a
DeepSeek key is configured. Blank, truncated, malformed JSON or incomplete AI
responses receive one automatic retry (two attempts total). Failed response
content and the exact error are recorded in the AI logs.

Refresh is available only through the local CLI (`refresh`, `sync`, or `worker`).
The public `/api/refresh` endpoint is disabled to prevent visitors from triggering
unlimited collection and AI generation.

## Daily Report and Share Images

```bash
npm run refresh
npm run daily
```

Open `/admin` → 分享制作 to preview and download Chinese/English long images or the
branded ShareEn multi-card ZIP. Public `/daily` is for reading only. Daily generation
saves the ordinary English translation and ShareEn copy, then prepares up to three
selected photos. Each photo uses a protected 1072×360 crop or a 400×480 full-image
layout. The processed WebP files travel with the SQLite daily archive. In 分享制作,
**补齐配图** prepares photos for older reports, and **重新处理配图** refreshes one
selected photo. Previews and downloads reuse saved images without calling AI.

ShareEn includes the original Top10, 2–3 overseas-relevant deep dives and branded
English captions with numbered summaries matching those focus cards in order.
Daily generation also checks and repairs missing emotional opposition text. Failed
regeneration preserves existing usable sharing copy. For an older report:

```bash
npm run daily:shareen -- 2026-11-15
npm run daily:shareen -- 2026-11-15 --force
```

Ordinary English backfill remains `npm run daily:translate -- YYYY-MM-DD`.
See [admin sharing](docs/admin-sharing.md) for date selection, regeneration,
cache behavior and downloads.

`npm run worker` refreshes immediately, then at 00:00/04:00/08:00/12:00/16:00/20:00
Asia/Shanghai (six scheduled refreshes per day); it generates the daily
report at 02:00 Asia/Shanghai, covering the preceding 02:00–02:00 window.
Manual `npm run daily` also uses the latest completed 02:00 cutoff, not a rolling window.
Reports are dated by the content day: the November 13 report covers November 13 02:00 through November 14 02:00 and is generated at November 14 02:00 (Asia/Shanghai).
Daily topic persistence is shown as sample counts, not elapsed hours. Keep the worker running in a separate terminal.
Restarts still trigger one immediate refresh; manual refresh/analyze commands
remain explicit operations. English share validation retries once for invalid
JSON, missing/untranslated content or changed identities. Numerical, ratio and
date checks are advisory: differences are logged as accepted INFO notices and
do not trigger retries or disable downloads. Equivalent Chinese/English number
expressions are normalized first to reduce false notices. Authentication and
network failures do not retry. See [translation validation](docs/translation-validation.md).

Run `npm test` for daily-window and translation-validation regression checks.

## Administrator data archives

The long-term evidence library records source responses, document revisions,
interaction observations and provider-specific search results in SQLite. Use
`npm run evidence -- stats`, `npm run evidence -- backup`, and explicit
`npm run evidence -- backfill --limit=5` for inspection, complete backups and
historical backfill. See [evidence storage and recovery](docs/evidence-library.md)
and [free source onboarding](docs/free-data-source-setup.md).
Existing monthly full/daily archives contain the legacy six business tables;
use the new complete backup command to include long-term evidence.

Follow [administrator setup and archive recovery](docs/admin-data-archives.md).
Run `npm run admin:password` to generate runtime administrator secrets, then
visit `/admin`. The authenticated dashboard previews date ranges, exports full
or daily-only monthly SQLite archives, and deliberately clears old hourly data
while retaining all generated daily reports. No scheduled deletion is enabled.
Use `npm run storage:prepare` for an older database's first-time space-reclaim
setup, and `npm run archives:register -- <archive.sqlite.gz> ...` to recover
portable archives on another deployment.

## Source Check (2026-11-12)

The local DailyHotApi checkout matches upstream `36c77e3` (2026-03-11). No newer
upstream fixes were available at the time of checking. All 18 enabled WcCAT
sources and their DailyHotApi endpoints returned nonempty data in this local
network test. This is a point-in-time check, not a guarantee across deployment
IPs, cookies, or future website changes. Nonempty lists can contain pinned or
older posts, notably on community sites such as NGA.

`/xiaohongshu`, `/cctv`, and `/xinhua` returned 404; they are not supported endpoints
of this checkout. Anti-crawling issues remain open upstream, including
[Weibo 403](https://github.com/imsyy/DailyHotApi/issues/118),
[Douyin cookie failure](https://github.com/imsyy/DailyHotApi/issues/126), and
[Zhihu 401](https://github.com/imsyy/DailyHotApi/issues/105).

## Sampled comment examples

Hourly analyses, daily reports, bilingual long posters and ShareEn can show one
actual comment per red/blue attitude beneath the analysis. Cats are editorial
attitude markers, not user avatars. Like counts and sample times are observed
data; the sample is not a poll and does not determine the AI energy scores.

Collection runs with `refresh`/`analyze` and current daily generation. Defaults:
top 10 topics (configurable up to 20), two supported threads per topic, 20 root
comments per thread, one page and no nested replies. A persistent hard cap of 100
requests per Beijing day includes BV-to-AV lookups. Successful and empty samples
cache for four hours; failures cool down 30 minutes, or six hours for access and
rate-limit failures. Each request has a seven-second timeout and 512 KiB cap.

Adapters recognize Bilibili AV/BV videos (including explicit `b23.tv/BV…` links),
Zhihu questions/answers and numeric Weibo post URLs. Search/hot-topic pages,
opaque short links and other platforms are skipped rather than guessed. Public
interfaces may reject deployment IPs or require login; unavailable sections hide
without affecting the analysis. No account cookies are collected or required.
Only known sampled IDs can become quotes. Uncertain/missing sides stay absent.
English quotes require an available translation and are labeled as AI translations;
longer comments translate a literal server-selected source excerpt, never a model
summary. Excerpts are labeled; full originals remain in saved evidence and ZIP sources.

Set `WCCAT_COMMENTS_ENABLED=false` to disable new collection. Use
`WCCAT_COMMENT_TOPICS` for coverage and `WCCAT_COMMENT_DAILY_LIMIT` to lower the hard
cap. Missing `DEEPSEEK_API_KEY` skips sampling because reliable classification is
unavailable. Existing historical reports remain frozen; regenerate a current daily
report to include new samples. Rendering/downloading never fetch comments or
invoke AI. ShareEn focus cards with English quotes use a measured 1200 × 1900–2200
canvas; cards without them retain 1200 × 1500. Excerpts are labeled; full original
text, translation, IDs and provenance are included in `sources.txt`.

## Data Strategy

TianAPI integration supports the six authorized hotlists via the server-only `TIANAPI_KEY` Runtime Secret. Four canonical platform feeds prefer TianAPI with the existing fallback chain; aggregate and Tencent ecosystem feeds add auditable AI context without extra ranking bonuses. Persistent caching and per-endpoint Beijing-day limits protect the free quota. See [configuration and diagnostics](docs/tianapi.md); `npm run tianapi -- status` is local-only and `npm run tianapi -- check` validates the configured account.

The first version prioritizes stable public interfaces first, then falls back to free or low-cost third-party sources such as DailyHotApi-style endpoints. The source boundary is isolated in `src/lib/sources.ts` and `src/lib/ingest.ts`, so individual platforms can later be replaced with direct crawlers, RSS feeds, official APIs, or paid data providers.
