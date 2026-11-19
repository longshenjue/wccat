# 免费数据源申请与接入状态

更新日期：2026-11-19。预算：数据接口与 DeepSeek 每月合计不超过 30 元。

本文记录实际检查过的申请入口、人工环节和免费额度。打开注册页不等于注册成功；取得 Key 也不等于接口已经通过实测。

## 当前申请状态

| 服务 | 用途 | 实际状态 | 需要用户完成 |
| --- | --- | --- | --- |
| TianAPI | 六路中文热榜与补充证据 | 用户已取得 Key 并申请 223、100、68、244、196、155，每接口每日 100 次；已实现接入，真实账户连通待容器验证 | 在 WcCAT Runtime Secret 设置 TIANAPI_KEY，参见 [部署与校验](tianapi.md) |
| Apify | 小规模评论采集试验 | 已打开注册表单，未选择登录身份，未取得 Key | 选定 Google/GitHub 或邮箱身份并完成注册，阅读并接受条款 |
| Tavily | 网页与新闻交叉检索 | 已到注册表单，未提交，未取得 Key | 选定邮箱或第三方登录身份，阅读服务与自动续费条款，确认免费方案 |
| RSSHub | 可参考的采集适配器 | 不需要申请 Key，本次没有新增部署 | 无账户申请步骤，具体路由仍需实测 |

此前代办检查未提交个人信息、创建账户、充值或升级套餐；TianAPI 注册及授权现已由用户完成，真实 Key 未写入仓库。

## TianAPI

- 注册：[https://www.tianapi.com/signup.html](https://www.tianapi.com/signup.html)
- 免费额度说明：[https://www.tianapi.com/faq/193](https://www.tianapi.com/faq/193)
- 热榜接口示例：[https://www.tianapi.com/apiview/223-3](https://www.tianapi.com/apiview/223-3)

公开文档显示，普通会员可申请最多 10 个免费类接口，每个接口每日免费调用配额为 100 次；计次类接口是另一种收费方式，不可把普通会员免费额度套用到全部产品。

注册及六接口申请已由用户完成。WcCAT 现在用这六接口补充采集，仍需在部署容器核对实际权限与请求结果；无需购买会员或资源包。调用顺序、缓存和每日限额见 [TianAPI 接入](tianapi.md)。

## Apify

- 注册：[https://console.apify.com/sign-up](https://console.apify.com/sign-up)
- 免费方案：[https://apify.com/pricing](https://apify.com/pricing)
- 微博评论候选：[https://apify.com/lergassy/weibo-scraper](https://apify.com/lergassy/weibo-scraper)

平台公开免费方案有每月 5 美元额度；所有采集器及相关平台费用共享这份额度，不是每个采集器各有 5 美元。

先完成账户和邮箱验证，再从控制台核实免费余额与 API token。运行任何 Actor 之前，核实 Free plan 的单条、启动和计算收费，设置单次结果上限与费用上限，不开启付费升级。部分社区 Actor 的免费运行只提供存储演示样本，必须换成当前帖子并核对 ID、时间和实际内容，不能把演示当作实时采集成功。

候选微博 Actor 宣称支持无需用户 Cookie 的公开评论，Free plan 评论标价为 1.50 美元/千条；这里仅记录供应商说明，尚未验证其当前成功率、覆盖范围和使用权限。不同 Actor 的声明不可相互替代。

## Tavily

- 登录与注册：[https://app.tavily.com/](https://app.tavily.com/)
- 免费方案：[https://www.tavily.com/pricing](https://www.tavily.com/pricing)
- credit 计费：[https://docs.tavily.com/documentation/api-credits](https://docs.tavily.com/documentation/api-credits)
- 平台条款：[https://www.tavily.com/terms](https://www.tavily.com/terms)

公开方案为每月 1,000 credits，无需信用卡；Basic Search 每次 1 credit，Advanced Search 每次 2 credits。Extract、Crawl 和 Research 按不同规则扣费，不能统一按一次请求算一个 credit。

注册页明确显示 Continue 会接受服务与 Auto-Renew 条款。完成账户后需确认 Researcher 免费计划、没有绑定付款方式或启用 Pay As You Go，并核实额度耗尽时停止请求。初期只考虑显式运行的 Basic Search，不开启自动研究。

平台搜索命中供内部交叉验证使用。付费对外查询前另行确认供应商输出与原网页内容的存储、展示和再分发权限；不会直接向用户转发供应商 Key。

## 网页搜索的另一候选

[Serper](https://serper.dev/) 首页宣称提供无需信用卡的 2,500 次免费 Google 搜索查询。该额度按试用看待，不能当成每月循环免费额度；本次仅核对了官网说明，未进行注册表单操作，也未申请 Key。Tavily 与 Serper 都是数据获取服务，不假定其背后搜索索引相互独立。

## Key 保存与验证

TianAPI 使用 `TIANAPI_KEY`，本地写入 `.env.local`，部署写入 WcCAT Runtime Secret；其他供应商仍待实际接入。不粘贴进公开文档、Git、数据库 JSON 或聊天输出；未修改现有 DeepSeek Key。六接口的使用方式、限额与当前验证边界见 [TianAPI 接入](tianapi.md)。

接入验证至少包括：免费计划与剩余额度、目标接口权限、当前真实样本、错误和空结果、分页终止、字段含义、限流、成功请求实际计费。保存响应时剔除认证材料，再记录 provider、platform、adapter、采集时间、查询参数与完整性状态。

现有管理员 full/daily 归档只包含已有六张业务表。新增的长期资料表通过 `npm run evidence -- backup` 创建完整备份，不能仅凭旧归档文件宣称已备份所有资料。
