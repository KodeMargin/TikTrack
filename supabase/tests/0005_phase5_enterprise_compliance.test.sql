-- =============================================================================
-- pgTAP Test Suite: Phase 5 Enterprise, Compliance & Operational Scale
-- Covers F5-001..F5-011: Two-Person Policy Governance, Legal Holds & Retention
-- Sweep RPC, Immutable Sensitive Access Logs, RLS & Cross-Tenant Isolation.
-- =============================================================================

BEGIN;
SELECT plan(10);

-- 1. Seed Tenant 1, Tenant 2, Owner, Auditor, Developer, Client Reviewer
INSERT INTO auth.users (id, email)
VALUES
  ('a5555555-5555-4555-8555-555555555501', 'owner.p5@enterprise.dev'),
  ('a5555555-5555-4555-8555-555555555502', 'auditor.p5@enterprise.dev'),
  ('a5555555-5555-4555-8555-555555555503', 'dev.p5@enterprise.dev'),
  ('a5555555-5555-4555-8555-555555555504', 'client.p5@enterprise.dev'),
  ('a5555555-5555-4555-8555-555555555505', 'owner.t2@other.dev')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_profiles (id, email, full_name)
VALUES
  ('a5555555-5555-4555-8555-555555555501', 'owner.p5@enterprise.dev', 'Elena Owner'),
  ('a5555555-5555-4555-8555-555555555502', 'auditor.p5@enterprise.dev', 'Marcus Compliance'),
  ('a5555555-5555-4555-8555-555555555503', 'dev.p5@enterprise.dev', 'Sora Dev'),
  ('a5555555-5555-4555-8555-555555555504', 'client.p5@enterprise.dev', 'Dana Client'),
  ('a5555555-5555-4555-8555-555555555505', 'owner.t2@other.dev', 'Other Owner')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tenants (id, name, slug, plan_tier)
VALUES
  ('b5555555-5555-4555-8555-555555555501', 'Apex Enterprise', 'apex-p5', 'enterprise'),
  ('b5555555-5555-4555-8555-555555555502', 'Rival Org', 'rival-p5', 'enterprise');

INSERT INTO public.memberships (id, tenant_id, user_id, status)
VALUES
  ('c5555555-5555-4555-8555-555555555501', 'b5555555-5555-4555-8555-555555555501', 'a5555555-5555-4555-8555-555555555501', 'active'),
  ('c5555555-5555-4555-8555-555555555502', 'b5555555-5555-4555-8555-555555555501', 'a5555555-5555-4555-8555-555555555502', 'active'),
  ('c5555555-5555-4555-8555-555555555503', 'b5555555-5555-4555-8555-555555555501', 'a5555555-5555-4555-8555-555555555503', 'active'),
  ('c5555555-5555-4555-8555-555555555504', 'b5555555-5555-4555-8555-555555555501', 'a5555555-5555-4555-8555-555555555504', 'active'),
  ('c5555555-5555-4555-8555-555555555505', 'b5555555-5555-4555-8555-555555555502', 'a5555555-5555-4555-8555-555555555505', 'active');

INSERT INTO public.role_grants (tenant_id, membership_id, role)
VALUES
  ('b5555555-5555-4555-8555-555555555501', 'c5555555-5555-4555-8555-555555555501', 'tenant_owner'),
  ('b5555555-5555-4555-8555-555555555501', 'c5555555-5555-4555-8555-555555555502', 'auditor'),
  ('b5555555-5555-4555-8555-555555555501', 'c5555555-5555-4555-8555-555555555503', 'developer'),
  ('b5555555-5555-4555-8555-555555555501', 'c5555555-5555-4555-8555-555555555504', 'client_reviewer'),
  ('b5555555-5555-4555-8555-555555555502', 'c5555555-5555-4555-8555-555555555505', 'tenant_owner');

-- 2. Seed SSO Provider, SIEM Destination, Residency Config, Security Assessment
INSERT INTO public.sso_providers (
  tenant_id, provider_type, display_name, domain, entity_id_or_issuer, sso_url,
  scim_enabled, status, created_by
)
VALUES (
  'b5555555-5555-4555-8555-555555555501', 'saml', 'Okta Enterprise', 'apex.dev',
  'https://okta.apex.dev/app/devproof', 'https://okta.apex.dev/sso/saml',
  true, 'active', 'a5555555-5555-4555-8555-555555555501'
);

INSERT INTO public.siem_destinations (
  tenant_id, name, provider, endpoint_url, auth_token_hash_sha256, format
)
VALUES (
  'b5555555-5555-4555-8555-555555555501', 'Splunk Enterprise SOC', 'splunk',
  'https://hec.apex-soc.dev/services/collector', repeat('d', 64), 'cef'
);

INSERT INTO public.tenant_residency_configs (
  tenant_id, primary_region, failover_region, data_residency_locked, isolation_tier, encryption_key_mode
)
VALUES (
  'b5555555-5555-4555-8555-555555555501', 'eu-central-1', 'eu-west-1', true, 'dedicated_schema', 'byok_kms'
);

INSERT INTO public.security_assessments (
  tenant_id, assessment_name, assessor_firm, assessment_type, status, critical_findings, high_findings, remediated_findings
)
VALUES (
  'b5555555-5555-4555-8555-555555555501', 'Q4 2026 Pen Test & RLS Audit', 'TrailSec Partners',
  'penetration_test', 'signed_off', 0, 1, 1
);

-- 3. Test Two-Person Policy Governance DB Constraint (F5-006)
SELECT throws_ok(
  $$
    INSERT INTO public.policy_change_requests (
      tenant_id, proposed_version_code, change_summary, expands_collection_scope,
      status, proposed_by, approved_by_first, approved_by_second
    )
    VALUES (
      'b5555555-5555-4555-8555-555555555501', 'v2.1-2026', 'Enable coarse IDE branch capture', true,
      'approved_activated',
      'a5555555-5555-4555-8555-555555555501',
      'a5555555-5555-4555-8555-555555555501',
      'a5555555-5555-4555-8555-555555555501'
    )
  $$,
  '23514',
  NULL,
  'Single administrator cannot self-approve second signature on policy change (F5-006)'
);

SELECT lives_ok(
  $$
    INSERT INTO public.policy_change_requests (
      tenant_id, proposed_version_code, change_summary, expands_collection_scope,
      status, proposed_by, approved_by_first, approved_by_second
    )
    VALUES (
      'b5555555-5555-4555-8555-555555555501', 'v2.1-2026', 'Enable coarse IDE branch capture', true,
      'approved_activated',
      'a5555555-5555-4555-8555-555555555501',
      'a5555555-5555-4555-8555-555555555501',
      'a5555555-5555-4555-8555-555555555502'
    )
  $$,
  'Two distinct administrators (Owner + Auditor) can approve policy change (F5-006)'
);

-- 4. Test Retention Sweep Respects Active Legal Hold (F5-002)
INSERT INTO public.retention_policies (tenant_id, name, raw_activity_days, is_active)
VALUES ('b5555555-5555-4555-8555-555555555501', 'EU 90d Raw Retention', 90, true);

INSERT INTO public.legal_holds (tenant_id, scope_type, target_id, reason, hold_status, placed_by)
VALUES (
  'b5555555-5555-4555-8555-555555555501', 'tenant', 'b5555555-5555-4555-8555-555555555501',
  'Active billing dispute hold Q4-2026', 'active', 'a5555555-5555-4555-8555-555555555502'
);

SELECT is(
  (SELECT job_status FROM public.execute_tenant_retention_sweep('b5555555-5555-4555-8555-555555555501')),
  'partial_legal_hold',
  'Retention sweep halts purge and marks partial_legal_hold when active legal hold exists (F5-002)'
);

-- 5. Test Developer cannot access enterprise SSO, SIEM, or Security Assessments
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a5555555-5555-4555-8555-555555555503', true);

SELECT is(
  (SELECT count(*)::int FROM public.sso_providers),
  0,
  'Developer sees 0 SSO provider configs'
);

SELECT is(
  (SELECT count(*)::int FROM public.siem_destinations),
  0,
  'Developer sees 0 SIEM destinations'
);

SELECT is(
  (SELECT count(*)::int FROM public.security_assessments),
  0,
  'Developer sees 0 security assessments'
);

SELECT lives_ok(
  $$
    INSERT INTO public.privacy_requests (tenant_id, requester_user_id, request_type)
    VALUES ('b5555555-5555-4555-8555-555555555501', 'a5555555-5555-4555-8555-555555555503', 'export')
  $$,
  'Developer can file own DSAR privacy export request (F5-002)'
);

-- 6. Test Client Reviewer sees 0 legal holds & 0 sensitive access logs
SELECT set_config('request.jwt.claim.sub', 'a5555555-5555-4555-8555-555555555504', true);

SELECT is(
  (SELECT count(*)::int FROM public.legal_holds),
  0,
  'Client reviewer sees 0 legal holds'
);

SELECT is(
  (SELECT count(*)::int FROM public.sensitive_access_logs),
  0,
  'Client reviewer sees 0 sensitive access logs'
);

-- 7. Cross-tenant isolation check: Tenant 2 owner sees 0 Tenant 1 residency configs & assessments
SELECT set_config('request.jwt.claim.sub', 'a5555555-5555-4555-8555-555555555505', true);

SELECT is(
  (SELECT count(*)::int FROM public.tenant_residency_configs WHERE tenant_id = 'b5555555-5555-4555-8555-555555555501'),
  0,
  'Tenant 2 owner sees 0 residency configs from Tenant 1 (F5-003)'
);

SELECT is(
  (SELECT count(*)::int FROM public.sso_providers WHERE tenant_id = 'b5555555-5555-4555-8555-555555555501'),
  0,
  'Tenant 2 owner sees 0 SSO providers from Tenant 1 (F5-001)'
);

SELECT * FROM finish();
ROLLBACK;

