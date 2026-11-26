import type Database from 'better-sqlite3';
/** Main-store publication data is deliberately separate from portable monthly business archives. */
export function ensurePublicationSchema(db:Database.Database){
 db.exec('create table if not exists share_publications (id text primary key,content_hash text not null unique,published_at text not null,report_date text not null,payload text not null); create index if not exists share_publications_date_idx on share_publications(report_date,published_at)');
}
