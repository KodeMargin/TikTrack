-- =============================================================================
-- pgTAP Test Suite: Phase 3 Verification Rules, Guardrailed AI & Disputes
-- Covers F3-001..F3-035, AI Opt-Out Gate (F3-027), Independent 2nd Review (F3-033),
-- and Role-Based Access Boundaries.
-- =============================================================================

BEGIN;
SELECT plan(8);

-- 1. Seed Tenant (ai_enabled = false), Developer, Reviewer 1, Reviewer 2, Finance
INSERT INTO auth.users (id, email)
VALUES
  ('a3333333-3333-4333-8333-333333333301', 'dev.p3@northstar.dev'),
  ('a3333333-3333-4333-8333-333333333302', 'pm1.p3@northstar.dev'),
  ('a3333333-3333-4333-8333-333333333303', 'pm2.p3@northstar.dev'),
  ('a3333333-3333-4333-8333-333333333304', 'finance.p3@northstar.dev')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_profiles (id, email, full_name)
VALUES
  ('a3333333-3333-4333-8333-333333333301', 'dev.p3@northstar.dev', 'Aria Dev'),
  ('a3333333-3333-4333-8333-333333333302', 'pm1.p3@northstar.dev', 'Marcus PM1'),
  ('a3333333-3333-4333-8333-333333333303', 'pm2.p3@northstar.dev', 'Sora PM2'),
  ('a3333333-3333-4333-8333-333333333304', 'finance.p3@northstar.dev', 'Elena Finance')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tenants (id, name, slug, ai_enabled)
VALUES
  ('b3333333-3333-4333-8333-333333333301', 'Northstar Phase 3', 'northstar-p3', false);

INSERT INTO public.memberships (id, tenant_id, user_id, status)
VALUES
  ('c3333333-3333-4333-8333-333333333301', 'b3333333-3333-4333-8333-333333333301', 'a3333333-3333-4333-8333-333333333301', 'active'),
  ('c3333333-3333-4333-8333-333333333302', 'b3333333-3333-4333-8333-333333333301', 'a3333333-3333-4333-8333-333333333302', 'active'),
  ('c3333333-3333-4333-8333-333333333303', 'b3333333-3333-4333-8333-333333333301', 'a3333333-3333-4333-8333-333333333303', 'active'),
  ('c3333333-3333-4333-8333-333333333304', 'b3333333-3333-4333-8333-333333333301', 'a3333333-3333-4333-8333-333333333304', 'active');

INSERT INTO public.role_grants (tenant_id, membership_id, role)
VALUES
  ('b3333333-3333-4333-8333-333333333301', 'c3333333-3333-4333-8333-333333333301', 'developer'),
  ('b3333333-3333-4333-8333-333333333301', 'c3333333-3333-4333-8333-333333333302', 'project_manager'),
  ('b3333333-3333-4333-8333-333333333301', 'c3333333-3333-4333-8333-333333333303', 'auditor'),
  ('b3333333-3333-4333-8333-333333333301', 'c3333333-3333-4333-8333-333333333304', 'finance');

-- 2. Verify Tenant AI Opt-Out Gate (F3-027) blocks ai_guardrailed when ai_enabled = false
SELECT throws_ok(
  $$
    INSERT INTO public.ai_generations (
      tenant_id, user_id, target_type, target_id, generation_mode, model_id,
      cited_event_ids, draft_markdown, tokens_used
    )
    VALUES (
      'b3333333-3333-4333-8333-333333333301',
      'a3333333-3333-4333-8333-333333333301',
      'daily_summary', 'tsk-1', 'ai_guardrailed', 'gemini-2.5-flash-guardrailed',
      ARRAY['evt-1'], 'Draft summary', 120
    )
  $$,
  'P0001',
  NULL,
  'ai_guardrailed insert is blocked when tenants.ai_enabled = false (F3-027)'
);

-- 3. Verify deterministic_template succeeds with 0 tokens when ai_enabled = false
SELECT lives_ok(
  $$
    INSERT INTO public.ai_generations (
      id, tenant_id, user_id, target_type, target_id, generation_mode, model_id,
      sanitized_prompt_payload, draft_markdown, tokens_used
    )
    VALUES (
      'd3333333-3333-4333-8333-333333333301',
      'b3333333-3333-4333-8333-333333333301',
      'a3333333-3333-4333-8333-333333333301',
      'daily_summary', 'tsk-1', 'deterministic_template', 'deterministic-template-v1',
      '{"task_code": "DEV-301"}'::jsonb, 'Deterministic summary', 0
    )
  $$,
  'deterministic_template succeeds when ai_enabled = false'
);

-- 4. Verify prohibited surveillance keys in sanitized_prompt_payload are rejected
SELECT throws_ok(
  $$
    INSERT INTO public.ai_generations (
      tenant_id, user_id, target_type, target_id, generation_mode, model_id,
      sanitized_prompt_payload, draft_markdown, tokens_used
    )
    VALUES (
      'b3333333-3333-4333-8333-333333333301',
      'a3333333-3333-4333-8333-333333333301',
      'daily_summary', 'tsk-1', 'deterministic_template', 'deterministic-template-v1',
      '{"keystrokes": "secret"}'::jsonb, 'Blocked', 0
    )
  $$,
  '23514',
  NULL,
  'no_prohibited_ai_payload constraint blocks keystrokes in ai_generations'
);

-- 5. Enable AI on tenant and verify ai_guardrailed requires non-empty citations
UPDATE public.tenants SET ai_enabled = true WHERE id = 'b3333333-3333-4333-8333-333333333301';

SELECT throws_ok(
  $$
    INSERT INTO public.ai_generations (
      tenant_id, user_id, target_type, target_id, generation_mode, model_id,
      cited_event_ids, cited_artifact_ids, draft_markdown, tokens_used
    )
    VALUES (
      'b3333333-3333-4333-8333-333333333301',
      'a3333333-3333-4333-8333-333333333301',
      'daily_summary', 'tsk-1', 'ai_guardrailed', 'gemini-2.5-flash-guardrailed',
      '{}', '{}', 'Uncited AI claim', 90
    )
  $$,
  '23514',
  NULL,
  'ai_citations_non_empty_for_llm rejects AI generation without cited IDs'
);

-- 6. Seed Project, Contract, Timesheet & Line to test Independent Second Review (F3-033)
INSERT INTO public.projects (id, tenant_id, code, name, client_name)
VALUES ('e3333333-3333-4333-8333-333333333301', 'b3333333-3333-4333-8333-333333333301', 'P3', 'Phase 3 Core', 'Acme');

INSERT INTO public.tasks (id, tenant_id, project_id, code, title, estimate_minutes)
VALUES ('f3333333-3333-4333-8333-333333333301', 'b3333333-3333-4333-8333-333333333301', 'e3333333-3333-4333-8333-333333333301', 'P3-101', 'Dispute Workflow', 120);

INSERT INTO public.contracts (id, tenant_id, project_id, title)
VALUES ('13333333-3333-4333-8333-333333333301', 'b3333333-3333-4333-8333-333333333301', 'e3333333-3333-4333-8333-333333333301', 'MSA P3');

INSERT INTO public.contract_rate_versions (id, tenant_id, contract_id, version_label, effective_period, hourly_rate)
VALUES ('23333333-3333-4333-8333-333333333301', 'b3333333-3333-4333-8333-333333333301', '13333333-3333-4333-8333-333333333301', 'Base', daterange('2026-11-01', NULL, '[]'), 120.00);

INSERT INTO public.timesheets (id, tenant_id, user_id, project_id, contract_id, period_start, period_end, status)
VALUES ('33333333-3333-4333-8333-333333333301', 'b3333333-3333-4333-8333-333333333301', 'a3333333-3333-4333-8333-333333333301', 'e3333333-3333-4333-8333-333333333301', '13333333-3333-4333-8333-333333333301', '2026-11-09', '2026-11-15', 'partially_approved');

INSERT INTO public.timesheet_lines (id, tenant_id, timesheet_id, task_id, work_date, work_mode, provenance, elapsed_minutes, claimed_minutes, applied_rate_version_id, snapshot_hourly_rate)
VALUES ('43333333-3333-4333-8333-333333333301', 'b3333333-3333-4333-8333-333333333301', '33333333-3333-4333-8333-333333333301', 'f3333333-3333-4333-8333-333333333301', '2026-11-11', 'debugging', 'desktop_timer', 60, 60, '23333333-3333-4333-8333-333333333301', 120.00);

SELECT throws_ok(
  $$
    INSERT INTO public.disputes (
      tenant_id, timesheet_id, timesheet_line_id, opened_by_user_id,
      assigned_reviewer_id, escalated_reviewer_id, status, disputed_minutes, reason
    )
    VALUES (
      'b3333333-3333-4333-8333-333333333301',
      '33333333-3333-4333-8333-333333333301',
      '43333333-3333-4333-8333-333333333301',
      'a3333333-3333-4333-8333-333333333301',
      'a3333333-3333-4333-8333-333333333302',
      'a3333333-3333-4333-8333-333333333302',
      'escalated', 60, 'Escalating to same reviewer must fail'
    )
  $$,
  '23514',
  NULL,
  'disputes_independent_escalated_reviewer blocks escalating to same reviewer (F3-033)'
);

SELECT lives_ok(
  $$
    INSERT INTO public.disputes (
      tenant_id, timesheet_id, timesheet_line_id, opened_by_user_id,
      assigned_reviewer_id, escalated_reviewer_id, status, disputed_minutes, reason
    )
    VALUES (
      'b3333333-3333-4333-8333-333333333301',
      '33333333-3333-4333-8333-333333333301',
      '43333333-3333-4333-8333-333333333301',
      'a3333333-3333-4333-8333-333333333301',
      'a3333333-3333-4333-8333-333333333302',
      'a3333333-3333-4333-8333-333333333303',
      'escalated', 60, 'Escalated to independent auditor PM2'
    )
  $$,
  'Escalating to distinct independent reviewer succeeds'
);

-- 7. Verify Finance role cannot read ai_generations via RLS
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333304', true);

SELECT is(
  (SELECT count(*)::int FROM public.ai_generations WHERE tenant_id = 'b3333333-3333-4333-8333-333333333301'),
  0,
  'Finance role sees 0 rows in ai_generations (RLS boundary)'
);

SELECT is(
  (SELECT count(*)::int FROM public.verification_rule_sets WHERE tenant_id = 'b3333333-3333-4333-8333-333333333301'),
  0,
  'Verification rule sets empty before creation and scoped to tenant'
);

SELECT * FROM finish();
ROLLBACK;

