# Daily Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 关闭公开刷新并提供完整的中英文日报 PNG 分享。
**Architecture:** CLI 生成日报和缓存英文文案；浏览器通过独立海报组件导出 PNG；公开请求不能触发刷新和翻译。
**Tech Stack:** Next.js / React / TypeScript / SQLite / DeepSeek / html-to-image。
**Spec:** docs/superpowers/specs/2026-11-12-daily-sharing-design.md

## Global Constraints
- 网页服务端口保持3002，数据源服务保持6688。
- 图片左侧Top10，右侧固定Top1完整分析；无滚动截断。
- 缓存英文；失败明确反馈；保留CLI刷新。

## Review Focus
- 历史数据断档：不得混入24小时之外的数据。
- 选中其他话题：导出仍固定Top1。
- 英文缺少字段：不允许下载伪英文图。
- 图片加载失败：文本仍可下载，无空白导出。
- 手机窗口：导出仍保持双栏、完整尺寸。

### Task 1: Public refresh removal and source audit
- [x] 检查当前直连与DailyHotApi实际响应，核对上游HEAD与问题。
- [x] 删除公开刷新路由，更新文档为CLI命令；验证POST不再成功。

### Task 2: Accurate daily report and bilingual cached copy
- [x] 为24小时过滤和翻译结构验证添加失败测试并运行。
- [x] 实现窗口筛选、Top1分析补齐、DeepSeek英文文案缓存与超时。
- [x] 运行测试；生成今日真实日报并确认不含旧快照。

### Task 3: Complete share image
- [x] 增加语言选择、下载按钮、固定Top1的完整双栏海报和PNG导出。
- [x] 添加导出内容的行为测试；验证语言切换与长文本。
- [x] 浏览器实际下载中英文PNG，检查尺寸与可读性。

### Task 4: Final verification and documentation
- [x] 完成lint、类型检查、测试、构建和运行验证。
- [x] 更新README与架构文档，整理数据源现状及生成命令。
