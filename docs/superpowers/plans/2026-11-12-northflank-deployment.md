# Northflank Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the previously proposed two-service Northflank deployment directly configurable from the published repositories.
**Architecture:** WcCAT web and hourly worker share one single-instance container and SQLite volume at /app/data. DailyHotApi runs in a second private service without requiring Redis. No Northflank resources are created by this implementation.
**Tech Stack:** Node22, Docker, Next.js, SQLite, existing TypeScript worker, Northflank combined services.
**Spec:** Prior approved deployment direction in chat: two services, public3002, private6688, one persistent single-reader/writer volume, hourly refresh and00:10 Asia/Shanghai daily reports.

## Global Constraints
- Retain ports3002/6688 and local development behavior.
- Do not bake secrets or local database into either image.
- Keep web and worker in one WcCAT instance with supervised shutdown.
- Do not expose production database administration or on-demand AI generation.

## Review Focus
- One child process exits: stop its sibling and let the platform restart the service.
- SIGTERM: both processes must exit without leaving orphan workers.
- Volume ownership: non-root runtime can create and retain SQLite data.
- No Redis: DailyHotApi must work without endless connection attempts.
- Fresh image: native SQLite dependency and tsx worker runtime must be present.

### Task1: Runtime and production boundaries
- [x] Add real child-process tests for sibling termination, shutdown, and spawn errors; run failing tests first.
- [x] Add process supervisor, cloud entry point, worker startup retry, health endpoint, and production-only endpoint closure.
- [x] Run tests and type checks.

### Task2: Docker images
- [x] Add WcCAT Dockerfile and .dockerignore with Node22 and persistent data directory.
- [x] Update DailyHotApi Dockerfile for reproducible Node22/pnpm build and optional Redis setting.
- [x] Build both Linux images, run startup/health/persistence/cache checks without real AI credentials.

### Task3: Documentation and delivery
- [x] Add exact Northflank dashboard settings, environment examples, and shell commands.
- [x] Perform independent code review and final tests/builds.
- [x] Commit and push the deployment configuration to both existing main branches, preserving history.

Verification: Linux/amd64 Docker builds passed for both repositories;25regression tests passed, TypeScript passed, lint0errors with1preexisting image warning. Health/home/daily passed; production admin/analyze/refresh closure and image proxy private-host denial passed. SQLite persisted across restart in a dedicated test volume. DailyHotApi memory cache read/write/delete passed with Redis disabled. Independent review found one Docker context LICENSE exclusion; fixed and final image rebuilt successfully. No live Northflank resources created.
