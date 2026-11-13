# Admin Daily Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 管理员按指定日期覆盖生成日报，并查看可恢复的阶段与错误日志。

**Architecture:** 扩展现有独立进程 admin_jobs，不新增服务。日报生成提供阶段日志回调；任务日志限量存储在 SQLite，管理员 API 按需读取，React 页面轮询选中任务。

**Tech Stack:** Node / TypeScript / SQLite / Next.js / React。

**Spec:** `docs/superpowers/specs/2026-11-13-admin-daily-generation-design.md`（用户已批准，仅本功能）。

## Global Constraints
- 北京时间已完成的 02:00 窗口；既有日报直接覆盖；没有有效数据时保留既有日报。
- 独立子进程、现有管理员认证与同源 POST、现有串行限制和业务写入代际保护。
- 每任务日志 256 KiB、日志 30 天及总量 20 MiB 上限，日志文本脱敏；不影响导出证明和业务历史。
- 不增加英文补译按钮、AI重试等未选功能，不调用真实付费 AI，不操作真实业务数据。
- 所有实现完成后先独立 code review、修复及验证，再 commit/push（用户明确要求，覆盖逐任务提交建议）。

## Review Focus
- 无效/未结束/跨月日期：拒绝而非自动切换日期。
- 排队后数据改变、只有空快照：重新检查，不用空日报覆盖。
- 中文已写入而英文失败或本地回退：任务清晰显示部分完成与真实模型。
- 日志包含秘密、超限、日志恢复和未授权读取：脱敏、限量、保持权限。
- 页面切换日期或任务时旧请求晚到：忽略旧响应，日志与所选任务一致。

### Task 1: 日期、生成回调与受控任务
**Files:** `src/lib/daily-window.ts`, `src/lib/daily-report.ts`, `src/lib/daily-share-translation.ts`, `src/lib/admin-daily.ts`, `src/lib/admin-job-logs.ts`, `src/lib/log-redaction.ts`, `src/lib/admin-jobs.ts`, `src/lib/maintenance.ts`, `scripts/admin-job.ts`。
**Interfaces:** `parseDailyReportDate(value:unknown, now?:Date):Date`; `dailyGenerationPreview(date:unknown, now?:Date)` 返回窗口、采样和已有日报状态；`generateDailyReport(date?, options?)` 支持 `requireData` 与结构化日志回调；任务类型 `daily`，输入 `reportDate`，输出日报日期、模型、英文状态及警告。
- [x] 编写失败测试：日期校验、无数据保护、已有日期覆盖、英文失败、日志脱敏/容量/保留；运行看到预期失败。
- [x] 实现受控生成、持久日志、阶段回调及独立任务分支；运行针对测试至通过。

### Task 2: 管理 API 与界面
**Files:** `src/app/api/admin/data/route.ts`, `src/components/admin-daily-panel.tsx`, `src/components/admin-job-log.tsx`, `src/components/admin-data-panel.tsx`, `src/components/admin-data.css`, `tests/admin-data-api.test.ts`。
**Interfaces:** GET `?daily=YYYY-MM-DD` 返回预览；GET `?logs=jobUUID` 返回仅该任务限量日志；POST `{action:'daily',reportDate}` 创建后台任务。复用现有会话、同源校验及202响应。
- [x] 编写失败测试：未登录的日报预览/日志/触发与跨域请求被拒绝，无效日期不建任务，现有导出 API 正常。
- [x] 实现日期预览表单、禁用状态、任务日志轮询、部分完成状态、结果链接；通过 API 回归、类型检查。

### Task 3: 集成验证、审查、交付
**Files:** `tests/admin-daily.test.ts`, `tests/admin-job-logs.test.ts`, `docs/admin-data-archives.md`。
- [x] 以临时库和假 AI 运行日报任务，验证覆盖、无数据、日志恢复、任务串行限制与英文失败。
- [x] 完善使用说明；运行 `npm test`、`npx tsc --noEmit --incremental false`、`npm run lint`、`npm run build`。
- [x] 用临时数据库启动独立本地页面检查桌面/手机表单、日志与完成链接，不启动真实 worker。
- [x] 独立 reviewer 检查全部改动；问题用 RED/GREEN 回归修复，验证后提交、快进 main、推送并验证远程提交。
