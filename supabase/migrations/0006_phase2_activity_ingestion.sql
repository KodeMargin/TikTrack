-- =============================================================================
-- Migration 0006: Phase 2 Milestone 2.1 — Desktop Activity Buckets, Idle
-- Reconciliation, Privacy Exclusions, Device Enrollment & Clock Anomaly Detection
-- Covers F2-001 through F2-008 & F2-034..F2-035
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Device Enrollment, Update Channel, Clock Drift & Multi-Display Policy (F2-006..008)
-- -----------------------------------------------------------------------------

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS update_channel text NOT NULL DEFAULT 'stable'
    CHECK (update_channel IN ('stable', 'beta', 'enterprise_pinned')),
  ADD COLUMN IF NOT EXISTS last_clock_drift_seconds int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clock_anomaly_detected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS multi_display_policy text NOT NULL DEFAULT 'coarse_metadata_only'
    CHECK (multi_display_policy IN ('coarse_metadata_only'));

-- -----------------------------------------------------------------------------
-- 2. Per-App & Domain Privacy Exclusions / Denylist (F2-005)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.privacy_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  exclusion_pattern text NOT NULL CHECK (char_length(trim(exclusion_pattern)) >= 2),
  exclusion_type text NOT NULL DEFAULT 'app_identifier'
    CHECK (exclusion_type IN ('app_identifier', 'domain_pattern', 'workspace_path')),
  reason text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, exclusion_pattern)
);

CREATE INDEX IF NOT EXISTS idx_privacy_exclusions_tenant_user
  ON public.privacy_exclusions (tenant_id, user_id)
  WHERE is_active = true;

-- -----------------------------------------------------------------------------
-- 3. Guardrail Function Blocking Prohibited Surveillance Keys at DB Boundary (D-003)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.jsonb_contains_prohibited_surveillance_keys(payload jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_object_keys(COALESCE(payload, '{}'::jsonb)) AS k(key_name)
    WHERE lower(k.key_name) SIMILAR TO '%(keystroke|key_log|typed_text|password|clipboard|raw_source_code|file_contents|git_diff_raw|terminal_output|private_message|email_body|chat_transcript|screenshot_bytes|screen_recording|webcam_frame|microphone_audio|window_title_raw|full_url_with_query)%'
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. Activity Event Batches & Canonical Activity Events (F2-001, Section 11.5)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.activity_event_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  session_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'desktop'
    CHECK (source IN ('desktop', 'vscode', 'jetbrains', 'terminal', 'github', 'gitlab', 'manual')),
  batch_sequence int NOT NULL DEFAULT 1 CHECK (batch_sequence >= 1),
  event_count int NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  agent_build text NOT NULL DEFAULT '0.2.0',
  received_at_utc timestamptz NOT NULL DEFAULT now(),
  processed_at_utc timestamptz,
  processing_status text NOT NULL DEFAULT 'queued'
    CHECK (processing_status IN ('queued', 'processed', 'failed')),
  FOREIGN KEY (device_id, tenant_id, user_id)
    REFERENCES public.devices(id, tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (session_id, tenant_id, user_id)
    REFERENCES public.work_sessions(id, tenant_id, user_id) ON DELETE CASCADE,
  UNIQUE (device_id, id)
);

CREATE INDEX IF NOT EXISTS idx_activity_event_batches_user_received
  ON public.activity_event_batches (tenant_id, user_id, received_at_utc DESC);

CREATE TABLE IF NOT EXISTS public.activity_events (
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  session_id uuid NOT NULL,
  batch_id uuid REFERENCES public.activity_event_batches(id) ON DELETE SET NULL,
  source text NOT NULL
    CHECK (source IN ('desktop', 'vscode', 'jetbrains', 'terminal', 'github', 'gitlab', 'manual')),
  event_type text NOT NULL CHECK (
    event_type IN (
      'session_started',
      'session_paused',
      'session_resumed',
      'session_stopped',
      'work_mode_changed',
      'break_started',
      'break_ended',
      'activity_rollup_1m',
      'activity_rollup_5m',
      'vscode_workspace_context',
      'vscode_edit_save_bucket',
      'vscode_debug_session',
      'vscode_test_run',
      'terminal_command_category',
      'idle_gap_detected',
      'idle_gap_reconciled',
      'privacy_pause_toggled',
      'manual_claimed'
    )
  ),
  occurred_at_utc timestamptz NOT NULL,
  received_at_utc timestamptz NOT NULL DEFAULT now(),
  local_sequence bigint NOT NULL DEFAULT 1 CHECK (local_sequence >= 0),
  monotonic_elapsed_ms bigint NOT NULL DEFAULT 0 CHECK (monotonic_elapsed_ms >= 0),
  clock_drift_seconds int NOT NULL DEFAULT 0,
  consent_policy_version text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT no_prohibited_surveillance_metadata
    CHECK (NOT public.jsonb_contains_prohibited_surveillance_keys(metadata)),
  PRIMARY KEY (tenant_id, occurred_at_utc, source, event_id),
  FOREIGN KEY (device_id, tenant_id, user_id)
    REFERENCES public.devices(id, tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (session_id, tenant_id, user_id)
    REFERENCES public.work_sessions(id, tenant_id, user_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_events_idempotent_event_id
  ON public.activity_events (tenant_id, event_id);

CREATE INDEX IF NOT EXISTS idx_activity_events_session_occurred
  ON public.activity_events (tenant_id, session_id, occurred_at_utc ASC);

-- -----------------------------------------------------------------------------
-- 5. Coarse Activity Rollup Buckets & Idle Gap Reconciliation (F2-001..F2-004, F2-034)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.activity_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  bucket_start_utc timestamptz NOT NULL,
  bucket_minutes smallint NOT NULL DEFAULT 5 CHECK (bucket_minutes IN (1, 5)),
  app_category text NOT NULL DEFAULT 'ide' CHECK (
    app_category IN (
      'ide',
      'docs_browser',
      'terminal',
      'communication',
      'design',
      'other',
      'unobserved',
      'excluded_private'
    )
  ),
  work_mode text NOT NULL DEFAULT 'coding' CHECK (
    work_mode IN (
      'coding',
      'debugging',
      'thinking',
      'research',
      'testing',
      'review',
      'meeting',
      'design'
    )
  ),
  has_input_signal boolean NOT NULL DEFAULT true,
  concurrent_sources text[] NOT NULL DEFAULT ARRAY['desktop'],
  is_observation_gap boolean NOT NULL DEFAULT false,
  reconciliation_choice text CHECK (
    reconciliation_choice IN (
      'thinking',
      'reading',
      'meeting',
      'break',
      'away',
      'other'
    )
  ),
  reconciliation_note text,
  reconciled_at_utc timestamptz,
  display_count smallint NOT NULL DEFAULT 1 CHECK (display_count >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id, tenant_id, user_id)
    REFERENCES public.work_sessions(id, tenant_id, user_id) ON DELETE CASCADE,
  UNIQUE (tenant_id, session_id, bucket_start_utc, bucket_minutes)
);

CREATE INDEX IF NOT EXISTS idx_activity_rollups_session_bucket
  ON public.activity_rollups (tenant_id, session_id, bucket_start_utc ASC);

-- -----------------------------------------------------------------------------
-- 6. Row Level Security (RLS) Policies for Phase 2 Milestone 2.1
--    Note: Finance role is strictly excluded from raw workstation telemetry.
-- -----------------------------------------------------------------------------

ALTER TABLE public.privacy_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_event_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_rollups ENABLE ROW LEVEL SECURITY;

-- Privacy Exclusions: Only the owning developer can view/manage their local denylist
CREATE POLICY privacy_exclusions_owner_all ON public.privacy_exclusions
  FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  );

-- Activity Event Batches: Developer sees own batches (F2-035); Auditors/Owners can audit
CREATE POLICY activity_event_batches_select ON public.activity_event_batches
  FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id))
    OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

CREATE POLICY activity_event_batches_insert_own ON public.activity_event_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  );

-- Activity Events: Developer sees own raw events for Privacy Audit View (F2-035);
-- Finance and Client Reviewer roles NEVER see raw activity_events.
CREATE POLICY activity_events_select ON public.activity_events
  FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id))
    OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

CREATE POLICY activity_events_insert_own ON public.activity_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  );

-- Activity Rollups: Developer sees/updates own rollups (including idle reconciliation);
-- Project managers assigned to the session's project can view coarse rollups.
CREATE POLICY activity_rollups_select ON public.activity_rollups
  FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id))
    OR EXISTS (
      SELECT 1
      FROM public.work_sessions ws
      WHERE ws.id = activity_rollups.session_id
        AND ws.tenant_id = activity_rollups.tenant_id
        AND public.user_has_project_access(ws.tenant_id, ws.project_id, ARRAY['manager'])
    )
  );

CREATE POLICY activity_rollups_write_own ON public.activity_rollups
  FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  );

