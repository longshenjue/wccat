# TianAPI 六接口集成设计

日期：2026-11-19。用户已提供六接口权限并明确要求按合理框架和存储设计开始集成，沿用 TypeScript、SQLite 和既有证据库；常规工程取舍由实现者负责，不再单独重复申请实施授权。

## 目标与边界

配置 `TIANAPI_KEY` 后实际参与现有刷新和 AI 分析，缺 Key 保持既有行为。六接口均是热榜，不伪装成关键词全文搜索或评论采集。保留原始脱敏响应、条目和来源时间，不增加模型调用次数，不修改现有评分公式，不让同平台多个渠道重复计分。

| 文档 | endpoint | 平台与用途 |
| --- | --- | --- |
| 223 | networkhot | 全网聚合；仅补充证据，不额外制造一个独立评分平台 |
| 100 | weibohot | 微博；沿用 weibo |
| 68 | nethot | 百度；沿用 baidu |
| 244 | toutiaohot | 头条；沿用 toutiao |
| 196 | wxhottopic | 腾讯生态；文档兼称微信热搜，不冒充 qq-news，默认仅补充证据 |
| 155 | douyinhot | 抖音；沿用 douyin |

官方文档以 https://www.tianapi.com/apiview/{id} 和对应 https://www.tianapi.com/openapi/{endpoint}.json 为准；接口成功为业务 code=200，HTTP 200 本身不代表成功。196 的 index 是排序信息，不当作热度或互动数量。

## 方案与选择

1. 每个来源各自写请求：改动少，但密钥、限额、错误和存储容易分叉。
2. 统一客户端、描述式端点注册与独立标准化，再接入既有采集：复用限额和证据契约，新增服务不改变评分层；采用此方案（实现者取舍）。
3. 新建独立爬虫服务/消息队列：增加运维和共享存储成本，不符合当前预算。

## 结构

- `tianapi/catalog.ts`：六端点描述、字段标准化、稳定平台搜索 URL。全部标记为 topic，缺少原文链接时不冒充文章。
- `provider-state.ts`：SQLite operational state，单独 schema，不改已发布证据 v1 与六表归档格式。保存缓存、端点租约、北京时间每日请求尝试数及账户全局下一次请求时间。
- `tianapi/client.ts`：校验配置、固定主机 POST 表单认证、超时与响应大小限制、业务错误、缓存和返回批次；不依赖业务排名。
- `tianapi/runtime.ts`：从服务端环境与主库组装客户端，缺 Key 不创建请求。
- 既有 `ingest`：四个平台使用 TianAPI → 原直连 → DailyHotApi 顺序，选定一个来源集合，不拼接同平台的两份榜。
- `store`：另外采集聚合与腾讯生态证据，严格按标准化标题匹配现有话题，附加有出处和时间的上下文；不进入 occurrences、来源数或热度评分。
- `topic-analysis`：将新增上下文和 provider 信息纳入已有一次模型请求，明确热榜摘要不等于正文或民意调查。

## 配置与成本

- `TIANAPI_KEY`：唯一必要变量，六接口复用；`TIANAPI_ENABLED=false` 可关闭。
- `TIANAPI_ENDPOINTS`：可选逗号分隔 allowlist，默认六个 endpoint；未知名称报错，不能悄悄扩大调用。
- `TIANAPI_DAILY_LIMIT`：默认 90，允许 1–100，每接口北京时间日界；按发起的尝试计数，比仅成功计费保守。重启不清零；其他项目/控制台使用不在本地计数内，保留 10 次余量不保证整个账户的统一配额。
- 30 分钟有效缓存；过期缓存不用作当前热榜。瞬时错误冷却 5 分钟；无权限/无效 Key/超额冷却到次日或 Key 更换。无自动网络重试；原渠道可回退。
- 每账户最多每秒 1 次，低于普通账户公开 3 QPS；SQLite 事务租约在并发 worker/CLI 间生效。网络期间不持有事务。
- 当前每天 6 次定时刷新，正常情况下每接口约 6 次/日；启动刷新和手工调用仍受缓存与硬计数限制。

## 数据及一致性

Key 只进入固定 TianAPI 主机的 POST body；重定向拒绝，错误文本脱敏；缓存、日志、证据不保存 Key。缓存命中保留原 observedAt/sourceUpdatedAt，标 cached，不冒充新鲜采样。每次实际消费可保存独立证据 run，原始内容按 hash 去重。

客户端输出显式 EvidenceBatch，包含 provider=tianapi、平台、endpoint adapter、脱敏请求/响应、完整性状态、原始条目、热搜指数单位和时间。热搜指数不填入 views/likes/comments。

新增 operational tables 使用独立 metadata 版本；首次主库打开增量创建。完整备份包含它们；新版本 verifier 在 metadata 存在时要求全部 provider 表，仍接受此前未含 provider 状态的完整备份。不会自动回填或重写历史。

采集证据遵循既有 generation fence。租约释放仅允许当前 owner，旧网络响应不得覆盖新 owner 缓存。维护期间过期结果不能写入证据或缓存；已发出的尝试仍消耗本地预算。

补充证据随 topic payload 保留，分析记录显式连接其 observation ID。原有正文获取保留，但跳过 topic/search 页，避免把搜索导航当文章正文。缺少摘要时，AI 获得的是热榜信号，不能据此虚构评论情绪。

## 验证与交付

测试覆盖六套官方格式、中文数值/零/缺失、HTTP 与业务错误、超限/缓存/跨进程租约、北京时间跨日、Key 脱敏、维护 fence、四平台回退、补充材料进入真实 prompt 且不改变榜单分值、旧备份与归档兼容。使用真实 SQLite 与受控 HTTP，不依赖实际 Key。Key 仅在 Northflank 时，提供 `npm run tianapi -- status|check` 供容器验证，不宣称已完成真实账户连通。

沿用用户本会话的发布授权：完成测试和整体验证后 commit、合并 main 并 push；不替用户修改 Northflank secrets，不跟踪部署到完成（用户此前明确无需跟踪）。
