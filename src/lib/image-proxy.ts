const imageHosts = [
  'zhimg.com', 'hdslb.com', 'thepaper.cn', 'baidu.com', '36krcdn.com',
  'gtimg.com', '126.net', '163.com', 'sinaimg.cn', 'sinajs.cn',
  'doubanio.com', 'hupu.com', 'hupucdn.com', 'shihuo.cn',
  'douyinpic.com', 'byteimg.com', 'pstatp.com', 'toutiaoimg.com',
  'ngacn.cc', 'nga.cn', 'ithome.com', 'ithome.cn',
  'huxiucdn.com', 'huxiu.com', 'sspai.com', 'pollinations.ai'
];

export function parseAllowedImageUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
      !imageHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error('Unapproved image URL');
  }
  return url;
}
