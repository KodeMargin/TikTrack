-- =============================================================================
-- Migration 0018: Reporting & Analytics (Saved Reports, Scheduled Reports,
-- Shared Report Links, Daily Analytics Rollups & Performance Indexes)
--
-- Idempotent: every statement uses IF NOT EXISTS so it is safe to re-run.
-- NOTE: keep statements free of DO-blocks / functions - runtime splits on ';'.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  report_type text NOT NULL DEFAULT 'custom_pivot',
  visibility text NOT NULL DEFAULT 'private',
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_tenant_type
  ON public.saved_reports (tenant_id, report_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  saved_report_id uuid NOT NULL REFERENCES public.saved_reports(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  frequency text NOT NULL DEFAULT 'weekly',
  day_of_week int DEFAULT 1,
  day_of_month int DEFAULT 1,
  send_time_utc text NOT NULL DEFAULT '08:00',
  timezone text NOT NULL DEFAULT 'UTC',
  export_format text NOT NULL DEFAULT 'pdf',
  recipient_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_active boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  next_run_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_tenant_active
  ON public.scheduled_reports (tenant_id, is_active, next_run_at);

CREATE TABLE IF NOT EXISTS public.shared_report_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  saved_report_id uuid REFERENCES public.saved_reports(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  label text NOT NULL,
  token_hash_sha256 text NOT NULL UNIQUE,
  scope_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  passcode_hash text,
  expires_at timestamptz,
  revoked_at timestamptz,
  view_count int NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shared_report_links_tenant
  ON public.shared_report_links (tenant_id, revoked_at, created_at DESC);

CREATE TABLE IF NOT EXISTS public.analytics_daily_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  work_mode text NOT NULL DEFAULT 'coding',
  elapsed_minutes numeric(8, 2) NOT NULL DEFAULT 0,
  claimed_minutes numeric(8, 2) NOT NULL DEFAULT 0,
  observed_minutes numeric(8, 2) NOT NULL DEFAULT 0,
  supported_minutes numeric(8, 2) NOT NULL DEFAULT 0,
  approved_billable_minutes numeric(8, 2) NOT NULL DEFAULT 0,
  billable_amount numeric(12, 2) NOT NULL DEFAULT 0,
  internal_cost_amount numeric(12, 2) NOT NULL DEFAULT 0,
  evidence_artifact_count int NOT NULL DEFAULT 0,
  rule_flag_count int NOT NULL DEFAULT 0,
  dispute_count int NOT NULL DEFAULT 0,
  observation_gap_minutes numeric(8, 2) NOT NULL DEFAULT 0,
  sessions_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, work_date, project_id, user_id, work_mode)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_rollups_tenant_date
  ON public.analytics_daily_rollups (tenant_id, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_timesheet_lines_tenant_work_date_status
  ON public.timesheet_lines (tenant_id, work_date DESC, line_status);

ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_report_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_daily_rollups ENABLE ROW LEVEL SECURITY;
