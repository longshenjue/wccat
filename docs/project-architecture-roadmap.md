# WcCAT 项目架构、产品设计与开发路线

最后更新：2026-11-12

本文档用于记录 WcCAT 的产品目标、技术架构、数据源状态、开发路线和维护约定。后续每完成一个新功能，都需要同步更新本文档中的相关章节，确保项目状态、路线和实现事实保持一致。

## 1. 项目定位

WcCAT 是 **What Chinese Care About Today** 的缩写，目标是做一个面向外国人的中文互联网热点观察站。

它不只是热搜聚合，而是试图回答：

> 今天中文互联网的注意力、情绪、冲突、兴趣和共识在哪里？

第一版暂不做国际化翻译，优先用中文信息、图文、摘要、榜单和外链展示中文互联网每天正在发生的讨论。

## 2. 产品设计

### 2.1 产品语气

当前产品语气是 **文化雷达 + 数据看板**。

核心不是简单罗列热榜，而是把不同平台的热点放在同一个观察框架里，让用户看到：

- 大众正在搜索什么。
- 社交平台正在争论什么。
- 视频平台正在传播什么。
- 新闻媒体正在强调什么。
- 社区论坛正在调侃、站队或深聊什么。
- 官方叙事和民间讨论是否形成共振。

### 2.2 页面形态

当前页面是一个三栏式桌面仪表盘：

- 左侧：品牌、来源筛选、历史归档。
- 中间：当前小时热点榜单、摘要、跳转链接。
- 右侧：选中话题的 AI 分析卡，包括摘要、详细内容、红蓝观点能量条和平台态度矩阵。

新增 `/daily` 日报页面沿用三栏式桌面布局：

- 左侧：小时榜/日报模式切换、日报归档。
- 中间：过去 24 小时 Top 10 日榜，用于截图和选题复盘。
- 右侧：公众号文字稿、抖音/B 站视频口播稿，便于人工改稿和内容发布。

视觉方向当前是 **赛博二游情报面板**：

- `Wc` 使用红色，`CAT` 使用蓝色。
- 榜单卡片强调高密度阅读。
- 右侧分析卡片强调对抗观点、平台态度和滚动阅读。
- 平台来源使用不同颜色和标记，避免灰色通用样式。

### 2.3 核心用户流程

1. 用户打开首页。
2. 系统读取数据库中最新小时快照。
3. 用户浏览总榜，或在左侧按来源筛选。
4. 用户点击榜单话题。
5. 右侧展示该话题的预计算 AI 分析；如果尚未分析，则展示本地规则兜底。
6. 用户可点击每条话题下的平台链接跳转到原平台查看详情。

## 3. 技术架构

### 3.1 技术栈

- 前端框架：Next.js App Router。
- UI：React + TypeScript + 全局 CSS。
- 数据库：本地 SQLite，使用 `better-sqlite3`，数据文件位于 `data/wccat.sqlite`。
- 脚本运行：`tsx`。
- AI：DeepSeek Chat Completions API。
- 今日概览、话题分析和日报稿件统一使用 `DEEPSEEK_API_KEY` 与 `DEEPSEEK_MODEL`，默认模型为 `deepseek-flash`；缺少 Key 或调用失败时保留本地兜底。
- 定时任务：Node.js 长运行 worker，按整点调度。

### 3.2 关键目录

- `src/app/page.tsx`：首页服务端入口，读取快照和分析结果。
- `src/app/admin/page.tsx`：本地数据库管理后台，不在前台导航中展示。
- `src/app/api/admin/db/route.ts`：后台管理 API，白名单表的查询、新增、更新和删除。
- `src/components/admin-panel.tsx`：后台管理 UI，支持分页、搜索和 JSON 编辑。
- `src/components/topic-workbench.tsx`：核心客户端交互组件，处理选中话题和右侧分析展示。
- `src/app/globals.css`：全局主题、布局和赛博视觉样式。
- `src/lib/sources.ts`：信源配置、权重、分类、启用逻辑。
- `src/lib/ingest.ts`：各平台数据抓取和归一化。
- `src/lib/ranking.ts`：跨平台话题聚合和热度排序。
- `src/lib/precompute.ts`：AI 分析预计算流程。
- `src/lib/topic-analysis.ts`：DeepSeek 分析提示词、本地规则兜底、平台态度结构。
- AI 返回空白、截断、无效 JSON 或缺少必要字段时自动重试一次；失败日志保留原始响应内容与具体错误。`Local rules` 表示本地兜底，可用 `npm run analyze -- top=3` 补跑，成功分析会跳过。
- `src/lib/image-enrichment.ts`：话题图片补全，优先从原文页提取 OG 图/首图，失败后走 AI 生图兜底。
- `src/lib/ai-image.ts`：AI 生图 URL 构造模块，当前默认使用 Pollinations。
- `src/lib/daily-report.ts`：24 小时日报聚合、Top10 日榜计算、公众号稿和视频稿生成。
- `src/lib/db.ts`：SQLite schema、快照、原始条目、话题和 AI 分析日志。
- `src/lib/store.ts`：创建、保存、刷新和读取快照的编排层。
- `scripts/hourly-refresh.ts`：整点 worker。
- `scripts/sync.ts`：手动同步命令。
- `scripts/daily.ts`：手动生成 24 小时日报。
- `scripts/analyze.ts`：只补跑 AI 分析。
- `scripts/check-sources.ts`：检查信源可用性。
- `/Users/longshenjue/Documents/AI-project/DailyHotApi`：本机 DailyHotApi 源码，可作为第三方热榜聚合服务参考或必要时移植实现。

### 3.3 数据流

当前主链路如下：

1. `npm run worker` 或 `npm run sync` 触发刷新。
2. `store.ts` 调用 `getActiveSources()` 获取启用信源。
3. `ingest.ts` 抓取各平台原始热榜数据。
4. `ranking.ts` 归一化标题、合并相似话题，并综合基础信源权重、平台排名、热度值和互动统计量计算热度。
5. `image-enrichment.ts` 为 Top N 话题补图：热榜自带图优先，其次原文页图片，最后 AI 生图。
6. `db.ts` 保存小时快照、原始条目和聚合话题。
7. `precompute.ts` 对 Top N 话题执行 AI 预分析。
8. `topic-analysis.ts` 调 DeepSeek；失败或缺 key 时使用本地规则。
9. 首页读取最新快照和预分析结果，渲染榜单与分析卡片。

日报内容链路如下：

1. `npm run daily` 手动触发，或 `npm run worker` 在中国时区 00:10 自动触发。
2. `daily-report.ts` 读取截至当前小时的最近快照，并按真实采集时间过滤到最近 24 小时，避免停采断档时混入历史数据。
3. 按归一化标题合并 24 小时内重复话题。
4. 日榜分数综合最近热度、持续小时数、峰值排名和跨平台覆盖。
5. 取 Top 10 生成 `WccatDailyReport`。
6. DeepSeek 可用时生成公众号文字稿和抖音/B 站视频口播稿；不可用时使用本地模板兜底。
7. 补齐 Top1 完整分析，并通过 DeepSeek 生成英文分享文案，随日报缓存到 `daily_reports.payload.shareEnglish`；翻译失败时保留中文版。
8. `/daily` 读取日报并沿用现有布局展示 Top10 和稿件。
9. 日报页选择中文/English后下载 PNG，左侧完整 Top10，右侧固定 Top1 完整分析；图片在浏览器本地生成，不触发公开 AI 调用。旧日报没有英文缓存时禁用英文选项。

公开 `/api/refresh` 已移除（HTTP 404），数据刷新只通过 `npm run refresh`、`npm run sync` 或 `npm run worker` 执行。

2026-11-12 数据源复测：18个启用来源与对应本地 DailyHotApi 端点均返回非空数据；小红书、央视、新华社端点仍为404。本地与上游HEAD均为2026-03-11的 `36c77e3`，没有新修复可自动升级。当前可用不代表反爬问题彻底解决，网站登录、Cookie、网络/IP限制及旧置顶帖仍需持续观察。

### 3.4 数据库模型

当前 SQLite 数据库位于：

```bash
data/wccat.sqlite
```

SQLite 是文件型本地数据库。关机、重启开发服务器或重启电脑不会导致数据丢失；只要 `data/wccat.sqlite` 及其 WAL/SHM 辅助文件没有被删除，数据会继续保留。需要注意：

- 删除 `data/` 目录或 `data/wccat.sqlite` 会丢失历史数据。
- 如果需要迁移机器，需要一起复制 `data/wccat.sqlite`，最好在服务停止后复制。
- 当前项目不是云数据库，多台机器不会自动同步。

核心表：

- `snapshots`：按小时保存完整快照，主键是类似 `2026-06-11-14` 的快照 ID。
- `raw_items`：保存每次快照下各平台抓到的原始条目，包括 `heat_value` 和结构化 `stats_payload`。
- `topics`：保存聚合后的话题、排名、热度、情绪和 payload。
- `topic_analyses`：保存每个话题的 AI 或本地规则分析结果。
- `ai_analysis_logs`：保存 AI 请求日志、模型、耗时、fallback 原因和响应。
- `daily_reports`：按自然日保存 24 小时 Top10 日榜、公众号稿、视频稿和生成模型。

### 3.4.1 本地管理后台

新增独立路由：

```bash
/admin
```

用途：

- 查看 `snapshots`、`raw_items`、`topics`、`topic_analyses`、`ai_analysis_logs`、`daily_reports`。
- 按当前表搜索、分页浏览。
- 选择单条记录后用 JSON 编辑。
- 新增、更新、删除白名单表内记录。

安全边界：

- `/admin` 不在首页或日报页导航中展示。
- API 不开放任意 SQL，只允许项目白名单表 CRUD。
- 当前没有登录鉴权，默认假设只在本机开发环境使用。若未来暴露到局域网或公网，必须先加鉴权。

### 3.5 总榜 v2.1 排名算法

当前总榜算法位于 `src/lib/ranking.ts`。

总榜 v2 的目标是让首页总榜代表“全中文互联网注意力”，而不是被单一平台或垂直社区内部热度刷榜。

核心规则：

- 每个信源在 `src/lib/sources.ts` 中配置基础影响力权重 `weight`。它代表平台在中文互联网注意力场中的先验影响力，后续可根据实际产出手动调参。
- 同一话题里，同一信源的多条记录采用递减贡献：第 1 条 100%，第 2 条 25%，第 3 条 10%，之后不再加分。
- 单一信源话题设置总榜天花板，防止 NGA、虎扑、少数派、IT之家等垂直平台凭单站热度冲到 Top 3。
- `RawHotItem.stats` 会记录播放/阅读、评论/回复、点赞/支持、收藏、分享、弹幕、反对等互动统计量。不同平台量级不同，`ranking.ts` 用每个平台的 baseline 做对数归一化，而不是直接用原始数字相加。
- 高互动内容可获得额外 `engagementBonus`。例如 B 站百万级播放、点赞、弹幕和评论会显著提高该条目的 `platformScore`。
- 单源天花板会根据真实互动强度动态放宽，避免“B站单条内容几百万播放/点赞但无法进入总榜”的情况。
- 跨平台话题获得更高奖励，尤其是 `微博/百度/抖音/今日头条` 等核心大众入口与新闻源、讨论源共同出现时。
- 跨类别话题获得额外奖励，例如新闻 + 社交 + 讨论同时出现。
- 官方媒体和民间平台同时出现时保留共振奖励。

当前信源分层：

- `core_public`：微博、百度、抖音、今日头条。
- `discussion`：知乎、B站、豆瓣。
- `news`：澎湃、腾讯新闻、新浪新闻、网易新闻。
- `business_tech`：36氪、IT之家、虎嗅、少数派。
- `vertical`：虎扑、贴吧、NGA。

当前单信源总榜天花板：

- `core_public`：180，核心入口 Top 1/2 可额外放宽 20。
- `discussion`：150。
- `news`：140。
- `business_tech`：118。
- `vertical`：112。

这意味着垂直社区话题仍能在平台榜或社区榜中靠前；如果只有单站内部热度，默认不会污染首页总榜。但如果它拥有明确的大规模互动统计量，可以突破一部分单源天花板。

当前统计量维度：

- 受众规模：`views`、`reads`、`plays`。
- 讨论强度：`comments`、`replies`、`danmaku`。
- 支持/喜爱：`likes`、`upvotes`、`favorites`、`shares`。
- 反对/负反馈：`dislikes`、`downvotes`。

注意：不是所有平台都稳定提供这些字段。缺失统计量时不惩罚，只是不获得互动加成。

排名状态信号：

- 话题 `signal` 不再只根据当前榜内位置推断，而是对比上一小时快照的排名。
- 没有历史匹配的话题标记为 `new`。
- 当前排名相较上一小时提升 2 名及以上，标记为 `rising`，前端显示“上升”。
- 当前排名相较上一小时下降 2 名及以上，标记为 `cooling`，前端显示“下降”。
- 排名变化在 1 名以内，标记为 `steady`，前端显示“稳定”。
- 匹配优先使用 `topic_id`，其次使用 `normalizedTitle`，最后使用标题相似度兜底。

### 3.6 AI 分析策略

当前 AI 分析不是前端实时触发，而是在同步完成后异步预计算并落库。

默认开发阶段只分析 Top 1：

```bash
npm run sync -- top=1
npm run analyze -- top=1
```

默认值由 `src/lib/precompute.ts` 控制，目前是 `1`。

AI 分析逻辑：

- 如果已有 DeepSeek 分析结果，跳过。
- 如果已有 `local-rules` 结果，并且现在配置了 `DEEPSEEK_API_KEY`，会自动升级重算。
- 每次预分析会打印 pending/skipped 日志，便于确认是否真正触发。

AI 稳定性约束：

- 分析前会读取同一 `topic_id` 在历史快照中的最近一次分析。
- 只有非 `local-rules` 的历史结果会作为强锚点。
- DeepSeek prompt 会收到 `previousAnalysis`，并被要求优先沿用上一版红蓝观点标签。
- 程序层会强制红蓝观点不左右互换，并默认沿用上一版 `redLabel` / `blueLabel`。
- 程序层会限制红蓝分数相对上一版最多变化 `WCCAT_AI_STABLE_SCORE_DELTA` 分，默认 `10`。
- AI 返回的 `changeReason` 会记录本次相较上一版的变化理由；无历史锚点时为首次分析。
- 如果 DeepSeek 不可用但存在历史锚点，会使用本地 fallback 并套用历史标签和分数限制，避免突然大幅漂移。

### 3.7 DailyHotApi 集成

当前 WcCAT 已集成本机 DailyHotApi 作为开发阶段的聚合热榜后端。

默认策略：

- 如果配置了 `WCCAT_HOT_API_BASE`，优先使用该地址。
- 如果没有配置，并且不是生产环境，默认使用 `http://localhost:6688`。
- 如果是生产环境且没有配置，回退到公共 `https://api-hot.imsyy.top`。

已实测本机 `http://localhost:6688` 可用的端点包括：

- `zhihu`
- `douyin`（已改为直连优先，DailyHotApi 作为 fallback）
- `tieba`
- `ngabbs`（已移植直连实现，但当前本机解析到 `0.0.0.0`，仍不稳定）
- `36kr`
- `ithome`
- `qq-news`
- `sina-news`
- `netease-news`
- `huxiu`
- `sspai`

DailyHotApi 当前没有覆盖或本机返回 404 的端点：

- `xiaohongshu`
- `cctv`
- `xinhua`

### 3.8 图片补全与 AI 生图

当前图片链路分三层：

1. 热榜源自带 `cover/image/pic/thumbnail` 字段时直接使用。
2. 如果话题没有图片，`image-enrichment.ts` 会尝试抓取原文页面，提取 `og:image`、`twitter:image`、`image_src` 或首张有效图片。
3. 如果仍然没有图片，则通过 `ai-image.ts` 生成 AI 图片 URL 作为兜底。

当前 AI 生图默认 provider：

- `pollinations`：生成 `https://image.pollinations.ai/prompt/...` 图片 URL。

控制参数：

- `WCCAT_IMAGE_ENRICHMENT=off`：关闭图片补全。
- `WCCAT_IMAGE_ENRICH_TOPICS=30`：控制每次同步最多补图的话题数。
- `WCCAT_AI_IMAGE_PROVIDER=off`：关闭 AI 生图兜底。
- `WCCAT_AI_IMAGE_PROVIDER=pollinations`：使用 Pollinations 生成图片。
- `WCCAT_AI_IMAGE_MODEL=flux`：控制 Pollinations 的模型参数。

注意：AI 生图当前是“URL 型兜底”，不会把图片二进制下载到本地。后续如需更稳定，可以增加本地缓存或对象存储。

## 4. 命令说明

### 4.1 常用开发命令

```bash
npm run dev
```

启动本地开发页面，端口为 `3002`；生产启动命令 `npm run start` 同样使用 `3002`。

```bash
npm run sync -- top=1
```

手动抓取、聚合、落库，并分析前 1 条话题。开发阶段最常用。

```bash
npm run check:sources
```

检查当前信源是否能抓取到数据。

### 4.2 其他命令

```bash
npm run worker
```

启动长期运行的整点同步任务。启动后会先立即运行一次，然后对齐下一个整点继续执行。

```bash
npm run analyze -- top=1
```

不重新抓取数据，只对数据库最新快照补跑或升级 AI 分析。

```bash
npm run daily
```

读取最近 24 条小时快照，生成当天 24 小时 Top10 日报、公众号文字稿和抖音/B 站视频口播稿。

```bash
npm run ai:logs
```

查看最近 AI 调用日志。

```bash
npm run lint
npm run build
```

代码检查和生产构建验证。

## 5. 信源状态

### 5.1 已完成且当前可抓取

- `weibo`：微博热搜，当前走直连接口，第三方作为兜底。
- `baidu`：百度热搜，当前走直连接口。
- `zhihu`：知乎热榜，当前走知乎 API 直连，支持 `ZHIHU_COOKIE`，DailyHotApi 作为 fallback。
- `bilibili`：B 站热门，当前走直连接口。
- `thepaper`：澎湃新闻，当前走直连接口。
- `toutiao`：今日头条，当前走直连接口。
- `douban`：豆瓣小组，当前解析公开页面。
- `hupu`：虎扑热帖，当前走虎扑移动端 API，多页抓取，DailyHotApi 作为 fallback。
- `douyin`：抖音热点，当前走抖音 Web 热榜接口直连，先预请求获取 `passport_csrf_token`，DailyHotApi 作为 fallback。
- `tieba`：贴吧热议，当前走贴吧热议 JSON 直连，DailyHotApi 作为 fallback。
- `36kr`：36氪热榜，当前走 36氪 POST 接口直连，DailyHotApi 作为 fallback。
- `ithome`：IT之家热榜，当前解析移动端热榜 HTML，DailyHotApi 作为 fallback。
- `qq-news`：腾讯新闻，当前走腾讯新闻热点 JSON 直连，DailyHotApi 作为 fallback。
- `sina-news`：新浪新闻，当前走新浪 JSONP 热榜直连，DailyHotApi 作为 fallback。
- `netease-news`：网易新闻，当前走网易移动端热点 JSON 直连，DailyHotApi 作为 fallback。
- `huxiu`：虎嗅24小时，当前走虎嗅 moment API 直连，DailyHotApi 作为 fallback。
- `sspai`：少数派热榜，当前走少数派文章 API 直连，DailyHotApi 作为 fallback。

### 5.2 已接入但当前不稳定

- `ngabbs`：NGA 热帖已移植直连 POST 接口实现，但当前本机 Node 环境访问 `ngabbs.com` / `bbs.nga.cn` 会解析到 `0.0.0.0:443` 并连接失败；DailyHotApi fallback 当前也返回 500，需要后续从 DNS/网络层排查。
- `xiaohongshu`：小红书热点已配置为候选，但本机 DailyHotApi 不提供该端点；当前仍需要第三方只读 API 或专门采集器。
- `cctv`：央视新闻已配置为官方媒体候选，但本机 DailyHotApi 不提供该端点。
- `xinhua`：新华社已配置为官方媒体候选，但本机 DailyHotApi 不提供该端点。

### 5.3 已配置为候选但默认未启用

以下信源已经在 `src/lib/sources.ts` 中存在配置，但默认不启用，避免缺少专用 API 时产生稳定失败：

- `xiaohongshu`：小红书热点。需要配置 `WCCAT_XIAOHONGSHU_HOT_API_URL`，如需要鉴权则配置 `WCCAT_XIAOHONGSHU_API_KEY`。

### 5.4 已规划但尚未实现

- 微信/公众号。
- 小红书直连抓取。
- 新华社。
- 央视新闻。
- 半月谈。
- 三联生活周刊。
- 小红书、抖音等平台详情页图文内容抓取。

## 6. 环境变量

当前相关环境变量：

```bash
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-flash
WCCAT_ANALYZE_TOPICS=1
WCCAT_AI_STABLE_SCORE_DELTA=10
WCCAT_HOT_API_BASE=http://localhost:6688
WCCAT_IMAGE_ENRICH_TOPICS=30
WCCAT_IMAGE_ENRICHMENT=on
WCCAT_AI_IMAGE_PROVIDER=pollinations
WCCAT_AI_IMAGE_MODEL=flux
WCCAT_XIAOHONGSHU_HOT_API_URL=...
WCCAT_XIAOHONGSHU_API_KEY=...
```

说明：

- `.env.local` 对 Next.js 页面/API 自动生效。
- `tsx` 脚本通过 `scripts/load-env.ts` 显式加载 `.env.local`。
- 修改 `.env.local` 后，已经运行的 `worker` 不会自动读取新值，需要重启进程。
- 开发阶段如果没有显式配置 `WCCAT_HOT_API_BASE`，WcCAT 默认尝试使用 `http://localhost:6688`。

## 7. 已完成能力

- Next.js + TypeScript 项目基础结构。
- SQLite 本地落库。
- 小时级快照模型。
- 整点自动 worker。
- 手动 `sync`、`analyze`、`check:sources` 命令。
- 每日 00:10 自动生成 24 小时 Top10 日报，支持 `npm run daily` 手动触发。
- 多平台原始数据抓取和归一化。
- 本机 DailyHotApi 聚合源集成。
- 第一批/第二批 DailyHotApi 迁移：知乎、贴吧、36氪、IT之家、腾讯新闻、新浪新闻、网易新闻、虎嗅、少数派、虎扑、抖音已改为 WcCAT 直连优先；NGA 已移植直连实现但受当前本机网络解析影响暂不可用。
- 跨平台话题合并和热度排序。
- 总榜 v2 排名算法：同源递减、跨平台奖励、跨类别奖励、单源垂直平台天花板。
- 官方/民间来源区分。
- 启发式情绪识别。
- DeepSeek 话题分析。
- AI 分析稳定性约束：历史锚点、红蓝标签复用、分数漂移限制、变化理由。
- AI 分析预计算与入库。
- AI 调用日志。
- 本地规则 fallback。
- 右侧赛博风格分析卡片。
- 红蓝观点能量条。
- `/daily` 日报预览页，沿用现有三栏布局展示日榜、公众号稿和视频稿。
- 平台态度矩阵。
- 外部图片代理。
- 话题图片补全：热榜图片、原文页 `og:image`/首图、AI 生图兜底。
- AI 生图模块，当前支持 Pollinations URL 型生成。
- 外链归一化，包含百度 PC 链接和虎扑相对路径处理。
- Wc/CAT 双色 Logo。
- 通过 DailyHotApi 恢复知乎热榜，并接入抖音、贴吧、NGA、36氪、IT之家、腾讯新闻、新浪新闻、网易新闻、虎嗅、少数派。

## 8. 开发路线

### 8.1 近期优先级

1. 为 `sync` 和 `worker` 增加更清晰的运行摘要，例如各信源成功/失败、AI pending/skipped。
2. 梳理 `refresh` 和 `sync` 的职责，减少重复命令。
3. 改善 README，使它只保留快速启动，详细信息链接到本文档。
4. 为图片补全增加本地缓存或对象存储，减少外部图片链接失效。
5. 为小红书寻找稳定只读热榜 API 或实现专门采集器。
6. 为央视、新华社等官方媒体补 RSS、站点抓取或第三方源。

### 8.2 数据源扩展

优先级建议：

1. 小红书热点，通过第三方只读 API 或稳定服务接入。
2. 官方媒体源：央视、新华社、半月谈、三联生活周刊。
3. 微信/公众号，后续需要单独评估可行性和合规风险。
4. 如 DailyHotApi 某些端点不稳定，再从 `/Users/longshenjue/Documents/AI-project/DailyHotApi` 按需移植实现。

### 8.3 产品体验优化

- 增加“当前小时更新状态”模块。
- 增加“信源健康度”模块，显示每个来源最近成功时间和失败原因。
- 增加“AI 分析状态”模块，显示 Top N 分析完成度。
- 增强历史归档查询体验。
- 后续再考虑移动端页面，不优先恢复弹窗交互。

### 8.4 数据和算法优化

- 为不同平台建立更细粒度的权重和热度归一化规则。
- 继续根据真实榜单表现调参总榜 v2 的信源分层、单源天花板和跨平台奖励。
- 引入小时环比，识别 rising/cooling 信号。
- 增加同义词、人物名、机构名识别，提高跨平台合并准确率。
- 将图片补全扩展为更完整的 enrichment 阶段，包括图片缓存、详情页结构化解析和失败重试。
- 建立信源失败重试和熔断策略。

### 8.5 AI 优化

- 按话题变化判断是否需要重算分析，而不是只按 topic id 判断。
- 将 AI 分析拆成摘要、观点、平台态度等可独立缓存的模块。
- 增加 prompt 版本号，便于后续重跑旧分析。
- 增加成本控制和并发控制。
- 增加“本地 fallback 与 AI 结果差异”的调试视图。

## 9. 文档维护规则

每次完成新功能后，必须检查并更新本文档，至少确认以下部分：

- 如果新增或修改信源，更新 `5. 信源状态`。
- 如果新增命令、脚本或环境变量，更新 `4. 命令说明` 和 `6. 环境变量`。
- 如果修改数据流、数据库或 AI 流程，更新 `3. 技术架构`。
- 如果完成了路线中的事项，更新 `7. 已完成能力` 和 `8. 开发路线`。
- 如果产品交互或视觉方向变化，更新 `2. 产品设计`。
- 更新文档顶部的 `最后更新` 日期。

本文档应记录“当前真实状态”，不要只记录理想目标。任何不稳定、依赖外部服务、需要 key 或尚未验证的能力，都必须明确标注状态。
