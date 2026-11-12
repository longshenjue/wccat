import { NextResponse } from "next/server";
import { parseAllowedImageUrl } from "@/lib/image-proxy";

export const dynamic = "force-dynamic";

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
  sspai: "https://sspai.com/",
  ai: "https://image.pollinations.ai/"
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  const source = searchParams.get("source") ?? "";

  if (!rawUrl) {
    return NextResponse.json({ error: "Missing image url" }, { status: 400 });
  }

  let imageUrl: URL;
  try {
    imageUrl = parseAllowedImageUrl(rawUrl);
  } catch {
    return NextResponse.json({ error: "Unapproved image url" }, { status: 400 });
  }

  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const response = await fetch(imageUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
        headers: {
          accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          referer: referers[source] ?? imageUrl.origin,
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) break;
        try {
          imageUrl = parseAllowedImageUrl(new URL(location, imageUrl).toString());
        } catch {
          return NextResponse.json({ error: "Unapproved image redirect" }, { status: 403 });
        }
        continue;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        return NextResponse.json({ error: "Image fetch failed" }, { status: response.status || 502 });
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("image/")) {
        await response.body.cancel();
        return NextResponse.json({ error: "Upstream did not return an image" }, { status: 502 });
      }
      return new NextResponse(response.body, {
        headers: {
          "cache-control": "public, max-age=43200, stale-while-revalidate=86400",
          "content-type": contentType,
          "x-content-type-options": "nosniff"
        }
      });
    }
    return NextResponse.json({ error: "Too many image redirects" }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "Image fetch failed" }, { status: 502 });
  }
}
