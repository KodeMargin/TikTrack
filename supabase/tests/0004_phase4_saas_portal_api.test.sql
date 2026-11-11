-- =============================================================================
-- pgTAP Test Suite: Phase 4 Commercial SaaS, Client Portal, Public API & Reports
-- Covers F4-001..F4-013, Subscription/Invoice Separation, Client Portal View
-- Security Boundaries, and Role-Based Access Controls.
-- =============================================================================

BEGIN;
SELECT plan(9);

-- 1. Seed Tenant 1, Tenant 2, Owner, Developer, Finance, Client Reviewer
INSERT INTO auth.users (id, email)
VALUES
  ('a4444444-4444-4444-8444-444444444401', 'owner.p4@northstar.dev'),
  ('a4444444-4444-4444-8444-444444444402', 'dev.p4@northstar.dev'),
  ('a4444444-4444-4444-8444-444444444403', 'client.p4@acme.com'),
  ('a4444444-4444-4444-8444-444444444404', 'owner.t2@other.dev')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_profiles (id, email, full_name)
VALUES
  ('a4444444-4444-4444-8444-444444444401', 'owner.p4@northstar.dev', 'Aria Owner'),
  ('a4444444-4444-4444-8444-444444444402', 'dev.p4@northstar.dev', 'Liam Dev'),
  ('a4444444-4444-4444-8444-444444444403', 'client.p4@acme.com', 'Dana Client'),
  ('a4444444-4444-4444-8444-444444444404', 'owner.t2@other.dev', 'Other Tenant Owner')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tenants (id, name, slug, plan_tier)
VALUES
  ('b4444444-4444-4444-8444-444444444401', 'Northstar Agency', 'northstar-p4', 'agency'),
  ('b4444444-4444-4444-8444-444444444402', 'Other Studio', 'other-p4', 'starter');

INSERT INTO public.memberships (id, tenant_id, user_id, status)
VALUES
  ('c4444444-4444-4444-8444-444444444401', 'b4444444-4444-4444-8444-444444444401', 'a4444444-4444-4444-8444-444444444401', 'active'),
  ('c4444444-4444-4444-8444-444444444402', 'b4444444-4444-4444-8444-444444444401', 'a4444444-4444-4444-8444-444444444402', 'active'),
  ('c4444444-4444-4444-8444-444444444403', 'b4444444-4444-4444-8444-444444444401', 'a4444444-4444-4444-8444-444444444403', 'active'),
  ('c4444444-4444-4444-8444-444444444404', 'b4444444-4444-4444-8444-444444444402', 'a4444444-4444-4444-8444-444444444404', 'active');

INSERT INTO public.role_grants (tenant_id, membership_id, role)
VALUES
  ('b4444444-4444-4444-8444-444444444401', 'c4444444-4444-4444-8444-444444444401', 'tenant_owner'),
  ('b4444444-4444-4444-8444-444444444401', 'c4444444-4444-4444-8444-444444444402', 'developer'),
  ('b4444444-4444-4444-8444-444444444401', 'c4444444-4444-4444-8444-444444444403', 'client_reviewer'),
  ('b4444444-4444-4444-8444-444444444402', 'c4444444-4444-4444-8444-444444444404', 'tenant_owner');

-- 2. Seed Subscription Account, SaaS Invoice, API Key, Project, Timesheet (1 approved line, 1 pending line)
INSERT INTO public.subscription_accounts (id, tenant_id, plan_tier, billing_provider, status)
VALUES
  ('d4444444-4444-4444-8444-444444444401', 'b4444444-4444-4444-8444-444444444401', 'agency', 'stripe', 'active'),
  ('d4444444-4444-4444-8444-444444444402', 'b4444444-4444-4444-8444-444444444402', 'starter', 'manual', 'trialing');

INSERT INTO public.saas_subscription_invoices (
  tenant_id, subscription_account_id, invoice_number, billing_period_label,
  plan_tier, seats_billed, unit_price_cents, subtotal_cents, total_cents, status
)
VALUES (
  'b4444444-4444-4444-8444-444444444401',
  'd4444444-4444-4444-8444-444444444401',
  'SAAS-2026-11-001', 'Nov 2026', 'agency', 3, 1800, 20300, 20300, 'paid'
);

INSERT INTO public.api_keys (tenant_id, name, key_prefix, key_hash_sha256, scopes)
VALUES (
  'b4444444-4444-4444-8444-444444444401',
  'BI Sync Key', 'dp_live_p4', repeat('a', 64), ARRAY['projects:read', 'timesheets:read']
);

INSERT INTO public.projects (id, tenant_id, code, name, client_name)
VALUES
  ('e4444444-4444-4444-8444-444444444401', 'b4444444-4444-4444-8444-444444444401', 'ACME', 'Acme Portal', 'Acme Corp'),
  ('e4444444-4444-4444-8444-444444444402', 'b4444444-4444-4444-8444-444444444401', 'INT', 'Internal R&D', 'Internal');

INSERT INTO public.project_members (tenant_id, project_id, user_id, project_role)
VALUES
  ('b4444444-4444-4444-8444-444444444401', 'e4444444-4444-4444-8444-444444444401', 'a4444444-4444-4444-8444-444444444403', 'client_reviewer');

INSERT INTO public.tasks (id, tenant_id, project_id, code, title, status)
VALUES
  ('f4444444-4444-4444-8444-444444444401', 'b4444444-4444-4444-8444-444444444401', 'e4444444-4444-4444-8444-444444444401', 'ACME-1', 'Approved Deliverable', 'done'),
  ('f4444444-4444-4444-8444-444444444402', 'b4444444-4444-4444-8444-444444444401', 'e4444444-4444-4444-8444-444444444402', 'INT-1', 'Internal Unassigned', 'active');

INSERT INTO public.contracts (id, tenant_id, project_id, title)
VALUES
  ('14444444-4444-4444-8444-444444444401', 'b4444444-4444-4444-8444-444444444401', 'e4444444-4444-4444-8444-444444444401', 'Acme MSA');

INSERT INTO public.contract_rate_versions (id, tenant_id, contract_id, version_label, effective_period, hourly_rate)
VALUES
  ('24444444-4444-4444-8444-444444444401', 'b4444444-4444-4444-8444-444444444401', '14444444-4444-4444-8444-444444444401', 'Std', daterange('2026-11-01', NULL, '[]'), 150.00);

INSERT INTO public.timesheets (id, tenant_id, user_id, project_id, contract_id, period_start, period_end, status)
VALUES
  ('34444444-4444-4444-8444-444444444401', 'b4444444-4444-4444-8444-444444444401', 'a4444444-4444-4444-8444-444444444402', 'e4444444-4444-4444-8444-444444444401', '14444444-4444-4444-8444-444444444401', '2026-11-09', '2026-11-15', 'partially_approved');

INSERT INTO public.timesheet_lines (
  id, tenant_id, timesheet_id, task_id, work_date, work_mode, provenance,
  elapsed_minutes, claimed_minutes, approved_billable_minutes,
  applied_rate_version_id, snapshot_hourly_rate, line_status, developer_note
)
VALUES
  ('44444444-4444-4444-8444-444444444401', 'b4444444-4444-4444-8444-444444444401', '34444444-4444-4444-8444-444444444401', 'f4444444-4444-4444-8444-444444444401', '2026-11-11', 'coding', 'desktop_timer', 120, 120, 120, '24444444-4444-4444-8444-444444444401', 150.00, 'approved', 'Internal dev note'),
  ('44444444-4444-4444-8444-444444444402', 'b4444444-4444-4444-8444-444444444401', '34444444-4444-4444-8444-444444444401', 'f4444444-4444-4444-8444-444444444401', '2026-11-11', 'debugging', 'desktop_timer', 60, 60, 0, '24444444-4444-4444-8444-444444444401', 150.00, 'needs_clarification', 'Pending internal clarification');

-- 3. Test nightly usage aggregation RPC
SELECT ok(
  public.aggregate_daily_tenant_usage(current_date) >= 2,
  'aggregate_daily_tenant_usage populates daily metering records'
);

-- 4. Test Client Reviewer sees ONLY 1 approved row in client_portal_project_timesheets_v
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a4444444-4444-4444-8444-444444444403', true);

SELECT is(
  (SELECT count(*)::int FROM public.client_portal_project_timesheets_v),
  1,
  'Client reviewer sees only approved lines on assigned project (F4-005)'
);

SELECT is(
  (SELECT count(*)::int FROM public.saas_subscription_invoices),
  0,
  'Client reviewer sees 0 SaaS platform invoices (F4-003)'
);

SELECT is(
  (SELECT count(*)::int FROM public.api_keys),
  0,
  'Client reviewer sees 0 API keys (F4-006)'
);

SELECT is(
  (SELECT count(*)::int FROM public.usage_records),
  0,
  'Client reviewer sees 0 usage metering records'
);

-- 5. Test Developer cannot access API keys or SaaS invoices, but CAN create own portable report
SELECT set_config('request.jwt.claim.sub', 'a4444444-4444-4444-8444-444444444402', true);

SELECT is(
  (SELECT count(*)::int FROM public.api_keys),
  0,
  'Developer role sees 0 tenant API keys'
);

SELECT is(
  (SELECT count(*)::int FROM public.subscription_accounts),
  0,
  'Developer role sees 0 subscription accounts'
);

SELECT lives_ok(
  $$
    INSERT INTO public.portable_work_reports (
      tenant_id, developer_user_id, report_title, period_start, period_end,
      total_approved_minutes, total_supported_minutes, deliverables_count,
      payload_digest_sha256, signature_hmac_sha256
    )
    VALUES (
      'b4444444-4444-4444-8444-444444444401',
      'a4444444-4444-4444-8444-444444444402',
      'My Portable Work Summary', '2026-11-01', '2026-11-15',
      120, 120, 1, repeat('b', 64), repeat('c', 64)
    )
  $$,
  'Developer can export own signed portable work report (F4-013)'
);

-- 6. Cross-tenant isolation check for Other Tenant Owner
SELECT set_config('request.jwt.claim.sub', 'a4444444-4444-4444-8444-444444444404', true);

SELECT is(
  (SELECT count(*)::int FROM public.saas_subscription_invoices WHERE tenant_id = 'b4444444-4444-4444-8444-444444444401'),
  0,
  'Tenant 2 owner sees 0 SaaS subscription invoices from Tenant 1'
);

SELECT * FROM finish();
ROLLBACK;

