# Editorial OS — Cloudflare Runtime (Phase 8)

This is a **runtime layer**, not a new phase of Editorial OS. It ports
Editorial OS v1.0's business logic (Phase 1-6: Collector, Normalize,
Validate, Duplicate, Confidence, Editorial Mapping, EditorialDesk,
Workspace, Worker) from Python to TypeScript so it can run on Cloudflare
Workers, on a Cron Trigger, backed by KV + R2. No business rule changed —
see each `src/*.ts` file's header comment for the exact Python file it
ports.

Not ported (out of scope for this phase, same as the Python original
already draws the line): PromptGenerator, MarkdownGenerator, any AI/API
call, the CLI (`scripts/editorial.py`), or editorial-dashboard/ (Phase 7).
"Worker chỉ chuẩn bị Queue" — no article is ever generated automatically
by this Worker.

## Architecture

```
Cloudflare Cron Trigger (*/30 * * * *)
        │
        ▼
Worker Runtime (src/index.ts scheduled())
        │
        ▼
Collector (src/providers.ts) → Normalize/Validate/Duplicate/Confidence
        (src/events.ts)               │
        ▼                             │
Editorial Queue (src/queue.ts) ◄──────┘
        │
        ▼
EditorialDesk (src/editorial.ts: Story/Priority/Decision/Assignment)
        │
        ▼
Workspace (src/workspace.ts)
        │
        ▼
Dashboard JSON (src/worker/dashboardBuilder.ts)
        │
        ▼
KV (src/kv.ts)  →  Worker API (src/api.ts)  →  Dashboard UI (unchanged)
```

`POST /run` runs the exact same path as the Cron Trigger — both call
`src/service.ts`'s `runWorkerOnce()`.

## KV Schema (one namespace, `EDITORIAL_KV`, five keys)

| Key             | Shape               | ≈ Python equivalent      |
|-----------------|----------------------|---------------------------|
| `queue`         | `StoryCandidate[]`  | `stories.json` (Phase 4)  |
| `history`       | `Article[]`         | `articles.json` (Phase 5) |
| `worker-status` | `RunLog[]`          | `worker_runs.json` (Phase 6) |
| `dashboard`     | `WorkerDashboard`   | `dashboard.json` (Phase 6)|
| `metrics`       | `WorkspaceMetrics`  | Phase 5's `MetricsEngine` output alone |

## R2 (one bucket, `EDITORIAL_R2`, three prefixes)

`drafts/`, `exports/`, `archive/` — provisioned for future/manual use
(`src/r2.ts`). The Worker's own run flow never writes here: "Không sinh
bài."

## API

- `POST /run` — runs the pipeline once, persists to KV, returns the run summary.
- `GET /health` — `HealthEngine` status (never_run/ok/failed, last run/success/failure, duration, events processed).
- `GET /dashboard` — the current `dashboard.json`-equivalent payload.
- `GET /queue` — the current `StoryCandidate[]`.
- `GET /history` — the current `Article[]` (with each one's History timeline).

## Local dev / test

```bash
npm install
npm run typecheck
npm test              # vitest, real Miniflare KV/R2 bindings, no network
npm test -- --coverage
npm run dev            # wrangler dev, local Worker + local KV/R2
```

## Deploy

```bash
wrangler login
wrangler kv namespace create EDITORIAL_KV
wrangler kv namespace create EDITORIAL_KV --preview
wrangler r2 bucket create tnc-editorial-os
# paste the two namespace ids into wrangler.toml's [[kv_namespaces]] block
wrangler deploy
```

The Cron Trigger (`*/30 * * * *`) starts firing automatically once
deployed — no separate step needed. `wrangler tail` to watch live runs.
