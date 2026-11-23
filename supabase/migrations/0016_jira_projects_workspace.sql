-- =============================================================================
-- Migration 0016: Jira-Grade Projects Workspace (Sprints, Issue Types, Ordering)
-- Idempotent migration safe for repeated execution.
-- =============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS board_config JSONB;

CREATE TABLE IF NOT EXISTS public.sprints (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  project_id UUID NOT NULL,
  name       TEXT NOT NULL,
  goal       TEXT,
  status     TEXT NOT NULL DEFAULT 'planned',
  start_date DATE,
  end_date   DATE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_sprints_project
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES public.projects(id, tenant_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sprints_tenant_project_status
  ON public.sprints (tenant_id, project_id, status);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS sprint_id    UUID REFERENCES public.sprints(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issue_type   TEXT NOT NULL DEFAULT 'task',
  ADD COLUMN IF NOT EXISTS labels       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS story_points INTEGER,
  ADD COLUMN IF NOT EXISTS board_order  INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_sprint
  ON public.tasks (tenant_id, project_id, sprint_id);
