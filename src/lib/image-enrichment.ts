import { buildAiImageUrl } from "./ai-image";
import type { TopicGroup, TopicOccurrence } from "./types";

const imageHeaders = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

const referers: Record<string, string> = {
  weibo: "https://weibo.com/",
  baidu: "https://top.baidu.com/",
  zhihu: "https://www.zhihu.com/",
  bilibili: "https://www.bilibili.com/",
  thepaper: "https://www.thepaper.cn/",
  toutiao: "https://www.toutiao.com/",
  douyin: "https://www.douyin.com/",
  douban: "https://www.douban.com/",
  hupu: "https://bbs.hupu.com/",
  tieba: "https://tieba.baidu.com/",
  ngabbs: "https://bbs.nga.cn/",
  "36kr": "https://www.36kr.com/",
  ithome: "https://www.ithome.com/",
  "qq-news": "https://news.qq.com/",
  "sina-news": "https://news.sina.com.cn/",
  "netease-news": "https://news.163.com/",
  huxiu: "https://www.huxiu.com/",
  sspai: "https://sspai.com/"
};

type EnrichedImage = {
  sourceId: string;
  imageUrl: string;
};

export async function enrichTopicImages(topics: TopicGroup[]) {
  if (process.env.WCCAT_IMAGE_ENRICHMENT === "off") {
    return topics;
  }

  const limit = parsePositiveInt(process.env.WCCAT_IMAGE_ENRICH_TOPICS, 30);
  const targets = topics.slice(0, limit);
  const enriched = await mapWithConcurrency(targets, 4, enrichTopicImage);
  const enrichedById = new Map(enriched.filter(isEnrichedResult).map((item) => [item.topicId, item.image]));

  return topics.map((topic) => {
    if (topic.occurrences.some((item) => item.cover)) {
      return topic;
    }

    const image = enrichedById.get(topic.id);
    if (!image) {
      return topic;
    }

    return {
      ...topic,
      occurrences: topic.occurrences.map((item, index) =>
        index === 0 ? { ...item, cover: image.imageUrl } : item
      )
    };
  });
}

async function enrichTopicImage(topic: TopicGroup) {
  if (topic.occurrences.some((item) => item.cover)) {
    return null;
  }

  const fromArticle = await findArticleImage(topic.occurrences);
  if (fromArticle) {
    return { topicId: topic.id, image: fromArticle };
  }

  const aiImageUrl = buildAiImageUrl(topic);
  if (!aiImageUrl) {
    return null;
  }

  return {
    topicId: topic.id,
    image: {
      sourceId: topic.occurrences[0]?.sourceId ?? "ai",
      imageUrl: aiImageUrl
    }
  };
}

function isEnrichedResult(
  value: Awaited<ReturnType<typeof enrichTopicImage>>
): value is Exclude<Awaited<ReturnType<typeof enrichTopicImage>>, null> {
  return value !== null;
}

async function findArticleImage(occurrences: TopicOccurrence[]): Promise<EnrichedImage | null> {
  const candidates = occurrences
    .filter((item) => !item.cover && /^https?:\/\//.test(item.url))
    .slice(0, 3);

  for (const item of candidates) {
    const imageUrl = await fetchPageImage(item.url, item.sourceId);
    if (imageUrl) {
      return { sourceId: item.sourceId, imageUrl };
    }
  }

  return null;
}

async function fetchPageImage(url: string, sourceId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("image enrichment timeout"), 4500);

  try {
    const response = await fetch(url, {
      headers: {
        ...imageHeaders,
        referer: referers[sourceId] ?? new URL(url).origin
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return undefined;
    }

    const html = await response.text();
    return extractImageFromHtml(html, url);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function extractImageFromHtml(html: string, pageUrl: string) {
  const candidates = [
    metaContent(html, "property", "og:image"),
    metaContent(html, "property", "og:image:url"),
    metaContent(html, "name", "twitter:image"),
    metaContent(html, "itemprop", "image"),
    linkHref(html, "image_src"),
    firstImageSrc(html)
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const normalized = normalizeImageUrl(candidate, pageUrl);
    if (normalized && isUsefulImageUrl(normalized)) {
      return normalized;
    }
  }

  return undefined;
}

function metaContent(html: string, attr: string, value: string) {
  const pattern = new RegExp(
    `<meta[^>]+${attr}=["']${escapeRegExp(value)}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  return decodeHtml(html.match(pattern)?.[1] ?? "");
}

function linkHref(html: string, rel: string) {
  const pattern = new RegExp(
    `<link[^>]+rel=["'][^"']*${escapeRegExp(rel)}[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>`,
    "i"
  );
  return decodeHtml(html.match(pattern)?.[1] ?? "");
}

function firstImageSrc(html: string) {
  return decodeHtml(html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1] ?? "");
}

function normalizeImageUrl(rawUrl: string, pageUrl: string) {
  if (!rawUrl || rawUrl.startsWith("data:")) {
    return undefined;
  }

  try {
    return new URL(rawUrl, pageUrl).toString();
  } catch {
    return undefined;
  }
}

function isUsefulImageUrl(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes("logo") || lower.includes("avatar") || lower.includes("icon")) {
    return false;
  }
  return /\.(avif|webp|png|jpe?g)(\?|$)/i.test(lower) || lower.includes("image");
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
