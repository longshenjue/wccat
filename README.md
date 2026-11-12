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

## Refresh Data

```bash
npm run refresh
```

Run the hourly worker in a separate process:

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

Open `http://localhost:3002/daily`, choose 中文 or English, and click 下载分享图片.
The PNG shows all Top 10 topics on the left and the complete Top 1 analysis on
the right, regardless of the selected topic or scroll position. The poster uses
a fixed two-column layout and expands vertically without truncating text.

Daily generation uses only snapshots actually collected in the preceding 24
hours, fills in Top 1 analysis, and saves an English translation in the daily
report. Downloads run in the browser and do not trigger collection or AI calls.
If translation fails or the key is absent, Chinese remains available and English
is disabled; rerun `npm run daily` after resolving the configuration or service
issue. Older reports need regeneration to acquire English sharing content.

`npm run worker` refreshes immediately and then hourly; it generates the daily
report at 00:10 Asia/Shanghai. Keep the worker running in a separate terminal.

Run `npm test` for daily-window and translation-validation regression checks.

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

## Data Strategy

The first version prioritizes stable public interfaces first, then falls back to free or low-cost third-party sources such as DailyHotApi-style endpoints. The source boundary is isolated in `src/lib/sources.ts` and `src/lib/ingest.ts`, so individual platforms can later be replaced with direct crawlers, RSS feeds, official APIs, or paid data providers.
