-- =============================================================================
-- Migration 0016: Phase 5 — Fleet Distribution, Scalable Analytics Warehouse,
-- DR & Load Drills, Security Assessments & Accessibility / Localization
-- Covers F5-007, F5-008, F5-009, F5-010, F5-011
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Signed Desktop & Extension Fleet Distribution (F5-007)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fleet_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('macos_universal', 'windows_x64', 'windows_arm64', 'vscode_vsix')),
  channel text NOT NULL DEFAULT 'staged_25' CHECK (channel IN ('canary', 'staged_25', 'stable')),
  installer_sha256 text NOT NULL,
  code_signing_thumbprint text NOT NULL,
  notarization_status text NOT NULL DEFAULT 'notarized' CHECK (notarization_status IN ('notarized', 'signed', 'pending')),
  min_os_version text NOT NULL DEFAULT 'macOS 14 / Win 11',
  rollout_percentage int NOT NULL DEFAULT 25 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  release_notes text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  published_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, platform, version)
);

CREATE INDEX IF NOT EXISTS idx_fleet_releases_tenant_active
  ON public.fleet_releases (tenant_id, is_active, created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. Scalable Analytics Warehouse Offloads (F5-008)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.analytics_warehouse_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_sink text NOT NULL CHECK (target_sink IN ('parquet_object_storage', 'snowflake_external', 'bigquery_load', 'duckdb_cold')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  row_count int NOT NULL DEFAULT 0,
  compressed_bytes bigint NOT NULL DEFAULT 0,
  object_path_uri text NOT NULL,
  checksum_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'exported' CHECK (status IN ('queued', 'exported', 'verified')),
  triggered_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_analytics_warehouse_exports_tenant
  ON public.analytics_warehouse_exports (tenant_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. Disaster Recovery Exercises & 1,000-Dev Load Test Evidence (F5-009)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.dr_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  exercise_type text NOT NULL CHECK (
    exercise_type IN ('backup_restore_drill', 'region_failover_tabletop', 'load_test_1000_devs', 'pen_test_remediation')
  ),
  target_rpo_minutes int NOT NULL DEFAULT 15,
  measured_rpo_minutes int NOT NULL DEFAULT 5,
  target_rto_minutes int NOT NULL DEFAULT 60,
  measured_rto_minutes int NOT NULL DEFAULT 22,
  p95_crud_ms int NOT NULL DEFAULT 145,
  simulated_concurrent_devs int NOT NULL DEFAULT 1000,
  passed boolean NOT NULL DEFAULT true,
  findings_summary text NOT NULL,
  conducted_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  conducted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dr_exercises_tenant
  ON public.dr_exercises (tenant_id, conducted_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Independent Security Assessments & Remediation Tracking (F5-011)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.security_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  assessment_name text NOT NULL,
  assessor_firm text NOT NULL,
  assessment_type text NOT NULL CHECK (
    assessment_type IN ('penetration_test', 'rls_isolation_audit', 'sdlc_review', 'soc2_readiness')
  ),
  status text NOT NULL DEFAULT 'remediating'
    CHECK (status IN ('scheduled', 'in_progress', 'remediating', 'signed_off')),
  critical_findings int NOT NULL DEFAULT 0 CHECK (critical_findings >= 0),
  high_findings int NOT NULL DEFAULT 0 CHECK (high_findings >= 0),
  remediated_findings int NOT NULL DEFAULT 0 CHECK (remediated_findings >= 0),
  report_sha256 text,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  signoff_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_security_assessments_tenant
  ON public.security_assessments (tenant_id, assessed_at DESC);

-- -----------------------------------------------------------------------------
-- 5. Accessibility & Localization Settings (F5-010)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_accessibility_configs (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  default_locale text NOT NULL DEFAULT 'en-US'
    CHECK (default_locale IN ('en-US', 'en-GB', 'de-DE', 'fr-FR', 'ja-JP')),
  high_contrast_mode boolean NOT NULL DEFAULT false,
  keyboard_shortcuts_enabled boolean NOT NULL DEFAULT true,
  wcag_target_level text NOT NULL DEFAULT 'AA' CHECK (wcag_target_level IN ('AA', 'AAA')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 6. Row Level Security (RLS) Policies
-- -----------------------------------------------------------------------------

ALTER TABLE public.fleet_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_warehouse_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dr_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_accessibility_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY fleet_releases_select ON public.fleet_releases
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_tenant_member(tenant_id)
    AND NOT public.user_has_tenant_role(tenant_id, ARRAY['client_reviewer'])
  );

CREATE POLICY fleet_releases_manage ON public.fleet_releases
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

CREATE POLICY analytics_warehouse_exports_select ON public.analytics_warehouse_exports
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor', 'finance']));

CREATE POLICY analytics_warehouse_exports_manage ON public.analytics_warehouse_exports
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'finance']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'finance']));

CREATE POLICY dr_exercises_select ON public.dr_exercises
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

CREATE POLICY dr_exercises_manage ON public.dr_exercises
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

CREATE POLICY security_assessments_select ON public.security_assessments
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

CREATE POLICY security_assessments_manage ON public.security_assessments
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner', 'auditor']));

CREATE POLICY tenant_accessibility_configs_select ON public.tenant_accessibility_configs
  FOR SELECT TO authenticated
  USING (public.user_is_active_tenant_member(tenant_id));

CREATE POLICY tenant_accessibility_configs_manage ON public.tenant_accessibility_configs
  FOR ALL TO authenticated
  USING (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']))
  WITH CHECK (public.user_has_tenant_role(tenant_id, ARRAY['tenant_owner']));

