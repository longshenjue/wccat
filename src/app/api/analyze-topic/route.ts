import { NextResponse } from "next/server";
import { saveTopicAnalysisToDb, writeGeneration } from "@/lib/db";
import { fetchArticleContexts } from "@/lib/fulltext";
import { analyzeTopicWithDeepSeek } from "@/lib/topic-analysis";
import type { TopicGroup } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const generation = writeGeneration();
    const body = (await request.json()) as TopicGroup | { date?: string; topic?: TopicGroup };
    const topic = isTopicRequest(body) ? body.topic : body;
    const date = "date" in body ? body.date : undefined;

    if (!isTopicGroup(topic)) {
      return NextResponse.json({ error: "Invalid topic payload" }, { status: 400 });
    }

    const contexts = await fetchArticleContexts(topic.occurrences);
    const analysis = await analyzeTopicWithDeepSeek(topic, contexts, undefined);
    if (date) {
      saveTopicAnalysisToDb(date, topic.id, analysis, generation);
    }

    return NextResponse.json(analysis);
  } catch {
    return NextResponse.json({ error: "Failed to analyze topic" }, { status: 500 });
  }
}

function isTopicRequest(value: unknown): value is { date?: string; topic?: TopicGroup } {
  return value !== null && typeof value === "object" && "topic" in value;
}

function isTopicGroup(value: unknown): value is TopicGroup {
  return (
    value !== null &&
    typeof value === "object" &&
    "title" in value &&
    "occurrences" in value &&
    Array.isArray((value as { occurrences?: unknown }).occurrences)
  );
}
