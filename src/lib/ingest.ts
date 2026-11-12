import type { EngagementStats, RawHotItem, SourceConfig } from "./types";
import { normalizeExternalUrl } from "./links";

type UnknownRecord = Record<string, unknown>;

const requestHeaders = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "application/json,text/plain,*/*",
  referer: "https://www.baidu.com/"
};

export async function fetchSource(source: SourceConfig): Promise<RawHotItem[]> {
  const directItems = await fetchDirectSource(source);
  if (directItems.length > 0) {
    return directItems;
  }

  if (!source.thirdPartyUrl) {
    return [];
  }

  return fetchThirdPartySource(source);
}

export async function fetchAllSources(sources: SourceConfig[]) {
  const settled = await Promise.allSettled(sources.map((source) => fetchSource(source)));
  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

async function fetchDirectSource(source: SourceConfig): Promise<RawHotItem[]> {
  if (source.id === "zhihu") {
    return fetchZhihu(source);
  }

  if (source.id === "bilibili") {
    return fetchBilibili(source);
  }

  if (source.id === "weibo") {
    return fetchWeibo(source);
  }

  if (source.id === "baidu") {
    return fetchBaidu(source);
  }

  if (source.id === "toutiao") {
    return fetchToutiao(source);
  }

  if (source.id === "thepaper") {
    return fetchThePaper(source);
  }

  if (source.id === "douban") {
    return fetchDoubanGroup(source);
  }

  if (source.id === "hupu") {
    return fetchHupu(source);
  }

  if (source.id === "douyin") {
    return fetchDouyin(source);
  }

  if (source.id === "tieba") {
    return fetchTieba(source);
  }

  if (source.id === "ngabbs") {
    return fetchNgabbs(source);
  }

  if (source.id === "36kr") {
    return fetch36Kr(source);
  }

  if (source.id === "ithome") {
    return fetchIthome(source);
  }

  if (source.id === "qq-news") {
    return fetchQqNews(source);
  }

  if (source.id === "sina-news") {
    return fetchSinaNews(source);
  }

  if (source.id === "netease-news") {
    return fetchNeteaseNews(source);
  }

  if (source.id === "huxiu") {
    return fetchHuxiu(source);
  }

  if (source.id === "sspai") {
    return fetchSspai(source);
  }

  if (source.id === "xiaohongshu") {
    return fetchXiaohongshu(source);
  }

  return [];
}

async function fetchThirdPartySource(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const payload = await fetchJson(source.thirdPartyUrl as string, source.displayName);
    return normalizePayload(payload, source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} fetch failed: ${message}`);
    return [];
  }
}

async function fetchBilibili(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const payload = await fetchJson(
      "https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1",
      source.displayName,
      {
        referer: "https://www.bilibili.com/"
      }
    );

    if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.list)) {
      return [];
    }

    const fetchedAt = new Date().toISOString();
    return payload.data.list
      .filter(isRecord)
      .map((item, index) => normalizeItem(item, source, index + 1, fetchedAt))
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchBaidu(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const payload = await fetchJson(
      "https://top.baidu.com/api/board?platform=wise&tab=realtime",
      source.displayName
    );

    if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.cards)) {
      return [];
    }

    const fetchedAt = new Date().toISOString();
    return flattenRecords(payload.data.cards)
      .map((item, index) => normalizeItem(item, source, index + 1, fetchedAt))
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchWeibo(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const payload = await fetchJson("https://weibo.com/ajax/side/hotSearch", source.displayName, {
      referer: "https://weibo.com/"
    });

    if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.realtime)) {
      return [];
    }

    const fetchedAt = new Date().toISOString();
    return payload.data.realtime
      .filter(isRecord)
      .map((item, index) => normalizeItem(item, source, index + 1, fetchedAt))
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchToutiao(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const payload = await fetchJson(
      "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
      source.displayName,
      {
        referer: "https://www.toutiao.com/"
      }
    );

    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      return [];
    }

    const fetchedAt = new Date().toISOString();
    return payload.data
      .filter(isRecord)
      .map((item, index) => normalizeItem(item, source, index + 1, fetchedAt))
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchThePaper(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const payload = await fetchJson(
      "https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar",
      source.displayName,
      {
        referer: "https://www.thepaper.cn/"
      }
    );

    if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.hotNews)) {
      return [];
    }

    const fetchedAt = new Date().toISOString();
    return payload.data.hotNews
      .filter(isRecord)
      .map((item, index) => normalizeItem(item, source, index + 1, fetchedAt))
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchDoubanGroup(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const html = await fetchText("https://www.douban.com/group/explore", source.displayName, {
      accept: "text/html,application/xhtml+xml",
      referer: "https://www.douban.com/"
    });
    const fetchedAt = new Date().toISOString();

    return extractHtmlLinks(html, (href) => href.includes("/group/topic/"))
      .slice(0, 40)
      .map((item, index) => normalizeItem(item, source, index + 1, fetchedAt))
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchHupu(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const pages = await Promise.all(
      [1, 2, 3, 4, 5].map((page) =>
        fetchJson(
          `https://m.hupu.com/api/v2/bbs/topicThreads?topicId=1&page=${page}`,
          source.displayName,
          {
            referer: "https://bbs.hupu.com/all-gambia"
          }
        ).catch(() => null)
      )
    );
    const topicThreads = pages.flatMap((payload) => {
      if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.topicThreads)) {
        return [];
      }
      return payload.data.topicThreads.filter(isRecord);
    });

    if (topicThreads.length === 0) {
      return [];
    }

    const fetchedAt = new Date().toISOString();
    return topicThreads
      .map((item, index) =>
        normalizeItem(
          {
            title: getString(item, ["title"]),
            url: buildHupuUrl(item),
            mobileUrl: getString(item, ["url"]),
            hot: getNumber(item, ["replies"])
          },
          source,
          index + 1,
          fetchedAt
        )
      )
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchDouyin(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const cookie = await fetchDouyinCookie(source.displayName);
    const payload = await fetchJson(
      "https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1",
      source.displayName,
      {
        cookie,
        referer: "https://www.douyin.com/",
        accept: "application/json,text/plain,*/*"
      }
    );

    const wordList =
      isRecord(payload) &&
      isRecord(payload.data) &&
      Array.isArray(payload.data.word_list)
        ? payload.data.word_list
        : [];
    const fetchedAt = new Date().toISOString();

    return wordList
      .filter(isRecord)
      .map((item, index) =>
        normalizeItem(
          {
            title: getString(item, ["word"]),
            hot: getNumber(item, ["hot_value"]),
            url: buildDouyinHotUrl(item),
            mobileUrl: buildDouyinHotUrl(item)
          },
          source,
          index + 1,
          fetchedAt
        )
      )
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchNgabbs(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const payload = await postForm(
      "https://ngabbs.com/nuke.php?__lib=load_topic&__act=load_topic_reply_ladder2&opt=1&all=1",
      source.displayName,
      { __output: "14" },
      {
        accept: "*/*",
        host: "ngabbs.com",
        referer: "https://ngabbs.com/",
        "x-user-agent": "NGA_skull/7.3.1(iPhone13,2;iOS 17.2.1)"
      }
    );
    const list =
      isRecord(payload) &&
      Array.isArray(payload.result) &&
      Array.isArray(payload.result[0])
        ? payload.result[0]
        : [];
    const fetchedAt = new Date().toISOString();

    return list
      .filter(isRecord)
      .map((item, index) =>
        normalizeItem(
          {
            title: getString(item, ["subject"]),
            description: getString(item, ["author"]),
            hot: getNumber(item, ["replies"]),
            url: buildNgabbsUrl(item),
            mobileUrl: buildNgabbsUrl(item)
          },
          source,
          index + 1,
          fetchedAt
        )
      )
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchZhihu(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const payload = await fetchJson(
      "https://api.zhihu.com/topstory/hot-lists/total?limit=50",
      source.displayName,
      {
        referer: "https://www.zhihu.com/hot",
        ...(process.env.ZHIHU_COOKIE ? { cookie: process.env.ZHIHU_COOKIE } : {})
      }
    );

    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      return [];
    }

    const fetchedAt = new Date().toISOString();
    return payload.data
      .filter(isRecord)
      .map((item, index) => {
        const target = isRecord(item.target) ? item.target : item;
        const firstChild = Array.isArray(item.children) && isRecord(item.children[0]) ? item.children[0] : {};
        return normalizeItem(
          {
            title: getString(target, ["title"]),
            description: getString(target, ["excerpt", "description"]),
            cover: getString(firstChild, ["thumbnail"]),
            hot: getString(item, ["detail_text"]),
            url: buildZhihuUrl(target)
          },
          source,
          index + 1,
          fetchedAt
        );
      })
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchTieba(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const payload = await fetchJson("https://tieba.baidu.com/hottopic/browse/topicList", source.displayName, {
      referer: "https://tieba.baidu.com/hottopic/browse/topicList"
    });
    const topicList =
      isRecord(payload) &&
      isRecord(payload.data) &&
      isRecord(payload.data.bang_topic) &&
      Array.isArray(payload.data.bang_topic.topic_list)
        ? payload.data.bang_topic.topic_list
        : [];
    const fetchedAt = new Date().toISOString();

    return topicList
      .filter(isRecord)
      .map((item, index) =>
        normalizeItem(
          {
            title: getString(item, ["topic_name"]),
            description: getString(item, ["topic_desc"]),
            cover: getString(item, ["topic_pic"]),
            hot: getNumber(item, ["discuss_num"]),
            url: getString(item, ["topic_url"]) || buildSearchUrl(source.primaryUrl, getString(item, ["topic_name"]) ?? "")
          },
          source,
          index + 1,
          fetchedAt
        )
      )
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetch36Kr(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const payload = await postJson(
      "https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot",
      source.displayName,
      {
        partner_id: "wap",
        param: {
          siteId: 1,
          platformId: 2,
          timestamp: Date.now()
        }
      },
      {
        origin: "https://m.36kr.com",
        referer: "https://m.36kr.com/hot-list-m"
      }
    );
    const fetchedAt = new Date().toISOString();

    return extract36KrLists(payload)
      .map((item, index) => {
        const material = isRecord(item.templateMaterial) ? item.templateMaterial : item;
        const itemId = getString(item, ["itemId", "id"]) || getString(material, ["itemId", "id"]);
        return normalizeItem(
          {
            title: getString(material, ["widgetTitle", "title"]),
            description: getString(material, ["summary", "description"]),
            cover: getString(material, ["widgetImage", "cover", "image"]),
            hot: getNumber(material, ["collectCount", "statCollect", "hot"]),
            url: itemId ? `https://www.36kr.com/p/${itemId}` : undefined,
            mobileUrl: itemId ? `https://m.36kr.com/p/${itemId}` : undefined
          },
          source,
          index + 1,
          fetchedAt
        );
      })
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchIthome(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const html = await fetchText("https://m.ithome.com/rankm/", source.displayName, {
      accept: "text/html,application/xhtml+xml",
      referer: "https://m.ithome.com/rankm/"
    });
    const fetchedAt = new Date().toISOString();

    return extractIthomeItems(html)
      .map((item, index) => normalizeItem(item, source, index + 1, fetchedAt))
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchQqNews(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const payload = await fetchJson("https://r.inews.qq.com/gw/event/hot_ranking_list?page_size=50", source.displayName, {
      referer: "https://news.qq.com/"
    });
    const newsList =
      isRecord(payload) &&
      Array.isArray(payload.idlist) &&
      isRecord(payload.idlist[0]) &&
      Array.isArray(payload.idlist[0].newslist)
        ? payload.idlist[0].newslist.slice(1)
        : [];
    const fetchedAt = new Date().toISOString();

    return newsList
      .filter(isRecord)
      .map((item, index) =>
        normalizeItem(
          {
            title: getString(item, ["title"]),
            description: getString(item, ["abstract", "desc"]),
            cover: getString(item, ["miniProShareImage", "image"]),
            hot: getNestedNumber(item, ["hotEvent"], ["hotScore"]),
            url: buildQqNewsUrl(item),
            mobileUrl: buildQqNewsMobileUrl(item)
          },
          source,
          index + 1,
          fetchedAt
        )
      )
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchSinaNews(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const date = new Date();
    const yyyymmdd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const text = await fetchText(
      `https://top.news.sina.com.cn/ws/GetTopDataList.php?top_type=day&top_cat=www_all_suda_suda&top_time=${yyyymmdd}&top_show_num=50`,
      source.displayName,
      {
        accept: "application/javascript,text/plain,*/*",
        referer: "https://news.sina.com.cn/"
      }
    );
    const payload = parseJsonpObject(text);
    const list = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
    const fetchedAt = new Date().toISOString();

    return list
      .filter(isRecord)
      .map((item, index) => normalizeItem(item, source, index + 1, fetchedAt))
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchNeteaseNews(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const payload = await fetchJson("https://m.163.com/fe/api/hot/news/flow", source.displayName, {
      referer: "https://m.163.com/hot"
    });
    const list = isRecord(payload) && isRecord(payload.data) && Array.isArray(payload.data.list) ? payload.data.list : [];
    const fetchedAt = new Date().toISOString();

    return list
      .filter(isRecord)
      .map((item, index) =>
        normalizeItem(
          {
            title: getString(item, ["title"]),
            description: getString(item, ["digest", "source"]),
            cover: getString(item, ["imgsrc"]),
            url: buildNeteaseUrl(item),
            mobileUrl: buildNeteaseMobileUrl(item)
          },
          source,
          index + 1,
          fetchedAt
        )
      )
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchHuxiu(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const payload = await fetchJson("https://moment-api.huxiu.com/web-v3/moment/feed?platform=www", source.displayName, {
      referer: "https://www.huxiu.com/moment/"
    });
    const list =
      isRecord(payload) &&
      isRecord(payload.data) &&
      isRecord(payload.data.moment_list) &&
      Array.isArray(payload.data.moment_list.datalist)
        ? payload.data.moment_list.datalist
        : [];
    const fetchedAt = new Date().toISOString();

    return list
      .filter(isRecord)
      .map((item, index) => {
        const content = getString(item, ["content"])?.replace(/<br\s*\/?>/gi, "\n") ?? "";
        const lines = content.split(/\n+/).map((line) => line.trim()).filter(Boolean);
        return normalizeItem(
          {
            title: lines[0] || content.slice(0, 60),
            description: lines.slice(1).join(" ") || content,
            hot: getNestedNumber(item, ["count_info"], ["agree_num"]),
            url: buildHuxiuUrl(item)
          },
          source,
          index + 1,
          fetchedAt
        );
      })
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchSspai(source: SourceConfig): Promise<RawHotItem[]> {
  try {
    const payload = await fetchJson(
      "https://sspai.com/api/v1/article/tag/page/get?limit=40&tag=%E7%83%AD%E9%97%A8%E6%96%87%E7%AB%A0",
      source.displayName,
      {
        referer: "https://sspai.com/"
      }
    );
    const list = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
    const fetchedAt = new Date().toISOString();

    return list
      .filter(isRecord)
      .map((item, index) =>
        normalizeItem(
          {
            title: getString(item, ["title"]),
            description: getString(item, ["summary"]),
            cover: getString(item, ["banner"]),
            hot: getNumber(item, ["like_count"]),
            url: buildSspaiUrl(item)
          },
          source,
          index + 1,
          fetchedAt
        )
      )
      .filter((item): item is RawHotItem => Boolean(item?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} direct fetch failed: ${message}`);
    return [];
  }
}

async function fetchXiaohongshu(source: SourceConfig): Promise<RawHotItem[]> {
  const endpoint = process.env.WCCAT_XIAOHONGSHU_HOT_API_URL;
  if (!endpoint) {
    return [];
  }

  try {
    const token = process.env.WCCAT_XIAOHONGSHU_API_KEY;
    const payload = await fetchJson(endpoint, source.displayName, {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      referer: "https://www.xiaohongshu.com/"
    });
    return normalizePayload(payload, source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[WcCAT] ${source.id} configured fetch failed: ${message}`);
    return [];
  }
}

async function fetchJson(url: string, label: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    headers: {
      ...requestHeaders,
      ...headers
    }
  });

  if (!response.ok) {
    throw new Error(`${label} returned ${response.status}`);
  }

  return (await response.json()) as unknown;
}

async function postJson(
  url: string,
  label: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...requestHeaders,
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`${label} returned ${response.status}`);
  }

  return (await response.json()) as unknown;
}

async function postForm(
  url: string,
  label: string,
  body: Record<string, string>,
  headers: Record<string, string> = {}
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...requestHeaders,
      "content-type": "application/x-www-form-urlencoded",
      ...headers
    },
    body: new URLSearchParams(body).toString()
  });

  if (!response.ok) {
    throw new Error(`${label} returned ${response.status}`);
  }

  return (await response.json()) as unknown;
}

async function fetchDouyinCookie(label: string) {
  const response = await fetch("https://www.douyin.com/passport/general/login_guiding_strategy/?aid=6383", {
    headers: {
      ...requestHeaders,
      referer: "https://www.douyin.com/"
    }
  });

  if (!response.ok) {
    throw new Error(`${label} cookie returned ${response.status}`);
  }

  const setCookie = response.headers.get("set-cookie") ?? "";
  const token = setCookie.match(/passport_csrf_token=([^;]+)/)?.[1];
  return token ? `passport_csrf_token=${token}` : "";
}

async function fetchText(url: string, label: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    headers: {
      ...requestHeaders,
      ...headers
    }
  });

  if (!response.ok) {
    throw new Error(`${label} returned ${response.status}`);
  }

  return response.text();
}

function normalizePayload(payload: unknown, source: SourceConfig): RawHotItem[] {
  const data = extractArray(payload);
  const fetchedAt = new Date().toISOString();

  return data
    .map((item, index) => normalizeItem(item, source, index + 1, fetchedAt))
    .filter((item): item is RawHotItem => Boolean(item?.title));
}

function extractArray(payload: unknown): UnknownRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const candidates = [payload.data, payload.list, payload.items, payload.result];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }

    if (isRecord(candidate)) {
      const nested = [
        candidate.data,
        candidate.list,
        candidate.items,
        candidate.result,
        candidate.cards,
        candidate.content
      ];
      const found = nested.find(Array.isArray);
      if (Array.isArray(found)) {
        return flattenRecords(found);
      }
    }
  }

  return [];
}

function flattenRecords(values: unknown[]): UnknownRecord[] {
  return values.flatMap((value) => {
    if (Array.isArray(value)) {
      return flattenRecords(value);
    }

    if (!isRecord(value)) {
      return [];
    }

    if (Array.isArray(value.content)) {
      return flattenRecords(value.content);
    }

    if (Array.isArray(value.list)) {
      return flattenRecords(value.list);
    }

    return [value];
  });
}

function normalizeItem(
  item: UnknownRecord,
  source: SourceConfig,
  rank: number,
  fetchedAt: string
): RawHotItem | null {
  const title = getString(item, ["title", "Title", "name", "word", "keyword", "query", "desc", "hotTag"]);

  if (!title) {
    return null;
  }

  const rawUrl =
    getString(item, ["url", "link", "href", "pcUrl", "short_link_v2"]) ||
    getString(item, ["Url"]) ||
    buildBilibiliUrl(item) ||
    buildThePaperUrl(item) ||
    buildWeiboUrl(item) ||
    buildSearchUrl(source.primaryUrl, title);
  const url = normalizeExternalUrl(rawUrl, source.id, title);
  const heatText = getString(item, ["hot", "hotValue", "heat", "views", "score", "desc", "hotNum"]);
  const stats = extractEngagementStats(item);

  return {
    sourceId: source.id,
    sourceName: source.displayName,
    sourceKind: source.kind,
    sourceCategory: source.category,
    rank: getNumber(item, ["rank", "index"]) ?? rank,
    title: title.trim(),
    url,
    mobileUrl: getString(item, ["mobileUrl", "mobile_url", "mUrl"]),
    description: getString(item, ["description", "summary", "excerpt", "desc"]),
    cover: getString(item, ["cover", "image", "pic", "thumbnail", "avatar"]),
    heatText,
    heatValue:
      getNumber(item, ["hot", "hotValue", "HotValue", "heat", "views", "score", "interactionNum", "praiseTimes", "hotNum"]) ??
      getNestedNumber(item, ["stat"], ["view", "like", "danmaku"]),
    stats,
    fetchedAt
  };
}

function extractEngagementStats(item: UnknownRecord): EngagementStats | undefined {
  const stats: EngagementStats = {
    views:
      getNumber(item, ["views", "view", "viewCount", "readCount", "read_num", "play", "playCount"]) ??
      getNestedNumber(item, ["stat", "stats", "count_info"], ["view", "views", "read", "readCount", "play", "playCount"]),
    reads:
      getNumber(item, ["reads", "read", "readCount", "read_num"]) ??
      getNestedNumber(item, ["stat", "stats", "count_info"], ["read", "reads", "readCount"]),
    plays:
      getNumber(item, ["plays", "play", "playCount"]) ??
      getNestedNumber(item, ["stat", "stats", "count_info"], ["view", "play", "playCount"]),
    comments:
      getNumber(item, ["comments", "comment", "commentCount", "comment_num", "reply", "replyCount"]) ??
      getNestedNumber(item, ["stat", "stats", "count_info", "hotEvent"], ["reply", "replyCount", "comment", "commentCount"]),
    replies:
      getNumber(item, ["replies", "reply", "replyCount", "reply_num", "discuss_num"]) ??
      getNestedNumber(item, ["stat", "stats", "count_info"], ["reply", "replyCount", "comment"]),
    likes:
      getNumber(item, ["likes", "like", "likeCount", "like_count", "praiseTimes", "diggCount"]) ??
      getNestedNumber(item, ["stat", "stats", "count_info"], ["like", "likes", "agree_num", "praiseTimes"]),
    dislikes:
      getNumber(item, ["dislikes", "dislike", "dislikeCount"]) ??
      getNestedNumber(item, ["stat", "stats", "count_info"], ["dislike", "dislikeCount"]),
    upvotes:
      getNumber(item, ["upvotes", "upvote", "voteup_count", "agree_num"]) ??
      getNestedNumber(item, ["stat", "stats", "count_info"], ["upvote", "agree_num"]),
    downvotes:
      getNumber(item, ["downvotes", "downvote", "votedown_count"]) ??
      getNestedNumber(item, ["stat", "stats", "count_info"], ["downvote"]),
    favorites:
      getNumber(item, ["favorites", "favorite", "favoriteCount", "collect", "collectCount", "statCollect"]) ??
      getNestedNumber(item, ["stat", "stats", "count_info"], ["favorite", "collect", "collectCount"]),
    shares:
      getNumber(item, ["shares", "share", "shareCount"]) ??
      getNestedNumber(item, ["stat", "stats", "count_info"], ["share", "shareCount"]),
    danmaku:
      getNumber(item, ["danmaku", "danmakuCount"]) ??
      getNestedNumber(item, ["stat", "stats", "count_info"], ["danmaku", "danmakuCount"])
  };
  const cleaned = Object.fromEntries(
    Object.entries(stats).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value > 0)
  ) as EngagementStats;

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function getString(item: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return undefined;
}

function getNestedNumber(item: UnknownRecord, parentKeys: string[], childKeys: string[]) {
  for (const parentKey of parentKeys) {
    const parent = item[parentKey];
    if (!isRecord(parent)) {
      continue;
    }
    const value = getNumber(parent, childKeys);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function buildBilibiliUrl(item: UnknownRecord) {
  const bvid = getString(item, ["bvid"]);
  return bvid ? `https://www.bilibili.com/video/${bvid}` : undefined;
}

function buildThePaperUrl(item: UnknownRecord) {
  const contId = getString(item, ["contId"]);
  return contId ? `https://www.thepaper.cn/newsDetail_forward_${contId}` : undefined;
}

function buildWeiboUrl(item: UnknownRecord) {
  const word = getString(item, ["word"]);
  return word ? `https://s.weibo.com/weibo?q=${encodeURIComponent(word)}` : undefined;
}

function buildZhihuUrl(item: UnknownRecord) {
  const id = getString(item, ["id"]);
  const rawUrl = getString(item, ["url"]);
  if (id) {
    return `https://www.zhihu.com/question/${id}`;
  }
  if (rawUrl) {
    const match = rawUrl.match(/questions?\/(\d+)/);
    return match ? `https://www.zhihu.com/question/${match[1]}` : rawUrl;
  }
  return undefined;
}

function buildHupuUrl(item: UnknownRecord) {
  const tid = getString(item, ["tid", "id"]);
  return tid ? `https://bbs.hupu.com/${tid}.html` : getString(item, ["url"]);
}

function buildDouyinHotUrl(item: UnknownRecord) {
  const sentenceId = getString(item, ["sentence_id", "id"]);
  return sentenceId ? `https://www.douyin.com/hot/${sentenceId}` : undefined;
}

function buildNgabbsUrl(item: UnknownRecord) {
  const tpcurl = getString(item, ["tpcurl"]);
  if (tpcurl?.startsWith("http")) {
    return tpcurl;
  }
  return tpcurl ? `https://bbs.nga.cn${tpcurl}` : undefined;
}

function buildQqNewsUrl(item: UnknownRecord) {
  const id = getString(item, ["id"]);
  return id ? `https://new.qq.com/rain/a/${id}` : getString(item, ["url"]);
}

function buildQqNewsMobileUrl(item: UnknownRecord) {
  const id = getString(item, ["id"]);
  return id ? `https://view.inews.qq.com/k/${id}` : undefined;
}

function buildNeteaseUrl(item: UnknownRecord) {
  const docid = getString(item, ["docid", "id"]);
  return docid ? `https://www.163.com/dy/article/${docid}.html` : getString(item, ["url"]);
}

function buildNeteaseMobileUrl(item: UnknownRecord) {
  const docid = getString(item, ["docid", "id"]);
  return docid ? `https://m.163.com/dy/article/${docid}.html` : undefined;
}

function buildHuxiuUrl(item: UnknownRecord) {
  const objectId = getString(item, ["object_id", "id"]);
  return objectId ? `https://www.huxiu.com/moment/${objectId}.html` : "https://www.huxiu.com/moment/";
}

function buildSspaiUrl(item: UnknownRecord) {
  const id = getString(item, ["id"]);
  return id ? `https://sspai.com/post/${id}` : getString(item, ["url"]);
}

function extract36KrLists(payload: unknown) {
  if (!isRecord(payload)) {
    return [];
  }

  const data = isRecord(payload.data) ? payload.data : payload;
  const candidates = [
    data.hotRankList,
    data.videoList,
    data.remarkList,
    data.collectList,
    isRecord(data.data) ? data.data.hotRankList : undefined,
    isRecord(data.data) ? data.data.videoList : undefined
  ];

  return candidates.find(Array.isArray)?.filter(isRecord) ?? [];
}

function extractIthomeItems(html: string): UnknownRecord[] {
  const records: UnknownRecord[] = [];
  const seen = new Set<string>();
  const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,900}?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const href = normalizeHtmlHref(match[1]);
    if (!href || seen.has(href) || !/ithome\.com|\/0\//i.test(href)) {
      continue;
    }

    const body = match[2];
    const title =
      decodeHtml(body.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1]?.replace(/<[^>]+>/g, " ").trim() ?? "") ||
      decodeHtml(body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!title || title.length < 6) {
      continue;
    }

    seen.add(href);
    records.push({
      title,
      url: normalizeIthomeUrl(href),
      cover: body.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1]
    });
  }

  return records.slice(0, 50);
}

function normalizeIthomeUrl(url: string) {
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  if (url.startsWith("/")) {
    return `https://m.ithome.com${url}`;
  }
  return url.replace("https://m.ithome.com/html/", "https://www.ithome.com/");
}

function parseJsonpObject(text: string) {
  const trimmed = text.trim();
  const objectText =
    trimmed.match(/^[^{]*(\{[\s\S]*\})\s*;?\s*$/)?.[1] ??
    trimmed.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/)?.[1] ??
    trimmed;
  return JSON.parse(objectText) as unknown;
}

function extractHtmlLinks(html: string, allowHref: (href: string) => boolean): UnknownRecord[] {
  const seen = new Set<string>();
  const records: UnknownRecord[] = [];
  const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,220}?)<\/a>/g;

  for (const match of html.matchAll(linkPattern)) {
    const href = normalizeHtmlHref(match[1]);
    const title = decodeHtml(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!href || !title || seen.has(href) || !allowHref(href)) {
      continue;
    }
    seen.add(href);
    records.push({ title, url: href });
  }

  return records;
}

function normalizeHtmlHref(href: string) {
  if (href.startsWith("//")) {
    return `https:${href}`;
  }
  if (href.startsWith("/")) {
    return href;
  }
  return href;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getNumber(item: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = parseHumanNumber(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function parseHumanNumber(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return Number.NaN;
  }

  const base = Number(match[1]);
  if (!Number.isFinite(base)) {
    return Number.NaN;
  }
  if (/[亿億]/.test(normalized)) {
    return base * 100_000_000;
  }
  if (/[万萬wW]/.test(normalized)) {
    return base * 10_000;
  }
  if (/[千kK]/.test(normalized)) {
    return base * 1_000;
  }
  return base;
}

function buildSearchUrl(baseUrl: string, title: string) {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("q", title);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
