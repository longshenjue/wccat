# Admin Tabs, History and Trends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 分区后台、只读历史条目与趋势，并允许提前生成未来日期日报。
**Architecture:** 按来源先选择快照版本，再读子项；新增受认证只读查询 API。URL 管理 Tab/日期/条目状态，SVG 呈现单话题紧凑序列。手动生成以明确目标窗口和执行时刻筛选数据。
**Tech Stack:** TypeScript / SQLite / React / Next.js / SVG，无新增依赖。
**Spec:** `docs/superpowers/specs/2026-11-13-admin-tabs-browse-trends-design.md`，用户已批准。

## Global constraints
- 查询不抓取、不调用 AI；保留管理员认证、同源变更与任务串行机制。
- 精确标题与 ID 匹配；空缺不补零；主库同时间优先，分析限定胜出来源。
- 未来日期可选，空数据仍保护旧日报；自动每日02:00调度不变。
- 临时库和假 AI 测试，完成后独立 review；没有明确指示不 commit/push。

## Review focus
- 归档连接超过缓存4个时避免保留已关闭连接；保存来源描述，查询时获取连接。
- 版本优先级、子项隔离、旧版本游标409；标题截断/哈希别名不能拼接。
- 观察截止时间不得改变24h目标起点，过滤在候选限额之前。
- 1h/4h和无匹配/单点/长间隔，排名反向且非零假值；查询按月裁剪和单话题标量读取。
- URL恢复、旧请求返回、手机可操作、无额外AI或数据写入。

### 1. 来源解析与只读数据服务
Files: `src/lib/snapshot-reader.ts`, `src/lib/admin-browse.ts`, `src/lib/admin-browse-types.ts`, `src/app/api/admin/browse/route.ts`, `tests/admin-browse.test.ts`。
- [x] RED：版本选择、源隔离、日期空态、分页校验、精确趋势/歧义、归档缓存边界、权限。
- [x] GREEN：统一来源元数据与版本，按源查询分页详情与单题趋势；API GET `view=hourly|detail|daily|trend`，默认20/最大100条，趋势1/7/30天。

### 2. 提前生成的窗口与元数据
Files: `daily-window.ts`, `daily-report.ts`, `admin-daily.ts`, `daily-report-input.ts`, `admin-daily.test.ts`, `daily-window.test.ts`。
- [x] RED：未来日期允许、执行时刻前过滤、不偏移起点、异常未来记录不能挤掉有效数据、空数据保护。
- [x] GREEN：`parseDailyReportDate`只校验格式；`readDailyReportInput(cutoff,observedUntil)`返回固定目标窗口与截至执行时快照；保存collection元数据并展示。

### 3. URL Tab、历史详情与SVG
Files: `admin-query.ts`, `admin-hourly-browser.tsx`, `admin-daily-browser.tsx`, `admin-item-detail.tsx`, `topic-trend.tsx`, `admin-data-panel.tsx`, `admin-daily-panel.tsx`, `admin-data.css`, `daily-workbench.tsx`。
- [x] 沿用原样式将现有卡片分到5个Tab，保留任务；URL持久化各Tab独立状态。
- [x] 查询、来源/标题筛选、详情、复制JSON、http(s)原文、1/7/30天图表、点选数据表与采样跳转。
- [x] SVG由React持有，两个独立坐标系，<=744点，仅展开时加载，键盘/触摸可用。

### 4. 验证和交付
- [x] 完整测试、类型检查、lint、构建；临时库HTTPS桌面/手机交互及截图检查。
- [x] 独立代码审查，问题先RED后修复GREEN，再完整回归。补使用说明；保留本地修改，不推送。
