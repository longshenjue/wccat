# 热榜接口与实现方案

本文档整理当前项目中指定热榜路由的上游接口、项目访问路径和核心实现方式。项目默认服务端口为 `6688`，因此本地访问路径示例为 `http://localhost:6688/<route>`。

## 通用机制

项目使用 `Hono` 注册路由。`src/registry.ts` 会扫描 `src/routes` 下的 `.ts` 或 `.js` 文件，并按文件名自动注册为接口路径。例如 `src/routes/zhihu.ts` 会注册为 `/zhihu`。

每个路由文件通常导出 `handleRoute(c, noCache)`，内部调用 `getList()` 拉取上游数据，然后统一转换为项目标准结构：

- `id`：条目 ID
- `title`：标题
- `desc`：摘要，可选
- `cover`：封面，可选
- `author`：作者或来源，可选
- `timestamp`：发布时间，可选
- `hot`：热度值，可选
- `url`：PC 端链接
- `mobileUrl`：移动端链接

通用请求工具在 `src/utils/getData.ts` 中，基于 `axios` 封装 `get()` 和 `post()`，默认支持：

- 请求超时：由 `REQUEST_TIMEOUT` 控制，默认 `6000ms`
- 缓存：默认使用 `CACHE_TTL`，默认 `3600s`
- 强制刷新：请求项目接口时加 `?cache=false`
- 限制条数：请求项目接口时加 `?limit=10`
- RSS 输出：请求项目接口时加 `?rss=true`

## 接口明细

### zhihu：知乎热榜

- 项目路径：`/zhihu`
- 实现文件：`src/routes/zhihu.ts`
- 上游接口：`https://api.zhihu.com/topstory/hot-lists/total?limit=50`
- 请求方式：`GET`
- 上游页面：`https://www.zhihu.com/hot`
- 特殊配置：支持通过环境变量 `ZHIHU_COOKIE` 注入 `Cookie`

实现方案：直接请求知乎热榜 JSON 接口，读取 `data` 数组。每条数据从 `target` 中取 `id`、`title`、`excerpt`、`created`、`url`，从 `children[0].thumbnail` 取封面，从 `detail_text` 中解析热度。最终链接会根据 `target.url` 中的问题 ID 拼成 `https://www.zhihu.com/question/<id>`。

### douyin：抖音热点

- 项目路径：`/douyin`
- 实现文件：`src/routes/douyin.ts`
- 上游接口：`https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1`
- 请求方式：`GET`
- 上游页面：`https://www.douyin.com`
- 预请求接口：`https://www.douyin.com/passport/general/login_guiding_strategy/?aid=6383`

实现方案：先请求抖音登录引导接口，从响应头 `set-cookie` 中用正则提取 `passport_csrf_token`，再把它作为 `Cookie: passport_csrf_token=<token>` 请求热点接口。数据来自 `data.word_list`，映射 `sentence_id`、`word`、`event_time`、`hot_value`，详情链接拼成 `https://www.douyin.com/hot/<sentence_id>`。

### tieba：贴吧热议

- 项目路径：`/tieba`
- 实现文件：`src/routes/tieba.ts`
- 上游接口：`https://tieba.baidu.com/hottopic/browse/topicList`
- 请求方式：`GET`
- 上游页面：`https://tieba.baidu.com/hottopic/browse/topicList`

实现方案：直接请求贴吧热议榜接口，读取 `data.bang_topic.topic_list`。每条记录使用 `topic_id`、`topic_name`、`topic_desc`、`topic_pic`、`discuss_num`、`create_time`、`topic_url` 转为标准榜单结构。

### ngabbs：NGA 热帖

- 项目路径：`/ngabbs`
- 实现文件：`src/routes/ngabbs.ts`
- 上游接口：`https://ngabbs.com/nuke.php?__lib=load_topic&__act=load_topic_reply_ladder2&opt=1&all=1`
- 请求方式：`POST`
- 上游页面：`https://ngabbs.com/`
- 请求体：`{ "__output": "14" }`

实现方案：使用模拟客户端请求头，包括 `Referer`、`Host`、`Content-Type`、`User-Agent` 和 `X-User-Agent`。接口返回 `result` 二维数组，项目取 `result[0]`，将 `tid`、`subject`、`author`、`replies`、`postdate`、`tpcurl` 转换为标准结构，链接拼为 `https://bbs.nga.cn<tpcurl>`。

### 36kr：36氪热榜

- 项目路径：`/36kr`
- 实现文件：`src/routes/36kr.ts`
- 上游接口：`https://gateway.36kr.com/api/mis/nav/home/nav/rank/<type>`
- 请求方式：`POST`
- 上游页面：`https://m.36kr.com/hot-list-m`
- 分类参数：`type=hot|video|comment|collect`

实现方案：默认 `type=hot`。请求体包含 `partner_id: "wap"`、`siteId: 1`、`platformId: 2` 和当前时间戳。不同分类对应不同列表字段：`hotRankList`、`videoList`、`remarkList`、`collectList`。项目从 `templateMaterial` 中取标题、封面、作者、收藏数，并根据 `itemId` 拼出 PC 和移动端文章链接。

### ithome：IT之家热榜

- 项目路径：`/ithome`
- 实现文件：`src/routes/ithome.ts`
- 上游地址：`https://m.ithome.com/rankm/`
- 请求方式：`GET`
- 数据类型：HTML 页面

实现方案：请求移动端热榜页面后用 `cheerio` 解析 HTML。项目选择 `.rank-box .placeholder` 节点，提取链接、标题、封面、发布时间和评论数。链接会通过 `replaceLink()` 把移动端链接转换成 `https://www.ithome.com/0/<prefix>/<suffix>.htm` 格式。

### qq-news：腾讯新闻

- 项目路径：`/qq-news`
- 实现文件：`src/routes/qq-news.ts`
- 上游接口：`https://r.inews.qq.com/gw/event/hot_ranking_list?page_size=50`
- 请求方式：`GET`
- 上游页面：`https://news.qq.com/`

实现方案：直接请求腾讯新闻热点榜 JSON，读取 `idlist[0].newslist`，并跳过第一个元素 `slice(1)`。项目使用 `id`、`title`、`abstract`、`miniProShareImage`、`source`、`hotEvent.hotScore`、`timestamp`，PC 链接为 `https://new.qq.com/rain/a/<id>`，移动端链接为 `https://view.inews.qq.com/k/<id>`。

### sina-news：新浪新闻

- 项目路径：`/sina-news`
- 实现文件：`src/routes/sina-news.ts`
- 上游接口：`https://top.<www>.sina.com.cn/ws/GetTopDataList.php?top_type=day&top_cat=<params>&top_time=<YYYYMMDD>&top_show_num=50`
- 请求方式：`GET`
- 上游页面：`https://sinanews.sina.cn/`
- 分类参数：`type=1` 到 `type=11`

实现方案：根据 `type` 映射新浪的频道域名和榜单分类参数，例如总排行、视频排行、国内新闻、财经新闻等。接口返回的是 `var data = {...};` 格式，项目先去掉 JSONP 包装再 `JSON.parse()`。条目使用 `id`、`title`、`media`、`top_num`、`create_date`、`create_time`、`url`，热度会去掉逗号后转数字。

### netease-news：网易新闻

- 项目路径：`/netease-news`
- 实现文件：`src/routes/netease-news.ts`
- 上游接口：`https://m.163.com/fe/api/hot/news/flow`
- 请求方式：`GET`
- 上游页面：`https://m.163.com/hot`

实现方案：直接请求网易移动端热点接口，读取 `data.list`。项目使用 `docid`、`title`、`imgsrc`、`source`、`ptime`，热度字段没有上游数据，因此设置为 `undefined`。PC 链接拼为 `https://www.163.com/dy/article/<docid>.html`，移动端链接拼为 `https://m.163.com/dy/article/<docid>.html`。

### huxiu：虎嗅24小时

- 项目路径：`/huxiu`
- 实现文件：`src/routes/huxiu.ts`
- 上游接口：`https://moment-api.huxiu.com/web-v3/moment/feed?platform=www`
- 请求方式：`GET`
- 上游页面：`https://www.huxiu.com/moment/`
- 特殊说明：该路由直接使用 `axios.get()`，没有走项目通用缓存工具

实现方案：请求虎嗅 24 小时接口时带 `User-Agent: Mozilla/5.0` 和 `Referer`。数据读取 `data.moment_list.datalist`。项目把 `content` 中的 `<br>` 替换成换行，第一行作为标题，剩余内容作为摘要；使用 `object_id`、`user_info.username`、`publish_time`、`count_info.agree_num` 生成标准结构。

### sspai：少数派热榜

- 项目路径：`/sspai`
- 实现文件：`src/routes/sspai.ts`
- 上游接口：`https://sspai.com/api/v1/article/tag/page/get?limit=40&tag=<type>`
- 请求方式：`GET`
- 上游页面：`https://sspai.com/`
- 分类参数：`type=热门文章|应用推荐|生活方式|效率技巧|少数派播客`

实现方案：默认分类为 `热门文章`。接口返回文章列表 `data`，项目提取 `id`、`title`、`summary`、`banner`、`author.nickname`、`released_time`、`like_count`，链接拼为 `https://sspai.com/post/<id>`。

### weibo：微博热搜

- 项目路径：`/weibo`
- 实现文件：`src/routes/weibo.ts`
- 上游接口：`https://weibo.com/ajax/side/hotSearch`
- 请求方式：`GET`
- 上游页面：`https://s.weibo.com/top/summary/`
- 缓存策略：该路由 `ttl` 设置为 `60s`

实现方案：请求时带 `Referer: https://weibo.com/` 和浏览器 `User-Agent`。读取 `data.realtime`，使用 `mid`、`word`、`word_scheme`、`onboard_time`。项目没有使用热度数值，`hot` 为 `undefined`；详情链接通过关键词拼为 `https://s.weibo.com/weibo?q=<encoded title>`。

### baidu：百度热搜

- 项目路径：`/baidu`
- 实现文件：`src/routes/baidu.ts`
- 上游地址：`https://top.baidu.com/board?tab=<type>`
- 请求方式：`GET`
- 上游页面：`https://top.baidu.com/board`
- 分类参数：`type=realtime|novel|movie|teleplay|car|game`
- 数据类型：HTML 页面内嵌 JSON

实现方案：请求百度热搜页面时带浏览器 `User-Agent`。项目从 HTML 注释中用正则提取 `<!--s-data:...-->`，再解析 JSON。兼容 `data.cards[0].content` 和 `cards[0].content` 两种结构。条目使用 `word/title`、`desc`、`img/imgInfo.src`、`show`、`hotScore/hotTag`，PC 链接拼为百度搜索地址，移动端链接优先使用上游 `rawUrl` 或 `url`。

### bilibili：B 站热门

- 项目路径：`/bilibili`
- 实现文件：`src/routes/bilibili.ts`
- 主接口：`https://api.bilibili.com/x/web-interface/ranking/v2?rid=<type>&type=all&<wbiData>`
- 备用接口：`https://api.bilibili.com/x/web-interface/ranking?jsonp=jsonp?rid=<type>&type=all&callback=__jp0`
- WBI Key 接口：`https://api.bilibili.com/x/web-interface/nav`
- 请求方式：`GET`
- 上游页面：`https://www.bilibili.com/v/popular/rank/all`
- 分类参数：`type=0|1|3|4|5|188|119|129|155|160|168|181`

实现方案：先通过 `src/utils/getToken/bilibili.ts` 获取 B 站 WBI 签名参数。工具请求 `x/web-interface/nav` 拿到 `img_key` 和 `sub_key`，按固定表重排后生成 `mixin_key`，再对参数计算 `w_rid`。主接口请求带完整浏览器相关 Headers。如果主接口返回 `data.list`，使用新接口数据；如果触发风控或无数据，则降级到旧版 ranking 接口。项目从条目中提取 `bvid`、`title`、`desc`、`pic`、`owner.name/author`、`pubdate`、`stat.view/video_review`。

### thepaper：澎湃新闻

- 项目路径：`/thepaper`
- 实现文件：`src/routes/thepaper.ts`
- 上游接口：`https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar`
- 请求方式：`GET`
- 上游页面：`https://www.thepaper.cn/`

实现方案：直接请求澎湃首页右侧栏接口，读取 `data.hotNews`。项目使用 `contId`、`name`、`pic`、`praiseTimes`、`pubTimeLong`，链接拼为 `https://www.thepaper.cn/newsDetail_forward_<contId>`，移动端链接拼为 `https://m.thepaper.cn/newsDetail_forward_<contId>`。

### toutiao：今日头条

- 项目路径：`/toutiao`
- 实现文件：`src/routes/toutiao.ts`
- 上游接口：`https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc`
- 请求方式：`GET`
- 上游页面：`https://www.toutiao.com/`

实现方案：直接请求头条 PC 热榜接口，读取 `data` 数组。项目使用 `ClusterIdStr`、`Title`、`Image.url`、`HotValue`，时间字段通过 `ClusterIdStr` 传给 `getTime()`。PC 链接为 `https://www.toutiao.com/trending/<ClusterIdStr>/`，移动端链接为头条专题落地页。

### douban：豆瓣小组

- 项目路径：`/douban-group`
- 实现文件：`src/routes/douban-group.ts`
- 上游地址：`https://www.douban.com/group/explore`
- 请求方式：`GET`
- 数据类型：HTML 页面
- 注意：当前项目没有 `/douban` 路由，豆瓣小组对应的是 `/douban-group`

实现方案：请求豆瓣小组探索页后用 `cheerio` 解析 HTML。项目选择 `.article .channel-item` 节点，提取 `h3 a` 的标题和链接、`.pic-wrap img` 的封面、`.block p` 的摘要、`span.pubtime` 的发布时间。ID 从链接中提取数字；PC 链接优先使用原始链接，移动端链接拼为 `https://m.douban.com/group/topic/<id>/`。

### hupu：虎扑热帖

- 项目路径：`/hupu`
- 实现文件：`src/routes/hupu.ts`
- 上游接口：`https://m.hupu.com/api/v2/bbs/topicThreads?topicId=<type>&page=1`
- 请求方式：`GET`
- 上游页面：`https://bbs.hupu.com/all-gambia`
- 分类参数：`type=1|6|11|12|612`

实现方案：默认 `type=1`，对应步行街主干道。接口返回 `data.topicThreads`，项目使用 `tid`、`title`、`username`、`replies`、`url`，PC 链接拼为 `https://bbs.hupu.com/<tid>.html`，移动端链接使用上游返回的 `url`。

## 本地调用示例

```bash
# 获取知乎热榜
curl http://localhost:6688/zhihu

# 获取 36 氪视频榜
curl "http://localhost:6688/36kr?type=video"

# 获取百度电影热搜，并限制 10 条
curl "http://localhost:6688/baidu?type=movie&limit=10"

# 强制刷新微博热搜缓存
curl "http://localhost:6688/weibo?cache=false"
```

## 维护注意事项

- 如果上游接口需要浏览器环境，优先补充 `Referer` 和 `User-Agent`，当前项目已有微博、百度、B 站、虎嗅等示例。
- 如果上游返回 HTML，优先使用 `cheerio` 解析结构化节点，例如 IT之家、百度、豆瓣小组。
- 如果上游返回 JSONP 或内嵌 JSON，需要先做格式提取，例如新浪新闻和百度热搜。
- 对容易变动或风控较强的接口，可以增加备用接口或 Cookie/Token 配置，例如 B 站备用接口、知乎 `ZHIHU_COOKIE`、抖音临时 Cookie。
- 新增路由只需要在 `src/routes` 下新增同名文件并导出 `handleRoute`，项目会自动注册为 `/<filename>`。
