# TianAPI 六接口接入与部署

六接口为热榜采集，不是关键词网页搜索或评论服务。配置有效 Key 后，现有刷新任务会自动使用它们；不新增独立定时任务或 AI 请求。

## Northflank 配置

在 WcCAT 服务的 Runtime Environment / Secrets 配置：

```dotenv
TIANAPI_KEY=填写账户的真实Key
```

一个 Key 供六个接口使用。无需写入 DailyHotApi 服务、Docker build arguments 或 NEXT_PUBLIC_ 变量。保存并重新部署/重启 WcCAT 后生效；不要在日志、Git 或聊天中粘贴 Key。

可选配置（通常无需修改）：

```dotenv
TIANAPI_ENABLED=true
TIANAPI_ENDPOINTS=networkhot,weibohot,nethot,toutiaohot,wxhottopic,douyinhot
TIANAPI_DAILY_LIMIT=90
```

设置 `TIANAPI_ENABLED=false` 会关闭集成。ENDPOINTS 是精确 allowlist，可保留其中一部分；未知名称会报错。DAILY_LIMIT 允许 1–100，默认 90 为控制台测试和其他调用预留余量。限额只覆盖使用本数据库的 WcCAT 进程，无法统计你在其他应用或控制台的请求。

## 接口与使用方式

| 官方文档 | endpoint | 接入行为 |
| --- | --- | --- |
| [全网热搜 223](https://www.tianapi.com/apiview/223) | networkhot | 采集、永久留证；匹配已有话题后补充 AI 材料，不参与平台数和热度分 |
| [微博 100](https://www.tianapi.com/apiview/100) | weibohot | 优先提供 weibo 热榜，失败回退旧直连与 DailyHotApi |
| [百度 68](https://www.tianapi.com/apiview/68) | nethot | 优先提供 baidu 热榜，保留 brief、热搜指数和趋势原值 |
| [头条 244](https://www.tianapi.com/apiview/244) | toutiaohot | 优先提供 toutiao 热榜，失败回退原链路 |
| [腾讯生态 196](https://www.tianapi.com/apiview/196) | wxhottopic | 独立标记 tencent-hot，作为辅助材料；不冒充 qq-news，不把 index 当热度 |
| [抖音 155](https://www.tianapi.com/apiview/155) | douyinhot | 优先提供 douyin 热榜，保留 label 和热搜指数原值 |

相同平台不会把 TianAPI 和旧渠道两份榜拼接计分；有可用 TianAPI 数据就使用该份榜。两个辅助榜只以保留语义的完整标题匹配现有话题，未匹配条目仍留在资料库，不凭相似词误作事实。腾讯生态/聚合榜独有话题本阶段不会单独进入总榜。

搜索 URL 标记为 topic，既有正文提取会跳过它们；真实文章链接仍可提取。AI 的同一次请求获得 provider、采样时间、辅助摘要及出处；热榜材料不能代替评论或用户情绪样本。AI 输入与结论引用存入已有长期证据库。

取舍：四个主渠道成功时不再同时抓取该平台旧榜，因而可能少于旧直连提供的文章链接；其他现有来源的文章仍可补正文。另抓旧榜以恢复文章链接属于后续扩展，本次不宣称热榜等同全文搜索。辅助材料匹配保留小数点、正负号和 C# 等名称，只规范 Unicode、空白和成对外层话题标签。

## 免费额度与缓存

- 每个接口每天按发出的尝试保守计数，按北京时间日界，默认上限 90；成功、错误、超时都占本地一次预算。无自动网络重试。
- 成功/空结果缓存 30 分钟，缓存命中保留原采样时间，不再请求供应商。过期结果不拿来冒充当前榜。
- 同账户每秒最多安排一次请求；六个接口共享这个节流器。数据库租约协调 web、worker 和手工 CLI。
- 普通错误冷却 5 分钟；权限、Key 和配额等错误冷却到次日，或换 Key 后重新验证；不自动付费升级。
- 当前每天 6 次定时刷新，正常每接口约 6 次/日；重启与手工请求也受同一缓存和计数约束。

业务 code=200 才成功，不能只检查 HTTP 200。接口没有提供评论、点赞、点踩时保留未知，不用热搜指数代填。

## 容器内验证

```bash
cd /app
npm run tianapi -- status
npm run tianapi -- check
# 或仅测试一个端点：
npm run tianapi -- check weibohot
```

status 仅读取本地配置状态、北京时间今日计数与缓存状态，不调用 TianAPI，也不输出 Key。check 会调用或复用有效缓存，输出每接口状态、条目数、缓存标记及错误，同时保存脱敏证据；失败返回非零。check 也消耗同一免费预算，不绕过限制。未配置 Key 时 status 不创建数据库，check 明确报错。

本地自动化测试使用官方字段格式和受控 HTTP，覆盖六接口及完整刷新/AI 输入。Key 如果只存在于 Northflank，需要在容器运行上述 check 才能确认真实账户权限、IP 白名单和实时可用性，不能把测试夹具通过当成实际 API 连通。

## 存储与备份

`provider_meta`、`provider_request_state`、`provider_daily_usage`、`provider_dispatch` 保存独立版本的运行状态。只存账户 hash，不存 Key；缓存先脱敏再写入。租约和 generation fence 阻止过期网络结果覆盖缓存。

长期响应、条目、观测和分析引用继续使用原证据表，证据 schema v1 和旧六表归档不变。`npm run evidence -- backup` 覆盖新增运行状态；此前不含 provider 状态的完整备份仍可校验。首次新代码打开可写库会创建运行状态表，不自动回填、不删除原记录。

缓存只保留本地观察时间，不用它代填未知的上游更新时间。小时预计算、日报 TOP1 补分析和手动话题分析均保存实际 prompt 与证据关联；日报补分析和未指定日期的手动分析不覆盖小时业务结论。
