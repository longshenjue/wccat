import { NextResponse } from "next/server";

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
    imageUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid image url" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(imageUrl.protocol)) {
    return NextResponse.json({ error: "Unsupported image url" }, { status: 400 });
  }

  const response = await fetch(imageUrl, {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      referer: referers[source] ?? imageUrl.origin,
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    next: { revalidate: 60 * 60 * 12 }
  });

  if (!response.ok || !response.body) {
    return NextResponse.json({ error: "Image fetch failed" }, { status: response.status || 502 });
  }

  return new NextResponse(response.body, {
    headers: {
      "cache-control": "public, max-age=43200, stale-while-revalidate=86400",
      "content-type": response.headers.get("content-type") ?? "image/jpeg"
    }
  });
}
