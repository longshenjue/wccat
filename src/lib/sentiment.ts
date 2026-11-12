import type { Sentiment } from "./types";

const lexicon: Record<Sentiment, string[]> = {
  anger: ["怒", "骂", "抵制", "处罚", "事故", "通报", "崩", "爆雷", "打假", "造假"],
  dislike: ["吐槽", "翻车", "争议", "质疑", "不满", "避雷", "塌房"],
  anxiety: ["裁员", "失业", "房价", "降薪", "考试", "高考", "风险", "危机", "焦虑"],
  love: ["喜欢", "爆火", "封神", "治愈", "可爱", "夺冠", "冠军", "好看"],
  like: ["推荐", "上新", "好用", "值得", "票房", "热播"],
  curiosity: ["为什么", "如何", "首次", "发现", "揭秘", "原因", "是什么"],
  debate: ["如何看待", "争论", "讨论", "回应", "是否", "该不该", "专家称"],
  entertainment: ["明星", "电影", "综艺", "演唱会", "游戏", "二次元", "恋情", "直播"],
  neutral: []
};

export function inferSentiment(title: string): Sentiment {
  const scores = Object.entries(lexicon).map(([sentiment, words]) => ({
    sentiment: sentiment as Sentiment,
    score: words.filter((word) => title.includes(word)).length
  }));

  const best = scores.sort((left, right) => right.score - left.score)[0];
  return best && best.score > 0 ? best.sentiment : "neutral";
}

export function sentimentLabel(sentiment: Sentiment) {
  const labels: Record<Sentiment, string> = {
    love: "热爱",
    like: "喜欢",
    anger: "愤怒",
    dislike: "反感",
    curiosity: "好奇",
    anxiety: "焦虑",
    debate: "争议",
    entertainment: "娱乐",
    neutral: "中性"
  };

  return labels[sentiment];
}
