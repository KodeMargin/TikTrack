-- =============================================================================
-- DevProof (TikTrack) — Idempotent Live Supabase Security & Integrity Guards
-- Applies extensions, GiST non-overlap constraint, immutability triggers,
-- anti-surveillance DB guards, auth profile sync, and multi-tenant RLS
-- policies onto a Prisma-pushed Supabase PostgreSQL database.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- -----------------------------------------------------------------------------
-- 1. Fraud-Prevention DB Constraints & Anti-Surveillance Boundary (D-003, F1-029)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'no_overlapping_billable_segments_per_user'
      AND conrelid = 'public.time_segments'::regclass
  ) THEN
    ALTER TABLE public.time_segments
      ADD CONSTRAINT no_overlapping_billable_segments_per_user
      EXCLUDE USING gist (
        tenant_id WITH =,
        user_id WITH =,
        segment_range WITH &&
      ) WHERE (provenance <> 'superseded_duplicate');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_tasks_parent_task'
      AND conrelid = 'public.tasks'::regclass
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT fk_tasks_parent_task
      FOREIGN KEY (parent_task_id, tenant_id, project_id)
      REFERENCES public.tasks(id, tenant_id, project_id)
      ON DELETE SET NULL;
  END IF;
END $$;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'no_prohibited_surveillance_metadata'
      AND conrelid = 'public.activity_events'::regclass
  ) THEN
    ALTER TABLE public.activity_events
      ADD CONSTRAINT no_prohibited_surveillance_metadata
      CHECK (NOT public.jsonb_contains_prohibited_surveillance_keys(metadata));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Locked Billing & Append-Only Audit Guards (F1-047)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_locked_timesheet_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.is_locked = true AND (
    NEW.approved_billable_minutes <> OLD.approved_billable_minutes
    OR NEW.snapshot_hourly_rate <> OLD.snapshot_hourly_rate
    OR NEW.claimed_minutes <> OLD.claimed_minutes
  ) THEN
    RAISE EXCEPTION 'Locked timesheet line (%) cannot be mutated in place. Issue a credit/adjustment line instead (F1-047).', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_timesheet_line_mutation ON public.timesheet_lines;
CREATE TRIGGER trg_prevent_locked_timesheet_line_mutation
  BEFORE UPDATE ON public.timesheet_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_timesheet_line_mutation();

REVOKE UPDATE, DELETE ON public.audit_entries FROM PUBLIC, authenticated;
REVOKE UPDATE, DELETE ON public.review_decisions FROM PUBLIC, authenticated;
REVOKE UPDATE, DELETE ON public.session_adjustments FROM PUBLIC, authenticated;
REVOKE UPDATE, DELETE ON public.dispute_messages FROM PUBLIC, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Auto-Sync Supabase Auth Signups -> public.user_profiles
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, 'user@devproof.local'),
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
      split_part(COALESCE(NEW.email, 'member'), '@', 1)
    )
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 4. Plan Entitlements Seed (F1-006)
-- -----------------------------------------------------------------------------

INSERT INTO public.plan_entitlements (
  plan_tier, max_seats, max_active_projects, retention_days, github_ide_enabled, client_portal_enabled, ai_assistance_available
)
VALUES
  ('starter', 5, 3, 90, false, false, false),
  ('team', 25, 25, 365, true, false, true),
  ('agency', 100, 100, 730, true, true, true),
  ('enterprise', 10000, 10000, 2555, true, true, true)
ON CONFLICT (plan_tier) DO UPDATE SET
  max_seats = EXCLUDED.max_seats,
  max_active_projects = EXCLUDED.max_active_projects,
  retention_days = EXCLUDED.retention_days,
  github_ide_enabled = EXCLUDED.github_ide_enabled,
  client_portal_enabled = EXCLUDED.client_portal_enabled,
  ai_assistance_available = EXCLUDED.ai_assistance_available;

-- -----------------------------------------------------------------------------
-- 5. Idempotent Webhook & Evidence Ingestion Function (F2-021)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ingest_webhook_evidence_idempotent(
  p_tenant_id uuid,
  p_project_id uuid,
  p_task_id uuid,
  p_provider text,
  p_delivery_id text,
  p_event_type text,
  p_signature_verified boolean,
  p_payload_sha256 text,
  p_source_type text,
  p_external_id text,
  p_occurred_at_utc timestamptz,
  p_actor_user_id uuid,
  p_summary_title text,
  p_metadata jsonb,
  p_link_type text DEFAULT 'contemporaneous',
  p_link_rationale text DEFAULT 'Matched task code in branch/commit metadata'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_receipt_id uuid;
  v_attempt_count int;
  v_artifact_id uuid;
  v_was_duplicate boolean := false;
BEGIN
  IF NOT p_signature_verified THEN
    INSERT INTO public.webhook_receipts (
      tenant_id, provider, delivery_id, event_type, signature_verified, payload_sha256, status
    )
    VALUES (
      p_tenant_id, p_provider, p_delivery_id, p_event_type, false, p_payload_sha256, 'rejected_signature'
    )
    ON CONFLICT (provider, delivery_id) DO UPDATE
      SET delivery_attempt_count = public.webhook_receipts.delivery_attempt_count + 1
    RETURNING id, delivery_attempt_count INTO v_receipt_id, v_attempt_count;

    RETURN jsonb_build_object(
      'accepted', false,
      'reason', 'Invalid webhook HMAC signature',
      'receipt_id', v_receipt_id
    );
  END IF;

  SELECT id, delivery_attempt_count
  INTO v_receipt_id, v_attempt_count
  FROM public.webhook_receipts
  WHERE provider = p_provider AND delivery_id = p_delivery_id;

  IF v_receipt_id IS NOT NULL THEN
    v_was_duplicate := true;
    UPDATE public.webhook_receipts
    SET delivery_attempt_count = delivery_attempt_count + 1,
        status = 'duplicate_ignored',
        processed_at_utc = now()
    WHERE id = v_receipt_id
    RETURNING delivery_attempt_count INTO v_attempt_count;
  ELSE
    INSERT INTO public.webhook_receipts (
      tenant_id, provider, delivery_id, event_type, signature_verified, payload_sha256, status, processed_at_utc
    )
    VALUES (
      p_tenant_id, p_provider, p_delivery_id, p_event_type, true, p_payload_sha256, 'processed', now()
    )
    RETURNING id, delivery_attempt_count INTO v_receipt_id, v_attempt_count;
  END IF;

  INSERT INTO public.evidence_artifacts (
    tenant_id, project_id, source_type, capture_mode, external_id, occurred_at_utc,
    actor_user_id, summary_title, metadata, reliability_status
  )
  VALUES (
    p_tenant_id, p_project_id, p_source_type, 'webhook', p_external_id, p_occurred_at_utc,
    p_actor_user_id, p_summary_title, COALESCE(p_metadata, '{}'::jsonb), 'verified_webhook'
  )
  ON CONFLICT (tenant_id, source_type, external_id) DO UPDATE
    SET summary_title = EXCLUDED.summary_title
  RETURNING id INTO v_artifact_id;

  IF p_task_id IS NOT NULL THEN
    INSERT INTO public.evidence_links (
      tenant_id, project_id, task_id, artifact_id, link_type, link_confidence, link_rationale
    )
    VALUES (
      p_tenant_id, p_project_id, p_task_id, v_artifact_id, p_link_type,
      CASE WHEN p_link_type = 'contemporaneous' THEN 0.95 ELSE 0.85 END,
      p_link_rationale
    )
    ON CONFLICT (tenant_id, task_id, artifact_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'accepted', true,
    'deduplicated', v_was_duplicate,
    'delivery_attempt_count', v_attempt_count,
    'receipt_id', v_receipt_id,
    'artifact_id', v_artifact_id
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Multi-Tenant Security Definer RLS Helpers & Policies
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_is_active_tenant_member(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.tenant_id = target_tenant_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_tenant_role(
  target_tenant_id uuid,
  allowed_roles text[]
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.role_grants rg
      ON rg.membership_id = m.id
     AND rg.tenant_id = m.tenant_id
    WHERE m.tenant_id = target_tenant_id
      AND m.user_id = (SELECT auth.uid())
      AND m.status = 'active'
      AND rg.role = ANY(allowed_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_project_access(
  target_tenant_id uuid,
  target_project_id uuid,
  allowed_project_roles text[] DEFAULT ARRAY['manager', 'contributor', 'viewer', 'client_reviewer']
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    public.user_is_active_tenant_member(target_tenant_id)
    AND (
      public.user_has_tenant_role(target_tenant_id, ARRAY['tenant_owner', 'finance', 'auditor'])
      OR EXISTS (
        SELECT 1
        FROM public.project_members pm
        WHERE pm.tenant_id = target_tenant_id
          AND pm.project_id = target_project_id
          AND pm.user_id = (SELECT auth.uid())
          AND pm.project_role = ANY(allowed_project_roles)
      )
    );
$$;

-- Tenants
DROP POLICY IF EXISTS tenants_select_member ON public.tenants;
CREATE POLICY tenants_select_member ON public.tenants
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(id));

DROP POLICY IF EXISTS tenants_update_owner ON public.tenants;
CREATE POLICY tenants_update_owner ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.user_has_tenant_role(id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(id, ARRAY['tenant_owner']));

-- User Profiles
DROP POLICY IF EXISTS user_profiles_select_self_or_tenant ON public.user_profiles;
CREATE POLICY user_profiles_select_self_or_tenant ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.memberships m1
      JOIN public.memberships m2 ON m1.tenant_id = m2.tenant_id
      WHERE m1.user_id = (SELECT auth.uid())
        AND m1.status = 'active'
        AND m2.user_id = public.user_profiles.id
    )
  );

DROP POLICY IF EXISTS user_profiles_update_self ON public.user_profiles;
CREATE POLICY user_profiles_update_self ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Memberships & Roles
DROP POLICY IF EXISTS memberships_select_tenant ON public.memberships;
CREATE POLICY memberships_select_tenant ON public.memberships
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

DROP POLICY IF EXISTS memberships_manage_owner ON public.memberships;
CREATE POLICY memberships_manage_owner ON public.memberships
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

DROP POLICY IF EXISTS role_grants_select_tenant ON public.role_grants;
CREATE POLICY role_grants_select_tenant ON public.role_grants
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

DROP POLICY IF EXISTS role_grants_manage_owner ON public.role_grants;
CREATE POLICY role_grants_manage_owner ON public.role_grants
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

-- Settings, Policies & Plan Entitlements
DROP POLICY IF EXISTS tenant_settings_select_member ON public.tenant_settings;
CREATE POLICY tenant_settings_select_member ON public.tenant_settings
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

DROP POLICY IF EXISTS tenant_settings_update_owner ON public.tenant_settings;
CREATE POLICY tenant_settings_update_owner ON public.tenant_settings
  FOR UPDATE TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

DROP POLICY IF EXISTS policy_versions_select_member ON public.policy_versions;
CREATE POLICY policy_versions_select_member ON public.policy_versions
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

DROP POLICY IF EXISTS policy_consents_select_self_or_admin ON public.policy_consents;
CREATE POLICY policy_consents_select_self_or_admin ON public.policy_consents
  FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id))
    OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

DROP POLICY IF EXISTS plan_entitlements_select_authenticated ON public.plan_entitlements;
CREATE POLICY plan_entitlements_select_authenticated ON public.plan_entitlements
  FOR SELECT TO authenticated
  USING (true);

-- Devices & Audit
DROP POLICY IF EXISTS devices_select_self_or_owner ON public.devices;
CREATE POLICY devices_select_self_or_owner ON public.devices
  FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id))
    OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

DROP POLICY IF EXISTS audit_entries_select_authorized ON public.audit_entries;
CREATE POLICY audit_entries_select_authorized ON public.audit_entries
  FOR SELECT TO authenticated
  USING (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
    OR (actor_user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id))
  );

-- Projects & Tasks
DROP POLICY IF EXISTS projects_select_scoped ON public.projects;
CREATE POLICY projects_select_scoped ON public.projects
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(tenant_id, id));

DROP POLICY IF EXISTS projects_manage_owner_or_pm ON public.projects;
CREATE POLICY projects_manage_owner_or_pm ON public.projects
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager']));

DROP POLICY IF EXISTS project_members_select_scoped ON public.project_members;
CREATE POLICY project_members_select_scoped ON public.project_members
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(tenant_id, project_id));

DROP POLICY IF EXISTS tasks_select_scoped ON public.tasks;
CREATE POLICY tasks_select_scoped ON public.tasks
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(tenant_id, project_id));

DROP POLICY IF EXISTS tasks_manage_pm_or_contributor ON public.tasks;
CREATE POLICY tasks_manage_pm_or_contributor ON public.tasks
  FOR ALL TO authenticated
  USING (public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor']))
  WITH CHECK (public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor']));

DROP POLICY IF EXISTS task_assignments_select_scoped ON public.task_assignments;
CREATE POLICY task_assignments_select_scoped ON public.task_assignments
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(tenant_id, project_id));

DROP POLICY IF EXISTS task_notes_select_scoped ON public.task_notes;
CREATE POLICY task_notes_select_scoped ON public.task_notes
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(tenant_id, project_id));

-- Work Sessions, Time Segments & Commercial Billing
DROP POLICY IF EXISTS work_sessions_select_scoped ON public.work_sessions;
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

DROP POLICY IF EXISTS work_mode_events_select_scoped ON public.work_mode_events;
CREATE POLICY work_mode_events_select_scoped ON public.work_mode_events
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      user_id = (SELECT auth.uid())
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
    )
  );

DROP POLICY IF EXISTS breaks_select_scoped ON public.breaks;
CREATE POLICY breaks_select_scoped ON public.breaks
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      user_id = (SELECT auth.uid())
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
    )
  );

DROP POLICY IF EXISTS time_segments_select_scoped ON public.time_segments;
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

DROP POLICY IF EXISTS session_adjustments_select_scoped ON public.session_adjustments;
CREATE POLICY session_adjustments_select_scoped ON public.session_adjustments
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      actor_user_id = (SELECT auth.uid())
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
    )
  );

DROP POLICY IF EXISTS contracts_select_scoped ON public.contracts;
CREATE POLICY contracts_select_scoped ON public.contracts
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      developer_user_id = (SELECT auth.uid())
      OR developer_user_id IS NULL
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'finance', 'project_manager', 'auditor'])
    )
  );

DROP POLICY IF EXISTS contract_rate_versions_select_scoped ON public.contract_rate_versions;
CREATE POLICY contract_rate_versions_select_scoped ON public.contract_rate_versions
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

DROP POLICY IF EXISTS timesheets_select_scoped ON public.timesheets;
CREATE POLICY timesheets_select_scoped ON public.timesheets
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      user_id = (SELECT auth.uid())
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'finance', 'auditor'])
      OR public.user_has_project_access(tenant_id, project_id, ARRAY['manager'])
      OR (
        status IN ('approved', 'locked')
        AND public.user_has_project_access(tenant_id, project_id, ARRAY['client_reviewer'])
      )
    )
  );

DROP POLICY IF EXISTS timesheet_lines_select_scoped ON public.timesheet_lines;
CREATE POLICY timesheet_lines_select_scoped ON public.timesheet_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.timesheets ts
      WHERE ts.id = public.timesheet_lines.timesheet_id
        AND ts.tenant_id = public.timesheet_lines.tenant_id
    )
  );

DROP POLICY IF EXISTS review_decisions_select_scoped ON public.review_decisions;
CREATE POLICY review_decisions_select_scoped ON public.review_decisions
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

DROP POLICY IF EXISTS disputes_select_scoped ON public.disputes;
CREATE POLICY disputes_select_scoped ON public.disputes
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

DROP POLICY IF EXISTS dispute_messages_select_scoped ON public.dispute_messages;
CREATE POLICY dispute_messages_select_scoped ON public.dispute_messages
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

DROP POLICY IF EXISTS invoice_drafts_select_scoped ON public.invoice_drafts;
CREATE POLICY invoice_drafts_select_scoped ON public.invoice_drafts
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND (
      public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'finance', 'project_manager', 'auditor'])
      OR (
        status = 'finalized_locked'
        AND public.user_has_project_access(tenant_id, project_id, ARRAY['client_reviewer'])
      )
    )
  );

DROP POLICY IF EXISTS invoice_lines_select_scoped ON public.invoice_lines;
CREATE POLICY invoice_lines_select_scoped ON public.invoice_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoice_drafts inv
      WHERE inv.id = public.invoice_lines.invoice_id
        AND inv.tenant_id = public.invoice_lines.tenant_id
    )
  );

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  );

-- Phase 2 Activity, Privacy, Integrations & Evidence RLS
DROP POLICY IF EXISTS privacy_exclusions_owner_all ON public.privacy_exclusions;
CREATE POLICY privacy_exclusions_owner_all ON public.privacy_exclusions
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id))
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id));

DROP POLICY IF EXISTS activity_event_batches_select ON public.activity_event_batches;
CREATE POLICY activity_event_batches_select ON public.activity_event_batches
  FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id))
    OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

DROP POLICY IF EXISTS activity_events_select ON public.activity_events;
CREATE POLICY activity_events_select ON public.activity_events
  FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id))
    OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

DROP POLICY IF EXISTS activity_rollups_select ON public.activity_rollups;
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

DROP POLICY IF EXISTS connected_integrations_select ON public.connected_integrations;
CREATE POLICY connected_integrations_select ON public.connected_integrations
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

DROP POLICY IF EXISTS repository_links_select ON public.repository_links;
CREATE POLICY repository_links_select ON public.repository_links
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(tenant_id, project_id));

DROP POLICY IF EXISTS ide_workspace_mappings_select ON public.ide_workspace_mappings;
CREATE POLICY ide_workspace_mappings_select ON public.ide_workspace_mappings
  FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id))
    OR public.user_has_project_access(tenant_id, project_id, ARRAY['manager'])
  );

DROP POLICY IF EXISTS webhook_receipts_select ON public.webhook_receipts;
CREATE POLICY webhook_receipts_select ON public.webhook_receipts
  FOR SELECT TO authenticated
  USING (
    public.user_has_tenant_role(
      tenant_id,
      ARRAY['tenant_owner', 'project_manager', 'developer', 'auditor']
    )
  );

DROP POLICY IF EXISTS evidence_artifacts_select ON public.evidence_artifacts;
CREATE POLICY evidence_artifacts_select ON public.evidence_artifacts
  FOR SELECT TO authenticated
  USING (
    public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor'])
    OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

DROP POLICY IF EXISTS evidence_links_select ON public.evidence_links;
CREATE POLICY evidence_links_select ON public.evidence_links
  FOR SELECT TO authenticated
  USING (
    public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor'])
    OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

DROP POLICY IF EXISTS session_annotations_select ON public.session_annotations;
CREATE POLICY session_annotations_select ON public.session_annotations
  FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id))
    OR EXISTS (
      SELECT 1
      FROM public.work_sessions ws
      WHERE ws.id = session_annotations.session_id
        AND ws.tenant_id = session_annotations.tenant_id
        AND public.user_has_project_access(ws.tenant_id, ws.project_id, ARRAY['manager'])
    )
  );

-- Private Storage Buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('task-attachments', 'task-attachments', false),
  ('invoice-exports', 'invoice-exports', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS storage_task_attachments_select ON storage.objects;
CREATE POLICY storage_task_attachments_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND array_length(storage.foldername(name), 1) >= 2
    AND public.user_has_project_access(
      (storage.foldername(name))[1]::uuid,
      (storage.foldername(name))[2]::uuid
    )
  );

DROP POLICY IF EXISTS storage_invoice_exports_select ON storage.objects;
CREATE POLICY storage_invoice_exports_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-exports'
    AND array_length(storage.foldername(name), 1) >= 1
    AND public.user_has_tenant_role(
      (storage.foldername(name))[1]::uuid,
      ARRAY['tenant_owner', 'finance', 'auditor']
    )
  );

