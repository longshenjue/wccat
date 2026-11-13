import type Database from 'better-sqlite3';
export const BUSINESS_TABLES=['snapshots','raw_items','topics','topic_analyses','ai_analysis_logs','daily_reports'] as const;
export type BusinessTable=typeof BUSINESS_TABLES[number];
export const DATE_COLUMNS:Record<BusinessTable,string>={snapshots:'date',raw_items:'snapshot_date',topics:'snapshot_date',topic_analyses:'snapshot_date',ai_analysis_logs:'snapshot_date',daily_reports:'report_date'};
export const ORDER_COLUMNS:Record<BusinessTable,string>={snapshots:'date',raw_items:'id',topics:'id',topic_analyses:'snapshot_date,topic_id',ai_analysis_logs:'id',daily_reports:'report_date'};
export function createBusinessSchema(database: Database.Database) {
  database.exec(`
    create table if not exists snapshots (
      date text primary key,
      generated_at text not null,
      payload text not null
    );

    create table if not exists raw_items (
      id integer primary key autoincrement,
      snapshot_date text not null,
      source_id text not null,
      source_name text not null,
      source_kind text not null,
      source_category text not null,
      rank integer not null,
      title text not null,
      url text not null,
      description text,
      cover text,
      heat_text text,
      heat_value real,
      stats_payload text,
      fetched_at text not null,
      foreign key(snapshot_date) references snapshots(date) on delete cascade
    );

    create index if not exists snapshots_collected_time_idx on snapshots(julianday(generated_at));

    create index if not exists raw_items_snapshot_source_idx
      on raw_items(snapshot_date, source_id, rank);

    create table if not exists topics (
      id integer primary key autoincrement,
      snapshot_date text not null,
      topic_id text not null,
      rank integer not null,
      title text not null,
      heat_score integer not null,
      sentiment text not null,
      signal text not null,
      official_public_resonance integer not null,
      payload text not null,
      foreign key(snapshot_date) references snapshots(date) on delete cascade
    );

    create index if not exists topics_snapshot_rank_idx
      on topics(snapshot_date, rank);

    create table if not exists topic_analyses (
      snapshot_date text not null,
      topic_id text not null,
      model text not null,
      generated_at text not null,
      payload text not null,
      primary key(snapshot_date, topic_id),
      foreign key(snapshot_date) references snapshots(date) on delete cascade
    );

    create table if not exists ai_analysis_logs (
      id integer primary key autoincrement,
      snapshot_date text not null,
      topic_id text not null,
      provider text not null,
      model text not null,
      status text not null,
      duration_ms integer not null,
      used_fallback integer not null,
      error text,
      request_payload text not null,
      response_payload text not null,
      created_at text not null
    );

    create index if not exists ai_analysis_logs_snapshot_topic_idx
      on ai_analysis_logs(snapshot_date, topic_id, created_at);

    create table if not exists daily_reports (
      report_date text primary key,
      generated_at text not null,
      model text not null,
      payload text not null
    );
  `);

  ensureColumn(database, "raw_items", "stats_payload", "text");
}

function ensureColumn(database: Database.Database, table: string, column: string, definition: string) {
  const columns = database.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    database.exec(`alter table ${table} add column ${column} ${definition}`);
  }
}

