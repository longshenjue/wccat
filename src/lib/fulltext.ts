import type { TopicOccurrence } from "./types";

export type ArticleContext = {
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  text: string;
};

const textHeaders = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

export async function fetchArticleContexts(occurrences: TopicOccurrence[]) {
  const candidates = occurrences
    .filter((item) => /^https?:\/\//.test(item.url))
    .slice(0, 4);
  const contexts: ArticleContext[] = [];

  for (const item of candidates) {
    const text = await fetchArticleText(item.url);
    if (text) {
      contexts.push({
        sourceId: item.sourceId,
        sourceName: item.sourceName,
        title: item.title,
        url: item.url,
        text
      });
    }
  }

  return contexts;
}

async function fetchArticleText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("fulltext timeout"), 7000);

  try {
    const response = await fetch(url, {
      headers: textHeaders,
      signal: controller.signal
    });

    if (!response.ok) {
      return "";
    }

    const html = await response.text();
    return extractReadableText(html);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function extractReadableText(html: string) {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const metaDescription =
    withoutScripts.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    withoutScripts.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    "";
  const text = withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  return [metaDescription, text].filter(Boolean).join(" ").slice(0, 2200);
}
