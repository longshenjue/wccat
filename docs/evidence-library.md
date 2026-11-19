# 长期资料库与多来源证据

长期资料与原来的小时榜、日报共用 `data/wccat.sqlite`，但采用独立的表和保留策略。更换评分算法或清理旧小时榜不会自动删除已经保存的证据。现有页面和排名仍使用原链路。

新代码首次打开可写主库时创建资料表，不在启动时回填历史，也不会额外调用搜索服务、评论接口或 AI。

## 保存的内容

| 层次 | 保存内容 |
| --- | --- |
| 来源 | provider、platform、adapter、能力、条款地址、数据使用权限状态 |
| 采集 | 独立 run ID、脱敏请求、脱敏响应、时间、成功/空/部分/失败状态、截断标记 |
| 文档 | 稳定 ID、平台对象 ID、规范化 URL 与别名 |
| 内容版本 | 标题、摘要、正文、来源时间、内容 hash，变化后新增版本 |
| 观测 | 每次名次、热度、计数，保留零值和缺失值区别 |
| 搜索 | 查询用途、语言、地区、过滤、实际查询、引擎、分页、各自命中和名次 |
| 事件 | 稳定事件 ID、证据关联、后续/冲突关系、假设与人工确认状态 |
| 分析 | 模型、prompt 版本、实际输入/输出、生成时间与引用证据 |

同一文章在多个搜索服务中出现时，文档可复用，但各自的查询和命中记录保留。搜索排名不会参与社会关注度评分。不同平台的转载保持独立文档，不能仅按标题相似就当成独立来源的交叉证实。

完整响应、内容和话题分析输入输出按内容寻址并 gzip 压缩。认证材料先脱敏再写入；这里的“原始响应”指经过脱敏的采集证据，不是未经处理的网络报文。默认单条 blob 上限 2 MiB，原始响应超限会标记截断并记录 partial；规范化正文超限则报错，不默默保存为完整内容。上游长度、实际捕获字节和压缩存储字节分别保存，上游总长度无法确定时保留未知；有 Content-Encoding 时不把压缩包的 Content-Length 当作正文长度。

采集端使用现有请求的响应副本留档，不额外发请求。直连与 DailyHotApi fallback 分开记录。来源页面正文和未来评论采样的完整性仍取决于各自适配器；资料表存在不表示这些数据已经采到。

## 查看资料库与创建完整备份

在正在使用的项目目录执行：

```bash
npm run evidence -- stats
npm run evidence -- backup
```

备份默认写入当前 `WCCAT_DATA_DIR`（未设置时为 `data/`）下的 `complete-backups/`。返回 SQLite 文件与 `.manifest.json`，两份文件需要一起保存。备份使用 SQLite backup API，包含已提交的 WAL 数据、新旧业务表、资料表及运维状态；文件权限为私有。

也可指定目录：

```bash
npm run evidence -- backup /absolute/path/to/private-backups
npm run evidence -- verify /absolute/path/to/wccat-complete-example.sqlite
```

verify 只读备份，不替换当前数据库；检查文件大小、SHA-256、数据库完整性、外键、表行数和压缩内容解码。SHA-256 用于完整性检查与去重，不能证明新闻真实性。

管理后台现有的 full/daily 导出继续使用旧六表归档格式，供按月浏览与清理小时记录使用，**不包含新增长期资料表**。长期资料须使用上述完整备份命令。完整备份不能作为六表月归档上传注册。

恢复时先用原备份及对应清单运行 verify；通过后创建新的独立私有目录，将已验证的 SQLite 文件复制到该目录并明确命名为 `wccat.sqlite`，再通过独立进程指定 `WCCAT_DATA_DIR` 验证实际业务和证据行数。不要直接用带日期的备份文件名启动应用，否则它会另建空的 `wccat.sqlite`。不要覆盖运行中的数据库；要替换线上主库时，应先停掉 web 与 worker，并保留原数据及 WAL 文件。本文不会自动执行恢复或替换。

完整备份原样包含已有业务记录。本次对后续自动写入增加脱敏，不自动扫描或重写既有历史中的潜在凭据，也不宣称备份替过去的数据完成了脱敏；如旧记录曾保存认证材料，备份同样需要严格保密并另行处理。

## 显式回填已有历史

先做完整备份，在数据副本验证，再执行：

```bash
npm run evidence -- backfill --limit=5
```

每批 1–100 份快照，默认 5 份；命令返回本批数量和未处理数量，可重复运行直到 remaining 为零。返回的 runs 是处理的平台批次数，force 重查时包含幂等复用，不代表新增行数；实际数量用 stats 核对。检查点只在该快照相关内容成功写入后保存；失败批次回滚，不删除原记录。

已经处理的快照默认跳过。原小时数据被人工修订后，可对选中批次重新检查：

```bash
npm run evidence -- backfill --limit=5 --force
```

force 从最早快照开始重查指定批量；相同输入保持幂等，不保证一次覆盖全部历史。本版本仅回填在线主库，不写只读归档，也不隐式遍历已清理的归档月份。

历史数据标记为 `legacy_normalized`。无法恢复当时未保存的上游响应、发布时间、评论或点踩；这些信息继续保持未知。已有话题分析和 AI 请求/响应日志会复制到独立分析记录，保留原生成时间，并尽可能连接已知观测。没有留存的历史 prompt 与算法版本标为未知，不用当前版本代填；新结论有明确尝试关联时继承该次实际 prompt 的 hash。已由新采集或写入流程保存的观测、结论和日志会复用；无法可靠确定历史结论属于哪次尝试时，关联保持未知，不按时间猜配。

新采集与归一化快照留档采用不同 provenance。同一小时重新采集会新增证据 run，原小时榜仍按现有规则更新。维护锁和 generation 检查阻止清理期间已经过期的延迟写入。

## 多搜索渠道接入契约

`EvidenceStore.recordSearch` 接收 `SearchEvidence`，不在仓储内部发送请求。例如后续 adapter 可以将自己已经取得的响应转换为：

```ts
const result = store.recordSearch({
  id: requestId, // 本次请求的稳定重试 ID；另一次真实搜索使用新 ID
  source: { provider: 'tavily', platform: 'web', adapter: 'search-v1', capability: 'search' },
  query: '事件名称 后续进展',
  actualQuery: '事件名称 官方通报 后续进展',
  purpose: 'event-follow-up',
  language: 'zh',
  region: 'CN',
  filters: { after: '2026-11-01', sites: ['example.org'] },
  page: 1,
  complete: false,
  observedAt: new Date().toISOString(),
  response: upstreamResponse,
  hits: [{ url: 'https://example.org/story/123', title: '报道标题', snippet: '返回的片段', position: 1 }]
});
```

相同 query、用途、语言、地区和过滤条件形成逻辑查询；各引擎实际查询、摘要和名次独立保存。引擎声称的发布时间保留为声明值，不用搜索时间冒充事件发生时间。未完成分页时 `complete` 保持 false。

`readDocument` 返回内容版本和观测时间序列；`readSearch` 返回一次搜索命中；`createEvent`、`linkEventEvidence`、`recordEventRelation`、`recordAnalysis` 与 `readEvent` 提供后续事件研究基础。当前没有开放公共查询 API，也没有自动建立事件簇、生成因果关系或新增周期性 AI 任务。

## 免费账户与后续使用

见 [免费数据源申请与接入状态](free-data-source-setup.md)。2026-11-19 已完成 TianAPI 六接口接入，设置 `TIANAPI_KEY` 后实际采集；Apify、Tavily 仍未接入。TianAPI 运行状态独立保存，缓存保留原采样时间；详见 [限额、存储与校验](tianapi.md)。

未知数据使用权限不会自动变成可再分发。未来收费 API 应按证据来源、许可和字段确定开放范围，并优先明确自有事件索引、分析及外部全文/评论的边界。

现阶段费用为既有 DeepSeek 等调用的实际支出；30 元是运营预算边界，本次没有实现所有调用入口共享的费用硬限制。新增库与回填命令不增加模型调用。
