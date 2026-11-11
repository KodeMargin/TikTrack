-- =============================================================================
-- Migration 0012: Phase 4 — Client Read-Only Portal Views, White-Label Boundaries,
-- Scoped Public API Keys & Outbound Signed Webhooks
-- Covers F4-005, F4-006, F4-007, F4-012
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Client Portal Security-Barrier Views (F4-005, F4-012)
--    Displays ONLY approved hours, high-level task deliverables, and finalized
--    client invoices. Never exposes observed_minutes, developer_note,
--    reviewer_comment, activity_events, ai_generations, or internal disputes.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.client_portal_project_timesheets_v
WITH (security_barrier = true, security_invoker = true) AS
SELECT
  tl.id AS timesheet_line_id,
  tl.tenant_id,
  ts.project_id,
  p.code AS project_code,
  p.name AS project_name,
  p.client_name,
  tk.id AS task_id,
  tk.code AS task_code,
  tk.title AS task_title,
  tk.status AS task_status,
  tl.work_date,
  tl.work_mode,
  tl.approved_billable_minutes,
  round(tl.approved_billable_minutes / 60.0, 2) AS approved_billable_hours,
  tl.snapshot_hourly_rate,
  tl.snapshot_currency,
  round((tl.approved_billable_minutes / 60.0) * tl.snapshot_hourly_rate, 2) AS approved_amount,
  tl.line_status,
  tl.is_locked,
  ts.status AS timesheet_status,
  ts.approved_at
FROM public.timesheet_lines tl
JOIN public.timesheets ts
  ON ts.id = tl.timesheet_id AND ts.tenant_id = tl.tenant_id
JOIN public.projects p
  ON p.id = ts.project_id AND p.tenant_id = ts.tenant_id
JOIN public.tasks tk
  ON tk.id = tl.task_id AND tk.tenant_id = ts.tenant_id
WHERE tl.line_status IN ('approved', 'adjusted_approved')
  AND ts.status IN ('partially_approved', 'approved', 'locked')
  AND (
    public.user_has_project_access(
      ts.tenant_id,
      ts.project_id,
      ARRAY['client_reviewer', 'manager']
    )
    OR public.user_has_tenant_role(ts.tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

CREATE OR REPLACE VIEW public.client_portal_deliverables_v
WITH (security_barrier = true, security_invoker = true) AS
SELECT
  ea.id AS artifact_id,
  ea.tenant_id,
  ea.project_id,
  p.code AS project_code,
  p.name AS project_name,
  p.client_name,
  tk.id AS task_id,
  tk.code AS task_code,
  tk.title AS task_title,
  tk.status AS task_status,
  ea.source_type,
  ea.external_id,
  ea.summary_title,
  ea.occurred_at_utc,
  el.link_type
FROM public.evidence_artifacts ea
JOIN public.projects p
  ON p.id = ea.project_id AND p.tenant_id = ea.tenant_id
JOIN public.evidence_links el
  ON el.artifact_id = ea.id AND el.tenant_id = ea.tenant_id AND el.project_id = ea.project_id
JOIN public.tasks tk
  ON tk.id = el.task_id AND tk.tenant_id = el.tenant_id AND tk.project_id = el.project_id
WHERE ea.source_type IN (
    'github_pr', 'github_commit', 'github_ci', 'github_review',
    'gitlab_mr', 'gitlab_commit', 'gitlab_pipeline', 'design_doc', 'external_ticket'
  )
  AND tk.status IN ('review', 'done')
  AND (
    public.user_has_project_access(
      ea.tenant_id,
      ea.project_id,
      ARRAY['client_reviewer', 'manager']
    )
    OR public.user_has_tenant_role(ea.tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

-- -----------------------------------------------------------------------------
-- 2. Scoped Public API Keys (F4-006)
--    Keys use prefix `dp_live_...` and only SHA-256 hashes are persisted.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) >= 2),
  key_prefix text NOT NULL,
  key_hash_sha256 text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['projects:read', 'tasks:read', 'timesheets:read'],
  rate_limit_per_min int NOT NULL DEFAULT 60 CHECK (rate_limit_per_min > 0),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_active
  ON public.api_keys (tenant_id, revoked_at, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. Outbound Webhooks & Signed Delivery Ledger (F4-007)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.outbound_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) >= 2),
  target_url text NOT NULL CHECK (target_url ~ '^https?://'),
  signing_secret_prefix text NOT NULL,
  signing_secret_hash text NOT NULL,
  subscribed_events text[] NOT NULL DEFAULT ARRAY[
    'timesheet.approved',
    'dispute.opened',
    'dispute.resolved',
    'invoice.finalized'
  ],
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_outbound_webhook_endpoints_tenant
  ON public.outbound_webhook_endpoints (tenant_id, is_active);

CREATE TABLE IF NOT EXISTS public.outbound_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'timesheet.approved',
      'dispute.opened',
      'dispute.resolved',
      'invoice.finalized',
      'usage.threshold_reached'
    )
  ),
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_header text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'delivered', 'retrying', 'failed')),
  http_status int,
  attempt_count int NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  response_snippet text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (endpoint_id, tenant_id)
    REFERENCES public.outbound_webhook_endpoints(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_outbound_webhook_deliveries_endpoint
  ON public.outbound_webhook_deliveries (tenant_id, endpoint_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Row Level Security (RLS) Policies
-- -----------------------------------------------------------------------------

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- API keys: Tenant owners and auditors can inspect; only tenant owners manage
CREATE POLICY api_keys_select ON public.api_keys
  FOR SELECT TO authenticated
  USING (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

CREATE POLICY api_keys_manage ON public.api_keys
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

-- Outbound webhooks: Owners, project managers, auditors can view; owners/PMs manage
CREATE POLICY outbound_webhook_endpoints_select ON public.outbound_webhook_endpoints
  FOR SELECT TO authenticated
  USING (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager', 'auditor'])
  );

CREATE POLICY outbound_webhook_endpoints_manage ON public.outbound_webhook_endpoints
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager']));

CREATE POLICY outbound_webhook_deliveries_select ON public.outbound_webhook_deliveries
  FOR SELECT TO authenticated
  USING (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager', 'auditor'])
  );

CREATE POLICY outbound_webhook_deliveries_insert ON public.outbound_webhook_deliveries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'project_manager'])
  );

