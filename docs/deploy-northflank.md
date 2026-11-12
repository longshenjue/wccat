# Northflank 部署操作指南

部署结构：同一个项目、同一个区域，两个 Combined Services。WcCAT 的网页和 worker 在同一单实例容器中共用 SQLite 持久卷；DailyHotApi 通过6688内网端口提供热点数据。

## 1. 创建项目

在 Northflank 的 Create New → Project 新建项目，名称可用 `wccat`。按账号实际可用区域选择，两个服务必须在同一项目与区域。使用平台托管云；BYOC需要另外承担云服务器费用。

## 2. 先部署 DailyHotApi

Create New → Service → Combined：

| 项目 | 填写值 |
| --- | --- |
| Name | `dailyhot-api` |
| Repository | `longshenjue/dailyhot-api` |
| Branch | `main` |
| Build type | `Dockerfile` |
| Dockerfile path | `/Dockerfile`（若界面使用相对路径则填 `Dockerfile`） |
| Build context | 仓库根目录 |
| Command / Entrypoint override | 留空，使用 Dockerfile CMD |
| Instances | `1` |
| Container port | `6688` |
| Protocol | HTTP |
| Accessibility | Private / Internal，关闭公网访问 |

Runtime environment variables：

```dotenv
NODE_ENV=docker
PORT=6688
TZ=Asia/Shanghai
REDIS_ENABLED=false
USE_LOG_FILE=false
CACHE_TTL=3600
REQUEST_TIMEOUT=10000
```

无需创建 Redis。`NODE_ENV`不能改为`production`，当前 DailyHotApi 入口只在`docker`或`development`环境启动服务。

创建后等待构建和部署完成。在 Networking 中复制6688端口的实际 Internal DNS/内网地址，后面填给 WcCAT。内网地址不能使用你的电脑地址或`localhost`。健康检查可使用 HTTP GET `/`。

## 3. 部署 WcCAT

同一项目中再新建 Combined Service：

| 项目 | 填写值 |
| --- | --- |
| Name | `wccat` |
| Repository | `longshenjue/wccat` |
| Branch | `main` |
| Build type | `Dockerfile` |
| Dockerfile path | `/Dockerfile`（或相对路径`Dockerfile`） |
| Build context | 仓库根目录 |
| Command / Entrypoint override | 留空 |
| Instances | **`1`，不启用自动扩容** |
| Container port | `3002` |
| Protocol | HTTP |
| Accessibility | Public |

Runtime environment variables：

```dotenv
NODE_ENV=production
PORT=3002
TZ=Asia/Shanghai
DEEPSEEK_API_KEY=在Northflank运行时秘密变量中填写真实密钥
DEEPSEEK_MODEL=deepseek-flash
WCCAT_ANALYZE_TOPICS=3
WCCAT_HOT_API_BASE=http://替换成实际DailyHotApi内网域名:6688
WCCAT_WORKER_ENABLED=true
WCCAT_IMAGE_ENRICHMENT=off
```

密钥只填Runtime Environment/Secret，不填Docker build arguments，不提交到GitHub。

Advanced/Volumes中创建并挂载持久卷：

- Name：`wccat-data`
- Access mode：**Single Read/Write**
- Size：建议先5GiB，按账号配额与预算确认
- Container mount path：**`/app/data`**
- Volume mount path：留空（整个卷挂载到上述目录）
- 使用镜像默认运行用户与用户组`node:node`，不要在平台强制切换成不同用户。

健康检查：HTTP GET `/api/health`，端口3002；启动检查给60～120秒余量。健康检查不调用AI或爬取热点，数据库不可访问时返回503。

配置必须在首次正式运行前完成，尤其是持久卷。普通容器磁盘会随容器替换而丢失数据。单卷模式不能多实例运行，也不要让独立Cron Job尝试写同一SQLite文件。

## 4. 初次数据与日报

新卷为空时，应用会自动创建数据库；worker启动后立即刷新，之后每小时整点刷新，北京时间每天00:10生成日报和英文分享内容。

如需马上生成日报，等第一次抓取完成后进入 `wccat → Containers → Shell`：

```bash
cd /app
npm run daily
```

其他维护命令：

```bash
npm run refresh -- top=3
npm run analyze -- top=3
npm run ai:logs -- limit=10
npm run check:sources
```

**不要再手工启动`npm run worker`**，镜像入口已经管理网页和worker两个进程。关闭Shell不影响自动任务。任一进程异常退出时，监督进程会停止另一个进程，再由平台重启容器；正常停止也会等待并清理两个进程。

## 5. 查看网站和验证

复制 WcCAT 的 Public DNS，在浏览器打开：

- `/`：小时榜
- `/daily`：日报和中英文PNG分享
- `/api/health`：健康检查，应返回`{"ok":true}`

检查Logs中的`starting web + worker`、`stored ... raw items ... topics`和`next hourly refresh`。重启一次WcCAT，确认历史快照仍存在，证明持久卷生效。

生产环境中`/admin`、`/api/admin/db`、`/api/analyze-topic`返回404；公开刷新接口也保持关闭。维护通过受控Shell执行。图片代理仅允许已知平台CDN，并逐跳校验重定向目标。

## 6. 本地历史数据迁移（可选）

默认从新数据库开始，不需要上传本机约640MB的历史数据库。如果要保留历史，先暂停云端WcCAT写入，通过SQLite备份功能创建一致性副本（不要只复制仍在写入的主文件），再通过受控Shell/CLI与临时受限存储传入`/app/data/wccat.sqlite`。导入后检查文件属主、恢复容器并验证查询。不要将数据库提交到GitHub，也不要公开提供数据库下载地址。

## 7. 免费额度与资源

Sandbox资源与卷权限以当前控制台为准。先看资源估算，再创建；不能仅根据“2个服务”承诺所有配置一定免费。WcCAT可从1GiB运行内存评估，DailyHotApi从512MiB评估；Next.js构建资源单独配置，内存不足时优先增加构建内存，而不是增加运行实例数。

存储会随快照和AI日志增长，需要定期备份和清理。DeepSeek调用费独立于Northflank免费额度。

官方操作参考：
- https://northflank.com/docs/v1/application/getting-started/build-and-deploy-your-code
- https://northflank.com/docs/v1/application/databases-and-persistence/add-a-volume
- https://northflank.com/docs/v1/application/network/configure-ports
- https://northflank.com/docs/v1/application/run/access-running-containers-locally
