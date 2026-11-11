-- =============================================================================
-- Migration 0013: Phase 4 — Ecosystem Connectors (Calendar, Accounting, PM)
-- & Developer Portable Work Reports
-- Covers F4-008, F4-009, F4-010, F4-013
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ecosystem Connectors (F4-008, F4-009, F4-010)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ecosystem_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('calendar', 'accounting', 'external_pm')),
  provider text NOT NULL CHECK (
    provider IN (
      'google_calendar',
      'outlook_calendar',
      'xero',
      'quickbooks',
      'jira',
      'linear',
      'trello',
      'azure_devops'
    )
  ),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'paused', 'disconnected')),
  sync_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  connected_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_prohibited_connector_keys
    CHECK (NOT public.jsonb_contains_prohibited_surveillance_keys(sync_config)),
  UNIQUE (tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_ecosystem_connectors_tenant
  ON public.ecosystem_connectors (tenant_id, category, status);

-- -----------------------------------------------------------------------------
-- 2. Calendar Meeting Metadata Events (F4-008)
--    Permissioned metadata-only sync to associate meetings with `meeting` mode
--    segments without exposing private attendee emails or surveillance data.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.calendar_meeting_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  project_id uuid,
  task_id uuid,
  connector_id uuid REFERENCES public.ecosystem_connectors(id) ON DELETE SET NULL,
  external_event_id text NOT NULL,
  meeting_title_sanitized text NOT NULL,
  started_at_utc timestamptz NOT NULL,
  ended_at_utc timestamptz NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes > 0),
  associated_segment_id uuid REFERENCES public.time_segments(id) ON DELETE SET NULL,
  sync_permission_scope text NOT NULL DEFAULT 'metadata_only'
    CHECK (sync_permission_scope IN ('metadata_only', 'title_and_duration')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, tenant_id) REFERENCES public.projects(id, tenant_id) ON DELETE SET NULL,
  UNIQUE (tenant_id, user_id, external_event_id),
  CHECK (ended_at_utc > started_at_utc)
);

CREATE INDEX IF NOT EXISTS idx_calendar_meeting_events_user
  ON public.calendar_meeting_events (tenant_id, user_id, started_at_utc DESC);

-- -----------------------------------------------------------------------------
-- 3. Developer Portable Work Reports (F4-013)
--    Cryptographically signed export controlled by the developer covering only
--    their own approved session hours & deliverable links.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.portable_work_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  developer_user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  report_title text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_approved_minutes numeric(8, 2) NOT NULL DEFAULT 0,
  total_supported_minutes numeric(8, 2) NOT NULL DEFAULT 0,
  deliverables_count int NOT NULL DEFAULT 0,
  payload_digest_sha256 text NOT NULL,
  signature_hmac_sha256 text NOT NULL,
  report_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_portable_work_reports_developer
  ON public.portable_work_reports (tenant_id, developer_user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Row Level Security (RLS) Policies
-- -----------------------------------------------------------------------------

ALTER TABLE public.ecosystem_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_meeting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portable_work_reports ENABLE ROW LEVEL SECURITY;

-- Ecosystem connectors: tenant members can view status; owners/PMs/finance manage
CREATE POLICY ecosystem_connectors_select ON public.ecosystem_connectors
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND NOT public.user_has_tenant_role(tenant_id, ARRAY['client_reviewer'])
  );

CREATE POLICY ecosystem_connectors_manage ON public.ecosystem_connectors
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager', 'finance']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager', 'finance']));

-- Calendar meeting events: strictly developer-owned (or PM/Owner/Auditor);
-- Finance and Client Reviewer excluded from personal calendar metadata
CREATE POLICY calendar_meeting_events_select ON public.calendar_meeting_events
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND NOT public.user_has_tenant_role(tenant_id, ARRAY['finance', 'client_reviewer'])
    AND (
      user_id = (SELECT auth.uid())
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
    )
  );

CREATE POLICY calendar_meeting_events_manage_own ON public.calendar_meeting_events
  FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  );

-- Portable work reports: strictly developer-controlled (own reports) + auditor oversight
CREATE POLICY portable_work_reports_select ON public.portable_work_reports
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      developer_user_id = (SELECT auth.uid())
      OR public.user_has_tenant_role(tenant_id, ARRAY['auditor'])
    )
  );

CREATE POLICY portable_work_reports_insert_own ON public.portable_work_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    developer_user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
    AND NOT public.user_has_tenant_role(tenant_id, ARRAY['client_reviewer'])
  );

