-- =============================================================================
-- Migration 0001: Multi-Tenant Identity, RBAC, Consent, Devices & Audit Log
-- Covers Phase 1 Milestone 1.1: F1-001 through F1-007 & F1-030
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- -----------------------------------------------------------------------------
-- 1. Core Tenancy & Identity Tables
-- -----------------------------------------------------------------------------

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) >= 2),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  default_timezone text NOT NULL DEFAULT 'UTC',
  default_currency text NOT NULL DEFAULT 'USD' CHECK (char_length(default_currency) = 3),
  plan_tier text NOT NULL DEFAULT 'starter' CHECK (plan_tier IN ('starter', 'team', 'agency', 'enterprise')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'suspended')),
  ai_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, slug)
);

CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  avatar_url text,
  default_timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  invited_email text,
  invited_by uuid REFERENCES public.user_profiles(id),
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id),
  UNIQUE (id, tenant_id)
);

CREATE INDEX idx_memberships_tenant_user_status
  ON public.memberships (tenant_id, user_id, status);

CREATE TABLE public.role_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  role text NOT NULL CHECK (
    role IN (
      'tenant_owner',
      'project_manager',
      'developer',
      'finance',
      'client_reviewer',
      'auditor'
    )
  ),
  project_scope_id uuid,
  granted_by uuid REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (membership_id, tenant_id) REFERENCES public.memberships(id, tenant_id) ON DELETE CASCADE,
  UNIQUE (membership_id, role, project_scope_id)
);

CREATE INDEX idx_role_grants_tenant_membership
  ON public.role_grants (tenant_id, membership_id, role);

CREATE TABLE public.tenant_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_week_days int[] NOT NULL DEFAULT '{1,2,3,4,5}',
  rounding_rule text NOT NULL DEFAULT 'none' CHECK (rounding_rule IN ('none', 'nearest_5m', 'nearest_6m', 'nearest_15m')),
  paid_break_allowance_minutes int NOT NULL DEFAULT 15 CHECK (paid_break_allowance_minutes >= 0),
  deep_work_no_input_window_minutes int NOT NULL DEFAULT 90 CHECK (deep_work_no_input_window_minutes >= 15),
  idle_clarification_threshold_minutes int NOT NULL DEFAULT 15 CHECK (idle_clarification_threshold_minutes >= 5),
  weekly_cap_minutes int NOT NULL DEFAULT 2400 CHECK (weekly_cap_minutes > 0),
  invoice_prefix text NOT NULL DEFAULT 'INV',
  branding_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Versioned Tracking Policies, User Consents & Enrolled Devices (F1-030)
-- -----------------------------------------------------------------------------

CREATE TABLE public.policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_code text NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  capture_scope jsonb NOT NULL DEFAULT '{
    "collect_session_lifecycle": true,
    "collect_coarse_app_category": true,
    "collect_ide_workspace_metadata": true,
    "collect_git_webhook_metadata": true,
    "never_collect_keystrokes": true,
    "never_collect_clipboard": true,
    "never_collect_raw_source_code": true,
    "screenshots_disabled_by_default": true
  }'::jsonb,
  summary_markdown text NOT NULL,
  published_by uuid REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, version_code),
  UNIQUE (id, tenant_id)
);

CREATE TABLE public.policy_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  policy_version_id uuid NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),
  device_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (policy_version_id, tenant_id) REFERENCES public.policy_versions(id, tenant_id) ON DELETE CASCADE,
  UNIQUE (tenant_id, user_id, policy_version_id)
);

CREATE INDEX idx_policy_consents_tenant_user
  ON public.policy_consents (tenant_id, user_id, policy_version_id);

CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  device_name text NOT NULL,
  os_platform text NOT NULL CHECK (os_platform IN ('macos', 'windows', 'linux', 'web')),
  agent_version text NOT NULL,
  device_fingerprint_hash text NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id, user_id)
);

CREATE INDEX idx_devices_tenant_user
  ON public.devices (tenant_id, user_id) WHERE revoked_at IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Immutable Security & Governance Audit Log (F1-007)
-- -----------------------------------------------------------------------------

CREATE TABLE public.audit_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.user_profiles(id),
  action_type text NOT NULL,
  target_entity text NOT NULL,
  target_id uuid,
  reason text,
  before_state jsonb,
  after_state jsonb,
  policy_version_id uuid,
  correlation_id text,
  occurred_at_utc timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_entries_tenant_occurred
  ON public.audit_entries (tenant_id, occurred_at_utc DESC);

-- Prevent in-place mutation or deletion of audit entries
REVOKE UPDATE, DELETE ON public.audit_entries FROM PUBLIC, authenticated;

-- -----------------------------------------------------------------------------
-- 4. High-Performance Security Definer RLS Helpers (Supabase Best Practices)
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

-- -----------------------------------------------------------------------------
-- 5. Enable RLS & Define Explicit Policies
-- -----------------------------------------------------------------------------

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_entries ENABLE ROW LEVEL SECURITY;

-- Tenants: visible only to active members
CREATE POLICY tenants_select_member ON public.tenants
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(id));

CREATE POLICY tenants_update_owner ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.user_has_tenant_role(id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(id, ARRAY['tenant_owner']));

-- User Profiles: users can view co-members in their tenants and update own profile
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

CREATE POLICY user_profiles_update_self ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Memberships & Role Grants
CREATE POLICY memberships_select_tenant ON public.memberships
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

CREATE POLICY memberships_manage_owner ON public.memberships
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

CREATE POLICY role_grants_select_tenant ON public.role_grants
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

CREATE POLICY role_grants_manage_owner ON public.role_grants
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

-- Tenant Settings
CREATE POLICY tenant_settings_select_member ON public.tenant_settings
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

CREATE POLICY tenant_settings_update_owner ON public.tenant_settings
  FOR UPDATE TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

-- Policy Versions & Consents
CREATE POLICY policy_versions_select_member ON public.policy_versions
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

CREATE POLICY policy_versions_insert_owner ON public.policy_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

CREATE POLICY policy_consents_select_self_or_admin ON public.policy_consents
  FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id))
    OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

CREATE POLICY policy_consents_insert_self ON public.policy_consents
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  );

-- Devices: owned by user within active tenant
CREATE POLICY devices_select_self_or_owner ON public.devices
  FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id))
    OR public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
  );

CREATE POLICY devices_insert_self ON public.devices
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.user_is_active_tenant_member(tenant_id)
  );

-- Audit Entries: readable by tenant_owner and auditor, plus own subject actions
CREATE POLICY audit_entries_select_authorized ON public.audit_entries
  FOR SELECT TO authenticated
  USING (
    public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor'])
    OR (actor_user_id = (SELECT auth.uid()) AND public.user_is_active_tenant_member(tenant_id))
  );

