export function normalizeExternalUrl(url: string, sourceId: string, title?: string) {
  if (url.startsWith("/") && sourceId === "hupu") {
    return `https://bbs.hupu.com${url}`;
  }

  if (sourceId === "xiaohongshu" && title && (!url || url === "https://www.xiaohongshu.com/explore")) {
    return `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(title)}`;
  }

  if (sourceId === "douyin" && title && (!url || url === "https://www.douyin.com/hot")) {
    return `https://www.douyin.com/search/${encodeURIComponent(title)}`;
  }

  if (sourceId === "tieba" && title && (!url || url === "https://tieba.baidu.com/hottopic/browse/topicList")) {
    return `https://tieba.baidu.com/f/search/res?ie=utf-8&qw=${encodeURIComponent(title)}`;
  }

  if (sourceId !== "baidu") {
    return url;
  }

  try {
    const parsed = new URL(url);
    const keyword = parsed.searchParams.get("word") || parsed.searchParams.get("wd") || title;

    if (keyword) {
      return `https://www.baidu.com/s?wd=${encodeURIComponent(keyword)}`;
    }
  } catch {
    // Fall through to title-based PC search.
  }

  return title
    ? `https://www.baidu.com/s?wd=${encodeURIComponent(title)}`
    : "https://www.baidu.com/";
}
