const stopWords = [
  "如何看待",
  "怎么看",
  "为什么",
  "回应",
  "官方",
  "最新",
  "热",
  "爆",
  "新"
];

export function normalizeTitle(title: string) {
  return stopWords
    .reduce((current, word) => current.replaceAll(word, ""), title)
    .replace(/[^\p{Script=Han}\p{Letter}\p{Number}]+/gu, "")
    .toLowerCase()
    .slice(0, 48);
}

export function topicIdFromTitle(title: string) {
  const normalized = normalizeTitle(title);
  let hash = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash << 5) - hash + normalized.charCodeAt(index);
    hash |= 0;
  }

  return `topic-${Math.abs(hash).toString(36)}`;
}

export function titleSimilarity(left: string, right: string) {
  const a = new Set(chunk(normalizeTitle(left)));
  const b = new Set(chunk(normalizeTitle(right)));
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;

  return union === 0 ? 0 : intersection / union;
}

function chunk(value: string) {
  if (value.length <= 2) {
    return [value];
  }

  const tokens: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    tokens.push(value.slice(index, index + 2));
  }
  return tokens;
}
