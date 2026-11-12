import type { RawHotItem, SourceConfig } from "./types";

const demoTopics: Record<string, Array<[string, string, number]>> = {
  weibo: [
    ["苏超城市德比继续刷屏", "地方足球和城市身份成为社交媒体共同玩梗对象", 4800000],
    ["高考作文题引发全民解读", "教育、代际经验和公共表达在微博集中发酵", 3900000],
    ["年轻人开始反向旅游", "县城、小城和非热门目的地正在获得注意力", 2100000]
  ],
  baidu: [
    ["苏超城市德比为什么这么火", "搜索用户正在主动理解地方赛事出圈原因", 3800000],
    ["高考作文题目", "全国性教育节点带来稳定搜索需求", 3500000],
    ["今年端午去哪玩", "假期消费和短途旅行需求上升", 1600000]
  ],
  zhihu: [
    ["如何看待苏超城市德比持续出圈", "知乎用户讨论地方认同、体育商业和城市传播", 2300000],
    ["今年高考作文题有哪些值得关注的信息", "知识社区倾向于拆解题目和教育信号", 1800000],
    ["为什么越来越多人选择反向旅游", "消费降级、审美疲劳和小城体验被放在一起讨论", 980000]
  ],
  bilibili: [
    ["苏超名场面混剪", "年轻用户用二创视频放大地方赛事的传播势能", 2800000],
    ["国产游戏新 PV 解析", "游戏社区围绕视觉表现和叙事期待展开讨论", 1200000],
    ["高考后的第一个暑假怎么过", "毕业季内容带动生活方式类视频热度", 900000]
  ],
  thepaper: [
    ["多地文旅回应苏超带来的城市热度", "媒体开始报道地方赛事对城市传播和消费的影响", 820000],
    ["教育部回应高考相关安排", "官方信息成为教育节点的权威来源", 760000],
    ["端午假期国内旅游市场观察", "主流媒体关注假期消费与流动趋势", 520000]
  ],
  toutiao: [
    ["苏超带火江苏多个城市", "算法资讯平台将地方体育、文旅和民生内容合流", 2600000],
    ["高考首日现场直击", "全国性节点持续占据资讯分发入口", 2200000],
    ["反向旅游城市名单", "生活消费类话题进入大众资讯流", 1100000]
  ]
};

export function buildDemoItems(sources: SourceConfig[]): RawHotItem[] {
  const fetchedAt = new Date().toISOString();

  return sources.flatMap((source) =>
    (demoTopics[source.id] ?? []).map(([title, description, heatValue], index) => ({
      sourceId: source.id,
      sourceName: source.displayName,
      sourceKind: source.kind,
      sourceCategory: source.category,
      rank: index + 1,
      title,
      url: source.primaryUrl,
      description,
      heatText: String(heatValue),
      heatValue,
      fetchedAt
    }))
  );
}
