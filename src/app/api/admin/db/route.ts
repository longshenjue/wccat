import { NextResponse } from "next/server";
import { getDb, writeGeneration } from "@/lib/db";
import { guardedWrite } from "@/lib/maintenance";
import type { WccatDailyReport } from "@/lib/daily-report";
import { restoreImageAssets, sharingReportForClient } from "@/lib/shareen-image-state";

export const dynamic = "force-dynamic";

type AdminTable = {
  name: string;
  label: string;
  primaryKeys: string[];
  searchableColumns: string[];
  orderBy: string;
  columns: string[];
};

const adminTables: AdminTable[] = [
  {
    name: "snapshots",
    label: "小时快照",
    primaryKeys: ["date"],
    searchableColumns: ["date", "generated_at", "payload"],
    orderBy: "date desc",
    columns: ["date", "generated_at", "payload"]
  },
  {
    name: "raw_items",
    label: "原始条目",
    primaryKeys: ["id"],
    searchableColumns: ["source_id", "source_name", "title", "url", "description", "heat_text"],
    orderBy: "id desc",
    columns: [
      "id",
      "snapshot_date",
      "source_id",
      "source_name",
      "source_kind",
      "source_category",
      "rank",
      "title",
      "url",
      "description",
      "cover",
      "heat_text",
      "heat_value",
      "stats_payload",
      "fetched_at"
    ]
  },
  {
    name: "topics",
    label: "聚合话题",
    primaryKeys: ["id"],
    searchableColumns: ["snapshot_date", "topic_id", "title", "sentiment", "signal", "payload"],
    orderBy: "id desc",
    columns: [
      "id",
      "snapshot_date",
      "topic_id",
      "rank",
      "title",
      "heat_score",
      "sentiment",
      "signal",
      "official_public_resonance",
      "payload"
    ]
  },
  {
    name: "topic_analyses",
    label: "AI 分析",
    primaryKeys: ["snapshot_date", "topic_id"],
    searchableColumns: ["snapshot_date", "topic_id", "model", "payload"],
    orderBy: "snapshot_date desc",
    columns: ["snapshot_date", "topic_id", "model", "generated_at", "payload"]
  },
  {
    name: "ai_analysis_logs",
    label: "AI 日志",
    primaryKeys: ["id"],
    searchableColumns: ["snapshot_date", "topic_id", "provider", "model", "status", "error"],
    orderBy: "id desc",
    columns: [
      "id",
      "snapshot_date",
      "topic_id",
      "provider",
      "model",
      "status",
      "duration_ms",
      "used_fallback",
      "error",
      "request_payload",
      "response_payload",
      "created_at"
    ]
  },
  {
    name: "daily_reports",
    label: "日报",
    primaryKeys: ["report_date"],
    searchableColumns: ["report_date", "model", "payload"],
    orderBy: "report_date desc",
    columns: ["report_date", "generated_at", "model", "payload"]
  }
];

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(request.url);
  const tableName = url.searchParams.get("table");

  if (!tableName) {
    return NextResponse.json({ tables: tableSummaries() });
  }

  const table = getAdminTable(tableName);
  if (!table) {
    return NextResponse.json({ error: "Unknown table" }, { status: 404 });
  }

  const page = clampNumber(Number(url.searchParams.get("page") ?? 1), 1, 9999);
  const pageSize = clampNumber(Number(url.searchParams.get("pageSize") ?? 25), 5, 100);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const offset = (page - 1) * pageSize;
  const where = buildSearchWhere(table, query);
  const params = query ? table.searchableColumns.map(() => `%${query}%`) : [];
  const database = getDb();
  const records = database
    .prepare(
      `select ${table.columns.map(quoteIdentifier).join(", ")} from ${quoteIdentifier(table.name)} ${where.sql} order by ${
        table.orderBy
      } limit ? offset ?`
    )
    .iterate(...params, pageSize, offset) as Iterable<Record<string, unknown>>;
  const rows = Array.from(records, row => {
    if (table.name !== "daily_reports") return row;
    // Keep the editor's payload column a JSON string, including for historical schemas.
    try {
      const payload = JSON.parse(String(row.payload));
      const publicPayload = payload?.shareEn ? sharingReportForClient(payload) : payload;
      return { ...row, payload: JSON.stringify(publicPayload, (key, value) => key === "dataBase64" ? undefined : value) };
    } catch {
      // A corrupt document cannot safely be echoed, but its row can still be repaired.
      return { ...row, payload: null };
    }
  });
  const count = database
    .prepare(`select count(*) as total from ${quoteIdentifier(table.name)} ${where.sql}`)
    .get(...params) as { total: number };

  return NextResponse.json({
    table,
    page,
    pageSize,
    total: count.total,
    rows
  });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const generation = writeGeneration();
  const body = (await request.json()) as { table?: string; values?: Record<string, unknown> };
  const table = getAdminTable(body.table);
  if (!table || !body.values || typeof body.values !== "object") {
    return NextResponse.json({ error: "Invalid create payload" }, { status: 400 });
  }

  const values = sanitizeValues(table, body.values, { forCreate: true });
  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: "No valid columns" }, { status: 400 });
  }

  if (table.name === "daily_reports" && "payload" in values && !restoreDailyEditorPayload(values)) {
    return NextResponse.json({ error: "Invalid daily payload or image asset" }, { status: 400 });
  }
  const columns = Object.keys(values);
  guardedWrite(getDb(), () => getDb()
    .prepare(
      `insert into ${quoteIdentifier(table.name)} (${columns.map(quoteIdentifier).join(", ")}) values (${columns
        .map(() => "?")
        .join(", ")})`
    )
    .run(...columns.map((column) => values[column])), generation);

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const generation = writeGeneration();
  const body = (await request.json()) as {
    table?: string;
    key?: Record<string, unknown>;
    values?: Record<string, unknown>;
  };
  const table = getAdminTable(body.table);
  if (!table || !body.key || !body.values) {
    return NextResponse.json({ error: "Invalid update payload" }, { status: 400 });
  }

  const key = pickPrimaryKey(table, body.key);
  const values = sanitizeValues(table, body.values, { forCreate: false });
  for (const primaryKey of table.primaryKeys) {
    delete values[primaryKey];
  }
  if (!key || Object.keys(values).length === 0) {
    return NextResponse.json({ error: "Missing key or values" }, { status: 400 });
  }

  const valueColumns = Object.keys(values);
  const database = getDb();
  const updated = guardedWrite(database, () => {
    if (table.name === "daily_reports" && "payload" in values) {
      const current = database.prepare("select payload from daily_reports where report_date = ?")
        .get(key.report_date) as {payload: string} | undefined;
      if (!restoreDailyEditorPayload(values, current?.payload)) return false;
    }
    database.prepare(
      `update ${quoteIdentifier(table.name)} set ${valueColumns
        .map((column) => `${quoteIdentifier(column)} = ?`)
        .join(", ")} where ${table.primaryKeys.map((column) => `${quoteIdentifier(column)} = ?`).join(" and ")}`
    ).run(...valueColumns.map((column) => values[column]), ...table.primaryKeys.map((column) => key[column]));
    return true;
  }, generation);
  if (!updated) return NextResponse.json({ error: "Invalid daily payload or image asset" }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const generation = writeGeneration();
  const body = (await request.json()) as { table?: string; key?: Record<string, unknown> };
  const table = getAdminTable(body.table);
  if (!table || !body.key) {
    return NextResponse.json({ error: "Invalid delete payload" }, { status: 400 });
  }

  const key = pickPrimaryKey(table, body.key);
  if (!key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }

  guardedWrite(getDb(), () => getDb()
    .prepare(
      `delete from ${quoteIdentifier(table.name)} where ${table.primaryKeys
        .map((column) => `${quoteIdentifier(column)} = ?`)
        .join(" and ")}`
    )
    .run(...table.primaryKeys.map((column) => key[column])), generation);

  return NextResponse.json({ ok: true });
}

/** The development editor submits raw JSON and may edit the Chinese source as well as its copy. */
function restoreDailyEditorPayload(values: Record<string, unknown>, baselinePayload?: string) {
  let baseline: WccatDailyReport | undefined;
  if (baselinePayload) {
    try { baseline = JSON.parse(baselinePayload); } catch { /* Allow repair of malformed historical rows. */ }
  }
  try {
    const next = JSON.parse(String(values.payload), (key, value) => {
      if (key === "dataBase64") throw new Error("Private image bytes");
      return value;
    }) as WccatDailyReport;
    const copy = next?.shareEn;
    if (Array.isArray(copy?.highlights)) {
      // Bind to the current database row and check the original source before using any edited topic covers.
      const saved = baseline?.shareEn;
      const previous = baseline && baseline.reportDate === next.reportDate && saved && Array.isArray(saved.highlights)
        ? restoreImageAssets(baseline, saved, saved)
        : undefined;
      next.shareEn = restoreImageAssets(next, copy, previous, { submitted: copy });
    }
    values.payload = JSON.stringify(next);
    return true;
  } catch {
    return false;
  }
}

function tableSummaries() {
  const database = getDb();
  return adminTables.map((table) => {
    const row = database.prepare(`select count(*) as total from ${quoteIdentifier(table.name)}`).get() as {
      total: number;
    };
    return {
      name: table.name,
      label: table.label,
      primaryKeys: table.primaryKeys,
      columns: table.columns,
      total: row.total
    };
  });
}

function getAdminTable(name?: string | null) {
  return adminTables.find((table) => table.name === name);
}

function buildSearchWhere(table: AdminTable, query: string) {
  if (!query) {
    return { sql: "" };
  }

  return {
    sql: `where ${table.searchableColumns.map((column) => `${quoteIdentifier(column)} like ?`).join(" or ")}`
  };
}

function sanitizeValues(table: AdminTable, values: Record<string, unknown>, options: { forCreate: boolean }) {
  const allowedColumns = new Set(table.columns);
  const output: Record<string, unknown> = {};

  for (const [column, value] of Object.entries(values)) {
    if (!allowedColumns.has(column)) {
      continue;
    }
    if (options.forCreate || table.primaryKeys.includes(column) || value !== undefined) {
      output[column] = normalizeSqlValue(value);
    }
  }

  return output;
}

function pickPrimaryKey(table: AdminTable, key: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const column of table.primaryKeys) {
    if (!(column in key)) {
      return null;
    }
    output[column] = normalizeSqlValue(key[column]);
  }
  return output;
}

function normalizeSqlValue(value: unknown) {
  if (value === "") {
    return null;
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return value;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}
