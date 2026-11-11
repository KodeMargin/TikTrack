-- =============================================================================
-- Migration 0007: Phase 2 Milestones 2.2–2.4 — IDE Workspace Mappings,
-- GitHub/GitLab Webhooks, Evidence Artifacts, Evidence Links & Annotations
-- Covers F2-010 through F2-035
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Connected Integrations & Repository Links (F2-020, F2-025, F2-026)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.connected_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (
    provider IN ('github', 'gitlab', 'vscode', 'jetbrains', 'terminal', 'jira', 'linear')
  ),
  installation_id text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'disconnected', 'error')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  encrypted_credentials_ref text,
  retention_days_override int CHECK (retention_days_override IS NULL OR retention_days_override >= 7),
  connected_by uuid REFERENCES public.user_profiles(id),
  last_synced_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, installation_id),
  UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_connected_integrations_tenant_status
  ON public.connected_integrations (tenant_id, provider, status);

CREATE TABLE IF NOT EXISTS public.repository_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  integration_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'github' CHECK (provider IN ('github', 'gitlab')),
  provider_repo_id text NOT NULL,
  repo_full_name text NOT NULL,
  default_branch text NOT NULL DEFAULT 'main',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, tenant_id) REFERENCES public.projects(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (integration_id, tenant_id) REFERENCES public.connected_integrations(id, tenant_id) ON DELETE CASCADE,
  UNIQUE (tenant_id, provider, repo_full_name)
);

CREATE INDEX IF NOT EXISTS idx_repository_links_project
  ON public.repository_links (tenant_id, project_id, is_active);

-- -----------------------------------------------------------------------------
-- 2. IDE Project-Task Workspace Mapping (F2-010, F2-011, F2-015)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ide_workspace_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  task_id uuid NOT NULL,
  ide_type text NOT NULL DEFAULT 'vscode'
    CHECK (ide_type IN ('vscode', 'jetbrains', 'cursor', 'zed')),
  workspace_identifier text NOT NULL,
  repo_full_name text,
  branch_name text NOT NULL,
  suggested_task_code text,
  confidence_score numeric(3, 2) NOT NULL DEFAULT 0.90 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  confirmed_by_user boolean NOT NULL DEFAULT false,
  overridden_by_user boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (task_id, tenant_id, project_id)
    REFERENCES public.tasks(id, tenant_id, project_id) ON DELETE CASCADE,
  UNIQUE (tenant_id, user_id, workspace_identifier, branch_name)
);

CREATE INDEX IF NOT EXISTS idx_ide_workspace_mappings_user
  ON public.ide_workspace_mappings (tenant_id, user_id, updated_at DESC);

-- -----------------------------------------------------------------------------
-- 3. Webhook Receipts & Idempotent Deduplication Ledger (F2-021, Section 5.5)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.webhook_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('github', 'gitlab', 'jira', 'linear')),
  delivery_id text NOT NULL,
  event_type text NOT NULL,
  signature_verified boolean NOT NULL DEFAULT false,
  payload_sha256 text NOT NULL,
  delivery_attempt_count int NOT NULL DEFAULT 1 CHECK (delivery_attempt_count >= 1),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processed', 'duplicate_ignored', 'rejected_signature', 'failed')),
  received_at_utc timestamptz NOT NULL DEFAULT now(),
  processed_at_utc timestamptz,
  UNIQUE (provider, delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_receipts_tenant_received
  ON public.webhook_receipts (tenant_id, provider, received_at_utc DESC);

-- -----------------------------------------------------------------------------
-- 4. Canonical Evidence Artifacts & Many-to-Many Task Links (F2-012..F2-032)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.evidence_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  source_type text NOT NULL CHECK (
    source_type IN (
      'github_commit',
      'github_pr',
      'github_review',
      'github_ci',
      'gitlab_commit',
      'gitlab_mr',
      'gitlab_pipeline',
      'vscode_debug',
      'vscode_test',
      'vscode_workspace',
      'terminal_command_category',
      'session_note',
      'design_doc',
      'external_ticket'
    )
  ),
  capture_mode text NOT NULL DEFAULT 'webhook' CHECK (
    capture_mode IN ('webhook', 'ide_extension', 'desktop_agent', 'manual_declaration')
  ),
  external_id text NOT NULL,
  occurred_at_utc timestamptz NOT NULL,
  actor_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  summary_title text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reliability_status text NOT NULL DEFAULT 'verified_webhook' CHECK (
    reliability_status IN ('verified_webhook', 'signed_agent_batch', 'developer_declared')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_prohibited_artifact_metadata
    CHECK (NOT public.jsonb_contains_prohibited_surveillance_keys(metadata)),
  FOREIGN KEY (project_id, tenant_id) REFERENCES public.projects(id, tenant_id) ON DELETE CASCADE,
  UNIQUE (tenant_id, source_type, external_id),
  UNIQUE (id, tenant_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_artifacts_project_occurred
  ON public.evidence_artifacts (tenant_id, project_id, occurred_at_utc DESC);

CREATE TABLE IF NOT EXISTS public.evidence_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  task_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  session_id uuid,
  time_segment_id uuid REFERENCES public.time_segments(id) ON DELETE SET NULL,
  link_type text NOT NULL DEFAULT 'contemporaneous' CHECK (
    link_type IN ('contemporaneous', 'retrospective_outcome', 'manual_attached')
  ),
  link_confidence numeric(3, 2) NOT NULL DEFAULT 0.90
    CHECK (link_confidence >= 0 AND link_confidence <= 1),
  link_rationale text NOT NULL,
  confirmed_by_user boolean NOT NULL DEFAULT false,
  overridden_by_user boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (task_id, tenant_id, project_id)
    REFERENCES public.tasks(id, tenant_id, project_id) ON DELETE CASCADE,
  FOREIGN KEY (artifact_id, tenant_id, project_id)
    REFERENCES public.evidence_artifacts(id, tenant_id, project_id) ON DELETE CASCADE,
  UNIQUE (tenant_id, task_id, artifact_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_links_task
  ON public.evidence_links (tenant_id, task_id, link_type);

CREATE INDEX IF NOT EXISTS idx_evidence_links_segment
  ON public.evidence_links (tenant_id, time_segment_id)
  WHERE time_segment_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. Work-Session Annotations (Thinking Notes, Research Outcomes, Investigation Logs — F2-033)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.session_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  time_segment_id uuid REFERENCES public.time_segments(id) ON DELETE SET NULL,
  annotation_type text NOT NULL DEFAULT 'thinking_note' CHECK (
    annotation_type IN (
      'thinking_note',
      'research_outcome',
      'investigation_log',
      'idle_reconciliation',
      'pair_programming'
    )
  ),
  title text NOT NULL,
  content_markdown text NOT NULL CHECK (char_length(trim(content_markdown)) >= 3),
  start_minute_of_day int CHECK (start_minute_of_day IS NULL OR (start_minute_of_day >= 0 AND start_minute_of_day <= 1440)),
  end_minute_of_day int CHECK (end_minute_of_day IS NULL OR (end_minute_of_day >= 0 AND end_minute_of_day <= 1440)),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id, tenant_id, user_id)
    REFERENCES public.work_sessions(id, tenant_id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_annotations_session
  ON public.session_annotations (tenant_id, session_id, created_at ASC);

-- -----------------------------------------------------------------------------
-- 6. Idempotent Webhook & Evidence Ingestion Helper Function (F2-021, Section 5.5)
--    Guarantees that receiving the same GitHub/GitLab webhook N times creates
--    exactly ONE canonical evidence_artifact and increments delivery_attempt_count.
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

  -- Check if delivery_id already exists
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

  -- Upsert canonical evidence_artifact (idempotent on tenant_id, source_type, external_id)
  INSERT INTO public.evidence_artifacts (
    tenant_id,
    project_id,
    source_type,
    capture_mode,
    external_id,
    occurred_at_utc,
    actor_user_id,
    summary_title,
    metadata,
    reliability_status
  )
  VALUES (
    p_tenant_id,
    p_project_id,
    p_source_type,
    'webhook',
    p_external_id,
    p_occurred_at_utc,
    p_actor_user_id,
    p_summary_title,
    COALESCE(p_metadata, '{}'::jsonb),
    'verified_webhook'
  )
  ON CONFLICT (tenant_id, source_type, external_id) DO UPDATE
    SET summary_title = EXCLUDED.summary_title
  RETURNING id INTO v_artifact_id;

  -- Link artifact to task (idempotent on tenant_id, task_id, artifact_id)
  IF p_task_id IS NOT NULL THEN
    INSERT INTO public.evidence_links (
      tenant_id,
      project_id,
      task_id,
      artifact_id,
      link_type,
      link_confidence,
      link_rationale
    )
    VALUES (
      p_tenant_id,
      p_project_id,
      p_task_id,
      v_artifact_id,
      p_link_type,
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
-- 7. Row Level Security (RLS) Policies for Phase 2 Milestones 2.2–2.4
-- -----------------------------------------------------------------------------

ALTER TABLE public.connected_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ide_workspace_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_annotations ENABLE ROW LEVEL SECURITY;

-- Connected Integrations: Active tenant members can view status; Tenant Owners/Managers manage
CREATE POLICY connected_integrations_select ON public.connected_integrations
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

CREATE POLICY connected_integrations_manage ON public.connected_integrations
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager']));

-- Repository Links
CREATE POLICY repository_links_select ON public.repository_links
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(tenant_id, project_id));

CREATE POLICY repository_links_manage ON public.repository_links
  FOR ALL TO authenticated
  USING (public.user_has_project_access(tenant_id, project_id, ARRAY['manager']))
  WITH CHECK (public.user_has_project_access(tenant_id, project_id, ARRAY['manager']));

-- IDE Workspace Mappings: Developers own their IDE mappings; Managers can view project mappings
CREATE POLICY ide_workspace_mappings_select ON public.ide_workspace_mappings
  FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id))
    OR public.user_has_project_access(tenant_id, project_id, ARRAY['manager'])
  );

CREATE POLICY ide_workspace_mappings_write_own ON public.ide_workspace_mappings
  FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  );

-- Webhook Receipts: Tenant owners, project managers, developers, and auditors can inspect
CREATE POLICY webhook_receipts_select ON public.webhook_receipts
  FOR SELECT TO authenticated
  USING (
    public.user_has_tenant_role(
      tenant_id,
      ARRAY['tenant_owner', 'project_manager', 'developer', 'auditor']
    )
  );

-- Evidence Artifacts: Project members (developers, managers) and auditors can view;
-- Finance role is excluded from raw code/debug evidence artifacts.
CREATE POLICY evidence_artifacts_select ON public.evidence_artifacts
  FOR SELECT TO authenticated
  USING (
    public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor'])
    OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

CREATE POLICY evidence_artifacts_insert ON public.evidence_artifacts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor'])
  );

-- Evidence Links: Project contributors and managers can view and override task links (F2-032)
CREATE POLICY evidence_links_select ON public.evidence_links
  FOR SELECT TO authenticated
  USING (
    public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor'])
    OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

CREATE POLICY evidence_links_write ON public.evidence_links
  FOR ALL TO authenticated
  USING (
    public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor'])
  )
  WITH CHECK (
    public.user_has_project_access(tenant_id, project_id, ARRAY['manager', 'contributor'])
  );

-- Session Annotations: Developer writes own annotations; project managers can read during review
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

CREATE POLICY session_annotations_write_own ON public.session_annotations
  FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  );

