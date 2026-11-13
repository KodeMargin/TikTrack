-- =============================================================================
-- Migration 0015: Phase 5 - Retention Policies, Legal Holds, DSAR Privacy
-- Requests, Data Residency & Tenant Isolation, and Sanitized SIEM Exports
-- Covers F5-002, F5-003, F5-004, F5-005
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Legal Holds & Retention Policies (F5-002)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('timesheet', 'dispute', 'project', 'user', 'tenant')),
  target_id text NOT NULL,
  reason text NOT NULL CHECK (char_length(trim(reason)) >= 5),
  hold_status text NOT NULL DEFAULT 'active' CHECK (hold_status IN ('active', 'released')),
  placed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  released_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  placed_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_legal_holds_tenant_active
  ON public.legal_holds (tenant_id, hold_status, scope_type);

CREATE TABLE IF NOT EXISTS public.retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  raw_activity_days int NOT NULL DEFAULT 90 CHECK (raw_activity_days >= 7),
  rollup_days int NOT NULL DEFAULT 365 CHECK (rollup_days >= 30),
  evidence_artifact_days int NOT NULL DEFAULT 730 CHECK (evidence_artifact_days >= 90),
  audit_log_days int NOT NULL DEFAULT 2555 CHECK (audit_log_days >= 365),
  archive_storage_tier text NOT NULL DEFAULT 'supabase_cold'
    CHECK (archive_storage_tier IN ('supabase_cold', 'cold_s3', 'gcs_archive')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS public.retention_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES public.retention_policies(id) ON DELETE SET NULL,
  job_type text NOT NULL CHECK (job_type IN ('purge_raw_events', 'archive_rollups', 'dsar_export', 'dsar_erasure')),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('queued', 'running', 'completed', 'partial_legal_hold', 'failed')),
  scanned_count int NOT NULL DEFAULT 0,
  purged_count int NOT NULL DEFAULT 0,
  skipped_legal_hold_count int NOT NULL DEFAULT 0,
  archived_bundle_uri text,
  executed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  executed_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retention_jobs_tenant_exec
  ON public.retention_jobs (tenant_id, executed_at_utc DESC);

CREATE TABLE IF NOT EXISTS public.privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('export', 'correction', 'erasure')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_review', 'completed', 'blocked_legal_hold')),
  legal_hold_blocked boolean NOT NULL DEFAULT false,
  export_digest_sha256 text,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_tenant_user
  ON public.privacy_requests (tenant_id, requester_user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. Data Residency & Tenant Isolation Config (F5-003, F5-004)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_residency_configs (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  primary_region text NOT NULL DEFAULT 'us-east-1'
    CHECK (primary_region IN ('us-east-1', 'eu-central-1', 'uk-south-1', 'ap-southeast-1')),
  failover_region text NOT NULL DEFAULT 'us-west-2'
    CHECK (failover_region IN ('us-west-2', 'eu-west-1', 'uk-west-1', 'ap-southeast-2')),
  data_residency_locked boolean NOT NULL DEFAULT false,
  isolation_tier text NOT NULL DEFAULT 'shared_rls'
    CHECK (isolation_tier IN ('shared_rls', 'dedicated_schema', 'dedicated_cluster')),
  encryption_key_mode text NOT NULL DEFAULT 'platform_kms'
    CHECK (encryption_key_mode IN ('platform_kms', 'byok_kms')),
  kms_key_arn_masked text,
  dedicated_worker_pool boolean NOT NULL DEFAULT false,
  egress_allowlist_cidrs text[] NOT NULL DEFAULT ARRAY[]::text[],
  updated_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. SIEM & Security Monitoring Integration (F5-005)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.siem_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('splunk', 'datadog', 'sentinel', 'elastic', 'syslog_tls')),
  endpoint_url text NOT NULL,
  auth_header_prefix text NOT NULL DEFAULT 'Bearer',
  auth_token_hash_sha256 text NOT NULL,
  format text NOT NULL DEFAULT 'json_lines' CHECK (format IN ('cef', 'json_lines', 'ocsf')),
  include_categories text[] NOT NULL DEFAULT ARRAY['auth', 'policy', 'dispute', 'retention', 'export']::text[],
  is_active boolean NOT NULL DEFAULT true,
  last_exported_at timestamptz,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siem_destinations_tenant
  ON public.siem_destinations (tenant_id, is_active);

CREATE TABLE IF NOT EXISTS public.siem_export_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  destination_id uuid NOT NULL REFERENCES public.siem_destinations(id) ON DELETE CASCADE,
  event_count int NOT NULL DEFAULT 0,
  payload_format text NOT NULL CHECK (payload_format IN ('cef', 'json_lines', 'ocsf')),
  payload_digest_sha256 text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'delivered' CHECK (delivery_status IN ('queued', 'delivered', 'failed')),
  http_status int DEFAULT 200,
  sanitized_preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_prohibited_siem_preview_keys
    CHECK (NOT public.jsonb_contains_prohibited_surveillance_keys(sanitized_preview))
);

CREATE INDEX IF NOT EXISTS idx_siem_export_batches_tenant
  ON public.siem_export_batches (tenant_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Retention Sweep RPC Respecting Active Legal Holds (F5-002)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.execute_tenant_retention_sweep(p_tenant_id uuid)
RETURNS TABLE (
  job_id uuid,
  scanned_count int,
  purged_count int,
  skipped_legal_hold_count int,
  job_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_raw_days int := 90;
  v_policy_id uuid;
  v_cutoff timestamptz;
  v_tenant_hold boolean := false;
  v_scanned int := 0;
  v_purged int := 0;
  v_skipped int := 0;
  v_job_id uuid;
  v_status text := 'completed';
BEGIN
  SELECT id, raw_activity_days
  INTO v_policy_id, v_raw_days
  FROM public.retention_policies
  WHERE tenant_id = p_tenant_id
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  v_cutoff := now() - make_interval(days => COALESCE(v_raw_days, 90));

  SELECT EXISTS (
    SELECT 1
    FROM public.legal_holds lh
    WHERE lh.tenant_id = p_tenant_id
      AND lh.hold_status = 'active'
      AND lh.scope_type IN ('tenant', 'dispute', 'timesheet')
  )
  INTO v_tenant_hold;

  SELECT count(*)::int
  INTO v_scanned
  FROM public.activity_events ae
  WHERE ae.tenant_id = p_tenant_id
    AND ae.occurred_at_utc < v_cutoff;

  IF v_tenant_hold THEN
    v_purged := 0;
    v_skipped := v_scanned;
    v_status := 'partial_legal_hold';
  ELSE
    WITH deleted_rows AS (
      DELETE FROM public.activity_events ae
      WHERE ae.tenant_id = p_tenant_id
        AND ae.occurred_at_utc < v_cutoff
        AND NOT EXISTS (
          SELECT 1
          FROM public.legal_holds lh
          WHERE lh.tenant_id = p_tenant_id
            AND lh.hold_status = 'active'
            AND lh.scope_type = 'user'
            AND lh.target_id = ae.user_id::text
        )
      RETURNING ae.event_id
    )
    SELECT count(*)::int INTO v_purged FROM deleted_rows;

    v_skipped := GREATEST(0, v_scanned - v_purged);
    IF v_skipped > 0 THEN
      v_status := 'partial_legal_hold';
    END IF;
  END IF;

  INSERT INTO public.retention_jobs (
    tenant_id, policy_id, job_type, status,
    scanned_count, purged_count, skipped_legal_hold_count,
    archived_bundle_uri
  )
  VALUES (
    p_tenant_id, v_policy_id, 'purge_raw_events', v_status,
    v_scanned, v_purged, v_skipped,
    format('cold://devproof-archive/%s/%s.ndjson.gz', p_tenant_id, to_char(now(), 'YYYYMMDD-HH24MISS'))
  )
  RETURNING id INTO v_job_id;

  INSERT INTO public.sensitive_access_logs (
    tenant_id, action_category, resource_type, resource_id, correlation_id, metadata
  )
  VALUES (
    p_tenant_id,
    'retention_run',
    'retention_jobs',
    v_job_id::text,
    'ret-' || left(v_job_id::text, 8),
    jsonb_build_object(
      'scanned_count', v_scanned,
      'purged_count', v_purged,
      'skipped_legal_hold_count', v_skipped,
      'status', v_status
    )
  );

  RETURN QUERY SELECT v_job_id, v_scanned, v_purged, v_skipped, v_status;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Row Level Security (RLS) Policies
-- -----------------------------------------------------------------------------

ALTER TABLE public.legal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_residency_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_export_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY legal_holds_select ON public.legal_holds
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

CREATE POLICY legal_holds_manage ON public.legal_holds
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

CREATE POLICY retention_policies_select ON public.retention_policies
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

CREATE POLICY retention_policies_manage ON public.retention_policies
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

CREATE POLICY retention_jobs_select ON public.retention_jobs
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

CREATE POLICY retention_jobs_insert ON public.retention_jobs
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

-- Privacy / DSAR requests: developers see & create own; owners & auditors manage all
CREATE POLICY privacy_requests_select ON public.privacy_requests
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND NOT public.user_has_tenant_role(tenant_id, ARRAY['client_reviewer'])
    AND (
      requester_user_id = (SELECT auth.uid())
      OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
    )
  );

CREATE POLICY privacy_requests_insert_own ON public.privacy_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
    AND NOT public.user_has_tenant_role(tenant_id, ARRAY['client_reviewer'])
  );

CREATE POLICY privacy_requests_manage_admin ON public.privacy_requests
  FOR UPDATE TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

-- Residency config: owner & auditor
CREATE POLICY tenant_residency_configs_select ON public.tenant_residency_configs
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

CREATE POLICY tenant_residency_configs_manage ON public.tenant_residency_configs
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

-- SIEM destinations & export batches: owner & auditor
CREATE POLICY siem_destinations_select ON public.siem_destinations
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

CREATE POLICY siem_destinations_manage ON public.siem_destinations
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

CREATE POLICY siem_export_batches_select ON public.siem_export_batches
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

CREATE POLICY siem_export_batches_insert ON public.siem_export_batches
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

