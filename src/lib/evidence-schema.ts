import type Database from 'better-sqlite3';

export const EVIDENCE_SCHEMA_VERSION = 1;
export const EVIDENCE_TABLES = [
  'library_meta','library_sources','library_blobs','collection_runs','library_documents','document_aliases',
  'document_revisions','document_observations','metric_observations','search_queries','search_runs','search_hits',
  'events','event_evidence','event_relations','analysis_records','analysis_evidence','library_backfill_state'
] as const;

/** Deliberately independent of legacy BUSINESS_TABLES and snapshot deletion cascades. */
export function createEvidenceSchema(db:Database.Database) {
  const version=db.prepare("select name from sqlite_master where type='table' and name='library_meta'").get();
  if(version) {
    const row=db.prepare('select version from library_meta where id=1').get() as {version:number}|undefined;
    if(row && row.version>EVIDENCE_SCHEMA_VERSION) throw new Error('长期资料库版本高于当前程序，拒绝降级写入。');
    if(row?.version===EVIDENCE_SCHEMA_VERSION) return;
  }
  db.transaction(()=>db.exec(`
    create table if not exists library_meta(id integer primary key check(id=1),version integer not null);
    insert or ignore into library_meta values(1,1);
    create table if not exists library_sources(
      id text primary key,provider text not null,platform text not null,adapter text not null,capability text not null,
      terms_url text,rights_status text not null default 'unknown',rights_note text,rights_checked_at text,
      unique(provider,platform,adapter,capability)
    );
    create table if not exists library_blobs(
      hash text primary key,encoding text not null,compression text not null,data blob not null,
      original_bytes integer not null,stored_bytes integer not null,truncated integer not null,created_at text not null
    );
    create table if not exists collection_runs(
      id text primary key,source_id text not null references library_sources(id),started_at text not null,
      finished_at text not null,observed_at text not null,status text not null,request_json text not null,
      response_hash text references library_blobs(hash),response_truncated integer not null default 0,
      http_status integer,error text,normalizer_version text not null,provenance text not null,
      legacy_snapshot_date text,source_updated_at text,cached integer not null default 0,item_count integer not null,
      cost real,currency text,response_source_bytes integer,response_captured_bytes integer
    );
    create index if not exists collection_runs_observed_idx on collection_runs(observed_at,source_id);
    create table if not exists library_documents(
      id text primary key,platform text not null,kind text not null,platform_id text,url text not null,
      first_observed_at text not null,last_observed_at text not null
    );
    create table if not exists document_aliases(
      platform text not null,alias text not null,document_id text not null references library_documents(id),
      primary key(platform,alias)
    );
    create table if not exists document_revisions(
      id text primary key,document_id text not null references library_documents(id),content_hash text not null references library_blobs(hash),
      title text,description text,published_at text,source_updated_at text,parent_document_id text references library_documents(id),
      author_key text,first_run_id text not null references collection_runs(id),created_at text not null,
      unique(document_id,content_hash)
    );
    create table if not exists document_observations(
      id text primary key,run_id text not null references collection_runs(id),document_id text not null references library_documents(id),
      revision_id text not null references document_revisions(id),observed_at text not null,
      item_payload_hash text references library_blobs(hash),positions_json text not null,rank real,heat_value real,heat_text text,heat_unit text,
      legacy_snapshot_date text,unique(run_id,document_id)
    );
    create index if not exists document_observations_history_idx on document_observations(document_id,observed_at);
    create table if not exists metric_observations(
      observation_id text not null references document_observations(id),metric text not null,numeric_value real,
      raw_value text,unit text not null,scope text not null,raw_field_path text,alias_of text,status text not null,
      primary key(observation_id,metric)
    );
    create table if not exists search_queries(
      id text primary key,query_key text not null unique,query text not null,purpose text not null,language text,region text,filters_json text not null,version integer not null
    );
    create table if not exists search_runs(
      run_id text primary key references collection_runs(id),query_id text not null references search_queries(id),
      actual_query text not null,page integer not null,cursor text,complete integer not null
    );
    create table if not exists search_hits(
      id text primary key,run_id text not null references search_runs(run_id),document_id text not null references library_documents(id),
      position integer not null,global_position integer,result_type text not null,title text,snippet text,claimed_published_at text,
      payload_hash text references library_blobs(hash),unique(run_id,position)
    );
    create index if not exists search_hits_document_idx on search_hits(document_id,run_id);
    create table if not exists events(
      id text primary key,title text not null,start_at text,end_at text,status text not null,created_by text not null,created_at text not null,version integer not null
    );
    create table if not exists event_evidence(
      id text primary key,event_id text not null references events(id),observation_id text not null references document_observations(id),
      role text not null,method text not null,confidence real,reason text not null,reviewed integer not null,state text not null,
      supersedes text references event_evidence(id),created_at text not null
    );
    create table if not exists event_relations(
      id text primary key,from_event_id text not null references events(id),to_event_id text not null references events(id),
      relation_type text not null,status text not null,reason text not null,created_at text not null,check(from_event_id<>to_event_id)
    );
    create table if not exists analysis_records(
      id text primary key,purpose text not null,provider text not null,model text not null,prompt_version text not null,
      schema_version text not null,algorithm_version text,output_hash text not null references library_blobs(hash),input_hash text references library_blobs(hash),
      generated_at text not null,status text not null,supersedes text references analysis_records(id),
      input_tokens integer,output_tokens integer,cost real,currency text,legacy_snapshot_date text,legacy_topic_id text,
      attempt_id text references analysis_records(id),legacy_log_id integer unique
    );
    create table if not exists analysis_evidence(
      analysis_id text not null references analysis_records(id),observation_id text references document_observations(id),
      search_run_id text references search_runs(run_id),event_relation_id text references event_relations(id),
      check((observation_id is not null)+(search_run_id is not null)+(event_relation_id is not null)=1)
    );
    create table if not exists library_backfill_state(snapshot_date text primary key,payload_hash text not null,completed_at text not null);
  `))();
}
