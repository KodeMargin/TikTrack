# DevProof (TikTrack)

Evidence-backed engineering intelligence and developer time verification platform across **Phases 0–5**, built with **React 19 + Vite 8 + Tailwind CSS v4 + Prisma + Supabase**.

## Architecture Overview

- **Frontend (`TikTrack/src/`)**: Interactive workspace (`App.tsx`), theme & WCAG/locale accessibility (`ThemeContext.tsx`), and phase-scoped context stores (`DataContext`, `Phase2Store`, `Phase3Store`, `Phase4Store`, `Phase5Store`).
- **Time & Privacy Engine (`TikTrack/src/lib/`)**:
  - `time-engine/` - Non-double-counting 5-minute UTC interval union rollup (`focus`, `debug`, `code_review`, `communication`, `observation_gap`).
  - `phase3/` - Evidence trust tiers, AI coding-assistant correlation, and payroll lockouts.
  - `phase4/` - Automated time-card approvals, sprint forecasting, Jira/Linear/GitHub/Calendar webhooks, and immutable client share links.
  - `phase5/` - Enterprise SSO/SCIM, two-person policy governance, tenant retention/legal-hold sweeps, OCSF SIEM export sanitization, fleet OS compliance, warehouse manifests, and DR readiness gates.
- **Database & Security (`TikTrack/prisma/`, `TikTrack/supabase/`)**:
  - Normalized PostgreSQL schema (`prisma/schema.prisma`) and incremental migrations (`supabase/migrations/0001`–`0016`) + `pgTAP` verification tests (`supabase/tests/0001`–`0005`).
  - Idempotent live DB guard script (`supabase/apply_live_guards.sql`) covering append-only log immutability, two-person approval constraints, retention sweeps, and Row-Level Security (RLS) policies.
  - Supabase Edge Functions (`supabase/functions/`): `queue-worker`, `scim-provisioning`, `siem-export`, `enterprise-ops`, `jira-sync`, `webhook-ingest`, and `public-report`.
- **Detachable Queue Worker (`TikTrack/src/worker/detachableQueueWorker.ts`, `TikTrack/Dockerfile.worker`)**: Standalone horizontally scalable Node/TypeScript worker polling `ingest_queue_jobs`, deduplicating concurrent multi-source heartbeats into 5-minute UTC rollups, and isolating exhausted jobs into `ingest_dead_letter_jobs`.
- **Companion Clients**:
  - `desktop-agent/` - Tauri / TypeScript desktop window-focus & idle monitor.
  - `vscode-extension/` - VS Code active-file, git-branch, and debug-state heartbeat extension.

## Getting Started

Run commands inside `TikTrack/`:

```bash
cd TikTrack
npm install
```

Configure `TikTrack/.env.local` with your Supabase URL/publishable key and Postgres connection strings (`DATABASE_URL`, `DIRECT_URL`). Never expose `DATABASE_URL` or service-role keys with a `VITE_` prefix.

## Common Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm test` | Run Node `--experimental-strip-types` unit & domain test suites |
| `npm run lint` | Run ESLint across the workspace |
| `npm run build` | Type-check (`tsc -b`) and build production bundle (`vite build`) |
| `npm run verify:scale` | Run the 1,000-concurrent-developer scale & DR readiness verification drill |
| `npm run worker` | Start the detachable queue worker loop (append `-- --once` for single-cycle execution) |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:push` | Push Prisma schema changes to Postgres |
| `npm run db:seed` | Seed sample tenant and telemetry data |

## Detachable Worker Container

```bash
docker build -f Dockerfile.worker -t devproof-queue-worker .
docker run --rm --env-file .env.local devproof-queue-worker
```

Environment variables: `DATABASE_URL`, `WORKER_POLL_MS` (default `2000`), and `WORKER_BATCH_SIZE` (default `50`).
