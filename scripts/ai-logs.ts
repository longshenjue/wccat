import "./load-env";
import { getDb } from "../src/lib/db";

const limitArg = process.argv.find((arg) => arg.startsWith("limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 20;

const rows = getDb()
  .prepare(
    `
      select snapshot_date as snapshotDate, topic_id as topicId, provider, model,
        status, duration_ms as durationMs, used_fallback as usedFallback,
        error, created_at as createdAt
      from ai_analysis_logs
      order by id desc
      limit ?
    `
  )
  .all(Number.isFinite(limit) ? limit : 20);

console.table(rows);
