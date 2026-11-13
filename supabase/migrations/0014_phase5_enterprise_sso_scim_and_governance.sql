-- =============================================================================
-- Migration 0014: Phase 5 - Enterprise SSO, SCIM Provisioning,
-- Two-Person Policy Governance & Sensitive Access Logs
-- Covers F5-001, F5-002 (access logs), F5-006
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enterprise SAML 2.0 / OIDC Identity Providers & SCIM 2.0 (F5-001)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sso_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_type text NOT NULL CHECK (provider_type IN ('saml', 'oidc')),
  display_name text NOT NULL,
  domain text NOT NULL CHECK (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  entity_id_or_issuer text NOT NULL,
  sso_url text NOT NULL,
  certificate_fingerprint text,
  client_id text,
  enforce_sso boolean NOT NULL DEFAULT false,
  jit_default_role text NOT NULL DEFAULT 'developer'
    CHECK (jit_default_role IN ('developer', 'project_manager', 'finance', 'client_reviewer', 'auditor')),
  scim_enabled boolean NOT NULL DEFAULT false,
  scim_token_prefix text,
  scim_token_hash_sha256 text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'disabled')),
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_sso_providers_tenant_status
  ON public.sso_providers (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.scim_provisioning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.sso_providers(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('user_create', 'user_update', 'user_deactivate', 'group_sync')),
  external_user_id text NOT NULL,
  email text NOT NULL,
  target_role text NOT NULL,
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'rejected', 'queued')),
  correlation_id text NOT NULL,
  detail_message text,
  occurred_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scim_provisioning_events_tenant
  ON public.scim_provisioning_events (tenant_id, occurred_at_utc DESC);

-- -----------------------------------------------------------------------------
-- 2. Two-Person Policy Governance (F5-006)
--    Any change expanding collection scope requires two DISTINCT admins
--    (e.g., tenant_owner + auditor/compliance) and never applies retroactively.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.policy_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  proposed_version_code text NOT NULL,
  change_summary text NOT NULL,
  scope_diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  expands_collection_scope boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending_second_approval'
    CHECK (status IN ('pending_second_approval', 'approved_activated', 'rejected', 'cancelled')),
  proposed_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  approved_by_first uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  approved_by_second uuid REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  rejection_reason text,
  effective_from timestamptz NOT NULL DEFAULT now(),
  activated_policy_version_id uuid REFERENCES public.policy_versions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT no_prohibited_policy_diff_keys
    CHECK (NOT public.jsonb_contains_prohibited_surveillance_keys(scope_diff)),
  CONSTRAINT two_person_distinct_approvers
    CHECK (
      approved_by_second IS NULL
      OR (approved_by_second <> proposed_by AND approved_by_second <> approved_by_first)
    )
);

CREATE INDEX IF NOT EXISTS idx_policy_change_requests_tenant_status
  ON public.policy_change_requests (tenant_id, status, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. Immutable Sensitive Access Logs (F5-002)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sensitive_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  action_category text NOT NULL CHECK (
    action_category IN (
      'audit_export',
      'policy_view',
      'policy_approval',
      'dispute_bundle',
      'retention_run',
      'legal_hold_change',
      'siem_export',
      'scim_sync',
      'residency_change',
      'dsar_request'
    )
  ),
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  ip_address_masked text NOT NULL DEFAULT '0.0.0.0/0',
  correlation_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at_utc timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_prohibited_sensitive_log_keys
    CHECK (NOT public.jsonb_contains_prohibited_surveillance_keys(metadata))
);

CREATE INDEX IF NOT EXISTS idx_sensitive_access_logs_tenant
  ON public.sensitive_access_logs (tenant_id, occurred_at_utc DESC);

-- Enforce append-only semantics on sensitive_access_logs
REVOKE UPDATE, DELETE ON public.sensitive_access_logs FROM PUBLIC, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Row Level Security (RLS) Policies
-- -----------------------------------------------------------------------------

ALTER TABLE public.sso_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scim_provisioning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensitive_access_logs ENABLE ROW LEVEL SECURITY;

-- SSO providers: only tenant_owner and auditor can view/manage; client_reviewer & developer excluded
CREATE POLICY sso_providers_select ON public.sso_providers
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

CREATE POLICY sso_providers_manage ON public.sso_providers
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

-- SCIM events: owner & auditor
CREATE POLICY scim_provisioning_events_select ON public.scim_provisioning_events
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

CREATE POLICY scim_provisioning_events_insert ON public.scim_provisioning_events
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

-- Policy change requests: all active non-client members can inspect pending governance;
-- only tenant_owner and auditor can propose or co-approve
CREATE POLICY policy_change_requests_select ON public.policy_change_requests
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND NOT public.user_has_tenant_role(tenant_id, ARRAY['client_reviewer'])
  );

CREATE POLICY policy_change_requests_manage ON public.policy_change_requests
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

-- Sensitive access logs: owner & auditor read/append only
CREATE POLICY sensitive_access_logs_select ON public.sensitive_access_logs
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

CREATE POLICY sensitive_access_logs_insert ON public.sensitive_access_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor', 'project_manager', 'finance']));

