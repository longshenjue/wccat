import type { TopicGroup } from "./types";

const defaultProvider = "pollinations";

export function buildAiImageUrl(topic: TopicGroup) {
  const provider = process.env.WCCAT_AI_IMAGE_PROVIDER ?? defaultProvider;
  if (provider === "off") {
    return undefined;
  }

  if (provider !== "pollinations") {
    return undefined;
  }

  const prompt = [
    "editorial cyberpunk data dashboard illustration",
    "abstract visual metaphor",
    "Chinese internet trend radar",
    "red and blue neon energy",
    "no readable text",
    "no logos",
    `topic: ${topic.title}`
  ].join(", ");
  const url = new URL("https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt));
  url.searchParams.set("width", "1024");
  url.searchParams.set("height", "576");
  url.searchParams.set("nologo", "true");
  url.searchParams.set("model", process.env.WCCAT_AI_IMAGE_MODEL ?? "flux");
  url.searchParams.set("seed", String(hashText(topic.id)));

  return url.toString();
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}
