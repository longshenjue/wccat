export function getChinaDate(input = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(input);
}

export function getChinaHour(input = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    hour: "2-digit"
  }).format(input);
}

export function getChinaSnapshotId(input = new Date()) {
  return `${getChinaDate(input)}-${getChinaHour(input)}`;
}

export function getChinaDateTime(input = new Date()) {
  return input.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function msUntilNextHour(input = new Date()) {
  const next = new Date(input);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return Math.max(1000, next.getTime() - input.getTime());
}

export function msUntilNextChinaTime(hour: number, minute: number, input = new Date()) {
  const parts = getChinaDateParts(input);
  const target = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour - 8, minute, 0, 0));

  if (target.getTime() <= input.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }

  return Math.max(1000, target.getTime() - input.getTime());
}

function getChinaDateParts(input: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(input);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day")
  };
}
