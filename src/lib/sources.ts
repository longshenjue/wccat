import type { SourceConfig } from "./types";

const customDailyHotBase = process.env.WCCAT_HOT_API_BASE;
const developmentDailyHotBase = "http://localhost:6688";
const publicDailyHotBase = "https://api-hot.imsyy.top";
const dailyHotBase =
  customDailyHotBase ?? (process.env.NODE_ENV === "production" ? publicDailyHotBase : developmentDailyHotBase);
const dailyHotExtensionSourceIds = [
  "douyin",
  "tieba",
  "ngabbs",
  "36kr",
  "ithome",
  "qq-news",
  "sina-news",
  "netease-news",
  "huxiu",
  "sspai"
];
const optionalConfiguredSourceIds = process.env.WCCAT_XIAOHONGSHU_HOT_API_URL ? ["xiaohongshu"] : [];

export const SOURCES: SourceConfig[] = [
  {
    id: "weibo",
    name: "weibo",
    displayName: "微博热搜",
    category: "social",
    kind: "public",
    weight: 1.26,
    primaryUrl: "https://s.weibo.com/top/summary",
    thirdPartyUrl: `${dailyHotBase}/weibo`,
    notes: "公共讨论广场，适合捕捉突发事件、娱乐议题和公共情绪。"
  },
  {
    id: "baidu",
    name: "baidu",
    displayName: "百度热搜",
    category: "search",
    kind: "public",
    weight: 1.2,
    primaryUrl: "https://top.baidu.com/board?tab=realtime",
    thirdPartyUrl: `${dailyHotBase}/baidu`,
    notes: "搜索意图入口，反映更广泛人群主动查询的问题。"
  },
  {
    id: "zhihu",
    name: "zhihu",
    displayName: "知乎热榜",
    category: "social",
    kind: "public",
    weight: 1.1,
    primaryUrl: "https://www.zhihu.com/hot",
    thirdPartyUrl: `${dailyHotBase}/zhihu`,
    notes: "解释型讨论场，适合观察争议、知识型议题和公共问答。"
  },
  {
    id: "bilibili",
    name: "bilibili",
    displayName: "B 站热门",
    category: "video",
    kind: "public",
    weight: 1.15,
    primaryUrl: "https://www.bilibili.com/v/popular/all",
    thirdPartyUrl: `${dailyHotBase}/bilibili`,
    notes: "年轻文化与视频传播入口，适合捕捉亚文化、娱乐和长视频讨论。"
  },
  {
    id: "thepaper",
    name: "thepaper",
    displayName: "澎湃新闻",
    category: "news",
    kind: "official",
    weight: 0.94,
    primaryUrl: "https://www.thepaper.cn/",
    thirdPartyUrl: `${dailyHotBase}/thepaper`,
    notes: "主流新闻叙事入口，可辅助识别官方/媒体关注重点。"
  },
  {
    id: "toutiao",
    name: "toutiao",
    displayName: "今日头条",
    category: "news",
    kind: "public",
    weight: 1.05,
    primaryUrl: "https://www.toutiao.com/",
    thirdPartyUrl: `${dailyHotBase}/toutiao`,
    notes: "新闻聚合与算法分发入口，适合补充大众新闻注意力。"
  },
  {
    id: "douban",
    name: "douban",
    displayName: "豆瓣小组",
    category: "community",
    kind: "public",
    weight: 0.86,
    primaryUrl: "https://www.douban.com/group/explore",
    thirdPartyUrl: `${dailyHotBase}/douban-group`,
    notes: "兴趣小组和生活方式讨论场，适合观察更长尾、更日常的中文互联网情绪。"
  },
  {
    id: "hupu",
    name: "hupu",
    displayName: "虎扑热帖",
    category: "community",
    kind: "public",
    weight: 0.84,
    primaryUrl: "https://bbs.hupu.com/topic-daily",
    thirdPartyUrl: `${dailyHotBase}/hupu`,
    notes: "体育与男性兴趣社区，适合补充站队、调侃和强观点型讨论。"
  },
  {
    id: "xiaohongshu",
    name: "xiaohongshu",
    displayName: "小红书热点",
    category: "social",
    kind: "public",
    weight: 0.98,
    primaryUrl: "https://www.xiaohongshu.com/explore",
    notes: "生活方式、消费和城市经验入口。公开页面反爬较重，建议配置第三方只读热榜 API。"
  },
  {
    id: "douyin",
    name: "douyin",
    displayName: "抖音热点",
    category: "video",
    kind: "public",
    weight: 1.18,
    primaryUrl: "https://www.douyin.com/hot",
    thirdPartyUrl: `${dailyHotBase}/douyin`,
    notes: "短视频热点入口，适合观察大众娱乐、社会事件和即时情绪扩散。"
  },
  {
    id: "tieba",
    name: "tieba",
    displayName: "贴吧热议",
    category: "community",
    kind: "public",
    weight: 0.82,
    primaryUrl: "https://tieba.baidu.com/hottopic/browse/topicList",
    thirdPartyUrl: `${dailyHotBase}/tieba`,
    notes: "兴趣圈层和吧内讨论入口，适合捕捉垂直社区的争议和梗传播。"
  },
  {
    id: "ngabbs",
    name: "ngabbs",
    displayName: "NGA 热帖",
    category: "community",
    kind: "public",
    weight: 0.78,
    primaryUrl: "https://bbs.nga.cn/",
    thirdPartyUrl: `${dailyHotBase}/ngabbs`,
    notes: "游戏和硬核玩家社区，适合观察玩家对版本、厂商和产业事件的反应。"
  },
  {
    id: "36kr",
    name: "36kr",
    displayName: "36氪热榜",
    category: "business",
    kind: "public",
    weight: 0.76,
    primaryUrl: "https://www.36kr.com/hot-list/catalog",
    thirdPartyUrl: `${dailyHotBase}/36kr`,
    notes: "创业、商业和科技产业入口，适合补充公司、资本和消费市场议题。"
  },
  {
    id: "ithome",
    name: "ithome",
    displayName: "IT之家热榜",
    category: "business",
    kind: "public",
    weight: 0.78,
    primaryUrl: "https://www.ithome.com/",
    thirdPartyUrl: `${dailyHotBase}/ithome`,
    notes: "科技数码资讯入口，适合观察硬件、互联网产品和技术消费热点。"
  },
  {
    id: "qq-news",
    name: "qq-news",
    displayName: "腾讯新闻",
    category: "news",
    kind: "public",
    weight: 0.92,
    primaryUrl: "https://news.qq.com/",
    thirdPartyUrl: `${dailyHotBase}/qq-news`,
    notes: "综合新闻入口，适合补充大众新闻流和门户媒体关注重点。"
  },
  {
    id: "sina-news",
    name: "sina-news",
    displayName: "新浪新闻",
    category: "news",
    kind: "public",
    weight: 0.88,
    primaryUrl: "https://news.sina.com.cn/",
    thirdPartyUrl: `${dailyHotBase}/sina-news`,
    notes: "门户新闻入口，适合补充传统门户媒体的热点排序。"
  },
  {
    id: "netease-news",
    name: "netease-news",
    displayName: "网易新闻",
    category: "news",
    kind: "public",
    weight: 0.9,
    primaryUrl: "https://news.163.com/",
    thirdPartyUrl: `${dailyHotBase}/netease-news`,
    notes: "综合新闻入口，适合补充新闻客户端和门户分发语境。"
  },
  {
    id: "huxiu",
    name: "huxiu",
    displayName: "虎嗅24小时",
    category: "business",
    kind: "public",
    weight: 0.72,
    primaryUrl: "https://www.huxiu.com/",
    thirdPartyUrl: `${dailyHotBase}/huxiu`,
    notes: "商业观察和科技评论入口，适合补充产业解读型热点。"
  },
  {
    id: "sspai",
    name: "sspai",
    displayName: "少数派热榜",
    category: "community",
    kind: "public",
    weight: 0.68,
    primaryUrl: "https://sspai.com/",
    thirdPartyUrl: `${dailyHotBase}/sspai`,
    notes: "效率工具和数字生活社区，适合补充高质量小众科技消费议题。"
  },
  {
    id: "cctv",
    name: "cctv",
    displayName: "央视新闻",
    category: "news",
    kind: "official",
    weight: 1.0,
    primaryUrl: "https://news.cctv.com/",
    notes: "官方媒体核心信息源，第一版先作为官方叙事锚点和扩展接口。"
  },
  {
    id: "xinhua",
    name: "xinhua",
    displayName: "新华社",
    category: "news",
    kind: "official",
    weight: 1.0,
    primaryUrl: "https://www.news.cn/",
    notes: "官方媒体核心信息源，后续可用 RSS、站点抓取或第三方源补强。"
  }
];

export const ACTIVE_SOURCE_IDS = [
  "weibo",
  "baidu",
  "zhihu",
  "bilibili",
  "thepaper",
  "toutiao",
  "douban",
  "hupu",
  ...optionalConfiguredSourceIds,
  ...dailyHotExtensionSourceIds
];

export function getActiveSources() {
  const active = new Set(ACTIVE_SOURCE_IDS);
  return SOURCES.filter((source) => active.has(source.id));
}

export function getSourceById(sourceId: string) {
  return SOURCES.find((source) => source.id === sourceId);
}
