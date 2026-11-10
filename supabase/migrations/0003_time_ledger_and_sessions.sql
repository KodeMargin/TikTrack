-- =============================================================================
-- Migration 0003: Time Ledger, Work Sessions, Deep-Work Modes & GiST Non-Overlap
-- Covers Phase 1 Milestone 1.3: F1-020 through F1-030
-- =============================================================================

CREATE TABLE public.work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  device_id uuid,
  project_id uuid NOT NULL,
  task_id uuid NOT NULL,
  provenance text NOT NULL DEFAULT 'desktop_timer' CHECK (
    provenance IN ('desktop_timer', 'web_timer', 'manual_entry')
  ),
  lifecycle_state text NOT NULL DEFAULT 'running' CHECK (
    lifecycle_state IN ('running', 'paused', 'on_break', 'completed', 'abandoned_recovered')
  ),
  current_work_mode text NOT NULL DEFAULT 'coding' CHECK (
    current_work_mode IN (
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
  started_at_utc timestamptz NOT NULL DEFAULT now(),
  ended_at_utc timestamptz,
  monotonic_duration_ms bigint NOT NULL DEFAULT 0 CHECK (monotonic_duration_ms >= 0),
  clock_drift_seconds int NOT NULL DEFAULT 0,
  session_notes text NOT NULL DEFAULT '',
  outcome_summary text NOT NULL DEFAULT '',
  manual_reason text,
  policy_version_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (task_id, tenant_id, project_id) REFERENCES public.tasks(id, tenant_id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (policy_version_id, tenant_id) REFERENCES public.policy_versions(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT manual_entry_requires_reason CHECK (
    provenance <> 'manual_entry' OR (manual_reason IS NOT NULL AND char_length(trim(manual_reason)) >= 10)
  ),
  UNIQUE (id, tenant_id, user_id)
);

CREATE INDEX idx_work_sessions_tenant_user_started
  ON public.work_sessions (tenant_id, user_id, started_at_utc DESC);

CREATE INDEX idx_work_sessions_tenant_project
  ON public.work_sessions (tenant_id, project_id, started_at_utc DESC);

CREATE TABLE public.work_mode_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  work_mode text NOT NULL CHECK (
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
  started_at_utc timestamptz NOT NULL,
  ended_at_utc timestamptz,
  declared_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id, tenant_id, user_id) REFERENCES public.work_sessions(id, tenant_id, user_id) ON DELETE CASCADE
);

CREATE TABLE public.breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  break_type text NOT NULL DEFAULT 'unpaid' CHECK (break_type IN ('paid', 'unpaid', 'personal')),
  started_at_utc timestamptz NOT NULL,
  ended_at_utc timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id, tenant_id, user_id) REFERENCES public.work_sessions(id, tenant_id, user_id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- Canonical Non-Overlapping Time Segments (Principle 5 & F1-029)
-- -----------------------------------------------------------------------------

CREATE TABLE public.time_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  task_id uuid NOT NULL,
  session_id uuid NOT NULL,
  work_date date NOT NULL,
  segment_range tstzrange NOT NULL,
  work_mode text NOT NULL CHECK (
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
  provenance text NOT NULL DEFAULT 'desktop_timer' CHECK (
    provenance IN ('desktop_timer', 'web_timer', 'manual_entry', 'superseded_duplicate')
  ),
  evidence_status text NOT NULL DEFAULT 'declared' CHECK (
    evidence_status IN (
      'declared',
      'observed',
      'context_added',
      'corroborated',
      'needs_clarification',
      'approved',
      'disputed'
    )
  ),
  -- Five Separate Time Concepts (F1-041)
  elapsed_minutes numeric(6,2) NOT NULL CHECK (elapsed_minutes >= 0),
  claimed_minutes numeric(6,2) NOT NULL CHECK (claimed_minutes >= 0),
  observed_minutes numeric(6,2) NOT NULL DEFAULT 0 CHECK (observed_minutes >= 0),
  supported_minutes numeric(6,2) NOT NULL DEFAULT 0 CHECK (supported_minutes >= 0),
  approved_billable_minutes numeric(6,2) NOT NULL DEFAULT 0 CHECK (approved_billable_minutes >= 0),
  developer_explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id, tenant_id, user_id) REFERENCES public.work_sessions(id, tenant_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (task_id, tenant_id, project_id) REFERENCES public.tasks(id, tenant_id, project_id) ON DELETE RESTRICT,
  -- F1-029 & Acceptance Scenario 3: Prevent overlapping billable intervals per user
  CONSTRAINT no_overlapping_billable_segments_per_user
    EXCLUDE USING gist (
      tenant_id WITH =,
      user_id WITH =,
      segment_range WITH &&
    ) WHERE (provenance <> 'superseded_duplicate')
);

CREATE INDEX idx_time_segments_tenant_user_date
  ON public.time_segments (tenant_id, user_id, work_date);

CREATE INDEX idx_time_segments_tenant_project_date
  ON public.time_segments (tenant_id, project_id, work_date);

CREATE TABLE public.session_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  segment_id uuid REFERENCES public.time_segments(id) ON DELETE SET NULL,
  actor_user_id uuid NOT NULL REFERENCES public.user_profiles(id),
  adjustment_type text NOT NULL CHECK (
    adjustment_type IN ('developer_correction', 'overlap_deduplication', 'manager_adjustment', 'idle_reconciliation')
  ),
  reason text NOT NULL CHECK (char_length(trim(reason)) >= 5),
  before_payload jsonb NOT NULL,
  after_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE UPDATE, DELETE ON public.session_adjustments FROM PUBLIC, authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS & Strict Role Boundaries for Sessions & Segments (Section 12.4)
-- -----------------------------------------------------------------------------

ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_mode_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_adjustments ENABLE ROW LEVEL SECURITY;

-- Developers read/write own sessions; Assigned Project Managers & Owners read project sessions;
-- Finance and Client Reviewers do NOT have direct access to raw work_sessions.
CREATE POLICY work_sessions_select_scoped ON public.work_sessions
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      user_id = (SELECT auth.uid())
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
      OR public.user_has_project_access(tenant_id, project_id, ARRAY['manager'])
    )
  );

CREATE POLICY work_sessions_insert_own ON public.work_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor'])
  );

CREATE POLICY work_sessions_update_own ON public.work_sessions
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  );

CREATE POLICY work_mode_events_select_scoped ON public.work_mode_events
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      user_id = (SELECT auth.uid())
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
    )
  );

CREATE POLICY work_mode_events_insert_own ON public.work_mode_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  );

CREATE POLICY breaks_select_scoped ON public.breaks
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      user_id = (SELECT auth.uid())
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
    )
  );

CREATE POLICY breaks_insert_own ON public.breaks
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  );

CREATE POLICY time_segments_select_scoped ON public.time_segments
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      user_id = (SELECT auth.uid())
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
      OR public.user_has_project_access(tenant_id, project_id, ARRAY['manager'])
    )
  );

CREATE POLICY time_segments_insert_own ON public.time_segments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor'])
  );

CREATE POLICY time_segments_update_own_draft ON public.time_segments
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND evidence_status NOT IN ('approved')
    AND public.user_is_active_tenant_member(tenant_id)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND evidence_status NOT IN ('approved')
    AND public.user_is_active_tenant_member(tenant_id)
  );

CREATE POLICY session_adjustments_select_scoped ON public.session_adjustments
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

