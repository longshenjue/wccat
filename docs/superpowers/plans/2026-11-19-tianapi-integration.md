# TianAPI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement inline; one fresh final whole-change review. Steps use checkbox syntax.

**Goal:** Activate the six authorized TianAPI hotlists within current acquisition and AI context, with persistent quota/caching and auditable evidence.
**Architecture:** Endpoint catalog + uniform client + independent SQLite provider operational state + existing evidence sink. Canonical platform feeds replace rather than duplicate; aggregate feeds enrich context without ranking changes.
**Tech Stack:** Existing TypeScript, better-sqlite3, node:test, Node 22; no new dependencies.
**Spec:** docs/superpowers/specs/2026-11-19-tianapi-integration-design.md.

## Global Constraints

- TIANAPI_KEY server-side only. Six fixed endpoint paths, POST authentication, no redirects, 10s timeout and 2 MiB body bound.
- Default daily 90 attempts/endpoint, cap 100, Asia/Shanghai; persistent 30m cache and account-wide 1 QPS, atomic leases. No automatic HTTP retries.
- Retain evidence schema v1 and legacy six-table archives. Independent versioned provider tables included in full backups with backward verification.
- Keep ranking formula; four canonical platforms select one feed. Two auxiliary feeds never add platform diversity/heat.
- No additional AI calls; actual supplemental input and references must be retained. Network and account validation remain distinct from fixture tests.
- User expressly delegated design and requested implementation now; resolve routine choices against spec, without another workflow approval.

## Review Focus

- Provider cache generation/lease races and a stale owner completing after takeover.
- Other processes, restart, midnight and concurrent different endpoints respecting limits.
- A successful HTTP 200 carrying an API error, malformed/oversized JSON or missing list.
- Aggregate/qq-news ambiguity and duplicate platform feeds affecting scores or claiming article/interaction data.
- Existing old backups, snapshot payloads and manual analysis paths keeping compatibility and provenance.

### Task 1: Persistent provider state and full-backup compatibility

Files: src/lib/provider-state.ts, db.ts, evidence-maintenance.ts; tests/provider-state.test.ts.
Interfaces: ProviderState.acquire(account,endpoint,now,limit,owner) returns cache/wait/blocked/reserved; finish/fail update only owning lease, readStatus; ensureProviderSchema/validateProviderSchema.
- [x] Write tests and observe RED for cache, limits, two connections, stale owner, day boundary and old backup.
- [x] Implement independent schema, reservations and validation; wire main getDb and complete backup verifier.
- [x] Run targeted tests GREEN, commit.

### Task 2: Six adapters and safe client

Files: src/lib/tianapi/catalog.ts, client.ts, runtime.ts; tests/tianapi-client.test.ts.
Interfaces: catalog endpoint metadata + normalizeTianItems; TianApiClient.fetch(endpoint) yields items + EvidenceBatch; config from environment.
- [x] Write RED tests using official full JSON envelopes, exact endpoints, business failures, malformed and oversized responses, secret echoes, cache and rate gates.
- [x] Implement catalog, strict client and runtime assembly, no external dependencies.
- [x] Run focused tests GREEN, commit.

### Task 3: Acquisition and AI context integration

Files: evidence-capture.ts, ingest.ts, store.ts, types.ts, fulltext.ts, topic-analysis.ts, evidence-legacy.ts, tianapi/context.ts; tests/tianapi-integration.test.ts.
- [x] Write RED integration tests for keyless behavior, canonical fallback/single feed, explicit evidence, auxiliary matching, unchanged heat scores, prompt input and analysis references, and generation rejection.
- [x] Wire client into fetchSource, expose existing evidence sink for explicit batches, add bounded auxiliary context and skip topic pages during fulltext fetching.
- [x] Run integration and full legacy suite GREEN, commit.

### Task 4: Runtime setup, diagnostics and review

Files: scripts/tianapi.ts, package.json, .env.example, docs/tianapi.md, free-data-source-setup.md, evidence-library.md, deploy-northflank.md, README.
- [x] Implement status/check CLI and document exact runtime vars, free quotas, actual coverage and verification limitations.
- [x] Run full tests, lint, typecheck, production build and git diff --check.
- [x] Request one fresh whole-change review, fix material findings RED→GREEN, retain review/rulings record.
- [x] Commit, merge and push main under existing user authorization. Report final verification and environment setup; no deployment monitoring.
