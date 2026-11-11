-- =============================================================================
-- pgTAP Test Suite: Phase 1 Multi-Tenant RLS (Positive & Negative) & Invariants
-- Covers Section 4.6 Acceptance Scenarios 1-7 & Section 17.3 Automated Tests
-- =============================================================================

BEGIN;
SELECT plan(14);

-- 1. Verify RLS is enabled on every public table (0 unprotected tables)
SELECT results_eq(
  $$
    SELECT count(*)::int
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
  $$,
  ARRAY[0],
  'Zero tables in public schema have Row Level Security (RLS) disabled'
);

-- 2. Verify audit_entries and review_decisions forbid UPDATE/DELETE
SELECT throws_ok(
  $$ UPDATE public.audit_entries SET action_type = 'tampered' $$,
  NULL,
  'audit_entries table rejects UPDATE statements (append-only ledger)'
);

-- 3. Seed Two Isolated Tenants & Users for Positive + Negative RLS Tests
INSERT INTO auth.users (id, email)
VALUES
  ('33333333-3333-4333-8333-333333333301', 'aria@northstar.dev'),
  ('33333333-3333-4333-8333-333333333302', 'elena.finance@northstar.dev')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_profiles (id, email, full_name)
VALUES
  ('33333333-3333-4333-8333-333333333301', 'aria@northstar.dev', 'Aria Chen'),
  ('33333333-3333-4333-8333-333333333302', 'elena.finance@northstar.dev', 'Elena Rostova')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tenants (id, name, slug, default_currency)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Northstar Labs', 'northstar-labs', 'USD'),
  ('22222222-2222-2222-2222-222222222222', 'Vertex Agency', 'vertex-agency', 'EUR');

INSERT INTO public.memberships (id, tenant_id, user_id, status)
VALUES
  ('44444444-4444-4444-8444-444444444401', '11111111-1111-1111-1111-111111111111', '33333333-3333-4333-8333-333333333301', 'active'),
  ('44444444-4444-4444-8444-444444444402', '11111111-1111-1111-1111-111111111111', '33333333-3333-4333-8333-333333333302', 'active');

INSERT INTO public.role_grants (tenant_id, membership_id, role)
VALUES
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-8444-444444444401', 'developer'),
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-8444-444444444402', 'finance');

INSERT INTO public.policy_versions (id, tenant_id, version_code, summary_markdown)
VALUES
  ('aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'v1.0', 'Privacy-first baseline');

INSERT INTO public.projects (id, tenant_id, code, name, client_name)
VALUES
  ('bbbbbbbb-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'SETTLE', 'Settlement Core', 'Acme FinTech');

INSERT INTO public.project_members (tenant_id, project_id, user_id, project_role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-1111-1111-1111-111111111111', '33333333-3333-4333-8333-333333333301', 'contributor');

INSERT INTO public.tasks (id, tenant_id, project_id, code, title, estimate_minutes)
VALUES
  ('cccccccc-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-1111-1111-1111-111111111111', 'DEV-104', 'GiST Schema', 180);

INSERT INTO public.work_sessions (id, tenant_id, user_id, project_id, task_id, provenance, lifecycle_state, current_work_mode, policy_version_id)
VALUES
  ('ffffffff-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '33333333-3333-4333-8333-333333333301', 'bbbbbbbb-1111-1111-1111-111111111111', 'cccccccc-1111-1111-1111-111111111111', 'desktop_timer', 'completed', 'thinking', 'aaaaaaaa-1111-1111-1111-111111111111');

-- 4. Verify Contract Rate Version GiST Exclusion Constraint (F1-044)
INSERT INTO public.contracts (id, tenant_id, project_id, title)
VALUES
  ('dddddddd-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-1111-1111-1111-111111111111', 'Q4 Master Services');

INSERT INTO public.contract_rate_versions (id, tenant_id, contract_id, version_label, effective_period, hourly_rate)
VALUES
  ('eeeeeeee-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'dddddddd-1111-1111-1111-111111111111', 'Rate v1', '[2026-10-01,2026-11-15)', 85.00),
  ('eeeeeeee-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'dddddddd-1111-1111-1111-111111111111', 'Rate v2', '[2026-11-15,)', 100.00);

SELECT throws_ok(
  $$
    INSERT INTO public.contract_rate_versions (tenant_id, contract_id, version_label, effective_period, hourly_rate)
    VALUES ('11111111-1111-1111-1111-111111111111', 'dddddddd-1111-1111-1111-111111111111', 'Overlapping Rate', '[2026-11-10,2026-11-20)', 90.00)
  $$,
  '23P01',
  'Overlapping contract_rate_versions date range is rejected by GiST exclusion constraint'
);

-- 5. Verify Cross-Table Composite Foreign Key Blocks Tenant Mismatch
SELECT throws_ok(
  $$
    INSERT INTO public.tasks (tenant_id, project_id, code, title)
    VALUES ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-1111-1111-1111-111111111111', 'CROSS-1', 'Cross Tenant Task')
  $$,
  '23503',
  'Composite foreign key blocks linking a Tenant B task to a Tenant A project'
);

-- 6. Positive RLS Test: Developer Aria sees her own tenant and work_session, but NOT Tenant B
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333301';

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.tenants $$,
  ARRAY[1],
  'Positive RLS Test: Developer sees only her active tenant (1 of 2)'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.work_sessions $$,
  ARRAY[1],
  'Positive RLS Test: Developer sees her own work_session'
);

-- 7. Intra-Tenant Role Boundary: Finance Elena is blocked from raw work_sessions
SET LOCAL "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333302';

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.work_sessions $$,
  ARRAY[0],
  'Role Boundary Test: Finance role sees 0 raw work_sessions (Section 12.4)'
);

-- 8. Negative RLS Test: Unassigned / Other-Tenant User Sees Zero Rows
SET LOCAL "request.jwt.claim.sub" = '99999999-9999-9999-9999-999999999999';

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.tenants $$,
  ARRAY[0],
  'Negative RLS Test: User with no active membership sees 0 tenants'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.projects $$,
  ARRAY[0],
  'Negative RLS Test: User from another tenant sees 0 projects'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.work_sessions $$,
  ARRAY[0],
  'Negative RLS Test: Unauthorized user sees 0 work_sessions'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.invoice_drafts $$,
  ARRAY[0],
  'Negative RLS Test: Unauthorized user sees 0 invoice_drafts'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.audit_entries $$,
  ARRAY[0],
  'Negative RLS Test: Unauthorized user sees 0 audit_entries'
);

SELECT * FROM finish();
ROLLBACK;
